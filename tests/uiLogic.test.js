import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  defaultModel, countNames, addName, removeName, opponentPermanents, opponentModel,
  buildSetup, modelFromSetup, pileSize, normalizePile, pileOptions, poolSummary,
  fallbackPilePool, planHasBranch, escapeHtml, renderResultHTML, scenarioToJSON, parseScenario,
} from '../src/uiLogic.js';

const DECK_TEXT = "4 Doomsday\n2 Thassa's Oracle\n4 Street Wraith\n4 Island\n4 Brainstorm\nSideboard\n3 Fatal Push";

test('multiset helpers', () => {
  assert.deepEqual(countNames(['A', 'B', 'A']), { A: 2, B: 1 });
  assert.deepEqual(addName(['A'], 'B'), ['A', 'B']);
  assert.deepEqual(removeName(['A', 'B', 'A'], 'A'), ['A', 'B']);
  const list = ['A'];
  assert.deepEqual(removeName(list, 'Z'), ['A']);
  assert.deepEqual(list, ['A']);
});

test('buildSetup: defaults map onto the §3 schema, main deck only', () => {
  const { setup, errors } = buildSetup(defaultModel(DECK_TEXT));
  assert.deepEqual(errors, []);
  assert.deepEqual(setup.deck, { Doomsday: 4, "Thassa's Oracle": 2, 'Street Wraith': 4, Island: 4, Brainstorm: 4 });
  assert.deepEqual(setup.manaPool, { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 });
  assert.equal(setup.lifeBeforeDoomsday, 20);
  assert.equal(setup.landPlayedThisTurn, false);
  assert.equal(setup.noncreatureSpellsCastThisTurn, 1);
  assert.equal(setup.cavernType, 'Merfolk');
  assert.equal(setup.turnsAhead, 1);
  assert.deepEqual(setup.opponent, { permanents: [] });
  assert.deepEqual(setup.hand, []);
});

test('buildSetup: string inputs from form fields become integers', () => {
  const m = defaultModel(DECK_TEXT);
  m.manaPool.U = '2';
  m.lifeBeforeDoomsday = '14';
  m.turnsAhead = '0';
  m.battlefield = [{ name: 'Island', tapped: 1 }];
  const { setup, errors } = buildSetup(m);
  assert.deepEqual(errors, []);
  assert.equal(setup.manaPool.U, 2);
  assert.equal(setup.lifeBeforeDoomsday, 14);
  assert.equal(setup.turnsAhead, 0);
  assert.deepEqual(setup.battlefield, [{ name: 'Island', tapped: true }]);
});

test('buildSetup: bad numbers and missing opponent params produce errors', () => {
  const m = defaultModel(DECK_TEXT);
  m.lifeBeforeDoomsday = '0';
  m.turnsAhead = 4;
  m.manaPool.B = '-1';
  m.opponent['Chalice of the Void'] = true;
  m.opponent.chaliceX = '';
  m.opponent['Disruptor Flute'] = true;
  m.opponent.fluteNamed = '  ';
  const { errors } = buildSetup(m);
  assert.equal(errors.length, 5, errors.join('\n'));
  assert.ok(errors.some((e) => /Life/.test(e)));
  assert.ok(errors.some((e) => /Turns ahead/.test(e)));
  assert.ok(errors.some((e) => /mana B/.test(e)));
  assert.ok(errors.some((e) => /Chalice/.test(e)));
  assert.ok(errors.some((e) => /Flute/.test(e)));
});

test('buildSetup: zone counts above the deck count are flagged (Doomsday counts the stack copy)', () => {
  const m = defaultModel(DECK_TEXT);
  m.hand = ["Thassa's Oracle", "Thassa's Oracle", "Thassa's Oracle"];
  m.graveyard = ['Doomsday', 'Doomsday', 'Doomsday', 'Doomsday'];
  const { errors } = buildSetup(m);
  assert.ok(errors.some((e) => e.startsWith("Thassa's Oracle: 3")));
  assert.ok(errors.some((e) => e.startsWith('Doomsday: 5')));
});

test('buildSetup: deck parse errors and missing Doomsday are reported', () => {
  const { errors } = buildSetup(defaultModel('4 Island\nbad line'));
  assert.ok(errors.some((e) => /Line 2/.test(e)));
  assert.ok(errors.some((e) => /no Doomsday/.test(e)));
});

test('opponent model <-> permanents round-trip', () => {
  const perms = [
    { name: 'Deafening Silence' },
    { name: 'Chalice of the Void', x: 2 },
    { name: 'Disruptor Flute', named: 'Street Wraith' },
  ];
  const { opp, unknown } = opponentModel([...perms, { name: 'Blood Moon' }]);
  assert.deepEqual(unknown, ['Blood Moon']);
  assert.deepEqual(opponentPermanents(opp), perms);
});

test('modelFromSetup inverts buildSetup', () => {
  const m = defaultModel(DECK_TEXT);
  m.hand = ["Thassa's Oracle", 'Street Wraith'];
  m.battlefield = [{ name: 'Island', tapped: true }];
  m.manaPool.U = 2;
  m.opponent['Gaddock Teeg'] = true;
  m.turnsAhead = 0;
  const { setup } = buildSetup(m);
  const { model, warnings } = modelFromSetup(setup, ['Island', 'Island']);
  assert.deepEqual(warnings, []);
  assert.deepEqual(buildSetup(model).setup, setup);
  assert.deepEqual(model.pile, ['Island', 'Island']);
});

test('pileSize: 5, or the whole pool if smaller', () => {
  assert.equal(pileSize({ A: 10 }), 5);
  assert.equal(pileSize({ A: 1, B: 1 }), 2);
  assert.equal(pileSize({}), 0);
});

test('pileOptions: limited by picks in earlier selects only', () => {
  const pool = { Island: 2, 'Street Wraith': 1, Brainstorm: 3 };
  const pile = ['Island', 'Street Wraith', 'Island', '', ''];
  assert.deepEqual(pileOptions(pool, pile, 0), [
    { name: 'Brainstorm', remaining: 3 }, { name: 'Island', remaining: 2 }, { name: 'Street Wraith', remaining: 1 },
  ]);
  assert.deepEqual(pileOptions(pool, pile, 2), [
    { name: 'Brainstorm', remaining: 3 }, { name: 'Island', remaining: 1 },
  ]);
  assert.deepEqual(pileOptions(pool, pile, 3), [{ name: 'Brainstorm', remaining: 3 }]);
});

test('normalizePile: earlier picks win, overflowing later picks are cleared, length fixed', () => {
  const pool = { Island: 1, Swamp: 2 };
  assert.deepEqual(normalizePile(pool, ['Island', 'Island', 'Swamp']), ['Island', '', 'Swamp']);
  assert.deepEqual(normalizePile(pool, ['Swamp', 'Swamp', 'Swamp', 'Bogus', 'Island', 'X']), ['Swamp', 'Swamp', '']);
  assert.deepEqual(normalizePile({ A: 9 }, []), ['', '', '', '', '']);
});

test('poolSummary counts copies left after picks', () => {
  assert.deepEqual(poolSummary({ B: 2, A: 1, Z: 0 }, ['B', '', 'A']), [
    { name: 'A', total: 1, left: 0 }, { name: 'B', total: 2, left: 1 },
  ]);
});

test('fallbackPilePool follows §3: library-before-DD + graveyard', () => {
  const pool = fallbackPilePool({
    deck: { Doomsday: 2, Island: 4, Brainstorm: 2, Ponder: 1 },
    hand: ['Island'],
    battlefield: [{ name: 'Island', tapped: false }],
    graveyard: ['Brainstorm'],
    exile: ['Ponder'],
  });
  assert.deepEqual(pool, { Doomsday: 1, Island: 2, Brainstorm: 2 });
});

test('planHasBranch finds a branch anywhere along the step chain', () => {
  const win = { kind: 'win' };
  assert.equal(planHasBranch(win), false);
  assert.equal(planHasBranch({ kind: 'step', action: {}, then: { kind: 'step', action: {}, then: win } }), false);
  assert.equal(planHasBranch({ kind: 'step', action: {}, then: { kind: 'branch', action: {}, outcomes: [{ label: 'x', plan: win }] } }), true);
  assert.equal(planHasBranch(null), false);
});

test('escapeHtml escapes markup characters', () => {
  assert.equal(escapeHtml(`<b a="1">'&'</b>`), '&lt;b a=&quot;1&quot;&gt;&#39;&amp;&#39;&lt;/b&gt;');
});

test('renderResultHTML: WIN with lines, headers marked, no warning without branch', () => {
  const html = renderResultHTML({ result: 'win', plan: { kind: 'win' }, nodes: 12 },
    ['Turn 0 (Doomsday turn)', '  Cast <Oracle>']);
  assert.match(html, /class="banner win"[^>]*>WIN</);
  assert.match(html, /<li class="hdr">Turn 0 \(Doomsday turn\)<\/li>/);
  assert.match(html, /Cast &lt;Oracle&gt;/);
  assert.doesNotMatch(html, /⚠/);
});

test('renderResultHTML: ⚠ when the plan has a branch', () => {
  const plan = { kind: 'branch', action: {}, outcomes: [{ label: 'a', plan: { kind: 'win' } }] };
  assert.match(renderResultHTML({ result: 'win', plan, nodes: 1 }, ['x']), /⚠/);
});

test('renderResultHTML: NO WIN and TOO BIG banners', () => {
  assert.match(renderResultHTML({ result: 'no_win', nodes: 5 }), />NO WIN</);
  assert.match(renderResultHTML({ result: 'aborted', nodes: 200001 }), />TOO BIG</);
  assert.match(renderResultHTML({ result: 'aborted', nodes: 200001 }), /200,001/);
});

test('scenario JSON round-trip and validation', () => {
  const setup = { deck: { Doomsday: 1, Island: 2 }, hand: [] };
  const back = parseScenario(scenarioToJSON(setup, ['Island', 'Island']));
  assert.deepEqual(back, { setup, pile: ['Island', 'Island'] });
  assert.deepEqual(parseScenario('{"setup":{"deck":{}}}').pile, []);
  assert.throws(() => parseScenario('{nope'), /not valid JSON/);
  assert.throws(() => parseScenario('[]'), /object/);
  assert.throws(() => parseScenario('{"pile":[]}'), /setup/);
  assert.throws(() => parseScenario('{"setup":{}}'), /deck/);
  assert.throws(() => parseScenario('{"setup":{"deck":{}},"pile":[1]}'), /pile/);
  assert.throws(() => parseScenario('{"setup":{"deck":{},"hand":"Island"}}'), /hand/);
});
