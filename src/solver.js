// AND/OR solver (SPEC §9). Pure and deterministic.
//
// value(s) = 0 if s is won, ∞ if lost, otherwise
//            min over my actions a of ( 1 + max over the outcomes o of a of value(o) ).
// That is the worst-case number of actions of the shortest winning line (§12 Q12).
//
// Two phases, both memoised on a canonical state key (PRUNING 4):
//  1. canWin: a boolean AND/OR search ("is there any win?"). Each state is
//     expanded at most once. If the root can't win we are done; every state it
//     proves unwinnable is final (value ∞) for phase 2.
//  2. search: iterative deepening on the plan length around a depth-first
//     branch-and-bound. search(s, budget) returns value(s) exactly if it is
//     ≤ budget, otherwise some lower bound > budget. The memo stores exact values
//     (with their plan) and lower bounds from failed bounded searches; a bounded
//     failure is re-searched only when a caller has a larger budget. Ties are
//     broken by legalActions order (an action replaces the best only if it is
//     strictly shorter), so the plan is deterministic.
//
// The game graph is acyclic (every action consumes a card, a mana source, a
// pending trigger/choice, or advances the phase; nothing returns a card to an
// earlier zone without consuming something else), so a DFS with memo of solved
// states is sound. A defensive on-path check is kept anyway.
//
// Budget exhaustion throws an internal ABORT that unwinds the whole search: an
// aborted subtree is never cached, so 'aborted' can't turn into 'no_win'.
import { legalActions, applyLegal, status } from './engine.js';
import { cardDef } from './cards.js';

const ORACLE = "Thassa's Oracle";
const WIN_PLAN = Object.freeze({ kind: 'win' });
const ABORT = Symbol('abort');

// ---------------------------------------------------------------------------
// Safe pruning
// ---------------------------------------------------------------------------

// PRUNING 1 — mana abilities only right before they are used.
// Restricted mana actions: `tap` (lands) and `sac_petal`. (LED is excluded: it
// discards the hand, so WHEN it is activated matters.) In any winning line, take
// an activation A of source X. Let E be the first later action that either
// spends pool mana (a cast or a cycle with a non-empty payment) or sacrifices X
// (Edge of Autumn cycling sacrificing the tapped land). Moving A to just before E
// keeps the line legal and changes nothing else: actions between A and E don't
// spend mana, the pool is only larger at every later point, and no action in the
// model reads whether a land is tapped except Edge's sacrifice of X itself (that
// is E) and the untap step. If an untap step (or E never comes) lies between, A's
// effect is wiped or unused and A can simply be dropped, which only leaves more
// options (extra floating mana or an untapped source never hurts: payments are
// exact per spell, not per pool). Moving an action later inside an AND tree
// copies it into every branch, so no root-to-leaf path gets longer. Therefore a
// shortest winning line exists in which every restricted mana activation is
// immediately followed by another restricted mana activation or by such an E.
// The search enforces that with a `paying` flag (part of the memo key).
const isRestrictedMana = (a) => a.type === 'tap' || a.type === 'sac_petal';
function paymentTotal(p) {
  let t = 0;
  for (const k in p || {}) t += p[k] || 0;
  return t;
}
function allowedWhilePaying(a) {
  if (isRestrictedMana(a)) return true;
  if ((a.type === 'cast' || a.type === 'cycle') && paymentTotal(a.payment) > 0) return true;
  if (a.type === 'cycle' && a.sacrifice && a.sacrifice.tapped) return true;
  return false;
}

// PRUNING 2 — no Oracle, no win. A win needs an Oracle trigger to resolve. A
// trigger only comes from an Oracle entering the battlefield: cast from hand, or
// returned from the graveyard by Unearth (cast from hand). Oracle cards only move
// library→hand/graveyard, hand→graveyard/library/battlefield,
// graveyard→battlefield; exile and the battlefield are final (no flicker or
// bounce in the model). So without a pending trigger, if no Oracle is in the
// hand or library, and no Oracle is in the graveyard with an Unearth in the hand
// or library, value(s) = ∞.
function hopeless(s) {
  if (s.pendingTrigger) return false;
  if (s.hand.includes(ORACLE) || s.library.includes(ORACLE)) return false;
  if (s.graveyard.includes(ORACLE) && (s.hand.includes('Unearth') || s.library.includes('Unearth'))) return false;
  return true;
}

// PRUNING 3 — admissible lower bound h(s) ≤ value(s). A search whose budget is
// below h fails without expanding the node.
//  - Base: the winning resolve_oracle (1); without a pending trigger an Oracle
//    must also enter first (cast or Unearth): 2. Neither action changes the
//    library size.
//  - Library: a win needs library size ≤ devotion at resolution. Devotion can
//    never exceed D = the {U} symbols of every permanent card still in hand,
//    library, graveyard or on the battlefield (exile is final). Let
//    Φ = library size + cards a pending Brainstorm will put back. Every action
//    lowers Φ by at most 2 (Brainstorm cast −3+2, its choice 0, Consider bin+draw
//    −2, Flow State two-card take −2; draws, cycles, fetches, surveil, Ponder,
//    Edge −1; everything else 0 or more). So at least ceil((Φ − D) / 2) more
//    actions besides the base ones.
function lowerBound(s) {
  let d = 0;
  const addDev = (n) => {
    const c = cardDef(n);
    if (c.cost.U && !c.types.includes('instant') && !c.types.includes('sorcery')) d += c.cost.U;
  };
  for (const n of s.hand) addDev(n);
  for (const n of s.library) addDev(n);
  for (const n of s.graveyard) addDev(n);
  for (const p of s.battlefield) addDev(p.name);
  const pc = s.pendingChoice;
  const phi = s.library.length + (pc && pc.kind === 'brainstorm' ? pc.options[0].length : 0);
  return (s.pendingTrigger ? 1 : 2) + Math.max(0, Math.ceil((phi - d) / 2));
}

// PRUNING 5 — interchangeable mana colors for Lotus Petal and Lion's Eye
// Diamond. A color is "generic-only" if no supported nonland card in hand or
// library has that color in its cost. (Cards only ever leave hand ∪ library for
// the graveyard, battlefield or exile, and nothing is cast from those zones, so
// a generic-only color stays generic-only.) Generic-only mana can only pay
// generic costs, so a line using one generic-only color maps action-for-action
// onto a line using another (replace it in every later payment), with the same
// length. So among the generic-only colors only the first (WUBRG order) is
// tried. Lands are unaffected (their colors are fixed by the card).
function genericOnlyColors(s) {
  const needed = new Set();
  const see = (n) => {
    const c = cardDef(n);
    if (!c.supported || c.types.includes('land')) return;
    for (const k of Object.keys(c.cost)) needed.add(k);
  };
  for (const n of s.hand) see(n);
  for (const n of s.library) see(n);
  return ['W', 'U', 'B', 'R', 'G'].filter((c) => !needed.has(c));
}
function pruneColors(s, acts) {
  if (!acts.some((a) => a.type === 'sac_petal' || a.type === 'activate_led')) return acts;
  const g = genericOnlyColors(s);
  if (g.length < 2) return acts;
  const drop = new Set(g.slice(1));
  return acts.filter((a) => !((a.type === 'sac_petal' || a.type === 'activate_led') && drop.has(a.color)));
}

// PRUNING 4 — canonical memo key. Equal keys ⇒ the same legal actions with the
// same results (so the same value and a reusable plan). Beyond §8 stateKey's
// canonicalisation (hand/graveyard/battlefield order) it drops what no rule in
// the model ever reads:
//  - exile (nothing returns from exile or counts it);
//  - the graveyard, except: whether it holds an instant and a sorcery (Flow
//    State) and the multiset of creature cards with MV ≤ 3 (Unearth targets);
//  - noncreatureCast, except whether it is ≥ 1 while Deafening Silence is in
//    play (the only reader);
//  - the pending choice's option list: every choice's options are a function
//    of the current library/hand plus its kind, Oracle's X ('oracle_top') and
//    Flow State's mode (1 or 2 cards to hand), so those three identify it.
// Card names are interned to one character each (per solve() call, so no
// module-level mutable state) to keep keys short.
function makeKeyer() {
  const intern = new Map();
  const code = (name) => {
    let c = intern.get(name);
    if (c === undefined) {
      c = String.fromCharCode(0x100 + intern.size);
      intern.set(name, c);
    }
    return c;
  };
  const codes = (names, sort) => {
    const arr = names.map(code);
    if (sort) arr.sort();
    return arr.join('');
  };
  return (s, paying) => solverKey(s, paying, code, codes);
}

function graveyardKey(gy, codes) {
  let inst = 0;
  let sorc = 0;
  const creatures = [];
  for (const n of gy) {
    const d = cardDef(n);
    if (d.types.includes('instant')) inst = 1;
    if (d.types.includes('sorcery')) sorc = 1;
    if (d.types.includes('creature') && d.mv <= 3) creatures.push(n);
  }
  return `${inst}${sorc}${codes(creatures, true)}`;
}

function solverKey(s, paying, code, codes) {
  const silence = s.opponent.permanents.some((p) => p.name === 'Deafening Silence');
  const pc = s.pendingChoice;
  return [
    codes(s.library, false),
    codes(s.hand, true),
    graveyardKey(s.graveyard, codes),
    s.battlefield.map((p) => code(p.name) + (p.tapped ? 't' : 'u')).sort().join(''),
    s.life,
    `${s.pool.W},${s.pool.U},${s.pool.B},${s.pool.R},${s.pool.G},${s.pool.C}`,
    `${s.restricted.W},${s.restricted.U},${s.restricted.B},${s.restricted.R},${s.restricted.G}`,
    s.phase, s.turn, s.landPlayed ? 1 : 0,
    silence && s.noncreatureCast >= 1 ? 1 : 0,
    s.pendingTrigger ? 1 : 0,
    pc ? `${pc.kind}:${pc.x ?? ''}:${pc.kind === 'flow_state' ? pc.options[0].hand.length : ''}` : '-',
    s.opponent.permanents.map((p) => JSON.stringify([p.name, p.x ?? null, p.named ?? null])).sort().join('\u0001'),
    s.turnsAhead, s.cavernType,
    paying ? 'P' : '',
  ].join('\u0002');
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

export function solve(state, { maxNodes = 200000 } = {}) {
  const memo = new Map(); // key → { val, plan } (exact) | { lb } (lower bound)
  const onPath = new Set();
  const keyOf = makeKeyer();
  let nodes = 0;

  // Phase 1: can s be won at all? Boolean AND/OR search, each state expanded at
  // most once. Results are exact (no budget involved), so 'no' is final and
  // seeds phase 2 with lb = ∞.
  const canWinMemo = new Map();
  function canWin(s, paying) {
    const st = status(s);
    if (st === 'win') return true;
    if (st === 'loss') return false;
    const key = keyOf(s, paying);
    const m = canWinMemo.get(key);
    if (m !== undefined) return m;
    if (hopeless(s)) { canWinMemo.set(key, false); return false; }
    if (onPath.has(key)) return false; // unreachable: the game graph is acyclic
    nodes += 1;
    if (nodes > maxNodes) throw ABORT;
    onPath.add(key);
    let acts = pruneColors(s, legalActions(s));
    if (paying) acts = acts.filter(allowedWhilePaying);
    let ok = false;
    for (const a of acts) {
      const childPaying = isRestrictedMana(a);
      if (applyLegal(s, a).every((o) => canWin(o.state, childPaying))) { ok = true; break; }
    }
    onPath.delete(key);
    canWinMemo.set(key, ok);
    return ok;
  }

  // Phase 2: shortest worst-case plan. Returns [value, plan]: value ≤ budget ⇒
  // exact, with its plan; value > budget ⇒ a lower bound, plan null.
  function search(s, paying, budget) {
    const st = status(s);
    if (st === 'win') return [0, WIN_PLAN];
    if (st === 'loss') return [Infinity, null];
    const key = keyOf(s, paying);
    const m = memo.get(key);
    if (m) {
      if (m.plan) return [m.val, m.plan];
      if (m.lb > budget) return [m.lb, null];
    }
    if (canWinMemo.get(key) === false || hopeless(s)) {
      memo.set(key, { lb: Infinity });
      return [Infinity, null];
    }
    const h = lowerBound(s);
    if (h > budget) {
      if (!m || m.lb < h) memo.set(key, { lb: h });
      return [h, null];
    }
    if (onPath.has(key)) return [budget + 1, null]; // unreachable: the game graph is acyclic
    nodes += 1;
    if (nodes > maxNodes) throw ABORT;
    onPath.add(key);

    let acts = pruneColors(s, legalActions(s));
    if (paying) acts = acts.filter(allowedWhilePaying);

    let best = Infinity;
    let bestPlan = null;
    let lbMin = Infinity;
    for (const a of acts) {
      const cap = Math.min(budget, best - 1) - 1; // every outcome must finish within cap
      if (cap < 0) break;
      const outs = applyLegal(s, a);
      const childPaying = isRestrictedMana(a);
      let worst = 0;
      let failed = false;
      const plans = [];
      for (const o of outs) {
        const [v, p] = search(o.state, childPaying, cap);
        if (v > cap) {
          failed = true;
          lbMin = Math.min(lbMin, 1 + v);
          break;
        }
        if (v > worst) worst = v;
        plans.push(p);
      }
      if (failed) continue;
      best = 1 + worst;
      bestPlan = outs.length === 1
        ? { kind: 'step', action: a, then: plans[0] }
        : { kind: 'branch', action: a, outcomes: outs.map((o, i) => ({ label: o.label, plan: plans[i] })) };
    }
    onPath.delete(key);

    if (bestPlan) {
      memo.set(key, { val: best, plan: bestPlan });
      return [best, bestPlan];
    }
    // Every action failed within the budget: value ≥ lbMin (∞ if every failure was absolute).
    memo.set(key, { lb: lbMin });
    return [lbMin, null];
  }

  try {
    // Iterative deepening on the worst-case length: each failed round returns a
    // lower bound for the next; lower bounds and exact values carry over in the
    // memo. Ends with an exact value (win) or a lower bound of ∞ (no_win).
    if (!canWin(state, false)) return { result: 'no_win', plan: null, nodes };
    let budget = 0;
    for (;;) {
      const [v, plan] = search(state, false, budget);
      if (v <= budget) return { result: 'win', plan, nodes };
      if (v === Infinity) return { result: 'no_win', plan: null, nodes };
      budget = v;
    }
  } catch (e) {
    if (e === ABORT) return { result: 'aborted', plan: null, nodes };
    throw e;
  }
}

// ---------------------------------------------------------------------------
// explain()
// ---------------------------------------------------------------------------

/**
 * Plan → lines, one per action, with turn/phase headers. Branch outcomes are
 * indented under their action; the headers follow the passes inside each branch.
 */
export function explain(plan) {
  const lines = [];
  const header = (ctx) => (ctx.phase === 'opp' ? "Opponent's turn" : ctx.turn === 0 ? 'Turn 0 (Doomsday turn)' : `Turn ${ctx.turn}`);
  const walk = (p, ctx, indent) => {
    const pad = '  '.repeat(indent);
    let cur = p;
    let c = { ...ctx };
    while (cur && cur.kind !== 'win') {
      const a = cur.action;
      if (a.type === 'pass') {
        c = c.phase === 'main' ? { turn: c.turn, phase: 'opp' } : { turn: c.turn + 1, phase: 'main' };
        lines.push(`${pad}${header(c)}`);
        cur = cur.then;
        continue;
      }
      lines.push(`${pad}${a.desc}`);
      if (cur.kind === 'branch') {
        lines.push(`${pad}  ⚠ random outcome; every case wins:`);
        for (const o of cur.outcomes) {
          lines.push(`${pad}  • ${o.label}`);
          walk(o.plan, c, indent + 2);
        }
        return;
      }
      cur = cur.then;
    }
    if (cur && cur.kind === 'win') lines.push(`${pad}WIN`);
  };
  if (!plan) return lines;
  lines.push(header({ turn: 0, phase: 'main' }));
  walk(plan, { turn: 0, phase: 'main' }, 0);
  return lines;
}
