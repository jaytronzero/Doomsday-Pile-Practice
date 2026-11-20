// SPEC_V2 §4 the clock (SPEC_V2_API §5 step 4).
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { status, legalActions } from '../src/engine.js';
import {
  WRAITH, THALIA, isPass, isCycle, hasAction,
  withOpp, perm, build, expectWin, expectNoWin, outcomesOf, quietState,
  setupH, PILE_H, NARSET, BLOOD_MOON, GUIDE,
} from './v2-helpers.js';

const H = (permanents, over) => build(withOpp(setupH(over), { permanents }), PILE_H);
const pass = (s) => quietState(outcomesOf(s, isPass, 'pass'));

describe('attack damage at the start of each opponent turn', () => {
  // OPP_CARDS: Murktide Regent power 3; Thalia 2; Goblin Guide 2; Delver of Secrets 1; Nethergoyf '*'.
  test('printed power is used when the scenario gives none (Murktide Regent 3/3)', () => {
    const s = pass(H([perm('Murktide Regent')]));
    assert.equal(s.phase, 'opp');
    assert.equal(s.life, 10 - 3);
  });

  test('the scenario power overrides the printed one (Murktide with counters: 6)', () => {
    assert.equal(pass(H([perm('Murktide Regent', { power: 6, counters: 3 })])).life, 10 - 6);
  });

  test('several attackers add up; tapped creatures attack too (they untap first)', () => {
    const s = pass(H([perm(THALIA), perm(GUIDE, { tapped: true }), perm('Delver of Secrets', { power: 3 })]));
    assert.equal(s.life, 10 - (2 + 2 + 3));
  });

  test('variable power without a scenario value counts 0 (and buildStartState warned)', () => {
    const s0 = H([perm('Nethergoyf')]);
    assert.ok(s0.warnings.some((w) => w.includes('Nethergoyf')));
    assert.equal(pass(s0).life, 10);
    assert.equal(pass(H([perm('Nethergoyf', { power: 4 })])).life, 10 - 4);
  });

  test('an unknown permanent attacks only if the scenario gives it a power', () => {
    assert.equal(pass(H([perm('Mystery Beast', { power: 3 })])).life, 10 - 3);
    assert.equal(pass(H([perm('Mystery Beast')])).life, 10);
  });

  test('non-creatures never attack (planeswalker, enchantment)', () => {
    assert.equal(pass(H([perm(NARSET), perm(BLOOD_MOON)])).life, 10);
  });

  test('damage happens on every opponent turn', () => {
    let s = H([perm('Murktide Regent', { power: 2 })], { turnsAhead: 2 });
    s = pass(s); // opp turn after turn 0: 10 → 8
    assert.equal(s.life, 8);
    s = pass(s); // my turn 1
    s = pass(s); // opp turn after turn 1: 8 → 6
    assert.equal(s.phase, 'opp');
    assert.equal(s.life, 6);
  });

  test("death on the opponent's turn: life 4, 4 power → loss, no actions", () => {
    const s = pass(H([perm('Murktide Regent', { power: 4 })], { lifeBeforeDoomsday: 8 }));
    assert.equal(s.life, 0);
    assert.equal(status(s), 'loss');
    assert.deepEqual(legalActions(s), []);
  });

  test('after combat, cycling needs life ≥ 2: life 1 → no cycle', () => {
    const s = pass(H([perm('Murktide Regent', { power: 9 })]));
    assert.equal(s.life, 1);
    assert.ok(!hasAction(s, isCycle(WRAITH)));
  });
});

// H (v1 canonical, turnsAhead 1): hand [Wraith], two tapped Seas, life 20 → 10, pile [W, W, O, I, I].
// The only library reducers are Wraith cycles (2 life each) and the turn-1 draw. Oracle can't be cast before
// turn 1 (no mana on turn 0; sorcery speed). Resolution on turn 1 needs lib ≤ 2 (devotion 2): from 5, the draw
// step gives −1, so ≥ 2 cycles = ≥ 4 life. One opponent turn → the clock C hits once.
// - C = 5 → WIN: cycle twice on turn 0 (10 → 8 → 6; draws W, W; lib [O, I, I]); combat 6 → 1; turn 1 draw
//   Oracle (lib 2); Seas UU; Oracle; resolve 2 ≥ 2. (v1 cross-check: H at life 5 with no clock wins.)
// - C = 6 → NO WIN: any line loses ≥ 4 + 6 = 10 = all my life before turn-1 main → life 0 → loss.
//   (v1 cross-check: H at life 4 with no clock is no_win.)
describe('the clock changes verdicts (interaction with cycling life payments)', () => {
  test('H + 5 power → win; H + 6 power → no_win', () => {
    expectWin(H([perm('Murktide Regent', { power: 5 })]));
    expectNoWin(H([perm('Murktide Regent', { power: 6 })]));
  });
  test('printed Murktide (3) → win; Nethergoyf with no power (0) → win; Nethergoyf power 6 → no_win', () => {
    expectWin(H([perm('Murktide Regent')]));
    expectWin(H([perm('Nethergoyf')]));
    expectNoWin(H([perm('Nethergoyf', { power: 6 })]));
  });
  test('an unknown permanent with power 6 kills H; without power it is ignored', () => {
    expectNoWin(H([perm('Mystery Beast', { power: 6 })]));
    expectWin(H([perm('Mystery Beast')]));
  });
});
