// Custom Doomsday puzzles designed for this suite. Every result asserted here is
// proven by hand in the comment above the test (life / library / mana bookkeeping per
// step for wins; an exhaustive argument for every no_win).
// All use the canonical §11 deck unless stated.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { buildStartState, status } from '../src/engine.js';
import { solve } from '../src/solver.js';
import {
  ORACLE, WRAITH, SEA, LED, CHALICE, SILENCE,
  makeSetup, bf, replayPlan, planDepth,
} from './helpers.js';

function expectWin(state, { depth } = {}) {
  const r = solve(state);
  assert.equal(r.result, 'win', `expected win, got ${r.result}`);
  assert.ok(replayPlan(state, r.plan) >= 1);
  if (depth !== undefined) assert.equal(planDepth(r.plan), depth);
  return r;
}
function expectNoWin(state) {
  const r = solve(state);
  assert.equal(r.result, 'no_win', `expected no_win, got ${r.result}`);
  return r;
}

// ===========================================================================
// PUZZLE 1 — "Unearth the countered Oracle" (Chalice of the Void x=2)
//
// Setup: hand [Oracle, Unearth, Street Wraith], pool {U:2, B:1}, life 20 → 10,
// turnsAhead 0, opponent: Chalice x=2. Pile [Wraith, Wraith, Island, Island, Island].
// Pool check: Wraith 4−1 = 3 (2 piled), Island 4 (3 piled).
//
// Winning line (6 actions):
//  1. Cast Oracle paying {U:2}. MV 2 == x → countered → Oracle to graveyard. Pool {B:1}. No trigger.
//  2. Cast Unearth paying {B:1} (MV 1 ≠ 2, resolves), target Oracle (MV 2 ≤ 3) → Oracle enters,
//     pendingTrigger. Pool {}. Graveyard [Doomsday, Oracle→gone, Unearth].
//  3. Cycle Wraith: life 10→8, draw Wraith, lib 4.
//  4. Cycle Wraith: life 8→6, draw Wraith, lib 3.
//  5. Cycle Wraith: life 6→4, draw Island, lib 2.
//  6. resolve_oracle: devotion 2 ≥ 2 → WIN.
// Minimality (depth 6): Oracle can only reach the battlefield via cast (countered) then
// Unearth = 2 actions; the library must drop from 5 to ≤ 2 and the only reducers are
// Wraith cycles (1 each; Unearth cycling would consume the Unearth) = 3; plus resolve = 6.
// ===========================================================================
const setupP1 = (extraOpp = []) => makeSetup({
  hand: [ORACLE, 'Unearth', WRAITH],
  manaPool: { U: 2, B: 1 },
  lifeBeforeDoomsday: 20,
  turnsAhead: 0,
  opponent: { permanents: [{ name: CHALICE, x: 2 }, ...extraOpp] },
});
const PILE_P1 = [WRAITH, WRAITH, 'Island', 'Island', 'Island'];

// PUZZLE 1b — same plus Deafening Silence (noncreatureCast already 1 from Doomsday).
// NO WIN, proof: a win needs Oracle on the battlefield. Casting Oracle (a creature, so Silence
// allows it) is countered by Chalice 2. The only other way in is Unearth, a noncreature spell,
// which Silence forbids on turn 0 because Doomsday was already cast this turn; turnsAhead 0
// means there is no later turn. The pile holds only Wraiths and Islands, so nothing else can
// be found. Oracle never enters → no trigger → no win.
describe('custom puzzle 1: Unearth the Chalice-countered Oracle', () => {
  test('Chalice 2: cast Oracle into the counter, Unearth it, cycle ×3 with the trigger pending → win in 6', () => {
    expectWin(buildStartState(setupP1(), PILE_P1), { depth: 6 });
  });

  test('Chalice 2 + Deafening Silence: Unearth is uncastable on the Doomsday turn → no_win', () => {
    expectNoWin(buildStartState(setupP1([{ name: SILENCE }]), PILE_P1));
  });
});

// ===========================================================================
// PUZZLE 2 — "LED is a trap"
//
// Setup: hand [Oracle, Wraith, Wraith, Wraith], battlefield [Lion's Eye Diamond], pool {U:1},
// life 20 → 10, turnsAhead 0, pile [Island, Swamp, Swamp, Swamp, Swamp].
// Pool check: Wraith 4−3 = 1 (none piled), Island 4 (1 piled), Swamp 4 (4 piled).
//
// 2a: landPlayedThisTurn = true → NO WIN. Proof: Oracle needs {U}{U} while it is in hand.
// U available: the floating U (1) and LED (3 of one color). LED's cost discards the whole
// hand, including Oracle, and nothing can return Oracle to hand afterwards (no Brainstorm,
// no Unearth; all cyclers are discarded too). Drawn Island/Swamps can't be played (land
// already played). No other mana source exists, so Oracle is never cast → no trigger → no win.
//
// 2b: landPlayedThisTurn = false → WIN. Line:
//  1. Cycle Wraith: life 10→8, draw Island, lib [S,S,S,S] (4).
//  2. Play Island.  3. Tap Island for U: pool {U:2}.
//  4. Cast Oracle {U:2}: pool {}, trigger pending.
//  5. Cycle Wraith: life 8→6, draw Swamp, lib 3.
//  6. Cycle Wraith: life 6→4, draw Swamp, lib 2.
//  7. resolve_oracle: devotion 2 ≥ 2 → WIN (LED untouched).
// ===========================================================================
const setupP2 = (landPlayed) => makeSetup({
  hand: [ORACLE, WRAITH, WRAITH, WRAITH],
  battlefield: [bf(LED)],
  manaPool: { U: 1 },
  lifeBeforeDoomsday: 20,
  landPlayedThisTurn: landPlayed,
  turnsAhead: 0,
});
const PILE_P2 = ['Island', 'Swamp', 'Swamp', 'Swamp', 'Swamp'];

describe("custom puzzle 2: Lion's Eye Diamond can't pay for Oracle", () => {
  test('land already played: LED would discard Oracle → no_win', () => {
    expectNoWin(buildStartState(setupP2(true), PILE_P2));
  });

  test('land drop available: cycle into Island, play it, Oracle, two more cycles → win', () => {
    expectWin(buildStartState(setupP2(false), PILE_P2));
  });
});

// ===========================================================================
// PUZZLE 3 — "Brainstorm saves a cycle"
//
// Setup: hand [Oracle, Brainstorm], pool {U:3}, turnsAhead 0, pile [Wraith, Wraith, Island,
// Island, Island]. Pool check: Wraith 4, Island 4, Brainstorm 3 (none piled).
//
// 3a: life before 10 → 5 → WIN. Line:
//  1. Cast Brainstorm {U:1}: pool {U:2}; draw Wraith, Wraith, Island →
//     hand [Oracle, Wraith, Wraith, Island], lib [Island, Island].
//  2. Put back Wraith (top) then Island: hand [Oracle, Wraith], lib [Wraith, Island, Island, Island] (4).
//  3. Cycle Wraith: life 5→3, draw Wraith, lib 3.
//  4. Cycle Wraith: life 3→1, draw Island, lib 2.
//  5. Cast Oracle {U:2}: pool {}.
//  6. resolve_oracle: devotion 2 ≥ 2 → WIN (at 1 life).
//
// 3b: life before 8 → 4 → NO WIN. Proof: devotion can be at most 2 (one Oracle reachable; the
// other copy is exiled), so the library (5) must shrink by ≥ 3 before the trigger resolves.
// Turn 0 only (turnsAhead 0), so the only library reducers are: the single Brainstorm (draw 3,
// put back 2 → net −1; no other Brainstorm exists in hand or pile) and Wraith cycles (−1 each,
// 2 life each, legal only at life ≥ 2). At life 4 one cycle leaves 2; a second cycle sets life
// to 0 → loss. Wraiths start in the library, so cycling only follows Brainstorm. Max shrink
// without losing = 1 + 1 = 2 → library ≥ 3 > 2. Playing an Island doesn't touch the library;
// a non-winning Oracle resolution keeps the library size. → no_win.
// ===========================================================================
const setupP3 = (lifeBeforeDoomsday) => makeSetup({
  hand: [ORACLE, 'Brainstorm'],
  manaPool: { U: 3 },
  lifeBeforeDoomsday,
  turnsAhead: 0,
});
const PILE_P3 = [WRAITH, WRAITH, 'Island', 'Island', 'Island'];

describe('custom puzzle 3: Brainstorm nets −1 library and saves 2 life', () => {
  test('life 10 → 5: Brainstorm, keep Oracle + Wraith, two cycles → win at 1 life', () => {
    const s = buildStartState(setupP3(10), PILE_P3);
    assert.equal(s.life, 5);
    expectWin(s);
  });

  test('life 8 → 4: only one cycle is survivable → no_win', () => {
    const s = buildStartState(setupP3(8), PILE_P3);
    assert.equal(s.life, 4);
    expectNoWin(s);
  });
});

// ===========================================================================
// PUZZLE 4 — "Ritual first turns on Flow State's second card"
//
// Setup: hand [Dark Ritual, Flow State, Wraith], battlefield [Island, Island, Underground Sea]
// (untapped), pool {B:1}, life before 6 → 3, turnsAhead 0,
// pile [Island, Swamp, Oracle, Wraith, Wraith].
// Pool check: Island 4−2 = 2 (1 piled), Swamp 4, Oracle 2 (1 piled), Wraith 3 (2 piled).
//
// 4a: WIN. Line:
//  1. Cast Dark Ritual {B:1}: pool {B:3}. Graveyard [Doomsday (sorcery), Dark Ritual (instant)].
//  2. Tap Island: pool {B:3, U:1}.
//  3. Cast Flow State {U:1, B:1}: pool {B:2}. Top 3 = [Island, Swamp, Oracle]; instant + sorcery
//     in the graveyard → take TWO: Oracle + Island; Swamp to the bottom. lib [Wraith, Wraith, Swamp] (3).
//  4. Cycle Wraith (from hand): life 3→1, draw Wraith, lib [Wraith, Swamp] (2).
//  5. Tap Island, 6. tap Underground Sea for U: pool {B:2, U:2}.
//  7. Cast Oracle {U:2}.  8. resolve_oracle: devotion 2 ≥ 2 → WIN.
//
// 4b: the same WITHOUT Dark Ritual in hand (hand [Flow State, Wraith]; pool check: Ritual
// simply stays in the pool) → NO WIN. Proof: devotion ≤ 2 (one reachable Oracle), so the
// library must shrink from 5 to ≤ 2 (−3) on turn 0. Reducers: Flow State once (no other copy
// reachable: none in the pile); its two-card mode needs an instant in the graveyard and there
// is no instant anywhere (hand: Flow State, Wraith; library: Island, Swamp, Oracle, Wraith,
// Wraith), so it nets −1. Wraith cycles: −1 each, need life ≥ 2; life 3 → one cycle → 1, so no
// second cycle (whichever Wraith). Total −2 → library ≥ 3 > 2. Land drops don't touch the
// library and there are no other draw effects. → no_win.
// ===========================================================================
const setupP4 = (hand) => makeSetup({
  hand,
  battlefield: [bf('Island'), bf('Island'), bf(SEA)],
  manaPool: { B: 1 },
  lifeBeforeDoomsday: 6,
  turnsAhead: 0,
});
const PILE_P4 = ['Island', 'Swamp', ORACLE, WRAITH, WRAITH];

describe('custom puzzle 4: Flow State finds Oracle', () => {
  test('Dark Ritual first → Flow State takes two (Oracle + a land) → one cycle → win at 1 life', () => {
    const s = buildStartState(setupP4(['Dark Ritual', 'Flow State', WRAITH]), PILE_P4);
    assert.equal(s.life, 3);
    expectWin(s);
  });

  test('without an instant for the graveyard, Flow State takes only one → no_win', () => {
    expectNoWin(buildStartState(setupP4(['Flow State', WRAITH]), PILE_P4));
  });
});

// Sanity: every custom start state is a legal, ongoing position.
test('all custom puzzle start states build and are ongoing', () => {
  const states = [
    buildStartState(setupP1(), PILE_P1),
    buildStartState(setupP1([{ name: SILENCE }]), PILE_P1),
    buildStartState(setupP2(true), PILE_P2),
    buildStartState(setupP2(false), PILE_P2),
    buildStartState(setupP3(10), PILE_P3),
    buildStartState(setupP3(8), PILE_P3),
    buildStartState(setupP4(['Dark Ritual', 'Flow State', WRAITH]), PILE_P4),
    buildStartState(setupP4(['Flow State', WRAITH]), PILE_P4),
  ];
  for (const s of states) assert.equal(status(s), 'ongoing');
});
