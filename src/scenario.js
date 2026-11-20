// Scenario validation (SPEC_V2 §2, SPEC_V2_API §12). Pure; returns error strings.
import { buildStartState } from './engine.js';

const SOURCE_KEYS = new Set(['player', 'date', 'deck', 'oppDeck', 'gameNumber', 'onPlay']);
const OPP_KEYS = new Set(['permanents', 'graveyard', 'exile', 'life', 'handSize', 'lands',
  'deckEstimate', 'deckEstimateSource', 'hand']);

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

/** Errors in one scenario ([] = valid). */
export function validateScenario(s) {
  const errs = [];
  if (!isObj(s)) return ['scenario must be an object'];
  if (typeof s.id !== 'string' || !s.id) errs.push('id must be a non-empty string');
  if (!isObj(s.source)) errs.push('source must be an object');
  else {
    for (const k of Object.keys(s.source)) {
      if (!SOURCE_KEYS.has(k)) errs.push(`source.${k} is not allowed (allowed: ${[...SOURCE_KEYS].join(', ')})`);
    }
  }
  if (!isObj(s.setup)) errs.push('setup must be an object');
  else if (s.setup.opponent !== undefined) {
    if (!isObj(s.setup.opponent)) errs.push('setup.opponent must be an object');
    else {
      for (const k of Object.keys(s.setup.opponent)) {
        if (!OPP_KEYS.has(k)) errs.push(`setup.opponent.${k} is not allowed (allowed: ${[...OPP_KEYS].join(', ')})`);
      }
    }
  }
  const a = s.actual;
  if (!isObj(a)) errs.push('actual must be an object');
  else {
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
