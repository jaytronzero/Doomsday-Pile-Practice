// SPEC_V2 §5.4 + §10 removal, graveyard hate and flash creatures in the adversary's hand
// (SPEC_V2_API §6, §8.3). Verified text quoted per card; engine behaviour + verdict flip with hand proofs.
//
// A' baseline (WIN): hand [Oracle, Wraith], {U:2}, life 20 → 10, land drop used, turnsAhead 0,
// pile [W, W, I, I, I]. One reachable Oracle; only 3 Wraith cycles reduce the library, so the library is
// ≥ 2 whenever the trigger resolves. Hence: if the adversary removes Oracle while its trigger is pending,
// devotion becomes 0 < 2 and nothing else can win (turnsAhead 0) → NO WIN. That one argument proves every
// "A' + Oracle removal → no_win" below.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { legalActions, status } from '../src/engine.js';
import {
  ORACLE, WRAITH, isCastPaid, isCycle, isPass, isResolve, hasAction, countOn,
  withOpp, build, expectWin, expectNoWin, outcomesOf, quiet, quietState, using, advOf,
  setupA2, PILE_A2, setupEmptyLib,
  STP, PUSH, SNUFF, DISMEMBER, SOLITUDE, BOLT, KCOMMAND, SURGICAL, ENDURANCE, BOWMASTERS,
} from './v2-helpers.js';

const A2 = (hand, o = {}, over = {}) => build(withOpp(setupA2(over), { hand, ...o }), PILE_A2);
const castOracle = (s) => outcomesOf(s, isCastPaid(ORACLE, { U: 2 }), 'cast Oracle');
/** A' line up to the pending trigger, always taking the "do nothing" branch: cycle ×3, cast Oracle. */
function toPending(s) {
  for (let i = 0; i < 3; i++) s = quietState(outcomesOf(s, isCycle(WRAITH)));
  return quietState(castOracle(s));
}
const atOracle = (s) => outcomesOf(toPending(s), isResolve, 'resolve_oracle');

function assertOracleGone(o, zone) {
  assert.equal(countOn(o.state.battlefield, ORACLE), 0);
  assert.ok(o.state[zone].includes(ORACLE), `Oracle should be in ${zone}`);
  assert.equal(o.state.pendingTrigger, true, 'the trigger stays on the stack');
  assert.ok(hasAction(o.state, isResolve), 'I get priority again');
}

// "Swords to Plowshares": "Exile target creature. Its controller gains life equal to its power."
describe('Swords to Plowshares', () => {
  test('exiles Oracle with its trigger pending; I gain 1 (Oracle power 1); not offered before Oracle is in play', () => {
    assert.equal(using(castOracle(A2([STP], { untapped: 1, colors: 'W' })), STP).length, 0);
    const outs = atOracle(A2([STP], { untapped: 1, colors: 'W' }));
    assert.equal(status(quietState(outs)), 'win', 'do nothing: lib 2 ≤ 2');
    const x = using(outs, STP, 'exile', ORACLE);
    assert.equal(x.length, 1);
    assertOracleGone(x[0], 'exile');
    assert.equal(x[0].state.life, quietState(outs).life + 1);
  });
  test("A' + StP → no_win", () => expectNoWin(A2([STP], { untapped: 1, colors: 'W' })));
});

// "Fatal Push": "Destroy target creature if it has mana value 2 or less. ..."
describe('Fatal Push', () => {
  test('destroys Oracle (MV 2) with its trigger pending', () => {
    const x = using(atOracle(A2([PUSH], { untapped: 1, colors: 'B' })), PUSH, 'destroy');
    assert.equal(x.length, 1);
    assertOracleGone(x[0], 'graveyard');
  });
  test("A' + Fatal Push → no_win", () => expectNoWin(A2([PUSH], { untapped: 1, colors: 'B' })));
});

// "Snuff Out": "If you control a Swamp, you may pay 4 life rather than pay this spell's mana cost.\nDestroy
// target nonblack creature. It can't be regenerated."
describe('Snuff Out', () => {
  test('free with a Swamp (B source) for 4 life; not without one', () => {
    const x = using(atOracle(A2([SNUFF], { total: 1, colors: 'B' })), SNUFF, 'destroy');
    assert.equal(x.length, 1);
    assertOracleGone(x[0], 'graveyard');
    assert.equal(x[0].state.opp.life, 16);
    assert.equal(using(atOracle(A2([SNUFF], { total: 1, colors: 'U' })), SNUFF).length, 0);
  });
  // No Swamp, no mana → Snuff Out can't be cast → A' line → WIN.
  test('verdicts', () => {
    expectNoWin(A2([SNUFF], { total: 1, colors: 'B' }));
    expectWin(A2([SNUFF], { total: 1, colors: 'U' }));
  });
});

// "Dismember": "({B/P} can be paid with either {B} or 2 life.)\nTarget creature gets -5/-5 until end of turn."
describe('Dismember', () => {
  test('{1} + 4 life kills Oracle; with no mana at all it is not castable', () => {
    const x = using(atOracle(A2([DISMEMBER], { untapped: 1 })), DISMEMBER, 'destroy');
    assert.equal(x.length, 1);
    assertOracleGone(x[0], 'graveyard');
    assert.equal(x[0].state.opp.life, 16);
    assert.equal(x[0].state.opp.manaAvailable, 0);
    assert.equal(using(atOracle(A2([DISMEMBER])), DISMEMBER).length, 0);
  });
  test('verdicts', () => {
    expectNoWin(A2([DISMEMBER], { untapped: 1 }));
    expectWin(A2([DISMEMBER]));
  });
});

// "Solitude": "Flash\nLifelink\nWhen this creature enters, exile up to one other target creature. That
// creature's controller gains life equal to its power.\nEvoke—Exile a white card from your hand."
describe('Solitude', () => {
  test('evoke (hand size 2): exiles Oracle, I gain 1, no Solitude stays', () => {
    const x = using(atOracle(A2([SOLITUDE], { handSize: 2, colors: 'W' })), SOLITUDE, 'exile');
    assert.equal(x.length, 1);
    assertOracleGone(x[0], 'exile');
    assert.ok(!x[0].state.opponent.permanents.some((p) => p.name === SOLITUDE));
  });
  test('hard-cast ({3}{W}{W}): Solitude joins their battlefield', () => {
    const x = using(atOracle(A2([SOLITUDE], { handSize: 1, untapped: 5, colors: 'W' })), SOLITUDE);
    assert.equal(x.length, 1);
    assert.ok(x[0].state.opponent.permanents.some((p) => p.name === SOLITUDE));
  });
  test('verdicts', () => {
    expectNoWin(A2([SOLITUDE], { handSize: 2, colors: 'W' }));
    expectWin(A2([SOLITUDE], { handSize: 1, colors: 'W' }));
  });
});

// "Lightning Bolt": "Lightning Bolt deals 3 damage to any target."
describe('Lightning Bolt', () => {
  test('at W-oracle: Oracle (3 damage kills a 1/3) or my face; earlier only my face', () => {
    const outs = atOracle(A2([BOLT], { untapped: 1, colors: 'R' }));
    const o = using(outs, BOLT, 'damage', ORACLE);
    assert.equal(o.length, 1);
    assertOracleGone(o[0], 'graveyard');
    const me = using(outs, BOLT, 'damage', 'me');
    assert.equal(me.length, 1);
    assert.equal(me[0].state.life, quietState(outs).life - 3);
    const early = using(castOracle(A2([BOLT], { untapped: 1, colors: 'R' })), BOLT);
    assert.ok(early.length >= 1 && early.every((x) => advOf(x).some((e) => e.target === 'me')));
  });
  test('Bolt to the face kills me at 3 life', () => {
    const outs = castOracle(A2([BOLT], { untapped: 1, colors: 'R' }, { lifeBeforeDoomsday: 6 }));
    const me = using(outs, BOLT, 'damage', 'me');
    assert.equal(status(me[0].state), 'loss');
  });
  test('verdicts: red mana needed', () => {
    expectNoWin(A2([BOLT], { untapped: 1, colors: 'R' }));
    expectWin(A2([BOLT], { untapped: 1, colors: 'U' }));
  });
});

// "Kozilek's Command": "Choose two —\n• Target player creates X 0/1 colorless Eldrazi Spawn creature tokens
// ...\n• Target player scries X, then draws a card.\n• Exile target creature with mana value X or less.\n•
// Exile up to X target cards from graveyards."  Cost {X}{C}{C}. Modelled packages: SPEC_V2_API §8.3.
describe("Kozilek's Command", () => {
  test('X=2 ({2}{C}{C}): exiles Oracle with its trigger pending', () => {
    const x = using(atOracle(A2([KCOMMAND], { untapped: 4, colors: 'C' })), KCOMMAND, 'exile_creature');
    assert.equal(x.length, 1);
    assertOracleGone(x[0], 'exile');
  });
  test('with 3 mana: no exile_creature; draw (X=0) and exile_graveyard (X=1) are offered', () => {
    const outs = atOracle(A2([KCOMMAND], { untapped: 3, colors: 'C' }));
    assert.equal(using(outs, KCOMMAND, 'exile_creature').length, 0);
    assert.ok(using(outs, KCOMMAND, 'draw').length >= 1);
    assert.ok(using(outs, KCOMMAND, 'exile_graveyard').length >= 1);
    assert.equal(using(atOracle(A2([KCOMMAND], { untapped: 4, colors: 'U' })), KCOMMAND).length, 0, '{C} needs C');
  });
  test('forced draw from an empty library: I lose (the trigger never resolves)', () => {
    // Tiny deck {Doomsday, Oracle}: the pool is empty, pile [], library 0 after Doomsday.
    const s = build(withOpp(setupEmptyLib(), { hand: [KCOMMAND], untapped: 2, colors: 'C' }), []);
    assert.equal(s.library.length, 0);
    const atCast = using(castOracle(s), KCOMMAND, 'draw');
    assert.ok(atCast.length >= 1 && atCast.every((o) => status(o.state) === 'loss'));
    const pending = quietState(castOracle(s));
    const outs = outcomesOf(pending, isResolve);
    assert.equal(status(quietState(outs)), 'win', 'do nothing: devotion 2 ≥ 0');
    const d = using(outs, KCOMMAND, 'draw');
    assert.equal(d.length, 1);
    assert.equal(status(d[0].state), 'loss');
  });
  // A' + Command with 4 mana incl. C → NO WIN (exile_creature at W-oracle).
  // A' + Command with 3 mana → WIN: only "I draw a card" and "exile one graveyard card" are affordable. An
  //   extra draw only shrinks my library: the A' line keeps lib ≥ 1 before the draw (it never empties the
  //   library: at most 3 cycles + 1 forced draw from 5 cards), so lib ≤ 2 at resolution still holds and no
  //   draw is from an empty library. Exiling a graveyard card (Doomsday or a Wraith) changes nothing.
  // Empty library + Command → NO WIN: the forced draw at W-cast or W-oracle loses; nothing else exists.
  test('verdicts', () => {
    expectNoWin(A2([KCOMMAND], { untapped: 4, colors: 'C' }));
    expectWin(A2([KCOMMAND], { untapped: 3, colors: 'C' }));
    expectWin(build(setupEmptyLib(), []));
    expectNoWin(build(withOpp(setupEmptyLib(), { hand: [KCOMMAND], untapped: 2, colors: 'C' }), []));
  });
});

// "Surgical Extraction": "({B/P} can be paid with either {B} or 2 life.)\nChoose target card in a graveyard
// other than a basic land card. Search its owner's graveyard, hand, and library for any number of cards with
// the same name as that card and exile them. Then that player shuffles."
describe('Surgical Extraction', () => {
  test('in response to a cycle: exiles every Wraith from graveyard, hand and library, then shuffles', () => {
    const s0 = A2([SURGICAL]);
    const outs = outcomesOf(s0, isCycle(WRAITH));
    const all = using(outs, SURGICAL, 'graveyard+hand+library', WRAITH);
    assert.ok(all.length >= 1);
    for (const o of all) {
      const s = o.state;
      assert.ok(![...s.library, ...s.hand, ...s.graveyard].includes(WRAITH));
      assert.equal(s.exile.filter((n) => n === WRAITH).length, 4, 'the exiled spare + cycled + 2 from the library');
      assert.equal(s.library.length, 2, '[I, I, I] then the cycle draws an Island');
      assert.equal(s.opp.life, 18);
    }
  });
  test('graveyard-only mode leaves library Wraiths but still shuffles (10 orderings of W,W,I,I,I)', () => {
    const outs = outcomesOf(A2([SURGICAL]), isCycle(WRAITH));
    const g = using(outs, SURGICAL, 'graveyard', WRAITH);
    assert.equal(g.length, 10);
    for (const o of g) assert.equal(o.state.library.filter((n) => n === WRAITH).length + o.state.hand.filter((n) => n === WRAITH).length, 2);
  });
  test('Doomsday in my graveyard is always a target (shuffle without exiling pile cards)', () => {
    const outs = outcomesOf(A2([SURGICAL]), isCycle(WRAITH));
    assert.ok(using(outs, SURGICAL, 'graveyard', 'Doomsday').length >= 2);
  });
  // A' + Surgical → NO WIN. My first action is a cycle or casting Oracle (pool only, no lands). Either opens a
  //   window while my library holds both Wraiths and Islands and no Wraith is left in my hand after the action
  //   resolves. The adversary answers with Surgical on Doomsday ('graveyard'): the library [W, W, I, I, I] (or
  //   the 5 cards, Oracle cast) is shuffled; in the ordering with an Island on top, my next draw is that
  //   Island and I hold no Wraith → no more draws → lib 4 > 2. In detail: (a) first action cycle: it draws the
  //   top = Island, hand [Oracle, I]. (b) first action Oracle: hand [Wraith]; I cycle it, drawing the Island
  //   on top; hand [I]. Either way lib 4 and no cycler, turnsAhead 0. The solver must win every ordering → no.
  test("A' + Surgical → no_win", () => expectNoWin(A2([SURGICAL])));
});

// "Endurance": "Flash\nReach\nWhen Endurance enters the battlefield, up to one target player puts all the cards
// from their graveyard on the bottom of their library in a random order.\nEvoke—Exile a green card from your hand."
describe('Endurance', () => {
  test('in response to the Oracle trigger it puts my graveyard under my library (random order)', () => {
    const outs = atOracle(A2([ENDURANCE], { handSize: 2, colors: 'G' }));
    const e = using(outs, ENDURANCE, 'graveyard_to_library', 'me');
    // Graveyard then: Doomsday + 3 Wraiths → 4 distinct orders (where Doomsday goes).
    assert.equal(e.length, 4);
    for (const o of e) {
      const s = o.state;
      assert.deepEqual(s.library.slice(0, 2), ['Island', 'Island']);
      assert.equal(s.library.length, 6);
      assert.deepEqual(s.graveyard, []);
      assert.equal(s.pendingTrigger, true);
      assert.ok(!s.opponent.permanents.some((p) => p.name === ENDURANCE), 'evoked: gone');
    }
  });
  // A' + Endurance (evoke) → NO WIN: at W-oracle my graveyard (≥ Doomsday + the cycled Wraiths) goes under the
  //   library; the A' line has lib 2 + 4 = 6 > 2, and no cycler is left (3 Wraiths used). Casting Endurance
  //   earlier (at a cycle) also adds the graveyard to the library; my draws come from the top, and the total
  //   number of library reductions (3 cycles) can't bring lib ≤ 2 once ≥ 1 card was added: 5 + g − 3 ≥ 3.
  test("A' + Endurance → no_win", () => expectNoWin(A2([ENDURANCE], { handSize: 2, colors: 'G' })));
});

// "Orcish Bowmasters": "Flash\nWhen this creature enters and whenever an opponent draws a card except the first
// one they draw in each of their draw steps, this creature deals 1 damage to any target. Then amass Orcs 1."
describe('Orcish Bowmasters from the hidden hand', () => {
  test('flashed in response to a cycle: ETB ping + the cycle draw ping (life 10 → 6), 1/1 + Army 2/2', () => {
    const outs = outcomesOf(A2([BOWMASTERS], { untapped: 2, colors: 'B' }), isCycle(WRAITH));
    const b = using(outs, BOWMASTERS, 'flash');
    assert.equal(b.length, 1);
    const s = b[0].state;
    assert.equal(s.life, 10 - 2 - 1 - 1);
    assert.equal(advOf(b[0]).filter((e) => e.mode === 'ping' && e.target === 'me').length, 2);
    assert.ok(s.opponent.permanents.some((p) => p.name === BOWMASTERS));
    assert.equal(s.opponent.permanents.find((p) => p.name === 'Orc Army')?.power, 2);
    assert.equal(s.opp.manaAvailable, 0);
  });
  test('a creature that entered during my turn attacks on theirs (1 + Army 2 = 3)', () => {
    const outs = outcomesOf(A2([BOWMASTERS], { untapped: 2, colors: 'B' }, { turnsAhead: 1 }), isCycle(WRAITH));
    const s = using(outs, BOWMASTERS, 'flash')[0].state;
    const t = quietState(outcomesOf(s, isPass));
    assert.equal(t.life, 6 - 3);
  });
  // A' life 20 → 10 + Bowmasters → NO WIN: 3 cycles are needed (6 life). Whatever my first action, the
  //   adversary flashes Bowmasters right then: if it is a cycle, the ETB + 3 draw pings hit me (no Oracle yet):
  //   10 − 6 − 4 = 0. If it is Oracle, the ETB pings me (9) and each of the 3 later draws pings me or Oracle:
  //   all at me → 9 − 6 − 3 = 0. Loss either way.
  // A' life 22 → 11 + Bowmasters → WIN: cycle ×3 then Oracle. Worst case: flash at the first cycle →
  //   11 − 6 − 4 = 1, life ≥ 2 before each cycle (9→… sequence 11 −2=9 −1 −1 =7; −2=5 −1=4; −2=2 −1=1), then
  //   Oracle and resolve (no more draws). Later flashes ping less; at W-cast/W-oracle only the ETB ping (at most
  //   1 damage to the Oracle, toughness 3).
  test('verdicts: life 20 → no_win, life 22 → win', () => {
    expectNoWin(A2([BOWMASTERS], { untapped: 2, colors: 'B' }));
    expectWin(A2([BOWMASTERS], { untapped: 2, colors: 'B' }, { lifeBeforeDoomsday: 22 }));
  });
});

test('removal is not offered when no trigger is pending (Oracle not in play)', () => {
  const s = A2([PUSH, STP, BOLT], { handSize: 3, untapped: 3, colors: 'WBR' });
  const outs = outcomesOf(s, isCycle(WRAITH));
  assert.equal(using(outs, PUSH).length, 0);
  assert.equal(using(outs, STP).length, 0);
  assert.ok(using(outs, BOLT).every((o) => advOf(o).every((e) => e.card !== BOLT || e.target === 'me')));
  assert.ok(quiet(outs).length === 1);
  assert.ok(legalActions(quiet(outs)[0].state).length > 0);
});
