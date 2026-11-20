// Scenario validation (SPEC_V2 §2, SPEC_V2_API §12). Pure; returns error strings.
import { buildStartState } from './engine.js';

const SOURCE_KEYS = new Set(['player', 'date', 'deck', 'oppDeck', 'gameNumber', 'onPlay']);
const OPP_KEYS = new Set(['permanents', 'graveyard', 'exile', 'life', 'handSize', 'lands',
  'deckEstimate', 'deckEstimateSource', 'hand']);

// Every other object level is whitelisted too, so no free-form field (e.g. an opponent username under a
// new key) can reach data/ (SPEC_V2 §2 "NO opponent username, ever", §9).
const TOP_KEYS = new Set(['id', 'source', 'setup', 'actual', 'warnings']);
const ACTUAL_KEYS = new Set(['pile', 'pileOrdered', 'result', 'winBy', 'turnsAfterDoomsday']);
const SETUP_KEYS = new Set(['deck', 'hand', 'battlefield', 'graveyard', 'exile', 'manaPool', 'lifeBeforeDoomsday',
  'landPlayedThisTurn', 'noncreatureSpellsCastThisTurn', 'spellsCastThisTurn', 'cardsDrawnThisTurn', 'cavernType',
  'opponent', 'turnsAhead']);
const PERM_KEYS = new Set(['name', 'tapped', 'power', 'toughness', 'x', 'named', 'counters']);
const LAND_KEYS = new Set(['untapped', 'total', 'colors']);

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
function extraKeys(obj, allowed, where, errs) {
  for (const k of Object.keys(obj)) if (!allowed.has(k)) errs.push(`${where}.${k} is not allowed (allowed: ${[...allowed].join(', ')})`);
}

/** Errors in one scenario ([] = valid). */
export function validateScenario(s) {
  const errs = [];
  if (!isObj(s)) return ['scenario must be an object'];
  if (typeof s.id !== 'string' || !s.id) errs.push('id must be a non-empty string');
  extraKeys(s, TOP_KEYS, 'scenario', errs);
  if (!isObj(s.source)) errs.push('source must be an object');
  else {
    for (const k of Object.keys(s.source)) {
      if (!SOURCE_KEYS.has(k)) errs.push(`source.${k} is not allowed (allowed: ${[...SOURCE_KEYS].join(', ')})`);
    }
  }
  if (!isObj(s.setup)) errs.push('setup must be an object');
  else {
    extraKeys(s.setup, SETUP_KEYS, 'setup', errs);
    for (const [i, b] of (Array.isArray(s.setup.battlefield) ? s.setup.battlefield : []).entries()) {
      if (isObj(b)) extraKeys(b, new Set(['name', 'tapped']), `setup.battlefield[${i}]`, errs);
    }
  }
  if (isObj(s.setup) && s.setup.opponent !== undefined) {
    const o = s.setup.opponent;
    if (!isObj(o)) errs.push('setup.opponent must be an object');
    else {
      for (const k of Object.keys(o)) {
        if (!OPP_KEYS.has(k)) errs.push(`setup.opponent.${k} is not allowed (allowed: ${[...OPP_KEYS].join(', ')})`);
      }
      for (const [i, p] of (Array.isArray(o.permanents) ? o.permanents : []).entries()) {
        if (isObj(p)) extraKeys(p, PERM_KEYS, `setup.opponent.permanents[${i}]`, errs);
      }
      if (isObj(o.lands)) extraKeys(o.lands, LAND_KEYS, 'setup.opponent.lands', errs);
      if (o.deckEstimate !== undefined) {
        if (!isObj(o.deckEstimate)) errs.push('setup.opponent.deckEstimate must be an object {name: count}');
        else {
          for (const [n, c] of Object.entries(o.deckEstimate)) {
            if (!(Number.isInteger(c) && c >= 0)) errs.push(`setup.opponent.deckEstimate[${JSON.stringify(n)}] must be a whole number ≥ 0 (got ${JSON.stringify(c)})`);
          }
        }
      }
      if (o.deckEstimateSource !== undefined && typeof o.deckEstimateSource !== 'string') {
        errs.push('setup.opponent.deckEstimateSource must be a string');
      }
    }
  }
  const a = s.actual;
  if (!isObj(a)) errs.push('actual must be an object');
  else {
    extraKeys(a, ACTUAL_KEYS, 'actual', errs);
    if (!['win', 'loss'].includes(a.result)) errs.push(`actual.result must be 'win' or 'loss' (got ${JSON.stringify(a.result)})`);
    if (typeof a.pileOrdered !== 'boolean') errs.push('actual.pileOrdered must be a boolean');
    if (isObj(s.setup)) {
      try {
        buildStartState(s.setup, a.pile);
      } catch (e) {
        errs.push(`setup + actual.pile do not build: ${e.message}`);
      }
    }
  }
  if (s.warnings !== undefined && !(Array.isArray(s.warnings) && s.warnings.every((w) => typeof w === 'string'))) {
    errs.push('warnings must be an array of strings');
  }
  return errs;
}

/** Errors in a scenarios file { version: 2, scenarios: [...] } ([] = valid). */
export function validateScenarioFile(f) {
  if (!isObj(f)) return ['file must be an object'];
  const errs = [];
  if (f.version !== 2) errs.push(`version must be 2 (got ${JSON.stringify(f.version)})`);
  if (!Array.isArray(f.scenarios)) {
    errs.push('scenarios must be an array');
    return errs;
  }
  const seen = new Set();
  f.scenarios.forEach((s, i) => {
    const id = isObj(s) && typeof s.id === 'string' && s.id ? s.id : `#${i}`;
    for (const e of validateScenario(s)) errs.push(`${id}: ${e}`);
    if (seen.has(id)) errs.push(`${id}: duplicate id`);
    seen.add(id);
  });
  return errs;
}
