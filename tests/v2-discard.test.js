// SPEC_V2 §5.2 W-oppturn and §5.4 discard (SPEC_V2_API §8.3, §8.6: pendingOppSpell / resolve_opp_spell).
//
// D puzzle: hand [Oracle, Wraith], two TAPPED Underground Seas, pool empty, turnsAhead 1, pile
// [W, W, I, I, I], canonical deck. Goldfish (v1-checked):
//  - life 20 → 10: WIN. Turn 0: cycle twice (draw W, W; lib [I, I, I]; life 6). Turn 1: draw I (lib 2); Seas
//    → UU; Oracle; resolve 2 ≥ 2.
//  - life 12 → 6: WIN the same way at life 2. Life 8 → 4: no_win (2 cycles needed, 4 life).
// Key fact for every discard proof: Oracle can't be cast before turn 1 (no mana on turn 0: Seas tapped, pool
// empty; the only possible turn-0 mana is one Island drawn by the 3rd cycle and played = 1 U < UU; Oracle is a
// creature, so never castable on the opponent's turn). So Oracle IS in my hand during W-oppturn; there is one
// reachable Oracle and no Unearth, so discarding it → NO WIN.
// Turn-1 reduction count: lib 5 → ≤ 2 needs the draw step + 2 cycles (4 life): no other draw effect exists.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { legalActions, applyAction } from '../src/engine.js';
import {
  ORACLE, WRAITH, isPass, isCycle, isCastPaid, hasAction, sameMultiset,
  withOpp, build, expectWin, expectNoWin, outcomesOf, quiet, quietState, using, advOf, isResolveOpp,
  setupD, PILE_D, TSEIZE, DURESS, INQ, UNMASK, THERAPY, BRUTALITY,
} from './v2-helpers.js';

const D = (hand, o = {}, over = {}) => build(withOpp(setupD(over), { hand, ...o }), PILE_D);
const passOuts = (s) => outcomesOf(s, isPass, 'pass');
const resolveOpp = (s) => applyAction(s, legalActions(s).find(isResolveOpp));
const discarded = (outs) => outs.flatMap((o) => advOf(o).filter((e) => e.mode === 'discard').map((e) => e.target)).sort();

// "Thoughtseize": "Target player reveals their hand. You choose a nonland card from it. That player discards
// that card. You lose 2 life."
describe('Thoughtseize', () => {
  test("cast at the start of their turn → pendingOppSpell; I may respond; then they pick any nonland card", () => {
    const outs = passOuts(D([TSEIZE], { total: 1, colors: 'B' }));
    assert.equal(quiet(outs).length, 1);
    const t = using(outs, TSEIZE, 'cast');
    assert.equal(t.length, 1);
    const s = t[0].state;
    assert.equal(s.pendingOppSpell?.card, TSEIZE);
    assert.equal(s.opp.manaAvailable, 0);
    assert.ok(hasAction(s, isCycle(WRAITH)), 'instant-speed response');
    assert.ok(hasAction(s, isResolveOpp));
    assert.ok(!hasAction(s, isPass), 'no pass while their spell is on the stack');
    const r = resolveOpp(s);
    assert.deepEqual(discarded(r), [WRAITH, ORACLE].sort());
    const lostOracle = r.find((o) => advOf(o).some((e) => e.target === ORACLE)).state;
    assert.ok(!lostOracle.hand.includes(ORACLE));
    assert.ok(lostOracle.graveyard.includes(ORACLE));
    assert.equal(lostOracle.opp.life, 18);
    assert.equal(lostOracle.pendingOppSpell, null);
  });
  test('responding: cycling with Thoughtseize on the stack draws before it resolves', () => {
    const s = using(passOuts(D([TSEIZE], { total: 1, colors: 'B' })), TSEIZE)[0].state;
    const c = quietState(outcomesOf(s, isCycle(WRAITH)));
    assert.equal(c.library.length, 4);
    assert.equal(c.pendingOppSpell?.card, TSEIZE);
  });
  test('sorcery speed: never on my turn', () => {
    const s = D([TSEIZE], { total: 1, colors: 'B' }, { manaPool: { U: 2 } });
    assert.equal(using(outcomesOf(s, isCastPaid(ORACLE, { U: 2 })), TSEIZE).length, 0);
    assert.equal(using(outcomesOf(s, isCycle(WRAITH)), TSEIZE).length, 0);
  });
  // D + Thoughtseize → NO WIN (key fact above: Oracle is in hand at W-oppturn and gets taken).
  test('verdicts', () => {
    expectWin(D([]));
    expectNoWin(D([TSEIZE], { total: 1, colors: 'B' }));
  });
});

// "Duress": "Target opponent reveals their hand. You choose a noncreature, nonland card from it. That player
// discards that card."
describe('Duress', () => {
  test('Oracle and Street Wraith are creatures: nothing to take', () => {
    const s = using(passOuts(D([DURESS], { total: 1, colors: 'B' })), DURESS)[0].state;
    const r = resolveOpp(s);
    assert.equal(r.length, 1);
    assert.deepEqual(discarded(r), []);
    sameMultiset(r[0].state.hand, [ORACLE, WRAITH]);
  });
  // D + Duress → WIN: whatever my line, at W-oppturn my hand holds only creatures (Oracle, Wraiths) and maybe
  //   an Island (a land): Duress takes nothing; the goldfish line goes on.
  test('verdict', () => expectWin(D([DURESS], { total: 1, colors: 'B' })));
});

// "Inquisition of Kozilek": "Target player reveals their hand. You choose a nonland card from it with mana
// value 3 or less. That player discards that card."
describe('Inquisition of Kozilek', () => {
  test('takes Oracle (MV 2), never Street Wraith (MV 5)', () => {
    const s = using(passOuts(D([INQ], { total: 1, colors: 'B' })), INQ)[0].state;
    assert.deepEqual(discarded(resolveOpp(s)), [ORACLE]);
  });
  test('verdict', () => expectNoWin(D([INQ], { total: 1, colors: 'B' })));
});

// "Unmask": "You may exile a black card from your hand rather than pay this spell's mana cost.\nTarget player
// reveals their hand. You choose a nonland card from it. That player discards that card."
describe('Unmask', () => {
  test('free with hand size ≥ 2 (black card pitched), takes any nonland card', () => {
    const outs = passOuts(D([UNMASK], { handSize: 2, colors: 'B' }));
    const u = using(outs, UNMASK, 'cast');
    assert.equal(u.length, 1);
    assert.equal(u[0].state.opp.handSize, 0);
    assert.deepEqual(discarded(resolveOpp(u[0].state)), [WRAITH, ORACLE].sort());
    assert.equal(using(passOuts(D([UNMASK], { handSize: 1, colors: 'B' })), UNMASK).length, 0);
  });
  test('verdict', () => expectNoWin(D([UNMASK], { handSize: 2, colors: 'B' })));
});

// "Cabal Therapy": "Choose a nonland card name. Target player reveals their hand and discards all cards with
// that name.\nFlashback—Sacrifice a creature. ..."
describe('Cabal Therapy', () => {
  test('naming Street Wraith takes every copy', () => {
    const s = using(passOuts(D([THERAPY], { total: 1, colors: 'B' }, { hand: [ORACLE, WRAITH, WRAITH] })), THERAPY)[0].state;
    const r = resolveOpp(s);
    assert.deepEqual(discarded(r), [WRAITH, ORACLE].sort());
    const w = r.find((o) => advOf(o).some((e) => e.target === WRAITH)).state;
    assert.deepEqual(w.hand, [ORACLE]);
  });
  test('verdict', () => expectNoWin(D([THERAPY], { total: 1, colors: 'B' })));
});

// "Collective Brutality": "Escalate—Discard a card. (...)\nChoose one or more —\n• Target opponent reveals their
// hand. You choose an instant or sorcery card from it. That player discards that card.\n• Target creature gets
// -2/-2 until end of turn.\n• Target opponent loses 2 life and you gain 2 life."
describe('Collective Brutality', () => {
  test('drain: I lose 2, they gain 2; discard finds no instant/sorcery; escalate needs another card', () => {
    const outs = passOuts(D([BRUTALITY], { total: 2, colors: 'B' }));
    const drain = using(outs, BRUTALITY, 'drain');
    assert.equal(drain.length, 1);
    const after = resolveOpp(drain[0].state);
    assert.equal(after.length, 1);
    assert.equal(after[0].state.life, 10 - 2);
    assert.equal(after[0].state.opp.life, 22);
    const disc = resolveOpp(using(outs, BRUTALITY, 'discard')[0].state);
    assert.equal(disc.length, 1);
    assert.deepEqual(disc[0].state.hand.length, 2);
    assert.equal(using(outs, BRUTALITY, 'discard+drain').length, 0, 'hand size 1: nothing to escalate with');
    assert.equal(using(passOuts(D([BRUTALITY], { total: 2, colors: 'B', handSize: 2 })), BRUTALITY, 'discard+drain').length, 1);
  });
  // D life 12 → 6 + Brutality → NO WIN: 2 cycles (4 life) are required before turn-1 resolution, and the drain
  //   (2) happens at W-oppturn, before that resolution: 6 − 4 − 2 = 0 in every order (responding with a cycle
  //   doesn't change the total). (v1 cross-check: D at life 4 with no drain is no_win.)
  // D life 20 → 10 + Brutality → WIN: 10 − 4 − 2 = 4; the discard mode finds nothing.
  test('verdicts', () => {
    expectWin(D([], {}, { lifeBeforeDoomsday: 12 }));
    expectNoWin(D([BRUTALITY], { total: 2, colors: 'B' }, { lifeBeforeDoomsday: 12 }));
    expectWin(D([BRUTALITY], { total: 2, colors: 'B' }));
  });
});

test('W-oppturn reopens after a discard spell resolves: Thoughtseize, then Duress', () => {
  const t = using(passOuts(D([TSEIZE, DURESS], { total: 2, colors: 'B' })), TSEIZE)[0].state;
  const r = resolveOpp(t);
  assert.ok(r.some((o) => o.state.pendingOppSpell && o.state.pendingOppSpell.card === DURESS));
  assert.ok(r.some((o) => o.state.pendingOppSpell === null));
});
