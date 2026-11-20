// Spec §3 (setup + validation), §4 (Doomsday resolution) and §7 (cards.js shape).
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { buildStartState, availablePile, status, legalActions } from '../src/engine.js';
import { CARDS, cardDef } from '../src/cards.js';
import {
  CANON_DECK, ORACLE, WRAITH, SEA, PETAL, PILE_A, CHALICE, FLUTE, SILENCE, THALIA, TEEG,
  makeSetup, setupA, bf, counts, normCounts, addCounts, subtractCounts, sameMultiset, pool, restricted,
} from './helpers.js';

const throwsBuild = (setup, pile) =>
  assert.throws(() => buildStartState(setup, pile), (e) => e instanceof Error && typeof e.message === 'string' && e.message.length > 0);

describe('buildStartState validation (§3)', () => {
  test('a valid baseline setup (puzzle A) does not throw', () => {
    assert.doesNotThrow(() => buildStartState(setupA(), [...PILE_A]));
  });

  test('throws when the hand holds more copies of a name than the deck', () => {
    throwsBuild(makeSetup({ hand: [ORACLE, ORACLE, ORACLE] }), [...PILE_A]);
  });

  test('throws when the graveyard holds more copies of a name than the deck', () => {
    throwsBuild(makeSetup({ graveyard: Array(5).fill('Brainstorm') }), [...PILE_A]);
  });

  test('throws when the battlefield holds more copies of a name than the deck', () => {
    throwsBuild(makeSetup({ battlefield: Array(5).fill(0).map(() => bf(SEA)) }), [...PILE_A]);
  });

  test('throws when exile holds more copies of a name than the deck', () => {
    throwsBuild(makeSetup({ exile: Array(5).fill('Ponder') }), [...PILE_A]);
  });

  test('throws when a zone contains a card the deck does not contain at all', () => {
    throwsBuild(makeSetup({ hand: ['Force of Will'] }), [...PILE_A]);
  });

  test('throws when the deck has no Doomsday to account for the one being cast', () => {
    const deck = { ...CANON_DECK };
    delete deck.Doomsday;
    throwsBuild(makeSetup({ deck }), [...PILE_A]);
    throwsBuild(makeSetup({ deck: { ...CANON_DECK, Doomsday: 0 } }), [...PILE_A]);
  });

  test('throws when the pile is not an array of names', () => {
    throwsBuild(setupA(), 'Island');
    throwsBuild(setupA(), null);
    throwsBuild(setupA(), undefined);
    throwsBuild(setupA(), { 0: 'Island' });
    throwsBuild(setupA(), [1, 2, 3, 4, 5]);
    throwsBuild(setupA(), ['Island', 'Island', 'Island', 'Island', null]);
  });

  test('throws when the pile is not exactly 5 cards and the pool has at least 5', () => {
    throwsBuild(setupA(), [WRAITH, WRAITH, 'Island', 'Island']);
    throwsBuild(setupA(), [WRAITH, WRAITH, 'Island', 'Island', 'Island', 'Swamp']);
    throwsBuild(setupA(), []);
  });

  test('with a pool smaller than 5 the pile must be exactly the whole pool', () => {
    // Pool: deck {Doomsday:2, Island:2, Oracle:1} − hand Oracle − 1 Doomsday on the stack = {Doomsday:1, Island:2}.
    const s = makeSetup({ deck: { Doomsday: 2, Island: 2, [ORACLE]: 1 }, hand: [ORACLE] });
    throwsBuild(s, ['Island', 'Island']);
    throwsBuild(s, ['Island', 'Island', 'Doomsday', 'Island', 'Island']);
    assert.doesNotThrow(() => buildStartState(s, ['Island', 'Doomsday', 'Island']));
  });

  test('throws when the pile uses a card more times than the pool contains it', () => {
    // Hand has one Oracle, deck two → only one Oracle in the pool.
    throwsBuild(setupA(), [ORACLE, ORACLE, 'Island', 'Island', 'Island']);
    // Five Islands but only four in the deck.
    throwsBuild(setupA(), ['Island', 'Island', 'Island', 'Island', 'Island']);
    // A name that is not in the pool at all.
    throwsBuild(setupA(), ['Force of Will', 'Island', 'Island', 'Island', 'Island']);
  });

  test('a pre-Doomsday graveyard card is in the pool (and only as many copies as exist)', () => {
    // Deck 2 Oracles: one in hand, one in the graveyard → library has 0, pool has 1 (from the graveyard).
    const s = makeSetup({ hand: [ORACLE], graveyard: [ORACLE] });
    assert.doesNotThrow(() => buildStartState(s, [ORACLE, 'Island', 'Island', 'Island', 'Island']));
    throwsBuild(s, [ORACLE, ORACLE, 'Island', 'Island', 'Island']);
  });

  for (const life of [0, -3, 2.5, '20']) {
    test(`throws when lifeBeforeDoomsday is ${JSON.stringify(life)} (not an integer ≥ 1)`, () => {
      throwsBuild(setupA({ lifeBeforeDoomsday: life }), [...PILE_A]);
    });
  }

  for (const t of [-1, 4, 1.5, '1']) {
    test(`throws when turnsAhead is ${JSON.stringify(t)} (not an integer in 0..3)`, () => {
      throwsBuild(setupA({ turnsAhead: t }), [...PILE_A]);
    });
  }

  test('turnsAhead 0 and 3 are accepted', () => {
    assert.doesNotThrow(() => buildStartState(setupA({ turnsAhead: 0 }), [...PILE_A]));
    assert.doesNotThrow(() => buildStartState(setupA({ turnsAhead: 3 }), [...PILE_A]));
  });

  // Superseded by SPEC_V2 §2 (lead ruling on V2-Q1): unknown opponent permanents are kept
  // with no effect and reported in state.warnings instead of throwing.
  test('an unmodelled opponent permanent warns instead of throwing (SPEC_V2 §2)', () => {
    const s = buildStartState(setupA({ opponent: { permanents: [{ name: 'Totally Unknown Card' }] } }), [...PILE_A]);
    assert.ok(Array.isArray(s.warnings) && s.warnings.some((w) => w.includes('Totally Unknown Card')));
  });

  test('throws when Chalice of the Void lacks an integer x ≥ 0', () => {
    for (const p of [{ name: CHALICE }, { name: CHALICE, x: -1 }, { name: CHALICE, x: 1.5 }, { name: CHALICE, x: '1' }]) {
      throwsBuild(setupA({ opponent: { permanents: [p] } }), [...PILE_A]);
    }
  });

  test('Chalice x = 0 is valid', () => {
    assert.doesNotThrow(() =>
      buildStartState(setupA({ opponent: { permanents: [{ name: CHALICE, x: 0 }] } }), [...PILE_A]));
  });

  test('throws when Disruptor Flute lacks named', () => {
    throwsBuild(setupA({ opponent: { permanents: [{ name: FLUTE }] } }), [...PILE_A]);
  });

  test('all §6 permanents together are accepted', () => {
    const permanents = [
      { name: SILENCE }, { name: THALIA }, { name: TEEG },
      { name: CHALICE, x: 1 }, { name: FLUTE, named: WRAITH },
    ];
    assert.doesNotThrow(() => buildStartState(setupA({ opponent: { permanents } }), [...PILE_A]));
  });

  test('throws when the battlefield contains an instant', () => {
    throwsBuild(setupA({ battlefield: [bf('Brainstorm')] }), [...PILE_A]);
  });

  test('throws when the battlefield contains a sorcery (even a dead one)', () => {
    throwsBuild(setupA({ battlefield: [bf('Ponder')] }), [...PILE_A]);
    throwsBuild(setupA({ battlefield: [bf('Doomsday')] }), [...PILE_A]);
  });

  test('lands and artifacts on the battlefield are accepted', () => {
    assert.doesNotThrow(() =>
      buildStartState(setupA({ battlefield: [bf(SEA, true), bf(PETAL), bf("Lion's Eye Diamond")] }), [...PILE_A]));
  });
});

describe('availablePile (§3)', () => {
  test('empty hand/board: the pool is the deck minus the Doomsday on the stack', () => {
    const expected = { ...CANON_DECK, Doomsday: 3 };
    assert.deepEqual(normCounts(availablePile(makeSetup())), normCounts(expected));
  });

  test('subtracts hand, battlefield, graveyard, exile and the cast Doomsday, then adds the graveyard back', () => {
    const setup = makeSetup({
      hand: [ORACLE, WRAITH, 'Dark Ritual'],
      battlefield: [bf(SEA), bf(SEA, true), bf(PETAL)],
      graveyard: ['Ponder', 'Brainstorm', 'Doomsday'],
      exile: ['Brainstorm'],
    });
    const expected = {
      'Doomsday': 3, // library 4−1(gy)−1(stack)=2, +1 from the graveyard
      [ORACLE]: 1,
      [WRAITH]: 3,
      'Island': 4,
      'Swamp': 4,
      [SEA]: 2,
      'Brainstorm': 3, // library 4−1(gy)−1(exile)=2, +1 from the graveyard
      'Dark Ritual': 3,
      'Ponder': 4, // library 3, +1 from the graveyard
      [PETAL]: 3,
      "Lion's Eye Diamond": 1,
      'Consider': 4,
      'Unearth': 2,
      'Personal Tutor': 3,
      'Flow State': 4,
      'Edge of Autumn': 2,
      'Polluted Delta': 4,
      'Undercity Sewers': 2,
    };
    const got = normCounts(availablePile(setup));
    assert.deepEqual(got, normCounts(expected));
    assert.equal(Object.values(got).reduce((a, b) => a + b, 0), 52);
  });

  test('small decks give small pools', () => {
    const setup = makeSetup({ deck: { Doomsday: 1, Brainstorm: 1, Island: 2 }, hand: ['Brainstorm'] });
    assert.deepEqual(normCounts(availablePile(setup)), { Island: 2 });
  });
});

describe('Doomsday resolution (§4)', () => {
  test('library is the pile in order (pile[0] on top); graveyard is exactly [Doomsday]', () => {
    const pile = [WRAITH, 'Island', 'Swamp', ORACLE, 'Ponder'];
    const s = buildStartState(makeSetup({ hand: [ORACLE], graveyard: ['Ponder', 'Brainstorm'] }), pile);
    assert.deepEqual(s.library, pile);
    assert.deepEqual(s.graveyard, ['Doomsday']);
  });

  test('old graveyard and the rest of the pool are exiled (on top of the existing exile)', () => {
    const setup = makeSetup({
      hand: [ORACLE, WRAITH],
      graveyard: ['Ponder', 'Brainstorm'],
      exile: ['Consider'],
    });
    const pile = [WRAITH, WRAITH, 'Island', 'Island', 'Ponder']; // one Ponder piled from the pool
    const s = buildStartState(setup, pile);
    const expectedExile = addCounts(counts(['Consider']), subtractCounts(normCounts(availablePile(setup)), counts(pile)));
    assert.deepEqual(normCounts(counts(s.exile)), expectedExile);
    // Graveyard Brainstorm was not piled → exiled. Graveyard Ponder count: 1 piled, so pool Ponder 4 → 3 exiled.
    assert.equal(counts(s.exile).Brainstorm, 4); // 3 from the library + 1 from the old graveyard
    assert.equal(counts(s.exile).Ponder, 3);
    assert.equal(counts(s.exile).Doomsday, 3);
  });

  test('a card piled out of the old graveyard ends up in the library, not exile', () => {
    const setup = makeSetup({ hand: [ORACLE], graveyard: [ORACLE] });
    const s = buildStartState(setup, ['Island', ORACLE, 'Island', 'Island', 'Island']);
    assert.equal(s.library[1], ORACLE);
    assert.ok(!s.exile.includes(ORACLE));
    assert.deepEqual(s.graveyard, ['Doomsday']);
  });

  test('hand and battlefield are preserved', () => {
    const s = buildStartState(
      makeSetup({ hand: [ORACLE, WRAITH], battlefield: [bf(SEA, true), bf('Island')] }),
      [...PILE_A],
    );
    sameMultiset(s.hand, [ORACLE, WRAITH]);
    assert.deepEqual(
      s.battlefield.map((p) => ({ name: p.name, tapped: !!p.tapped })),
      [{ name: SEA, tapped: true }, { name: 'Island', tapped: false }],
    );
  });

  for (const [before, after] of [[20, 10], [14, 7], [13, 6], [12, 6], [7, 3], [2, 1]]) {
    test(`life ${before} before Doomsday → ${after} (lose half, rounded up)`, () => {
      const s = buildStartState(setupA({ lifeBeforeDoomsday: before }), [...PILE_A]);
      assert.equal(s.life, after);
      assert.equal(status(s), 'ongoing');
    });
  }

  test('life 1 before Doomsday → 0: the state is already lost and has no actions', () => {
    const s = buildStartState(setupA({ lifeBeforeDoomsday: 1 }), [...PILE_A]);
    assert.equal(s.life, 0);
    assert.equal(status(s), 'loss');
    assert.deepEqual(legalActions(s), []);
  });

  test('initial phase/turn/flags and copied pools', () => {
    const s = buildStartState(
      setupA({ manaPool: { U: 2, B: 1 }, opponent: { permanents: [{ name: CHALICE, x: 3 }] } }),
      [...PILE_A],
    );
    assert.equal(s.phase, 'main');
    assert.equal(s.turn, 0);
    assert.equal(s.pendingTrigger, false);
    assert.equal(s.pendingChoice, null);
    assert.equal(s.landPlayed, false);
    assert.equal(s.noncreatureCast, 1);
    assert.deepEqual(pool(s.pool), { W: 0, U: 2, B: 1, R: 0, G: 0, C: 0 });
    assert.deepEqual(restricted(s.restricted), { W: 0, U: 0, B: 0, R: 0, G: 0 });
    assert.deepEqual(s.opponent.permanents.map((p) => p.name), [CHALICE]);
    assert.equal(s.opponent.permanents[0].x, 3);
  });

  test('landPlayedThisTurn and noncreatureSpellsCastThisTurn are carried into the state', () => {
    const s = buildStartState(setupA({ landPlayedThisTurn: true, noncreatureSpellsCastThisTurn: 3 }), [...PILE_A]);
    assert.equal(s.landPlayed, true);
    assert.equal(s.noncreatureCast, 3);
  });

  test('a pool smaller than 5: the whole pool is the library, nothing extra is exiled', () => {
    const setup = makeSetup({ deck: { Doomsday: 2, Island: 2, [ORACLE]: 1 }, hand: [ORACLE] });
    const s = buildStartState(setup, ['Island', 'Doomsday', 'Island']);
    assert.deepEqual(s.library, ['Island', 'Doomsday', 'Island']);
    assert.deepEqual(s.graveyard, ['Doomsday']);
    assert.deepEqual(s.exile, []);
  });

  test('an empty pool gives an empty library', () => {
    const s = buildStartState(makeSetup({ deck: { Doomsday: 1, [ORACLE]: 1 }, hand: [ORACLE] }), []);
    assert.deepEqual(s.library, []);
    assert.equal(status(s), 'ongoing');
  });
});

describe('cards.js (§7)', () => {
  const SUPPORTED = [
    'Island', 'Swamp', SEA, 'Undercity Sewers', 'Cavern of Souls',
    'Polluted Delta', 'Flooded Strand', 'Bloodstained Mire', 'Misty Rainforest', 'Scalding Tarn', 'Verdant Catacombs',
    PETAL, "Lion's Eye Diamond",
    ORACLE, WRAITH, 'Edge of Autumn', 'Dark Ritual', 'Brainstorm', 'Ponder', 'Consider', 'Personal Tutor',
    'Flow State', 'Unearth', 'Duress', 'Thoughtseize', 'Fatal Push',
  ];
  const DEAD = [
    'Doomsday', 'Daze', 'Force of Will', 'Force of Negation', 'Flusterstorm', 'Barrowgoyf',
    'Jace, Wielder of Mysteries', 'Leyline of the Void', 'Voice of Victory',
  ];
  const lc = (arr) => (arr || []).map((t) => String(t).toLowerCase());
  const normCost = (c) => normCounts(c);

  test('every supported card is in CARDS with supported: true and the full def shape', () => {
    for (const n of SUPPORTED) {
      const d = CARDS[n];
      assert.ok(d, `CARDS is missing ${n}`);
      assert.equal(d.name, n);
      assert.equal(d.supported, true, `${n} should be supported`);
      assert.ok(Array.isArray(d.types) && d.types.length > 0, `${n} types`);
      assert.ok(Array.isArray(d.subtypes), `${n} subtypes`);
      assert.equal(typeof d.cost, 'object');
      assert.equal(typeof d.mv, 'number');
      assert.equal(typeof d.verified, 'boolean');
      assert.equal(typeof d.oracle, 'string');
      assert.ok(d.oracle.length > 0, `${n} oracle text`);
      assert.deepEqual(cardDef(n), d);
    }
  });

  test('dead cards are supported: false', () => {
    for (const n of DEAD) assert.equal(cardDef(n).supported, false, `${n} should be dead`);
  });

  test('cardDef returns a dead def for an unknown name', () => {
    const d = cardDef('Goblin Guide');
    assert.ok(d);
    assert.equal(d.supported, false);
  });

  test('dead cards keep their known types (Doomsday sorcery; Daze/FoW/FoN/Flusterstorm instants)', () => {
    assert.ok(lc(cardDef('Doomsday').types).includes('sorcery'));
    for (const n of ['Daze', 'Force of Will', 'Force of Negation', 'Flusterstorm']) {
      assert.ok(lc(cardDef(n).types).includes('instant'), `${n} should be an instant`);
    }
  });

  test('costs and mana values', () => {
    const table = [
      [ORACLE, { U: 2 }, 2],
      [WRAITH, { B: 2, generic: 3 }, 5],
      ['Edge of Autumn', { G: 1, generic: 1 }, 2],
      ['Dark Ritual', { B: 1 }, 1],
      ['Brainstorm', { U: 1 }, 1],
      ['Ponder', { U: 1 }, 1],
      ['Consider', { U: 1 }, 1],
      ['Personal Tutor', { U: 1 }, 1],
      ['Flow State', { U: 1, generic: 1 }, 2],
      ['Unearth', { B: 1 }, 1],
      ['Duress', { B: 1 }, 1],
      ['Thoughtseize', { B: 1 }, 1],
      ['Fatal Push', { B: 1 }, 1],
      [PETAL, {}, 0],
      ["Lion's Eye Diamond", {}, 0],
    ];
    for (const [n, cost, mv] of table) {
      assert.deepEqual(normCost(cardDef(n).cost), normCost(cost), `${n} cost`);
      assert.equal(cardDef(n).mv, mv, `${n} mv`);
    }
  });

  test('types and subtypes', () => {
    const table = [
      [ORACLE, 'creature'], [WRAITH, 'creature'], ['Edge of Autumn', 'sorcery'], ['Dark Ritual', 'instant'],
      ['Brainstorm', 'instant'], ['Ponder', 'sorcery'], ['Consider', 'instant'], ['Personal Tutor', 'sorcery'],
      ['Flow State', 'sorcery'], ['Unearth', 'sorcery'], ['Duress', 'sorcery'], ['Thoughtseize', 'sorcery'],
      ['Fatal Push', 'instant'], [PETAL, 'artifact'], ["Lion's Eye Diamond", 'artifact'],
      ['Island', 'land'], [SEA, 'land'], ['Undercity Sewers', 'land'], ['Cavern of Souls', 'land'], ['Polluted Delta', 'land'],
    ];
    for (const [n, t] of table) assert.ok(lc(cardDef(n).types).includes(t), `${n} should be a ${t}`);
    const oracleSub = lc(cardDef(ORACLE).subtypes);
    assert.ok(oracleSub.includes('merfolk') && oracleSub.includes('wizard'));
    for (const n of [SEA, 'Undercity Sewers']) {
      const st = lc(cardDef(n).subtypes);
      assert.ok(st.includes('island') && st.includes('swamp'), `${n} is an Island Swamp`);
    }
    assert.ok(lc(cardDef('Island').subtypes).includes('island'));
    assert.ok(lc(cardDef('Swamp').subtypes).includes('swamp'));
  });
});
