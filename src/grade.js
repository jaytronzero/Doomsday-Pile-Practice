// Interaction grade (SPEC_V2 §6, SPEC_V2_API §11). Pure and deterministic.
//
// The opponent's hidden hand is a uniform h-card draw from the unseen pool
// (deckEstimate minus their visible cards). Only the "relevant" cards (modelled
// in src/opponent.js and castable with their land colours) can change a verdict.
// We solve the goldfish board, every single relevant card, and every pair whose
// two singles both win; any hand is then judged by the monotonicity assumption
// (a hand loses iff it contains a losing single or a losing pair).
import { buildStartState } from './engine.js';
import { solve } from './solver.js';
import { MODELLED_HAND_CARDS, castableInPrinciple } from './opponent.js';

const MODELLED = new Set(MODELLED_HAND_CARDS);
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

/** C(n, k) as a float (exact for the sizes used here: n ≤ ~100, k ≤ 9). */
function choose(n, k) {
  if (k < 0 || k > n) return 0;
  let r = 1;
  const kk = Math.min(k, n - k);
  for (let i = 1; i <= kk; i++) r = (r * (n - kk + i)) / i;
  return Math.round(r);
}

/** deckEstimate − (permanents + graveyard + exile), by name, floored at 0; zeros dropped. */
export function unseenPool(opponent) {
  const est = opponent?.deckEstimate ?? {};
  const seen = new Map();
  const see = (n) => seen.set(n, (seen.get(n) || 0) + 1);
  for (const p of opponent?.permanents ?? []) see(p.name);
  for (const n of opponent?.graveyard ?? []) see(n);
  for (const n of opponent?.exile ?? []) see(n);
  const out = {};
  for (const name of Object.keys(est)) {
    const c = est[name] - (seen.get(name) || 0);
    if (c > 0) out[name] = c;
  }
  return out;
}

/** P(a uniform h-card hand from N cards holds ≥ 1 of k copies) = 1 − C(N−k, h)/C(N, h). */
export function pHold(N, k, h) {
  if (![N, k, h].every(Number.isInteger) || k < 0 || k > N || h < 0 || h > N) {
    throw new RangeError(`pHold needs integers 0 ≤ k ≤ N and 0 ≤ h ≤ N (got N=${N}, k=${k}, h=${h})`);
  }
  if (N - k < h) return 1;
  let miss = 1; // C(N−k, h)/C(N, h) = Π (N−k−i)/(N−i)
  for (let i = 0; i < h; i++) miss *= (N - k - i) / (N - i);
  return 1 - miss;
}

/** The two names sorted, joined with ' + '. */
export function pairKey(a, b) {
  return [a, b].sort().join(' + ');
}

/** true | false | null for a hand vector {r: n_r} (API §11.1). */
export function handVerdict(vector, singles, pairs) {
  const present = Object.keys(vector).filter((r) => vector[r] >= 1).sort();
  const keys = [];
  for (let i = 0; i < present.length; i++) {
    for (let j = i; j < present.length; j++) {
      if (i === j && vector[present[i]] < 2) continue;
      keys.push(pairKey(present[i], present[j]));
    }
  }
  const vals = [
    ...present.map((r) => (own(singles, r) ? singles[r] : null)),
    ...keys.map((k) => (own(pairs, k) ? pairs[k] : null)),
  ];
  if (vals.some((v) => v === false)) return false;
  if (vals.some((v) => v !== true)) return null;
  return true;
}

/** Multivariate hypergeometric enumeration (API §11.1) → { low, high }. */
export function handWinProbability(counts, N, h, verdict) {
  const names = Object.keys(counts);
  const K = names.reduce((t, r) => t + counts[r], 0);
  if (![N, h].every(Number.isInteger) || h < 0 || h > N || K > N || names.some((r) => !(Number.isInteger(counts[r]) && counts[r] >= 0))) {
    throw new RangeError(`handWinProbability needs 0 ≤ h ≤ N and Σk ≤ N (got N=${N}, h=${h}, Σk=${K})`);
  }
  const total = choose(N, h);
  let low = 0;
  let high = 0;
  const v = {};
  const rec = (i, used, w) => {
    if (i === names.length) {
      const rest = h - used;
      if (rest > N - K) return;
      const weight = (w * choose(N - K, rest)) / total;
      const r = verdict({ ...v });
      if (r === true) low += weight;
      if (r !== false) high += weight;
      return;
    }
    const r = names[i];
    for (let n = 0; n <= counts[r] && used + n <= h; n++) {
      v[r] = n;
      rec(i + 1, used + n, w * choose(counts[r], n));
    }
    delete v[r];
  };
  rec(0, 0, 1);
  return { low, high };
}

const winsOf = (r) => (r.result === 'win' ? true : r.result === 'no_win' ? false : null);

/** Goldfish + interaction grade of `pile` on `setup` (API §11.2). */
export function grade(setup, pile, { maxNodes = 200000, solver = solve } = {}) {
  const opp = setup?.opponent;
  if (!opp || typeof opp.deckEstimate !== 'object' || opp.deckEstimate === null || Array.isArray(opp.deckEstimate)) {
    throw new Error('grade() needs setup.opponent.deckEstimate ({name: count}).');
  }
  if (!(Number.isInteger(opp.handSize) && opp.handSize >= 0)) {
    throw new Error(`grade() needs setup.opponent.handSize as a whole number ≥ 0 (got ${JSON.stringify(opp.handSize)}).`);
  }
  const assumptions = [
    'The opponent\'s hand is a uniform random draw from their estimated deck minus their visible cards.',
    'Monotonicity: a hand loses if it holds a losing single card or a losing pair; any other hand is counted as a win (triples and larger are never solved).',
    'Cards not modelled in the opponent\'s hand are assumed to do nothing.',
  ];
  const unseen = unseenPool(opp);
  const N = Object.values(unseen).reduce((a, b) => a + b, 0);
  let h = opp.handSize;
  if (h > N) {
    assumptions.push(`Hand size ${opp.handSize} is larger than the unseen pool (${N} cards): clamped to ${N}.`);
    h = N;
  }
  const colors = opp.lands?.colors ?? '';
  const names = Object.keys(unseen).sort();
  const R = names.filter((n) => MODELLED.has(n) && castableInPrinciple(n, colors)).sort();
  const notModelled = names.filter((n) => !MODELLED.has(n)).sort();
  const offColor = names.filter((n) => MODELLED.has(n) && !castableInPrinciple(n, colors)).sort();

  const run = (hand) => solver(buildStartState({ ...setup, opponent: { ...opp, hand } }, pile), { maxNodes });
  const goldfish = run([]);
  const base = {
    goldfish, singles: [], pairs: [], notModelled, offColor, unseen, N, h,
    source: opp.deckEstimateSource ?? null, assumptions,
  };
  if (goldfish.result !== 'win') {
    if (goldfish.result === 'no_win') return { ...base, pWin: 0, pWinRange: [0, 0] };
    return { ...base, pWin: null, pWinRange: [0, 1] };
  }
  const singles = R.map((r) => ({ card: r, k: unseen[r], pHold: pHold(N, unseen[r], h), wins: winsOf(run([r])) }));
  const singlesMap = Object.fromEntries(singles.map((x) => [x.card, x.wins]));
  const pairs = [];
  if (h >= 2) {
    for (let i = 0; i < R.length; i++) {
      for (let j = i; j < R.length; j++) {
        const r = R[i];
        const s = R[j];
        if (r === s && unseen[r] < 2) continue;
        if (singlesMap[r] !== true || singlesMap[s] !== true) continue;
        pairs.push({ cards: [r, s], wins: winsOf(run([r, s])) });
      }
    }
  }
  const pairsMap = Object.fromEntries(pairs.map((p) => [pairKey(p.cards[0], p.cards[1]), p.wins]));
  const counts = Object.fromEntries(R.map((r) => [r, unseen[r]]));
  const { low, high } = handWinProbability(counts, N, h, (v) => handVerdict(v, singlesMap, pairsMap));
  return { ...base, singles, pairs, pWin: low === high ? low : null, pWinRange: [low, high] };
}
