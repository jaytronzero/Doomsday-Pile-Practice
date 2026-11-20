// Game engine (SPEC §3–§8, SPEC_V2 + SPEC_V2_API). Pure: no DOM, no randomness,
// inputs never mutated.
//
// v2 structure. An action is applied to a working copy of the state wrapped in a
// "branch" P = { s, adv: [entries], advDesc: [strings], lab: [label parts] }.
// Steps that the adversary (or randomness) can split return arrays of branches.
// Adversary windows (API §8.1) are run by runWindow(): the "do nothing" branch
// continues with the window's continuation; every adversary option is applied to
// its own fork and the window reopens (except W-oracle). When an adversary action
// leaves ME a choice (pay_or_not, ghost_quarter) the branch stops there; the choice
// records which window to reopen when it is made, and my spell or ability that
// is still waiting is kept in `state.stack`.
import { cardDef } from './cards.js';
import { OPP_CARDS } from './oppCards.js';
import { MODELLED_HAND_CARDS, MODELLED_PERMANENTS, parseCost, oppCardColors } from './opponent.js';

const ORACLE = "Thassa's Oracle";
const PETAL = 'Lotus Petal';
const LED = "Lion's Eye Diamond";
const POOL_COLORS = ['W', 'U', 'B', 'R', 'G', 'C'];
const R_COLORS = ['W', 'U', 'B', 'R', 'G'];
const PAY_KEYS = [...POOL_COLORS, ...R_COLORS.map((c) => `r${c}`)];

// Opponent permanents (v1).
const SILENCE = 'Deafening Silence';
const THALIA = 'Thalia, Guardian of Thraben';
const TEEG = 'Gaddock Teeg';
const CHALICE = 'Chalice of the Void';
const FLUTE = 'Disruptor Flute';
// Opponent permanents (v2).
const THORN = 'Thorn of Amethyst';
const SPHERE = 'Sphere of Resistance';
const TRINI = 'Trinisphere';
const DAMPING = 'Damping Sphere';
const ARCHON = 'Archon of Emeria';
const NEEDLE = 'Pithing Needle';
const OUPHE = 'Collector Ouphe';
const KARN = 'Karn, the Great Creator';
const CAGE = "Grafdigger's Cage";
const TORPOR = 'Torpor Orb';
const TEFERI = 'Teferi, Time Raveler';
const NARSET = 'Narset, Parter of Veils';
const HULL = 'Hullbreacher';
const BOWMASTERS = 'Orcish Bowmasters';
const BLOOD_MOON = 'Blood Moon';
const MAGUS = 'Magus of the Moon';
const B2B = 'Back to Basics';
const CRYPT = "Tormod's Crypt";
const WASTELAND = 'Wasteland';
const GQ = 'Ghost Quarter';
const VOICE = 'Voice of Victory';
const VOIDWALKER = 'Dauthi Voidwalker';
const GUIDE = 'Goblin Guide';
const ORC_ARMY = 'Orc Army';
const SOLITUDE = 'Solitude';
const ENDURANCE = 'Endurance';

const HAND_SET = new Set(MODELLED_HAND_CARDS);
const PERM_SET = new Set(MODELLED_PERMANENTS);
const DISCARD_SPELLS = new Set(['Thoughtseize', 'Duress', 'Inquisition of Kozilek', 'Unmask', 'Cabal Therapy', 'Collective Brutality']);
const PARSED = new Map();
const oppCost = (name) => {
  let p = PARSED.get(name);
  if (!p) { p = parseCost(OPP_CARDS[name].cost); PARSED.set(name, p); }
  return p;
};
const oppCard = (name) => (Object.prototype.hasOwnProperty.call(OPP_CARDS, name) ? OPP_CARDS[name] : null);

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

const has = (d, t) => d.types.includes(t);
const isLandName = (n) => has(cardDef(n), 'land');
const isBasic = (n) => cardDef(n).supertypes.includes('basic');
const isNonbasicLand = (n) => isLandName(n) && !isBasic(n);

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
  if (rest.type === 'choose' && rest.option && typeof rest.option === 'object' && rest.option.pay) {
    rest.option = { ...rest.option, pay: normPayment(rest.option.pay) };
  }
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

function clonePerm(p) {
  return { ...p };
}

function clone(s) {
  return {
    library: [...s.library],
    hand: [...s.hand],
    graveyard: [...s.graveyard],
    exile: [...s.exile],
    battlefield: s.battlefield.map((p) => (p.damage ? { name: p.name, tapped: !!p.tapped, damage: p.damage } : { name: p.name, tapped: !!p.tapped })),
    life: s.life,
    pool: { ...s.pool },
    restricted: { ...s.restricted },
    phase: s.phase,
    turn: s.turn,
    landPlayed: s.landPlayed,
    noncreatureCast: s.noncreatureCast,
    pendingTrigger: s.pendingTrigger,
    pendingChoice: s.pendingChoice,
    opponent: { permanents: s.opponent.permanents.map(clonePerm) },
    turnsAhead: s.turnsAhead,
    cavernType: s.cavernType,
    drewEmpty: s.drewEmpty,
    won: s.won,
    opp: {
      hand: [...s.opp.hand],
      handSize: s.opp.handSize,
      manaAvailable: s.opp.manaAvailable,
      landsTotal: s.opp.landsTotal,
      colors: s.opp.colors,
      life: s.opp.life,
      treasures: s.opp.treasures,
      spellsCast: s.opp.spellsCast,
      pacts: [...s.opp.pacts],
      lost: s.opp.lost,
    },
    warnings: s.warnings,
    spellsCast: s.spellsCast,
    drawsThisTurn: s.drawsThisTurn,
    pendingOppSpell: s.pendingOppSpell,
    stack: s.stack,
  };
}

// --- branches ---------------------------------------------------------------
const branch = (s) => ({ s, adv: [], advDesc: [], lab: [] });
const fork = (P) => ({ s: clone(P.s), adv: [...P.adv], advDesc: [...P.advDesc], lab: [...P.lab] });
/** Apply f to every branch (f returns an array of branches). */
const each = (Ps, f) => {
  const out = [];
  for (const P of Ps) for (const Q of f(P)) out.push(Q);
  return out;
};

// --- opponent board queries ---------------------------------------------------
const oppCount = (s, name) => {
  let n = 0;
  for (const p of s.opponent.permanents) if (p.name === name) n += 1;
  return n;
};
const oppHas = (s, name) => s.opponent.permanents.some((p) => p.name === name);
const moon = (s) => oppHas(s, BLOOD_MOON) || oppHas(s, MAGUS);
const namedBy = (s, card, name) => s.opponent.permanents.some((p) => p.name === card && p.named === name);
const abilityLocked = (s, name) => namedBy(s, FLUTE, name) || namedBy(s, NEEDLE, name);

function isLost(s) {
  return s.life <= 0 || s.drewEmpty;
}
const over = (s) => isLost(s) || s.won || s.opp.lost;

/** Every card of mine that would go to my graveyard (Dauthi Voidwalker: exile instead). */
function toGraveyard(s, name) {
  if (oppHas(s, VOIDWALKER)) s.exile.push(name);
  else s.graveyard.push(name);
}

/** Shuffle P's library: one branch per distinct ordering. `prefix` stays on top. */
function shuffleB(P, prefix = []) {
  const perms = distinctPermutations(P.s.library);
  return perms.map((perm, i) => {
    const Q = i === perms.length - 1 ? P : fork(P);
    Q.s.library = [...prefix, ...perm];
    Q.lab.push(`library: ${Q.s.library.length ? Q.s.library.join(', ') : '(empty)'}`);
    return Q;
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
// Setup / Doomsday resolution (§3, §4; API §2)
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
  const o = setup.opponent ?? {};
  if (typeof o !== 'object' || Array.isArray(o)) throw new Error('opponent must be an object.');
  const opp = o.permanents ?? [];
  if (!Array.isArray(opp)) throw new Error('opponent.permanents must be an array.');
  const oppHand = names(o.hand, 'opponent.hand');
  const lands = o.lands ?? { untapped: 0, total: 0, colors: '' };
  const nc = setup.noncreatureSpellsCastThisTurn ?? 1;
  return {
    deck,
    hand: names(setup.hand, 'hand'),
    battlefield,
    graveyard: names(setup.graveyard, 'graveyard'),
    exile: names(setup.exile, 'exile'),
    pool,
    lifeBeforeDoomsday: setup.lifeBeforeDoomsday ?? 20,
    landPlayedThisTurn: !!(setup.landPlayedThisTurn ?? false),
    noncreatureSpellsCastThisTurn: nc,
    spellsCastThisTurn: setup.spellsCastThisTurn ?? nc,
    cardsDrawnThisTurn: setup.cardsDrawnThisTurn ?? 1,
    cavernType: String(setup.cavernType ?? 'Merfolk'),
    opponent: opp,
    oppHand,
    oppHandSize: o.handSize ?? oppHand.length,
    oppLands: lands,
    oppLife: o.life ?? 20,
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
  if (!isNonNegInt(n.spellsCastThisTurn)) throw new Error('spellsCastThisTurn must be a whole number ≥ 0.');
  if (!isNonNegInt(n.cardsDrawnThisTurn)) throw new Error('cardsDrawnThisTurn must be a whole number ≥ 0.');
  for (const p of n.opponent) {
    if (!p || typeof p !== 'object' || typeof p.name !== 'string' || !p.name) {
      throw new Error(`Opponent permanents need a name (got ${JSON.stringify(p)}).`);
    }
    if (p.name === CHALICE && !isNonNegInt(p.x)) throw new Error('Chalice of the Void needs an integer x ≥ 0.');
    if (p.name === FLUTE && !(typeof p.named === 'string' && p.named)) throw new Error('Disruptor Flute needs a card name in "named".');
    if (p.name === NEEDLE && !(typeof p.named === 'string' && p.named)) throw new Error('Pithing Needle needs a card name in "named".');
    if (p.power !== undefined && !isNonNegInt(p.power)) throw new Error(`${p.name}: power must be a whole number ≥ 0 (got ${show(p.power)}).`);
  }
  for (const h of n.oppHand) {
    if (!HAND_SET.has(h)) throw new Error(`Opponent hand card ${JSON.stringify(h)} is not modelled. Modelled: ${MODELLED_HAND_CARDS.join(', ')}.`);
  }
  if (!(isNonNegInt(n.oppHandSize) && n.oppHandSize >= n.oppHand.length)) {
    throw new Error(`opponent.handSize must be a whole number ≥ the number of hand cards (${n.oppHand.length}); got ${show(n.oppHandSize)}.`);
  }
  const L = n.oppLands;
  if (!L || typeof L !== 'object' || Array.isArray(L)) throw new Error('opponent.lands must be an object {untapped, total, colors}.');
  const untapped = L.untapped ?? 0;
  const total = L.total ?? 0;
  const colors = L.colors ?? '';
  if (!isNonNegInt(untapped) || !isNonNegInt(total) || untapped > total) {
    throw new Error(`opponent.lands needs whole numbers 0 ≤ untapped ≤ total (got ${show(untapped)}, ${show(total)}).`);
  }
  if (typeof colors !== 'string' || !/^[WUBRGC]*$/.test(colors) || new Set(colors).size !== colors.length) {
    throw new Error(`opponent.lands.colors must be distinct letters from WUBRGC (got ${JSON.stringify(colors)}).`);
  }
  if (!(Number.isInteger(n.oppLife) && n.oppLife >= 1)) throw new Error(`opponent.life must be a whole number ≥ 1 (got ${show(n.oppLife)}).`);
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

function makeWarnings(perms) {
  const out = [];
  const seen = new Set();
  for (const p of perms) {
    if (seen.has(p.name)) continue;
    const c = oppCard(p.name);
    if (PERM_SET.has(p.name) || p.name === ORC_ARMY) {
      // modelled
    } else if (c && c.types.includes('creature')) {
      // only its attack matters, and that is modelled (API §5 step 4)
    } else {
      seen.add(p.name);
      out.push(`Opponent permanent '${p.name}' not modelled: ignored${p.power !== undefined ? ` (it attacks for ${p.power})` : ''}`);
      continue;
    }
    if (c && c.types.includes('creature') && typeof c.power !== 'number' && p.power === undefined) {
      seen.add(p.name);
      out.push(`Opponent creature '${p.name}' has variable power (${c.power}) and no scenario power: it attacks for 0`);
    }
  }
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
    const o = {};
    for (const [k, v] of Object.entries(p)) if (v !== undefined) o[k] = v;
    return o;
  });
  const voidwalker = opp.some((p) => p.name === VOIDWALKER);
  const L = n.oppLands;
  return {
    library: [...pile],
    hand: [...n.hand],
    graveyard: voidwalker ? [] : ['Doomsday'],
    exile: [...n.exile, ...exiled, ...(voidwalker ? ['Doomsday'] : [])],
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
    opp: {
      hand: [...n.oppHand],
      handSize: n.oppHandSize,
      manaAvailable: L.untapped ?? 0,
      landsTotal: L.total ?? 0,
      colors: L.colors ?? '',
      life: n.oppLife,
      treasures: 0,
      spellsCast: 0,
      pacts: [], // turn numbers of the opponent turns whose upkeep is due a Pact payment
      lost: false,
    },
    warnings: makeWarnings(opp),
    spellsCast: n.spellsCastThisTurn,
    drawsThisTurn: n.cardsDrawnThisTurn,
    pendingOppSpell: null,
    stack: null, // my spell or ability waiting while an adversary window is open
  };
}

// ---------------------------------------------------------------------------
// Status (§5.5, API §10)
// ---------------------------------------------------------------------------

export function status(state) {
  if (isLost(state)) return 'loss';
  if (state.won || (state.opp && state.opp.lost)) return 'win';
  return 'ongoing';
}

// ---------------------------------------------------------------------------
// Costs and payments (§5.4, §6; API §4)
// ---------------------------------------------------------------------------

/** Total cost {colored, generic} of casting card def `d` now. */
function castCost(s, d) {
  const creature = has(d, 'creature');
  const cost = { ...d.cost };
  let generic = cost.generic || 0;
  delete cost.generic;
  delete cost.X;
  let thalia = 0; let flute = 0; let thorn = 0; let sphere = 0; let damping = 0; let trini = false;
  for (const p of s.opponent.permanents) {
    switch (p.name) {
      case THALIA: thalia += 1; break;
      case FLUTE: if (p.named === d.name) flute += 1; break;
      case THORN: thorn += 1; break;
      case SPHERE: sphere += 1; break;
      case DAMPING: damping += 1; break;
      case TRINI: if (p.tapped !== true) trini = true; break;
      default: break;
    }
  }
  if (!creature) generic += thalia + thorn;
  generic += 3 * flute + sphere + damping * s.spellsCast;
  if (trini) {
    const total = generic + Object.values(cost).reduce((a, b) => a + b, 0);
    if (total < 3) generic += 3 - total;
  }
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
// Legal actions (§5.2, §8; API §4, §8.6, §9)
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

/** Opponent creatures my Fatal Push may target (MV ≤ 2 per OPP_CARDS; Orc Army tokens have MV 0). */
function pushable(p) {
  if (p.name === ORC_ARMY) return true;
  const c = oppCard(p.name);
  return !!(c && c.types.includes('creature') && c.mv <= 2);
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
    const t = sortedUnique(s.opponent.permanents.filter(pushable).map((p) => p.name));
    return t.length ? t : null;
  }
  return [undefined];
}

/** Sorcery timing: my main phase, nothing waiting (v1 §5.2 + pendingOppSpell). */
const sorceryTiming = (s) => s.phase === 'main' && !s.pendingTrigger && !s.pendingChoice && !s.pendingOppSpell && !s.stack;

function castActions(s, name) {
  const d = cardDef(name);
  if (!d.supported || has(d, 'land')) return [];
  const sorc = sorceryTiming(s);
  if (!has(d, 'instant') && !sorc) return [];
  if (!sorc && oppHas(s, TEFERI)) return [];
  if (s.phase === 'opp' && oppHas(s, VOICE)) return [];
  if (s.spellsCast >= 1 && oppHas(s, ARCHON)) return [];
  const creature = has(d, 'creature');
  if (!creature) {
    if (oppHas(s, SILENCE) && s.noncreatureCast >= 1) return [];
    if (oppHas(s, TEEG) && (d.mv >= 4 || d.cost.X)) return [];
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
  if (abilityLocked(s, name)) return [];
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

/** Colors a land of mine taps for now (Blood Moon / Magus: nonbasics tap for R only). */
function landColors(s, name) {
  const d = cardDef(name);
  if (!d.produces) return null;
  if (isNonbasicLand(name) && moon(s)) return ['R'];
  return d.produces;
}

function manaActions(s) {
  const out = [];
  for (const g of bfGroups(s, (p) => !p.tapped)) {
    const cols = landColors(s, g.name);
    if (cols) {
      for (const c of cols) {
        const what = c.startsWith('r') ? `${c.slice(1)} (Cavern: ${s.cavernType} creature spells only)` : c;
        out.push({ type: 'tap', card: g.name, color: c, desc: `Tap ${g.name} for ${what}` });
      }
    }
  }
  const artifactsLocked = oppHas(s, OUPHE) || oppHas(s, KARN);
  if (!artifactsLocked && s.battlefield.some((p) => p.name === PETAL && !p.tapped)) {
    for (const c of R_COLORS) out.push({ type: 'sac_petal', color: c, desc: `Sacrifice Lotus Petal for ${c}` });
  }
  if (!artifactsLocked && s.battlefield.some((p) => p.name === LED)) {
    for (const c of R_COLORS) out.push({ type: 'activate_led', color: c, desc: `Activate Lion's Eye Diamond for ${c}${c}${c} (discard hand)` });
  }
  return out;
}

function choiceActions(s) {
  const pc = s.pendingChoice;
  if (pc.kind === 'pay_or_not') {
    const out = [{ type: 'choose', option: 'decline', desc: `Don't pay for ${pc.card}: my spell is countered` }];
    for (const payment of payments(s, {}, pc.amount, false)) {
      out.push({ type: 'choose', option: { pay: payment }, desc: `Pay ${payDesc(payment)} for ${pc.card}` });
    }
    // Mana abilities may be activated while paying (API §9).
    out.push(...manaActions(s));
    return out;
  }
  return pc.options.map((option, i) => ({ type: 'choose', option, desc: pc.descs[i] }));
}

export function legalActions(state) {
  const s = state;
  if (status(s) !== 'ongoing') return [];
  if (s.pendingChoice) return choiceActions(s);
  const sorcerySpeed = sorceryTiming(s);
  const out = [];
  if (s.pendingTrigger) out.push({ type: 'resolve_oracle', desc: "Resolve Thassa's Oracle trigger" });
  if (s.pendingOppSpell) out.push({ type: 'resolve_opp_spell', desc: `Let the opponent's ${s.pendingOppSpell.card} resolve` });

  const handNames = sortedUnique(s.hand);
  if (sorcerySpeed && !s.landPlayed) {
    for (const n of handNames) {
      const d = cardDef(n);
      if (has(d, 'land') && d.supported) out.push({ type: 'play_land', card: n, desc: `Play ${n}` });
    }
  }
  for (const n of handNames) out.push(...castActions(s, n));
  for (const n of handNames) out.push(...cycleActions(s, n));

  out.push(...manaActions(s));
  // Fetchlands (Blood Moon / Magus: they are Mountains with no ability).
  if (s.life >= 1 && !moon(s)) {
    for (const g of bfGroups(s, (p) => !p.tapped)) {
      const d = cardDef(g.name);
      if (!d.fetchTypes) continue;
      if (abilityLocked(s, g.name)) continue;
      const finds = sortedUnique(s.library.filter((n) => {
        const c = cardDef(n);
        return has(c, 'land') && c.subtypes.some((t) => d.fetchTypes.includes(t));
      }));
      for (const f of finds) out.push({ type: 'crack_fetch', card: g.name, find: f, desc: `Crack ${g.name} (pay 1 life) for ${f}` });
      out.push({ type: 'crack_fetch', card: g.name, find: null, desc: `Crack ${g.name} (pay 1 life), find nothing` });
    }
  }
  if (!s.pendingTrigger && !s.pendingOppSpell) {
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
  const P = branch(clone(state));
  let outs;
  switch (a.type) {
    case 'pass': outs = doPass(P); break;
    case 'play_land': outs = doPlayLand(P, a); break;
    case 'tap': outs = [doTap(P, a)]; break;
    case 'sac_petal': outs = [doPetal(P, a)]; break;
    case 'activate_led': outs = [doLed(P, a)]; break;
    case 'crack_fetch': outs = doFetch(P, a); break;
    case 'cast': outs = doCast(P, a); break;
    case 'cycle': outs = doCycle(P, a); break;
    case 'resolve_oracle': outs = doResolveOracle(P); break;
    case 'resolve_opp_spell': outs = doResolveOppSpell(P); break;
    case 'choose': outs = doChoose(P, a); break;
    default: throw new Error(`Unknown action type ${a.type}`);
  }
  return outs.map((Q) => {
    const s = Q.s;
    if (isLost(s)) { s.pendingChoice = null; s.stack = null; s.pendingOppSpell = null; }
    const base = Q.lab.length ? Q.lab : [a.desc];
    const o = { state: s, label: [...Q.advDesc, ...base].join(' | ') };
    if (Q.adv.length) o.adversary = Q.adv;
    return o;
  });
}

// --- my draws (API §6) --------------------------------------------------------

/** One draw of mine. `drawStep`: the first draw of my draw step. */
function drawOne(P, drawStep = false) {
  const s = P.s;
  if (over(s)) return [P];
  if (oppHas(s, NARSET) && s.drawsThisTurn >= 1) return [P];
  if (!drawStep && oppHas(s, HULL)) { s.opp.treasures += 1; return [P]; }
  if (s.library.length === 0) { s.drewEmpty = true; return [P]; }
  s.hand.push(s.library.shift());
  s.drawsThisTurn += 1;
  if (drawStep) return [P];
  let Ps = [P];
  const bows = oppCount(s, BOWMASTERS);
  for (let i = 0; i < bows; i++) Ps = each(Ps, (Q) => bowPing(Q));
  return Ps;
}

function drawN(P, n) {
  let Ps = [P];
  for (let i = 0; i < n; i++) Ps = each(Ps, (Q) => drawOne(Q));
  return Ps;
}

const oraclePending = (s) => s.pendingTrigger && s.battlefield.some((p) => p.name === ORACLE);

function killOracle(s, zone) {
  const i = s.battlefield.findIndex((p) => p.name === ORACLE);
  s.battlefield.splice(i, 1);
  if (zone === 'exile') s.exile.push(ORACLE);
  else if (zone === 'hand') s.hand.push(ORACLE);
  else toGraveyard(s, ORACLE);
}

/** A Bowmasters trigger: 1 damage to a target the adversary picks, then amass Orcs 1. */
function bowPing(P) {
  if (over(P.s)) return [P];
  const targets = ['me'];
  if (oraclePending(P.s)) targets.push(ORACLE);
  return targets.map((t, i) => {
    const Q = i === targets.length - 1 ? P : fork(P);
    const s = Q.s;
    if (t === 'me') s.life -= 1;
    else {
      const o = s.battlefield.find((p) => p.name === ORACLE);
      o.damage = (o.damage || 0) + 1;
      if (o.damage >= 3) killOracle(s, 'graveyard');
    }
    amass(s);
    Q.adv.push({ card: BOWMASTERS, mode: 'ping', target: t });
    Q.advDesc.push(`Opponent: Orcish Bowmasters pings ${t === 'me' ? 'me' : t}`);
    return Q;
  });
}

function amass(s) {
  const army = s.opponent.permanents.find((p) => p.name === ORC_ARMY);
  if (army) {
    army.power = (army.power || 0) + 1;
    army.toughness = (army.toughness || 0) + 1;
  } else s.opponent.permanents.push({ name: ORC_ARMY, power: 1, toughness: 1 });
}

// --- turn structure (API §5) -------------------------------------------------

function attackPower(p) {
  if (Number.isInteger(p.power)) return p.power;
  const c = oppCard(p.name);
  if (c && c.types.includes('creature') && typeof c.power === 'number') return c.power;
  return 0;
}

function newTurnCounters(s) {
  s.noncreatureCast = 0;
  s.spellsCast = 0;
  s.drawsThisTurn = 0;
  s.opp.spellsCast = 0;
  for (const p of s.battlefield) if (p.damage) delete p.damage;
  s.opp.manaAvailable = s.opp.landsTotal;
}

/** Opponent mana payment (API §8.2): returns null if unaffordable, else the spend. */
function oppManaPlan(s, cost, xValue = 0) {
  const o = s.opp;
  const colors = o.colors;
  let total = cost.generic + xValue;
  let treasureNeed = 0;
  let life = 0;
  for (const c of POOL_COLORS) {
    const k = cost.colored[c];
    if (!k) continue;
    total += k;
    if (!colors.includes(c)) {
      if (c === 'C') return null; // Treasures make coloured mana only
      treasureNeed += k;
    }
  }
  for (const [a, b] of cost.hybrid) {
    total += 1;
    if (!colors.includes(a) && !colors.includes(b)) treasureNeed += 1;
  }
  let lifeLeft = o.life;
  for (const c of R_COLORS) {
    for (let i = 0; i < cost.phyrexian[c]; i++) {
      if (lifeLeft > 2) { lifeLeft -= 2; life += 2; } else {
        total += 1;
        if (!colors.includes(c)) treasureNeed += 1;
      }
    }
  }
  if (treasureNeed > o.treasures) return null;
  if (total > o.manaAvailable + o.treasures) return null;
  const fromLands = Math.min(o.manaAvailable, total - treasureNeed);
  return { lands: fromLands, treasures: total - fromLands, life };
}

function payPact(s) {
  const plan = oppManaPlan(s, { generic: 3, colored: { W: 0, U: 2, B: 0, R: 0, G: 0, C: 0 }, hybrid: [], phyrexian: { W: 0, U: 0, B: 0, R: 0, G: 0 } });
  if (!plan) return false;
  s.opp.manaAvailable -= plan.lands;
  s.opp.treasures -= plan.treasures;
  return true;
}

function doPass(P) {
  const s = P.s;
  s.pool = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
  s.restricted = { W: 0, U: 0, B: 0, R: 0, G: 0 };
  if (s.phase === 'main') {
    s.phase = 'opp';
    newTurnCounters(s);
    P.lab.push("Opponent's turn");
    // Pact of Negation upkeeps (API §8.5).
    const due = s.opp.pacts.filter((t) => t === s.turn);
    if (due.length) {
      s.opp.pacts = s.opp.pacts.filter((t) => t !== s.turn);
      for (let i = 0; i < due.length && !s.opp.lost; i++) if (!payPact(s)) s.opp.lost = true;
      if (s.opp.lost) return [P];
    }
    // Combat: Goblin Guide triggers, then damage.
    let dmg = 0;
    for (const p of s.opponent.permanents) {
      if (p.name === GUIDE && s.library.length && isLandName(s.library[0])) s.hand.push(s.library.shift());
      dmg += attackPower(p);
    }
    s.life -= dmg;
    if (isLost(s)) return [P];
    return runWindow(P, 'oppturn');
  }
  s.phase = 'main';
  s.turn += 1;
  const b2b = oppHas(s, B2B);
  for (const p of s.battlefield) if (!(b2b && isNonbasicLand(p.name))) p.tapped = false;
  s.landPlayed = false;
  newTurnCounters(s);
  P.lab.push(`Turn ${s.turn}`);
  return runWindow(P, 'myturn');
}

// --- lands and mana -------------------------------------------------------------

/** A land of mine enters (played, fetched): tapped per its text / Archon; Sewers' surveil trigger. */
function enterLand(P, name, tapped) {
  const s = P.s;
  const d = cardDef(name);
  const m = moon(s) && !isBasic(name);
  const t = !!tapped || (d.entersTapped && !m) || (oppHas(s, ARCHON) && !isBasic(name));
  s.battlefield.push({ name, tapped: t });
  if (d.surveilOnEnter && !m) {
    s.stack = { ability: 'surveil', card: name };
    return runWindow(P, 'ability');
  }
  return [P];
}

function doPlayLand(P, a) {
  removeOne(P.s.hand, a.card);
  P.s.landPlayed = true;
  return enterLand(P, a.card, false);
}

function doTap(P, a) {
  const s = P.s;
  const p = s.battlefield.find((x) => x.name === a.card && !x.tapped);
  p.tapped = true;
  if (a.color.startsWith('r')) s.restricted[a.color.slice(1)] += 1;
  else s.pool[a.color] += 1;
  return P;
}

function removeFromBattlefield(s, pred) {
  const i = s.battlefield.findIndex(pred);
  const [p] = s.battlefield.splice(i, 1);
  toGraveyard(s, p.name);
}

function doPetal(P, a) {
  removeFromBattlefield(P.s, (p) => p.name === PETAL && !p.tapped);
  P.s.pool[a.color] += 1;
  return P;
}

function doLed(P, a) {
  const s = P.s;
  for (const n of s.hand) toGraveyard(s, n);
  s.hand = [];
  removeFromBattlefield(s, (p) => p.name === LED);
  s.pool[a.color] += 3;
  return P;
}

function doFetch(P, a) {
  const s = P.s;
  s.life -= 1;
  removeFromBattlefield(s, (p) => p.name === a.card && !p.tapped);
  s.stack = { ability: 'fetch', card: a.card, find: a.find ?? null };
  return runWindow(P, 'ability');
}

function resolveFetch(P) {
  const s = P.s;
  const find = s.stack.find;
  s.stack = null;
  // The land may have been exiled from my library in response (Surgical): then nothing is found.
  const found = find && s.library.includes(find) ? find : null;
  if (found) removeOne(s.library, found);
  // Search → battlefield → shuffle (AND outcomes) → then the ETB in each outcome.
  if (!found) return shuffleB(P);
  const d = cardDef(found);
  const m = moon(s) && !isBasic(found);
  const tapped = (d.entersTapped && !m) || (oppHas(s, ARCHON) && !isBasic(found));
  s.battlefield.push({ name: found, tapped });
  const Ps = shuffleB(P);
  if (!d.surveilOnEnter || m) return Ps;
  return each(Ps, (Q) => {
    Q.s.stack = { ability: 'surveil', card: found };
    return runWindow(Q, 'ability');
  });
}

function doCycle(P, a) {
  const s = P.s;
  removeOne(s.hand, a.card);
  toGraveyard(s, a.card);
  const cy = cardDef(a.card).cycling;
  if (cy.kind === 'life') s.life -= cy.n;
  if (cy.kind === 'sacLand') {
    removeFromBattlefield(s, (p) => p.name === a.sacrifice.name && !!p.tapped === !!a.sacrifice.tapped);
  }
  if (cy.kind === 'mana') spend(s, a.payment);
  s.stack = { ability: 'cycle', card: a.card };
  return runWindow(P, 'ability');
}

/** Resolve the ability waiting in s.stack (after W-ability). */
function resolveAbility(P) {
  const st = P.s.stack;
  if (!st) return [P]; // countered (Stifle / Consign)
  if (st.ability === 'cycle') { P.s.stack = null; return drawOne(P); }
  if (st.ability === 'fetch') return resolveFetch(P);
  if (st.ability === 'surveil') { P.s.stack = null; surveilChoice(P.s, 'surveil'); return [P]; }
  throw new Error(`internal: unknown ability ${st.ability}`);
}

// --- Oracle --------------------------------------------------------------------

function devotionToBlue(s) {
  return s.battlefield.reduce((t, p) => t + (cardDef(p.name).cost.U || 0), 0);
}

function doResolveOracle(P) {
  return runWindow(P, 'oracle');
}

function resolveOracleTrigger(P) {
  const s = P.s;
  s.pendingTrigger = false;
  const x = devotionToBlue(s);
  P.lab.push("Thassa's Oracle trigger resolves");
  if (x >= s.library.length) {
    s.won = true;
    return [P];
  }
  if (x > 0) {
    const look = s.library.slice(0, x);
    const names = sortedUnique(look);
    setChoice(s, 'oracle_top', [...names, null],
      [...names.map((n) => `Oracle: keep ${n} on top, the rest to the bottom in random order`),
        'Oracle: put all looked-at cards on the bottom in random order'],
      { x });
  }
  return [P];
}

/** A creature card of mine enters the battlefield. */
function creatureEnters(s, name) {
  s.battlefield.push({ name, tapped: false });
  if (name === ORACLE && !oppHas(s, TORPOR)) s.pendingTrigger = true;
}

// --- casting -------------------------------------------------------------------

function doCast(P, a) {
  const s = P.s;
  const d = cardDef(a.card);
  removeOne(s.hand, a.card);
  spend(s, a.payment);
  s.spellsCast += 1;
  const creature = has(d, 'creature');
  if (!creature) s.noncreatureCast += 1;
  // Cavern of Souls: a spell paid with Cavern's colored mana "can't be countered",
  // so Chalice's trigger does nothing to it (v1 REVIEW fix).
  const prot = Object.entries(a.payment || {}).some(([k, v]) => k.startsWith('r') && v > 0);
  if (!prot && s.opponent.permanents.some((p) => p.name === CHALICE && p.x === d.mv)) {
    toGraveyard(s, a.card);
    P.lab.push(`${a.card} is countered by Chalice of the Void`);
    return [P];
  }
  const st = { spell: a.card, protected: prot };
  if (a.target !== undefined) st.target = a.target;
  s.stack = st;
  return runWindow(P, 'cast');
}

/** My spell in s.stack resolves (after W-cast), unless it was countered. */
function resolveSpell(P) {
  const s = P.s;
  const st = s.stack;
  if (!st) return [P];
  s.stack = null;
  const name = st.spell;
  const d = cardDef(name);
  if (has(d, 'creature')) { creatureEnters(s, name); return [P]; }
  if (has(d, 'artifact')) { s.battlefield.push({ name, tapped: false }); return [P]; }
  // Instants and sorceries: Flow State checks the graveyard before it goes there.
  const gyHasInstant = s.graveyard.some((n) => has(cardDef(n), 'instant'));
  const gyHasSorcery = s.graveyard.some((n) => has(cardDef(n), 'sorcery'));
  toGraveyard(s, name);
  switch (name) {
    case 'Dark Ritual':
      s.pool.B += 3;
      return [P];
    case 'Brainstorm':
      return drawN(P, 3).map((Q) => { if (!over(Q.s)) brainstormChoice(Q.s); return Q; });
    case 'Ponder': {
      const look = s.library.slice(0, 3);
      const perms = distinctPermutations(look);
      setChoice(s, 'ponder', [...perms, 'shuffle'],
        [...perms.map((p) => `Ponder: put back ${p.length ? p.join(', ') : '(nothing)'} (top first), then draw`),
          'Ponder: shuffle, then draw']);
      return [P];
    }
    case 'Consider':
      if (!surveilChoice(s, 'consider')) return drawOne(P);
      return [P];
    case 'Personal Tutor': {
      const finds = sortedUnique(s.library.filter((n) => has(cardDef(n), 'sorcery')));
      setChoice(s, 'personal_tutor', [...finds, null],
        [...finds.map((n) => `Personal Tutor: find ${n} (shuffle, put it on top)`), 'Personal Tutor: find nothing (shuffle)']);
      return [P];
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
      return [P];
    }
    case 'Unearth':
      // The target may have left my graveyard in response (Crypt, Surgical, Command): then nothing happens.
      if (s.graveyard.includes(st.target) && !oppHas(s, CAGE)) {
        removeOne(s.graveyard, st.target);
        creatureEnters(s, st.target);
      }
      return [P];
    case 'Thoughtseize':
      s.life -= 2;
      return [P];
    case 'Fatal Push': {
      const i = s.opponent.permanents.findIndex((p) => p.name === st.target);
      if (i >= 0) s.opponent.permanents.splice(i, 1);
      return [P];
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
      return [P];
    }
    default:
      return [P]; // Duress and anything without a modelled effect.
  }
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

// --- choices ---------------------------------------------------------------------

function doChoose(P, a) {
  const s = P.s;
  const pc = s.pendingChoice;
  s.pendingChoice = null;
  if (pc.kind === 'pay_or_not') {
    if (a.option === 'decline') {
      toGraveyard(s, s.stack.spell);
      s.stack = null;
    } else {
      spend(s, a.option.pay);
    }
    return runWindow(P, 'cast');
  }
  // Actions from legalActions carry the option object itself; fall back to a
  // structural match for options rebuilt by the caller (e.g. from JSON).
  let opt = pc.options.includes(a.option) ? a.option : undefined;
  if (opt === undefined) {
    const k = stable(a.option);
    opt = pc.options.find((o) => stable(o) === k);
  }
  switch (pc.kind) {
    case 'surveil':
      if (opt === 'graveyard') toGraveyard(s, s.library.shift());
      return [P];
    case 'consider':
      if (opt === 'graveyard') toGraveyard(s, s.library.shift());
      return drawOne(P);
    case 'brainstorm':
      for (const n of opt) removeOne(s.hand, n);
      s.library = [...opt, ...s.library];
      return [P];
    case 'ponder':
      if (opt === 'shuffle') return each(shuffleB(P), (Q) => drawOne(Q));
      s.library = [...opt, ...s.library.slice(opt.length)];
      return drawOne(P);
    case 'personal_tutor':
      if (opt === null) return shuffleB(P);
      removeOne(s.library, opt);
      return shuffleB(P, [opt]);
    case 'edge_search':
      if (opt !== null) {
        removeOne(s.library, opt);
        s.battlefield.push({ name: opt, tapped: true });
      }
      return shuffleB(P);
    case 'flow_state': {
      const n = opt.hand.length + opt.bottom.length;
      s.library = [...s.library.slice(n), ...opt.bottom];
      s.hand.push(...opt.hand);
      return [P];
    }
    case 'oracle_top': {
      const look = s.library.slice(0, pc.x);
      const rest = s.library.slice(pc.x);
      const top = [];
      if (opt !== null) { removeOne(look, opt); top.push(opt); }
      const perms = distinctPermutations(look);
      return perms.map((perm, i) => {
        const Q = i === perms.length - 1 ? P : fork(P);
        Q.s.library = [...top, ...rest, ...perm];
        Q.lab = [`bottom: ${perm.join(', ')}`];
        return Q;
      });
    }
    case 'ghost_quarter': {
      let Ps = [P];
      if (opt !== null) {
        removeOne(s.library, opt);
        s.battlefield.push({ name: opt, tapped: false });
        Ps = shuffleB(P);
      }
      return each(Ps, (Q) => runWindow(Q, pc.window));
    }
    default:
      throw new Error(`Unknown choice kind ${pc.kind}`);
  }
}

// ---------------------------------------------------------------------------
// The adversary (API §7, §8)
// ---------------------------------------------------------------------------

/** What happens when a window closes with the adversary doing nothing. */
function continuation(win) {
  switch (win) {
    case 'cast': return resolveSpell;
    case 'ability': return resolveAbility;
    case 'oracle': return resolveOracleTrigger;
    case 'oppturn': return (P) => [P];
    case 'myturn': return (P) => drawOne(P, true); // my draw step
    default: throw new Error(`internal: window ${win}`);
  }
}

/**
 * Run adversary window `win` on branch P. The "do nothing" branch comes first and
 * continues with the window's continuation; each adversary option is applied to a
 * fork. After an option the same window reopens (W-oracle: I get priority instead),
 * unless the option left me a choice / an opponent spell to answer, or the game ended.
 */
function runWindow(P, win) {
  if (over(P.s)) return [P];
  const opts = advOptions(P.s, win);
  if (!opts.length) return continuation(win)(P);
  const forks = opts.map(() => fork(P));
  const out = continuation(win)(P);
  opts.forEach((opt, i) => {
    for (const R of applyAdv(forks[i], opt, win)) {
      const s = R.s;
      if (over(s) || s.pendingChoice || s.pendingOppSpell || win === 'oracle') out.push(R);
      else out.push(...runWindow(R, win));
    }
  });
  return out;
}

// --- option generation ---------------------------------------------------------------

const ANY_WINDOWS = new Set(['cast', 'ability', 'oracle', 'oppturn', 'myturn']);

function spellIsBlue(d) { return (d.cost.U || 0) > 0; }
function spellIsColorless(d) { return R_COLORS.every((c) => !(d.cost[c] > 0)); }

/**
 * Payment methods for an opponent hand card (API §8.2). Each: { desc, kind, ... }.
 * `xValue` adds generic mana for {X} (Kozilek's Command).
 */
function oppPayments(s, card, xValue = 0) {
  const o = s.opp;
  const out = [];
  const plan = oppManaPlan(s, oppCost(card), xValue);
  if (plan) out.push({ kind: 'mana', plan, desc: plan.life ? `mana + ${plan.life} life` : 'mana' });
  const pitchColor = { 'Force of Will': 'U', 'Force of Negation': 'U', [SOLITUDE]: 'W', [ENDURANCE]: 'G', Unmask: 'B' }[card];
  let pitchOk = !!pitchColor && o.handSize >= 2;
  if (card === 'Force of Will' && !(o.life > 1)) pitchOk = false;
  if (card === 'Force of Negation' && s.phase !== 'main') pitchOk = false;
  if (pitchOk) {
    if (o.handSize > o.hand.length) out.push({ kind: 'pitch', pitched: null, desc: 'pitching an unknown card' });
    else {
      const rest = [...o.hand];
      removeOne(rest, card);
      for (const n of sortedUnique(rest.filter((x) => oppCardColors(x).includes(pitchColor)))) {
        out.push({ kind: 'pitch', pitched: n, desc: `pitching ${n}` });
      }
    }
  }
  if (card === 'Daze' && o.colors.includes('U') && o.landsTotal >= 1) out.push({ kind: 'daze', desc: 'returning an Island' });
  if (card === 'Snuff Out' && o.colors.includes('B') && o.landsTotal >= 1 && o.life > 4) out.push({ kind: 'snuff', desc: 'paying 4 life' });
  if (card === 'Mindbreak Trap' && s.spellsCast >= 3) out.push({ kind: 'free', desc: 'for free' });
  return out;
}

function payOpp(s, card, pay) {
  const o = s.opp;
  removeOne(o.hand, card);
  o.handSize -= 1;
  o.spellsCast += 1;
  switch (pay.kind) {
    case 'mana':
      o.manaAvailable -= pay.plan.lands;
      o.treasures -= pay.plan.treasures;
      o.life -= pay.plan.life;
      break;
    case 'pitch':
      if (pay.pitched) removeOne(o.hand, pay.pitched);
      o.handSize -= 1;
      if (card === 'Force of Will') o.life -= 1;
      break;
    case 'daze':
      o.landsTotal -= 1;
      o.handSize += 1;
      o.manaAvailable = Math.min(o.manaAvailable, o.landsTotal);
      break;
    case 'snuff':
      o.life -= 4;
      break;
    default:
      break;
  }
}

/** All adversary options at window `win` (deterministic order). */
function advOptions(s, win) {
  const out = [];
  const st = s.stack;
  const spellD = win === 'cast' && st && st.spell ? cardDef(st.spell) : null;
  const pendingO = oraclePending(s);
  const torpor = oppHas(s, TORPOR);
  const add = (card, mode, target, extra = {}) => {
    const pays = extra.pays ?? oppPayments(s, card, extra.x ?? 0);
    for (const pay of pays) out.push({ card, mode, target, pay, ...extra });
  };

  // Visible abilities (API §8.4).
  const seenPerm = new Set();
  for (const p of s.opponent.permanents) {
    if (seenPerm.has(p.name)) continue;
    if (p.name === CRYPT && s.graveyard.length) {
      seenPerm.add(p.name);
      out.push({ card: CRYPT, mode: 'exile_graveyard', visible: true });
    }
    if ((p.name === WASTELAND || p.name === GQ) && (win === 'oppturn' || win === 'myturn')) {
      seenPerm.add(p.name);
      for (const g of bfGroups(s, (q) => isLandName(q.name) && (p.name === GQ || !isBasic(q.name)))) {
        out.push({ card: p.name, mode: 'destroy', target: g.name, land: g, visible: true });
      }
    }
  }

  for (const card of sortedUnique(s.opp.hand)) {
    switch (card) {
      case 'Force of Will':
        if (spellD && !st.protected) add(card, 'counter');
        break;
      case 'Force of Negation':
        if (spellD && !has(spellD, 'creature')) add(card, 'counter');
        break;
      case 'Daze':
        if (spellD && !st.protected) add(card, 'counter');
        break;
      case 'Spell Pierce':
        if (spellD && !has(spellD, 'creature')) add(card, 'counter');
        break;
      case 'Flusterstorm':
        if (spellD && (has(spellD, 'instant') || has(spellD, 'sorcery'))) add(card, 'counter');
        break;
      case 'Spell Snare':
        if (spellD && spellD.mv === 2 && !st.protected) add(card, 'counter');
        break;
      case 'Mental Misstep':
        if (spellD && spellD.mv === 1 && !st.protected) add(card, 'counter');
        break;
      case 'Pact of Negation':
        if (spellD && !st.protected) add(card, 'counter');
        break;
      case 'Mindbreak Trap':
        if (spellD) add(card, 'exile');
        break;
      case 'Pyroblast':
      case 'Red Elemental Blast':
        if (spellD && spellIsBlue(spellD) && !st.protected) add(card, 'counter');
        if (pendingO) add(card, 'destroy', ORACLE);
        break;
      case 'Consign to Memory':
        if (spellD && spellIsColorless(spellD)) add(card, 'counter');
        if ((win === 'ability' && st && st.ability === 'surveil') || win === 'oracle') add(card, 'counter_ability');
        break;
      case 'Stifle':
        if ((win === 'ability' && st && st.ability) || win === 'oracle') add(card, 'counter_ability');
        break;
      case 'Sink into Stupor':
        if (spellD) add(card, 'bounce', st.spell, { what: 'spell' });
        if (pendingO) add(card, 'bounce', ORACLE, { what: 'permanent' });
        break;
      case 'Swords to Plowshares':
        if (pendingO) add(card, 'exile', ORACLE);
        break;
      case 'Fatal Push':
      case 'Snuff Out':
      case 'Dismember':
        if (pendingO) add(card, 'destroy', ORACLE);
        break;
      case SOLITUDE:
        if (pendingO && !torpor) add(card, 'exile', ORACLE);
        break;
      case 'Lightning Bolt':
        add(card, 'damage', 'me');
        if (pendingO) add(card, 'damage', ORACLE);
        break;
      case "Kozilek's Command":
        if (pendingO) add(card, 'exile_creature', ORACLE, { x: 2 });
        add(card, 'draw', 'me', { x: 0 });
        for (const t of sortedUnique(s.graveyard)) add(card, 'exile_graveyard', t, { x: 1 });
        break;
      case 'Surgical Extraction':
        for (const t of sortedUnique(s.graveyard.filter((n) => !(isLandName(n) && isBasic(n))))) {
          for (const mode of ['graveyard', 'graveyard+hand', 'graveyard+library', 'graveyard+hand+library']) add(card, mode, t);
        }
        break;
      case ENDURANCE:
        if (torpor) add(card, 'flash');
        else add(card, 'graveyard_to_library', 'me');
        break;
      case BOWMASTERS:
        add(card, 'flash');
        break;
      case 'Collective Brutality':
        if (win === 'oppturn') {
          add(card, 'discard');
          add(card, 'drain');
          if (s.opp.handSize >= 2) {
            // Escalate: discard an unknown card if they hold one, else one of their held cards.
            const rest = [...s.opp.hand];
            removeOne(rest, card);
            const escs = s.opp.handSize > s.opp.hand.length ? [null] : sortedUnique(rest);
            for (const esc of escs) add(card, 'discard+drain', undefined, { esc });
          }
        }
        break;
      default:
        if (DISCARD_SPELLS.has(card) && win === 'oppturn') add(card, 'cast');
        break;
    }
  }
  if (!ANY_WINDOWS.has(win)) throw new Error(`internal: window ${win}`);
  return out;
}

function optDesc(o) {
  const t = o.land ? ` ${o.land.tapped ? 'tapped' : 'untapped'} ${o.land.name}`
    : o.target ? ` → ${o.target}${o.what ? ` (${o.what})` : ''}` : '';
  const pay = o.pay ? ` (${o.pay.desc})` : '';
  const esc = o.esc ? ` (escalate: discard ${o.esc})` : '';
  return `Opponent: ${o.card} ${o.mode}${t}${pay}${esc}`;
}

/** Apply adversary option `o` to branch P (already a fork). Returns branches. */
function applyAdv(P, o, win) {
  const s = P.s;
  const entry = { card: o.card, mode: o.mode };
  if (o.target !== undefined) entry.target = o.target;
  P.adv.push(entry);
  P.advDesc.push(optDesc(o));
  if (o.visible) {
    const i = s.opponent.permanents.findIndex((p) => p.name === o.card);
    s.opponent.permanents.splice(i, 1);
    if (o.card === CRYPT) {
      s.exile.push(...s.graveyard);
      s.graveyard = [];
      return [P];
    }
    // Wasteland / Ghost Quarter: destroy the land.
    removeFromBattlefield(s, (p) => p.name === o.land.name && !!p.tapped === o.land.tapped);
    if (o.card === GQ) {
      const basics = sortedUnique(s.library.filter((n) => isLandName(n) && isBasic(n)));
      s.pendingChoice = {
        kind: 'ghost_quarter', window: win, options: [null, ...basics],
        descs: ['Ghost Quarter: don\'t search', ...basics.map((n) => `Ghost Quarter: search for ${n} (untapped), shuffle`)],
      };
    }
    return [P];
  }
  payOpp(s, o.card, o.pay);
  const st = s.stack;
  switch (o.card) {
    case 'Force of Will':
    case 'Spell Snare':
    case 'Mental Misstep':
    case 'Pyroblast':
    case 'Red Elemental Blast':
    case 'Consign to Memory':
    case 'Pact of Negation':
    case 'Force of Negation':
    case 'Mindbreak Trap':
      if (o.mode === 'counter' || o.mode === 'exile') {
        if (o.card === 'Force of Negation' || o.card === 'Mindbreak Trap') s.exile.push(st.spell);
        else toGraveyard(s, st.spell);
        s.stack = null;
        if (o.card === 'Pact of Negation') s.opp.pacts.push(s.phase === 'main' ? s.turn : s.turn + 1);
      } else if (o.mode === 'counter_ability') {
        counterAbility(s, win);
      } else if (o.mode === 'destroy') {
        killOracle(s, 'graveyard');
      }
      return [P];
    case 'Stifle':
      counterAbility(s, win);
      return [P];
    case 'Daze':
    case 'Spell Pierce':
    case 'Flusterstorm': {
      const amount = o.card === 'Daze' ? 1 : o.card === 'Spell Pierce' ? 2 : 1 + s.spellsCast + (s.opp.spellsCast - 1);
      s.pendingChoice = { kind: 'pay_or_not', card: o.card, amount };
      return [P];
    }
    case 'Sink into Stupor':
      if (o.what === 'spell') {
        s.hand.push(st.spell);
        s.stack = null;
      } else killOracle(s, 'hand'); // the trigger stays pending
      return [P];
    case 'Swords to Plowshares':
      killOracle(s, 'exile');
      s.life += 1;
      return [P];
    case SOLITUDE:
      killOracle(s, 'exile');
      s.life += 1;
      if (o.pay.kind !== 'pitch') s.opponent.permanents.push({ name: SOLITUDE });
      return [P];
    case 'Fatal Push':
    case 'Snuff Out':
    case 'Dismember':
      killOracle(s, 'graveyard');
      return [P];
    case 'Lightning Bolt':
      if (o.target === 'me') s.life -= 3;
      else killOracle(s, 'graveyard');
      return [P];
    case "Kozilek's Command":
      if (o.mode === 'exile_creature') { killOracle(s, 'exile'); return [P]; }
      if (o.mode === 'draw') return drawOne(P);
      removeOne(s.graveyard, o.target);
      s.exile.push(o.target);
      return [P];
    case 'Surgical Extraction': {
      const zones = o.mode.split('+');
      const strip = (arr) => {
        const keep = [];
        for (const n of arr) { if (n === o.target) s.exile.push(n); else keep.push(n); }
        return keep;
      };
      s.graveyard = strip(s.graveyard);
      if (zones.includes('hand')) s.hand = strip(s.hand);
      if (zones.includes('library')) s.library = strip(s.library);
      return shuffleB(P);
    }
    case ENDURANCE: {
      const hard = o.pay.kind !== 'pitch';
      if (hard || torporOn(s)) s.opponent.permanents.push({ name: ENDURANCE });
      if (o.mode !== 'graveyard_to_library') return [P];
      const gy = s.graveyard;
      s.graveyard = [];
      const lib = s.library;
      const perms = distinctPermutations(gy);
      return perms.map((perm, i) => {
        const Q = i === perms.length - 1 ? P : fork(P);
        Q.s.library = [...lib, ...perm];
        Q.lab.push(`library: ${Q.s.library.length ? Q.s.library.join(', ') : '(empty)'}`);
        return Q;
      });
    }
    case BOWMASTERS:
      s.opponent.permanents.push({ name: BOWMASTERS });
      if (torporOn(s)) return [P];
      return bowPing(P);
    default:
      if (DISCARD_SPELLS.has(o.card)) {
        if (o.card === 'Collective Brutality' && o.mode === 'discard+drain') escalate(s, o.esc);
        s.pendingOppSpell = { card: o.card, mode: o.mode };
        return [P];
      }
      throw new Error(`internal: unhandled adversary card ${o.card}`);
  }
}

const torporOn = (s) => oppHas(s, TORPOR);

/** Brutality's escalate cost: discard a card (an unknown one, or the held card `esc`). */
function escalate(s, esc) {
  const o = s.opp;
  if (esc) removeOne(o.hand, esc);
  o.handSize -= 1;
}

function counterAbility(s, win) {
  if (win === 'oracle') s.pendingTrigger = false;
  else s.stack = null;
}

// --- opponent sorcery-speed spells (API §8.6) -------------------------------------------

function doResolveOppSpell(P) {
  const s = P.s;
  const { card, mode } = s.pendingOppSpell;
  s.pendingOppSpell = null;
  if (card === 'Thoughtseize') s.opp.life -= 2;
  if (card === 'Collective Brutality' && mode.includes('drain')) { s.life -= 2; s.opp.life += 2; }
  P.lab.push(`${card} resolves`);
  let targets = [];
  const nonland = (n) => !has(cardDef(n), 'land');
  const discardMode = card !== 'Collective Brutality' || mode.includes('discard');
  if (discardMode) {
    let pred;
    switch (card) {
      case 'Duress': pred = (n) => nonland(n) && !has(cardDef(n), 'creature'); break;
      case 'Inquisition of Kozilek': pred = (n) => nonland(n) && cardDef(n).mv <= 3; break;
      case 'Collective Brutality': pred = (n) => has(cardDef(n), 'instant') || has(cardDef(n), 'sorcery'); break;
      default: pred = nonland; break;
    }
    targets = sortedUnique(s.hand.filter(pred));
  }
  let Ps;
  if (!targets.length || isLost(s)) Ps = [P];
  else {
    Ps = targets.map((t, i) => {
      const Q = i === targets.length - 1 ? P : fork(P);
      const q = Q.s;
      const n = card === 'Cabal Therapy' ? q.hand.filter((x) => x === t).length : 1;
      for (let k = 0; k < n; k++) { removeOne(q.hand, t); toGraveyard(q, t); }
      Q.adv.push({ card, mode: 'discard', target: t });
      Q.advDesc.push(`Opponent: ${card} takes ${t}`);
      return Q;
    });
  }
  return each(Ps, (Q) => runWindow(Q, 'oppturn'));
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
    sortedJoin(s.battlefield.map((p) => `${p.name}|${p.tapped ? 1 : 0}|${p.damage || 0}`)),
    s.life,
    POOL_COLORS.map((c) => s.pool[c] || 0).join(','),
    R_COLORS.map((c) => s.restricted[c] || 0).join(','),
    s.phase, s.turn, s.landPlayed ? 1 : 0, s.noncreatureCast, s.pendingTrigger ? 1 : 0,
    s.pendingChoice ? stable(s.pendingChoice) : '-',
    sortedJoin(s.opponent.permanents.map(stable)),
    s.turnsAhead, s.cavernType, s.drewEmpty ? 1 : 0, s.won ? 1 : 0,
    oppKey(s.opp),
    s.spellsCast, s.drawsThisTurn,
    s.pendingOppSpell ? stable(s.pendingOppSpell) : '-',
    s.stack ? stable(s.stack) : '-',
  ].join('\u0002');
}

/** Opponent resources as a key fragment (shared with the solver). */
export function oppKey(o) {
  return `${sortedJoin(o.hand)}#${o.handSize}#${o.manaAvailable}#${o.landsTotal}#${o.colors}#${o.life}#${o.treasures}#${o.spellsCast}#${o.pacts.join(',')}#${o.lost ? 1 : 0}`;
}

export { actionKey as _actionKey };
