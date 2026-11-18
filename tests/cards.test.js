// Spec §7: every supported card's legality, cost, effect, choices and randomness.
// Decision mechanisms that §7 does not pin down (Consider, Flow State, Personal Tutor,
// Edge of Autumn's search, Oracle's top-X) are tested mechanism-agnostically through
// leaves()/decisionGroups() — see SPEC_QUESTIONS.md Q1.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { legalActions, applyAction, status } from '../src/engine.js';
import {
  ORACLE, WRAITH, SEA, SEWERS, DELTA, LED, PETAL, CAVERN, THALIA, TEEG, CHALICE,
  start, deckWith, bf, counts, normCounts, sameMultiset, pool, poolTotal, normPay, distinctPerms,
  isType, isCast, isCastPaid, isCycle, isTap, isPlay, isCrack, isSacPetal, isLed, isPass, isChoose,
  findAction, findActions, hasAction, apply1, act, leaves, leavesOf, decisionGroups,
  assertLabels, assertDistinctLibraries, countOn, oppNames,
} from './helpers.js';

const bfKey = (p) => `${p.name}|${!!p.tapped}`;
const summary = (s) => JSON.stringify({
  hand: [...s.hand].sort(), library: s.library, graveyard: [...s.graveyard].sort(),
});

// ---------------------------------------------------------------------------
describe('basic lands, Underground Sea, Cavern', () => {
  const PILE = [WRAITH, WRAITH, 'Swamp', 'Swamp', 'Swamp'];

  test('Island: play_land puts it onto the battlefield untapped and uses the land drop; tap adds U', () => {
    let s = start({ hand: ['Island'] }, PILE);
    s = act(s, isPlay('Island'));
    assert.deepEqual(s.hand, []);
    assert.equal(countOn(s.battlefield, 'Island', false), 1);
    assert.equal(s.landPlayed, true);
    s = act(s, isTap('Island', 'U'));
    assert.equal(pool(s.pool).U, 1);
    assert.equal(countOn(s.battlefield, 'Island', true), 1);
  });

  test('Swamp: one tap action, for B', () => {
    const s = start({ battlefield: [bf('Swamp')] }, [WRAITH, WRAITH, 'Swamp', 'Swamp', 'Island']);
    const taps = findActions(s, isType('tap'));
    assert.equal(taps.length, 1);
    assert.equal(taps[0].color, 'B');
    assert.equal(pool(apply1(s, taps[0]).pool).B, 1);
  });

  test('Underground Sea: tap for U or B', () => {
    const s = start({ battlefield: [bf(SEA)] }, PILE);
    assert.deepEqual(findActions(s, isType('tap')).map((a) => a.color).sort(), ['B', 'U']);
  });

  test('Cavern of Souls enters untapped; {T}: C goes to the normal pool', () => {
    let s = start({ deck: deckWith({ [CAVERN]: 1 }), hand: [CAVERN] }, PILE);
    s = act(s, isPlay(CAVERN));
    assert.equal(countOn(s.battlefield, CAVERN, false), 1);
    s = act(s, isTap(CAVERN, 'C'));
    assert.equal(pool(s.pool).C, 1);
  });
});

// ---------------------------------------------------------------------------
describe('Undercity Sewers', () => {
  test('enters tapped, uses the land drop and asks surveil 1 (keep or graveyard)', () => {
    const pile = [ORACLE, 'Island', 'Island', 'Island', 'Island'];
    const s = act(start({ hand: [SEWERS] }, pile), isPlay(SEWERS));
    assert.equal(countOn(s.battlefield, SEWERS, true), 1);
    assert.equal(s.landPlayed, true);
    assert.ok(s.pendingChoice);
    assert.equal(s.pendingChoice.kind, 'surveil');
    const opts = legalActions(s);
    assert.equal(opts.length, 2);
    assert.ok(opts.every(isChoose));
    const results = opts.map((o) => apply1(s, o));
    const kept = results.filter((r) => r.library.length === 5);
    const binned = results.filter((r) => r.library.length === 4);
    assert.equal(kept.length, 1);
    assert.equal(binned.length, 1);
    assert.deepEqual(kept[0].library, pile);
    assert.deepEqual(kept[0].graveyard, ['Doomsday']);
    assert.deepEqual(binned[0].library, ['Island', 'Island', 'Island', 'Island']);
    sameMultiset(binned[0].graveyard, ['Doomsday', ORACLE]);
    for (const r of results) assert.equal(r.pendingChoice, null);
  });

  test('with an empty library there is no surveil choice', () => {
    const s = act(start({ deck: { Doomsday: 1, [SEWERS]: 1 }, hand: [SEWERS] }, []), isPlay(SEWERS));
    assert.equal(s.pendingChoice, null);
    assert.equal(countOn(s.battlefield, SEWERS, true), 1);
    assert.equal(status(s), 'ongoing');
  });

  test('untapped Sewers (from setup) taps for U or B', () => {
    const s = start({ battlefield: [bf(SEWERS)] }, [WRAITH, WRAITH, 'Island', 'Island', 'Island']);
    assert.deepEqual(findActions(s, isType('tap')).map((a) => a.color).sort(), ['B', 'U']);
  });
});

// ---------------------------------------------------------------------------
describe('fetchlands', () => {
  test('Polluted Delta → Island: pay 1 life, sacrifice, Island untapped, library AND-shuffled (dedup by name)', () => {
    const pile = ['Island', WRAITH, WRAITH, 'Swamp', 'Swamp'];
    const s = start({ battlefield: [bf(DELTA)] }, pile);
    const out = applyAction(s, findAction(s, isCrack(DELTA, 'Island')));
    assert.equal(out.length, distinctPerms([WRAITH, WRAITH, 'Swamp', 'Swamp'])); // 6
    assertLabels(out);
    assertDistinctLibraries(out);
    for (const { state: o } of out) {
      assert.equal(o.life, 9);
      assert.ok(o.graveyard.includes(DELTA));
      assert.equal(countOn(o.battlefield, DELTA), 0);
      assert.equal(countOn(o.battlefield, 'Island', false), 1);
      sameMultiset(o.library, [WRAITH, WRAITH, 'Swamp', 'Swamp']);
      assert.equal(status(o), 'ongoing');
    }
  });

  test('finding nothing is allowed and still shuffles the library', () => {
    const pile = ['Island', WRAITH, WRAITH, 'Swamp', 'Swamp'];
    const s = start({ battlefield: [bf(DELTA)] }, pile);
    const out = applyAction(s, findAction(s, isCrack(DELTA, null)));
    assert.equal(out.length, distinctPerms(pile)); // 30
    assertLabels(out);
    assertDistinctLibraries(out);
    for (const { state: o } of out) {
      assert.equal(o.life, 9);
      assert.ok(o.graveyard.includes(DELTA));
      assert.deepEqual(o.battlefield, []);
      sameMultiset(o.library, pile);
    }
  });

  test('each fetchland finds exactly the land types it lists (plus "nothing")', () => {
    const extra = { 'Flooded Strand': 1, 'Bloodstained Mire': 1, 'Misty Rainforest': 1, 'Scalding Tarn': 1, 'Verdant Catacombs': 1 };
    const pile = ['Island', 'Swamp', SEA, SEWERS, WRAITH];
    const table = {
      'Polluted Delta': ['Island', 'Swamp', SEA, SEWERS],
      'Flooded Strand': ['Island', SEA, SEWERS],
      'Bloodstained Mire': ['Swamp', SEA, SEWERS],
      'Misty Rainforest': ['Island', SEA, SEWERS],
      'Scalding Tarn': ['Island', SEA, SEWERS],
      'Verdant Catacombs': ['Swamp', SEA, SEWERS],
    };
    for (const [fetch, finds] of Object.entries(table)) {
      const s = start({ deck: deckWith(extra), battlefield: [bf(fetch)] }, pile);
      const got = findActions(s, isCrack(fetch)).map((a) => (a.find ?? null) === null ? '(nothing)' : a.find).sort();
      assert.deepEqual(got, [...finds, '(nothing)'].sort(), fetch);
    }
  });

  test('fetching Undercity Sewers: enters tapped, shuffle first, then surveil is pending in EVERY outcome', () => {
    const pile = [SEWERS, 'Island', WRAITH, WRAITH, 'Swamp'];
    const s = start({ battlefield: [bf(DELTA)] }, pile);
    const out = applyAction(s, findAction(s, isCrack(DELTA, SEWERS)));
    assert.equal(out.length, distinctPerms(['Island', WRAITH, WRAITH, 'Swamp'])); // 12
    assertLabels(out);
    assertDistinctLibraries(out);
    for (const { state: o } of out) {
      assert.equal(countOn(o.battlefield, SEWERS, true), 1);
      assert.ok(o.pendingChoice, 'surveil pending after the shuffle');
      assert.equal(o.pendingChoice.kind, 'surveil');
      assert.equal(legalActions(o).length, 2);
      assert.ok(legalActions(o).every(isChoose));
    }
  });

  test('a tapped fetchland cannot be cracked', () => {
    const s = start({ battlefield: [bf(DELTA, true)] }, ['Island', WRAITH, WRAITH, 'Swamp', 'Swamp']);
    assert.ok(!hasAction(s, isType('crack_fetch')));
  });

  test('fetching is instant speed: allowed on the opponent turn', () => {
    let s = start({ battlefield: [bf(DELTA)], turnsAhead: 1 }, ['Island', WRAITH, WRAITH, 'Swamp', 'Swamp']);
    s = act(s, isPass);
    assert.equal(s.phase, 'opp');
    assert.ok(hasAction(s, isCrack(DELTA, 'Island')));
  });

  test('cracking at 1 life pays the last life point → loss in every outcome', () => {
    const s = start({ battlefield: [bf(DELTA)], lifeBeforeDoomsday: 2 }, ['Island', WRAITH, WRAITH, 'Swamp', 'Swamp']);
    assert.equal(s.life, 1);
    const out = applyAction(s, findAction(s, isCrack(DELTA, 'Island')));
    for (const { state: o } of out) {
      assert.equal(o.life, 0);
      assert.equal(status(o), 'loss');
      assert.deepEqual(legalActions(o), []);
    }
  });
});

// ---------------------------------------------------------------------------
describe('Lotus Petal and Lion\'s Eye Diamond', () => {
  const PILE = [WRAITH, WRAITH, 'Island', 'Island', 'Island'];

  test('Lotus Petal: {0} artifact, one cast action, enters the battlefield, counts as noncreature', () => {
    let s = start({ hand: [PETAL] }, PILE);
    const casts = findActions(s, isCast(PETAL));
    assert.equal(casts.length, 1);
    assert.deepEqual(normPay(casts[0].payment), {});
    s = apply1(s, casts[0]);
    assert.equal(countOn(s.battlefield, PETAL, false), 1);
    assert.equal(s.noncreatureCast, 2);
  });

  test('Lotus Petal: sacrifice for one mana of any color (5 actions), goes to the graveyard', () => {
    let s = start({ battlefield: [bf(PETAL)] }, PILE);
    assert.deepEqual(findActions(s, isType('sac_petal')).map((a) => a.color).sort(), ['B', 'G', 'R', 'U', 'W']);
    s = act(s, isSacPetal('G'));
    assert.equal(pool(s.pool).G, 1);
    assert.equal(countOn(s.battlefield, PETAL), 0);
    assert.ok(s.graveyard.includes(PETAL));
  });

  test('Lotus Petal: sacrifice is instant speed (opp turn) but casting is sorcery speed', () => {
    let s = start({ hand: [PETAL], battlefield: [bf(PETAL)], turnsAhead: 1 }, PILE);
    s = act(s, isPass);
    assert.ok(hasAction(s, isSacPetal('U')));
    assert.ok(!hasAction(s, isCast(PETAL)));
  });

  test("Lion's Eye Diamond: {0} artifact enters the battlefield", () => {
    let s = start({ hand: [LED, 'Ponder'] }, PILE);
    s = act(s, isCast(LED));
    assert.equal(countOn(s.battlefield, LED), 1);
    sameMultiset(s.hand, ['Ponder']);
  });

  test("Lion's Eye Diamond: discard the hand, sacrifice, add three of one color (5 actions)", () => {
    let s = start({ hand: ['Brainstorm', 'Ponder', ORACLE], battlefield: [bf(LED)], manaPool: { B: 1 } }, PILE);
    assert.deepEqual(findActions(s, isType('activate_led')).map((a) => a.color).sort(), ['B', 'G', 'R', 'U', 'W']);
    s = act(s, isLed('U'));
    assert.deepEqual(s.hand, []);
    assert.deepEqual(pool(s.pool), { W: 0, U: 3, B: 1, R: 0, G: 0, C: 0 });
    sameMultiset(s.graveyard, ['Doomsday', 'Brainstorm', 'Ponder', ORACLE, LED]);
    assert.equal(countOn(s.battlefield, LED), 0);
  });

  test("Lion's Eye Diamond works with an empty hand and on the opponent turn", () => {
    let s = start({ battlefield: [bf(LED)], turnsAhead: 1 }, PILE);
    s = act(s, isPass);
    s = act(s, isLed('B'));
    assert.equal(pool(s.pool).B, 3);
  });
});

// ---------------------------------------------------------------------------
describe("Thassa's Oracle and Street Wraith", () => {
  test('Oracle costs {U}{U}; not castable from {U:1}', () => {
    assert.ok(!hasAction(start({ hand: [ORACLE], manaPool: { U: 1 } }, [WRAITH, WRAITH, 'Island', 'Island', 'Island']), isCast(ORACLE)));
  });

  test('Oracle is a creature: casting it does not increase noncreatureCast', () => {
    const s = act(start({ hand: [ORACLE], manaPool: { U: 2 } }, [WRAITH, WRAITH, 'Island', 'Island', 'Island']), isCast(ORACLE));
    assert.equal(s.noncreatureCast, 1);
  });

  test('Street Wraith cycling: pay 2 life, discard it, draw a card; it is not a cast', () => {
    const pile = ['Island', WRAITH, 'Swamp', 'Swamp', 'Swamp'];
    const s = act(start({ hand: [WRAITH] }, pile), isCycle(WRAITH));
    assert.equal(s.life, 8);
    sameMultiset(s.hand, ['Island']);
    assert.deepEqual(s.library, pile.slice(1));
    sameMultiset(s.graveyard, ['Doomsday', WRAITH]);
    assert.equal(s.noncreatureCast, 1);
  });

  test('Street Wraith cannot be cycled at 1 life', () => {
    const s = start({ hand: [WRAITH], lifeBeforeDoomsday: 3 }, ['Island', WRAITH, 'Swamp', 'Swamp', 'Swamp']);
    assert.equal(s.life, 1);
    assert.ok(!hasAction(s, isCycle(WRAITH)));
  });

  test('Street Wraith can be cycled at exactly 2 life, which loses', () => {
    const s0 = start({ hand: [WRAITH], lifeBeforeDoomsday: 4 }, ['Island', WRAITH, 'Swamp', 'Swamp', 'Swamp']);
    assert.equal(s0.life, 2);
    const s = act(s0, isCycle(WRAITH));
    assert.equal(s.life, 0);
    assert.equal(status(s), 'loss');
  });

  test('cycling is instant speed: allowed on the opponent turn', () => {
    let s = start({ hand: [WRAITH], turnsAhead: 1 }, ['Island', WRAITH, 'Swamp', 'Swamp', 'Swamp']);
    s = act(s, isPass);
    assert.ok(hasAction(s, isCycle(WRAITH)));
  });
});

// ---------------------------------------------------------------------------
describe('Edge of Autumn', () => {
  const PILE = ['Island', WRAITH, WRAITH, 'Swamp', 'Swamp'];
  const fourLands = [bf('Island', true), bf('Island', true), bf('Swamp', true), bf(SEA, true)];

  test('costs {1}{G}: not castable without G', () => {
    assert.ok(!hasAction(start({ hand: ['Edge of Autumn'], battlefield: fourLands, manaPool: { U: 2 } }, PILE), isCast('Edge of Autumn')));
  });

  test('with 4 lands: search a basic land, put it onto the battlefield TAPPED, then shuffle (AND outcomes)', () => {
    const s = start({ hand: ['Edge of Autumn'], battlefield: fourLands, manaPool: { G: 1, U: 1 } }, PILE);
    const casts = findActions(s, isCast('Edge of Autumn'));
    assert.ok(casts.length >= 1);
    for (const c of casts) assert.deepEqual(normPay(c.payment), { G: 1, U: 1 });
    const groups = decisionGroups(s, isCast('Edge of Autumn'));
    const islandGroups = groups.filter((g) => g.outcomes.every((o) => countOn(o.state.battlefield, 'Island', true) === 3));
    assert.equal(islandGroups.length, 1, 'exactly one way to fetch the Island');
    const ig = islandGroups[0].outcomes;
    assert.equal(ig.length, distinctPerms([WRAITH, WRAITH, 'Swamp', 'Swamp'])); // 6
    assertLabels(ig);
    assertDistinctLibraries(ig);
    for (const { state: o } of ig) {
      assert.equal(o.battlefield.length, 5);
      sameMultiset(o.library, [WRAITH, WRAITH, 'Swamp', 'Swamp']);
      assert.ok(o.graveyard.includes('Edge of Autumn'));
      assert.equal(poolTotal(o), 0);
    }
    const swampGroups = groups.filter((g) => g.outcomes.every((o) => countOn(o.state.battlefield, 'Swamp', true) === 2));
    assert.equal(swampGroups.length, 1, 'exactly one way to fetch a Swamp');
    assert.equal(swampGroups[0].outcomes.length, distinctPerms(['Island', WRAITH, WRAITH, 'Swamp'])); // 12
  });

  test('Edge cannot find a nonbasic (Underground Sea)', () => {
    const s = start({ hand: ['Edge of Autumn'], battlefield: fourLands, manaPool: { G: 1, U: 1 } }, [SEA, WRAITH, WRAITH, 'Swamp', 'Swamp']);
    for (const g of decisionGroups(s, isCast('Edge of Autumn'))) {
      for (const o of g.outcomes) assert.equal(countOn(o.state.battlefield, SEA), 1, 'only the original Sea');
    }
  });

  test('with 5 lands: no search and no shuffle', () => {
    const s = start({ hand: ['Edge of Autumn'], battlefield: [...fourLands, bf('Swamp', true)], manaPool: { G: 1, U: 1 } }, PILE);
    for (const g of decisionGroups(s, isCast('Edge of Autumn'))) {
      assert.equal(g.outcomes.length, 1);
      const o = g.outcomes[0].state;
      assert.deepEqual(o.library, PILE);
      assert.equal(o.battlefield.length, 5);
      assert.ok(o.graveyard.includes('Edge of Autumn'));
    }
  });

  test('Edge is a sorcery: not castable on the opponent turn', () => {
    let s = start({ hand: ['Edge of Autumn'], battlefield: [bf(PETAL), bf('Island')], turnsAhead: 1 }, PILE);
    s = act(s, isPass);
    s = act(s, isSacPetal('G'));
    s = act(s, isTap('Island', 'U'));
    assert.deepEqual(pool(s.pool), { W: 0, U: 1, B: 0, R: 0, G: 1, C: 0 });
    assert.ok(!hasAction(s, isCast('Edge of Autumn')));
  });

  test('cycling — sacrifice a land: one action per distinct land name + tapped state', () => {
    const pile = ['Island', WRAITH, WRAITH, 'Swamp', 'Swamp'];
    const s = start({ hand: ['Edge of Autumn'], battlefield: [bf(SEA), bf(SEA, true), bf(SEA), bf('Island'), bf(PETAL)] }, pile);
    const cycles = findActions(s, isCycle('Edge of Autumn'));
    assert.equal(cycles.length, 3);
    const before = s.battlefield.map(bfKey);
    const removed = [];
    for (const c of cycles) {
      const o = apply1(s, c);
      const after = o.battlefield.map(bfKey);
      const diff = { ...counts(before) };
      for (const k of after) diff[k] -= 1;
      const gone = Object.entries(diff).filter(([, v]) => v > 0);
      assert.equal(gone.length, 1);
      assert.equal(gone[0][1], 1);
      removed.push(gone[0][0]);
      sameMultiset(o.hand, ['Island']);
      assert.deepEqual(o.library, pile.slice(1));
      assert.ok(o.graveyard.includes('Edge of Autumn'));
      assert.ok(o.graveyard.includes(gone[0][0].split('|')[0]), 'sacrificed land goes to the graveyard');
      assert.equal(o.noncreatureCast, 1, 'cycling is not casting');
    }
    assert.deepEqual(removed.sort(), [`${SEA}|false`, `${SEA}|true`, 'Island|false'].sort());
  });

  test('cycling needs a land to sacrifice', () => {
    const s = start({ hand: ['Edge of Autumn'], battlefield: [bf(PETAL)] }, PILE);
    assert.ok(!hasAction(s, isCycle('Edge of Autumn')));
  });
});

// ---------------------------------------------------------------------------
describe('Dark Ritual', () => {
  test('{B}: add BBB (net +2), goes to the graveyard, counts as noncreature', () => {
    const s = act(start({ hand: ['Dark Ritual'], manaPool: { B: 1, U: 1 } }, [WRAITH, WRAITH, 'Island', 'Island', 'Island']), isCast('Dark Ritual'));
    assert.deepEqual(pool(s.pool), { W: 0, U: 1, B: 3, R: 0, G: 0, C: 0 });
    assert.ok(s.graveyard.includes('Dark Ritual'));
    assert.equal(s.noncreatureCast, 2);
  });

  test('instant: castable on the opponent turn', () => {
    let s = start({ hand: ['Dark Ritual'], battlefield: [bf('Swamp')], turnsAhead: 1 }, [WRAITH, WRAITH, 'Island', 'Island', 'Island']);
    s = act(s, isPass);
    s = act(s, isTap('Swamp', 'B'));
    s = act(s, isCast('Dark Ritual'));
    assert.equal(pool(s.pool).B, 3);
  });
});

// ---------------------------------------------------------------------------
describe('Brainstorm', () => {
  test('draw 3, then one option per DISTINCT ordered pair to put back (first = new top)', () => {
    const pile = ['Island', 'Island', WRAITH, 'Swamp', 'Swamp'];
    const s = act(start({ hand: ['Brainstorm', ORACLE], manaPool: { U: 1 } }, pile), isCast('Brainstorm'));
    sameMultiset(s.hand, [ORACLE, 'Island', 'Island', WRAITH]);
    assert.deepEqual(s.library, ['Swamp', 'Swamp']);
    assert.ok(s.pendingChoice);
    assert.equal(s.pendingChoice.kind, 'brainstorm');
    assert.equal(s.noncreatureCast, 2);
    const opts = legalActions(s);
    assert.ok(opts.every(isChoose));
    // Names {Oracle, Island×2, Wraith}: 3·2 ordered pairs of different names + (Island, Island) = 7.
    assert.equal(opts.length, 7);
    const pairs = new Set();
    for (const o of opts) {
      const r = apply1(s, o);
      assert.equal(r.pendingChoice, null);
      assert.equal(r.library.length, 4);
      assert.deepEqual(r.library.slice(2), ['Swamp', 'Swamp']);
      assert.equal(r.hand.length, 2);
      sameMultiset([...r.hand, r.library[0], r.library[1]], [ORACLE, 'Island', 'Island', WRAITH]);
      pairs.add(`${r.library[0]}>${r.library[1]}`);
      assert.ok(r.graveyard.includes('Brainstorm'));
    }
    assert.deepEqual([...pairs].sort(), [
      `${ORACLE}>Island`, `${ORACLE}>${WRAITH}`, `Island>${ORACLE}`, `Island>${WRAITH}`,
      `${WRAITH}>${ORACLE}`, `${WRAITH}>Island`, 'Island>Island',
    ].sort());
  });

  test('instant: castable on the opponent turn', () => {
    let s = start({ hand: ['Brainstorm'], battlefield: [bf('Island')], turnsAhead: 1 }, [WRAITH, WRAITH, 'Swamp', 'Swamp', 'Swamp']);
    s = act(s, isPass);
    s = act(s, isTap('Island', 'U'));
    assert.ok(hasAction(s, isCast('Brainstorm')));
  });

  test('short library: drawing 3 from 1 is a loss, even though the put-back step happens', () => {
    const s = start({ deck: { Doomsday: 1, Brainstorm: 1, Island: 1 }, hand: ['Brainstorm'], manaPool: { U: 1 } }, ['Island']);
    const out = applyAction(s, findAction(s, isCast('Brainstorm')));
    for (const { state: o } of out) {
      assert.equal(status(o), 'loss');
      assert.deepEqual(legalActions(o), []);
    }
  });
});

// ---------------------------------------------------------------------------
describe('Ponder', () => {
  test('identical top three: one ordering + shuffle; ordering draws the top; shuffle is an AND over distinct orders', () => {
    const pile = ['Island', 'Island', 'Island', WRAITH, WRAITH];
    const s = act(start({ hand: ['Ponder'], manaPool: { U: 1 } }, pile), isCast('Ponder'));
    assert.ok(s.pendingChoice);
    const opts = legalActions(s);
    assert.equal(opts.length, 2);
    assert.ok(opts.every(isChoose));
    const results = opts.map((o) => applyAction(s, o));
    const keep = results.filter((r) => r.length === 1);
    const shuf = results.filter((r) => r.length > 1);
    assert.equal(keep.length, 1);
    assert.equal(shuf.length, 1);
    sameMultiset(keep[0][0].state.hand, ['Island']);
    assert.deepEqual(keep[0][0].state.library, ['Island', 'Island', WRAITH, WRAITH]);
    assert.equal(shuf[0].length, distinctPerms(pile)); // 10
    assertLabels(shuf[0]);
    const combos = new Set(shuf[0].map(({ state: o }) => JSON.stringify([o.hand, o.library])));
    assert.equal(combos.size, 10);
    for (const { state: o } of shuf[0]) {
      assert.equal(o.hand.length, 1, 'drew one card after the shuffle');
      assert.equal(o.library.length, 4);
      sameMultiset([...o.hand, ...o.library], pile);
      assert.ok(o.graveyard.includes('Ponder'));
    }
  });

  test('distinct top three: 6 orderings + shuffle = 7 options', () => {
    const pile = ['Island', WRAITH, 'Swamp', ORACLE, 'Consider'];
    const s = act(start({ hand: ['Ponder'], manaPool: { U: 1 } }, pile), isCast('Ponder'));
    const opts = legalActions(s);
    assert.equal(opts.length, 7);
    const det = opts.map((o) => applyAction(s, o)).filter((r) => r.length === 1).map((r) => r[0].state);
    assert.equal(det.length, 6);
    const seen = new Set(det.map((o) => JSON.stringify([o.hand, o.library])));
    assert.equal(seen.size, 6);
    for (const o of det) {
      assert.deepEqual(o.library.slice(2), [ORACLE, 'Consider']);
      sameMultiset([...o.hand, o.library[0], o.library[1]], ['Island', WRAITH, 'Swamp']);
    }
  });

  test('library smaller than 3 (2 cards): 2 orderings + shuffle', () => {
    const s0 = start({ deck: { Doomsday: 1, Ponder: 1, Island: 1, [WRAITH]: 1 }, hand: ['Ponder'], manaPool: { U: 1 } }, ['Island', WRAITH]);
    const s = act(s0, isCast('Ponder'));
    const opts = legalActions(s);
    assert.equal(opts.length, 3);
    const lens = opts.map((o) => applyAction(s, o).length).sort();
    assert.deepEqual(lens, [1, 1, 2]);
    const det = opts.map((o) => applyAction(s, o)).filter((r) => r.length === 1).map((r) => r[0].state);
    assert.deepEqual(det.map((o) => o.hand[0]).sort(), ['Island', WRAITH].sort());
    for (const o of det) assert.equal(o.library.length, 1);
  });

  test('Ponder with an empty library loses (it draws)', () => {
    const s = start({ deck: { Doomsday: 1, Ponder: 1 }, hand: ['Ponder'], manaPool: { U: 1 } }, []);
    for (const l of leavesOf(s, isCast('Ponder'))) assert.equal(status(l), 'loss');
  });
});

// ---------------------------------------------------------------------------
describe('Consider', () => {
  test('look at the top card, may put it into the graveyard, then draw', () => {
    const pile = [ORACLE, 'Island', 'Swamp', 'Swamp', 'Swamp'];
    const s = start({ hand: ['Consider'], manaPool: { U: 1 } }, pile);
    const ls = leavesOf(s, isCast('Consider'));
    const got = new Set(ls.map(summary));
    const keep = { hand: [ORACLE], library: ['Island', 'Swamp', 'Swamp', 'Swamp'], graveyard: ['Consider', 'Doomsday'] };
    const bin = { hand: ['Island'], library: ['Swamp', 'Swamp', 'Swamp'], graveyard: ['Consider', 'Doomsday', ORACLE].sort() };
    assert.deepEqual([...got].sort(), [JSON.stringify(keep), JSON.stringify(bin)].sort());
    for (const l of ls) assert.equal(l.noncreatureCast, 2);
  });
});

// ---------------------------------------------------------------------------
describe('Personal Tutor', () => {
  test('find a sorcery: it is fixed on top and the rest is AND-shuffled; finding none shuffles everything', () => {
    const pile = ['Island', 'Ponder', WRAITH, 'Swamp', 'Island'];
    const s = start({ hand: ['Personal Tutor'], manaPool: { U: 1 } }, pile);
    const groups = decisionGroups(s, isCast('Personal Tutor'));
    const ponderTop = groups.filter((g) => g.outcomes.every((o) => o.state.library[0] === 'Ponder'));
    assert.equal(ponderTop.length, 1);
    const pg = ponderTop[0].outcomes;
    assert.equal(pg.length, distinctPerms(['Island', WRAITH, 'Swamp', 'Island'])); // 12
    assertLabels(pg);
    assertDistinctLibraries(pg);
    for (const { state: o } of pg) {
      assert.equal(o.library.length, 5);
      sameMultiset(o.library, pile);
      assert.deepEqual(o.hand, []);
      assert.ok(o.graveyard.includes('Personal Tutor'));
    }
    const none = groups.filter((g) => g.outcomes.length === distinctPerms(pile)); // 60
    assert.equal(none.length, 1, 'a "find nothing" option that shuffles everything');
    assert.equal(groups.length, 2, 'only Ponder is a sorcery here');
  });

  test('cannot find an instant or a land', () => {
    const s = start({ hand: ['Personal Tutor'], manaPool: { U: 1 } }, ['Brainstorm', 'Island', 'Island', 'Island', 'Island']);
    const groups = decisionGroups(s, isCast('Personal Tutor'));
    assert.equal(groups.length, 1);
    assert.equal(groups[0].outcomes.length, 5); // nothing found: 5 distinct orderings
  });

  test('sees a dead Doomsday in the library as a sorcery', () => {
    const s = start({ hand: ['Personal Tutor'], manaPool: { U: 1 } }, ['Island', 'Island', 'Doomsday', 'Island', 'Island']);
    const groups = decisionGroups(s, isCast('Personal Tutor'));
    const found = groups.filter((g) => g.outcomes.length === 1 && g.outcomes[0].state.library[0] === 'Doomsday');
    assert.equal(found.length, 1);
    assert.deepEqual(found[0].outcomes[0].state.library, ['Doomsday', 'Island', 'Island', 'Island', 'Island']);
  });
});

// ---------------------------------------------------------------------------
describe('Flow State', () => {
  const PILE = ['Island', 'Swamp', ORACLE, WRAITH, WRAITH];

  test('without an instant in the graveyard: one card to hand, the other two to the bottom in a CHOSEN order', () => {
    const s = start({ hand: ['Flow State'], manaPool: { U: 2 } }, PILE);
    for (const g of decisionGroups(s, isCast('Flow State'))) assert.equal(g.outcomes.length, 1, 'bottom order is chosen, not random');
    const ls = leavesOf(s, isCast('Flow State'));
    const seen = new Set();
    for (const l of ls) {
      assert.equal(l.hand.length, 1);
      assert.equal(l.library.length, 4);
      assert.deepEqual(l.library.slice(0, 2), [WRAITH, WRAITH]);
      sameMultiset([...l.hand, l.library[2], l.library[3]], ['Island', 'Swamp', ORACLE]);
      assert.ok(l.graveyard.includes('Flow State'));
      seen.add(JSON.stringify([l.hand, l.library]));
    }
    assert.equal(seen.size, 6, '3 picks × 2 bottom orders');
  });

  test('with an instant (Dark Ritual) + sorcery (Doomsday) in the graveyard: two cards to hand', () => {
    let s = start({ hand: ['Dark Ritual', 'Flow State'], manaPool: { B: 1, U: 1 } }, PILE);
    s = act(s, isCast('Dark Ritual'));
    assert.ok(hasAction(s, isCastPaid('Flow State', { U: 1, B: 1 })));
    const ls = leavesOf(s, isCast('Flow State'));
    const seen = new Set();
    for (const l of ls) {
      assert.equal(l.hand.length, 2);
      assert.equal(l.library.length, 3);
      assert.deepEqual(l.library.slice(0, 2), [WRAITH, WRAITH]);
      sameMultiset([...l.hand, l.library[2]], ['Island', 'Swamp', ORACLE]);
      seen.add(l.library[2]);
    }
    assert.deepEqual([...seen].sort(), ['Island', ORACLE, 'Swamp'].sort());
  });

  test('a dead instant (Daze) surveilled into the graveyard enables the two-card mode', () => {
    const pile = ['Daze', 'Island', 'Swamp', ORACLE, WRAITH];
    let s = start({ deck: deckWith({ Daze: 1 }), hand: [SEWERS, 'Flow State'], manaPool: { U: 2 } }, pile);
    s = act(s, isPlay(SEWERS));
    const binned = legalActions(s).map((o) => apply1(s, o)).filter((r) => r.graveyard.includes('Daze'));
    assert.equal(binned.length, 1);
    s = binned[0];
    for (const l of leavesOf(s, isCast('Flow State'))) {
      assert.equal(l.hand.length, 2);
      assert.equal(l.library.length, 2);
      assert.equal(l.library[0], WRAITH);
    }
  });
});

// ---------------------------------------------------------------------------
describe('Unearth', () => {
  test('returns Oracle from the graveyard to the battlefield and triggers its ETB', () => {
    const pile = [ORACLE, 'Island', 'Island', 'Island', 'Island'];
    const s0 = start({ hand: ['Consider', 'Unearth'], manaPool: { U: 1, B: 1 } }, pile);
    const binned = leavesOf(s0, isCast('Consider')).filter((l) => l.graveyard.includes(ORACLE));
    assert.equal(binned.length, 1);
    const s1 = binned[0];
    const casts = findActions(s1, isCast('Unearth'));
    assert.equal(casts.length, 1);
    const s = apply1(s1, casts[0]);
    assert.equal(countOn(s.battlefield, ORACLE), 1);
    assert.ok(!s.graveyard.includes(ORACLE));
    assert.ok(s.graveyard.includes('Unearth'));
    assert.equal(s.pendingTrigger, true);
    assert.ok(hasAction(s, isType('resolve_oracle')));
  });

  test('not castable without a legal target (empty graveyard apart from Doomsday)', () => {
    const s = start({ hand: ['Unearth'], manaPool: { B: 1 } }, [WRAITH, WRAITH, 'Island', 'Island', 'Island']);
    assert.ok(!hasAction(s, isCast('Unearth')));
  });

  test('not castable on Street Wraith (MV 5)', () => {
    let s = start({ hand: ['Unearth', WRAITH], manaPool: { B: 1 } }, [WRAITH, WRAITH, 'Island', 'Island', 'Island']);
    s = act(s, isCycle(WRAITH));
    assert.ok(s.graveyard.includes(WRAITH));
    assert.ok(!hasAction(s, isCast('Unearth')));
  });

  test('cycling {2}: discard, draw, spend 2 mana', () => {
    const pile = ['Island', WRAITH, 'Island', 'Island', 'Swamp'];
    const s0 = start({ hand: ['Unearth'], manaPool: { B: 2 } }, pile);
    const s = act(s0, isCycle('Unearth'));
    sameMultiset(s.hand, ['Island']);
    assert.deepEqual(s.library, pile.slice(1));
    assert.ok(s.graveyard.includes('Unearth'));
    assert.equal(poolTotal(s), 0);
    assert.equal(s.noncreatureCast, 1);
  });

  test('cycling needs 2 mana', () => {
    const s = start({ hand: ['Unearth'], manaPool: { B: 1 } }, ['Island', WRAITH, 'Island', 'Island', 'Swamp']);
    assert.ok(!hasAction(s, isCycle('Unearth')));
  });
});

// ---------------------------------------------------------------------------
describe('Duress, Thoughtseize, Fatal Push', () => {
  const PILE = [WRAITH, WRAITH, 'Island', 'Island', 'Island'];
  const D = deckWith({ Duress: 1, Thoughtseize: 1, 'Fatal Push': 2 });

  test('Duress: goes to the graveyard, no life loss, counts as noncreature', () => {
    const s = act(start({ deck: D, hand: ['Duress'], manaPool: { B: 1 } }, PILE), isCast('Duress'));
    assert.equal(s.life, 10);
    assert.ok(s.graveyard.includes('Duress'));
    assert.equal(s.noncreatureCast, 2);
    assert.equal(poolTotal(s), 0);
  });

  test('Thoughtseize: you lose 2 life', () => {
    const s = act(start({ deck: D, hand: ['Thoughtseize'], manaPool: { B: 1 } }, PILE), isCast('Thoughtseize'));
    assert.equal(s.life, 8);
    assert.ok(s.graveyard.includes('Thoughtseize'));
  });

  test('Fatal Push destroys Thalia (paying Thalia\'s tax)', () => {
    const s0 = start({ deck: D, hand: ['Fatal Push'], manaPool: { B: 2 }, opponent: { permanents: [{ name: THALIA }] } }, PILE);
    const c = findAction(s0, isCast('Fatal Push'));
    assert.deepEqual(normPay(c.payment), { B: 2 });
    const s = apply1(s0, c);
    assert.deepEqual(oppNames(s), []);
    assert.ok(s.graveyard.includes('Fatal Push'));
  });

  test('Fatal Push destroys Gaddock Teeg', () => {
    const s = act(start({ deck: D, hand: ['Fatal Push'], manaPool: { B: 1 }, opponent: { permanents: [{ name: TEEG }] } }, PILE), isCast('Fatal Push'));
    assert.deepEqual(oppNames(s), []);
  });

  test('with Thalia and Teeg, Fatal Push has one action per target', () => {
    const s = start({ deck: D, hand: ['Fatal Push'], manaPool: { B: 2 }, opponent: { permanents: [{ name: THALIA }, { name: TEEG }] } }, PILE);
    const remaining = findActions(s, isCast('Fatal Push')).map((a) => oppNames(apply1(s, a)).join(',')).sort();
    assert.deepEqual(remaining, [TEEG, THALIA].sort());
  });

  test('Fatal Push needs a creature target (Chalice is not one)', () => {
    assert.ok(!hasAction(start({ deck: D, hand: ['Fatal Push'], manaPool: { B: 1 } }, PILE), isCast('Fatal Push')));
    assert.ok(!hasAction(start({ deck: D, hand: ['Fatal Push'], manaPool: { B: 1 }, opponent: { permanents: [{ name: CHALICE, x: 3 }] } }, PILE), isCast('Fatal Push')));
  });

  test('after Pushing Thalia, noncreature spells cost normal again', () => {
    let s = start({ deck: D, hand: ['Fatal Push', 'Brainstorm'], manaPool: { B: 2, U: 1 }, opponent: { permanents: [{ name: THALIA }] } }, PILE);
    assert.ok(!hasAction(s, isCastPaid('Brainstorm', { U: 1 })));
    s = act(s, isCastPaid('Fatal Push', { B: 2 }));
    assert.ok(hasAction(s, isCastPaid('Brainstorm', { U: 1 })));
  });
});
