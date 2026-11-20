// Practice mode (SPEC_V2 §7): pure helpers, no DOM, no engine/solver/grade imports.
// Everything that needs the engine (pile pool, grading) is injected, so this file
// is unit-tested with fakes (tests/practiceLogic.test.js).
import { OPP_CARDS } from './oppCards.js';
import { fallbackPilePool, poolSummary, countNames } from './uiLogic.js';

export const STATS_KEY = 'ddpp.practice.v2';
export const MAX_ORDERS = 120;
const EPS = 1e-9;

// ---------- seeded RNG (UI only; the engine never uses randomness) ----------

/** mulberry32: seed (any integer) → () => float in [0, 1). Deterministic. */
export function makeRng(seed) {
  let a = (Number(seed) >>> 0) || 0x9e3779b9;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- loading ----------

/**
 * Parse scenario file text. Structural checks only (the full check is
 * scenario.js validateScenarioFile, injected by the caller when available).
 * @returns {{ scenarios: object[], errors: string[] }}
 */
export function parseScenarioFile(text, validateFile = null) {
  let f;
  try {
    f = JSON.parse(text);
  } catch (e) {
    return { scenarios: [], errors: [`Not valid JSON: ${e.message}`] };
  }
  return checkScenarioFile(f, validateFile);
}

/** Same as parseScenarioFile for an already-parsed object. Invalid scenarios are dropped and reported. */
export function checkScenarioFile(f, validateFile = null) {
  const errors = [];
  if (!f || typeof f !== 'object' || Array.isArray(f)) return { scenarios: [], errors: ['The file must be an object { version: 2, scenarios: [...] }.'] };
  if (f.version !== 2) errors.push(`Expected version 2, got ${JSON.stringify(f.version)}.`);
  if (!Array.isArray(f.scenarios)) return { scenarios: [], errors: [...errors, '"scenarios" must be an array.'] };
  const bad = new Set();
  const seen = new Set();
  f.scenarios.forEach((s, i) => {
    const id = s && typeof s.id === 'string' && s.id ? s.id : null;
    const where = id ?? `#${i + 1}`;
    if (!s || typeof s !== 'object') { errors.push(`Scenario ${where}: not an object.`); bad.add(i); return; }
    if (!id) { errors.push(`Scenario ${where}: missing id.`); bad.add(i); }
    else if (seen.has(id)) { errors.push(`Scenario ${id}: duplicate id.`); bad.add(i); }
    else seen.add(id);
    if (!s.setup || typeof s.setup !== 'object') { errors.push(`Scenario ${where}: missing setup.`); bad.add(i); }
    if (!s.actual || !Array.isArray(s.actual.pile)) { errors.push(`Scenario ${where}: missing actual.pile.`); bad.add(i); }
  });
  if (typeof validateFile === 'function') {
    let more = [];
    try { more = validateFile(f) ?? []; } catch (e) { more = [`Validation failed: ${e.message}`]; }
    for (const m of more) {
      if (errors.includes(m)) continue;
      errors.push(m);
      // validateScenarioFile prefixes errors with the id: drop that scenario.
      f.scenarios.forEach((s, i) => { if (s?.id && String(m).includes(s.id)) bad.add(i); });
    }
  }
  return { scenarios: f.scenarios.filter((_, i) => !bad.has(i)), errors };
}

// ---------- filters and dealing ----------

const uniqSorted = (xs) => [...new Set(xs.filter((x) => typeof x === 'string' && x))].sort((a, b) => a.localeCompare(b));

/** Filter option lists from the scenarios' sources. */
export function filterOptions(scenarios) {
  return {
    decks: uniqSorted(scenarios.map((s) => s.source?.deck)),
    oppDecks: uniqSorted(scenarios.map((s) => s.source?.oppDeck)),
    players: uniqSorted(scenarios.map((s) => s.source?.player)),
  };
}

/** filter = { deck, oppDeck, player }: '' or missing = any. */
export function filterScenarios(scenarios, filter = {}) {
  return scenarios.filter((s) =>
    (!filter.deck || s.source?.deck === filter.deck)
    && (!filter.oppDeck || s.source?.oppDeck === filter.oppDeck)
    && (!filter.player || s.source?.player === filter.player));
}

/**
 * Pick a scenario with the seeded rng. Skips mastered boards unless repeatAll,
 * and avoids repeating `lastId` when there is another choice.
 * @returns {{ scenario: object|null, allMastered: boolean, candidates: number }}
 */
export function dealScenario(scenarios, stats, { rng = Math.random, repeatAll = false, lastId = null } = {}) {
  if (!scenarios.length) return { scenario: null, allMastered: false, candidates: 0 };
  let pool = repeatAll ? scenarios : scenarios.filter((s) => !isMastered(stats, s.id));
  const allMastered = !repeatAll && pool.length === 0;
  if (allMastered) pool = scenarios;
  if (pool.length > 1 && lastId !== null) {
    const others = pool.filter((s) => s.id !== lastId);
    if (others.length) pool = others;
  }
  const i = Math.min(pool.length - 1, Math.floor(rng() * pool.length));
  return { scenario: pool[i], allMastered, candidates: pool.length };
}

// ---------- stats (localStorage-shaped plain object) ----------

export function emptyStats() {
  return { version: 1, attempts: 0, goldfishWins: 0, pWinSum: 0, pWinCount: 0, byId: {} };
}

const finite = (x) => typeof x === 'number' && Number.isFinite(x);

/** Sanitise anything read from storage into a stats object. */
export function normalizeStats(raw) {
  const s = emptyStats();
  if (!raw || typeof raw !== 'object') return s;
  for (const k of ['attempts', 'goldfishWins', 'pWinSum', 'pWinCount']) if (finite(raw[k]) && raw[k] >= 0) s[k] = raw[k];
  if (raw.byId && typeof raw.byId === 'object' && !Array.isArray(raw.byId)) {
    for (const [id, e] of Object.entries(raw.byId)) {
      if (!e || typeof e !== 'object') continue;
      s.byId[id] = {
        attempts: finite(e.attempts) ? e.attempts : 0,
        goldfishWins: finite(e.goldfishWins) ? e.goldfishWins : 0,
        best: finite(e.best) ? e.best : null,
        mastered: !!e.mastered,
      };
    }
  }
  return s;
}

/** Read stats from a Storage-like object; never throws. */
export function loadStats(storage, key = STATS_KEY) {
  try {
    const text = storage?.getItem(key);
    return text ? normalizeStats(JSON.parse(text)) : emptyStats();
  } catch {
    return emptyStats();
  }
}

/** Write stats; returns false (never throws) when storage is unavailable or full. */
export function saveStats(storage, stats, key = STATS_KEY) {
  try {
    if (!storage) return false;
    storage.setItem(key, JSON.stringify(stats));
    return true;
  } catch {
    return false;
  }
}

/** The single est. P(win) number used for stats: pWin, else the low end of the range (conservative). */
export function scoreOf(g) {
  if (!g) return null;
  if (finite(g.pWin)) return g.pWin;
  if (Array.isArray(g.pWinRange) && finite(g.pWinRange[0])) return g.pWinRange[0];
  return null;
}

export const goldfishWon = (g) => g?.goldfish?.result === 'win';

/**
 * "Solved correctly" = my pile wins the goldfish AND its est. P(win) is at least
 * the best order of the pile really played (when that grade is known).
 */
export function judgeAttempt(mine, actualBest = null) {
  if (!goldfishWon(mine)) return false;
  const a = scoreOf(actualBest);
  if (a === null) return true;
  const m = scoreOf(mine);
  return m !== null && m + EPS >= a;
}

/** Record an attempt (returns a new stats object). */
export function recordAttempt(stats, id, mine) {
  const s = normalizeStats(stats);
  const p = scoreOf(mine);
  const won = goldfishWon(mine);
  s.attempts += 1;
  if (won) s.goldfishWins += 1;
  if (p !== null) { s.pWinSum += p; s.pWinCount += 1; }
  const e = s.byId[id] ?? { attempts: 0, goldfishWins: 0, best: null, mastered: false };
  e.attempts += 1;
  if (won) e.goldfishWins += 1;
  const score = won ? (p ?? 0) : 0;
  e.best = e.best === null ? score : Math.max(e.best, score);
  if (judgeAttempt(mine)) e.mastered = true;
  s.byId[id] = e;
  return s;
}

/** After the actual pile is graded: a goldfish win that falls short of it is no longer "mastered". */
export function applyActualComparison(stats, id, mine, actualBest) {
  const s = normalizeStats(stats);
  const e = s.byId[id];
  if (!e) return s;
  // Mastery is sticky across attempts: only this attempt's provisional mark can be undone,
  // and only when no earlier attempt beat the real pile.
  const ok = judgeAttempt(mine, actualBest);
  const a = scoreOf(actualBest);
  const earlierOk = a !== null && e.best !== null && e.best + EPS >= a && e.goldfishWins > 0;
  e.mastered = ok || earlierOk;
  return s;
}

export function isMastered(stats, id) {
  return !!stats?.byId?.[id]?.mastered;
}

/** Stats panel view model. */
export function statsSummary(stats, scenarios = []) {
  const s = normalizeStats(stats);
  const ids = new Set(scenarios.map((x) => x.id));
  const rows = Object.entries(s.byId)
    .filter(([id]) => !ids.size || ids.has(id))
    .map(([id, e]) => ({ id, ...e }))
    .sort((a, b) => a.id.localeCompare(b.id));
  return {
    attempts: s.attempts,
    goldfishWins: s.goldfishWins,
    goldfishRate: s.attempts ? s.goldfishWins / s.attempts : null,
    avgPWin: s.pWinCount ? s.pWinSum / s.pWinCount : null,
    pWinCount: s.pWinCount,
    boardsTried: rows.length,
    mastered: rows.filter((r) => r.mastered).length,
    total: scenarios.length,
    rows,
  };
}

// ---------- formatting ----------

/** 0.4567 → "46%"; null → "?". Values strictly between 0 and 1 never round to 0% / 100%. */
export function formatPct(x) {
  if (!finite(x)) return '?';
  if (x <= 0) return '0%';
  if (x >= 1) return '100%';
  const r = Math.round(x * 100);
  if (r === 0) return '<1%';
  if (r === 100) return '>99%';
  return `${r}%`;
}

/** "est. 46%" or "est. 30–70%" (a range when sub-solves were unknown). */
export function formatEst(g) {
  if (!g) return 'est. ?';
  if (finite(g.pWin)) return `est. ${formatPct(g.pWin)}`;
  const [lo, hi] = Array.isArray(g.pWinRange) ? g.pWinRange : [null, null];
  if (finite(lo) && finite(hi)) return lo === hi ? `est. ${formatPct(lo)}` : `est. ${formatPct(lo)}–${formatPct(hi)}`;
  return 'est. ?';
}

// ---------- board view ----------

/** Printed or scenario attack power: number, '*' or null (not a creature). */
export function attackPower(p) {
  if (Number.isInteger(p?.power)) return p.power;
  const def = OPP_CARDS[p?.name];
  if (!def || !(def.types ?? []).includes('creature')) return null;
  if (def.power === '*') return '*';
  const n = Number(def.power);
  return Number.isFinite(n) ? n : null;
}

function permLabel(p) {
  const bits = [];
  if (Number.isInteger(p.x)) bits.push(`X=${p.x}`);
  if (p.named) bits.push(`naming ${p.named}`);
  if (Number.isInteger(p.counters)) bits.push(`${p.counters} counter${p.counters === 1 ? '' : 's'}`);
  if (p.tapped) bits.push('tapped');
  return bits.join(', ');
}

const lifeAfter = (life) => (Number.isInteger(life) && life >= 1 ? life - Math.ceil(life / 2) : null);

function manaText(pool) {
  const parts = Object.entries(pool ?? {}).filter(([, n]) => Number.isInteger(n) && n > 0).map(([c, n]) => `${c}×${n}`);
  return parts.length ? parts.join(' ') : 'none';
}

/**
 * Board view model for a scenario.
 * @param {object} scenario
 * @param {(setup) => object} [availablePile]  engine.availablePile; the uiLogic fallback is used otherwise.
 */
export function boardView(scenario, availablePile = null) {
  const setup = scenario.setup ?? {};
  const src = scenario.source ?? {};
  const opp = setup.opponent ?? {};
  let pool = null;
  let poolError = null;
  try {
    pool = (availablePile ?? fallbackPilePool)(setup);
  } catch (e) {
    poolError = e.message;
    try { pool = fallbackPilePool(setup); } catch { pool = {}; }
  }
  const clean = {};
  for (const [k, n] of Object.entries(pool ?? {})) if (n > 0) clean[k] = n;

  let clock = 0;
  let clockUnknown = false;
  const permanents = (opp.permanents ?? []).map((p) => {
    const power = attackPower(p);
    if (Number.isInteger(power)) clock += power;
    else if (power === '*') clockUnknown = true;
    return { name: p.name, power, toughness: Number.isInteger(p.toughness) ? p.toughness : null, detail: permLabel(p) };
  });
  const lands = opp.lands ?? { untapped: 0, total: 0, colors: '' };
  const handCounts = countNames(setup.hand ?? []);
  return {
    id: scenario.id,
    isSample: /sample/i.test(String(scenario.id)) || /sample/i.test(String(src.player ?? '')),
    title: `${src.deck ?? 'My deck'} vs ${src.oppDeck ?? 'unknown deck'}`,
    meta: [
      src.onPlay === true ? 'On the play' : src.onPlay === false ? 'On the draw' : null,
      Number.isInteger(src.gameNumber) ? `Game ${src.gameNumber}` : null,
      src.player ? `Player: ${src.player}` : null,
      src.date ?? null,
    ].filter(Boolean),
    turnsAhead: Number.isInteger(setup.turnsAhead) ? setup.turnsAhead : 1,
    me: {
      hand: Object.entries(handCounts).map(([name, n]) => ({ name, n })),
      battlefield: (setup.battlefield ?? []).map((p) => (typeof p === 'string' ? { name: p, tapped: false } : { name: p.name, tapped: !!p.tapped })),
      graveyard: [...(setup.graveyard ?? [])],
      exile: [...(setup.exile ?? [])],
      mana: manaText(setup.manaPool),
      lifeBefore: setup.lifeBeforeDoomsday ?? 20,
      lifeAfter: lifeAfter(setup.lifeBeforeDoomsday ?? 20),
      landPlayed: !!setup.landPlayedThisTurn,
      spellsCast: setup.spellsCastThisTurn ?? setup.noncreatureSpellsCastThisTurn ?? 1,
    },
    opp: {
      permanents,
      clock,
      clockUnknown,
      graveyard: [...(opp.graveyard ?? [])],
      exile: [...(opp.exile ?? [])],
      handSize: Number.isInteger(opp.handSize) ? opp.handSize : (opp.hand ?? []).length,
      life: opp.life ?? 20,
      lands: `${lands.untapped ?? 0}/${lands.total ?? 0} untapped${lands.colors ? ` (${lands.colors})` : ''}`,
      source: opp.deckEstimateSource ?? null,
    },
    warnings: [...(scenario.warnings ?? [])],
    pool: clean,
    poolList: poolSummary(clean, []),
    poolError,
  };
}

// ---------- best order of the actual pile ----------

/** Distinct orders of a multiset of names (lexicographic), at most `max`. */
export function distinctOrders(names, max = MAX_ORDERS) {
  const items = [...names].sort();
  const out = [];
  const used = new Array(items.length).fill(false);
  const cur = [];
  const rec = () => {
    if (out.length >= max) return;
    if (cur.length === items.length) { out.push([...cur]); return; }
    for (let i = 0; i < items.length; i++) {
      if (used[i] || (i > 0 && items[i] === items[i - 1] && !used[i - 1])) continue;
      used[i] = true; cur.push(items[i]);
      rec();
      cur.pop(); used[i] = false;
    }
  };
  rec();
  return out;
}

/** Ranking key for grades: goldfish win, then est. P(win) low, then high. Higher is better. */
export function compareGrades(a, b) {
  const ga = goldfishWon(a) ? 1 : 0;
  const gb = goldfishWon(b) ? 1 : 0;
  if (ga !== gb) return ga - gb;
  const la = a?.pWinRange?.[0] ?? scoreOf(a) ?? -1;
  const lb = b?.pWinRange?.[0] ?? scoreOf(b) ?? -1;
  if (Math.abs(la - lb) > EPS) return la - lb;
  const ha = a?.pWinRange?.[1] ?? la;
  const hb = b?.pWinRange?.[1] ?? lb;
  if (Math.abs(ha - hb) > EPS) return ha - hb;
  return 0;
}

/**
 * Grade the actual pile: as given if `ordered`, else every distinct order (≤ 120)
 * and keep the best. `goldfish(order)` (optional, cheap) screens orders: only
 * goldfish winners get the full `grade(order)`. Stops early at est. P(win) = 100%.
 * Ties keep the first order found (lexicographic).
 * @returns {{ best: {order, grade}|null, tried, graded, total, ordered, errors: string[] }}
 */
export function bestOrderOfPile(pile, { grade, goldfish = null, ordered = false, onProgress = null, max = MAX_ORDERS } = {}) {
  const orders = ordered ? [[...pile]] : distinctOrders(pile, max);
  let best = null;
  let tried = 0;
  let graded = 0;
  let firstGoldfish = null;
  const errors = [];
  for (const order of orders) {
    tried += 1;
    try {
      if (goldfish && !ordered) {
        const g = goldfish(order);
        if (g?.result !== 'win') {
          firstGoldfish ??= { order, goldfish: g };
          onProgress?.({ done: tried, total: orders.length });
          continue;
        }
      }
      const r = grade(order);
      graded += 1;
      if (!best || compareGrades(r, best.grade) > 0) best = { order, grade: r };
    } catch (e) {
      errors.push(`${order.join(', ')}: ${e.message}`);
    }
    onProgress?.({ done: tried, total: orders.length });
    if (best && goldfishWon(best.grade) && (best.grade.pWinRange?.[0] ?? scoreOf(best.grade)) >= 1 - EPS) break;
  }
  // No order wins the goldfish: report the first order with its goldfish result (no interaction grade).
  if (!best && firstGoldfish) {
    best = { order: firstGoldfish.order, grade: { goldfish: firstGoldfish.goldfish, pWin: 0, pWinRange: [0, 0], singles: [], pairs: [], goldfishOnly: true } };
  }
  return { best, tried, graded, total: orders.length, ordered, errors };
}

// ---------- reveal ----------

const GOLDFISH_LABEL = { win: 'WIN', no_win: 'NO WIN', aborted: 'TOO BIG' };

/** One grade() result → view model (labels "est." on every probability). */
export function gradeView(g) {
  if (!g) return null;
  const gf = g.goldfish?.result ?? 'error';
  const singles = (g.singles ?? []).map((s) => ({
    card: s.card,
    k: s.k ?? null,
    pHold: finite(s.pHold) ? s.pHold : null,
    wins: s.wins,
    text: `${s.wins === true ? 'beats' : s.wins === false ? 'loses to' : 'unknown vs'} ${s.card}`
      + (finite(s.pHold) ? ` (est. ${formatPct(s.pHold)} they hold one${Number.isInteger(s.k) ? `; ${s.k} unseen` : ''})` : ''),
  }));
  // Losers first (most likely first), then unknowns, then the cards it beats.
  const rank = (s) => (s.wins === false ? 0 : s.wins === null || s.wins === undefined ? 1 : 2);
  singles.sort((a, b) => rank(a) - rank(b) || (b.pHold ?? 0) - (a.pHold ?? 0) || a.card.localeCompare(b.card));
  const pairs = (g.pairs ?? []).map((p) => ({ cards: p.cards, wins: p.wins, text: (p.cards ?? []).join(' + ') }));
  return {
    goldfish: gf,
    goldfishLabel: GOLDFISH_LABEL[gf] ?? 'ERROR',
    goldfishWin: gf === 'win',
    est: formatEst(g),
    pWin: scoreOf(g),
    isRange: !finite(g.pWin) && Array.isArray(g.pWinRange) && g.pWinRange[0] !== g.pWinRange[1],
    goldfishOnly: !!g.goldfishOnly,
    singles,
    losingSingles: singles.filter((s) => s.wins === false),
    losingPairs: pairs.filter((p) => p.wins === false),
    unknownPairs: pairs.filter((p) => p.wins !== true && p.wins !== false),
    pairsTested: pairs.length,
    notModelled: [...(g.notModelled ?? [])],
    offColor: [...(g.offColor ?? [])],
    assumptions: [...(g.assumptions ?? [])],
    source: g.source ?? null,
    N: g.N ?? null,
    h: g.h ?? null,
  };
}

const WIN_BY = {
  normal: '', concession: 'by concession', opponent_left: 'opponent left',
};

/**
 * Reveal view model.
 * @param {object} scenario
 * @param {{ pile: string[], grade: object, lines?: string[] }} mine
 * @param {{ best: {order, grade}|null, tried, graded, total, ordered, lines?: string[] }|null} actualRes
 */
export function revealView(scenario, mine, actualRes = null) {
  const actual = scenario.actual ?? {};
  const a = gradeView(actualRes?.best?.grade ?? null);
  const m = gradeView(mine.grade);
  const sameCards = JSON.stringify([...mine.pile].sort()) === JSON.stringify([...(actual.pile ?? [])].sort());
  let verdict = null;
  if (a && m) {
    const c = compareGrades(mine.grade, actualRes.best.grade);
    verdict = c > 0 ? 'better' : c < 0 ? 'worse' : 'equal';
  }
  const winBy = actual.winBy && WIN_BY[actual.winBy] !== '' ? (WIN_BY[actual.winBy] ?? String(actual.winBy).replace(/_/g, ' ')) : '';
  return {
    mine: { pile: [...mine.pile], lines: mine.lines ?? [], ...m },
    actual: {
      pile: [...(actual.pile ?? [])],
      ordered: !!actual.pileOrdered,
      result: actual.result === 'win' ? 'Won' : actual.result === 'loss' ? 'Lost' : '?',
      resultText: [
        actual.result === 'win' ? 'Won' : actual.result === 'loss' ? 'Lost' : 'Unknown result',
        winBy,
        Number.isInteger(actual.turnsAfterDoomsday) ? `${actual.turnsAfterDoomsday} turn${actual.turnsAfterDoomsday === 1 ? '' : 's'} after Doomsday` : '',
      ].filter(Boolean).join(', '),
      sameCards,
      graded: !!a,
      bestOrder: actualRes?.best?.order ?? null,
      orderNote: actualRes ? (actualRes.ordered
        ? 'Graded in the logged order.'
        : `Order not logged: best of ${actualRes.tried} of ${actualRes.total} distinct orders (${actualRes.graded} fully graded).`) : '',
      lines: actualRes?.lines ?? [],
      errors: actualRes?.errors ?? [],
      ...(a ?? {}),
    },
    verdict,
    source: m?.source ?? scenario.setup?.opponent?.deckEstimateSource ?? null,
  };
}
