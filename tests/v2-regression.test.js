// v1 regression (SPEC_V2_API §7 "v1 compatibility"): a v1 setup with no opponent hand and no v2 permanent
// must give EXACTLY v1's solve result for every v1 canonical puzzle (SPEC.md §11): the same result, the same
// worst-case length and the same plan actions (compared with helpers.actionKey, which ignores `desc`).
//
// The expected values below were recorded on 2026-11-19 by running the v1 engine/solver (commit 2f522ee,
// 252 passing tests) on these exact setups. They are data, not hand-derived; each one also agrees with the
// §11 statement of the puzzle.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { buildStartState } from '../src/engine.js';
import { solve } from '../src/solver.js';
import {
  ORACLE, WRAITH, SEA, FLUTE, CHALICE, SILENCE, PILE_A,
  makeSetup, setupA, bf, planDepth, planActions, actionKey, replayPlan,
} from './helpers.js';

const withOpp = (...permanents) => setupA({ opponent: { permanents } });
const setupH = (t) => makeSetup({ hand: [WRAITH], battlefield: [bf(SEA, true), bf(SEA, true)], manaPool: {}, lifeBeforeDoomsday: 20, turnsAhead: t });
const I = 'Island';

const PUZZLES = {
  A: [setupA(), [...PILE_A]],
  B14: [setupA({ lifeBeforeDoomsday: 14 }), [...PILE_A]],
  B13: [setupA({ lifeBeforeDoomsday: 13 }), [...PILE_A]],
  B12: [setupA({ lifeBeforeDoomsday: 12 }), [...PILE_A]],
  C: [withOpp({ name: SILENCE }), [...PILE_A]],
  D: [withOpp({ name: FLUTE, named: WRAITH }), [...PILE_A]],
  E: [withOpp({ name: FLUTE, named: ORACLE }), [...PILE_A]],
  F: [withOpp({ name: CHALICE, x: 2 }), [...PILE_A]],
  G: [makeSetup({ hand: [ORACLE, WRAITH], manaPool: { U: 2 }, lifeBeforeDoomsday: 20 }), [...PILE_A]],
  H0: [setupH(0), [WRAITH, WRAITH, ORACLE, I, I]],
  H1: [setupH(1), [WRAITH, WRAITH, ORACLE, I, I]],
  H2: [makeSetup({ hand: [], battlefield: [bf(SEA, true), bf(SEA, true)], manaPool: {}, lifeBeforeDoomsday: 20, turnsAhead: 1 }), [ORACLE, I, I, I, I]],
  I: [makeSetup({ deck: { Doomsday: 1, Brainstorm: 1, Island: 2 }, hand: ['Brainstorm'], manaPool: { U: 1 }, lifeBeforeDoomsday: 20 }), [I, I]],
};

const ORACLE_FIRST = [
  '{"card":"Thassa\'s Oracle","payment":{"U":2},"type":"cast"}',
  '{"card":"Street Wraith","type":"cycle"}',
  '{"card":"Street Wraith","type":"cycle"}',
  '{"card":"Street Wraith","type":"cycle"}',
  '{"type":"resolve_oracle"}',
];
const V1 = {
  A: { result: 'win', depth: 5, actions: ORACLE_FIRST },
  B14: { result: 'win', depth: 5, actions: ORACLE_FIRST },
  B13: { result: 'no_win' },
  B12: { result: 'no_win' },
  C: { result: 'win', depth: 5, actions: ORACLE_FIRST },
  D: { result: 'no_win' },
  E: { result: 'no_win' },
  F: { result: 'no_win' },
  G: { result: 'win', depth: 5, actions: ORACLE_FIRST },
  H0: { result: 'no_win' },
  H1: {
    result: 'win',
    depth: 8,
    actions: [
      '{"card":"Street Wraith","type":"cycle"}',
      '{"card":"Street Wraith","type":"cycle"}',
      '{"type":"pass"}',
      '{"type":"pass"}',
      '{"card":"Underground Sea","color":"U","type":"tap"}',
      '{"card":"Underground Sea","color":"U","type":"tap"}',
      '{"card":"Thassa\'s Oracle","payment":{"U":2},"type":"cast"}',
      '{"type":"resolve_oracle"}',
    ],
  },
  H2: { result: 'no_win' },
  I: { result: 'no_win' },
};

describe('v1 canonical puzzles are unchanged under v2', () => {
  for (const [name, [setup, pile]] of Object.entries(PUZZLES)) {
    test(`${name}: ${V1[name].result}${V1[name].depth ? ` in ${V1[name].depth}` : ''}, same plan as v1`, () => {
      const s = buildStartState(setup, pile);
      assert.deepEqual(s.opp.hand, [], 'no hidden hand');
      const r = solve(s);
      assert.equal(r.result, V1[name].result);
      if (V1[name].result === 'win') {
        assert.equal(planDepth(r.plan), V1[name].depth);
        assert.deepEqual(planActions(r.plan).map(actionKey), V1[name].actions);
        assert.ok(replayPlan(s, r.plan) >= 1);
      } else {
        assert.ok(r.plan === null || r.plan === undefined);
      }
    });
  }
});
