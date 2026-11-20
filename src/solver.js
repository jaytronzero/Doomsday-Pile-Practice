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
// v2: the adversary's choices are extra AND outcomes of my actions, so the same
// search applies. The graph stays acyclic: every adversary option consumes a
// held card or a visible permanent, and the W-oracle loop (resolve_oracle →
// they act → I get priority) consumes one card per round.
//
// Budget exhaustion throws an internal ABORT that unwinds the whole search: an
// aborted subtree is never cached, so 'aborted' can't turn into 'no_win'. The
// engine's OutcomeLimitError (one action with too many random orderings) is
// reported the same way: 'aborted', i.e. unknown, never a win or a no_win.
import { legalActions, applyLegal, status, oppKey, OutcomeLimitError } from './engine.js';
import { cardDef } from './cards.js';

const ORACLE = "Thassa's Oracle";
const WIN_PLAN = Object.freeze({ kind: 'win' });
const ABORT = Symbol('abort');

// ---------------------------------------------------------------------------
// Safe pruning (re-checked for v2: SPEC_QUESTIONS V2-Q13 lead ruling)
// ---------------------------------------------------------------------------
//
// v2 adds an adversary whose choices are AND outcomes of my actions (API §7),
// my spell or ability waiting in `state.stack` while a window is open, and
// card moves v1 never had: Sink into Stupor (stack/battlefield → hand),
// Endurance (graveyard → library), Surgical Extraction (several library cards
// → exile, then shuffle), Kozilek's Command (forced draw), Goblin Guide
// (library → hand at combat), Wasteland / Ghost Quarter (land → graveyard) and
// Pact of Negation (a win without an Oracle). Each pruning below states the v2
// argument, and is switched off per state where that argument fails.

// Opponent cards whose effect reads or moves my graveyard.
const GY_READERS = new Set(['Endurance', 'Surgical Extraction', "Kozilek's Command"]);
const oppHolds = (s, name) => s.opp.hand.includes(name);
function graveyardRead(s) {
  if (s.opp.hand.some((n) => GY_READERS.has(n))) return true;
  return s.opponent.permanents.some((p) => p.name === "Tormod's Crypt");
}

// PRUNING 1 — mana abilities only right before they are used.
// Restricted mana actions: `tap` (lands) always, `sac_petal` only when no
// graveyard reader is in play (see below). (LED is excluded: it discards the
// hand, so WHEN it is activated matters.) In any winning strategy take an
// activation A of source X. Let E be the first later action of mine that either
// spends pool mana (a cast or cycle with a non-empty payment, or paying a
// pay_or_not counter) or sacrifices X (Edge of Autumn cycling sacrificing the
// tapped land). Moving A to just before E keeps the line legal and changes
// nothing else:
//  - actions between A and E don't spend mana, and the pool is only larger at
//    every later point (payments are exact per spell, not per pool);
//  - the adversary's options never read my pool or whether my land is tapped
//    except Wasteland / Ghost Quarter (they target "name + tapped", but treat a
//    tapped and an untapped land alike). Those act only at W-oppturn and
//    W-myturn, i.e. right after a pass, and a pass empties the pool. So if a
//    pass lies between A and E, A's mana is wiped and A can be dropped instead
//    (an untapped land is never worse than a tapped one: nothing in the model
//    punishes an untapped land; Back to Basics only stops untapping);
//  - while a pay_or_not is pending, mana abilities are legal, and paying is an
//    E, so "tap then pay" stays available.
//  - a Lotus Petal sacrifice also moves the Petal to my graveyard. With
//    Endurance, Surgical, Kozilek's Command or Tormod's Crypt in play the
//    adversary can act on that graveyard between A and E (Endurance would even
//    put the Petal into my library), so the move can change their options and
//    the pruning is OFF for sac_petal in those states.
// Moving an action later inside an AND tree copies it into every branch, so no
// root-to-leaf path gets longer. Therefore a shortest winning line exists in
// which every restricted mana activation is immediately followed by another
// restricted mana activation or by such an E. The search enforces that with a
// `paying` flag (part of the memo key).
const isRestrictedMana = (s, a) => a.type === 'tap' || (a.type === 'sac_petal' && !graveyardRead(s));
function paymentTotal(p) {
  let t = 0;
  for (const k in p || {}) t += p[k] || 0;
  return t;
}
function allowedWhilePaying(a) {
  if (a.type === 'tap' || a.type === 'sac_petal') return true;
  if ((a.type === 'cast' || a.type === 'cycle') && paymentTotal(a.payment) > 0) return true;
  if (a.type === 'cycle' && a.sacrifice && a.sacrifice.tapped) return true;
  if (a.type === 'choose' && a.option && typeof a.option === 'object' && a.option.pay) return true;
  return false;
}

// PRUNING 2 — no Oracle, no win. A win needs an Oracle trigger to resolve, or
// the opponent losing to a Pact of Negation upkeep. A trigger only comes from an
// Oracle entering the battlefield: cast from hand, or returned from the
// graveyard by Unearth (cast from hand). In v2 Oracle cards move
// library→hand/graveyard/exile, hand→graveyard/exile/library/stack,
// stack→battlefield/graveyard/exile/hand (Sink into Stupor),
// graveyard→battlefield (Unearth)/library (Endurance)/exile, and
// battlefield→graveyard/exile/hand (Sink, only with the trigger pending).
// Exile is final. So the state is hopeless (value ∞) when ALL of these hold:
//  - no trigger pending, no Pact upkeep due, nothing of mine on the stack
//    (a spell there can still resolve or be bounced to my hand);
//  - no Oracle in hand or library;
//  - no Oracle in the graveyard that can come back: with Unearth in hand or
//    library, or with Endurance in their hand (graveyard → library).
// (An Oracle on the battlefield without a pending trigger never triggers again:
// Sink only bounces an Oracle whose trigger is pending.)
function hopeless(s) {
  if (s.pendingTrigger || s.stack || s.opp.pacts.length) return false;
  if (s.hand.includes(ORACLE) || s.library.includes(ORACLE)) return false;
  if (s.graveyard.includes(ORACLE)) {
    if (s.hand.includes('Unearth') || s.library.includes('Unearth')) return false;
    if (oppHolds(s, 'Endurance')) return false;
  }
  return true;
}

// PRUNING 3 — admissible lower bound h(s) ≤ value(s). A search whose budget is
// below h fails without expanding the node.
// With an adversary, value(s) = 1 + max over outcomes of the best action, so it
// suffices that EVERY action has SOME outcome o with h(o) ≥ h(s) − 1 (follow
// that outcome along the winning strategy: the path still ends in a win within
// value(s) actions). We pick the "do nothing" outcome whenever there is one;
// every adversary window has it.
//  - Pact: if a Pact upkeep is due the opponent may lose on my next pass:
//    h = 1.
//  - Base: the winning resolve_oracle (1); without a pending trigger an Oracle
//    must also enter first (a cast, an Unearth, or paying for / resolving the
//    Oracle spell waiting on the stack): 2. In their "do nothing" outcome
//    neither action changes the library size.
//  - Library: a win needs library size ≤ devotion at resolution. Devotion can
//    never exceed D = the {U} symbols of every permanent card still in hand,
//    library, graveyard, on the battlefield or on the stack (exile is final;
//    D never grows: nothing returns from exile). Let Φ = library size + cards a
//    pending Brainstorm will put back. In the chosen outcome every action
//    lowers Φ by at most m = 2 + (number of Goblin Guides): v1's actions by ≤ 2
//    (Brainstorm cast −3+2, Consider bin+draw −2, Flow State two-card take −2;
//    other draws, cycles, fetches, surveil, Ponder, Edge −1); paying for a
//    Brainstorm on the stack −1; Narset / Hullbreacher only remove draws;
//    pass from my turn −(Goblin Guides) (each reveals and may take a land);
//    pass to my turn −1 (draw step); a Ghost Quarter search −1; the
//    adversary's forced choices (Bowmasters ping targets, discard targets)
//    never touch the library; Kozilek's Command / Surgical are optional
//    adversary actions, so the "do nothing" outcome is used. So at least
//    ceil((Φ − D) / m) more actions besides the base ones.
function lowerBound(s) {
  if (s.opp.pacts.length) return 1;
  let d = 0;
  const addDev = (n) => {
    const c = cardDef(n);
    if (c.cost.U && !c.types.includes('instant') && !c.types.includes('sorcery')) d += c.cost.U;
  };
  for (const n of s.hand) addDev(n);
  for (const n of s.library) addDev(n);
  for (const n of s.graveyard) addDev(n);
  for (const p of s.battlefield) addDev(p.name);
  if (s.stack && s.stack.spell) addDev(s.stack.spell);
  const pc = s.pendingChoice;
  const phi = s.library.length + (pc && pc.kind === 'brainstorm' ? pc.options[0].length : 0);
  let guides = 0;
  for (const p of s.opponent.permanents) if (p.name === 'Goblin Guide') guides += 1;
  const m = 2 + guides;
  return (s.pendingTrigger ? 1 : 2) + Math.max(0, Math.ceil((phi - d) / m));
}

// PRUNING 5 — interchangeable mana colors for Lotus Petal and Lion's Eye
// Diamond. A color is "generic-only" if no supported nonland card that can
// still be cast has that color in its cost. Cards that can still be cast: hand,
// library, my spell on the stack (it can be bounced to my hand by Sink into
// Stupor or paid for), and — when the opponent holds Sink into Stupor — my
// battlefield (a pending Oracle can be bounced), and — when they hold Endurance
// — my graveyard (it can go back to my library). Nothing else moves a card into
// my hand or library (Goblin Guide and Kozilek's Command only move library →
// hand), and nothing is cast from other zones, so a generic-only color stays
// generic-only. Nothing in the model reads the color of floating mana except
// payments of colored symbols (opponent counters ask for generic mana only), so
// a line using one generic-only color maps action-for-action onto a line using
// another (replace it in every later payment), with the same length and the
// same adversary options. So among the generic-only colors only the first
// (WUBRG order) is tried. Lands are unaffected (their colors are fixed).
function genericOnlyColors(s) {
  const needed = new Set();
  const see = (n) => {
    const c = cardDef(n);
    if (!c.supported || c.types.includes('land')) return;
    for (const k of Object.keys(c.cost)) needed.add(k);
  };
  for (const n of s.hand) see(n);
  for (const n of s.library) see(n);
  if (s.stack && s.stack.spell) see(s.stack.spell);
  if (oppHolds(s, 'Sink into Stupor')) for (const p of s.battlefield) see(p.name);
  if (oppHolds(s, 'Endurance')) for (const n of s.graveyard) see(n);
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
//  - exile (nothing returns from exile or counts it; Voidwalker's ability is
//    not modelled);
//  - the graveyard, except: whether it holds an instant and a sorcery (Flow
//    State) and the multiset of creature cards with MV ≤ 3 (Unearth targets).
//    When a graveyard reader is in play (Endurance, Surgical, Kozilek's Command,
//    Tormod's Crypt) the whole graveyard multiset is kept instead;
//  - noncreatureCast, except whether it is ≥ 1 while Deafening Silence is in
//    play (the only reader);
//  - warnings (never read).
//  - the pending choice's option list: every choice's options are a function
//    of the current library/hand plus its kind, Oracle's X ('oracle_top'),
//    Flow State's mode (1 or 2 cards to hand), the counter and amount of a
//    pay_or_not, and the window a Ghost Quarter choice reopens.
// Everything else of v2 is kept: the opponent's resources (hand, hand size,
// mana, lands, colours, life, treasures, spells cast, Pact upkeeps), their
// permanents with every field, my spells/draws this turn, the pending opponent
// spell, my stack item, and damage on my creatures.
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

function graveyardKey(s, codes) {
  if (graveyardRead(s)) return `*${codes(s.graveyard, true)}`;
  let inst = 0;
  let sorc = 0;
  const creatures = [];
  for (const n of s.graveyard) {
    const d = cardDef(n);
    if (d.types.includes('instant')) inst = 1;
    if (d.types.includes('sorcery')) sorc = 1;
    if (d.types.includes('creature') && d.mv <= 3) creatures.push(n);
  }
  return `${inst}${sorc}${codes(creatures, true)}`;
}

function stableJSON(v) {
  if (Array.isArray(v)) return `[${v.map(stableJSON).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v).sort().filter((k) => v[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${stableJSON(v[k])}`).join(',')}}`;
  }
  return JSON.stringify(v === undefined ? null : v);
}

function choiceKey(pc) {
  if (!pc) return '-';
  switch (pc.kind) {
    case 'oracle_top': return `${pc.kind}:${pc.x}`;
    case 'flow_state': return `${pc.kind}:${pc.options[0].hand.length}`;
    case 'pay_or_not': return `${pc.kind}:${pc.card}:${pc.amount}`;
    case 'ghost_quarter': return `${pc.kind}:${pc.window}`;
    default: return pc.kind;
  }
}

function solverKey(s, paying, code, codes) {
  const silence = s.opponent.permanents.some((p) => p.name === 'Deafening Silence');
  return [
    codes(s.library, false),
    codes(s.hand, true),
    graveyardKey(s, codes),
    s.battlefield.map((p) => code(p.name) + (p.tapped ? 't' : 'u') + (p.damage ? p.damage : '')).sort().join(''),
    s.life,
    `${s.pool.W},${s.pool.U},${s.pool.B},${s.pool.R},${s.pool.G},${s.pool.C}`,
    `${s.restricted.W},${s.restricted.U},${s.restricted.B},${s.restricted.R},${s.restricted.G}`,
    s.phase, s.turn, s.landPlayed ? 1 : 0,
    silence && s.noncreatureCast >= 1 ? 1 : 0,
    s.pendingTrigger ? 1 : 0,
    choiceKey(s.pendingChoice),
    s.opponent.permanents.map(stableJSON).sort().join('\u0001'),
    s.turnsAhead, s.cavernType,
    paying ? 'P' : '',
    oppKey(s.opp),
    s.spellsCast, s.drawsThisTurn,
    s.pendingOppSpell ? stableJSON(s.pendingOppSpell) : '-',
    s.stack ? stableJSON(s.stack) : '-',
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
      const childPaying = isRestrictedMana(s, a);
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
      const childPaying = isRestrictedMana(s, a);
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
    // An action with more random outcomes than the engine enumerates: unknown, never a win.
    if (e instanceof OutcomeLimitError) return { result: 'aborted', plan: null, nodes, reason: e.message };
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
