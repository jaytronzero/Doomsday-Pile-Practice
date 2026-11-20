// SPEC_V2 §3 + §10 static opponent permanents (SPEC_V2_API §4, §5, §6, §8.4).
// Each card: the verified text from src/oppCards.js is quoted, then an engine-level behaviour test and a
// solver-level test showing the card flips a verdict. Every win / no_win is proved by hand in a comment.
// Puzzle setups come from tests/v2-helpers.js; v1 puzzles keep their v1 proofs (tests/puzzles.test.js).
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { buildStartState, legalActions, applyAction, status } from '../src/engine.js';
import {
  ORACLE, WRAITH, SEA, SEWERS, DELTA, PETAL, LED, CAVERN, THALIA, CHALICE, SILENCE, PILE_A,
  makeSetup, bf, deckWith, normPay, countOn, sameMultiset,
  isType, isCast, isCastPaid, isCycle, isTap, isPlay, isCrack, isSacPetal, isLed, isPass, isResolve,
  findAction, hasAction, act,
  ISLAND, SWAMP, withOpp, perm, build, expectWin, expectNoWin, outcomesOf, quietState, using, quiet,
  setupA2, PILE_A2, setupP3, PILE_P3, setupH, PILE_H, setupIH, PILE_IH, setupT, PILE_T, setupGG, PILE_GG,
  setupPA, setupP1, PILE_P1, setupP4, PILE_P4, setupBR, PILE_BR, isChooseOpt,
  THORN, SPHERE, TRINI, DAMPING, ARCHON, NEEDLE, OUPHE, KARN, CAGE, TORPOR, TEFERI, NARSET, HULL, BOWMASTERS,
  BLOOD_MOON, MAGUS, B2B, CRYPT, WASTELAND, GQ, VOICE, VOIDWALKER, GUIDE,
} from './v2-helpers.js';

/** buildStartState(makeSetup(over) with opponent permanents), pile. */
const st = (over, permanents, pile = PILE_A) => buildStartState(withOpp(makeSetup(over), { permanents }), [...pile]);
/** Same from a ready setup. */
const on = (setup, permanents, pile) => buildStartState(withOpp(setup, { permanents }), [...pile]);
const passOnce = (s) => quietState(outcomesOf(s, isPass, 'pass'));
/** Apply the FIRST legal action matching pred (for choices with several equivalent options). */
function actFirst(s, pred) {
  const a = legalActions(s).find(pred);
  assert.ok(a, 'no matching legal action');
  const out = applyAction(s, a);
  assert.equal(out.length, 1);
  return out[0].state;
}

// A' (setupA2): hand [Oracle, Wraith], pool {U:2}, life 20 → 10, turnsAhead 0, land drop used,
// pile [Wraith, Wraith, Island, Island, Island]. Goldfish WIN (v1 line: cycle ×3 → lib 2, life 4,
// cast Oracle UU, resolve 2 ≥ 2). The only library reducers are the 3 Wraith cycles; the only mana is the
// floating {U:2}; only one Oracle is reachable (the other is exiled); no Unearth. These facts drive every
// A' no_win proof below.
test("A' goldfish baseline is a win", () => expectWin(build(setupA2(), PILE_A2)));

// ---------------------------------------------------------------------------
// "Thorn of Amethyst": "Noncreature spells cost {1} more to cast."
const tapSwampB = (x) => act(x, (a) => a.type === 'tap' && a.card === SWAMP && a.color === 'B');

describe('Thorn of Amethyst', () => {
  test('taxes Brainstorm, not Oracle', () => {
    const s = st({ hand: [ORACLE, 'Brainstorm'], manaPool: { U: 2 } }, [perm(THORN)]);
    assert.ok(hasAction(s, isCastPaid('Brainstorm', { U: 2 })));
    assert.ok(!hasAction(st({ hand: ['Brainstorm'], manaPool: { U: 1 } }, [perm(THORN)]), isCast('Brainstorm')));
    assert.ok(hasAction(s, isCastPaid(ORACLE, { U: 2 })));
  });
  // A' + Thorn → WIN (Oracle is a creature: same line as A').
  // P3' (hand [Oracle, Brainstorm], pool {U:3}, life 10 → 5, land drop used) is a goldfish WIN (v1 puzzle 3a).
  // P3' + Thorn → NO WIN. Brainstorm now costs 2 and Oracle 2: 4 > 3. Without Brainstorm the Wraiths stay in the
  // library (no draw effect at all), so the library stays 5 > devotion 2. With Brainstorm, 1 U is left and
  // Oracle can't be cast; no land drop, no other mana. Machine cross-check with v1: P3' with {U:2} is no_win.
  test("A' + Thorn → win; P3' + Thorn → no_win", () => {
    expectWin(on(setupA2(), [perm(THORN)], PILE_A2));
    expectWin(on(setupP3(3), [], PILE_P3));
    expectNoWin(on(setupP3(3), [perm(THORN)], PILE_P3));
  });
});

// "Sphere of Resistance": "Spells cost {1} more to cast."
describe('Sphere of Resistance', () => {
  test('taxes creature spells too (Oracle {U}{U} + {1})', () => {
    assert.ok(!hasAction(st({ hand: [ORACLE], manaPool: { U: 2 } }, [perm(SPHERE)]), isCast(ORACLE)));
    assert.ok(hasAction(st({ hand: [ORACLE], manaPool: { U: 3 } }, [perm(SPHERE)]), isCastPaid(ORACLE, { U: 3 })));
  });
  // A' + Sphere → NO WIN: Oracle costs 3, the only mana is {U:2} (no land drop, no Petal) → never cast.
  test("A' + Sphere → no_win", () => expectNoWin(on(setupA2(), [perm(SPHERE)], PILE_A2)));
});

// "Trinisphere": "As long as Trinisphere is untapped, each spell that would cost less than three mana to cast
// costs three mana to cast. (Additional mana in the cost may be paid with any color of mana or colorless mana…)"
describe('Trinisphere', () => {
  test('Lotus Petal costs 3; Oracle costs {U}{U}+{1}; applied after Thalia', () => {
    assert.ok(!hasAction(st({ hand: [PETAL], manaPool: { B: 2 } }, [perm(TRINI)]), isCast(PETAL)));
    assert.ok(hasAction(st({ hand: [PETAL], manaPool: { B: 3 } }, [perm(TRINI)]), isCastPaid(PETAL, { B: 3 })));
    assert.ok(!hasAction(st({ hand: [ORACLE], manaPool: { U: 2 } }, [perm(TRINI)]), isCast(ORACLE)));
    assert.ok(hasAction(st({ hand: [ORACLE], manaPool: { U: 2, B: 1 } }, [perm(TRINI)]), isCastPaid(ORACLE, { U: 2, B: 1 })));
    // Thalia makes Brainstorm {U}+{1} = 2, Trinisphere then raises it to 3 (not 4).
    const tt = [perm(THALIA), perm(TRINI)];
    assert.ok(!hasAction(st({ hand: ['Brainstorm'], manaPool: { U: 2 } }, tt), isCast('Brainstorm')));
    assert.ok(hasAction(st({ hand: ['Brainstorm'], manaPool: { U: 3 } }, tt), isCastPaid('Brainstorm', { U: 3 })));
  });
  test('a tapped Trinisphere does nothing', () => {
    assert.ok(hasAction(st({ hand: [ORACLE], manaPool: { U: 2 } }, [perm(TRINI, { tapped: true })]), isCastPaid(ORACLE, { U: 2 })));
  });
  // A' + Trinisphere → NO WIN: Oracle costs 3 > {U:2}, no other mana. Tapped Trinisphere → A' line → WIN.
  test("A' + Trinisphere → no_win; tapped → win", () => {
    expectNoWin(on(setupA2(), [perm(TRINI)], PILE_A2));
    expectWin(on(setupA2(), [perm(TRINI, { tapped: true })], PILE_A2));
  });
});

// "Damping Sphere": "...Each spell a player casts costs {1} more to cast for each other spell that player has
// cast this turn."
describe('Damping Sphere', () => {
  test('tax = spells I already cast this turn (Doomsday counts by default)', () => {
    assert.ok(!hasAction(st({ hand: [ORACLE], manaPool: { U: 2 } }, [perm(DAMPING)]), isCast(ORACLE)));
    assert.ok(hasAction(st({ hand: [ORACLE], manaPool: { U: 2 }, noncreatureSpellsCastThisTurn: 0 }, [perm(DAMPING)]), isCastPaid(ORACLE, { U: 2 })));
    // 0 spells so far: Ritual costs {B}; then Oracle costs {U}{U}+{1}.
    let s = st({ hand: ['Dark Ritual', ORACLE], manaPool: { B: 1, U: 2 }, noncreatureSpellsCastThisTurn: 0 }, [perm(DAMPING)]);
    s = act(s, isCastPaid('Dark Ritual', { B: 1 }));
    assert.equal(s.spellsCast, 1);
    assert.ok(!hasAction(s, isCastPaid(ORACLE, { U: 2 })));
    assert.ok(hasAction(s, isCastPaid(ORACLE, { U: 2, B: 1 })));
  });
  // A' + Damping → NO WIN: spellsCast = 1 (Doomsday), so Oracle costs 3 > {U:2}; no other mana.
  test("A' + Damping Sphere → no_win", () => expectNoWin(on(setupA2(), [perm(DAMPING)], PILE_A2)));
});

// "Archon of Emeria": "Flying\nEach player can't cast more than one spell each turn.\nNonbasic lands your
// opponents control enter tapped."
describe('Archon of Emeria', () => {
  test('after Doomsday (spellsCast 1) no spell at all, Oracle included; cycling still works', () => {
    const s = st({ hand: [ORACLE, 'Brainstorm', WRAITH], manaPool: { U: 3 } }, [perm(ARCHON)]);
    assert.ok(!hasAction(s, isType('cast')));
    assert.ok(hasAction(s, isCycle(WRAITH)));
  });
  test('with 0 spells cast, exactly one spell', () => {
    let s = st({ hand: [ORACLE, 'Brainstorm'], manaPool: { U: 3 }, noncreatureSpellsCastThisTurn: 0 }, [perm(ARCHON)]);
    s = act(s, isCastPaid('Brainstorm', { U: 1 }));
    assert.ok(s.pendingChoice); // Brainstorm put-back
    s = actFirst(s, isType('choose'));
    assert.ok(!hasAction(s, isCast(ORACLE)));
  });
  test('my nonbasic lands enter tapped: played Underground Sea, fetched Underground Sea', () => {
    const p = act(st({ hand: [SEA] }, [perm(ARCHON)], [WRAITH, WRAITH, ISLAND, ISLAND, ISLAND]), isPlay(SEA));
    assert.equal(countOn(p.battlefield, SEA, true), 1);
    const f = st({ battlefield: [bf(DELTA)] }, [perm(ARCHON)], [SEA, WRAITH, WRAITH, ISLAND, ISLAND]);
    const outs = applyAction(f, findAction(f, isCrack(DELTA, SEA)));
    assert.ok(outs.length >= 1);
    for (const o of outs) assert.equal(countOn(o.state.battlefield, SEA, true), 1, 'fetched Sea enters tapped');
  });
  // A' + Archon → NO WIN: spellsCast is 1 on turn 0, so Oracle can't be cast; turnsAhead 0; nothing else wins.
  test("A' + Archon → no_win", () => expectNoWin(on(setupA2(), [perm(ARCHON)], PILE_A2)));
});

// "Pithing Needle": "As Pithing Needle enters the battlefield, choose a card name.\nActivated abilities of
// sources with the chosen name can't be activated unless they're mana abilities."
describe('Pithing Needle', () => {
  test('stops cycling and fetch activation of the named card; no tax; mana abilities fine', () => {
    assert.ok(!hasAction(st({ hand: [WRAITH] }, [perm(NEEDLE, { named: WRAITH })]), isCycle(WRAITH)));
    assert.ok(!hasAction(st({ battlefield: [bf(DELTA)] }, [perm(NEEDLE, { named: DELTA })]), isType('crack_fetch')));
    assert.ok(hasAction(st({ battlefield: [bf(DELTA)] }, [perm(NEEDLE, { named: WRAITH })]), isType('crack_fetch')));
    assert.ok(hasAction(st({ hand: ['Brainstorm'], manaPool: { U: 1 } }, [perm(NEEDLE, { named: 'Brainstorm' })]), isCastPaid('Brainstorm', { U: 1 })));
    assert.ok(hasAction(st({ battlefield: [bf(PETAL)] }, [perm(NEEDLE, { named: PETAL })]), isSacPetal('U')));
  });
  // BR (v1 branch puzzle) is a WIN; with Needle on Polluted Delta → NO WIN, by the v1 proof of its Flute
  // control: Oracle needs {U}{U}; the Island gives one U and the only other U source is a land fetched by
  // Delta (no Petal/LED/Ritual, land drop used). Needle stops the crack → one U → Oracle never cast.
  test('BR win; BR + Needle(Polluted Delta) → no_win', () => {
    expectWin(build(setupBR(), PILE_BR));
    expectNoWin(on(setupBR(), [perm(NEEDLE, { named: DELTA })], PILE_BR));
  });
});

// "Collector Ouphe": "Activated abilities of artifacts can't be activated."
// "Karn, the Great Creator": "Activated abilities of artifacts your opponents control can't be activated. ..."
describe('Collector Ouphe and Karn, the Great Creator', () => {
  for (const name of [OUPHE, KARN]) {
    test(`${name}: Lotus Petal and Lion's Eye Diamond can't be activated; casting them and land mana still work`, () => {
      const s = st({ hand: [PETAL], battlefield: [bf(PETAL), bf(LED), bf(ISLAND)] }, [perm(name)]);
      assert.ok(!hasAction(s, isType('sac_petal')));
      assert.ok(!hasAction(s, isType('activate_led')));
      assert.ok(hasAction(s, isCast(PETAL)));
      assert.ok(hasAction(s, isTap(ISLAND, 'U')));
    });
    // PA (A' with Petal in play and {U:1}) → WIN: sac Petal for U, Oracle UU, then the A' line.
    // PA + Ouphe/Karn → NO WIN: the only mana is the floating U (Petal can't be activated; land drop used;
    // no lands in play) → Oracle never cast. Cross-check: v1 says PA without the Petal is no_win.
    test(`PA win; PA + ${name} → no_win`, () => {
      expectWin(build(setupPA(), PILE_A2));
      expectNoWin(on(setupPA(), [perm(name)], PILE_A2));
    });
  }
});

// "Grafdigger's Cage": "Creature cards in graveyards and libraries can't enter the battlefield.\nPlayers can't
// cast spells from graveyards or libraries."
describe("Grafdigger's Cage", () => {
  test('Unearth on the countered Oracle resolves but Oracle stays in the graveyard', () => {
    let s = on(setupP1(), [perm(CHALICE, { x: 2 }), perm(CAGE)], PILE_P1);
    s = act(s, isCastPaid(ORACLE, { U: 2 })); // Chalice 2 counters it
    assert.ok(s.graveyard.includes(ORACLE));
    s = act(s, (a) => a.type === 'cast' && a.card === 'Unearth' && a.target === ORACLE);
    assert.ok(s.graveyard.includes(ORACLE));
    assert.equal(countOn(s.battlefield, ORACLE), 0);
    assert.equal(s.pendingTrigger, false);
  });
  // P1 (v1 custom puzzle 1) is a WIN only by Unearthing the Chalice-countered Oracle (v1 proof: Oracle can
  // only enter via Unearth). With Cage, Unearth returns nothing → no Oracle ever enters → NO WIN.
  test('P1 + Cage → no_win', () => {
    expectNoWin(on(setupP1(), [perm(CHALICE, { x: 2 }), perm(CAGE)], PILE_P1));
  });
});

// "Torpor Orb": "Creatures entering don't cause abilities to trigger."
describe('Torpor Orb', () => {
  test("Oracle enters with no trigger", () => {
    const s = act(st({ hand: [ORACLE], manaPool: { U: 2 } }, [perm(TORPOR)]), isCastPaid(ORACLE, { U: 2 }));
    assert.equal(countOn(s.battlefield, ORACLE), 1);
    assert.equal(s.pendingTrigger, false);
    assert.ok(!hasAction(s, isResolve));
  });
  // A' + Torpor → NO WIN: a win needs an Oracle trigger; the one reachable Oracle enters without one.
  test("A' + Torpor Orb → no_win", () => expectNoWin(on(setupA2(), [perm(TORPOR)], PILE_A2)));
});

// "Teferi, Time Raveler": "Each opponent can cast spells only any time they could cast a sorcery. ..."
describe('Teferi, Time Raveler', () => {
  test('instants only at sorcery timing; cycling is still fine', () => {
    let s = st({ hand: [ORACLE, 'Brainstorm', WRAITH, 'Dark Ritual'], battlefield: [bf(SWAMP)], manaPool: { U: 3 }, turnsAhead: 1 }, [perm(TEFERI)]);
    assert.ok(hasAction(s, isCast('Brainstorm')), 'main phase, empty stack: allowed');
    s = act(s, isCastPaid(ORACLE, { U: 2 }));
    assert.equal(s.pendingTrigger, true);
    assert.ok(!hasAction(s, isCast('Brainstorm')), 'trigger on the stack: not sorcery timing');
    assert.ok(hasAction(s, isCycle(WRAITH)));
    // Lead fix (TEST_DISPUTES D1): casts pay from the pool (SPEC §5.4), so tap the Swamp first.
    const o = st({ hand: ['Dark Ritual', WRAITH], battlefield: [bf(SWAMP)], turnsAhead: 1 }, [perm(TEFERI)]);
    const opp = tapSwampB(passOnce(o));
    assert.equal(opp.phase, 'opp');
    assert.ok(!hasAction(opp, isCast('Dark Ritual')));
    assert.ok(hasAction(opp, isCycle(WRAITH)));
    const ctl = tapSwampB(passOnce(st({ hand: ['Dark Ritual', WRAITH], battlefield: [bf(SWAMP)], turnsAhead: 1 }, [])));
    assert.ok(hasAction(ctl, isCast('Dark Ritual')), 'control: without Teferi the instant is castable on their turn');
  });
  // T (hand [Consider], Island untapped + Sea tapped, life 20 → 10, turnsAhead 1, pile [W, O, W, W, W]):
  // T + Deafening Silence → WIN: turn 0 Silence blocks Consider (Doomsday counted). Opponent's turn: count reset;
  //   tap Island, Consider (keep Wraith, draw it; lib [O,W,W,W]); cycle Wraith (life 8) draw Oracle (lib 3).
  //   Turn 1: draw Wraith (lib 2); Island + Sea = UU; Oracle; resolve 2 ≥ 2. (v1 solver: win.)
  // T + Silence + Teferi → NO WIN: turn 0 Silence forbids Consider; on the opponent's turn Teferi forbids it;
  //   no Wraith in hand, so nothing changes before turn 1. Turn 1: draw Wraith (lib [O,W,W,W]); only Island +
  //   Sea = 2 mana (no land in hand or library). Getting Oracle needs a draw: cycle (draw O, lib 3) or Consider.
  //   Lib 3 > 2 needs one more reduction: Consider costs U, leaving 1 for Oracle (UU) → impossible; casting
  //   Oracle first spends both and Consider is an instant (no sorcery timing with the trigger pending, and no
  //   mana). Cycling the second Wraith requires drawing it, which also needs Consider. → no line.
  //   (v1 cross-check: from turn 1 with no earlier actions, the solver says no_win.)
  test('T + Silence → win; T + Silence + Teferi → no_win', () => {
    expectWin(on(setupT(), [perm(SILENCE)], PILE_T));
    expectNoWin(on(setupT(), [perm(SILENCE), perm(TEFERI)], PILE_T));
  });
});

// "Voice of Victory": "Mobilize 2 (...)\nYour opponents can't cast spells during your turn."
describe('Voice of Victory', () => {
  test("no spells on the opponent's turn; cycling fine; my own turn unaffected", () => {
    // Lead fix (TEST_DISPUTES D1): casts pay from the pool (SPEC §5.4).
    const s = st({ hand: ['Dark Ritual', WRAITH], battlefield: [bf(SWAMP)], manaPool: { B: 1 }, turnsAhead: 1 }, [perm(VOICE)]);
    assert.ok(hasAction(s, isCast('Dark Ritual')));
    const opp = tapSwampB(passOnce(s));
    assert.ok(!hasAction(opp, isCast('Dark Ritual')));
    const ctl = tapSwampB(passOnce(st({ hand: ['Dark Ritual', WRAITH], battlefield: [bf(SWAMP)], turnsAhead: 1 }, [])));
    assert.ok(hasAction(ctl, isCast('Dark Ritual')), 'control: without Voice the instant is castable on their turn');
    assert.ok(hasAction(opp, isCycle(WRAITH)));
    let t = st({ hand: [ORACLE, 'Brainstorm'], manaPool: { U: 3 } }, [perm(VOICE)]);
    t = act(t, isCastPaid(ORACLE, { U: 2 }));
    assert.ok(hasAction(t, isCast('Brainstorm')), 'instants with the trigger pending on my turn are fine');
  });
  // T + Silence + Voice → NO WIN: same proof as Teferi (Voice stops the opponent-turn Consider; turn 1 has
  // only 2 mana for Consider + Oracle). Its attack (1 power, Mobilize ignored or not) leaves life ≥ 7, and
  // the proof doesn't use life.
  test('T + Silence + Voice of Victory → no_win', () => {
    expectNoWin(on(setupT(), [perm(SILENCE), perm(VOICE)], PILE_T));
  });
});

// "Narset, Parter of Veils": "Each opponent can't draw more than one card each turn. ..."
describe('Narset, Parter of Veils', () => {
  test('after the draw step (default cardsDrawnThisTurn 1) cycling draws nothing', () => {
    const s0 = st({ hand: [WRAITH] }, [perm(NARSET)]);
    const s = act(s0, isCycle(WRAITH));
    assert.deepEqual(s.library, s0.library);
    assert.deepEqual(s.hand, []);
    assert.equal(s.life, s0.life - 2);
    assert.ok(s.graveyard.includes(WRAITH));
  });
  test('with 0 cards drawn this turn: the first cycle draws, the second does not', () => {
    let s = st({ hand: [WRAITH, WRAITH], cardsDrawnThisTurn: 0 }, [perm(NARSET)]);
    s = act(s, isCycle(WRAITH));
    assert.equal(s.library.length, 4);
    assert.equal(s.drawsThisTurn, 1);
    s = act(s, isCycle(WRAITH));
    assert.equal(s.library.length, 4);
  });
  test('Brainstorm with 0 drawn: draws 1, still puts back 2 (library 5 → 6)', () => {
    let s = st({ hand: ['Brainstorm', ORACLE, 'Island'], manaPool: { U: 1 }, cardsDrawnThisTurn: 0 }, [perm(NARSET)]);
    s = act(s, isCastPaid('Brainstorm', { U: 1 }));
    assert.equal(s.library.length, 4);
    assert.equal(s.pendingChoice.kind, 'brainstorm');
    s = actFirst(s, (a) => a.type === 'choose' && a.option.length === 2 && !a.option.includes(ORACLE));
    assert.equal(s.library.length, 6);
  });
  test('the next turn resets the count: the draw step draws', () => {
    const s = passOnce(passOnce(st({ turnsAhead: 1 }, [perm(NARSET)])));
    assert.equal(s.library.length, 4);
    assert.equal(s.drawsThisTurn, 1);
  });
  // A' + Narset → NO WIN: turn 0 already had its draw (cardsDrawnThisTurn 1), so no cycle draws; the library
  // stays 5 > devotion 2; turnsAhead 0.
  test("A' + Narset → no_win", () => expectNoWin(on(setupA2(), [perm(NARSET)], PILE_A2)));
});

// "Hullbreacher": "Flash\nIf an opponent would draw a card except the first one they draw in each of their draw
// steps, instead you create a Treasure token. ..."
describe('Hullbreacher', () => {
  test('cycling: no card drawn, the opponent gets a Treasure', () => {
    const s0 = st({ hand: [WRAITH] }, [perm(HULL)]);
    const s = act(s0, isCycle(WRAITH));
    assert.deepEqual(s.library, s0.library);
    assert.equal(s.opp.treasures, 1);
  });
  test('Brainstorm: 0 drawn, 3 Treasures, puts back 2 (library 5 → 7)', () => {
    let s = st({ hand: ['Brainstorm', ORACLE, 'Island', WRAITH], manaPool: { U: 1 } }, [perm(HULL)]);
    s = act(s, isCastPaid('Brainstorm', { U: 1 }));
    assert.equal(s.library.length, 5);
    assert.equal(s.opp.treasures, 3);
    s = act(s, (a) => a.type === 'choose' && !a.option.includes(ORACLE) && a.option.length === 2 && a.option[0] === 'Island');
    assert.equal(s.library.length, 7);
  });
  test('the first draw of my draw step is not replaced', () => {
    const s = passOnce(passOnce(st({ turnsAhead: 1 }, [perm(HULL)])));
    assert.equal(s.library.length, 4);
    assert.equal(s.opp.treasures, 0);
  });
  // A' + Hullbreacher → NO WIN: every cycle draw is replaced; the library stays 5 > 2; turnsAhead 0.
  test("A' + Hullbreacher → no_win", () => expectNoWin(on(setupA2(), [perm(HULL)], PILE_A2)));
});

// "Orcish Bowmasters": "Flash\nWhen this creature enters and whenever an opponent draws a card except the first
// one they draw in each of their draw steps, this creature deals 1 damage to any target. Then amass Orcs 1."
describe('Orcish Bowmasters on the battlefield', () => {
  test('each cycle draw pings me (no pending trigger) and amasses an Orc Army', () => {
    let s = st({ hand: [WRAITH, WRAITH] }, [perm(BOWMASTERS)]);
    const life = s.life;
    const o1 = outcomesOf(s, isCycle(WRAITH));
    assert.equal(o1.length, 1, 'only target: me');
    assert.equal(using(o1, BOWMASTERS, 'ping', 'me').length, 1);
    s = o1[0].state;
    assert.equal(s.life, life - 3);
    assert.equal(s.opponent.permanents.find((p) => p.name === 'Orc Army')?.power, 1);
    s = outcomesOf(s, isCycle(WRAITH))[0].state;
    assert.equal(s.life, life - 6);
    assert.equal(s.opponent.permanents.find((p) => p.name === 'Orc Army')?.power, 2);
  });
  test('with the Oracle trigger pending the ping may hit Oracle instead (AND outcomes)', () => {
    let s = st({ hand: [ORACLE, WRAITH], manaPool: { U: 2 } }, [perm(BOWMASTERS)]);
    s = act(s, isCastPaid(ORACLE, { U: 2 }));
    const outs = outcomesOf(s, isCycle(WRAITH));
    const me = using(outs, BOWMASTERS, 'ping', 'me');
    const or = using(outs, BOWMASTERS, 'ping', ORACLE);
    assert.equal(me.length, 1);
    assert.equal(or.length, 1);
    assert.equal(me[0].state.life, s.life - 3);
    assert.equal(or[0].state.life, s.life - 2);
    assert.equal(or[0].state.battlefield.find((p) => p.name === ORACLE).damage, 1);
  });
  test('no ping for the first draw of my draw step', () => {
    const s = passOnce(passOnce(st({ turnsAhead: 1 }, [perm(BOWMASTERS)])));
    assert.equal(s.library.length, 4);
    // Turn 0 → opp turn: Bowmasters (1/1) attacks, life 10 → 9; the draw step adds no ping.
    assert.equal(s.life, 9);
  });
  // A' at life 20 → 10 + Bowmasters → WIN: cycle ×3 first (no Oracle yet, so every ping hits me):
  //   10 → 7 → 4 → 1 (each cycle 2 life + 1 ping; life ≥ 2 before each cycle: 10, 7, 4). Cast Oracle (no draw),
  //   resolve: lib 2 ≤ 2 → win.
  // A' at life 18 → 9 → NO WIN: 3 cycles are needed (the only reducers) and each costs 3 life whoever the ping
  //   targets is me; if Oracle is cast first the adversary may instead ping it (3 pings kill it: toughness 3,
  //   devotion → 0 < lib 2) or ping me. Pinging me always: 9 − 9 = 0 → loss. So the AND fails in every order.
  test("A' + Bowmasters: life 20 → win, life 18 → no_win", () => {
    expectWin(on(setupA2(), [perm(BOWMASTERS)], PILE_A2));
    expectNoWin(on(setupA2({ lifeBeforeDoomsday: 18 }), [perm(BOWMASTERS)], PILE_A2));
  });
});

// "Blood Moon": "Nonbasic lands are Mountains."  "Magus of the Moon": "Nonbasic lands are Mountains."
// Scryfall rulings (2020-08-07): a nonbasic land loses an "enters tapped" ability and an ETB trigger before
// they apply.
describe('Blood Moon and Magus of the Moon', () => {
  for (const name of [BLOOD_MOON, MAGUS]) {
    test(`${name}: Sea/Cavern tap only for R, fetches can't crack, basics unchanged, Sewers enters untapped without surveil`, () => {
      const s = st({ deck: deckWith({ [CAVERN]: 1 }), battlefield: [bf(SEA), bf(CAVERN), bf(DELTA), bf(ISLAND)] }, [perm(name)]);
      const taps = (card) => legalActions(s).filter((a) => a.type === 'tap' && a.card === card).map((a) => a.color).sort();
      assert.deepEqual(taps(SEA), ['R']);
      assert.deepEqual(taps(CAVERN), ['R']);
      assert.deepEqual(taps(ISLAND), ['U']);
      assert.ok(!hasAction(s, isType('crack_fetch')));
      const w = act(st({ hand: [SEWERS] }, [perm(name)], [WRAITH, WRAITH, ISLAND, ISLAND, ISLAND]), isPlay(SEWERS));
      assert.equal(countOn(w.battlefield, SEWERS, false), 1);
      assert.equal(w.pendingChoice, null);
    });
  }
  // H (v1 canonical H, turnsAhead 1) is a WIN (v1). H + Blood Moon / Magus → NO WIN: Oracle needs {U}{U} on
  // turn 1 (no mana on turn 0, and Oracle is sorcery-speed). Both Seas now tap only for R. The only other U
  // source is a basic Island played from hand: one land drop per turn, and on turn 0 no Island can be in hand
  // (3 cycles draw W, W, O; Islands are 4th/5th). So turn 1 has at most one U. (v1 cross-check: H with no
  // Seas at all is no_win.) Magus's 2-power attack doesn't matter to this proof.
  test('H win; H + Blood Moon → no_win; H + Magus → no_win', () => {
    expectWin(build(setupH(), PILE_H));
    expectNoWin(on(setupH(), [perm(BLOOD_MOON)], PILE_H));
    expectNoWin(on(setupH(), [perm(MAGUS)], PILE_H));
  });
});

// "Back to Basics": "Nonbasic lands don't untap during their controllers' untap steps."
describe('Back to Basics', () => {
  test('my nonbasic lands stay tapped through my untap step; basics untap', () => {
    const s = passOnce(passOnce(st({ battlefield: [bf(SEA, true), bf(ISLAND, true)], turnsAhead: 1 }, [perm(B2B)])));
    assert.equal(s.turn, 1);
    assert.equal(countOn(s.battlefield, SEA, true), 1);
    assert.equal(countOn(s.battlefield, ISLAND, false), 1);
  });
  // H + Back to Basics → NO WIN: the tapped Seas never untap; same as the Blood Moon proof (≤ 1 U on turn 1).
  test('H + Back to Basics → no_win', () => expectNoWin(on(setupH(), [perm(B2B)], PILE_H)));
});

// "Dauthi Voidwalker": "Shadow ...\nIf a card would be put into an opponent's graveyard from anywhere, instead
// exile it with a void counter on it.\n{T}, Sacrifice this creature: ..."
describe('Dauthi Voidwalker', () => {
  test('Doomsday is exiled at resolution; cycled cards go to exile; no Unearth target', () => {
    const s0 = on(setupP1(), [perm(CHALICE, { x: 2 }), perm(VOIDWALKER)], PILE_P1);
    assert.deepEqual(s0.graveyard, []);
    assert.ok(s0.exile.includes('Doomsday'));
    const c = act(s0, isCycle(WRAITH));
    assert.ok(c.exile.includes(WRAITH));
    assert.ok(!c.graveyard.includes(WRAITH));
    const o = act(s0, isCastPaid(ORACLE, { U: 2 })); // countered by Chalice → exile
    assert.ok(o.exile.includes(ORACLE));
    assert.ok(!hasAction(o, isCast('Unearth')), 'Unearth has no target');
  });
  // P4 (v1 puzzle 4a) is a WIN only via Flow State taking two cards, which needs an instant AND a sorcery in
  // my graveyard. With Voidwalker my graveyard is always empty (Doomsday exiled at start, Ritual exiled), so
  // Flow State takes one: the v1 4b proof applies (Flow State −1, one Wraith cycle at life 3 → 1; library
  // 5 − 2 = 3 > 2; land drops don't touch the library) → NO WIN. (v1 cross-check: P4a with the graveyard
  // emptied is no_win.)
  test('P4 win; P4 + Voidwalker → no_win', () => {
    expectWin(build(setupP4(), PILE_P4));
    expectNoWin(on(setupP4(), [perm(VOIDWALKER)], PILE_P4));
  });
});

// "Goblin Guide": "Haste\nWhenever Goblin Guide attacks, defending player reveals the top card of their library.
// If it's a land card, that player puts it into their hand."
describe('Goblin Guide', () => {
  test('its attack moves a land from my library top into my hand (not a draw); a nonland stays', () => {
    const s0 = on(setupGG(), [perm(GUIDE)], PILE_GG);
    const s = passOnce(s0);
    assert.deepEqual(s.library, [ORACLE, WRAITH, ISLAND, ISLAND]);
    sameMultiset(s.hand, [WRAITH, ISLAND]);
    assert.equal(s.life, s0.life - 2);
    assert.equal(s.drawsThisTurn, 0);
    const t = passOnce(on(setupGG(), [perm(GUIDE)], [WRAITH, ORACLE, ISLAND, ISLAND, ISLAND]));
    assert.deepEqual(t.library, [WRAITH, ORACLE, ISLAND, ISLAND, ISLAND]);
  });
  // GG (hand [Wraith], two tapped Seas, life 20 → 10, turnsAhead 1, pile [I, O, W, I, I]).
  // Without Guide → NO WIN: reductions before turn-1 resolution are the one hand Wraith's cycle and the turn-1
  //   draw (the second Wraith is 3rd from the top and needs a 3rd draw; nothing else draws) → lib ≥ 3 > 2.
  //   (v1: no_win.)
  // With Guide → WIN: don't act on turn 0. Opponent's turn: Guide attacks: reveals Island → my hand
  //   (lib [O, W, I, I]), life 10 → 8. Cycle Wraith: draw Oracle (lib 3), life 6. Turn 1: draw Wraith (lib 2);
  //   Seas → UU; Oracle; resolve 2 ≥ 2. (v1 cross-check from the simulated mid-state: win.)
  test('GG no_win; GG + Goblin Guide → win', () => {
    expectNoWin(build(setupGG(), PILE_GG));
    expectWin(on(setupGG(), [perm(GUIDE)], PILE_GG));
  });
});

// "Tormod's Crypt": "{T}, Sacrifice Tormod's Crypt: Exile target player's graveyard."
describe("Tormod's Crypt (visible adversary ability)", () => {
  test('in response to Unearth it exiles Oracle from my graveyard: Unearth does nothing; used once', () => {
    let s = on(setupP1(), [perm(CHALICE, { x: 2 }), perm(CRYPT)], PILE_P1);
    // Oracle into Chalice. (The cast is countered by Chalice, so no window opens.)
    s = act(s, isCastPaid(ORACLE, { U: 2 }));
    const outs = outcomesOf(s, (a) => a.type === 'cast' && a.card === 'Unearth' && a.target === ORACLE);
    const q = quietState(outs);
    assert.equal(q.pendingTrigger, true, 'no response: Oracle returns');
    const c = using(outs, CRYPT, 'exile_graveyard');
    assert.ok(c.length >= 1);
    for (const o of c) {
      assert.equal(countOn(o.state.battlefield, ORACLE), 0);
      assert.ok(o.state.exile.includes(ORACLE));
      assert.equal(o.state.pendingTrigger, false);
      assert.ok(!o.state.opponent.permanents.some((p) => p.name === CRYPT), 'sacrificed');
    }
  });
  // P1 + Crypt → NO WIN: by the P1 proof Oracle can only enter via Unearth from the graveyard; the adversary
  // answers the Unearth cast by exiling my graveyard → Unearth has no target → no Oracle ever enters.
  test('P1 + Crypt → no_win', () => {
    expectNoWin(on(setupP1(), [perm(CHALICE, { x: 2 }), perm(CRYPT)], PILE_P1));
  });
});

// "Wasteland": "{T}: Add {C}.\n{T}, Sacrifice Wasteland: Destroy target nonbasic land."
describe('Wasteland (visible adversary ability)', () => {
  test("at the start of the opponent's turn it may destroy an Underground Sea; never a basic", () => {
    const outs = outcomesOf(on(setupH(), [perm(WASTELAND)], PILE_H), isPass);
    assert.equal(quiet(outs).length, 1);
    const w = using(outs, WASTELAND, 'destroy', SEA);
    assert.ok(w.length >= 1);
    for (const o of w) {
      assert.equal(countOn(o.state.battlefield, SEA), 1);
      assert.ok(o.state.graveyard.includes(SEA));
      assert.ok(!o.state.opponent.permanents.some((p) => p.name === WASTELAND));
    }
    const b = outcomesOf(on(setupIH(), [perm(WASTELAND)], PILE_IH), isPass);
    assert.equal(using(b, WASTELAND).length, 0, 'basic Islands are not targets');
  });
  // H + 1 Wasteland → WIN: cycle ×3 on turn 0 (draw W, W, O; life 4; lib [I, I]). Whenever the Wasteland
  //   hits a Sea (opp turn or my upkeep), turn 1: draw Island (lib 1), play it, tap it + the other Sea → UU,
  //   Oracle, resolve 2 ≥ 1. (v1 cross-check: H with one Sea is a win.)
  // H + 2 Wastelands → NO WIN: both Seas can be destroyed before my turn-1 main phase; then turn 1 has at most
  //   one U (one Island land drop; none on turn 0), as in the Blood Moon proof. (v1: H with no Sea: no_win.)
  // IH + 2 Wastelands → WIN: IH's Islands are basic, so Wasteland has no target; IH goldfish line (below).
  test('H + 1 Wasteland → win; H + 2 Wastelands → no_win; IH + 2 Wastelands → win', () => {
    expectWin(on(setupH(), [perm(WASTELAND)], PILE_H));
    expectNoWin(on(setupH(), [perm(WASTELAND), perm(WASTELAND)], PILE_H));
    expectWin(on(setupIH(), [perm(WASTELAND), perm(WASTELAND)], PILE_IH));
  });
});

// "Ghost Quarter": "{T}: Add {C}.\n{T}, Sacrifice Ghost Quarter: Destroy target land. Its controller may search
// their library for a basic land card, put it onto the battlefield, then shuffle."
describe('Ghost Quarter (visible adversary ability)', () => {
  test('destroys any land; then I choose: no search, or a basic from my library (untapped) + shuffle', () => {
    const outs = outcomesOf(on(setupH(), [perm(GQ)], PILE_H), isPass);
    const g = using(outs, GQ, 'destroy', SEA);
    assert.equal(g.length, 1);
    const s = g[0].state;
    assert.equal(countOn(s.battlefield, SEA), 1);
    assert.equal(s.pendingChoice?.kind, 'ghost_quarter');
    const opts = legalActions(s).map((a) => a.option);
    assert.ok(opts.includes(null));
    assert.ok(opts.includes(ISLAND));
    const decline = applyAction(s, findAction(s, isChooseOpt((o) => o === null)));
    assert.equal(decline.length, 1);
    assert.deepEqual(decline[0].state.library, PILE_H);
    const search = applyAction(s, findAction(s, isChooseOpt((o) => o === ISLAND)));
    assert.ok(search.length >= 2, 'the shuffle gives several orderings');
    for (const o of search) {
      assert.equal(countOn(o.state.battlefield, ISLAND, false), 1);
      assert.equal(o.state.library.length, 4);
    }
    // Ghost Quarter can also hit a basic Island (unlike Wasteland).
    const b = outcomesOf(on(setupIH(), [perm(GQ)], PILE_IH), isPass);
    assert.ok(using(b, GQ, 'destroy', ISLAND).length >= 1);
  });
  // IH (H with two tapped basic Islands, pile [W, W, O, Sea, Sea]) → WIN: cycle ×3 (lib [Sea, Sea], life 4);
  //   turn 1: draw Sea, play it, three U sources; Oracle; resolve 2 ≥ 1. (v1: win.)
  // IH + 2 Ghost Quarters → NO WIN: both Islands can be destroyed before turn-1 main; my library holds no
  //   basic land (only W, W, O, Sea, Sea), so the search finds nothing. Turn 1 then has one land drop (a Sea:
  //   none can be in hand on turn 0, as 3 cycles draw W, W, O) = one U < UU. (v1: IH with no lands: no_win.)
  test('IH win; IH + 2 Ghost Quarters → no_win', () => {
    expectWin(build(setupIH(), PILE_IH));
    expectNoWin(on(setupIH(), [perm(GQ), perm(GQ)], PILE_IH));
  });
});

test('the opponent board pieces never make status() throw (sanity)', () => {
  const s = st({}, [perm(NARSET), perm(HULL), perm(BOWMASTERS), perm(TORPOR), perm(TEFERI)]);
  assert.equal(status(s), 'ongoing');
});
