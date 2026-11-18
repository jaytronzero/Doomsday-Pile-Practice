// Hostile-review regressions (REVIEW.md). Each test failed before its fix.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildStartState } from '../src/engine.js';
import { solve } from '../src/solver.js';
import { buildSetup, modelFromSetup, defaultModel } from '../src/uiLogic.js';
import { parseDeck, deckToText } from '../src/deckText.js';
import { CANON_DECK, ORACLE, WRAITH, PILE_A } from './helpers.js';

// Puzzle A (§11) as a UI form model, turnsAhead 0.
function puzzleAModel() {
  const m = defaultModel(deckToText({ main: CANON_DECK }));
  m.hand = [ORACLE, WRAITH];
  m.manaPool.U = 2;
  m.turnsAhead = 0;
  return m;
}

// R1 (major, UI). §6: Flute's named card can't be cycled; puzzle D (§11) is
// no_win. The engine compares names exactly, so a Flute name typed in another
// case ("street wraith") was passed through and silently did nothing: the UI
// reported WIN for puzzle D.
test('R1: Disruptor Flute name typed in another case still hits the card (puzzle D via the UI)', () => {
  const m = puzzleAModel();
  m.opponent['Disruptor Flute'] = true;
  m.opponent.fluteNamed = '  street   WRAITH ';
  const { setup, errors } = buildSetup(m);
  assert.deepEqual(errors, []);
  assert.equal(setup.opponent.permanents[0].named, WRAITH);
  assert.equal(solve(buildStartState(setup, [...PILE_A])).result, 'no_win');
});

test('R1b: a Flute name that matches no deck card is kept as typed', () => {
  const m = puzzleAModel();
  m.opponent['Disruptor Flute'] = true;
  m.opponent.fluteNamed = 'Tendrils of Agony';
  assert.equal(buildSetup(m).setup.opponent.permanents[0].named, 'Tendrils of Agony');
});

// R2 (major, UI). §10: "the UI must stay responsive". solve() ran on the main
// thread; a realistic 6-card hand at turnsAhead 1 ran 6-9 s to the node limit
// with the page frozen. The check now runs in a module worker (src/solveWorker.js).
test('R2: solveWorker.solveScenario gives the same answer as solve() and ui.js uses a module worker', async () => {
  const { solveScenario } = await import('../src/solveWorker.js');
  const setup = { deck: { ...CANON_DECK }, hand: [ORACLE, WRAITH], manaPool: { U: 2 }, turnsAhead: 0 };
  const { res, lines } = solveScenario({ setup, pile: [...PILE_A], maxNodes: 200000 });
  const direct = solve(buildStartState(setup, [...PILE_A]));
  assert.equal(res.result, 'win');
  assert.deepEqual(res.plan, direct.plan);
  assert.ok(lines.at(-1).includes('WIN'));
  assert.throws(() => solveScenario({ setup, pile: ['Island'], maxNodes: 10 }), /pile/);
  const ui = readFileSync(new URL('../src/ui.js', import.meta.url), 'utf8');
  assert.match(ui, /new Worker\(new URL\('\.\/solveWorker\.js', import\.meta\.url\), \{ type: 'module' \}\)/);
});

// R3 (minor). §3 validation must give "a helpful message". A hand card named
// like an Object.prototype member read the prototype: "...use NaN copies but the
// deck has function Object() { [native code] }".
test('R3: zone-count error for a name like "constructor" has real numbers', () => {
  assert.throws(
    () => buildStartState({ deck: { Doomsday: 1, Island: 5 }, hand: ['constructor'] }, ['Island', 'Island', 'Island', 'Island', 'Island']),
    (e) => /constructor: .* use 1 copies but the deck has 0/.test(e.message) && !/function|NaN/.test(e.message),
  );
});

// R4 (minor). §3: lifeBeforeDoomsday must be an integer ≥ 1. NaN was reported as
// "(got null)" because JSON.stringify(NaN) is "null".
test('R4: NaN/Infinity are shown as such in validation messages', () => {
  const pile = ['Island', 'Island', 'Island', 'Island', 'Island'];
  assert.throws(() => buildStartState({ deck: { Doomsday: 1, Island: 5 }, lifeBeforeDoomsday: NaN }, pile), /got NaN/);
  assert.throws(() => buildStartState({ deck: { Doomsday: 1, Island: 5 }, turnsAhead: Infinity }, pile), /got Infinity/);
});

// R5 (minor). Deck text is user input (§10.1). "4 __proto__" vanished silently and
// "4 constructor" became the string "function Object() {...}4".
test('R5: deck lines named like Object.prototype members are plain counts', () => {
  const { main, errors } = parseDeck('4 constructor\n2 __proto__\n1 toString\n1 constructor');
  assert.deepEqual(errors, []);
  assert.equal(Object.getPrototypeOf(main), Object.prototype);
  assert.equal(main.constructor, 5);
  assert.equal(Object.getOwnPropertyDescriptor(main, '__proto__').value, 2);
  assert.equal(main.toString, 1);
  assert.deepEqual(Object.keys(main), ['constructor', '__proto__', 'toString']);
});

// R6 (minor, UI). §10.7 scenario import. A deck count given as a string ("4")
// was dropped without a word, so the page checked a different deck than the
// one pasted (the engine itself rejects such a count).
test('R6: scenario import warns about deck entries it drops', () => {
  const { model, warnings } = modelFromSetup({ deck: { Doomsday: 1, Island: 5, Brainstorm: '4' } });
  assert.ok(!/Brainstorm/.test(model.deckText));
  assert.ok(warnings.some((w) => /Brainstorm/.test(w)), warnings.join(' | '));
});

// R7 (minor, UI). §3: a pile has at most 5 cards. Importing an invalid setup with a
// 40-entry pile rendered 40 pile selects (the pile is only normalised once the
// setup is valid).
test('R7: scenario import keeps at most 5 pile entries', () => {
  const { model } = modelFromSetup({ deck: { Doomsday: 1, Island: 50 } }, Array(40).fill('Island'));
  assert.equal(model.pile.length, 5);
});

// Lead fix: Cavern of Souls' colored mana makes the creature spell uncounterable,
// so Chalice of the Void (x=2) can't counter a Cavern-paid Thassa's Oracle.
import { buildStartState as _bss, legalActions as _la, applyAction as _aa, status as _st } from '../src/engine.js';
import { solve as _solve } from '../src/solver.js';
import { CANON_DECK as _DECK } from './helpers.js';
test('Cavern-paid Oracle resolves through Chalice x=2 (uncounterable)', () => {
  const deck = { ..._DECK, 'Cavern of Souls': 1 };
  deck['Island'] -= 1; // keep 60
  const setup = {
    deck, hand: ["Thassa's Oracle", 'Street Wraith'],
    battlefield: [{ name: 'Cavern of Souls', tapped: false }],
    manaPool: { U: 1 }, lifeBeforeDoomsday: 20, cavernType: 'Merfolk',
    opponent: { permanents: [{ name: 'Chalice of the Void', x: 2 }] }, turnsAhead: 0,
  };
  const pile = ['Street Wraith', 'Street Wraith', 'Island', 'Island', 'Island'];
  assert.equal(_solve(_bss(setup, pile)).result, 'win');
  // Without Cavern (plain U from pool + Island tapped) it is still countered.
  const noCavern = { ...setup, battlefield: [{ name: 'Underground Sea', tapped: false }] };
  assert.equal(_solve(_bss(noCavern, pile)).result, 'no_win');
});
