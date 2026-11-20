// SPEC_V2 §2 scenario format and §9 "no opponent username anywhere in data/" (SPEC_V2_API §12).
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateScenario, validateScenarioFile } from '../src/scenario.js';
import { ORACLE, WRAITH, setupA2, PILE_A2, oppObj, sha256 } from './v2-helpers.js';

/** A valid hand-made scenario (SAMPLE; no real player or opponent data). */
function sample(over = {}) {
  return {
    id: 'sample-1',
    source: { player: 'SAMPLE', date: '2026-11-14', deck: 'Turbo DD', oppDeck: 'UR Delver', gameNumber: 2, onPlay: true },
    setup: {
      ...setupA2(),
      opponent: {
        ...oppObj({
          permanents: [{ name: 'Delver of Secrets', power: 3 }],
          untapped: 1, total: 3, colors: 'UR', handSize: 4, life: 18,
        }),
        graveyard: ['Ponder'],
        exile: [],
        deckEstimate: { 'Force of Will': 4, Daze: 4, 'Lightning Bolt': 4, Ponder: 4, 'Delver of Secrets': 4, Island: 40 },
        deckEstimateSource: 'SAMPLE estimate',
      },
    },
    actual: { pile: [...PILE_A2], pileOrdered: false, result: 'win', winBy: 'normal', turnsAfterDoomsday: 0 },
    warnings: [],
    ...over,
  };
}

describe('validateScenario', () => {
  test('a valid sample has no errors', () => {
    assert.deepEqual(validateScenario(sample()), []);
  });

  test('an opponent username field in source is rejected (source keys are whitelisted)', () => {
    const s = sample();
    s.source = { ...s.source, opponent: 'OPPONENT_NAME' };
    assert.ok(validateScenario(s).length > 0);
    const t = sample();
    t.source = { ...t.source, oppName: 'OPPONENT_NAME' };
    assert.ok(validateScenario(t).length > 0);
  });

  test('an opponent username field in setup.opponent is rejected (keys whitelisted)', () => {
    const s = sample();
    s.setup = { ...s.setup, opponent: { ...s.setup.opponent, username: 'OPPONENT_NAME' } };
    assert.ok(validateScenario(s).length > 0);
  });

  test('bad actual / setup / id are reported', () => {
    assert.ok(validateScenario(sample({ id: '' })).length > 0);
    assert.ok(validateScenario(sample({ actual: { ...sample().actual, result: 'draw' } })).length > 0);
    assert.ok(validateScenario(sample({ actual: { ...sample().actual, pileOrdered: 'no' } })).length > 0);
    assert.ok(validateScenario(sample({ actual: { ...sample().actual, pile: [ORACLE, ORACLE, ORACLE, WRAITH, WRAITH] } })).length > 0, 'pile not buildable');
    assert.ok(validateScenario(sample({ warnings: [3] })).length > 0);
  });
});

describe('validateScenarioFile', () => {
  test('version 2 with valid scenarios: no errors', () => {
    assert.deepEqual(validateScenarioFile({ version: 2, scenarios: [sample(), sample({ id: 'sample-2' })] }), []);
  });
  test('wrong version, non-array, duplicate ids, invalid entry', () => {
    assert.ok(validateScenarioFile({ version: 1, scenarios: [] }).length > 0);
    assert.ok(validateScenarioFile({ version: 2, scenarios: {} }).length > 0);
    assert.ok(validateScenarioFile({ version: 2, scenarios: [sample(), sample()] }).length > 0);
    const bad = sample({ id: 'bad' });
    bad.source = { ...bad.source, opponent: 'OPPONENT_NAME' };
    const errs = validateScenarioFile({ version: 2, scenarios: [sample(), bad] });
    assert.ok(errs.length > 0 && errs.some((e) => e.includes('bad')));
  });
});

// ---------------------------------------------------------------------------
// No opponent username may appear anywhere in data/ (SPEC_V2 §9). The names are NOT written here: the list
// holds SHA-256 digests of the lower-cased usernames (supplied by the lead, from the data source). Every file
// under data/ (and every path name) is split into tokens of [A-Za-z0-9_] characters; each lower-cased token is
// hashed and must not be in the list. Passes trivially if data/ is missing or empty.
const BLOCKED_SHA256 = new Set([
  'facef2943e1c50984b74c4e46f873c39b23cde23118149236e0c8ec7efaff1bb',
  '1a8325b02428542286e09d5d7a07ea6344dda77bcb017060692a2ca18848fa21',
  '18b88c6d045ab3deaaa363ac7572ab52f5f651757803d259d6daf960b29e35e5',
  '5b981e9191d159260be818b00665a833226c18f8588d35fcd4661dd3fad8b491',
  '62dc9f5290f065534d1a9b9ed97dfec59f37e2c29b69a511415e2d2c31ff3731',
  '07f0ef4a068c6f245ec75ba6ea4d0d7d399b42a7fd4dc0bfba0029505541c921',
  'c523d70e7de10a18faade27ca3e40611dee7929e5c3228a44e939f58c9a23994',
  'c791d44417c841da9174816ee95e6dad6f42b17fe522d557a5986c60e5d5e7ce',
  'd178e2e27f416f54d256c3a9e21e86ae7d08c4459cd6e326cfb971a500c985f7',
  'be82c1cc07687cef28b3d610f366b3225468c6d450b40588f1188be2e2e96a3b',
  'a2254a3299a6d5c26dadba9b9b99a01a96b61f375889025e7510cd3077a8141e',
  '4a8c472f13305b901201e0c588e4537244f660c845a8908f5d16cafb384d83e2',
  '6d8877bdb9c384887c22186aa6aef0bddb24bcc54714d10bdbaf95506116125f',
  '8e306a072f77523d27c2d480a3148859eeb49245bdd2c5d29a8562f822b71357',
  '81a7cb29323ce25076603cee2e0895047b8bb535df5eaa37578ec35d4fa65881',
  '1b4a776d7f3661d68b40581d0a8660f693aa0670dad8f4b6b71e65054369e8d4',
  '8daf95701c74b406bd2fe23a808d2444cb8c632419236a3581353a7e557f139b',
  '3f617c097c3328759ddfe4fe902b0bc09183c9a0103f53df9078051720c01c98',
  '3f1db929bcd047c5d469b68b5b56c9242beb8e8dbbe965c8b56915684eb27fb9',
  'cb516e8d686c4b3de15f3552fdf79c789e71ec93d0473f1360e37d388be0f100',
  '830381e1650e781faf422015a9ae24de4e6adbd54cb1ca705673e7dca5622427',
  '31809b8c1aa80081b486e54768c6232052628440d27a66f10530c29d9df28eef',
]);

const DATA_DIR = fileURLToPath(new URL('../data/', import.meta.url));

function filesUnder(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...filesUnder(p));
    else out.push(p);
  }
  return out;
}

const tokensIn = (text, set) => (text.match(/[A-Za-z0-9_]+/g) || []).filter((t) => set.has(sha256(t.toLowerCase())));
const blockedTokens = (text) => tokensIn(text, BLOCKED_SHA256);

describe('data/ privacy', () => {
  test('the blocklist has 22 entries; the matcher is case-insensitive and token-based (dummy digest)', () => {
    assert.equal(BLOCKED_SHA256.size, 22);
    assert.equal(blockedTokens('no names here, only cards: Force of Will').length, 0);
    const dummy = new Set([sha256('some_dummy_user9')]);
    assert.equal(tokensIn('{"player":"Some_Dummy_User9"}', dummy).length, 1);
    assert.equal(tokensIn('xsome_dummy_user9', dummy).length, 0);
  });

  test('no file under data/ (content or path) contains a blocked opponent username', () => {
    const hits = [];
    for (const f of filesUnder(DATA_DIR)) {
      const bad = [...blockedTokens(f.slice(DATA_DIR.length)), ...blockedTokens(readFileSync(f, 'utf8'))];
      if (bad.length) hits.push(`${f.slice(DATA_DIR.length)}: ${bad.length} blocked token(s)`);
    }
    // Report file names and counts only, never the matched names.
    assert.deepEqual(hits, []);
  });

  test('any scenario file present in data/ validates', () => {
    for (const name of ['scenarios.json', 'sample-scenarios.json']) {
      const p = join(DATA_DIR, name);
      if (!existsSync(p)) continue;
      assert.deepEqual(validateScenarioFile(JSON.parse(readFileSync(p, 'utf8'))), [], name);
    }
  });
});
