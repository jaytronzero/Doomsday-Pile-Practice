// Practice mode pure logic (SPEC_V2 §7). Uses a FAKE grade function, so it does not
// depend on the engine, solver or grade.js.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  makeRng, parseScenarioFile, checkScenarioFile, filterOptions, filterScenarios, dealScenario,
  emptyStats, normalizeStats, loadStats, saveStats, recordAttempt, applyActualComparison, isMastered,
  statsSummary, scoreOf, judgeAttempt, formatPct, formatEst, attackPower, boardView, distinctOrders,
  compareGrades, bestOrderOfPile, gradeView, revealView, STATS_KEY, MAX_ORDERS,
} from '../src/practiceLogic.js';
import { fallbackPilePool } from '../src/uiLogic.js';
import { parseDeck } from '../src/deckText.js';
import { DEFAULT_DECK_TEXT } from '../src/defaultDeck.js';

const SAMPLES = JSON.parse(readFileSync(new URL('../data/sample-scenarios.json', import.meta.url), 'utf8'));

const scen = (id, source = {}, extra = {}) => ({
  id,
  source: { player: 'SAMPLE', deck: 'Turbo DD', oppDeck: 'UB Tempo', ...source },
  setup: { deck: { Doomsday: 1, "Thassa's Oracle": 1, 'Street Wraith': 4 }, hand: [], opponent: {} },
  actual: { pile: ['Street Wraith'], pileOrdered: false, result: 'win' },
  ...extra,
});

/** Fake GradeResult. */
const G = (goldfish, pWin, extra = {}) => ({
  goldfish: { result: goldfish },
  pWin,
  pWinRange: pWin === null ? (extra.pWinRange ?? [0, 1]) : [pWin, pWin],
  singles: [], pairs: [], notModelled: [], offColor: [], assumptions: [], source: 'SAMPLE estimate',
  ...extra,
});

function memStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), m };
}

describe('makeRng', () => {
  test('deterministic per seed, values in [0,1)', () => {
    const a = makeRng(42); const b = makeRng(42); const c = makeRng(43);
    const xa = Array.from({ length: 50 }, a);
    assert.deepEqual(xa, Array.from({ length: 50 }, b));
    assert.notDeepEqual(xa, Array.from({ length: 50 }, c));
    assert.ok(xa.every((x) => x >= 0 && x < 1));
  });
});

describe('parseScenarioFile / checkScenarioFile', () => {
  test('bad JSON and wrong shape are reported, never thrown', () => {
    assert.match(parseScenarioFile('{nope').errors[0], /JSON/);
    assert.equal(parseScenarioFile('[]').scenarios.length, 0);
    const r = parseScenarioFile(JSON.stringify({ version: 1, scenarios: [scen('a')] }));
    assert.equal(r.scenarios.length, 1);
    assert.ok(r.errors.some((e) => /version 2/.test(e)));
    assert.ok(parseScenarioFile(JSON.stringify({ version: 2, scenarios: {} })).errors.length);
  });
  test('duplicate or missing ids and missing setup/actual drop that entry', () => {
    const r = checkScenarioFile({ version: 2, scenarios: [scen('a'), scen('a'), { id: 'b' }, scen('')] });
    assert.deepEqual(r.scenarios.map((s) => s.id), ['a']);
    assert.equal(r.errors.length, 4);
  });
  test('an injected validateScenarioFile drops the scenarios its errors name', () => {
    const v = (f) => f.scenarios.filter((s) => s.id.startsWith('bad')).map((s) => `${s.id}: nope`);
    const r = checkScenarioFile({ version: 2, scenarios: [scen('ok-1'), scen('bad-1')] }, v);
    assert.deepEqual(r.scenarios.map((s) => s.id), ['ok-1']);
    assert.deepEqual(r.errors, ['bad-1: nope']);
    const thrower = () => { throw new Error('boom'); };
    assert.match(checkScenarioFile({ version: 2, scenarios: [scen('x')] }, thrower).errors[0], /boom/);
  });
});

describe('filters and deal', () => {
  const list = [
    scen('1', { deck: 'Turbo DD', oppDeck: 'UB Tempo', player: 'P1' }),
    scen('2', { deck: 'Tempo DD', oppDeck: 'Eldrazi', player: 'P2' }),
    scen('3', { deck: 'Turbo DD', oppDeck: 'Eldrazi', player: 'P1' }),
  ];
  test('filterOptions lists sorted unique values', () => {
    assert.deepEqual(filterOptions(list), { decks: ['Tempo DD', 'Turbo DD'], oppDecks: ['Eldrazi', 'UB Tempo'], players: ['P1', 'P2'] });
  });
  test('filterScenarios: empty = any; filters combine', () => {
    assert.equal(filterScenarios(list, {}).length, 3);
    assert.deepEqual(filterScenarios(list, { deck: 'Turbo DD', oppDeck: 'Eldrazi' }).map((s) => s.id), ['3']);
    assert.deepEqual(filterScenarios(list, { player: 'P2' }).map((s) => s.id), ['2']);
  });
  test('deal skips mastered boards, avoids repeating the last board, is seeded', () => {
    let stats = emptyStats();
    stats = recordAttempt(stats, '1', G('win', 0.9));
    assert.ok(isMastered(stats, '1'));
    for (let seed = 1; seed < 40; seed++) {
      const r = dealScenario(list, stats, { rng: makeRng(seed) });
      assert.notEqual(r.scenario.id, '1');
      assert.equal(r.candidates, 2);
      const r2 = dealScenario(list, stats, { rng: makeRng(seed), lastId: r.scenario.id });
      assert.notEqual(r2.scenario.id, r.scenario.id);
    }
    const a = dealScenario(list, emptyStats(), { rng: makeRng(7) }).scenario.id;
    assert.equal(dealScenario(list, emptyStats(), { rng: makeRng(7) }).scenario.id, a);
  });
  test('repeat all includes mastered; all mastered falls back to every board', () => {
    let stats = emptyStats();
    for (const s of list) stats = recordAttempt(stats, s.id, G('win', 1));
    const r = dealScenario(list, stats, { rng: makeRng(1) });
    assert.equal(r.allMastered, true);
    assert.ok(r.scenario);
    const seen = new Set();
    for (let seed = 1; seed < 60; seed++) seen.add(dealScenario(list, stats, { rng: makeRng(seed), repeatAll: true }).scenario.id);
    assert.equal(seen.size, 3);
    assert.equal(dealScenario([], stats).scenario, null);
  });
});

describe('stats', () => {
  test('recordAttempt counts attempts, goldfish wins, est. P(win) and per-board best', () => {
    let s = emptyStats();
    s = recordAttempt(s, 'a', G('win', 0.5));
    s = recordAttempt(s, 'a', G('no_win', 0));
    s = recordAttempt(s, 'b', G('win', null, { pWinRange: [0.25, 0.75] }));
    assert.equal(s.attempts, 3);
    assert.equal(s.goldfishWins, 2);
    assert.equal(s.pWinCount, 3);
    assert.equal(s.pWinSum, 0.75); // 0.5 + 0 + 0.25 (range → low end)
    assert.deepEqual(s.byId.a, { attempts: 2, goldfishWins: 1, best: 0.5, mastered: true });
    assert.equal(s.byId.b.best, 0.25);
    const sum = statsSummary(s, [{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
    assert.equal(sum.goldfishRate, 2 / 3);
    assert.equal(sum.avgPWin, 0.25);
    assert.equal(sum.mastered, 2);
    assert.equal(sum.total, 3);
    assert.deepEqual(sum.rows.map((r) => r.id), ['a', 'b']);
    assert.equal(statsSummary(emptyStats()).goldfishRate, null);
  });
  test('an aborted goldfish is no win; pWin null with no range is not averaged', () => {
    const s = recordAttempt(emptyStats(), 'a', { goldfish: { result: 'aborted' }, pWin: null, pWinRange: null });
    assert.equal(s.goldfishWins, 0);
    assert.equal(s.pWinCount, 0);
    assert.equal(s.byId.a.mastered, false);
    assert.equal(scoreOf(null), null);
  });
  test('judge: goldfish win and at least the real pile’s est.', () => {
    assert.equal(judgeAttempt(G('no_win', 0)), false);
    assert.equal(judgeAttempt(G('win', 0.4)), true);
    assert.equal(judgeAttempt(G('win', 0.4), G('win', 0.6)), false);
    assert.equal(judgeAttempt(G('win', 0.6), G('win', 0.6)), true);
    assert.equal(judgeAttempt(G('win', 0.1), G('no_win', 0)), true);
  });
  test('applyActualComparison un-masters a pile worse than the real one, unless an earlier attempt beat it', () => {
    let s = recordAttempt(emptyStats(), 'a', G('win', 0.4));
    s = applyActualComparison(s, 'a', G('win', 0.4), G('win', 0.6));
    assert.equal(s.byId.a.mastered, false);
    s = recordAttempt(s, 'a', G('win', 0.7));
    s = applyActualComparison(s, 'a', G('win', 0.7), G('win', 0.6));
    assert.equal(s.byId.a.mastered, true);
    s = recordAttempt(s, 'a', G('win', 0.3));
    s = applyActualComparison(s, 'a', G('win', 0.3), G('win', 0.6));
    assert.equal(s.byId.a.mastered, true, 'the earlier 0.7 still beats the real pile');
    assert.deepEqual(applyActualComparison(emptyStats(), 'zz', G('win', 1), null).byId, {});
  });
  test('storage: round trip, garbage, and throwing storage never throw', () => {
    const st = memStorage();
    const s = recordAttempt(emptyStats(), 'a', G('win', 0.5));
    assert.equal(saveStats(st, s), true);
    assert.deepEqual(loadStats(st), s);
    st.setItem(STATS_KEY, '{bad json');
    assert.deepEqual(loadStats(st), emptyStats());
    st.setItem(STATS_KEY, JSON.stringify({ attempts: -3, goldfishWins: 'x', byId: { a: { attempts: 2, best: 'no' }, b: null } }));
    assert.deepEqual(loadStats(st), { ...emptyStats(), byId: { a: { attempts: 2, goldfishWins: 0, best: null, mastered: false } } });
    const bad = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('quota'); } };
    assert.deepEqual(loadStats(bad), emptyStats());
    assert.equal(saveStats(bad, s), false);
    assert.equal(saveStats(null, s), false);
    assert.deepEqual(loadStats(null), emptyStats());
    assert.deepEqual(normalizeStats([]), emptyStats());
  });
});

describe('formatting', () => {
  test('formatPct never shows 0%/100% for values strictly between', () => {
    assert.equal(formatPct(0), '0%');
    assert.equal(formatPct(1), '100%');
    assert.equal(formatPct(0.004), '<1%');
    assert.equal(formatPct(0.997), '>99%');
    assert.equal(formatPct(0.456), '46%');
    assert.equal(formatPct(null), '?');
  });
  test('formatEst always says est.', () => {
    assert.equal(formatEst(G('win', 0.5)), 'est. 50%');
    assert.equal(formatEst(G('win', null, { pWinRange: [0.2, 0.7] })), 'est. 20%–70%');
    assert.equal(formatEst(null), 'est. ?');
    for (const g of [G('win', 0.5), G('win', null, { pWinRange: [0.2, 0.7] }), null]) assert.match(formatEst(g), /^est\. /);
  });
});

describe('boardView', () => {
  const s = {
    id: 'SAMPLE-x',
    source: { player: 'SAMPLE', deck: 'Turbo DD', oppDeck: 'Boros', onPlay: false, gameNumber: 2 },
    setup: {
      deck: { Doomsday: 2, "Thassa's Oracle": 2, 'Street Wraith': 2, 'Underground Sea': 3, Brainstorm: 1 },
      hand: ['Street Wraith', 'Street Wraith'],
      battlefield: [{ name: 'Underground Sea', tapped: true }, { name: 'Underground Sea' }],
      graveyard: ['Brainstorm'], manaPool: { U: 1, B: 0 }, lifeBeforeDoomsday: 17, turnsAhead: 1,
      opponent: {
        permanents: [{ name: 'Thalia, Guardian of Thraben' }, { name: 'Ocelot Pride', power: 3 }, { name: 'Nethergoyf' },
          { name: 'Chalice of the Void', x: 1 }, { name: 'Mystery Card', power: 2 }],
        graveyard: ['Arid Mesa'], handSize: 4, lands: { untapped: 1, total: 3, colors: 'RW' }, life: 19,
        deckEstimateSource: 'SAMPLE estimate',
      },
    },
    actual: { pile: [], pileOrdered: false, result: 'win' },
    warnings: ['w1'],
  };
  test('my side, opponent side, clock and pool', () => {
    const v = boardView(s);
    assert.equal(v.title, 'Turbo DD vs Boros');
    assert.ok(v.meta.includes('On the draw') && v.meta.includes('Game 2'));
    assert.equal(v.isSample, true);
    assert.deepEqual(v.me.hand, [{ name: 'Street Wraith', n: 2 }]);
    assert.deepEqual(v.me.battlefield, [{ name: 'Underground Sea', tapped: true }, { name: 'Underground Sea', tapped: false }]);
    assert.equal(v.me.mana, 'U×1');
    assert.equal(v.me.lifeAfter, 8);
    assert.equal(v.opp.lands, '1/3 untapped (RW)');
    assert.equal(v.opp.handSize, 4);
    // Thalia printed 2 + Ocelot scenario 3 + Mystery 2 (scenario power); Nethergoyf '*' unknown; Chalice not a creature
    assert.equal(v.opp.clock, 7);
    assert.equal(v.opp.clockUnknown, true);
    assert.deepEqual(v.opp.permanents.map((p) => p.power), [2, 3, '*', null, 2]);
    assert.equal(v.opp.permanents[3].detail, 'X=1');
    assert.deepEqual(v.warnings, ['w1']);
    // pool = library (Doomsday 1, Oracle 2, Sea 1) + graveyard (Brainstorm 1)
    assert.deepEqual(v.pool, { Doomsday: 1, "Thassa's Oracle": 2, 'Underground Sea': 1, Brainstorm: 1 });
  });
  test('an injected availablePile is used; if it throws, the fallback pool is used with an error', () => {
    assert.deepEqual(boardView(s, () => ({ A: 2, B: 0 })).pool, { A: 2 });
    const v = boardView(s, () => { throw new Error('engine down'); });
    assert.equal(v.poolError, 'engine down');
    assert.equal(v.pool["Thassa's Oracle"], 2);
  });
  test('attackPower: scenario value, printed value, non-creature, unknown', () => {
    assert.equal(attackPower({ name: 'Goblin Guide' }), 2);
    assert.equal(attackPower({ name: 'Goblin Guide', power: 0 }), 0);
    assert.equal(attackPower({ name: 'Wasteland' }), null);
    assert.equal(attackPower({ name: 'Not A Card' }), null);
  });
});

describe('best order of the actual pile', () => {
  test('distinctOrders: 5 distinct → 120; multiset → n!/Π k!; capped', () => {
    assert.equal(distinctOrders(['a', 'b', 'c', 'd', 'e']).length, 120);
    assert.equal(distinctOrders(['a', 'a', 'b', 'b', 'c']).length, 30);
    assert.equal(distinctOrders(['a', 'a', 'a', 'a', 'a']).length, 1);
    assert.equal(distinctOrders(['a', 'b', 'c', 'd', 'e'], 7).length, 7);
    const o = distinctOrders(['b', 'a', 'a']);
    assert.deepEqual(o, [['a', 'a', 'b'], ['a', 'b', 'a'], ['b', 'a', 'a']]);
    assert.equal(MAX_ORDERS, 120);
  });
  test('compareGrades: goldfish win first, then low, then high', () => {
    assert.ok(compareGrades(G('win', 0), G('no_win', 0)) > 0);
    assert.ok(compareGrades(G('win', 0.5), G('win', 0.4)) > 0);
    assert.ok(compareGrades(G('win', null, { pWinRange: [0.4, 0.9] }), G('win', 0.4)) > 0);
    assert.equal(compareGrades(G('win', 0.4), G('win', 0.4)), 0);
  });
  test('unordered: grades every distinct order, keeps the best (first on ties)', () => {
    const calls = [];
    const score = { 'a,b,c': 0.2, 'a,c,b': 0.7, 'b,a,c': 0.7, 'b,c,a': 0.1, 'c,a,b': 0.3, 'c,b,a': 0 };
    const grade = (o) => { calls.push(o.join()); return G(score[o.join()] > 0 ? 'win' : 'no_win', score[o.join()]); };
    const progress = [];
    const r = bestOrderOfPile(['c', 'b', 'a'], { grade, onProgress: (p) => progress.push(p.done) });
    assert.equal(calls.length, 6);
    assert.deepEqual(r.best.order, ['a', 'c', 'b']);
    assert.equal(r.best.grade.pWin, 0.7);
    assert.deepEqual([r.tried, r.graded, r.total, r.ordered], [6, 6, 6, false]);
    assert.deepEqual(progress, [1, 2, 3, 4, 5, 6]);
  });
  test('ordered: only the logged order is graded (no goldfish screen)', () => {
    const calls = [];
    const r = bestOrderOfPile(['c', 'b', 'a'], { ordered: true, grade: (o) => { calls.push(o.join()); return G('win', 0.3); }, goldfish: () => { throw new Error('unused'); } });
    assert.deepEqual(calls, ['c,b,a']);
    assert.deepEqual(r.best.order, ['c', 'b', 'a']);
    assert.equal(r.total, 1);
  });
  test('goldfish screen: only goldfish winners get the full grade; early stop at 100%', () => {
    const graded = [];
    const r = bestOrderOfPile(['a', 'b', 'c', 'd'], {
      goldfish: (o) => ({ result: o[0] === 'c' ? 'win' : 'no_win' }),
      grade: (o) => { graded.push(o.join()); return G('win', o[1] === 'a' ? 1 : 0.5); },
    });
    assert.deepEqual(graded, ['c,a,b,d'], 'stops at the first 100% order');
    assert.equal(r.best.grade.pWin, 1);
    assert.equal(r.graded, 1);
    assert.ok(r.tried < r.total);
  });
  test('no order wins the goldfish: the first order is reported with 0, grade never called', () => {
    const r = bestOrderOfPile(['a', 'b'], { goldfish: () => ({ result: 'no_win' }), grade: () => { throw new Error('nope'); } });
    assert.deepEqual(r.best.order, ['a', 'b']);
    assert.equal(r.best.grade.goldfishOnly, true);
    assert.equal(r.best.grade.pWin, 0);
    assert.equal(r.graded, 0);
  });
  test('a throwing grade is recorded per order and does not stop the others', () => {
    const r = bestOrderOfPile(['a', 'b'], { grade: (o) => { if (o[0] === 'a') throw new Error('bad'); return G('win', 0.2); } });
    assert.deepEqual(r.best.order, ['b', 'a']);
    assert.equal(r.errors.length, 1);
    assert.match(r.errors[0], /a, b: bad/);
  });
});

describe('reveal view model', () => {
  const full = G('win', 0.62, {
    singles: [
      { card: 'Daze', k: 4, pHold: 0.5, wins: true },
      { card: 'Stifle', k: 2, pHold: 0.38, wins: false },
      { card: 'Force of Will', k: 4, pHold: 0.55, wins: false },
      { card: 'Spell Pierce', k: 1, pHold: 0.1, wins: null },
    ],
    pairs: [{ cards: ['Daze', 'Daze'], wins: false }, { cards: ['Daze', 'Spell Pierce'], wins: null }, { cards: ['Daze', 'Fake'], wins: true }],
    notModelled: ['Brainstorm'], offColor: ['Pyroblast'], assumptions: ['Monotonicity'], N: 40, h: 5,
  });
  test('gradeView: losers first by likelihood; every probability says est.', () => {
    const v = gradeView(full);
    assert.deepEqual(v.singles.map((s) => s.card), ['Force of Will', 'Stifle', 'Spell Pierce', 'Daze']);
    assert.equal(v.singles[1].text, 'loses to Stifle (est. 38% they hold one; 2 unseen)');
    assert.deepEqual(v.losingPairs.map((p) => p.text), ['Daze + Daze']);
    assert.deepEqual(v.unknownPairs.map((p) => p.text), ['Daze + Spell Pierce']);
    assert.equal(v.est, 'est. 62%');
    assert.equal(v.goldfishLabel, 'WIN');
    assert.equal(v.source, 'SAMPLE estimate');
    for (const s of v.singles) if (s.pHold !== null) assert.match(s.text, /est\. \d+% they hold one/);
    assert.equal(gradeView(null), null);
    assert.equal(gradeView(G('aborted', null)).goldfishLabel, 'TOO BIG');
    assert.equal(gradeView(G('aborted', null)).isRange, true);
  });
  test('revealView: mine vs actual, verdict, result text, order note', () => {
    const s = scen('r1', {}, { actual: { pile: ['b', 'a'], pileOrdered: false, result: 'loss', winBy: 'concession', turnsAfterDoomsday: 1 } });
    s.setup.opponent = { deckEstimateSource: 'from scenario' };
    const actualRes = bestOrderOfPile(['b', 'a'], { grade: (o) => G('win', o[0] === 'a' ? 0.4 : 0.3) });
    const r = revealView(s, { pile: ['a', 'b'], grade: full, lines: ['l1'] }, actualRes);
    assert.equal(r.verdict, 'better');
    assert.equal(r.mine.est, 'est. 62%');
    assert.deepEqual(r.mine.lines, ['l1']);
    assert.equal(r.actual.resultText, 'Lost, by concession, 1 turn after Doomsday');
    assert.equal(r.actual.est, 'est. 40%');
    assert.deepEqual(r.actual.bestOrder, ['a', 'b']);
    assert.equal(r.actual.sameCards, true);
    assert.match(r.actual.orderNote, /best of 2 of 2 distinct orders/);
    assert.equal(r.source, 'SAMPLE estimate');
    const pending = revealView(s, { pile: ['a', 'b'], grade: G('win', 0.1, { source: null }) }, null);
    assert.equal(pending.actual.graded, false);
    assert.equal(pending.verdict, null);
    assert.equal(pending.source, 'from scenario');
    const worse = revealView(s, { pile: ['a', 'b'], grade: G('no_win', 0) }, actualRes);
    assert.equal(worse.verdict, 'worse');
  });
});

describe('data/sample-scenarios.json (SPEC_V2 §2, §7)', () => {
  const deck = parseDeck(DEFAULT_DECK_TEXT).main;
  const SOURCE_KEYS = ['player', 'date', 'deck', 'oppDeck', 'gameNumber', 'onPlay'];
  const OPP_KEYS = ['permanents', 'graveyard', 'exile', 'life', 'handSize', 'lands', 'deckEstimate', 'deckEstimateSource', 'hand'];
  test('version 2, 4–6 scenarios, structurally valid', () => {
    assert.equal(SAMPLES.version, 2);
    assert.ok(SAMPLES.scenarios.length >= 4 && SAMPLES.scenarios.length <= 6);
    const { scenarios, errors } = checkScenarioFile(SAMPLES);
    assert.deepEqual(errors, []);
    assert.equal(scenarios.length, SAMPLES.scenarios.length);
  });
  for (const s of SAMPLES.scenarios) {
    test(`${s.id}: marked SAMPLE, default deck, whitelisted keys, plausible estimate, buildable pile`, () => {
      assert.match(s.id, /^SAMPLE-/);
      assert.equal(s.source.player, 'SAMPLE');
      for (const k of Object.keys(s.source)) assert.ok(SOURCE_KEYS.includes(k), `source.${k}`);
      for (const k of Object.keys(s.setup.opponent)) assert.ok(OPP_KEYS.includes(k), `opponent.${k}`);
      assert.deepEqual(s.setup.deck, deck);
      const est = s.setup.opponent.deckEstimate;
      assert.equal(Object.values(est).reduce((a, b) => a + b, 0), 60);
      assert.match(s.setup.opponent.deckEstimateSource, /SAMPLE/);
      assert.ok(Number.isInteger(s.setup.opponent.handSize));
      const { untapped, total, colors } = s.setup.opponent.lands;
      assert.ok(untapped >= 0 && untapped <= total && /^[WUBRGC]*$/.test(colors));
      // Every name the opponent shows must fit within its estimate.
      const shown = [...s.setup.opponent.permanents.map((p) => p.name), ...s.setup.opponent.graveyard, ...s.setup.opponent.exile];
      for (const n of shown) assert.ok((est[n] ?? 0) >= 1, `${n} is in the estimate`);
      assert.equal(s.actual.pile.length, 5);
      assert.equal(typeof s.actual.pileOrdered, 'boolean');
      assert.ok(['win', 'loss'].includes(s.actual.result));
      const pool = fallbackPilePool(s.setup);
      const used = {};
      for (const n of s.actual.pile) used[n] = (used[n] ?? 0) + 1;
      for (const [n, c] of Object.entries(used)) assert.ok(c <= (pool[n] ?? 0), `${n}: pile ${c} > pool ${pool[n] ?? 0}`);
      assert.ok(Array.isArray(s.warnings) && s.warnings.every((w) => typeof w === 'string'));
    });
  }
});
