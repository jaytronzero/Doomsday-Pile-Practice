// SPEC_V2 §5.1–§5.3 general adversary rules (SPEC_V2_API §7, §8.1, §8.2): windows, the "do nothing" branch,
// v1 equivalence when the adversary has no option, one use per card, opponent mana, W-oracle priority,
// purity, solver determinism with adversary branches.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { buildStartState, legalActions, applyAction, status } from '../src/engine.js';
import { solve, explain } from '../src/solver.js';
import {
  ORACLE, WRAITH, isCastPaid, isCycle, isPass, isResolve, hasAction, actionKey, deepFreeze,
  planBranches, replayPlan,
  withOpp, build, expectWin, outcomesOf, quiet, quietState, using, advOf, assertDistinctLabels,
  setupA2, PILE_A2, setupH, PILE_H, STIFLE, BOLT, DAZE,
} from './v2-helpers.js';

const A2 = (hand, o = {}, over = {}) => build(withOpp(setupA2(over), { hand, ...o }), PILE_A2);

describe('no adversary option → exactly v1 behaviour', () => {
  // Same board, once with no opponent data at all and once with lands/colours/hand size but an empty hand.
  const plain = () => build(setupA2(), PILE_A2);
  const rich = () => A2([], { handSize: 7, untapped: 3, total: 4, colors: 'WUBRG', life: 13 });
  test('same legal actions, same outcomes and labels, no adversary entries', () => {
    const a = plain();
    const b = rich();
    assert.deepEqual(legalActions(b).map(actionKey), legalActions(a).map(actionKey));
    for (const act of legalActions(a)) {
      const oa = applyAction(a, act);
      const ob = applyAction(b, act);
      assert.deepEqual(ob.map((o) => o.label), oa.map((o) => o.label), act.desc);
      for (const o of ob) assert.equal(advOf(o).length, 0);
    }
  });
  test('the same holds after the Oracle is cast (W-oracle)', () => {
    const a = quietState(outcomesOf(plain(), isCastPaid(ORACLE, { U: 2 })));
    const b = quietState(outcomesOf(rich(), isCastPaid(ORACLE, { U: 2 })));
    assert.deepEqual(applyAction(b, legalActions(b).find(isResolve)).map((o) => o.label),
      applyAction(a, legalActions(a).find(isResolve)).map((o) => o.label));
  });
});

describe('windows', () => {
  test('a window always has exactly one "do nothing" branch and distinct labels', () => {
    const outs = outcomesOf(A2([STIFLE, BOLT], { handSize: 2, untapped: 2, colors: 'UR' }), isCycle(WRAITH));
    assertDistinctLabels(outs);
    const q = quiet(outs);
    assert.equal(q.length, 1);
    assert.equal(q[0].state.library.length, 4, 'nothing happened: the cycle drew');
    assert.deepEqual([...q[0].state.opp.hand].sort(), [BOLT, STIFLE].sort());
  });

  test('at W-ability, after one action the window reopens (Bolt me, then Stifle the same cycle)', () => {
    const outs = outcomesOf(A2([STIFLE, BOLT], { handSize: 2, untapped: 2, colors: 'UR' }), isCycle(WRAITH));
    const both = outs.filter((o) => {
      const cards = advOf(o).map((e) => e.card);
      return cards.includes(BOLT) && cards.includes(STIFLE);
    });
    assert.ok(both.length >= 1);
    for (const o of both) {
      assert.deepEqual(o.state.opp.hand, []);
      assert.equal(o.state.opp.manaAvailable, 0);
    }
  });

  test('each held card is used at most once; opponent mana is spent', () => {
    const s = using(outcomesOf(A2([BOLT], { untapped: 1, colors: 'R' }), isCycle(WRAITH)), BOLT, 'damage', 'me')[0].state;
    assert.deepEqual(s.opp.hand, []);
    assert.equal(s.opp.handSize, 0);
    assert.equal(s.opp.spellsCast, 1);
    assert.equal(s.opp.manaAvailable, 0);
    const next = outcomesOf(s, isCycle(WRAITH));
    assert.equal(next.length, 1);
  });

  test("opponent mana resets to lands.total at the start of each turn", () => {
    let s = using(outcomesOf(A2([STIFLE], { untapped: 1, total: 3, colors: 'U' }, { turnsAhead: 1 }), isCycle(WRAITH)), STIFLE)[0].state;
    assert.equal(s.opp.manaAvailable, 0);
    s = quietState(outcomesOf(s, isPass));
    assert.equal(s.opp.manaAvailable, 3);
    s = quietState(outcomesOf(s, isPass));
    assert.equal(s.opp.manaAvailable, 3);
  });

  test('W-oracle: after the adversary acts the trigger stays and I get priority; resolving again reopens W-oracle', () => {
    const pending = quietState(outcomesOf(A2([BOLT], { untapped: 1, colors: 'R' }), isCastPaid(ORACLE, { U: 2 })));
    // Library is 5 here: resolving now would not win (X = 2 < 5).
    const me = using(outcomesOf(pending, isResolve), BOLT, 'damage', 'me')[0].state;
    assert.equal(me.pendingTrigger, true);
    assert.equal(me.life, pending.life - 3);
    assert.ok(hasAction(me, isCycle(WRAITH)), 'instant-speed window again');
    assert.ok(hasAction(me, isResolve));
    // Cycle twice more (no adversary left), then resolve: lib 2 ≤ 2 → win.
    let s = me;
    for (let i = 0; i < 3; i++) s = quietState(outcomesOf(s, isCycle(WRAITH)));
    assert.equal(s.library.length, 2);
    const fin = outcomesOf(s, isResolve);
    assert.equal(fin.length, 1);
    assert.equal(status(fin[0].state), 'win');
  });
});

describe('purity and the solver with an adversary', () => {
  test('applyAction never mutates a deep-frozen input with adversary options', () => {
    const s = deepFreeze(A2([STIFLE, BOLT, DAZE], { handSize: 3, untapped: 2, total: 2, colors: 'UR' }));
    const snap = JSON.stringify(s);
    for (const a of legalActions(s)) applyAction(s, a);
    assert.equal(JSON.stringify(s), snap);
  });

  // A' with {U:3} + Daze: WIN (tests/v2-counters.test.js proof). The plan must branch on the adversary.
  test('solve: deterministic, replayable, and the plan branches on the adversary choice', () => {
    const s = A2([DAZE], { total: 1, colors: 'U' }, { manaPool: { U: 3 } });
    const a = expectWin(s);
    const b = solve(s);
    assert.deepEqual(a.plan, b.plan);
    assert.ok(planBranches(a.plan).length >= 1);
    assert.ok(replayPlan(s, a.plan) >= 2);
    const lines = explain(a.plan);
    assert.ok(Array.isArray(lines) && lines.length > 0 && lines.every((l) => typeof l === 'string'));
  });

  test("solve still reports 'aborted' over the node limit", () => {
    const r = solve(build(withOpp(setupH(), { hand: [STIFLE, BOLT], handSize: 2, untapped: 2, colors: 'UR' }), PILE_H), { maxNodes: 3 });
    assert.equal(r.result, 'aborted');
  });

  test('solve does not mutate its input', () => {
    const s = A2([STIFLE], { untapped: 1, colors: 'U' });
    const snap = JSON.stringify(s);
    solve(s);
    assert.equal(JSON.stringify(s), snap);
    assert.ok(buildStartState);
  });
});
