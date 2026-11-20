// SPEC_V2 §6 interaction grade (SPEC_V2_API §11). Exact-fraction tests on tiny decks; every expected value is
// computed by hand in the comment next to it. C(n, k) = binomial coefficient.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { grade, unseenPool, pHold, handWinProbability, handVerdict, pairKey } from '../src/grade.js';
import {
  withOpp, near, setupA2, PILE_A2, setupP3, PILE_P3, STIFLE, DAZE, PIERCE, BOLT,
} from './v2-helpers.js';

// ---------------------------------------------------------------------------
describe('pHold(N, k, h) = 1 − C(N−k, h)/C(N, h)', () => {
  test('tiny decks', () => {
    near(pHold(4, 1, 2), 1 / 2, '1 − C(3,2)/C(4,2) = 1 − 3/6');
    near(pHold(6, 2, 2), 3 / 5, '1 − C(4,2)/C(6,2) = 1 − 6/15');
    near(pHold(5, 0, 3), 0, 'no copies');
    near(pHold(5, 5, 1), 1, 'every card is a copy');
    near(pHold(10, 3, 0), 0, 'empty hand');
  });
  test('a 4-of in a 7-card hand from 60: 1 − (53·52·51·50)/(60·59·58·57)', () => {
    // C(56,7)/C(60,7) = Π_{i=0..6} (56−i)/(60−i) = (53·52·51·50)/(60·59·58·57) = 7027800/11703240.
    near(pHold(60, 4, 7), 1 - 7027800 / 11703240);
  });
  test('RangeError outside 0 ≤ k ≤ N, 0 ≤ h ≤ N', () => {
    assert.throws(() => pHold(3, 4, 1), RangeError);
    assert.throws(() => pHold(3, 1, 4), RangeError);
  });
});

describe('handWinProbability (multivariate hypergeometric, exact enumeration)', () => {
  // counts {A:2, B:1}, N = 5 (so 2 other cards), h = 2: C(5,2) = 10 equally likely hands.
  const counts = { A: 2, B: 1 };
  test('always-win sums to 1', () => {
    const r = handWinProbability(counts, 5, 2, () => true);
    near(r.low, 1);
    near(r.high, 1);
  });
  test('every vector lists every relevant name', () => {
    handWinProbability(counts, 5, 2, (v) => {
      assert.deepEqual(Object.keys(v).sort(), ['A', 'B']);
      return true;
    });
  });
  test('win iff no A: C(3,2)/10 = 3/10', () => {
    const r = handWinProbability(counts, 5, 2, (v) => v.A === 0);
    near(r.low, 3 / 10);
    near(r.high, 3 / 10);
  });
  test('lose iff A and B together: P = C(2,1)·C(1,1)/10 = 2/10 → 8/10', () => {
    near(handWinProbability(counts, 5, 2, (v) => !(v.A >= 1 && v.B >= 1)).low, 8 / 10);
  });
  test('lose iff two A: P = C(2,2)/10 = 1/10 → 9/10', () => {
    near(handWinProbability(counts, 5, 2, (v) => v.A < 2).low, 9 / 10);
  });
  test('unknown iff B present: low = P(no B) = C(4,2)/10 = 6/10, high = 1', () => {
    const r = handWinProbability(counts, 5, 2, (v) => (v.B >= 1 ? null : true));
    near(r.low, 6 / 10);
    near(r.high, 1);
  });
  test('h = 0: the empty hand only', () => {
    near(handWinProbability(counts, 5, 0, (v) => v.A === 0 && v.B === 0).low, 1);
  });
  test('RangeError when h > N or Σk > N', () => {
    assert.throws(() => handWinProbability(counts, 5, 6, () => true), RangeError);
    assert.throws(() => handWinProbability(counts, 2, 1, () => true), RangeError);
  });
});

describe('handVerdict (monotonicity) and pairKey', () => {
  test('pairKey sorts and joins with " + "', () => {
    assert.equal(pairKey('b', 'a'), 'a + b');
    assert.equal(pairKey(DAZE, DAZE), 'Daze + Daze');
  });
  const singles = { A: true, B: true, C: false };
  const pairs = { [pairKey('A', 'B')]: false, [pairKey('A', 'A')]: true };
  test('losing single or losing pair → false; all known wins → true; missing/unknown → null', () => {
    assert.equal(handVerdict({ A: 0, B: 0, C: 0 }, singles, pairs), true);
    assert.equal(handVerdict({ A: 1, B: 0, C: 0 }, singles, pairs), true);
    assert.equal(handVerdict({ A: 1, B: 1, C: 0 }, singles, pairs), false);
    assert.equal(handVerdict({ A: 0, B: 0, C: 1 }, singles, pairs), false);
    assert.equal(handVerdict({ A: 2, B: 0, C: 0 }, singles, pairs), true, 'same-card pair A+A wins');
    assert.equal(handVerdict({ A: 0, B: 2, C: 0 }, singles, pairs), null, 'B+B was never solved');
    assert.equal(handVerdict({ A: 1 }, { A: null }, {}), null);
    assert.equal(handVerdict({ A: 0 }, { A: null }, {}), true);
  });
  test('a triple whose singles and pairs all win is treated as a win (documented assumption)', () => {
    const s = { A: true, B: true, D: true };
    const p = { [pairKey('A', 'B')]: true, [pairKey('A', 'D')]: true, [pairKey('B', 'D')]: true };
    assert.equal(handVerdict({ A: 1, B: 1, D: 1 }, s, p), true);
  });
});

describe('unseenPool', () => {
  test('deckEstimate − battlefield − graveyard − exile, floored at 0, zeros dropped', () => {
    const u = unseenPool({
      deckEstimate: { [STIFLE]: 2, [DAZE]: 4, 'Delver of Secrets': 4, Island: 3 },
      permanents: [{ name: 'Delver of Secrets' }, { name: 'Delver of Secrets', power: 3 }],
      graveyard: [DAZE, DAZE, DAZE, STIFLE, STIFLE, STIFLE, 'Ponder'],
      exile: ['Island'],
    });
    assert.deepEqual(u, { [DAZE]: 1, 'Delver of Secrets': 2, Island: 2 });
  });
});

// ---------------------------------------------------------------------------
// grade() with an injected fake solver: tests the composition exactly, independent of the engine.
// Base: A' (any valid board works; the fake ignores it) with an opponent hand size and deck estimate.
const scen = (deckEstimate, o = {}) => withOpp(setupA2(), {
  handSize: 2, untapped: 1, total: 1, colors: 'U', deckEstimate, deckEstimateSource: 'test estimate', ...o,
});
/** Fake solver: looks up the sorted opponent hand in `table` (default 'win'); records calls. */
function fake(table) {
  const calls = [];
  const solver = (state) => {
    const key = [...state.opp.hand].sort().join('|');
    calls.push(key);
    return { result: table[key] ?? 'win', plan: null, nodes: 1 };
  };
  return { solver, calls };
}
const sortedCalls = (c) => [...c].sort();

describe('grade() composition (fake solver)', () => {
  // U = {Stifle 1, Daze 1, Ponder 2}, N = 4, h = 2, C(4,2) = 6 hands. Stifle loses alone.
  test('losing single: pWin = P(no Stifle) = C(3,2)/C(4,2) = 1/2; only goldfish + singles are solved', () => {
    const f = fake({ [STIFLE]: 'no_win' });
    const g = grade(scen({ [STIFLE]: 1, [DAZE]: 1, Ponder: 2 }), [...PILE_A2], { solver: f.solver });
    near(g.pWin, 1 / 2);
    assert.deepEqual(g.pWinRange.map((x) => Math.round(x * 1e12) / 1e12), [0.5, 0.5]);
    assert.equal(g.N, 4);
    assert.equal(g.h, 2);
    assert.deepEqual(g.singles.map((x) => x.card), [DAZE, STIFLE]);
    assert.deepEqual(g.singles.map((x) => x.wins), [true, false]);
    for (const x of g.singles) { assert.equal(x.k, 1); near(x.pHold, 1 / 2, x.card); }
    assert.deepEqual(g.pairs, [], 'no pair with two winning singles (Daze+Daze needs k ≥ 2)');
    assert.deepEqual(sortedCalls(f.calls), ['', DAZE, STIFLE].sort());
    assert.deepEqual(g.notModelled, ['Ponder']);
    assert.equal(g.goldfish.result, 'win');
    assert.equal(g.source, 'test estimate');
    assert.ok(g.assumptions.length >= 1 && g.assumptions.every((a) => typeof a === 'string' && a.length > 0));
  });

  test('pair of different cards that loses: pWin = 1 − 1/C(4,2) = 5/6; the pair is solved', () => {
    const f = fake({ [[DAZE, STIFLE].sort().join('|')]: 'no_win' });
    const g = grade(scen({ [STIFLE]: 1, [DAZE]: 1, Ponder: 2 }), [...PILE_A2], { solver: f.solver });
    near(g.pWin, 5 / 6);
    assert.deepEqual(g.pairs, [{ cards: [DAZE, STIFLE], wins: false }]);
    assert.deepEqual(sortedCalls(f.calls), ['', DAZE, [DAZE, STIFLE].join('|'), STIFLE].sort());
  });

  // U = {Daze 2, Ponder 2}: same-card pair. P(both Dazes) = C(2,2)/C(4,2) = 1/6.
  test('same-card pair (k = 2): pWin = 5/6, pHold(Daze) = 1 − C(2,2)/C(4,2) = 5/6', () => {
    const f = fake({ [`${DAZE}|${DAZE}`]: 'no_win' });
    const g = grade(scen({ [DAZE]: 2, Ponder: 2 }), [...PILE_A2], { solver: f.solver });
    near(g.pWin, 5 / 6);
    near(g.singles[0].pHold, 5 / 6);
    assert.deepEqual(g.pairs, [{ cards: [DAZE, DAZE], wins: false }]);
  });

  test('aborted single → unknown → range [1/2, 1] and pWin null; pairs with it are not solved', () => {
    const f = fake({ [STIFLE]: 'aborted' });
    const g = grade(scen({ [STIFLE]: 1, [DAZE]: 1, Ponder: 2 }), [...PILE_A2], { solver: f.solver });
    assert.equal(g.pWin, null);
    near(g.pWinRange[0], 1 / 2, 'hands with Stifle (1/2) counted as losses');
    near(g.pWinRange[1], 1, 'and as wins');
    assert.equal(g.singles.find((x) => x.card === STIFLE).wins, null);
    assert.deepEqual(sortedCalls(f.calls), ['', DAZE, STIFLE].sort());
  });

  test('goldfish no_win → pWin 0, nothing else solved; goldfish aborted → range [0, 1]', () => {
    const a = fake({ '': 'no_win' });
    const g = grade(scen({ [STIFLE]: 1, Ponder: 3 }), [...PILE_A2], { solver: a.solver });
    assert.equal(g.pWin, 0);
    assert.deepEqual(g.pWinRange, [0, 0]);
    assert.deepEqual(g.singles, []);
    assert.deepEqual(a.calls, ['']);
    const b = fake({ '': 'aborted' });
    const h = grade(scen({ [STIFLE]: 1, Ponder: 3 }), [...PILE_A2], { solver: b.solver });
    assert.equal(h.pWin, null);
    assert.deepEqual(h.pWinRange, [0, 1]);
  });

  // deckEstimate Stifle 2, but one is in their graveyard → k = 1; N = 1 + 2 = 3, h = 2.
  // pHold = 1 − C(2,2)/C(3,2) = 2/3; Stifle loses → pWin = 1/3.
  test('the unseen pool subtracts visible cards', () => {
    const f = fake({ [STIFLE]: 'no_win' });
    const g = grade(scen({ [STIFLE]: 2, Ponder: 2 }, { graveyard: [STIFLE] }), [...PILE_A2], { solver: f.solver });
    assert.deepEqual(g.unseen, { [STIFLE]: 1, Ponder: 2 });
    near(g.singles[0].pHold, 2 / 3);
    near(g.pWin, 1 / 3);
  });

  test('cards the opponent cannot cast (colours) are not relevant: listed in offColor, never solved', () => {
    const f = fake({});
    const g = grade(scen({ [BOLT]: 2, [STIFLE]: 1, Ponder: 1 }), [...PILE_A2], { solver: f.solver });
    assert.deepEqual(g.singles.map((x) => x.card), [STIFLE]);
    assert.deepEqual(g.offColor, [BOLT]);
    assert.ok(!f.calls.some((c) => c.includes(BOLT)));
  });

  // handSize 9 > N = 4 → h = 4: every hand holds the Stifle → pWin 0.
  test('hand size larger than the unseen pool is clamped (with an assumption)', () => {
    const f = fake({ [STIFLE]: 'no_win' });
    const g = grade(scen({ [STIFLE]: 1, Ponder: 3 }, { handSize: 9 }), [...PILE_A2], { solver: f.solver });
    assert.equal(g.h, 4);
    near(g.pWin, 0);
    assert.ok(g.assumptions.length >= 2);
  });

  test('sub-solves get the concrete hand, the scenario hand size, and maxNodes', () => {
    const seen = [];
    const solver = (state, opts) => { seen.push([state.opp.hand.length, state.opp.handSize, opts?.maxNodes]); return { result: 'win', plan: null, nodes: 1 }; };
    grade(scen({ [STIFLE]: 1, Ponder: 3 }), [...PILE_A2], { solver, maxNodes: 1234 });
    assert.deepEqual(seen, [[0, 2, 1234], [1, 2, 1234]]);
  });

  test('throws without a deck estimate or a hand size', () => {
    assert.throws(() => grade(withOpp(setupA2(), { handSize: 2 }), [...PILE_A2]));
    assert.throws(() => grade(withOpp(setupA2(), { deckEstimate: { [STIFLE]: 1 } , handSize: 'x' }), [...PILE_A2]));
  });
});

// ---------------------------------------------------------------------------
// grade() with the real solver. Single-card verdicts are proved in tests/v2-counters.test.js:
//  A' + Stifle → no_win; A' + Spell Pierce → win (the A' line casts no noncreature spell);
//  P3' {U:5} + Spell Pierce → win; A' {U:3} + Daze → win; A' {U:3} + Daze ×2 → no_win.
// The P3' pair proof is next to its test.
describe('grade() with the real solver (exact)', () => {
  test("A' vs {Stifle, Spell Pierce, 2 others}, hand 2: pWin = P(no Stifle) = 1/2", () => {
    const g = grade(scen({ [STIFLE]: 1, [PIERCE]: 1, Ponder: 2 }), [...PILE_A2]);
    assert.equal(g.goldfish.result, 'win');
    assert.deepEqual(g.singles.map((x) => [x.card, x.wins]), [[PIERCE, true], [STIFLE, false]]);
    near(g.pWin, 1 / 2);
  });

  // P3' {U:5} (Brainstorm is required, see v2-counters header): Brainstorm + Oracle = 3 mana, 2 spare.
  // Daze alone (alt cost, their one Island): whichever spell it hits, pay 1 → 4 ≤ 5 → WIN.
  // Pierce alone ({U} from their one untapped land): only Brainstorm is a target; pay 2 → 5 ≤ 5 → WIN.
  // Both: Pierce on Brainstorm first (their land taps), I pay 2; the window reopens and Daze (returning that
  // tapped Island) hits Brainstorm or Oracle, I pay 1: 3 + 3 = 6 > 5; declining either counter loses a
  // needed spell → LOSE. P(both in a 2-card hand from 4) = 1/C(4,2) = 1/6 → pWin = 5/6.
  test("P3' {U:5} vs {Daze, Spell Pierce, 2 others}: the pair loses → 5/6", () => {
    const s = withOpp(setupP3(5), {
      handSize: 2, untapped: 1, total: 1, colors: 'U', deckEstimate: { [DAZE]: 1, [PIERCE]: 1, Ponder: 2 },
    });
    const g = grade(s, [...PILE_P3]);
    assert.deepEqual(g.singles.map((x) => x.wins), [true, true]);
    assert.deepEqual(g.pairs, [{ cards: [DAZE, PIERCE], wins: false }]);
    near(g.pWin, 5 / 6);
  });

  // A' {U:3}, two Islands: one Daze is paid with the spare U, two are not. P(two Dazes) = 1/6 → 5/6.
  test("A' {U:3} vs {Daze ×2, 2 others}: the same-card pair loses → 5/6", () => {
    const s = withOpp(setupA2({ manaPool: { U: 3 } }), {
      handSize: 2, untapped: 0, total: 2, colors: 'U', deckEstimate: { [DAZE]: 2, Ponder: 2 },
    });
    const g = grade(s, [...PILE_A2]);
    assert.deepEqual(g.singles.map((x) => [x.card, x.wins]), [[DAZE, true]]);
    assert.deepEqual(g.pairs, [{ cards: [DAZE, DAZE], wins: false }]);
    near(g.pWin, 5 / 6);
  });

  test('deterministic: the same input gives a deep-equal result', () => {
    const s = scen({ [STIFLE]: 1, [DAZE]: 1, Ponder: 2 });
    assert.deepEqual(grade(s, [...PILE_A2]), grade(s, [...PILE_A2]));
  });
});
