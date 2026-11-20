// SPEC_V2 §6 budget: "the whole grade must finish in < 10 s in Node for typical boards".
// A realistic Turbo DD board against UR Delver with a 4-card hidden hand and 6 relevant cards
// (Force of Will, Daze, Spell Pierce, Lightning Bolt, Pyroblast, Stifle).
// Goldfish (v1-checked without the clock: win in 8; with Delver's 3-power attack still a win: cycle twice on
// turn 0 → life 6, attack → 3, turn 1: draw, Island + Sea → UU, Oracle, resolve with lib 2).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { grade } from '../src/grade.js';
import { ORACLE, WRAITH, SEA, makeSetup, bf, withOpp } from './v2-helpers.js';

const setup = withOpp(makeSetup({
  hand: [ORACLE, 'Brainstorm', WRAITH, 'Dark Ritual'],
  battlefield: [bf(SEA, true), bf('Island', true), bf(SEA)],
  manaPool: {},
  lifeBeforeDoomsday: 20,
  landPlayedThisTurn: true,
  turnsAhead: 1,
}), {
  permanents: [{ name: 'Delver of Secrets', power: 3 }],
  graveyard: ['Ponder', 'Brainstorm'],
  exile: [],
  handSize: 4,
  untapped: 1,
  total: 3,
  colors: 'UR',
  life: 18,
  deckEstimate: {
    'Force of Will': 4, Daze: 4, 'Spell Pierce': 2, 'Lightning Bolt': 4, Pyroblast: 1, Stifle: 1,
    'Delver of Secrets': 4, "Dragon's Rage Channeler": 4, 'Murktide Regent': 2, Brainstorm: 4, Ponder: 4,
    Wasteland: 4, 'Volcanic Island': 4, Island: 2, 'Scalding Tarn': 4, 'Polluted Delta': 4,
    'Expressive Iteration': 4, "Mishra's Bauble": 4,
  }, // 60
  deckEstimateSource: 'perf fixture',
});
const PILE = [WRAITH, WRAITH, 'Island', 'Island', 'Swamp'];

test('grade() on a realistic board with a 4-card hand estimate finishes in < 10 s', { timeout: 20000 }, () => {
  const t0 = performance.now();
  const g = grade(setup, PILE);
  const ms = performance.now() - t0;
  assert.ok(ms < 10000, `grade took ${Math.round(ms)} ms`);
  assert.equal(g.goldfish.result, 'win');
  assert.equal(g.h, 4);
  assert.equal(g.singles.length, 6);
  assert.ok(g.pWinRange[0] >= 0 && g.pWinRange[1] <= 1 && g.pWinRange[0] <= g.pWinRange[1]);
});
