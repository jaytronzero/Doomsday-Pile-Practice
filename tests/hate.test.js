// Spec §6 (opponent permanents) and §7 dead cards.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { legalActions, applyAction, status } from '../src/engine.js';
import {
  ORACLE, WRAITH, SEA, DELTA, LED, PETAL, THALIA, TEEG, CHALICE, FLUTE, SILENCE, PILE_A,
  start, deckWith, bf, sameMultiset, pool, poolTotal, normPay,
  isType, isCast, isCastPaid, isCycle, isTap, isPlay, isCrack, isSacPetal, isLed, isPass,
  findAction, findActions, hasAction, apply1, act, countOn, mentionsCard,
} from './helpers.js';

const opp = (...permanents) => ({ permanents });
const PILE = [...PILE_A];

// ---------------------------------------------------------------------------
describe('Deafening Silence', () => {
  test('turn 0 with Doomsday already cast (noncreatureCast 1): no noncreature spells; creatures and cycling still fine', () => {
    const s = start({
      hand: ['Brainstorm', 'Dark Ritual', PETAL, ORACLE, WRAITH],
      manaPool: { U: 3, B: 1 },
      opponent: opp({ name: SILENCE }),
    }, PILE);
    assert.equal(s.noncreatureCast, 1);
    assert.ok(!hasAction(s, isCast('Brainstorm')));
    assert.ok(!hasAction(s, isCast('Dark Ritual')));
    assert.ok(!hasAction(s, isCast(PETAL)));
    assert.ok(hasAction(s, isCast(ORACLE)));
    assert.ok(hasAction(s, isCycle(WRAITH)));
  });

  test('with noncreatureCast 0, exactly one noncreature spell is allowed', () => {
    let s = start({ hand: ['Dark Ritual', 'Dark Ritual'], manaPool: { B: 1 }, noncreatureSpellsCastThisTurn: 0, opponent: opp({ name: SILENCE }) }, PILE);
    s = act(s, isCast('Dark Ritual'));
    assert.equal(pool(s.pool).B, 3);
    assert.equal(s.noncreatureCast, 1);
    assert.ok(!hasAction(s, isCast('Dark Ritual')));
  });

  test('on the opponent turn the count is reset: one instant is allowed there', () => {
    let s = start({ hand: ['Dark Ritual', 'Dark Ritual'], battlefield: [bf('Swamp')], turnsAhead: 1, opponent: opp({ name: SILENCE }) }, PILE);
    assert.ok(!hasAction(s, isCast('Dark Ritual')));
    s = act(s, isPass);
    s = act(s, isTap('Swamp', 'B'));
    s = act(s, isCast('Dark Ritual'));
    assert.equal(pool(s.pool).B, 3);
    assert.ok(!hasAction(s, isCast('Dark Ritual')));
  });

  test('a spell countered by Chalice still counts', () => {
    let s = start({
      hand: ['Brainstorm', 'Consider'],
      manaPool: { U: 2 },
      noncreatureSpellsCastThisTurn: 0,
      opponent: opp({ name: SILENCE }, { name: CHALICE, x: 1 }),
    }, PILE);
    s = act(s, isCast('Brainstorm'));
    assert.equal(s.pendingChoice, null, 'countered: no Brainstorm choice');
    assert.deepEqual(s.library, PILE, 'countered: nothing drawn');
    sameMultiset(s.hand, ['Consider']);
    assert.ok(s.graveyard.includes('Brainstorm'));
    assert.equal(pool(s.pool).U, 1, 'mana is spent');
    assert.equal(s.noncreatureCast, 1);
    assert.ok(!hasAction(s, isCast('Consider')));
  });
});

// ---------------------------------------------------------------------------
describe('Thalia, Guardian of Thraben', () => {
  const thalia = opp({ name: THALIA });

  test('noncreature spells cost {1} more', () => {
    assert.ok(!hasAction(start({ hand: ['Brainstorm'], manaPool: { U: 1 }, opponent: thalia }, PILE), isCast('Brainstorm')));
    const s = start({ hand: ['Brainstorm'], manaPool: { U: 2 }, opponent: thalia }, PILE);
    const c = findAction(s, isCast('Brainstorm'));
    assert.deepEqual(normPay(c.payment), { U: 2 });
  });

  test('{0} artifacts cost {1}', () => {
    assert.ok(!hasAction(start({ hand: [PETAL], opponent: thalia }, PILE), isCast(PETAL)));
    const c = findAction(start({ hand: [PETAL], manaPool: { B: 1 }, opponent: thalia }, PILE), isCast(PETAL));
    assert.deepEqual(normPay(c.payment), { B: 1 });
  });

  test('creature spells (Oracle) are not taxed', () => {
    const c = findAction(start({ hand: [ORACLE], manaPool: { U: 2 }, opponent: thalia }, PILE), isCast(ORACLE));
    assert.deepEqual(normPay(c.payment), { U: 2 });
  });

  test('activated abilities (Unearth cycling {2}) are not taxed', () => {
    const s = start({ hand: ['Unearth', WRAITH], manaPool: { B: 2 }, opponent: thalia }, PILE);
    assert.ok(hasAction(s, isCycle('Unearth')));
    assert.ok(hasAction(s, isCycle(WRAITH)));
  });
});

// ---------------------------------------------------------------------------
describe('Disruptor Flute', () => {
  const flute = (named) => ({ name: FLUTE, named });

  test('spells with the named name cost {3} more', () => {
    assert.ok(!hasAction(start({ hand: ['Brainstorm'], manaPool: { U: 3 }, opponent: opp(flute('Brainstorm')) }, PILE), isCast('Brainstorm')));
    const c = findAction(start({ hand: ['Brainstorm', 'Consider'], manaPool: { U: 4 }, opponent: opp(flute('Brainstorm')) }, PILE), isCast('Brainstorm'));
    assert.deepEqual(normPay(c.payment), { U: 4 });
  });

  test('other names are unaffected', () => {
    const c = findAction(start({ hand: ['Consider'], manaPool: { U: 1 }, opponent: opp(flute('Brainstorm')) }, PILE), isCast('Consider'));
    assert.deepEqual(normPay(c.payment), { U: 1 });
  });

  test('Thalia + Flute stack: +4', () => {
    const o = opp({ name: THALIA }, flute('Brainstorm'));
    assert.ok(!hasAction(start({ hand: ['Brainstorm'], manaPool: { U: 4 }, opponent: o }, PILE), isCast('Brainstorm')));
    const c = findAction(start({ hand: ['Brainstorm'], manaPool: { U: 5 }, opponent: o }, PILE), isCast('Brainstorm'));
    assert.deepEqual(normPay(c.payment), { U: 5 });
  });

  test('Flute on Oracle: {U}{U}+{3}', () => {
    assert.ok(!hasAction(start({ hand: [ORACLE], manaPool: { U: 4 }, opponent: opp(flute(ORACLE)) }, PILE), isCast(ORACLE)));
    const c = findAction(start({ hand: [ORACLE], manaPool: { U: 5 }, opponent: opp(flute(ORACLE)) }, PILE), isCast(ORACLE));
    assert.deepEqual(normPay(c.payment), { U: 5 });
  });

  test('blocks Street Wraith cycling', () => {
    assert.ok(!hasAction(start({ hand: [WRAITH], opponent: opp(flute(WRAITH)) }, PILE), isCycle(WRAITH)));
  });

  test('blocks Edge of Autumn cycling and Unearth cycling', () => {
    assert.ok(!hasAction(start({ hand: ['Edge of Autumn'], battlefield: [bf(SEA)], opponent: opp(flute('Edge of Autumn')) }, PILE), isCycle('Edge of Autumn')));
    assert.ok(!hasAction(start({ hand: ['Unearth'], manaPool: { B: 2 }, opponent: opp(flute('Unearth')) }, PILE), isCycle('Unearth')));
  });

  test('blocks fetchland activation', () => {
    assert.ok(!hasAction(start({ battlefield: [bf(DELTA)], opponent: opp(flute(DELTA)) }, PILE), isType('crack_fetch')));
    assert.ok(hasAction(start({ battlefield: [bf(DELTA)], opponent: opp(flute(WRAITH)) }, PILE), isType('crack_fetch')));
  });

  test('does NOT block mana abilities (lands, Petal, LED)', () => {
    assert.ok(hasAction(start({ battlefield: [bf(SEA)], opponent: opp(flute(SEA)) }, PILE), isTap(SEA, 'U')));
    assert.ok(hasAction(start({ battlefield: [bf(PETAL)], opponent: opp(flute(PETAL)) }, PILE), isSacPetal('U')));
    assert.ok(hasAction(start({ battlefield: [bf(LED)], opponent: opp(flute(LED)) }, PILE), isLed('U')));
  });

  test('but casting the named artifact costs {3}', () => {
    assert.ok(!hasAction(start({ hand: [PETAL], manaPool: { B: 2 }, opponent: opp(flute(PETAL)) }, PILE), isCast(PETAL)));
    assert.ok(hasAction(start({ hand: [PETAL], manaPool: { B: 3 }, opponent: opp(flute(PETAL)) }, PILE), isCastPaid(PETAL, { B: 3 })));
  });
});

// ---------------------------------------------------------------------------
describe('Gaddock Teeg', () => {
  test('does not stop noncreature spells with MV < 4 or creatures', () => {
    const s = start({
      hand: ['Brainstorm', 'Ponder', 'Dark Ritual', ORACLE, PETAL],
      manaPool: { U: 3, B: 1 },
      opponent: opp({ name: TEEG }),
    }, PILE);
    for (const n of ['Brainstorm', 'Ponder', 'Dark Ritual', ORACLE, PETAL]) assert.ok(hasAction(s, isCast(n)), n);
  });
});

// ---------------------------------------------------------------------------
describe('Chalice of the Void', () => {
  test('x=0 counters Lotus Petal: it goes to the graveyard, never the battlefield, and still counts as cast', () => {
    const s = act(start({ hand: [PETAL], opponent: opp({ name: CHALICE, x: 0 }) }, PILE), isCast(PETAL));
    assert.equal(countOn(s.battlefield, PETAL), 0);
    assert.ok(s.graveyard.includes(PETAL));
    assert.deepEqual(s.hand, []);
    assert.equal(s.noncreatureCast, 2);
  });

  test("x=0 counters Lion's Eye Diamond", () => {
    const s = act(start({ hand: [LED], opponent: opp({ name: CHALICE, x: 0 }) }, PILE), isCast(LED));
    assert.equal(countOn(s.battlefield, LED), 0);
    assert.ok(s.graveyard.includes(LED));
  });

  test('x=0 does not affect lands (they are played, not cast)', () => {
    const s = act(start({ hand: ['Island'], opponent: opp({ name: CHALICE, x: 0 }) }, [WRAITH, WRAITH, 'Swamp', 'Swamp', 'Swamp']), isPlay('Island'));
    assert.equal(countOn(s.battlefield, 'Island'), 1);
  });

  test('x=1 counters Dark Ritual: mana spent, no mana added', () => {
    const s = act(start({ hand: ['Dark Ritual'], manaPool: { B: 1 }, opponent: opp({ name: CHALICE, x: 1 }) }, PILE), isCast('Dark Ritual'));
    assert.equal(poolTotal(s), 0);
    assert.ok(s.graveyard.includes('Dark Ritual'));
  });

  test('x=2 counters Oracle: graveyard, no trigger, mana spent', () => {
    const s = act(start({ hand: [ORACLE], manaPool: { U: 2 }, opponent: opp({ name: CHALICE, x: 2 }) }, PILE), isCast(ORACLE));
    assert.equal(countOn(s.battlefield, ORACLE), 0);
    assert.ok(s.graveyard.includes(ORACLE));
    assert.equal(s.pendingTrigger, false);
    assert.equal(poolTotal(s), 0);
    assert.ok(!hasAction(s, isType('resolve_oracle')));
  });

  test('x=1 does not counter Oracle (MV 2)', () => {
    const s = act(start({ hand: [ORACLE], manaPool: { U: 2 }, opponent: opp({ name: CHALICE, x: 1 }) }, PILE), isCast(ORACLE));
    assert.equal(s.pendingTrigger, true);
  });

  test('cost increases do not change mana value: Thalia-taxed Brainstorm is still countered by x=1', () => {
    const s = act(start({ hand: ['Brainstorm'], manaPool: { U: 2 }, opponent: opp({ name: THALIA }, { name: CHALICE, x: 1 }) }, PILE), isCast('Brainstorm'));
    assert.equal(s.pendingChoice, null);
    assert.deepEqual(s.library, PILE);
    assert.equal(poolTotal(s), 0);
  });
});

// ---------------------------------------------------------------------------
describe('dead cards (supported: false)', () => {
  const DEAD_DECK = deckWith({ 'Force of Will': 1, Daze: 1, Flusterstorm: 1, 'Goblin Guide': 1 });

  test('dead cards in hand produce no actions', () => {
    const hand = ['Force of Will', 'Daze', 'Flusterstorm', 'Doomsday', 'Goblin Guide'];
    const s = start({ deck: DEAD_DECK, hand, manaPool: { U: 5, B: 5 }, noncreatureSpellsCastThisTurn: 0 }, PILE);
    const acts = legalActions(s);
    for (const n of hand) assert.ok(!acts.some((a) => mentionsCard(a, n)), `${n} must have no actions`);
    assert.ok(acts.some(isPass));
  });

  test('dead cards can be drawn and discarded', () => {
    let s = start({ deck: DEAD_DECK, hand: [WRAITH, 'Force of Will'], battlefield: [bf(LED)] }, ['Daze', WRAITH, 'Island', 'Island', 'Island']);
    s = act(s, isCycle(WRAITH));
    sameMultiset(s.hand, ['Force of Will', 'Daze']);
    s = act(s, isLed('U'));
    assert.deepEqual(s.hand, []);
    assert.ok(s.graveyard.includes('Force of Will') && s.graveyard.includes('Daze'));
    assert.equal(status(s), 'ongoing');
  });
});
