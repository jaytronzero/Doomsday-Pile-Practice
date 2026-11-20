// SPEC_V2 §5.2–§5.4, §10: counters and ability counters held by the adversary (SPEC_V2_API §8, §9).
// Each card: verified text from src/oppCards.js quoted, an engine-level behaviour test, and a solver-level
// verdict flip with a hand proof.
//
// Baselines (all goldfish WINs, proofs in tests/v2-board.test.js / v1):
//  A'  : hand [Oracle, Wraith], {U:2} floating, life 20 → 10, land drop used, turnsAhead 0, pile
//        [W, W, I, I, I]. Facts: one reachable Oracle (the other is exiled), no Unearth, the only library
//        reducers are 3 Wraith cycles (lib ≥ 2 at best), the only mana is the floating pool.
//  P3' : hand [Oracle, Brainstorm], {U:n}, life 10 → 5, land drop used, pile [W, W, I, I, I]. Needs Brainstorm:
//        without it the Wraiths stay in the library and nothing else draws, so lib 5 > 2 (v1 puzzle 3 proof).
//        Brainstorm + Oracle cost 3 in total; the line wins at 1 life.
//  CV  : A' but the pool is empty and Cavern of Souls (Merfolk) + Island are in play: Oracle paid
//        {U from Island, U from Cavern} is uncounterable ("protected"). Both lands are needed for UU.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { legalActions, applyAction, status } from '../src/engine.js';
import {
  ORACLE, WRAITH, SEWERS, DELTA, PETAL, LED, CAVERN, bf, countOn, normPay,
  isCast, isCastPaid, isCycle, isTap, isPlay, isCrack, isPass, isResolve, isType, findAction, hasAction, act,
  ISLAND, withOpp, build, expectWin, expectNoWin, outcomesOf, quiet, quietState, using, notUsing, advOf,
  isChooseOpt, setupA2, PILE_A2, setupP3, PILE_P3, setupCV, setupT, PILE_T,
  FOW, FON, DAZE, PIERCE, FLUSTER, PYRO, REB, SNARE, PACT, TRAP, MISSTEP, CONSIGN, STIFLE, SINK,
} from './v2-helpers.js';
import { setupA } from './helpers.js';

const A2 = (hand, o = {}, over = {}) => build(withOpp(setupA2(over), { hand, ...o }), PILE_A2);
const P3 = (U, hand, o = {}, over = {}) => build(withOpp(setupP3(U, over), { hand, ...o }), PILE_P3);
const CV = (hand, o = {}, over = {}) => build(withOpp(setupCV(over), { hand, ...o }), PILE_A2);
const castOracle = (s) => outcomesOf(s, isCastPaid(ORACLE, { U: 2 }), 'cast Oracle {U:2}');
/** CV: tap Cavern for restricted U and Island for U, then cast Oracle protected. */
function castProtected(s) {
  s = act(s, isTap(CAVERN, 'rU'));
  s = act(s, isTap(ISLAND, 'U'));
  return outcomesOf(s, isCastPaid(ORACLE, { U: 1, rU: 1 }), 'protected Oracle');
}
const castBrainstorm = (s) => outcomesOf(s, isCastPaid('Brainstorm', { U: 1 }), 'cast Brainstorm');
const choosePay = (s, n) => applyAction(s, findAction(s, isChooseOpt((o) => o && o.pay && normPay(o.pay).U === n), `pay ${n}`));
const chooseDecline = (s) => applyAction(s, findAction(s, isChooseOpt((o) => o === 'decline'), 'decline'));

// ---------------------------------------------------------------------------
// "Force of Will": "You may pay 1 life and exile a blue card from your hand rather than pay this spell's mana
// cost.\nCounter target spell."
describe('Force of Will', () => {
  test('pitch cost: needs handSize ≥ 2; counters Oracle; costs 1 life; hand size −2', () => {
    const outs = castOracle(A2([FOW], { handSize: 2, colors: 'U' }));
    assert.ok(quietState(outs).pendingTrigger);
    const f = using(outs, FOW, 'counter');
    assert.equal(f.length, 1);
    const s = f[0].state;
    assert.ok(s.graveyard.includes(ORACLE));
    assert.equal(countOn(s.battlefield, ORACLE), 0);
    assert.equal(s.pendingTrigger, false);
    assert.deepEqual(s.opp.hand, []);
    assert.equal(s.opp.handSize, 0);
    assert.equal(s.opp.life, 19);
  });
  test('handSize 1 and no mana: no Force; handSize 1 with {3}{U}{U}: hard-cast', () => {
    assert.equal(using(castOracle(A2([FOW], { handSize: 1, colors: 'U' })), FOW).length, 0);
    const h = using(castOracle(A2([FOW], { handSize: 1, untapped: 5, colors: 'U' })), FOW);
    assert.equal(h.length, 1);
    assert.equal(h[0].state.opp.manaAvailable, 0);
    assert.equal(h[0].state.opp.life, 20);
  });
  test('two Forces, hand size 2: the first pitches the second (only one counter)', () => {
    const f = using(castOracle(A2([FOW, FOW], { handSize: 2, colors: 'U' })), FOW);
    assert.ok(f.length >= 1);
    for (const o of f) {
      assert.equal(advOf(o).filter((e) => e.card === FOW).length, 1);
      assert.deepEqual(o.state.opp.hand, []);
    }
  });
  test('a Cavern-protected Oracle can not be targeted', () => {
    assert.equal(using(castProtected(CV([FOW], { handSize: 2, colors: 'U' })), FOW).length, 0);
  });
  // A' + FoW (handSize 2) → NO WIN: the one Oracle is countered when cast; nothing else wins.
  // A' + FoW (handSize 1, no mana) → WIN: Force can't be cast (§8.2), A' line.
  // CV + FoW → WIN: protected Oracle; FoW has no other target (cycles are abilities); CV line.
  test('verdicts', () => {
    expectNoWin(A2([FOW], { handSize: 2, colors: 'U' }));
    expectWin(A2([FOW], { handSize: 1, colors: 'U' }));
    expectWin(CV([FOW], { handSize: 2, colors: 'U' }));
  });
});

// "Force of Negation": "If it's not your turn, you may exile a blue card from your hand rather than pay this
// spell's mana cost.\nCounter target noncreature spell. If that spell is countered this way, exile it instead
// of putting it into its owner's graveyard."
describe('Force of Negation', () => {
  test('free on my turn; noncreature only; the spell is exiled', () => {
    const s = P3(3, [FON], { handSize: 2, colors: 'U' });
    const f = using(castBrainstorm(s), FON, 'counter');
    assert.equal(f.length, 1);
    assert.ok(f[0].state.exile.includes('Brainstorm'));
    assert.ok(!f[0].state.graveyard.includes('Brainstorm'));
    assert.equal(f[0].state.pendingChoice, null);
    assert.equal(using(castOracle(s), FON).length, 0, 'Oracle is a creature');
  });
  test("on the opponent's turn it needs {1}{U}{U}", () => {
    const castConsiderOnTheirTurn = (o) => {
      let s = build(withOpp(setupT(), { hand: [FON], handSize: 2, colors: 'U', ...o }), PILE_T);
      s = quietState(outcomesOf(s, isPass));
      assert.equal(s.phase, 'opp');
      s = act(s, isTap(ISLAND, 'U'));
      return outcomesOf(s, isCastPaid('Consider', { U: 1 }));
    };
    assert.equal(using(castConsiderOnTheirTurn({}), FON).length, 0);
    const f = using(castConsiderOnTheirTurn({ untapped: 0, total: 3 }), FON);
    assert.equal(f.length, 1);
    assert.equal(f[0].state.opp.manaAvailable, 0);
  });
  // P3' + FoN (free) → NO WIN: Brainstorm (needed, see header) is countered on my turn.
  // T + Silence + FoN, no lands → WIN: the T line (tests/v2-board.test.js) casts Consider on the opponent's
  //   turn, where FoN needs mana (manaAvailable = landsTotal = 0); its only other spell is Oracle (a creature).
  test('verdicts', () => {
    expectWin(P3(3, []));
    expectNoWin(P3(3, [FON], { handSize: 2, colors: 'U' }));
    expectWin(build(withOpp(setupT(), { permanents: [{ name: 'Deafening Silence' }], hand: [FON], handSize: 2, colors: 'U' }), PILE_T));
  });
});

// "Daze": "You may return an Island you control to its owner's hand rather than pay this spell's mana cost.\n
// Counter target spell unless its controller pays {1}."
describe('Daze and pay_or_not', () => {
  test('alt cost (return an Island): I get pay_or_not; with no spare mana only decline → countered', () => {
    const d = using(castOracle(A2([DAZE], { total: 1, colors: 'U' })), DAZE, 'counter');
    assert.equal(d.length, 1);
    const s = d[0].state;
    assert.deepEqual({ kind: s.pendingChoice.kind, card: s.pendingChoice.card, amount: s.pendingChoice.amount },
      { kind: 'pay_or_not', card: DAZE, amount: 1 });
    assert.equal(s.opp.landsTotal, 0);
    assert.equal(s.opp.handSize, 1, 'Daze left, the Island came back');
    const opts = legalActions(s).filter(isType('choose')).map((a) => a.option);
    assert.deepEqual(opts, ['decline']);
    const after = chooseDecline(s);
    assert.equal(after.length, 1);
    assert.ok(after[0].state.graveyard.includes(ORACLE));
    assert.equal(after[0].state.pendingTrigger, false);
  });
  test('with a spare U I may pay; Oracle then resolves', () => {
    const s = using(castOracle(A2([DAZE], { total: 1, colors: 'U' }, { manaPool: { U: 3 } })), DAZE)[0].state;
    const paid = choosePay(s, 1);
    assert.equal(paid.length, 1);
    assert.equal(paid[0].state.pendingTrigger, true);
    assert.equal(paid[0].state.pool.U, 0);
  });
  test('while pay_or_not is pending I may tap lands for mana (and nothing else but the options)', () => {
    let s = using(castOracle(A2([DAZE], { total: 1, colors: 'U' }, { battlefield: [bf(ISLAND)] })), DAZE)[0].state;
    assert.ok(hasAction(s, isTap(ISLAND, 'U')));
    assert.ok(!hasAction(s, isCycle(WRAITH)));
    s = act(s, isTap(ISLAND, 'U'));
    assert.equal(choosePay(s, 1)[0].state.pendingTrigger, true);
  });
  test('opponent mana and colours: no Island and no U → no Daze; {1}{U} available → hard-cast is an option too', () => {
    assert.equal(using(castOracle(A2([DAZE], { total: 1, colors: 'R' })), DAZE).length, 0);
    const both = using(castOracle(A2([DAZE], { untapped: 2, total: 2, colors: 'U' })), DAZE);
    assert.ok(both.some((o) => o.state.opp.manaAvailable === 0 && o.state.opp.landsTotal === 2), 'hard-cast');
    assert.ok(both.some((o) => o.state.opp.landsTotal === 1), 'alternative cost');
  });
  test('after I pay, W-cast reopens: a second Daze can hit the same spell', () => {
    const s = using(castOracle(A2([DAZE, DAZE], { total: 2, colors: 'U' }, { manaPool: { U: 3 } })), DAZE)[0].state;
    const after = choosePay(s, 1);
    assert.ok(quiet(after).length === 1 && quiet(after)[0].state.pendingTrigger, 'they may stop: Oracle resolves');
    const second = using(after, DAZE);
    assert.equal(second.length, 1);
    assert.equal(second[0].state.pendingChoice.kind, 'pay_or_not');
    assert.deepEqual(second[0].state.opp.hand, []);
  });
  // A' {U:2} + Daze → NO WIN: Oracle uses all the mana; Daze counters it; one Oracle.
  // A' {U:3} + Daze → WIN: pay 1 (U left after UU); Daze has no other target; then the A' cycles.
  // A' {U:3} + Daze ×2 (two Islands) → NO WIN: the first Daze is paid with the spare U, the second can't be.
  test('verdicts', () => {
    expectNoWin(A2([DAZE], { total: 1, colors: 'U' }));
    expectWin(A2([DAZE], { total: 1, colors: 'U' }, { manaPool: { U: 3 } }));
    expectNoWin(A2([DAZE, DAZE], { total: 2, colors: 'U' }, { manaPool: { U: 3 } }));
  });
});

// "Spell Pierce": "Counter target noncreature spell unless its controller pays {2}."
describe('Spell Pierce', () => {
  test('pay_or_not 2 on Brainstorm; never on Oracle', () => {
    const s = P3(3, [PIERCE], { untapped: 1, colors: 'U' });
    const p = using(castBrainstorm(s), PIERCE, 'counter');
    assert.equal(p.length, 1);
    assert.equal(p[0].state.pendingChoice.amount, 2);
    assert.equal(p[0].state.opp.manaAvailable, 0);
    assert.equal(using(castOracle(s), PIERCE).length, 0);
  });
  // P3' {U:3} + Pierce → NO WIN: paying 2 for Brainstorm leaves 0 for Oracle; declining loses Brainstorm.
  // P3' {U:5} + Pierce → WIN: 1 + 2 + 2 = 5.
  test('verdicts', () => {
    expectNoWin(P3(3, [PIERCE], { untapped: 1, colors: 'U' }));
    expectWin(P3(5, [PIERCE], { untapped: 1, colors: 'U' }));
  });
});

// "Flusterstorm": "Counter target instant or sorcery spell unless its controller pays {1}.\nStorm (When you cast
// this spell, copy it for each spell cast before it this turn. ...)"
describe('Flusterstorm', () => {
  test('storm count = spells cast before it this turn: Doomsday + Brainstorm → pay 3', () => {
    const f = using(castBrainstorm(P3(3, [FLUSTER], { untapped: 1, colors: 'U' })), FLUSTER, 'counter');
    assert.equal(f.length, 1);
    assert.equal(f[0].state.pendingChoice.amount, 3);
  });
  test('with 3 spells already cast this turn: 1 + 4 = 5', () => {
    const f = using(castBrainstorm(P3(5, [FLUSTER], { untapped: 1, colors: 'U' }, { spellsCastThisTurn: 3 })), FLUSTER);
    assert.equal(f[0].state.pendingChoice.amount, 5);
  });
  test('only instants and sorceries: not Oracle', () => {
    assert.equal(using(castOracle(P3(3, [FLUSTER], { untapped: 1, colors: 'U' })), FLUSTER).length, 0);
  });
  // P3' {U:3} + Flusterstorm → NO WIN: after Brainstorm 2 U remain < 3 → Brainstorm countered.
  // P3' {U:6} + Flusterstorm → WIN: 1 + 3 + 2 = 6; no other instant/sorcery to hit.
  test('verdicts', () => {
    expectNoWin(P3(3, [FLUSTER], { untapped: 1, colors: 'U' }));
    expectWin(P3(6, [FLUSTER], { untapped: 1, colors: 'U' }));
  });
});

// "Pyroblast": "Choose one —\n• Counter target spell if it's blue.\n• Destroy target permanent if it's blue."
// "Red Elemental Blast": "Choose one —\n• Counter target blue spell.\n• Destroy target blue permanent."
describe('Pyroblast and Red Elemental Blast', () => {
  for (const card of [PYRO, REB]) {
    test(`${card}: counters a blue spell, not a black one; destroys Oracle with its trigger pending`, () => {
      const c = using(castOracle(A2([card], { untapped: 1, colors: 'R' })), card, 'counter');
      assert.equal(c.length, 1);
      assert.ok(c[0].state.graveyard.includes(ORACLE));
      const r = A2([card], { untapped: 1, colors: 'R' }, { hand: [ORACLE, WRAITH, 'Dark Ritual'], manaPool: { U: 2, B: 1 } });
      assert.equal(using(outcomesOf(r, isCastPaid('Dark Ritual', { B: 1 })), card).length, 0);
      const pending = quietState(castOracle(A2([card], { untapped: 1, colors: 'R' })));
      const d = using(outcomesOf(pending, isResolve), card, 'destroy', ORACLE);
      assert.equal(d.length, 1);
      const s = d[0].state;
      assert.ok(s.graveyard.includes(ORACLE));
      assert.equal(s.pendingTrigger, true);
      assert.ok(hasAction(s, isResolve), 'I get priority again, the trigger is still there');
    });
    test(`${card}: can't counter a Cavern-protected Oracle but still destroys it`, () => {
      const outs = castProtected(CV([card], { untapped: 1, colors: 'R' }));
      assert.equal(using(outs, card).length, 0);
      const d = using(outcomesOf(quietState(outs), isResolve), card, 'destroy');
      assert.equal(d.length, 1);
    });
  }
  // CV + Pyroblast / REB → NO WIN: the protected Oracle resolves, but at W-oracle it is destroyed → devotion 0,
  //   while the library is ≥ 2 (3 Wraiths at most) → no win; turnsAhead 0, no second Oracle.
  // CV goldfish → WIN (v1 cross-check: cycle ×3, tap Cavern rU + Island, Oracle, resolve).
  test('verdicts', () => {
    expectWin(CV([]));
    expectNoWin(CV([PYRO], { untapped: 1, colors: 'R' }));
    expectNoWin(CV([REB], { untapped: 1, colors: 'R' }));
  });
});

// "Spell Snare": "Counter target spell with mana value 2."
describe('Spell Snare', () => {
  test('counters Oracle (MV 2), not Brainstorm (MV 1)', () => {
    assert.equal(using(castOracle(A2([SNARE], { untapped: 1, colors: 'U' })), SNARE).length, 1);
    assert.equal(using(castBrainstorm(P3(3, [SNARE], { untapped: 1, colors: 'U' })), SNARE).length, 0);
  });
  // A' + Snare → NO WIN: the one Oracle is countered.
  test("A' + Spell Snare → no_win", () => expectNoWin(A2([SNARE], { untapped: 1, colors: 'U' })));
});

// "Pact of Negation": "Counter target spell.\nAt the beginning of your next upkeep, pay {3}{U}{U}. If you don't,
// you lose the game."
describe('Pact of Negation', () => {
  test('free counter; if they cannot pay at their next upkeep, they lose', () => {
    const p = using(castOracle(A2([PACT], { total: 2, colors: 'U' }, { turnsAhead: 1 })), PACT, 'counter');
    assert.equal(p.length, 1);
    assert.ok(p[0].state.graveyard.includes(ORACLE));
    const next = outcomesOf(p[0].state, isPass);
    for (const o of next) assert.equal(status(o.state), 'win');
  });
  test('with five lands including U they pay it', () => {
    const p = using(castOracle(A2([PACT], { total: 5, colors: 'U' }, { turnsAhead: 1 })), PACT)[0].state;
    const s = quietState(outcomesOf(p, isPass));
    assert.equal(status(s), 'ongoing');
    assert.equal(s.opp.manaAvailable, 0);
  });
  // A' + Pact → NO WIN (counter the one Oracle; turnsAhead 0, so the upkeep never comes).
  // A' turnsAhead 1 + Pact, 2 lands → WIN: if they Pact the Oracle, I pass and they lose at their upkeep;
  //   if they don't, the A' line wins. A' turnsAhead 1 + Pact, 5 lands with U → NO WIN: they pay; no Oracle left.
  test('verdicts', () => {
    expectNoWin(A2([PACT]));
    expectWin(A2([PACT], { total: 2, colors: 'U' }, { turnsAhead: 1 }));
    expectNoWin(A2([PACT], { total: 5, colors: 'U' }, { turnsAhead: 1 }));
  });
});

// "Mindbreak Trap": "If an opponent cast three or more spells this turn, you may pay {0} rather than pay this
// spell's mana cost.\nExile any number of target spells."
describe('Mindbreak Trap', () => {
  test('free once I have cast 3 spells this turn; exiles even a Cavern-protected Oracle', () => {
    const t = using(castProtected(CV([TRAP], {}, { spellsCastThisTurn: 2 })), TRAP, 'exile');
    assert.equal(t.length, 1);
    assert.ok(t[0].state.exile.includes(ORACLE));
    assert.equal(countOn(t[0].state.battlefield, ORACLE), 0);
  });
  test('not free with only 2 spells; payable with {2}{U}{U}', () => {
    assert.equal(using(castProtected(CV([TRAP])), TRAP).length, 0);
    assert.equal(using(castProtected(CV([TRAP], { untapped: 4, colors: 'U' })), TRAP).length, 1);
  });
  // CV (Doomsday + 1 earlier spell) + Trap → NO WIN: Oracle is my 3rd spell, Trap is free and exiles it
  //   (Cavern doesn't stop exile); one Oracle. Control: CV + FoW → WIN (Force section).
  test('verdict', () => expectNoWin(CV([TRAP], {}, { spellsCastThisTurn: 2 })));
});

// "Mental Misstep": "({U/P} can be paid with either {U} or 2 life.)\nCounter target spell with mana value 1."
describe('Mental Misstep', () => {
  test('counters Brainstorm for 2 life; not Oracle', () => {
    const m = using(castBrainstorm(P3(3, [MISSTEP])), MISSTEP, 'counter');
    assert.equal(m.length, 1);
    assert.equal(m[0].state.opp.life, 18);
    assert.ok(m[0].state.graveyard.includes('Brainstorm'));
    assert.equal(using(castOracle(A2([MISSTEP])), MISSTEP).length, 0);
  });
  // P3' + Misstep → NO WIN (Brainstorm countered). A' + Misstep → WIN (no MV-1 spell in the A' line).
  test('verdicts', () => {
    expectNoWin(P3(3, [MISSTEP]));
    expectWin(A2([MISSTEP]));
  });
});

// "Consign to Memory": "Replicate {1} (...)\nCounter target triggered ability or colorless spell."
describe('Consign to Memory', () => {
  test('counters the Oracle trigger at W-oracle', () => {
    const pending = quietState(castOracle(A2([CONSIGN], { untapped: 1, colors: 'U' })));
    const c = using(outcomesOf(pending, isResolve), CONSIGN, 'counter_ability');
    assert.equal(c.length, 1);
    assert.equal(c[0].state.pendingTrigger, false);
    assert.equal(countOn(c[0].state.battlefield, ORACLE), 1);
    assert.notEqual(status(c[0].state), 'win');
  });
  test('counters Lotus Petal and LED (colorless spells), not Oracle (blue)', () => {
    for (const card of [PETAL, LED]) {
      const s = A2([CONSIGN], { untapped: 1, colors: 'U' }, { hand: [ORACLE, WRAITH, card] });
      const c = using(outcomesOf(s, isCast(card)), CONSIGN, 'counter');
      assert.equal(c.length, 1, card);
      assert.ok(c[0].state.graveyard.includes(card));
      assert.equal(countOn(c[0].state.battlefield, card), 0);
    }
    assert.equal(using(castOracle(A2([CONSIGN], { untapped: 1, colors: 'U' })), CONSIGN).length, 0);
  });
  // A' + Consign → NO WIN: the one Oracle's trigger is countered; no other trigger can happen.
  test("A' + Consign → no_win", () => expectNoWin(A2([CONSIGN], { untapped: 1, colors: 'U' })));
});

// "Stifle": "Counter target activated or triggered ability. (Mana abilities can't be targeted.)"
describe('Stifle', () => {
  const S = (over, o = {}) => A2([STIFLE], { untapped: 1, colors: 'U', ...o }, over);
  test('on cycling: the card is discarded and the life paid, but nothing is drawn', () => {
    const s0 = S();
    const outs = outcomesOf(s0, isCycle(WRAITH));
    assert.equal(quietState(outs).library.length, 4);
    const x = using(outs, STIFLE, 'counter_ability');
    assert.equal(x.length, 1);
    const s = x[0].state;
    assert.deepEqual(s.library, s0.library);
    assert.deepEqual(s.hand, [ORACLE]);
    assert.ok(s.graveyard.includes(WRAITH));
    assert.equal(s.life, s0.life - 2);
    assert.equal(s.opp.manaAvailable, 0);
    assert.deepEqual(s.opp.hand, []);
  });
  test('used at most once: the next cycle has no Stifle option', () => {
    const s = using(outcomesOf(S({ hand: [ORACLE, WRAITH, WRAITH] }), isCycle(WRAITH)), STIFLE)[0].state;
    const next = outcomesOf(s, isCycle(WRAITH));
    assert.equal(next.length, 1);
    assert.equal(using(next, STIFLE).length, 0);
  });
  test('on a fetchland: life and fetch paid, no search, no shuffle', () => {
    const s0 = S({ battlefield: [bf(DELTA)] });
    const outs = outcomesOf(s0, isCrack(DELTA, ISLAND));
    assert.ok(quiet(outs).length >= 1);
    const x = using(outs, STIFLE);
    assert.equal(x.length, 1);
    assert.equal(x[0].state.life, s0.life - 1);
    assert.deepEqual(x[0].state.library, s0.library);
    assert.equal(countOn(x[0].state.battlefield, DELTA), 0);
    assert.equal(countOn(x[0].state.battlefield, ISLAND), 0);
  });
  test('on the Oracle trigger and on the Sewers surveil trigger', () => {
    const pending = quietState(castOracle(S()));
    assert.equal(using(outcomesOf(pending, isResolve), STIFLE)[0].state.pendingTrigger, false);
    const w = build(withOpp(setupA({ hand: [ORACLE, WRAITH, SEWERS] }), { hand: [STIFLE], untapped: 1, colors: 'U' }), PILE_A2);
    const outs = outcomesOf(w, isPlay(SEWERS));
    assert.equal(quietState(outs).pendingChoice.kind, 'surveil');
    assert.equal(using(outs, STIFLE)[0].state.pendingChoice, null);
  });
  test('mana abilities open no window (Lotus Petal)', () => {
    assert.equal(outcomesOf(S({ battlefield: [bf(PETAL)] }), (a) => a.type === 'sac_petal' && a.color === 'U').length, 1);
  });
  test('opponent colours and mana limit it', () => {
    assert.equal(using(outcomesOf(S({}, { colors: 'R' }), isCycle(WRAITH)), STIFLE).length, 0);
    assert.equal(using(outcomesOf(S({}, { untapped: 0, total: 1 }), isCycle(WRAITH)), STIFLE).length, 0);
  });
  // A' + Stifle → NO WIN: the one Oracle trigger is Stifled at W-oracle (or a needed cycle is).
  test("A' + Stifle → no_win", () => expectNoWin(S()));
});

// "Sink into Stupor": "Return target spell or nonland permanent an opponent controls to its owner's hand."
describe('Sink into Stupor', () => {
  test('bounces a Cavern-protected Oracle spell to my hand; bounces Oracle with its trigger pending', () => {
    const outs = castProtected(CV([SINK], { untapped: 3, colors: 'U' }));
    const b = using(outs, SINK, 'bounce');
    assert.equal(b.length, 1);
    assert.ok(b[0].state.hand.includes(ORACLE));
    assert.equal(countOn(b[0].state.battlefield, ORACLE), 0);
    assert.equal(b[0].state.pendingTrigger, false);
    const w = using(outcomesOf(quietState(outs), isResolve), SINK, 'bounce');
    assert.equal(w.length, 1);
    assert.ok(w[0].state.hand.includes(ORACLE));
    assert.equal(w[0].state.pendingTrigger, true);
  });
  // CV + Sink → NO WIN: whenever Oracle is bounced (as a spell or with its trigger pending), recasting needs UU
  //   and both Cavern and Island were tapped for the first cast (pool empty, land drop used, no Petal); a
  //   bounce at W-oracle leaves devotion 0 with lib ≥ 2.
  test('CV + Sink → no_win', () => expectNoWin(CV([SINK], { untapped: 3, colors: 'U' })));
});

test('every outcome list from a counter window has distinct labels and a quiet branch', () => {
  const outs = castOracle(A2([FOW, DAZE, SNARE], { handSize: 4, untapped: 1, total: 1, colors: 'U' }));
  assert.equal(new Set(outs.map((o) => o.label)).size, outs.length);
  assert.equal(quiet(outs).length, 1);
  assert.ok(notUsing(outs, FOW).length >= 2);
});
