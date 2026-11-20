// SPEC_V2 §2 (extended setup, unknown permanents) + SPEC_V2_API §1.1, §2, §3.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { buildStartState, stateKey } from '../src/engine.js';
import { OPP_CARDS } from '../src/oppCards.js';
import { MODELLED_HAND_CARDS, MODELLED_PERMANENTS, parseCost, castableInPrinciple } from '../src/opponent.js';
import {
  ORACLE, WRAITH, PILE_A, CHALICE, FLUTE, setupA, oppObj, withOpp, perm,
  DAZE, NEEDLE, FOW, STIFLE, SURGICAL, DISMEMBER, PACT, KCOMMAND, BOLT,
} from './v2-helpers.js';

const throwsBuild = (setup) =>
  assert.throws(() => buildStartState(setup, [...PILE_A]), (e) => e instanceof Error && e.message.length > 0);

describe('extended opponent object and state.opp (API §2, §3)', () => {
  test('defaults: no hand, no lands, life 20, no treasures, no opponent spells', () => {
    const s = buildStartState(setupA(), [...PILE_A]);
    assert.deepEqual(s.opp.hand, []);
    assert.equal(s.opp.handSize, 0);
    assert.equal(s.opp.manaAvailable, 0);
    assert.equal(s.opp.landsTotal, 0);
    assert.equal(s.opp.colors, '');
    assert.equal(s.opp.life, 20);
    assert.equal(s.opp.treasures, 0);
    assert.equal(s.opp.spellsCast, 0);
    assert.equal(s.pendingOppSpell, null);
    assert.deepEqual(s.warnings, []);
  });

  test('given values are copied: manaAvailable = lands.untapped, landsTotal = lands.total', () => {
    const s = buildStartState(withOpp(setupA(), { hand: [DAZE], handSize: 4, untapped: 2, total: 4, colors: 'UB', life: 17 }), [...PILE_A]);
    assert.deepEqual(s.opp.hand, [DAZE]);
    assert.equal(s.opp.handSize, 4);
    assert.equal(s.opp.manaAvailable, 2);
    assert.equal(s.opp.landsTotal, 4);
    assert.equal(s.opp.colors, 'UB');
    assert.equal(s.opp.life, 17);
  });

  test('handSize defaults to hand.length', () => {
    const s = buildStartState(withOpp(setupA(), { hand: [DAZE, STIFLE] }), [...PILE_A]);
    assert.equal(s.opp.handSize, 2);
  });

  test('spellsCast defaults to noncreatureSpellsCastThisTurn; drawsThisTurn defaults to 1', () => {
    const a = buildStartState(setupA(), [...PILE_A]);
    assert.equal(a.spellsCast, 1);
    assert.equal(a.drawsThisTurn, 1);
    const b = buildStartState(setupA({ noncreatureSpellsCastThisTurn: 0 }), [...PILE_A]);
    assert.equal(b.spellsCast, 0);
    const c = buildStartState(setupA({ spellsCastThisTurn: 3, cardsDrawnThisTurn: 0 }), [...PILE_A]);
    assert.equal(c.spellsCast, 3);
    assert.equal(c.drawsThisTurn, 0);
  });

  test('scenario fields of opponent permanents are kept', () => {
    const p = { name: 'Murktide Regent', power: 6, toughness: 6, tapped: true, counters: 3 };
    const s = buildStartState(withOpp(setupA(), { permanents: [p] }), [...PILE_A]);
    assert.equal(s.opponent.permanents.length, 1);
    for (const [k, v] of Object.entries(p)) assert.equal(s.opponent.permanents[0][k], v, k);
  });

  test('stateKey distinguishes different opponent hands', () => {
    const a = buildStartState(withOpp(setupA(), { hand: [DAZE], untapped: 1, colors: 'U' }), [...PILE_A]);
    const b = buildStartState(withOpp(setupA(), { hand: [STIFLE], untapped: 1, colors: 'U' }), [...PILE_A]);
    assert.notEqual(stateKey(a), stateKey(b));
  });
});

describe('unknown opponent permanents (SPEC_V2 §2, §3)', () => {
  test('an unknown permanent no longer throws; it is kept and named in state.warnings', () => {
    const s = buildStartState(withOpp(setupA(), { permanents: [perm('Mystery Totem'), perm('Volcanic Island')] }), [...PILE_A]);
    assert.ok(s.opponent.permanents.some((p) => p.name === 'Mystery Totem'));
    assert.ok(s.warnings.some((w) => w.includes('Mystery Totem')), s.warnings.join(' | '));
    assert.ok(s.warnings.some((w) => w.includes('Volcanic Island')), s.warnings.join(' | '));
  });

  test('a known creature with no modelled ability (Delver of Secrets) gives no warning', () => {
    const s = buildStartState(withOpp(setupA(), { permanents: [perm('Delver of Secrets')] }), [...PILE_A]);
    assert.ok(!s.warnings.some((w) => w.includes('Delver')), s.warnings.join(' | '));
  });

  test('variable power without a scenario power warns; with a power it does not', () => {
    // OPP_CARDS Nethergoyf: power '*', toughness '1+*'.
    const a = buildStartState(withOpp(setupA(), { permanents: [perm('Nethergoyf')] }), [...PILE_A]);
    assert.ok(a.warnings.some((w) => w.includes('Nethergoyf')), a.warnings.join(' | '));
    const b = buildStartState(withOpp(setupA(), { permanents: [perm('Nethergoyf', { power: 4 })] }), [...PILE_A]);
    assert.ok(!b.warnings.some((w) => w.includes('Nethergoyf')), b.warnings.join(' | '));
  });

  test('every modelled permanent is accepted without a warning', () => {
    const permanents = MODELLED_PERMANENTS.map((n) =>
      (n === CHALICE ? perm(n, { x: 1 }) : n === FLUTE || n === NEEDLE ? perm(n, { named: 'Brainstorm' }) : perm(n)));
    const s = buildStartState(withOpp(setupA(), { permanents }), [...PILE_A]);
    for (const n of MODELLED_PERMANENTS) assert.ok(!s.warnings.some((w) => w.includes(n)), `${n}: ${s.warnings.join(' | ')}`);
  });
});

describe('validation of the new fields (API §2)', () => {
  test('opponent.hand names must be modelled hidden-hand cards', () => {
    throwsBuild(withOpp(setupA(), { hand: ['Brainstorm'] }));
    throwsBuild(withOpp(setupA(), { hand: ['Grizzly Bears'] }));
  });
  test('handSize must be an int ≥ hand.length', () => {
    throwsBuild(withOpp(setupA(), { hand: [DAZE, DAZE], handSize: 1 }));
    throwsBuild(withOpp(setupA(), { hand: [DAZE], handSize: 1.5 }));
  });
  test('lands: 0 ≤ untapped ≤ total, colors only from WUBRGC', () => {
    throwsBuild({ ...setupA(), opponent: { permanents: [], lands: { untapped: 3, total: 2, colors: 'U' } } });
    throwsBuild({ ...setupA(), opponent: { permanents: [], lands: { untapped: -1, total: 2, colors: 'U' } } });
    throwsBuild({ ...setupA(), opponent: { permanents: [], lands: { untapped: 1, total: 2, colors: 'X' } } });
  });
  test('opponent life must be an int ≥ 1', () => {
    throwsBuild(withOpp(setupA(), { life: 0 }));
  });
  test('a given power must be an int ≥ 0', () => {
    throwsBuild(withOpp(setupA(), { permanents: [perm('Murktide Regent', { power: -1 })] }));
    throwsBuild(withOpp(setupA(), { permanents: [perm('Murktide Regent', { power: '3' })] }));
  });
  test('Pithing Needle needs a string `named`', () => {
    throwsBuild(withOpp(setupA(), { permanents: [perm(NEEDLE)] }));
    assert.doesNotThrow(() => buildStartState(withOpp(setupA(), { permanents: [perm(NEEDLE, { named: WRAITH })] }), [...PILE_A]));
  });
});

describe('src/opponent.js exports (API §1.1)', () => {
  test('MODELLED_HAND_CARDS is exactly the 30 cards of SPEC_V2 §5.4 + §10', () => {
    const expected = [
      FOW, 'Force of Negation', DAZE, 'Spell Pierce', 'Flusterstorm', 'Pyroblast', 'Red Elemental Blast', 'Spell Snare',
      PACT, 'Mindbreak Trap', 'Mental Misstep', KCOMMAND, 'Consign to Memory', STIFLE,
      'Swords to Plowshares', 'Fatal Push', 'Snuff Out', DISMEMBER, 'Solitude', BOLT, 'Sink into Stupor', SURGICAL,
      'Thoughtseize', 'Duress', 'Inquisition of Kozilek', 'Unmask', 'Cabal Therapy', 'Collective Brutality',
      'Orcish Bowmasters', 'Endurance',
    ];
    assert.deepEqual([...MODELLED_HAND_CARDS].sort(), [...expected].sort());
    for (const n of MODELLED_HAND_CARDS) assert.ok(OPP_CARDS[n] && OPP_CARDS[n].verified, `${n} must have verified text`);
  });

  test('MODELLED_PERMANENTS is exactly the v1 five + the 23 v2 permanents', () => {
    const expected = [
      'Deafening Silence', 'Thalia, Guardian of Thraben', 'Gaddock Teeg', CHALICE, FLUTE,
      'Thorn of Amethyst', 'Sphere of Resistance', 'Trinisphere', 'Damping Sphere', 'Archon of Emeria', NEEDLE,
      'Collector Ouphe', 'Karn, the Great Creator', "Grafdigger's Cage", 'Torpor Orb', 'Teferi, Time Raveler',
      'Narset, Parter of Veils', 'Hullbreacher', 'Orcish Bowmasters', 'Blood Moon', 'Magus of the Moon',
      'Back to Basics', "Tormod's Crypt", 'Wasteland', 'Ghost Quarter', 'Voice of Victory', 'Dauthi Voidwalker',
      'Goblin Guide',
    ];
    assert.deepEqual([...MODELLED_PERMANENTS].sort(), [...expected].sort());
    for (const n of MODELLED_PERMANENTS) assert.ok(OPP_CARDS[n], `${n} must be in OPP_CARDS`);
  });

  const zero = { W: 0, U: 0, B: 0, R: 0, G: 0 };
  test('parseCost: generic, coloured, {C}, hybrid, Phyrexian, {X}', () => {
    assert.deepEqual(parseCost('{3}{U}{U}'), { generic: 3, colored: { ...zero, C: 0, U: 2 }, hybrid: [], phyrexian: { ...zero }, x: 0 });
    assert.deepEqual(parseCost('{X}{C}{C}'), { generic: 0, colored: { ...zero, C: 2 }, hybrid: [], phyrexian: { ...zero }, x: 1 });
    assert.deepEqual(parseCost('{1}{B/P}{B/P}'), { generic: 1, colored: { ...zero, C: 0 }, hybrid: [], phyrexian: { ...zero, B: 2 }, x: 0 });
    assert.deepEqual(parseCost('{5}{B/G}{B/G}'), { generic: 5, colored: { ...zero, C: 0 }, hybrid: [['B', 'G'], ['B', 'G']], phyrexian: { ...zero }, x: 0 });
    assert.deepEqual(parseCost('{0}'), { generic: 0, colored: { ...zero, C: 0 }, hybrid: [], phyrexian: { ...zero }, x: 0 });
    assert.deepEqual(parseCost(''), { generic: 0, colored: { ...zero, C: 0 }, hybrid: [], phyrexian: { ...zero }, x: 0 });
  });

  test('parseCost reproduces the mana value of every OPP_CARDS card', () => {
    for (const [name, c] of Object.entries(OPP_CARDS)) {
      const p = parseCost(c.cost);
      const mv = p.generic + Object.values(p.colored).reduce((a, b) => a + b, 0) + p.hybrid.length
        + Object.values(p.phyrexian).reduce((a, b) => a + b, 0);
      assert.equal(mv, c.mv, `${name} ${c.cost}`);
    }
  });

  test('castableInPrinciple: colours needed, Phyrexian and generic never block', () => {
    assert.equal(castableInPrinciple(FOW, 'U'), true);
    assert.equal(castableInPrinciple(FOW, 'RG'), false);
    assert.equal(castableInPrinciple(BOLT, 'R'), true);
    assert.equal(castableInPrinciple(BOLT, 'UB'), false);
    assert.equal(castableInPrinciple(SURGICAL, ''), true); // {B/P}
    assert.equal(castableInPrinciple(DISMEMBER, ''), true); // {1}{B/P}{B/P}
    assert.equal(castableInPrinciple(PACT, ''), true); // {0}
    assert.equal(castableInPrinciple(KCOMMAND, 'U'), false); // {X}{C}{C}
    assert.equal(castableInPrinciple(KCOMMAND, 'C'), true);
  });
});

test('oppObj helper sanity (test-suite internal)', () => {
  assert.deepEqual(oppObj({ untapped: 1, colors: 'U' }).lands, { untapped: 1, total: 1, colors: 'U' });
  assert.equal(ORACLE, "Thassa's Oracle");
});
