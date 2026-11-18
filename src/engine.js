// Game engine (SPEC §3–§8). Pure: no DOM, no randomness, inputs never mutated.
import { cardDef } from './cards.js';

const ORACLE = "Thassa's Oracle";
const PETAL = 'Lotus Petal';
const LED = "Lion's Eye Diamond";
const SEWERS = 'Undercity Sewers';
const POOL_COLORS = ['W', 'U', 'B', 'R', 'G', 'C'];
const R_COLORS = ['W', 'U', 'B', 'R', 'G'];
const PAY_KEYS = [...POOL_COLORS, ...R_COLORS.map((c) => `r${c}`)];

const SILENCE = 'Deafening Silence';
const THALIA = 'Thalia, Guardian of Thraben';
const TEEG = 'Gaddock Teeg';
const CHALICE = 'Chalice of the Void';
const FLUTE = 'Disruptor Flute';
const OPP_CARDS = {
  [SILENCE]: { creature: false, mv: 3 },
  [THALIA]: { creature: true, mv: 2 },
  [TEEG]: { creature: true, mv: 2 },
  [CHALICE]: { creature: false, mv: 0 },
  [FLUTE]: { creature: false, mv: 1 },
};

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

const has = (d, t) => d.types.includes(t);
const isLandName = (n) => has(cardDef(n), 'land');

function countBy(names) {
  const m = new Map();
  for (const n of names) m.set(n, (m.get(n) || 0) + 1);
  return m;
}

function sortedUnique(names) {
  return [...new Set(names)].sort();
}

function removeOne(arr, name) {
  const i = arr.indexOf(name);
  if (i < 0) throw new Error(`internal: ${name} not found`);
  arr.splice(i, 1);
}

/** Stable JSON with sorted object keys (for action identity and keys). */
function stable(v) {
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v).sort().filter((k) => v[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`;
  }
  return JSON.stringify(v === undefined ? null : v);
}

function normPayment(p) {
  const out = {};
  for (const k of PAY_KEYS) if (p && p[k]) out[k] = p[k];
  return out;
}

function actionKey(a) {
  const { desc, ...rest } = a;
  if (rest.payment) rest.payment = normPayment(rest.payment);
  if (rest.type === 'crack_fetch' && rest.find === undefined) rest.find = null;
  return stable(rest);
}

/** Distinct orderings of a multiset of names, in lexicographic order. */
export function distinctPermutations(names) {
  const items = [...names].sort();
  const out = [];
  const used = new Array(items.length).fill(false);
  const cur = [];
  const rec = () => {
    if (cur.length === items.length) { out.push([...cur]); return; }
    for (let i = 0; i < items.length; i++) {
      if (used[i]) continue;
      if (i > 0 && items[i] === items[i - 1] && !used[i - 1]) continue;
      used[i] = true; cur.push(items[i]);
      rec();
      cur.pop(); used[i] = false;
    }
  };
  rec();
  return out;
}

/** Distinct sub-multisets of size k (sorted name lists). */
function distinctCombos(names, k) {
  const items = [...names].sort();
  const out = [];
  const cur = [];
  const rec = (start) => {
    if (cur.length === k) { out.push([...cur]); return; }
    for (let i = start; i < items.length; i++) {
      if (i > start && items[i] === items[i - 1]) continue;
      cur.push(items[i]);
      rec(i + 1);
      cur.pop();
    }
  };
  rec(0);
  return out;
}

function clone(s) {
  return {
    library: [...s.library],
    hand: [...s.hand],
    graveyard: [...s.graveyard],
    exile: [...s.exile],
    battlefield: s.battlefield.map((p) => ({ name: p.name, tapped: !!p.tapped })),
    life: s.life,
    pool: { ...s.pool },
    restricted: { ...s.restricted },
    phase: s.phase,
    turn: s.turn,
    landPlayed: s.landPlayed,
    noncreatureCast: s.noncreatureCast,
    pendingTrigger: s.pendingTrigger,
    pendingChoice: s.pendingChoice,
    opponent: { permanents: s.opponent.permanents.map((p) => ({ ...p })) },
    turnsAhead: s.turnsAhead,
    cavernType: s.cavernType,
    drewEmpty: s.drewEmpty,
    won: s.won,
  };
}

function draw(s) {
  if (s.library.length === 0) s.drewEmpty = true;
  else s.hand.push(s.library.shift());
}

const oppCount = (s, name) => s.opponent.permanents.filter((p) => p.name === name).length;

function isLost(s) {
  return s.life <= 0 || s.drewEmpty;
}

/** Shuffle the library: one outcome per distinct ordering. `prefix` stays on top. */
function shuffleOutcomes(s, prefix = [], after = null) {
  return distinctPermutations(s.library).map((perm) => {
    const o = clone(s);
    o.library = [...prefix, ...perm];
    if (after) after(o);
    return { state: o, label: `library: ${o.library.length ? o.library.join(', ') : '(empty)'}` };
  });
}

function setChoice(s, kind, options, descs, extra = {}) {
  if (options.length === 0) return false; // Q3: zero options → skipped
  s.pendingChoice = { kind, options, descs, ...extra };
  return true;
}

function surveilChoice(s, kind) {
  if (s.library.length === 0) return false;
  const top = s.library[0];
  return setChoice(s, kind, ['keep', 'graveyard'], [`Keep ${top} on top`, `Put ${top} into the graveyard`]);
}

// ---------------------------------------------------------------------------
// Setup / Doomsday resolution (§3, §4)
// ---------------------------------------------------------------------------

function isNonNegInt(n) {
  return Number.isInteger(n) && n >= 0;
}

function normalizeSetup(setup) {
  if (!setup || typeof setup !== 'object') throw new Error('Setup must be an object.');
  const deck = setup.deck;
  if (!deck || typeof deck !== 'object' || Array.isArray(deck)) throw new Error('Setup needs a deck object {name: count}.');
  for (const [n, c] of Object.entries(deck)) {
    if (!isNonNegInt(c)) throw new Error(`Deck count for ${n} must be a whole number ≥ 0 (got ${show(c)}).`);
  }
  const arr = (v, what) => {
    if (v === undefined || v === null) return [];
    if (!Array.isArray(v)) throw new Error(`${what} must be an array.`);
    return v;
  };
  const names = (v, what) => arr(v, what).map((n) => {
    if (typeof n !== 'string' || !n) throw new Error(`${what} must contain card names (got ${JSON.stringify(n)}).`);
    return n;
  });
  const battlefield = arr(setup.battlefield, 'battlefield').map((p) => {
    const e = typeof p === 'string' ? { name: p, tapped: false } : p;
    if (!e || typeof e.name !== 'string' || !e.name) throw new Error(`Battlefield entries need a name (got ${JSON.stringify(p)}).`);
    return { name: e.name, tapped: !!e.tapped };
  });
  const mp = setup.manaPool ?? {};
  if (typeof mp !== 'object' || Array.isArray(mp)) throw new Error('manaPool must be an object.');
  const pool = {};
  for (const c of POOL_COLORS) {
    const v = mp[c] ?? 0;
    if (!isNonNegInt(v)) throw new Error(`manaPool.${c} must be a whole number ≥ 0.`);
    pool[c] = v;
  }
  const opp = setup.opponent?.permanents ?? [];
  if (!Array.isArray(opp)) throw new Error('opponent.permanents must be an array.');
  return {
    deck,
    hand: names(setup.hand, 'hand'),
    battlefield,
    graveyard: names(setup.graveyard, 'graveyard'),
    exile: names(setup.exile, 'exile'),
    pool,
    lifeBeforeDoomsday: setup.lifeBeforeDoomsday ?? 20,
    landPlayedThisTurn: !!(setup.landPlayedThisTurn ?? false),
    noncreatureSpellsCastThisTurn: setup.noncreatureSpellsCastThisTurn ?? 1,
    cavernType: String(setup.cavernType ?? 'Merfolk'),
    opponent: opp,
    turnsAhead: setup.turnsAhead ?? 1,
  };
}

/** Deck count by name: own properties only ("constructor" is not a card). */
const deckCount = (deck, name) => (Object.prototype.hasOwnProperty.call(deck, name) ? deck[name] : 0);

/** JSON.stringify shows NaN/Infinity as null; show numbers as themselves. */
const show = (v) => (typeof v === 'number' ? String(v) : JSON.stringify(v));

function poolOf(n) {
  // Library before Doomsday, then + graveyard.
  const left = new Map(Object.entries(n.deck).filter(([, c]) => c > 0));
  const take = (name) => left.set(name, (left.get(name) || 0) - 1);
  for (const x of n.hand) take(x);
  for (const p of n.battlefield) take(p.name);
  for (const x of n.graveyard) take(x);
  for (const x of n.exile) take(x);
  take('Doomsday');
  for (const [name, c] of left) {
    if (c < 0) {
      const extra = name === 'Doomsday' ? ' (counting the Doomsday on the stack)' : '';
      throw new Error(`${name}: hand + battlefield + graveyard + exile${extra} use ${deckCount(n.deck, name) - c} copies but the deck has ${deckCount(n.deck, name)}.`);
    }
  }
  for (const x of n.graveyard) left.set(x, left.get(x) + 1);
  return left;
}

function validate(n) {
  if (!(deckCount(n.deck, 'Doomsday') >= 1)) throw new Error('The deck has no Doomsday to account for the one being cast.');
  if (!(Number.isInteger(n.lifeBeforeDoomsday) && n.lifeBeforeDoomsday >= 1)) {
    throw new Error(`lifeBeforeDoomsday must be a whole number ≥ 1 (got ${show(n.lifeBeforeDoomsday)}).`);
  }
  if (!(Number.isInteger(n.turnsAhead) && n.turnsAhead >= 0 && n.turnsAhead <= 3)) {
    throw new Error(`turnsAhead must be a whole number from 0 to 3 (got ${show(n.turnsAhead)}).`);
  }
  if (!isNonNegInt(n.noncreatureSpellsCastThisTurn)) {
    throw new Error('noncreatureSpellsCastThisTurn must be a whole number ≥ 0.');
  }
  for (const p of n.opponent) {
    if (!p || !Object.prototype.hasOwnProperty.call(OPP_CARDS, p.name)) {
      throw new Error(`Unknown opponent permanent ${JSON.stringify(p?.name)}. Supported: ${Object.keys(OPP_CARDS).join(', ')}.`);
    }
    if (p.name === CHALICE && !isNonNegInt(p.x)) throw new Error('Chalice of the Void needs an integer x ≥ 0.');
    if (p.name === FLUTE && !(typeof p.named === 'string' && p.named)) throw new Error('Disruptor Flute needs a card name in "named".');
  }
  for (const p of n.battlefield) {
    const d = cardDef(p.name);
    if (has(d, 'instant') || has(d, 'sorcery')) throw new Error(`${p.name} is not a permanent and can't be on the battlefield.`);
  }
}

/** Pile pool (§3): library before Doomsday + graveyard, as {name: count}. */
export function availablePile(setup) {
  const n = normalizeSetup(setup);
  const left = poolOf(n);
  const out = {};
  for (const [name, c] of left) if (c > 0) out[name] = c;
  return out;
}

export function buildStartState(setup, pile) {
  const n = normalizeSetup(setup);
  validate(n);
  const pool = poolOf(n);
  const poolSize = [...pool.values()].reduce((a, b) => a + b, 0);
  if (!Array.isArray(pile)) throw new Error('The pile must be an array of card names.');
  for (const x of pile) if (typeof x !== 'string' || !x) throw new Error('The pile must contain only card names.');
  const need = Math.min(5, poolSize);
  if (pile.length !== need) {
    throw new Error(`The pile must have exactly ${need} card${need === 1 ? '' : 's'}${poolSize < 5 ? ' (the whole pool)' : ''}; got ${pile.length}.`);
  }
  const used = countBy(pile);
  for (const [name, c] of used) {
    if (c > (pool.get(name) || 0)) throw new Error(`The pile uses ${c} ${name} but only ${pool.get(name) || 0} are available.`);
  }
  const exiled = [];
  for (const name of [...pool.keys()].sort()) {
    const k = (pool.get(name) || 0) - (used.get(name) || 0);
    for (let i = 0; i < k; i++) exiled.push(name);
  }
  const before = n.lifeBeforeDoomsday;
  const opp = n.opponent.map((p) => {
    const o = { name: p.name };
    if (p.name === CHALICE) o.x = p.x;
    if (p.name === FLUTE) o.named = p.named;
    return o;
  });
  return {
    library: [...pile],
    hand: [...n.hand],
    graveyard: ['Doomsday'],
    exile: [...n.exile, ...exiled],
    battlefield: n.battlefield.map((p) => ({ name: p.name, tapped: p.tapped })),
    life: before - Math.ceil(before / 2),
    pool: { ...n.pool },
    restricted: { W: 0, U: 0, B: 0, R: 0, G: 0 },
    phase: 'main',
    turn: 0,
    landPlayed: n.landPlayedThisTurn,
    noncreatureCast: n.noncreatureSpellsCastThisTurn,
    pendingTrigger: false,
    pendingChoice: null,
    opponent: { permanents: opp },
    turnsAhead: n.turnsAhead,
    cavernType: n.cavernType,
    drewEmpty: false,
    won: false,
  };
}

// ---------------------------------------------------------------------------
// Status (§5.5)
// ---------------------------------------------------------------------------

export function status(state) {
  if (isLost(state)) return 'loss';
  if (state.won) return 'win';
  return 'ongoing';
}

// ---------------------------------------------------------------------------
// Costs and payments (§5.4, §6)
// ---------------------------------------------------------------------------

/** Total cost {colors..., generic} of casting `name` now, or null if it can't be cast at all. */
function castCost(s, d) {
  const creature = has(d, 'creature');
  const cost = { ...d.cost };
  let generic = cost.generic || 0;
  delete cost.generic;
  if (!creature) generic += oppCount(s, THALIA);
  generic += 3 * s.opponent.permanents.filter((p) => p.name === FLUTE && p.named === d.name).length;
  return { colored: cost, generic };
}

/** Every distinct exact payment of {colored, generic} from the pools. */
function payments(s, colored, generic, allowRestricted) {
  const avail = {};
  for (const c of POOL_COLORS) avail[c] = s.pool[c] || 0;
  for (const c of R_COLORS) avail[`r${c}`] = allowRestricted ? (s.restricted[c] || 0) : 0;
  const results = new Map();
  const colors = Object.keys(colored).filter((c) => colored[c] > 0);
  const pay = {};
  const addPay = (k, v) => { if (v) pay[k] = (pay[k] || 0) + v; };
  const subPay = (k, v) => { if (v) { pay[k] -= v; if (!pay[k]) delete pay[k]; } };
  const genRec = (i, left) => {
    if (left === 0) {
      const p = normPayment(pay);
      let k = '';
      for (const key of PAY_KEYS) k += `${p[key] || 0},`;
      if (!results.has(k)) results.set(k, p);
      return;
    }
    if (i >= PAY_KEYS.length) return;
    const k = PAY_KEYS[i];
    const room = avail[k] - (pay[k] || 0);
    for (let t = Math.min(room, left); t >= 0; t--) {
      addPay(k, t);
      genRec(i + 1, left - t);
      subPay(k, t);
    }
  };
  const colRec = (ci) => {
    if (ci === colors.length) { genRec(0, generic); return; }
    const c = colors[ci];
    const need = colored[c];
    const rk = R_COLORS.includes(c) ? `r${c}` : null;
    const rAvail = rk ? avail[rk] : 0;
    for (let j = Math.max(0, need - avail[c]); j <= Math.min(need, rAvail); j++) {
      addPay(c, need - j); if (rk) addPay(rk, j);
      colRec(ci + 1);
      subPay(c, need - j); if (rk) subPay(rk, j);
    }
  };
  colRec(0);
  return [...results.values()];
}

function payDesc(p) {
  const parts = [];
  for (const k of PAY_KEYS) {
    if (!p[k]) continue;
    const sym = k.startsWith('r') ? `${k.slice(1)}(Cavern)` : k;
    parts.push(p[k] > 1 ? `${p[k]}×${sym}` : sym);
  }
  return parts.length ? parts.join(' ') : 'nothing';
}

function spend(s, p) {
  for (const k of PAY_KEYS) {
    if (!p[k]) continue;
    if (k.startsWith('r')) s.restricted[k.slice(1)] -= p[k];
    else s.pool[k] -= p[k];
  }
}

// ---------------------------------------------------------------------------
// Legal actions (§5.2, §8)
// ---------------------------------------------------------------------------

function landCount(s) {
  return s.battlefield.filter((p) => isLandName(p.name)).length;
}

function bfGroups(s, pred) {
  const seen = new Map();
  for (const p of s.battlefield) {
    if (!pred(p)) continue;
    const k = `${p.name}|${!!p.tapped}`;
    if (!seen.has(k)) seen.set(k, { name: p.name, tapped: !!p.tapped });
  }
  return [...seen.values()].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : (a.tapped ? 1 : 0) - (b.tapped ? 1 : 0)));
}

function castTargets(s, d) {
  if (d.name === 'Unearth') {
    const t = sortedUnique(s.graveyard.filter((n) => {
      const c = cardDef(n);
      return has(c, 'creature') && c.mv <= 3;
    }));
    return t.length ? t : null;
  }
  if (d.name === 'Fatal Push') {
    const t = sortedUnique(s.opponent.permanents.filter((p) => OPP_CARDS[p.name].creature && OPP_CARDS[p.name].mv <= 2).map((p) => p.name));
    return t.length ? t : null;
  }
  return [undefined];
}

function castActions(s, name, sorcerySpeed) {
  const d = cardDef(name);
  if (!d.supported || has(d, 'land')) return [];
  const instant = has(d, 'instant');
  if (!instant && !sorcerySpeed) return [];
  const creature = has(d, 'creature');
  if (!creature) {
    if (oppCount(s, SILENCE) > 0 && s.noncreatureCast >= 1) return [];
    if (oppCount(s, TEEG) > 0 && (d.mv >= 4 || d.cost.X)) return [];
  }
  const targets = castTargets(s, d);
  if (!targets) return [];
  const { colored, generic } = castCost(s, d);
  const ct = s.cavernType.toLowerCase();
  const allowR = creature && d.subtypes.some((t) => t.toLowerCase() === ct);
  const pays = payments(s, colored, generic, allowR);
  const out = [];
  for (const target of targets) {
    for (const payment of pays) {
      const a = { type: 'cast', card: name, payment };
      if (target !== undefined) a.target = target;
      a.desc = `Cast ${name}${target !== undefined ? ` targeting ${target}` : ''} (pay ${payDesc(payment)})`;
      out.push(a);
    }
  }
  return out;
}

function cycleActions(s, name) {
  const d = cardDef(name);
  if (!d.supported || !d.cycling) return [];
  if (s.opponent.permanents.some((p) => p.name === FLUTE && p.named === name)) return [];
  const cy = d.cycling;
  if (cy.kind === 'life') {
    if (s.life < cy.n) return [];
    return [{ type: 'cycle', card: name, desc: `Cycle ${name} (pay ${cy.n} life)` }];
  }
  if (cy.kind === 'sacLand') {
    return bfGroups(s, (p) => isLandName(p.name)).map((g) => ({
      type: 'cycle', card: name, sacrifice: { name: g.name, tapped: g.tapped },
      desc: `Cycle ${name} (sacrifice ${g.tapped ? 'tapped' : 'untapped'} ${g.name})`,
    }));
  }
  if (cy.kind === 'mana') {
    return payments(s, {}, cy.generic, false).map((payment) => ({
      type: 'cycle', card: name, payment, desc: `Cycle ${name} (pay ${payDesc(payment)})`,
    }));
  }
  return [];
}

export function legalActions(state) {
  const s = state;
  if (status(s) !== 'ongoing') return [];
  if (s.pendingChoice) {
    return s.pendingChoice.options.map((option, i) => ({ type: 'choose', option, desc: s.pendingChoice.descs[i] }));
  }
  const sorcerySpeed = s.phase === 'main' && !s.pendingTrigger;
  const out = [];
  if (s.pendingTrigger) out.push({ type: 'resolve_oracle', desc: "Resolve Thassa's Oracle trigger" });

  const handNames = sortedUnique(s.hand);
  if (sorcerySpeed && !s.landPlayed) {
    for (const n of handNames) {
      const d = cardDef(n);
      if (has(d, 'land') && d.supported) out.push({ type: 'play_land', card: n, desc: `Play ${n}` });
    }
  }
  for (const n of handNames) out.push(...castActions(s, n, sorcerySpeed));
  for (const n of handNames) out.push(...cycleActions(s, n));

  // Mana abilities.
  for (const g of bfGroups(s, (p) => !p.tapped)) {
    const d = cardDef(g.name);
    if (d.produces) {
      for (const c of d.produces) {
        const what = c.startsWith('r') ? `${c.slice(1)} (Cavern: ${s.cavernType} creature spells only)` : c;
        out.push({ type: 'tap', card: g.name, color: c, desc: `Tap ${g.name} for ${what}` });
      }
    }
  }
  if (s.battlefield.some((p) => p.name === PETAL && !p.tapped)) {
    for (const c of R_COLORS) out.push({ type: 'sac_petal', color: c, desc: `Sacrifice Lotus Petal for ${c}` });
  }
  if (s.battlefield.some((p) => p.name === LED)) {
    for (const c of R_COLORS) out.push({ type: 'activate_led', color: c, desc: `Activate Lion's Eye Diamond for ${c}${c}${c} (discard hand)` });
  }
  // Fetchlands.
  if (s.life >= 1) {
    for (const g of bfGroups(s, (p) => !p.tapped)) {
      const d = cardDef(g.name);
      if (!d.fetchTypes) continue;
      if (s.opponent.permanents.some((p) => p.name === FLUTE && p.named === g.name)) continue;
      const finds = sortedUnique(s.library.filter((n) => {
        const c = cardDef(n);
        return has(c, 'land') && c.subtypes.some((t) => d.fetchTypes.includes(t));
      }));
      for (const f of finds) out.push({ type: 'crack_fetch', card: g.name, find: f, desc: `Crack ${g.name} (pay 1 life) for ${f}` });
      out.push({ type: 'crack_fetch', card: g.name, find: null, desc: `Crack ${g.name} (pay 1 life), find nothing` });
    }
  }
  if (!s.pendingTrigger) {
    if (s.phase === 'main' && s.turn < s.turnsAhead) out.push({ type: 'pass', desc: "Pass the turn (go to the opponent's turn)" });
    if (s.phase === 'opp' && s.turn + 1 <= s.turnsAhead) out.push({ type: 'pass', desc: `Pass to my turn ${s.turn + 1} (untap, draw)` });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Applying actions
// ---------------------------------------------------------------------------

export function applyAction(state, action) {
  if (!action || typeof action !== 'object') throw new Error('Illegal action: not an object.');
  const key = actionKey(action);
  const legal = legalActions(state).find((a) => actionKey(a) === key);
  if (!legal) throw new Error(`Illegal action: ${action.desc || action.type}`);
  return applyLegal(state, legal);
}

/**
 * Apply an action that is known to come from legalActions(state) (no legality
 * check). Exported for the solver, which only applies actions it got from
 * legalActions.
 */
export function applyLegal(state, a) {
  const s = clone(state);
  let outs;
  switch (a.type) {
    case 'pass': outs = doPass(s); break;
    case 'play_land': outs = doPlayLand(s, a); break;
    case 'tap': outs = doTap(s, a); break;
    case 'sac_petal': outs = doPetal(s, a); break;
    case 'activate_led': outs = doLed(s, a); break;
    case 'crack_fetch': outs = doFetch(s, a); break;
    case 'cast': outs = doCast(s, a); break;
    case 'cycle': outs = doCycle(s, a); break;
    case 'resolve_oracle': outs = doResolve(s); break;
    case 'choose': outs = doChoose(s, a); break;
    default: throw new Error(`Unknown action type ${a.type}`);
  }
  for (const o of outs) {
    if (isLost(o.state)) o.state.pendingChoice = null;
  }
  return outs;
}

const one = (s, a) => [{ state: s, label: a.desc }];

function doPass(s) {
  s.pool = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
  s.restricted = { W: 0, U: 0, B: 0, R: 0, G: 0 };
  s.noncreatureCast = 0;
  if (s.phase === 'main') {
    s.phase = 'opp';
    return [{ state: s, label: "Opponent's turn" }];
  }
  s.phase = 'main';
  s.turn += 1;
  for (const p of s.battlefield) p.tapped = false;
  s.landPlayed = false;
  draw(s);
  return [{ state: s, label: `Turn ${s.turn}` }];
}

function enterLand(s, name, tapped) {
  const d = cardDef(name);
  s.battlefield.push({ name, tapped: tapped || d.entersTapped });
  if (d.surveilOnEnter) surveilChoice(s, 'surveil');
}

function doPlayLand(s, a) {
  removeOne(s.hand, a.card);
  s.landPlayed = true;
  enterLand(s, a.card, false);
  return one(s, a);
}

function doTap(s, a) {
  const p = s.battlefield.find((x) => x.name === a.card && !x.tapped);
  p.tapped = true;
  if (a.color.startsWith('r')) s.restricted[a.color.slice(1)] += 1;
  else s.pool[a.color] += 1;
  return one(s, a);
}

function removeFromBattlefield(s, pred) {
  const i = s.battlefield.findIndex(pred);
  const [p] = s.battlefield.splice(i, 1);
  s.graveyard.push(p.name);
}

function doPetal(s, a) {
  removeFromBattlefield(s, (p) => p.name === PETAL && !p.tapped);
  s.pool[a.color] += 1;
  return one(s, a);
}

function doLed(s, a) {
  s.graveyard.push(...s.hand);
  s.hand = [];
  removeFromBattlefield(s, (p) => p.name === LED);
  s.pool[a.color] += 3;
  return one(s, a);
}

function doFetch(s, a) {
  s.life -= 1;
  removeFromBattlefield(s, (p) => p.name === a.card && !p.tapped);
  const find = a.find ?? null;
  if (find) {
    removeOne(s.library, find);
    s.battlefield.push({ name: find, tapped: cardDef(find).entersTapped });
  }
  // Search → battlefield → shuffle → then the ETB (Sewers surveil) in each outcome.
  return shuffleOutcomes(s, [], (o) => {
    if (find && cardDef(find).surveilOnEnter) surveilChoice(o, 'surveil');
  });
}

function doCycle(s, a) {
  removeOne(s.hand, a.card);
  s.graveyard.push(a.card);
  const cy = cardDef(a.card).cycling;
  if (cy.kind === 'life') s.life -= cy.n;
  if (cy.kind === 'sacLand') {
    removeFromBattlefield(s, (p) => p.name === a.sacrifice.name && !!p.tapped === !!a.sacrifice.tapped);
  }
  if (cy.kind === 'mana') spend(s, a.payment);
  draw(s);
  return one(s, a);
}

function devotionToBlue(s) {
  return s.battlefield.reduce((t, p) => t + (cardDef(p.name).cost.U || 0), 0);
}

function doResolve(s) {
  s.pendingTrigger = false;
  const x = devotionToBlue(s);
  const label = "Thassa's Oracle trigger resolves";
  if (x >= s.library.length) {
    s.won = true;
    return [{ state: s, label }];
  }
  if (x > 0) {
    const look = s.library.slice(0, x);
    const names = sortedUnique(look);
    setChoice(s, 'oracle_top', [...names, null],
      [...names.map((n) => `Oracle: keep ${n} on top, the rest to the bottom in random order`),
        'Oracle: put all looked-at cards on the bottom in random order'],
      { x });
  }
  return [{ state: s, label }];
}

function doCast(s, a) {
  const d = cardDef(a.card);
  removeOne(s.hand, a.card);
  spend(s, a.payment);
  const creature = has(d, 'creature');
  if (!creature) s.noncreatureCast += 1;
  // Cavern of Souls: a spell paid with Cavern's colored mana "can't be countered",
  // so Chalice's trigger does nothing to it (reported as a spec gap in REVIEW.md, fixed here).
  const uncounterable = Object.entries(a.payment || {}).some(([k, v]) => k.startsWith('r') && v > 0);
  if (!uncounterable && s.opponent.permanents.some((p) => p.name === CHALICE && p.x === d.mv)) {
    s.graveyard.push(a.card);
    return [{ state: s, label: `${a.card} is countered by Chalice of the Void` }];
  }
  if (creature || has(d, 'artifact')) {
    s.battlefield.push({ name: a.card, tapped: false });
    if (a.card === ORACLE) s.pendingTrigger = true;
    return one(s, a);
  }
  // Instants and sorceries: Flow State checks the graveyard before it goes there.
  const gyHasInstant = s.graveyard.some((n) => has(cardDef(n), 'instant'));
  const gyHasSorcery = s.graveyard.some((n) => has(cardDef(n), 'sorcery'));
  s.graveyard.push(a.card);
  switch (a.card) {
    case 'Dark Ritual':
      s.pool.B += 3;
      break;
    case 'Brainstorm': {
      draw(s); draw(s); draw(s);
      if (!isLost(s)) brainstormChoice(s);
      break;
    }
    case 'Ponder': {
      const look = s.library.slice(0, 3);
      const perms = distinctPermutations(look);
      setChoice(s, 'ponder', [...perms, 'shuffle'],
        [...perms.map((p) => `Ponder: put back ${p.length ? p.join(', ') : '(nothing)'} (top first), then draw`),
          'Ponder: shuffle, then draw']);
      break;
    }
    case 'Consider':
      if (!surveilChoice(s, 'consider')) draw(s);
      break;
    case 'Personal Tutor': {
      const finds = sortedUnique(s.library.filter((n) => has(cardDef(n), 'sorcery')));
      setChoice(s, 'personal_tutor', [...finds, null],
        [...finds.map((n) => `Personal Tutor: find ${n} (shuffle, put it on top)`), 'Personal Tutor: find nothing (shuffle)']);
      break;
    }
    case 'Flow State': {
      const look = s.library.slice(0, 3);
      const k = Math.min(gyHasInstant && gyHasSorcery ? 2 : 1, look.length);
      const options = [];
      const descs = [];
      for (const pick of distinctCombos(look, k)) {
        const rest = [...look];
        for (const n of pick) removeOne(rest, n);
        for (const bottom of distinctPermutations(rest)) {
          options.push({ hand: pick, bottom });
          descs.push(`Flow State: take ${pick.join(' + ')}${bottom.length ? `; bottom ${bottom.join(', ')} (in that order)` : ''}`);
        }
      }
      if (look.length) setChoice(s, 'flow_state', options, descs);
      break;
    }
    case 'Unearth':
      removeOne(s.graveyard, a.target);
      s.battlefield.push({ name: a.target, tapped: false });
      if (a.target === ORACLE) s.pendingTrigger = true;
      break;
    case 'Thoughtseize':
      s.life -= 2;
      break;
    case 'Fatal Push': {
      const i = s.opponent.permanents.findIndex((p) => p.name === a.target);
      s.opponent.permanents.splice(i, 1);
      break;
    }
    case 'Edge of Autumn': {
      if (landCount(s) <= 4) {
        const finds = sortedUnique(s.library.filter((n) => {
          const c = cardDef(n);
          return has(c, 'land') && c.supertypes.includes('basic');
        }));
        setChoice(s, 'edge_search', [...finds, null],
          [...finds.map((n) => `Edge of Autumn: find ${n} (enters tapped), shuffle`), 'Edge of Autumn: find nothing, shuffle']);
      }
      break;
    }
    default:
      break; // Duress and anything without a modelled effect.
  }
  return one(s, a);
}

function brainstormChoice(s) {
  const options = [];
  if (s.hand.length >= 2) {
    const names = sortedUnique(s.hand);
    const c = countBy(s.hand);
    for (const a of names) for (const b of names) {
      if (a === b && c.get(a) < 2) continue;
      options.push([a, b]);
    }
  } else if (s.hand.length === 1) {
    options.push([s.hand[0]]);
  }
  setChoice(s, 'brainstorm', options, options.map((o) => `Brainstorm: put back ${o.join(', then ')} (${o.length > 1 ? 'first = top' : 'on top'})`));
}

function doChoose(s, a) {
  const pc = s.pendingChoice;
  // Actions from legalActions carry the option object itself; fall back to a
  // structural match for options rebuilt by the caller (e.g. from JSON).
  let opt = pc.options.includes(a.option) ? a.option : undefined;
  if (opt === undefined) {
    const k = stable(a.option);
    opt = pc.options.find((o) => stable(o) === k);
  }
  s.pendingChoice = null;
  const label = a.desc;
  switch (pc.kind) {
    case 'surveil':
    case 'consider':
      if (opt === 'graveyard') s.graveyard.push(s.library.shift());
      if (pc.kind === 'consider') draw(s);
      return [{ state: s, label }];
    case 'brainstorm':
      for (const n of opt) removeOne(s.hand, n);
      s.library = [...opt, ...s.library];
      return [{ state: s, label }];
    case 'ponder':
      if (opt === 'shuffle') return shuffleOutcomes(s, [], (o) => draw(o));
      s.library = [...opt, ...s.library.slice(opt.length)];
      draw(s);
      return [{ state: s, label }];
    case 'personal_tutor':
      if (opt === null) return shuffleOutcomes(s);
      removeOne(s.library, opt);
      return shuffleOutcomes(s, [opt]);
    case 'edge_search':
      if (opt !== null) {
        removeOne(s.library, opt);
        s.battlefield.push({ name: opt, tapped: true });
      }
      return shuffleOutcomes(s);
    case 'flow_state': {
      const n = opt.hand.length + opt.bottom.length;
      s.library = [...s.library.slice(n), ...opt.bottom];
      s.hand.push(...opt.hand);
      return [{ state: s, label }];
    }
    case 'oracle_top': {
      const look = s.library.slice(0, pc.x);
      const rest = s.library.slice(pc.x);
      const top = [];
      if (opt !== null) { removeOne(look, opt); top.push(opt); }
      return distinctPermutations(look).map((perm) => {
        const o = clone(s);
        o.library = [...top, ...rest, ...perm];
        return { state: o, label: `bottom: ${perm.join(', ')}` };
      });
    }
    default:
      throw new Error(`Unknown choice kind ${pc.kind}`);
  }
}

// ---------------------------------------------------------------------------
// State identity (§8)
// ---------------------------------------------------------------------------

const sortedJoin = (arr) => [...arr].sort().join('\u0001');

/** Equal for game-identical states: ignores hand, graveyard, exile and battlefield order. */
export function stateKey(s) {
  return [
    s.library.join('\u0001'),
    sortedJoin(s.hand),
    sortedJoin(s.graveyard),
    sortedJoin(s.exile),
    sortedJoin(s.battlefield.map((p) => `${p.name}|${p.tapped ? 1 : 0}`)),
    s.life,
    POOL_COLORS.map((c) => s.pool[c] || 0).join(','),
    R_COLORS.map((c) => s.restricted[c] || 0).join(','),
    s.phase, s.turn, s.landPlayed ? 1 : 0, s.noncreatureCast, s.pendingTrigger ? 1 : 0,
    s.pendingChoice ? stable(s.pendingChoice) : '-',
    sortedJoin(s.opponent.permanents.map(stable)),
    s.turnsAhead, s.cavernType, s.drewEmpty ? 1 : 0, s.won ? 1 : 0,
  ].join('\u0002');
}

export { actionKey as _actionKey };
