// Opponent-side data helpers (SPEC_V2_API §1.1). Pure: no engine logic here,
// only the lists of modelled cards and the printed-cost parser the engine and
// grade() read. Card behaviour lives in src/engine.js (adversary section).
import { OPP_CARDS } from './oppCards.js';

/** Hidden-hand cards the adversary can use (SPEC_V2 §5.4 + §10). */
export const MODELLED_HAND_CARDS = Object.freeze([
  'Force of Will', 'Force of Negation', 'Daze', 'Spell Pierce', 'Flusterstorm', 'Pyroblast',
  'Red Elemental Blast', 'Spell Snare', 'Pact of Negation', 'Mindbreak Trap', 'Mental Misstep',
  "Kozilek's Command", 'Consign to Memory', 'Stifle',
  'Swords to Plowshares', 'Fatal Push', 'Snuff Out', 'Dismember', 'Solitude', 'Lightning Bolt',
  'Sink into Stupor', 'Surgical Extraction',
  'Thoughtseize', 'Duress', 'Inquisition of Kozilek', 'Unmask', 'Cabal Therapy', 'Collective Brutality',
  'Orcish Bowmasters', 'Endurance',
]);

/** Opponent permanents with a modelled effect (SPEC_V2 §3 + §10, API §4). */
export const MODELLED_PERMANENTS = Object.freeze([
  'Deafening Silence', 'Thalia, Guardian of Thraben', 'Gaddock Teeg', 'Chalice of the Void', 'Disruptor Flute',
  'Thorn of Amethyst', 'Sphere of Resistance', 'Trinisphere', 'Damping Sphere', 'Archon of Emeria',
  'Pithing Needle', 'Collector Ouphe', 'Karn, the Great Creator', "Grafdigger's Cage", 'Torpor Orb',
  'Teferi, Time Raveler', 'Narset, Parter of Veils', 'Hullbreacher', 'Orcish Bowmasters',
  'Blood Moon', 'Magus of the Moon', 'Back to Basics', "Tormod's Crypt", 'Wasteland', 'Ghost Quarter',
  'Voice of Victory', 'Dauthi Voidwalker', 'Goblin Guide',
]);

const SINGLE = new Set(['W', 'U', 'B', 'R', 'G', 'C']);
const FIVE = ['W', 'U', 'B', 'R', 'G'];

/**
 * Printed cost string → { generic, colored:{W,U,B,R,G,C}, hybrid:[[a,b]], phyrexian:{W,U,B,R,G}, x }.
 * Throws on a symbol it does not know.
 */
export function parseCost(cost) {
  const out = {
    generic: 0,
    colored: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 },
    hybrid: [],
    phyrexian: { W: 0, U: 0, B: 0, R: 0, G: 0 },
    x: 0,
  };
  const s = String(cost ?? '');
  const rest = s.replace(/\{([^}]*)\}/g, (_, sym) => {
    if (/^\d+$/.test(sym)) out.generic += Number(sym);
    else if (sym === 'X') out.x += 1;
    else if (SINGLE.has(sym)) out.colored[sym] += 1;
    else if (/^[WUBRG]\/P$/.test(sym)) out.phyrexian[sym[0]] += 1;
    else if (/^[WUBRG]\/[WUBRG]$/.test(sym)) out.hybrid.push([sym[0], sym[2]]);
    else throw new Error(`parseCost: unknown mana symbol {${sym}} in ${JSON.stringify(s)}`);
    return '';
  });
  if (rest.trim() !== '') throw new Error(`parseCost: unparsable cost ${JSON.stringify(s)}`);
  return out;
}

/** Mana value of a parsed cost (X = 0). */
export function costMV(p) {
  return p.generic + Object.values(p.colored).reduce((a, b) => a + b, 0) + p.hybrid.length
    + Object.values(p.phyrexian).reduce((a, b) => a + b, 0);
}

/**
 * Could the opponent cast `name` with lands of these colours (API §11.2 step 3)?
 * Every non-Phyrexian coloured symbol (including {C}) needs its colour in `colors`;
 * a hybrid symbol needs either colour. Generic, {X} and Phyrexian symbols never block.
 */
export function castableInPrinciple(name, colors) {
  const c = Object.prototype.hasOwnProperty.call(OPP_CARDS, name) ? OPP_CARDS[name] : null;
  if (!c) return false;
  const p = parseCost(c.cost);
  const have = new Set(String(colors ?? '').split(''));
  for (const k of [...FIVE, 'C']) if (p.colored[k] > 0 && !have.has(k)) return false;
  for (const [a, b] of p.hybrid) if (!have.has(a) && !have.has(b)) return false;
  return true;
}

/** Colours of an opponent card (from OPP_CARDS), [] if unknown. */
export function oppCardColors(name) {
  const c = Object.prototype.hasOwnProperty.call(OPP_CARDS, name) ? OPP_CARDS[name] : null;
  return c ? c.colors || [] : [];
}
