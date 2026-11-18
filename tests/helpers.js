// Shared fixtures and helpers for the Doomsday pile trainer tests.
// Only node:assert/strict is used; everything else comes from the spec'd API.
import assert from 'node:assert/strict';
import {
  buildStartState,
  legalActions,
  applyAction,
  status,
} from '../src/engine.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Spec §11 canonical 60-card deck (used for A–F and, by assumption, G/H/H2). */
export const CANON_DECK = Object.freeze({
  'Doomsday': 4,
  "Thassa's Oracle": 2,
  'Street Wraith': 4,
  'Island': 4,
  'Swamp': 4,
  'Underground Sea': 4,
  'Brainstorm': 4,
  'Dark Ritual': 4,
  'Ponder': 4,
  'Lotus Petal': 4,
  "Lion's Eye Diamond": 1,
  'Consider': 4,
  'Unearth': 2,
  'Personal Tutor': 3,
  'Flow State': 4,
  'Edge of Autumn': 2,
  'Polluted Delta': 4,
  'Undercity Sewers': 2,
});

export const ORACLE = "Thassa's Oracle";
export const WRAITH = 'Street Wraith';
export const SEA = 'Underground Sea';
export const SEWERS = 'Undercity Sewers';
export const DELTA = 'Polluted Delta';
export const LED = "Lion's Eye Diamond";
export const PETAL = 'Lotus Petal';
export const CAVERN = 'Cavern of Souls';

export const THALIA = 'Thalia, Guardian of Thraben';
export const TEEG = 'Gaddock Teeg';
export const CHALICE = 'Chalice of the Void';
export const FLUTE = 'Disruptor Flute';
export const SILENCE = 'Deafening Silence';

/** Pile used by canonical puzzles A–G. */
export const PILE_A = Object.freeze([WRAITH, WRAITH, 'Island', 'Island', 'Island']);

/** Canonical deck plus extra cards (e.g. other fetches, dead cards). */
export function deckWith(extra = {}) {
  return { ...CANON_DECK, ...extra };
}

/** Battlefield entry. */
export function bf(name, tapped = false) {
  return { name, tapped };
}

/** Full setup object with spec defaults, canonical deck, overridable. */
export function makeSetup(overrides = {}) {
  return {
    deck: { ...CANON_DECK },
    hand: [],
    battlefield: [],
    graveyard: [],
    exile: [],
    manaPool: {},
    lifeBeforeDoomsday: 20,
    landPlayedThisTurn: false,
    noncreatureSpellsCastThisTurn: 1,
    cavernType: 'Merfolk',
    opponent: { permanents: [] },
    turnsAhead: 1,
    ...overrides,
  };
}

/** buildStartState(makeSetup(overrides), pile). */
export function start(overrides, pile) {
  return buildStartState(makeSetup(overrides), pile);
}

/** Setup for canonical puzzle A (optionally overridden). */
export function setupA(overrides = {}) {
  return makeSetup({
    hand: [ORACLE, WRAITH],
    manaPool: { U: 2 },
    lifeBeforeDoomsday: 20,
    turnsAhead: 0,
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// Small utilities
// ---------------------------------------------------------------------------

/** Multiset of names → {name: count}. */
export function counts(names) {
  const m = {};
  for (const n of names) m[n] = (m[n] || 0) + 1;
  return m;
}

/** Drop zero / missing entries and sort keys so count maps compare by value. */
export function normCounts(obj) {
  return Object.fromEntries(
    Object.entries(obj || {})
      .filter(([, v]) => v !== 0 && v !== undefined && v !== null)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
  );
}

export function sameMultiset(a, b, msg) {
  assert.deepEqual(normCounts(counts(a)), normCounts(counts(b)), msg);
}

/** Multiset difference a − b (counts never below 0 are asserted). */
export function subtractCounts(a, b) {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) {
    out[k] = (out[k] || 0) - v;
    assert.ok(out[k] >= 0, `subtractCounts went negative for ${k}`);
  }
  return normCounts(out);
}

export function addCounts(a, b) {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) out[k] = (out[k] || 0) + v;
  return normCounts(out);
}

/** Number of distinct orderings of a multiset of names. */
export function distinctPerms(names) {
  const fact = (n) => (n <= 1 ? 1 : n * fact(n - 1));
  let r = fact(names.length);
  for (const c of Object.values(counts(names))) r /= fact(c);
  return r;
}

/** Normalised {W,U,B,R,G,C} pool (missing keys = 0). */
export function pool(p) {
  const q = p || {};
  return { W: q.W || 0, U: q.U || 0, B: q.B || 0, R: q.R || 0, G: q.G || 0, C: q.C || 0 };
}

/** Normalised {W,U,B,R,G} restricted (Cavern) pool. */
export function restricted(p) {
  const q = p || {};
  return { W: q.W || 0, U: q.U || 0, B: q.B || 0, R: q.R || 0, G: q.G || 0 };
}

export function poolTotal(state) {
  const p = pool(state.pool);
  const r = restricted(state.restricted);
  return Object.values(p).reduce((a, b) => a + b, 0) + Object.values(r).reduce((a, b) => a + b, 0);
}

/** Payment map with zero entries removed (so {U:2,B:0} equals {U:2}). */
export function normPay(p) {
  return normCounts(p || {});
}

export function samePay(a, b) {
  return JSON.stringify(normPay(a)) === JSON.stringify(normPay(b));
}

/** Stable JSON (sorted keys) for comparing plain data. */
export function stableStringify(v) {
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v)
      .sort()
      .filter((k) => v[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${stableStringify(v[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(v);
}

/** Identity of an action: type + params, ignoring desc, with payment normalised. */
export function actionKey(a) {
  const { desc, ...rest } = a;
  if (rest.payment) rest.payment = normPay(rest.payment);
  return stableStringify(rest);
}

/** Recursively Object.freeze a value. */
export function deepFreeze(o) {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const k of Object.keys(o)) deepFreeze(o[k]);
  }
  return o;
}

export function names(battlefield) {
  return battlefield.map((p) => p.name);
}

export function countOn(battlefield, name, tapped) {
  return battlefield.filter((p) => p.name === name && (tapped === undefined || !!p.tapped === tapped)).length;
}

export function oppNames(state) {
  return state.opponent.permanents.map((p) => p.name);
}

// ---------------------------------------------------------------------------
// Action predicates
// ---------------------------------------------------------------------------

export const isType = (t) => (a) => a.type === t;
export const isCast = (card) => (a) => a.type === 'cast' && a.card === card;
export const isCastPaid = (card, pay) => (a) => a.type === 'cast' && a.card === card && samePay(a.payment, pay);
export const isCycle = (card) => (a) => a.type === 'cycle' && a.card === card;
export const isTap = (card, color) => (a) => a.type === 'tap' && a.card === card && a.color === color;
export const isPlay = (card) => (a) => a.type === 'play_land' && a.card === card;
export const isCrack = (card, find) => (a) =>
  a.type === 'crack_fetch' && a.card === card && (find === undefined || (a.find ?? null) === find);
export const isSacPetal = (color) => (a) => a.type === 'sac_petal' && a.color === color;
export const isLed = (color) => (a) => a.type === 'activate_led' && a.color === color;
export const isPass = isType('pass');
export const isResolve = isType('resolve_oracle');
export const isChoose = isType('choose');

/** Does any legal action mention this card? */
export function mentionsCard(a, card) {
  return a.card === card || a.target === card;
}

// ---------------------------------------------------------------------------
// Driving the engine
// ---------------------------------------------------------------------------

export function findActions(state, pred) {
  return legalActions(state).filter(pred);
}

export function hasAction(state, pred) {
  return findActions(state, pred).length > 0;
}

/** Return the unique legal action matching pred (asserts exactly one). */
export function findAction(state, pred, what = 'action') {
  const all = legalActions(state);
  const m = all.filter(pred);
  assert.equal(
    m.length,
    1,
    `expected exactly one ${what}, got ${m.length}. Legal: ${all.map((a) => a.desc).join(' | ')}`,
  );
  return m[0];
}

/** Apply a deterministic action and return the single resulting state. */
export function apply1(state, action) {
  const r = applyAction(state, action);
  assert.ok(Array.isArray(r), 'applyAction must return an array');
  assert.equal(r.length, 1, `expected a single outcome from ${action.desc}, got ${r.length}`);
  return r[0].state;
}

/** findAction + apply1. */
export function act(state, pred, what) {
  return apply1(state, findAction(state, pred, what));
}

/**
 * All states reachable from applying `action`, resolving every pendingChoice
 * by EVERY option and following every random outcome. Mechanism-agnostic: works
 * whether an effect's decision is modelled as a pendingChoice or not.
 */
export function leaves(state, action) {
  const out = [];
  const walk = (results) => {
    for (const { state: s } of results) {
      if (s.pendingChoice && status(s) === 'ongoing') {
        const opts = legalActions(s);
        assert.ok(opts.length > 0, 'a pendingChoice must offer at least one option');
        for (const c of opts) walk(applyAction(s, c));
      } else {
        out.push(s);
      }
    }
  };
  walk(applyAction(state, action));
  return out;
}

/** leaves() over every legal action matching pred. */
export function leavesOf(state, pred) {
  const acts = findActions(state, pred);
  assert.ok(acts.length > 0, 'leavesOf: no matching legal action');
  return acts.flatMap((a) => leaves(state, a));
}

/**
 * Decision groups: for every legal action matching pred, follow pendingChoices
 * (each option = a separate decision) until an application returns either
 * several random outcomes or a single outcome without a pending choice.
 * Each group = { path: [actions], outcomes: [{state,label}] } i.e. one player
 * decision sequence and the AND-set of random outcomes it leads to.
 */
export function decisionGroups(state, pred) {
  const groups = [];
  const expand = (results, path) => {
    if (results.length === 1 && results[0].state.pendingChoice && status(results[0].state) === 'ongoing') {
      for (const c of legalActions(results[0].state)) expand(applyAction(results[0].state, c), [...path, c]);
    } else {
      groups.push({ path, outcomes: results });
    }
  };
  const acts = findActions(state, pred);
  assert.ok(acts.length > 0, 'decisionGroups: no matching legal action');
  for (const a of acts) expand(applyAction(state, a), [a]);
  return groups;
}

/** Asserts outcome labels are non-empty strings and pairwise distinct. */
export function assertLabels(outcomes) {
  for (const o of outcomes) {
    assert.equal(typeof o.label, 'string', 'outcome label must be a string');
    assert.ok(o.label.length > 0, 'outcome label must be non-empty');
  }
  assert.equal(new Set(outcomes.map((o) => o.label)).size, outcomes.length, 'outcome labels must be distinct');
}

/** Asserts the outcomes' libraries are pairwise distinct orderings. */
export function assertDistinctLibraries(outcomes) {
  const libs = outcomes.map((o) => JSON.stringify(o.state.library));
  assert.equal(new Set(libs).size, libs.length, 'shuffle outcomes must be distinct orderings');
}

/** Pass until (phase, turn) is reached (each pass must be a single outcome). */
export function passTo(state, phase, turn) {
  let s = state;
  for (let i = 0; i < 10 && !(s.phase === phase && s.turn === turn); i++) s = act(s, isPass, 'pass');
  assert.equal(s.phase, phase);
  assert.equal(s.turn, turn);
  return s;
}

// ---------------------------------------------------------------------------
// Solver plan helpers
// ---------------------------------------------------------------------------

/**
 * Walk a solver plan from `state`, applying every action. On branch nodes every
 * outcome is followed. Every leaf must have status 'win'. Returns the number of
 * winning leaves.
 */
export function replayPlan(state, plan, trail = 'root') {
  assert.ok(plan && typeof plan === 'object', `missing plan at ${trail}`);
  if (plan.kind === 'win') {
    assert.equal(status(state), 'win', `plan claims win at ${trail} but status is ${status(state)}`);
    return 1;
  }
  assert.equal(status(state), 'ongoing', `plan continues at ${trail} but status is ${status(state)}`);
  assert.ok(plan.action && typeof plan.action === 'object', `plan node without action at ${trail}`);
  const legalKeys = legalActions(state).map(actionKey);
  assert.ok(
    legalKeys.includes(actionKey(plan.action)),
    `plan action "${plan.action.desc}" is not legal at ${trail}`,
  );
  const results = applyAction(state, plan.action);
  const here = `${trail} > ${plan.action.desc}`;
  if (plan.kind === 'step') {
    assert.equal(results.length, 1, `step action "${plan.action.desc}" had ${results.length} outcomes`);
    return replayPlan(results[0].state, plan.then, here);
  }
  if (plan.kind === 'branch') {
    assert.ok(Array.isArray(plan.outcomes), `branch without outcomes at ${here}`);
    assert.equal(plan.outcomes.length, results.length, `branch outcome count mismatch at ${here}`);
    assertLabels(results);
    let n = 0;
    for (const r of results) {
      const match = plan.outcomes.filter((o) => o.label === r.label);
      assert.equal(match.length, 1, `no unique plan outcome for label "${r.label}" at ${here}`);
      n += replayPlan(r.state, match[0].plan, `${here} [${r.label}]`);
    }
    return n;
  }
  assert.fail(`unknown plan kind ${plan.kind} at ${trail}`);
}

/** Worst-case number of actions in a plan. */
export function planDepth(plan) {
  if (plan.kind === 'win') return 0;
  if (plan.kind === 'step') return 1 + planDepth(plan.then);
  if (plan.kind === 'branch') return 1 + Math.max(...plan.outcomes.map((o) => planDepth(o.plan)));
  throw new Error(`unknown plan kind ${plan.kind}`);
}

/** All branch nodes in a plan. */
export function planBranches(plan) {
  if (!plan || plan.kind === 'win') return [];
  if (plan.kind === 'step') return planBranches(plan.then);
  return [plan, ...plan.outcomes.flatMap((o) => planBranches(o.plan))];
}

/** All actions in a plan (pre-order). */
export function planActions(plan) {
  if (!plan || plan.kind === 'win') return [];
  if (plan.kind === 'step') return [plan.action, ...planActions(plan.then)];
  return [plan.action, ...plan.outcomes.flatMap((o) => planActions(o.plan))];
}
