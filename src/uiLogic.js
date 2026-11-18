// Pure helpers for the UI: no DOM, no engine/solver imports. Unit-tested.
import { parseDeck, deckToText } from './deckText.js';

export const OPPONENT_PIECES = [
  'Deafening Silence',
  'Thalia, Guardian of Thraben',
  'Gaddock Teeg',
  'Chalice of the Void',
  'Disruptor Flute',
];

export const COLORS = ['W', 'U', 'B', 'R', 'G', 'C'];

/** Default form model (mirrors the §3 defaults). */
export function defaultModel(deckText = '') {
  return {
    deckText,
    hand: [],
    battlefield: [],
    graveyard: [],
    exile: [],
    manaPool: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 },
    lifeBeforeDoomsday: 20,
    landPlayedThisTurn: false,
    noncreatureSpellsCastThisTurn: 1,
    cavernType: 'Merfolk',
    opponent: {
      'Deafening Silence': false,
      'Thalia, Guardian of Thraben': false,
      'Gaddock Teeg': false,
      'Chalice of the Void': false,
      chaliceX: 1,
      'Disruptor Flute': false,
      fluteNamed: '',
    },
    turnsAhead: 1,
    pile: [],
  };
}

// ---------- multiset helpers ----------

/** ["A","B","A"] → {A:2, B:1} (insertion order of first appearance). */
export function countNames(list) {
  const out = {};
  for (const n of list) out[n] = (out[n] ?? 0) + 1;
  return out;
}

/** Add one copy of name to a name list (returns a new array). */
export function addName(list, name) {
  return [...list, name];
}

/** Remove one copy of name (the last one) from a name list (returns a new array). */
export function removeName(list, name) {
  const i = list.lastIndexOf(name);
  if (i < 0) return list.slice();
  return [...list.slice(0, i), ...list.slice(i + 1)];
}

const normName = (s) => String(s ?? '').trim().replace(/\s+/g, ' ').toLowerCase();

function toInt(value) {
  if (typeof value === 'number') return value;
  const s = String(value ?? '').trim();
  return /^-?\d+$/.test(s) ? Number(s) : NaN;
}

// ---------- form model → setup ----------

/** Opponent checkbox model → setup.opponent.permanents. */
export function opponentPermanents(opp) {
  const out = [];
  for (const name of OPPONENT_PIECES) {
    if (!opp?.[name]) continue;
    if (name === 'Chalice of the Void') out.push({ name, x: toInt(opp.chaliceX) });
    else if (name === 'Disruptor Flute') out.push({ name, named: String(opp.fluteNamed ?? '').trim() });
    else out.push({ name });
  }
  return out;
}

/** setup.opponent.permanents → opponent checkbox model (unknown names reported). */
export function opponentModel(permanents = []) {
  const opp = defaultModel().opponent;
  const unknown = [];
  for (const p of permanents) {
    if (!OPPONENT_PIECES.includes(p?.name)) {
      unknown.push(String(p?.name));
      continue;
    }
    opp[p.name] = true;
    if (p.name === 'Chalice of the Void') opp.chaliceX = p.x;
    if (p.name === 'Disruptor Flute') opp.fluteNamed = p.named ?? '';
  }
  return { opp, unknown };
}

/**
 * Build the §3 setup object from the form model.
 * Returns { setup, errors }; errors are UI-level checks (bad numbers, deck parse
 * errors, zone counts exceeding the deck). The engine does the full validation.
 */
export function buildSetup(model) {
  const errors = [];
  const parsed = parseDeck(model.deckText);
  for (const e of parsed.errors) errors.push(`Deck ${e.message}`);
  if (Object.keys(parsed.main).length === 0) errors.push('Deck: the main deck is empty.');
  if (!parsed.main.Doomsday) errors.push('Deck: the main deck has no Doomsday.');

  const manaPool = {};
  for (const c of COLORS) {
    const n = toInt(model.manaPool?.[c] ?? 0);
    if (!Number.isInteger(n) || n < 0) errors.push(`Floating mana ${c} must be a whole number ≥ 0.`);
    manaPool[c] = Number.isInteger(n) && n >= 0 ? n : 0;
  }
  const life = toInt(model.lifeBeforeDoomsday);
  if (!Number.isInteger(life) || life < 1) errors.push('Life before Doomsday must be a whole number ≥ 1.');
  const nc = toInt(model.noncreatureSpellsCastThisTurn);
  if (!Number.isInteger(nc) || nc < 1) errors.push('Noncreature spells cast this turn must be ≥ 1 (Doomsday counts).');
  const turns = toInt(model.turnsAhead);
  if (!Number.isInteger(turns) || turns < 0 || turns > 3) errors.push('Turns ahead must be 0–3.');

  const permanents = opponentPermanents(model.opponent);
  // The engine matches Flute's name exactly (§6), so a typed "street wraith"
  // would silently do nothing. Card names are unique ignoring case and spacing:
  // map the typed name onto the deck's spelling when one matches.
  const canon = new Map(Object.keys(parsed.main).map((n) => [normName(n), n]));
  for (const p of permanents) {
    if (p.name === 'Disruptor Flute' && canon.has(normName(p.named))) p.named = canon.get(normName(p.named));
  }
  for (const p of permanents) {
    if (p.name === 'Chalice of the Void' && !(Number.isInteger(p.x) && p.x >= 0)) {
      errors.push('Chalice of the Void needs X as a whole number ≥ 0.');
    }
    if (p.name === 'Disruptor Flute' && !p.named) errors.push('Disruptor Flute needs a card name.');
  }

  const setup = {
    deck: parsed.main,
    hand: [...(model.hand ?? [])],
    battlefield: (model.battlefield ?? []).map((p) => ({ name: p.name, tapped: !!p.tapped })),
    graveyard: [...(model.graveyard ?? [])],
    exile: [...(model.exile ?? [])],
    manaPool,
    lifeBeforeDoomsday: life,
    landPlayedThisTurn: !!model.landPlayedThisTurn,
    noncreatureSpellsCastThisTurn: nc,
    cavernType: String(model.cavernType ?? '').trim() || 'Merfolk',
    opponent: { permanents },
    turnsAhead: turns,
  };

  // Zone counts vs deck (Doomsday: one copy is on the stack).
  const used = countNames([
    ...setup.hand,
    ...setup.battlefield.map((p) => p.name),
    ...setup.graveyard,
    ...setup.exile,
  ]);
  if (parsed.main.Doomsday) used.Doomsday = (used.Doomsday ?? 0) + 1;
  for (const [name, n] of Object.entries(used)) {
    const have = parsed.main[name] ?? 0;
    if (n > have) {
      errors.push(`${name}: ${n} in hand/battlefield/graveyard/exile${name === 'Doomsday' ? ' (+1 on the stack)' : ''} but the deck has ${have}.`);
    }
  }
  return { setup, errors };
}

/** Inverse of buildSetup for scenario import: setup (+pile) → form model. */
export function modelFromSetup(setup, pile = []) {
  const m = defaultModel(deckToText({ main: setup.deck ?? {} }));
  const { opp, unknown } = opponentModel(setup.opponent?.permanents ?? []);
  m.hand = [...(setup.hand ?? [])];
  m.battlefield = (setup.battlefield ?? []).map((p) =>
    typeof p === 'string' ? { name: p, tapped: false } : { name: p.name, tapped: !!p.tapped });
  m.graveyard = [...(setup.graveyard ?? [])];
  m.exile = [...(setup.exile ?? [])];
  for (const c of COLORS) m.manaPool[c] = setup.manaPool?.[c] ?? 0;
  if (setup.lifeBeforeDoomsday !== undefined) m.lifeBeforeDoomsday = setup.lifeBeforeDoomsday;
  m.landPlayedThisTurn = !!setup.landPlayedThisTurn;
  if (setup.noncreatureSpellsCastThisTurn !== undefined) m.noncreatureSpellsCastThisTurn = setup.noncreatureSpellsCastThisTurn;
  if (setup.cavernType) m.cavernType = setup.cavernType;
  if (setup.turnsAhead !== undefined) m.turnsAhead = setup.turnsAhead;
  m.opponent = opp;
  // A pile is never longer than 5 (§3). An imported setup that is invalid keeps
  // its pile unnormalised until fixed, so clamp here or the page renders one
  // select per entry of an arbitrarily long array.
  m.pile = Array.isArray(pile) ? pile.slice(0, 5) : [];
  // deckToText keeps only whole-number counts ≥ 1; say what was dropped instead
  // of silently checking a different deck than the one pasted.
  const dropped = Object.entries(setup.deck ?? {})
    .filter(([, n]) => !(Number.isInteger(n) && n >= 0))
    .map(([name, n]) => `Deck entry ignored (count must be a whole number): ${name} = ${JSON.stringify(n)}`);
  return { model: m, warnings: [...unknown.map((n) => `Unknown opponent permanent ignored: ${n}`), ...dropped] };
}

// ---------- pile pool bookkeeping ----------

/** Required pile length: 5, or the whole pool if it has fewer than 5 cards. */
export function pileSize(pool) {
  const total = Object.values(pool ?? {}).reduce((a, n) => a + Math.max(0, n), 0);
  return Math.min(5, total);
}

/**
 * Keep earlier picks; clear any later pick that exceeds the pool once earlier
 * picks are counted. Returns an array of exactly `size` entries ('' = empty).
 */
export function normalizePile(pool, pile, size = pileSize(pool)) {
  const used = {};
  const out = [];
  for (let i = 0; i < size; i++) {
    const name = pile?.[i] ?? '';
    if (name && (used[name] ?? 0) < (pool[name] ?? 0)) {
      used[name] = (used[name] ?? 0) + 1;
      out.push(name);
    } else {
      out.push('');
    }
  }
  return out;
}

/**
 * Options for pile select `index`: every pool name with copies left after the
 * picks in EARLIER selects. `remaining` counts copies available to this select.
 */
export function pileOptions(pool, pile, index) {
  const used = countNames((pile ?? []).slice(0, index).filter(Boolean));
  const out = [];
  for (const [name, n] of Object.entries(pool ?? {})) {
    const remaining = n - (used[name] ?? 0);
    if (remaining > 0) out.push({ name, remaining });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** Pool counts with how many copies are left after all picks: [{name, total, left}]. */
export function poolSummary(pool, pile) {
  const used = countNames((pile ?? []).filter(Boolean));
  return Object.entries(pool ?? {})
    .filter(([, n]) => n > 0)
    .map(([name, total]) => ({ name, total, left: total - (used[name] ?? 0) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Pure fallback for the §3 pile pool, used only if engine.js failed to load. */
export function fallbackPilePool(setup) {
  const left = { ...(setup.deck ?? {}) };
  const take = (name) => { left[name] = (left[name] ?? 0) - 1; };
  for (const n of setup.hand ?? []) take(n);
  for (const p of setup.battlefield ?? []) take(p.name);
  for (const n of setup.graveyard ?? []) take(n);
  for (const n of setup.exile ?? []) take(n);
  take('Doomsday');
  for (const n of setup.graveyard ?? []) left[n] = (left[n] ?? 0) + 1;
  const out = {};
  for (const [name, n] of Object.entries(left)) if (n > 0) out[name] = n;
  return out;
}

// ---------- plan / result rendering ----------

/** True if the plan tree contains any branch (shuffle / random) node. */
export function planHasBranch(plan) {
  if (!plan || typeof plan !== 'object') return false;
  if (plan.kind === 'branch') return true;
  if (plan.kind === 'step') return planHasBranch(plan.then);
  return false;
}

export function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const RESULT_LABEL = { win: 'WIN', no_win: 'NO WIN', aborted: 'TOO BIG' };

/**
 * Solver result (+ explain() lines) → HTML for the result area.
 * @param {{result:string, plan?:object, nodes?:number}} res
 * @param {string[]} lines  output of explain(res.plan), or [] when no plan
 */
export function renderResultHTML(res, lines = []) {
  const label = RESULT_LABEL[res?.result] ?? 'ERROR';
  const cls = res?.result === 'win' ? 'win' : res?.result === 'no_win' ? 'nowin' : 'big';
  let html = `<div class="banner ${cls}" role="status">${label}</div>`;
  const nodes = Number.isFinite(res?.nodes) ? res.nodes.toLocaleString('en-US') : '?';
  if (res?.result === 'no_win') {
    html += `<p class="meta">No line wins against every shuffle within the turn limit. (${nodes} positions searched.)</p>`;
  } else if (res?.result === 'aborted') {
    html += `<p class="meta">Search stopped after ${nodes} positions without an answer. Try fewer turns ahead.</p>`;
  } else if (res?.result === 'win') {
    html += `<p class="meta">${nodes} positions searched.</p>`;
  }
  if (res?.result === 'win' && planHasBranch(res.plan)) {
    html += '<p class="warn">⚠ This line includes a shuffle or other random step. '
      + 'The plan shows a follow-up for each outcome, so it assumes you know the new order. '
      + 'In a real game you would not.</p>';
  }
  if (lines.length) {
    html += '<ol class="plan">'
      + lines.map((l) => {
        const isHeader = /^(Turn \d|Opponent's turn)/.test(l.trim());
        return `<li${isHeader ? ' class="hdr"' : ''}>${escapeHtml(l)}</li>`;
      }).join('')
      + '</ol>';
  }
  return html;
}

// ---------- scenario JSON ----------

export function scenarioToJSON(setup, pile) {
  return JSON.stringify({ setup, pile }, null, 2);
}

/** Parse scenario JSON text → { setup, pile } or throw Error with a readable message. */
export function parseScenario(text) {
  let obj;
  try {
    obj = JSON.parse(text);
  } catch (e) {
    throw new Error(`Scenario is not valid JSON: ${e.message}`);
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) throw new Error('Scenario must be an object {setup, pile}.');
  const { setup, pile = [] } = obj;
  if (!setup || typeof setup !== 'object' || Array.isArray(setup)) throw new Error('Scenario is missing a "setup" object.');
  if (!setup.deck || typeof setup.deck !== 'object') throw new Error('Scenario setup is missing "deck" ({name: count}).');
  if (!Array.isArray(pile) || pile.some((n) => typeof n !== 'string')) throw new Error('Scenario "pile" must be an array of card names.');
  for (const z of ['hand', 'graveyard', 'exile', 'battlefield']) {
    if (setup[z] !== undefined && !Array.isArray(setup[z])) throw new Error(`Scenario setup.${z} must be an array.`);
  }
  return { setup, pile };
}
