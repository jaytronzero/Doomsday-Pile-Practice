// Spec §5: phases/turns, Oracle trigger window, mana, purity, stateKey.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { buildStartState, legalActions, applyAction, status, stateKey } from '../src/engine.js';
import {
  ORACLE, WRAITH, SEA, SEWERS, DELTA, LED, PETAL, CAVERN, PILE_A,
  makeSetup, setupA, start, deckWith, bf, counts, sameMultiset, pool, restricted, normPay,
  isType, isCast, isCastPaid, isCycle, isTap, isPlay, isCrack, isLed, isPass, isResolve, isChoose,
  findAction, findActions, hasAction, apply1, act, leaves, leavesOf, passTo,
  deepFreeze, actionKey, countOn,
} from './helpers.js';

const PASS = { type: 'pass', desc: 'Pass' };

describe('phases and turns (§5.2)', () => {
  const setup = () => makeSetup({
    deck: deckWith({ [CAVERN]: 1 }),
    hand: ['Island'],
    battlefield: [bf(CAVERN), bf(SEA, true)],
    manaPool: { U: 1, B: 2 },
    landPlayedThisTurn: true,
    turnsAhead: 1,
  });
  const PILE = ['Swamp', WRAITH, WRAITH, 'Island', 'Island'];

  test('pass from main → opp: pools (incl. restricted) emptied, noncreatureCast reset, turn unchanged, nothing untaps', () => {
    let s = buildStartState(setup(), PILE);
    s = act(s, isTap(CAVERN, 'rU'));
    assert.equal(restricted(s.restricted).U, 1);
    s = act(s, isPass, 'pass');
    assert.equal(s.phase, 'opp');
    assert.equal(s.turn, 0);
    assert.deepEqual(pool(s.pool), { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 });
    assert.deepEqual(restricted(s.restricted), { W: 0, U: 0, B: 0, R: 0, G: 0 });
    assert.equal(s.noncreatureCast, 0);
    assert.equal(countOn(s.battlefield, CAVERN, true), 1);
    assert.equal(countOn(s.battlefield, SEA, true), 1);
    assert.deepEqual(s.library, PILE);
    sameMultiset(s.hand, ['Island']);
  });

  test('pass from opp → my turn+1: untap all, landPlayed=false, noncreatureCast=0, draw a card', () => {
    let s = buildStartState(setup(), PILE);
    s = act(s, isTap(CAVERN, 'C'));
    s = act(s, isPass);
    s = act(s, isPass);
    assert.equal(s.phase, 'main');
    assert.equal(s.turn, 1);
    assert.ok(s.battlefield.every((p) => !p.tapped), 'all permanents untapped');
    assert.equal(s.landPlayed, false);
    assert.equal(s.noncreatureCast, 0);
    sameMultiset(s.hand, ['Island', 'Swamp']);
    assert.deepEqual(s.library, [WRAITH, WRAITH, 'Island', 'Island']);
    assert.deepEqual(pool(s.pool), { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 });
    assert.equal(status(s), 'ongoing');
  });

  test('pass is not legal (and throws) from main when turn == turnsAhead (turnsAhead 0)', () => {
    const s = buildStartState(setupA({ turnsAhead: 0 }), [...PILE_A]);
    assert.ok(!hasAction(s, isPass));
    assert.throws(() => applyAction(s, PASS));
  });

  test('turnsAhead 1: pass is legal on turn 0 and in opp, not on turn 1', () => {
    let s = buildStartState(setupA({ turnsAhead: 1 }), [...PILE_A]);
    assert.ok(hasAction(s, isPass));
    s = act(s, isPass);
    assert.ok(hasAction(s, isPass));
    s = act(s, isPass);
    assert.equal(s.turn, 1);
    assert.ok(!hasAction(s, isPass));
    assert.throws(() => applyAction(s, PASS));
  });

  test('turnsAhead 2: pass is legal on turn 1, not on turn 2', () => {
    let s = buildStartState(setupA({ turnsAhead: 2 }), [...PILE_A]);
    s = passTo(s, 'main', 1);
    assert.ok(hasAction(s, isPass));
    s = passTo(s, 'main', 2);
    assert.ok(!hasAction(s, isPass));
    assert.equal(s.library.length, 3); // drew on turns 1 and 2
  });

  test('drawing from an empty library in the draw step is a loss with no actions', () => {
    let s = buildStartState(makeSetup({ deck: { Doomsday: 1, [ORACLE]: 1 }, hand: [ORACLE], turnsAhead: 1 }), []);
    s = act(s, isPass);
    assert.equal(status(s), 'ongoing');
    s = act(s, isPass);
    assert.equal(status(s), 'loss');
    assert.deepEqual(legalActions(s), []);
  });

  test('one land per turn, only in main; the land drop resets on my next turn', () => {
    let s = start({ hand: ['Island', 'Swamp'], turnsAhead: 1 }, [WRAITH, WRAITH, WRAITH, ORACLE, 'Island']);
    s = act(s, isPlay('Island'));
    assert.equal(s.landPlayed, true);
    assert.ok(!hasAction(s, isType('play_land')), 'second land drop must not be offered');
    s = act(s, isPass);
    assert.ok(!hasAction(s, isType('play_land')), 'no land drop on the opponent turn');
    s = act(s, isPass);
    assert.equal(s.landPlayed, false);
    assert.ok(hasAction(s, isPlay('Swamp')));
  });

  test('sorcery-speed actions are not offered on the opponent turn; instants are', () => {
    let s = start({
      hand: ['Ponder', 'Brainstorm', PETAL, ORACLE, 'Island'],
      battlefield: [bf('Island'), bf('Island'), bf('Island')],
      turnsAhead: 1,
    }, [WRAITH, WRAITH, 'Swamp', 'Swamp', 'Swamp']);
    s = act(s, isPass);
    s = act(s, isTap('Island', 'U'));
    s = act(s, isTap('Island', 'U'));
    assert.equal(pool(s.pool).U, 2);
    assert.ok(hasAction(s, isCast('Brainstorm')));
    assert.ok(!hasAction(s, isCast('Ponder')));
    assert.ok(!hasAction(s, isCast(PETAL)));
    assert.ok(!hasAction(s, isCast(ORACLE)));
    assert.ok(!hasAction(s, isType('play_land')));
  });

  test('while a pendingChoice is set, only its options are legal (no pass, no mana abilities)', () => {
    const s0 = start({ hand: [SEWERS], battlefield: [bf('Island')], turnsAhead: 1 }, [...PILE_A]);
    const s = act(s0, isPlay(SEWERS));
    assert.ok(s.pendingChoice);
    const acts = legalActions(s);
    assert.ok(acts.length > 0);
    assert.ok(acts.every((a) => a.type === 'choose'), acts.map((a) => a.type).join(','));
  });
});

describe('Oracle trigger window (§5.3)', () => {
  const windowSetup = () => makeSetup({
    hand: [ORACLE, WRAITH, 'Brainstorm', 'Ponder', 'Island', PETAL],
    battlefield: [bf(SEA), bf(LED), bf(DELTA)],
    manaPool: { U: 3 },
    turnsAhead: 1,
  });

  test('casting Oracle puts it on the battlefield and sets pendingTrigger', () => {
    const s0 = buildStartState(windowSetup(), [...PILE_A]);
    const s = act(s0, isCastPaid(ORACLE, { U: 2 }));
    assert.equal(s.pendingTrigger, true);
    assert.equal(countOn(s.battlefield, ORACLE), 1);
    assert.ok(!s.hand.includes(ORACLE));
    assert.equal(pool(s.pool).U, 1);
    assert.equal(status(s), 'ongoing');
  });

  test('instant-speed actions are allowed while the trigger is pending', () => {
    const s = act(buildStartState(windowSetup(), [...PILE_A]), isCastPaid(ORACLE, { U: 2 }));
    assert.ok(hasAction(s, isResolve), 'resolve_oracle');
    assert.ok(hasAction(s, isCycle(WRAITH)), 'cycling');
    assert.ok(hasAction(s, isCast('Brainstorm')), 'instant');
    assert.ok(hasAction(s, isTap(SEA, 'U')) && hasAction(s, isTap(SEA, 'B')), 'land mana ability');
    assert.ok(hasAction(s, isCrack(DELTA)), 'fetchland');
    assert.ok(hasAction(s, isLed('U')), 'LED');
  });

  test('sorcery-speed actions and pass are NOT allowed while the trigger is pending', () => {
    const s = act(buildStartState(windowSetup(), [...PILE_A]), isCastPaid(ORACLE, { U: 2 }));
    assert.ok(!hasAction(s, isPass), 'pass');
    assert.ok(!hasAction(s, isType('play_land')), 'land');
    assert.ok(!hasAction(s, isCast('Ponder')), 'sorcery');
    assert.ok(!hasAction(s, isCast(PETAL)), 'artifact spell');
    assert.throws(() => applyAction(s, PASS));
  });

  test('resolving immediately with library 5 > devotion 2 does not win', () => {
    const s = act(buildStartState(setupA({ turnsAhead: 1 }), [...PILE_A]), isCastPaid(ORACLE, { U: 2 }));
    for (const l of leavesOf(s, isResolve)) {
      assert.equal(status(l), 'ongoing');
      assert.equal(l.pendingTrigger, false);
    }
  });

  test('library size is measured at resolution (cycle 3 Wraiths with the trigger pending → win)', () => {
    let s = act(buildStartState(setupA(), [...PILE_A]), isCastPaid(ORACLE, { U: 2 }));
    for (let i = 0; i < 3; i++) s = act(s, isCycle(WRAITH));
    assert.equal(s.library.length, 2);
    assert.equal(s.pendingTrigger, true);
    s = act(s, isResolve);
    assert.equal(status(s), 'win');
    assert.deepEqual(legalActions(s), []);
  });

  test('non-winning resolution: top X=2 → choose one (or none) on top, rest to the bottom in random order; game continues', () => {
    const pile = ['Island', 'Swamp', 'Ponder', 'Consider', 'Brainstorm'];
    const s = act(start({ hand: [ORACLE], manaPool: { U: 3 }, turnsAhead: 1 }, pile), isCastPaid(ORACLE, { U: 2 }));
    const ls = leavesOf(s, isResolve);
    const libs = new Set(ls.map((l) => JSON.stringify(l.library)));
    assert.deepEqual([...libs].sort(), [
      ['Island', 'Ponder', 'Consider', 'Brainstorm', 'Swamp'],
      ['Swamp', 'Ponder', 'Consider', 'Brainstorm', 'Island'],
      ['Ponder', 'Consider', 'Brainstorm', 'Island', 'Swamp'],
      ['Ponder', 'Consider', 'Brainstorm', 'Swamp', 'Island'],
    ].map((x) => JSON.stringify(x)).sort());
    for (const l of ls) {
      assert.equal(status(l), 'ongoing');
      assert.equal(l.pendingTrigger, false);
      assert.equal(l.pendingChoice, null);
      assert.equal(countOn(l.battlefield, ORACLE), 1);
      assert.equal(pool(l.pool).U, 1, 'pool persists through trigger resolution');
      assert.ok(hasAction(l, isPass), 'the game goes on: pass is legal again');
    }
  });

  test('"none on top" puts both looked-at cards on the bottom as an AND over the 2 orderings', () => {
    // Among the decision groups of resolve_oracle, exactly one is random (2 outcomes).
    const pile = ['Island', 'Swamp', 'Ponder', 'Consider', 'Brainstorm'];
    const s = act(start({ hand: [ORACLE], manaPool: { U: 2 }, turnsAhead: 1 }, pile), isCastPaid(ORACLE, { U: 2 }));
    const results = [];
    const walk = (st, a) => {
      const r = applyAction(st, a);
      if (r.length === 1 && r[0].state.pendingChoice) for (const c of legalActions(r[0].state)) walk(r[0].state, c);
      else results.push(r);
    };
    for (const a of findActions(s, isResolve)) walk(s, a);
    const random = results.filter((r) => r.length > 1);
    assert.equal(random.length, 1);
    assert.equal(random[0].length, 2);
    assert.equal(results.filter((r) => r.length === 1).length, 2);
  });
});

describe('mana (§5.4)', () => {
  test('payments are exact and distinct: Oracle {U}{U} from {U:3,B:1} has exactly one payment {U:2}', () => {
    const s = start({ hand: [ORACLE, 'Flow State'], manaPool: { U: 3, B: 1 } }, [...PILE_A]);
    const casts = findActions(s, isCast(ORACLE));
    assert.equal(casts.length, 1);
    assert.deepEqual(normPay(casts[0].payment), { U: 2 });
  });

  test('Flow State {1}{U} from {U:3,B:1} has exactly the payments {U:2} and {B:1,U:1}', () => {
    const s = start({ hand: [ORACLE, 'Flow State'], manaPool: { U: 3, B: 1 } }, [...PILE_A]);
    const pays = findActions(s, isCast('Flow State')).map((a) => JSON.stringify(normPay(a.payment))).sort();
    assert.deepEqual(pays, [JSON.stringify({ B: 1, U: 1 }), JSON.stringify({ U: 2 })].sort());
  });

  test('a spell is not offered when no exact payment exists', () => {
    const s = start({ hand: [ORACLE], manaPool: { U: 1, B: 5 } }, [...PILE_A]);
    assert.ok(!hasAction(s, isCast(ORACLE)));
  });

  test('casting spends exactly the payment', () => {
    const s = act(start({ hand: ['Flow State'], manaPool: { U: 3, B: 1 } }, [...PILE_A]), isCastPaid('Flow State', { U: 1, B: 1 }));
    assert.deepEqual(pool(s.pool), { W: 0, U: 2, B: 0, R: 0, G: 0, C: 0 });
  });

  test('tap actions: one per land per color it can make; tapped lands give none', () => {
    const s = start({
      deck: deckWith({ [CAVERN]: 1 }),
      battlefield: [bf('Island'), bf('Island', true), bf('Swamp'), bf(SEA), bf(SEWERS), bf(CAVERN)],
    }, [WRAITH, WRAITH, 'Swamp', 'Swamp', 'Swamp']);
    const taps = findActions(s, isType('tap')).map((a) => `${a.card}:${a.color}`).sort();
    assert.deepEqual(taps, [
      'Island:U', 'Swamp:B', `${SEA}:U`, `${SEA}:B`, `${SEWERS}:U`, `${SEWERS}:B`,
      `${CAVERN}:C`, `${CAVERN}:rW`, `${CAVERN}:rU`, `${CAVERN}:rB`, `${CAVERN}:rR`, `${CAVERN}:rG`,
    ].sort());
  });

  test('tapping a land adds its mana and taps it', () => {
    const s = act(start({ battlefield: [bf(SEA)] }, [...PILE_A]), isTap(SEA, 'B'));
    assert.equal(pool(s.pool).B, 1);
    assert.equal(countOn(s.battlefield, SEA, true), 1);
    assert.ok(!hasAction(s, isType('tap')));
  });

  test('Cavern restricted mana goes to the restricted pool and pays for a Merfolk Oracle', () => {
    let s = start({ deck: deckWith({ [CAVERN]: 1 }), hand: [ORACLE], battlefield: [bf(CAVERN)], manaPool: { U: 1 }, cavernType: 'Merfolk' }, [...PILE_A]);
    s = act(s, isTap(CAVERN, 'rU'));
    assert.equal(restricted(s.restricted).U, 1);
    assert.equal(pool(s.pool).U, 1);
    const c = findAction(s, isCast(ORACLE));
    assert.deepEqual(normPay(c.payment), { U: 1, rU: 1 });
    s = apply1(s, c);
    assert.equal(s.pendingTrigger, true);
    assert.equal(restricted(s.restricted).U, 0);
    assert.equal(pool(s.pool).U, 0);
  });

  test('Cavern naming Wizard also pays for Oracle (Merfolk Wizard)', () => {
    let s = start({ deck: deckWith({ [CAVERN]: 1 }), hand: [ORACLE], battlefield: [bf(CAVERN)], manaPool: { U: 1 }, cavernType: 'Wizard' }, [...PILE_A]);
    s = act(s, isTap(CAVERN, 'rU'));
    assert.ok(hasAction(s, isCastPaid(ORACLE, { U: 1, rU: 1 })));
  });

  test('Cavern naming another type cannot pay for Oracle', () => {
    let s = start({ deck: deckWith({ [CAVERN]: 1 }), hand: [ORACLE], battlefield: [bf(CAVERN)], manaPool: { U: 1 }, cavernType: 'Goblin' }, [...PILE_A]);
    s = act(s, isTap(CAVERN, 'rU'));
    assert.ok(!hasAction(s, isCast(ORACLE)));
  });

  test('restricted mana of the wrong color cannot pay a colored symbol', () => {
    let s = start({ deck: deckWith({ [CAVERN]: 1 }), hand: [ORACLE], battlefield: [bf(CAVERN)], manaPool: { U: 1 } }, [...PILE_A]);
    s = act(s, isTap(CAVERN, 'rB'));
    assert.ok(!hasAction(s, isCast(ORACLE)));
  });

  test('restricted mana cannot pay for noncreature spells', () => {
    let s = start({ deck: deckWith({ [CAVERN]: 1 }), hand: ['Brainstorm', 'Ponder'], battlefield: [bf(CAVERN)] }, [...PILE_A]);
    s = act(s, isTap(CAVERN, 'rU'));
    assert.ok(!hasAction(s, isCast('Brainstorm')));
    assert.ok(!hasAction(s, isCast('Ponder')));
  });

  test('with {U:2} + restricted U, Oracle has two distinct payments', () => {
    let s = start({ deck: deckWith({ [CAVERN]: 1 }), hand: [ORACLE], battlefield: [bf(CAVERN)], manaPool: { U: 2 } }, [...PILE_A]);
    s = act(s, isTap(CAVERN, 'rU'));
    const pays = findActions(s, isCast(ORACLE)).map((a) => JSON.stringify(normPay(a.payment))).sort();
    assert.deepEqual(pays, [JSON.stringify({ U: 1, rU: 1 }), JSON.stringify({ U: 2 })].sort());
  });

  test('the pool persists through a choice (Brainstorm put-back)', () => {
    const s = act(start({ hand: ['Brainstorm'], manaPool: { U: 3, B: 1 } }, [...PILE_A]), isCast('Brainstorm'));
    assert.ok(s.pendingChoice);
    assert.deepEqual(pool(s.pool), { W: 0, U: 2, B: 1, R: 0, G: 0, C: 0 });
    for (const c of legalActions(s)) {
      const after = apply1(s, c);
      assert.deepEqual(pool(after.pool), { W: 0, U: 2, B: 1, R: 0, G: 0, C: 0 });
    }
  });
});

describe('purity and identity (§2, §8)', () => {
  const richSetup = () => makeSetup({
    hand: [ORACLE, WRAITH, 'Brainstorm', 'Ponder', 'Island', PETAL],
    battlefield: [bf(DELTA), bf(SEA), bf(LED)],
    manaPool: { U: 2, B: 1 },
    turnsAhead: 1,
  });
  const RICH_PILE = [WRAITH, WRAITH, 'Island', 'Swamp', 'Swamp'];

  test('legalActions and applyAction work on a deep-frozen state, for every legal action', () => {
    const s = deepFreeze(buildStartState(richSetup(), RICH_PILE));
    const snap = JSON.stringify(s);
    const acts = legalActions(s);
    assert.ok(acts.length > 5);
    for (const a of acts) {
      const r = applyAction(s, a);
      assert.ok(Array.isArray(r) && r.length >= 1, `applyAction(${a.desc}) returned no outcomes`);
      for (const o of r) assert.ok(o.state && typeof o.state === 'object');
    }
    assert.equal(JSON.stringify(s), snap);
  });

  test('applyAction does not mutate an unfrozen input state (deep snapshot)', () => {
    const s = buildStartState(richSetup(), RICH_PILE);
    const snap = JSON.stringify(s);
    for (const a of legalActions(s)) applyAction(s, a);
    assert.equal(JSON.stringify(s), snap);
  });

  test('pending-choice and pending-trigger states are also safe to freeze', () => {
    const base = buildStartState(richSetup(), RICH_PILE);
    const bs = deepFreeze(act(base, isCast('Brainstorm')));
    for (const c of legalActions(bs)) applyAction(bs, c);
    const or = deepFreeze(act(base, isCast(ORACLE)));
    for (const a of legalActions(or)) applyAction(or, a);
  });

  test('every legal action has a type and a human-readable desc', () => {
    const s = buildStartState(richSetup(), RICH_PILE);
    for (const a of legalActions(s)) {
      assert.equal(typeof a.type, 'string');
      assert.equal(typeof a.desc, 'string');
      assert.ok(a.desc.length > 0);
    }
  });

  test('legalActions never contains duplicates (same type + params)', () => {
    const base = buildStartState(richSetup(), RICH_PILE);
    const states = [
      base,
      act(base, isPass),
      act(base, isCast('Brainstorm')),
      act(base, isCast('Ponder')),
      act(base, isCast(ORACLE)),
      buildStartState(makeSetup({ hand: [WRAITH, WRAITH], battlefield: [bf(PETAL), bf(PETAL), bf(SEA), bf(SEA)] }), RICH_PILE),
    ];
    for (const s of states) {
      const keys = legalActions(s).map(actionKey);
      assert.equal(new Set(keys).size, keys.length, `duplicates in ${keys.join('\n')}`);
    }
  });

  test('two identical Petals / Seas give one action per color, not one per copy', () => {
    const s = buildStartState(makeSetup({ battlefield: [bf(PETAL), bf(PETAL), bf(SEA), bf(SEA)] }), RICH_PILE);
    assert.equal(findActions(s, isType('sac_petal')).length, 5);
    assert.equal(findActions(s, isType('tap')).length, 2);
  });

  test('applyAction throws on illegal actions', () => {
    const s = buildStartState(setupA({ manaPool: { U: 3 } }), [...PILE_A]);
    assert.throws(() => applyAction(s, PASS), 'pass at the horizon');
    assert.throws(() => applyAction(s, { type: 'cast', card: ORACLE, payment: { U: 3 }, desc: 'overpay' }), 'overpayment');
    assert.throws(() => applyAction(s, { type: 'cast', card: ORACLE, payment: { U: 1 }, desc: 'underpay' }), 'underpayment');
    assert.throws(() => applyAction(s, { type: 'cast', card: 'Ponder', payment: { U: 1 }, desc: 'not in hand' }), 'not in hand');
    assert.throws(() => applyAction(s, { type: 'resolve_oracle', desc: 'no trigger' }), 'no trigger');
    assert.throws(() => applyAction(s, { type: 'choose', option: 0, desc: 'no choice' }), 'no choice');
    assert.throws(() => applyAction(s, { type: 'play_land', card: 'Island', desc: 'not in hand' }), 'land not in hand');
    assert.throws(() => applyAction(s, { type: 'cycle', card: 'Brainstorm', desc: 'no cycling' }), 'no cycling');
  });

  test('stateKey ignores hand order', () => {
    const a = buildStartState(setupA({ hand: [ORACLE, WRAITH] }), [...PILE_A]);
    const b = buildStartState(setupA({ hand: [WRAITH, ORACLE] }), [...PILE_A]);
    assert.equal(typeof stateKey(a), 'string');
    assert.equal(stateKey(a), stateKey(b));
  });

  test('stateKey ignores graveyard order (Ritual→Duress vs Duress→Ritual) and history', () => {
    const s = start({ deck: deckWith({ Duress: 1 }), hand: ['Dark Ritual', 'Duress'], manaPool: { B: 2 } }, [...PILE_A]);
    const x = act(act(s, isCast('Dark Ritual')), isCast('Duress'));
    const y = act(act(s, isCast('Duress')), isCast('Dark Ritual'));
    assert.deepEqual(pool(x.pool), pool(y.pool));
    assert.notDeepEqual(x.graveyard, y.graveyard);
    assert.equal(stateKey(x), stateKey(y));
  });

  test('stateKey includes library order', () => {
    const a = buildStartState(setupA(), [WRAITH, WRAITH, 'Island', 'Island', 'Island']);
    const b = buildStartState(setupA(), ['Island', WRAITH, WRAITH, 'Island', 'Island']);
    assert.notEqual(stateKey(a), stateKey(b));
  });

  test('stateKey distinguishes life, pool and phase', () => {
    const a = buildStartState(setupA({ turnsAhead: 1 }), [...PILE_A]);
    const b = buildStartState(setupA({ turnsAhead: 1, lifeBeforeDoomsday: 18 }), [...PILE_A]);
    const c = buildStartState(setupA({ turnsAhead: 1, manaPool: { U: 1 } }), [...PILE_A]);
    const d = act(a, isPass);
    assert.notEqual(stateKey(a), stateKey(b));
    assert.notEqual(stateKey(a), stateKey(c));
    assert.notEqual(stateKey(a), stateKey(d));
  });
});
