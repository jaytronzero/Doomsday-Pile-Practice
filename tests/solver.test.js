// Spec §9 solver + §11 canonical puzzles (all of them, with the stated results).
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { buildStartState, applyAction, status } from '../src/engine.js';
import { solve, explain } from '../src/solver.js';
import {
  ORACLE, WRAITH, SEA, DELTA, CHALICE, FLUTE, SILENCE, PILE_A,
  makeSetup, setupA, bf, pool,
  isCast, isCastPaid, isCycle, isResolve,
  findAction, act, apply1, replayPlan, planDepth, planBranches, planActions,
} from './helpers.js';

function expectWin(state, { depth } = {}) {
  const r = solve(state);
  assert.equal(r.result, 'win', `expected win, got ${r.result}`);
  assert.equal(typeof r.nodes, 'number');
  assert.ok(r.plan, 'a win has a plan');
  assert.ok(replayPlan(state, r.plan) >= 1);
  if (depth !== undefined) assert.equal(planDepth(r.plan), depth, 'shortest worst-case line');
  return r;
}

function expectNoWin(state) {
  const r = solve(state);
  assert.equal(r.result, 'no_win', `expected no_win, got ${r.result}`);
  assert.equal(typeof r.nodes, 'number');
  assert.ok(r.plan === undefined || r.plan === null, 'no plan unless the result is win');
  return r;
}

const withOpp = (...permanents) => setupA({ opponent: { permanents } });

// H / H2 setups (canonical deck assumed, see SPEC_QUESTIONS.md Q9).
const setupH = (turnsAhead) => makeSetup({
  hand: [WRAITH],
  battlefield: [bf(SEA, true), bf(SEA, true)],
  manaPool: {},
  lifeBeforeDoomsday: 20,
  turnsAhead,
});
const PILE_H = [WRAITH, WRAITH, ORACLE, 'Island', 'Island'];

// ---------------------------------------------------------------------------
describe('canonical puzzles (§11)', () => {
  test('A: win via cycling three Wraiths then Oracle (shortest line: 5 actions)', () => {
    expectWin(buildStartState(setupA(), [...PILE_A]), { depth: 5 });
  });

  test('B: life before 14 (→7) wins: 7→5→3→1', () => {
    expectWin(buildStartState(setupA({ lifeBeforeDoomsday: 14 }), [...PILE_A]));
  });

  test('B: life before 13 (→6) is no_win (third cycle would hit 0)', () => {
    const s = buildStartState(setupA({ lifeBeforeDoomsday: 13 }), [...PILE_A]);
    assert.equal(s.life, 6);
    expectNoWin(s);
  });

  test('B: life before 12 (→6) is no_win', () => {
    expectNoWin(buildStartState(setupA({ lifeBeforeDoomsday: 12 }), [...PILE_A]));
  });

  test('C: Deafening Silence is irrelevant (Oracle is a creature, cycling is not casting) → win', () => {
    expectWin(buildStartState(withOpp({ name: SILENCE }), [...PILE_A]), { depth: 5 });
  });

  test('D: Disruptor Flute naming Street Wraith → no_win', () => {
    expectNoWin(buildStartState(withOpp({ name: FLUTE, named: WRAITH }), [...PILE_A]));
  });

  test("E: Disruptor Flute naming Thassa's Oracle → no_win (UU+3 > pool)", () => {
    expectNoWin(buildStartState(withOpp({ name: FLUTE, named: ORACLE }), [...PILE_A]));
  });

  test('F: Chalice of the Void x=2 → no_win (Oracle countered)', () => {
    expectNoWin(buildStartState(withOpp({ name: CHALICE, x: 2 }), [...PILE_A]));
  });

  test('G: cast Oracle FIRST, cycle three times with the trigger pending, then resolve → win (driven by hand)', () => {
    let s = buildStartState(makeSetup({ hand: [ORACLE, WRAITH], manaPool: { U: 2 }, lifeBeforeDoomsday: 20 }), [...PILE_A]);
    s = act(s, isCastPaid(ORACLE, { U: 2 }));
    assert.equal(s.pendingTrigger, true);
    assert.equal(s.library.length, 5);
    s = act(s, isCycle(WRAITH)); // draw Wraith, lib 4, life 8
    s = act(s, isCycle(WRAITH)); // draw Wraith, lib 3, life 6
    s = act(s, isCycle(WRAITH)); // draw Island, lib 2, life 4
    assert.equal(s.library.length, 2);
    assert.equal(s.life, 4);
    assert.equal(s.pendingTrigger, true);
    const out = applyAction(s, findAction(s, isResolve));
    assert.equal(out.length, 1);
    assert.equal(status(out[0].state), 'win');
  });

  test('G: the solver also finds a win', () => {
    expectWin(buildStartState(makeSetup({ hand: [ORACLE, WRAITH], manaPool: { U: 2 }, lifeBeforeDoomsday: 20 }), [...PILE_A]));
  });

  test('H: turnsAhead 0 → no_win (no mana for Oracle this turn)', () => {
    expectNoWin(buildStartState(setupH(0), PILE_H));
  });

  test('H: turnsAhead 1 → win; the plan replays to a win (shortest line: 8 actions)', () => {
    // Minimum: 2 passes, the turn-1 draw removes 1 card, 2 cycles remove 2 more (lib 2),
    // 2 taps (pools empty on pass), cast, resolve = 8.
    expectWin(buildStartState(setupH(1), PILE_H), { depth: 8 });
  });

  test('H2: the draw step kills: draw Oracle, lib 4 > devotion 2 → no_win', () => {
    expectNoWin(buildStartState(makeSetup({
      hand: [],
      battlefield: [bf(SEA, true), bf(SEA, true)],
      manaPool: {},
      lifeBeforeDoomsday: 20,
      turnsAhead: 1,
    }), [ORACLE, 'Island', 'Island', 'Island', 'Island']));
  });

  const setupI = () => makeSetup({
    deck: { Doomsday: 1, Brainstorm: 1, Island: 2 },
    hand: ['Brainstorm'],
    manaPool: { U: 1 },
    lifeBeforeDoomsday: 20,
  });

  test('I: casting Brainstorm with a 2-card library is a loss', () => {
    const s = buildStartState(setupI(), ['Island', 'Island']);
    const out = applyAction(s, findAction(s, isCast('Brainstorm')));
    for (const o of out) assert.equal(status(o.state), 'loss');
  });

  test('I: the solver reports no_win', () => {
    expectNoWin(buildStartState(setupI(), ['Island', 'Island']));
  });
});

// ---------------------------------------------------------------------------
describe('solver behaviour (§9)', () => {
  test('a start state that is already lost is no_win', () => {
    expectNoWin(buildStartState(setupA({ lifeBeforeDoomsday: 1 }), [...PILE_A]));
  });

  test('deterministic: the same input gives the same plan', () => {
    const a = solve(buildStartState(setupH(1), PILE_H));
    const b = solve(buildStartState(setupH(1), PILE_H));
    assert.equal(a.result, 'win');
    assert.deepEqual(a.plan, b.plan);
    const s = buildStartState(setupA(), [...PILE_A]);
    assert.deepEqual(solve(s).plan, solve(s).plan);
  });

  test("'aborted' when the node limit is exceeded", () => {
    const r = solve(buildStartState(setupH(1), PILE_H), { maxNodes: 2 });
    assert.equal(r.result, 'aborted');
    assert.equal(typeof r.nodes, 'number');
    assert.ok(r.nodes > 2);
  });

  test('solve does not mutate its input', () => {
    const s = buildStartState(setupH(1), PILE_H);
    const snap = JSON.stringify(s);
    solve(s);
    assert.equal(JSON.stringify(s), snap);
  });

  test('explain(): one string per step with a "Turn 0 (Doomsday turn)" header', () => {
    const { plan } = solve(buildStartState(setupA(), [...PILE_A]));
    const lines = explain(plan);
    assert.ok(Array.isArray(lines));
    assert.ok(lines.every((l) => typeof l === 'string'));
    assert.ok(lines.length >= planActions(plan).length, 'at least one line per step');
    assert.ok(lines.some((l) => l.includes('Turn 0 (Doomsday turn)')), lines.join('\n'));
  });

  test("explain(): a multi-turn plan has \"Opponent's turn\" and \"Turn 1\" headers", () => {
    const { plan } = solve(buildStartState(setupH(1), PILE_H));
    const lines = explain(plan);
    assert.ok(lines.some((l) => l.includes("Opponent's turn")), lines.join('\n'));
    assert.ok(lines.some((l) => l.includes('Turn 1')), lines.join('\n'));
  });
});

// ---------------------------------------------------------------------------
// BRANCH PUZZLE (designed for this suite): a fetch shuffle is unavoidable and every ordering wins.
//
// Setup: canonical deck. Hand [Oracle, Wraith, Wraith]. Battlefield: Island (untapped),
// Polluted Delta (untapped). Pool empty. Land already played (so drawn lands are useless).
// Life 20 → 10. turnsAhead 0. Pile [Swamp, Swamp, Underground Sea, Island, Swamp].
// Pool check: Swamp 4 in pool (3 piled), Sea 4, Island 3 (one on the battlefield), Wraith 2
// in pool (2 in hand; none piled), Delta 3.
//
// Why a shuffle is unavoidable: Oracle needs {U}{U}. U sources: the Island (1), and a land
// fetched by Delta (Island or Underground Sea; both enter untapped). Nothing else makes U
// (no Petal/LED/Ritual in hand or pile, no land drop). So every win cracks Delta for a
// U land, which shuffles the library.
// Why the shuffle has ≥2 distinct orderings in every line: cycles draw from the top
// (Swamp, Swamp), so whatever is left when Delta is cracked still holds the other U land
// and at least one Swamp. Enumerated (c = cycles before the crack):
//   0 cycles before: fetch Island → {S,S,Sea,S} (4 orders); fetch Sea → {S,S,I,S} (4)
//   1 cycle  before (drew Swamp): fetch Island → {S,Sea,S} (3); fetch Sea → {S,I,S} (3)
//   2 cycles before (drew S,S):   fetch Island → {Sea,S} (2);   fetch Sea → {I,S} (2)
// Why every ordering wins: library after the fetch = 4 − c cards (c cycles so far); the
// remaining 2 − c cycles bring it to 2 regardless of order. Life 10 −1 (fetch) −4 (cycles)
// = 5 > 0. Tap Island + fetched land for UU, cast Oracle, resolve: devotion 2 ≥ 2 → win.
// Shortest line: 2 cycles + crack + 2 taps + cast + resolve = 7 actions (worst case).
// ---------------------------------------------------------------------------
describe('branch plan: a fetch shuffle that must win on every ordering', () => {
  const setupBranch = () => makeSetup({
    hand: [ORACLE, WRAITH, WRAITH],
    battlefield: [bf('Island'), bf(DELTA)],
    manaPool: {},
    lifeBeforeDoomsday: 20,
    landPlayedThisTurn: true,
    turnsAhead: 0,
  });
  const PILE_BRANCH = ['Swamp', 'Swamp', SEA, 'Island', 'Swamp'];

  test('win with a branch node whose outcomes all win', () => {
    const s = buildStartState(setupBranch(), PILE_BRANCH);
    const r = expectWin(s, { depth: 7 });
    const branches = planBranches(r.plan);
    assert.ok(branches.length >= 1, 'the plan must contain a branch');
    for (const b of branches) {
      assert.equal(b.action.type, 'crack_fetch');
      assert.ok(b.outcomes.length >= 2);
      for (const o of b.outcomes) assert.ok(typeof o.label === 'string' && o.label.length > 0);
    }
    assert.ok(replayPlan(s, r.plan) >= 2, 'at least two winning leaves');
  });

  test('explain() indents branches', () => {
    const { plan } = solve(buildStartState(setupBranch(), PILE_BRANCH));
    const lines = explain(plan);
    assert.ok(lines.some((l) => /^\s+\S/.test(l)), lines.join('\n'));
  });

  test('control: with Flute on Polluted Delta there is no U source → no_win', () => {
    expectNoWin(buildStartState({ ...setupBranch(), opponent: { permanents: [{ name: FLUTE, named: DELTA }] } }, PILE_BRANCH));
  });
});
