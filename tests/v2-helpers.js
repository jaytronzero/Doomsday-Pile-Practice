// Shared fixtures and helpers for the v2 tests (SPEC_V2.md + SPEC_V2_API.md).
// Builds on tests/helpers.js (v1). Only node built-ins are used.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { buildStartState, legalActions, applyAction, status } from '../src/engine.js';
import { solve } from '../src/solver.js';
import {
  ORACLE, WRAITH, SEA, DELTA, PETAL, CAVERN, PILE_A,
  makeSetup, setupA, bf, deckWith, findAction, replayPlan,
} from './helpers.js';

export * from './helpers.js';

// ---------------------------------------------------------------------------
// Names
// ---------------------------------------------------------------------------
export const ISLAND = 'Island';
export const SWAMP = 'Swamp';
export const FOW = 'Force of Will';
export const FON = 'Force of Negation';
export const DAZE = 'Daze';
export const STIFLE = 'Stifle';
export const CONSIGN = 'Consign to Memory';
export const KCOMMAND = "Kozilek's Command";
export const PYRO = 'Pyroblast';
export const REB = 'Red Elemental Blast';
export const PIERCE = 'Spell Pierce';
export const FLUSTER = 'Flusterstorm';
export const SNARE = 'Spell Snare';
export const PACT = 'Pact of Negation';
export const TRAP = 'Mindbreak Trap';
export const MISSTEP = 'Mental Misstep';
export const SINK = 'Sink into Stupor';
export const STP = 'Swords to Plowshares';
export const PUSH = 'Fatal Push';
export const SNUFF = 'Snuff Out';
export const DISMEMBER = 'Dismember';
export const SOLITUDE = 'Solitude';
export const BOLT = 'Lightning Bolt';
export const SURGICAL = 'Surgical Extraction';
export const TSEIZE = 'Thoughtseize';
export const DURESS = 'Duress';
export const INQ = 'Inquisition of Kozilek';
export const UNMASK = 'Unmask';
export const THERAPY = 'Cabal Therapy';
export const BRUTALITY = 'Collective Brutality';
export const BOWMASTERS = 'Orcish Bowmasters';
export const ENDURANCE = 'Endurance';

export const THORN = 'Thorn of Amethyst';
export const SPHERE = 'Sphere of Resistance';
export const TRINI = 'Trinisphere';
export const DAMPING = 'Damping Sphere';
export const ARCHON = 'Archon of Emeria';
export const NEEDLE = 'Pithing Needle';
export const OUPHE = 'Collector Ouphe';
export const KARN = 'Karn, the Great Creator';
export const CAGE = "Grafdigger's Cage";
export const TORPOR = 'Torpor Orb';
export const TEFERI = 'Teferi, Time Raveler';
export const NARSET = 'Narset, Parter of Veils';
export const HULL = 'Hullbreacher';
export const BLOOD_MOON = 'Blood Moon';
export const MAGUS = 'Magus of the Moon';
export const B2B = 'Back to Basics';
export const CRYPT = "Tormod's Crypt";
export const WASTELAND = 'Wasteland';
export const GQ = 'Ghost Quarter';
export const VOICE = 'Voice of Victory';
export const VOIDWALKER = 'Dauthi Voidwalker';
export const GUIDE = 'Goblin Guide';

// ---------------------------------------------------------------------------
// Setup builders
// ---------------------------------------------------------------------------

/**
 * Opponent object (SPEC_V2_API §2). `o` keys: permanents, hand, handSize, untapped, total, colors, life,
 * plus any raw opponent field (graveyard, exile, deckEstimate, ...).
 */
export function oppObj(o = {}) {
  const { untapped = 0, total = untapped, colors = '', permanents = [], hand = [], ...rest } = o;
  return { permanents, hand, lands: { untapped, total, colors }, ...rest };
}

/** setup with its opponent replaced by oppObj(o). */
export function withOpp(setup, o) {
  return { ...setup, opponent: oppObj(o) };
}

/** Opponent permanent shorthand. */
export const perm = (name, extra = {}) => ({ name, ...extra });

// ---------------------------------------------------------------------------
// Hand-designed puzzle setups (proofs live next to the tests that use them).
// All use the v1 canonical deck (tests/helpers.js CANON_DECK) unless stated.
// ---------------------------------------------------------------------------

/** A' = canonical puzzle A with the land drop already used (so drawn Islands give no mana). */
export const setupA2 = (over = {}) => setupA({ landPlayedThisTurn: true, ...over });
export const PILE_A2 = Object.freeze([...PILE_A]);

/** P3' = v1 custom puzzle 3 (Brainstorm) with the land drop used. */
export const setupP3 = (U = 3, over = {}) => makeSetup({
  hand: [ORACLE, 'Brainstorm'], manaPool: { U }, lifeBeforeDoomsday: 10, turnsAhead: 0, landPlayedThisTurn: true, ...over,
});
export const PILE_P3 = Object.freeze([WRAITH, WRAITH, ISLAND, ISLAND, ISLAND]);

/** H = v1 canonical puzzle H (turnsAhead 1). */
export const setupH = (over = {}) => makeSetup({
  hand: [WRAITH], battlefield: [bf(SEA, true), bf(SEA, true)], manaPool: {}, lifeBeforeDoomsday: 20, turnsAhead: 1, ...over,
});
export const PILE_H = Object.freeze([WRAITH, WRAITH, ORACLE, ISLAND, ISLAND]);

/** IH = H with two tapped basic Islands instead of Seas and Seas in the pile. */
export const setupIH = (over = {}) => setupH({ battlefield: [bf(ISLAND, true), bf(ISLAND, true)], ...over });
export const PILE_IH = Object.freeze([WRAITH, WRAITH, ORACLE, SEA, SEA]);

/** T = "Consider on the opponent's turn" (Silence blocks turn 0). */
export const setupT = (over = {}) => makeSetup({
  hand: ['Consider'], battlefield: [bf(ISLAND), bf(SEA, true)], manaPool: {}, lifeBeforeDoomsday: 20, turnsAhead: 1, ...over,
});
export const PILE_T = Object.freeze([WRAITH, ORACLE, WRAITH, WRAITH, WRAITH]);

/** GG = "Goblin Guide hands me the Island". */
export const setupGG = (over = {}) => makeSetup({
  hand: [WRAITH], battlefield: [bf(SEA, true), bf(SEA, true)], manaPool: {}, lifeBeforeDoomsday: 20, turnsAhead: 1, ...over,
});
export const PILE_GG = Object.freeze([ISLAND, ORACLE, WRAITH, ISLAND, ISLAND]);

/** D = "Oracle waits in hand through the opponent's turn" (discard puzzles). */
export const setupD = (over = {}) => makeSetup({
  hand: [ORACLE, WRAITH], battlefield: [bf(SEA, true), bf(SEA, true)], manaPool: {}, lifeBeforeDoomsday: 20, turnsAhead: 1, ...over,
});
export const PILE_D = Object.freeze([WRAITH, WRAITH, ISLAND, ISLAND, ISLAND]);

/** PA = A' paid with a Lotus Petal: hand [Oracle, Wraith], Petal in play, {U:1} floating. */
export const setupPA = (over = {}) => setupA2({ hand: [ORACLE, WRAITH], battlefield: [bf(PETAL)], manaPool: { U: 1 }, ...over });

/** CV = A' with Cavern of Souls (Merfolk) + Island in play and an empty pool. */
export const setupCV = (over = {}) => setupA2({
  deck: deckWith({ [CAVERN]: 1 }), hand: [ORACLE, WRAITH], battlefield: [bf(CAVERN), bf(ISLAND)], manaPool: {}, cavernType: 'Merfolk', ...over,
});

/** P1 = v1 custom puzzle 1 (Chalice 2, Unearth the countered Oracle). */
export const setupP1 = (extraPerms = [], over = {}) => makeSetup({
  hand: [ORACLE, 'Unearth', WRAITH], manaPool: { U: 2, B: 1 }, lifeBeforeDoomsday: 20, turnsAhead: 0,
  opponent: { permanents: [{ name: 'Chalice of the Void', x: 2 }, ...extraPerms] }, ...over,
});
export const PILE_P1 = Object.freeze([WRAITH, WRAITH, ISLAND, ISLAND, ISLAND]);

/** P4 = v1 custom puzzle 4a (Ritual, then Flow State takes two). */
export const setupP4 = (over = {}) => makeSetup({
  hand: ['Dark Ritual', 'Flow State', WRAITH], battlefield: [bf(ISLAND), bf(ISLAND), bf(SEA)], manaPool: { B: 1 },
  lifeBeforeDoomsday: 6, turnsAhead: 0, ...over,
});
export const PILE_P4 = Object.freeze([ISLAND, SWAMP, ORACLE, WRAITH, WRAITH]);

/** BR = v1 branch puzzle (Polluted Delta must be cracked for the second U). */
export const setupBR = (over = {}) => makeSetup({
  hand: [ORACLE, WRAITH, WRAITH], battlefield: [bf(ISLAND), bf(DELTA)], manaPool: {}, lifeBeforeDoomsday: 20,
  landPlayedThisTurn: true, turnsAhead: 0, ...over,
});
export const PILE_BR = Object.freeze([SWAMP, SWAMP, SEA, ISLAND, SWAMP]);

/** Tiny deck where the library is EMPTY after Doomsday (pile = []). */
export const setupEmptyLib = (over = {}) => makeSetup({
  deck: { Doomsday: 1, [ORACLE]: 1 }, hand: [ORACLE], manaPool: { U: 2 }, lifeBeforeDoomsday: 20, turnsAhead: 0, ...over,
});

// ---------------------------------------------------------------------------
// Outcomes and adversary entries (SPEC_V2_API §7)
// ---------------------------------------------------------------------------

export const advOf = (o) => o.adversary || [];

/** Outcomes where the adversary did nothing. */
export const quiet = (outcomes) => outcomes.filter((o) => advOf(o).length === 0);

/** Outcomes containing an adversary entry for `card` (optionally with mode / target). */
export function using(outcomes, card, mode, target) {
  return outcomes.filter((o) => advOf(o).some((e) =>
    e.card === card && (mode === undefined || e.mode === mode) && (target === undefined || e.target === target)));
}

/** Outcomes where `card` was NOT used. */
export const notUsing = (outcomes, card) => outcomes.filter((o) => !advOf(o).some((e) => e.card === card));

/** applyAction on the unique legal action matching pred → all outcomes. */
export function outcomesOf(state, pred, what) {
  const a = findAction(state, pred, what);
  const out = applyAction(state, a);
  assert.ok(Array.isArray(out) && out.length >= 1, 'applyAction must return ≥ 1 outcome');
  return out;
}

/** The single quiet (no-adversary) outcome's state. */
export function quietState(outcomes) {
  const q = quiet(outcomes);
  assert.equal(q.length, 1, `expected exactly one "do nothing" outcome, got ${q.length}: ${outcomes.map((o) => o.label).join(' | ')}`);
  return q[0].state;
}

/** Asserts labels are non-empty and pairwise distinct. */
export function assertDistinctLabels(outcomes) {
  for (const o of outcomes) assert.ok(typeof o.label === 'string' && o.label.length > 0, 'label must be a non-empty string');
  assert.equal(new Set(outcomes.map((o) => o.label)).size, outcomes.length, `labels must be distinct: ${outcomes.map((o) => o.label).join(' | ')}`);
}

export const isResolveOpp = (a) => a.type === 'resolve_opp_spell';
export const isChooseOpt = (pred) => (a) => a.type === 'choose' && pred(a.option);

/** Drive a deterministic (single-outcome, quiet) action. */
export function step(state, pred, what) {
  const out = outcomesOf(state, pred, what);
  return quietState(out);
}

// ---------------------------------------------------------------------------
// Solver helpers
// ---------------------------------------------------------------------------

export function expectWin(state, opts) {
  const r = solve(state, opts);
  assert.equal(r.result, 'win', `expected win, got ${r.result}`);
  assert.ok(replayPlan(state, r.plan) >= 1);
  return r;
}

export function expectNoWin(state, opts) {
  const r = solve(state, opts);
  assert.equal(r.result, 'no_win', `expected no_win, got ${r.result}`);
  return r;
}

export const build = (setup, pile) => buildStartState(setup, [...pile]);

export { buildStartState, legalActions, applyAction, status, solve };

// ---------------------------------------------------------------------------
// Misc
// ---------------------------------------------------------------------------

export const sha256 = (s) => createHash('sha256').update(s, 'utf8').digest('hex');

/** |a − b| < eps */
export function near(a, b, msg, eps = 1e-12) {
  assert.ok(typeof a === 'number' && Math.abs(a - b) < eps, `${msg ?? ''} expected ≈ ${b}, got ${a}`);
}
