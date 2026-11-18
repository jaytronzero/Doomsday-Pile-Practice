import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDeck, deckToText } from '../src/deckText.js';
import { DEFAULT_DECK_TEXT } from '../src/defaultDeck.js';

test('parses "4 Name" and "4x Name" lines', () => {
  const d = parseDeck('4 Brainstorm\n4x Dark Ritual\n2X Thassa\'s Oracle');
  assert.deepEqual(d.main, { Brainstorm: 4, 'Dark Ritual': 4, "Thassa's Oracle": 2 });
  assert.deepEqual(d.side, {});
  assert.deepEqual(d.errors, []);
});

test('ignores blank and whitespace-only lines, handles CRLF', () => {
  const d = parseDeck('\r\n4 Island\r\n   \r\n\t\n1 Swamp\r\n');
  assert.deepEqual(d.main, { Island: 4, Swamp: 1 });
  assert.deepEqual(d.errors, []);
});

test('Sideboard line switches zones (case-insensitive, optional colon)', () => {
  for (const header of ['Sideboard', 'sideboard', 'SIDEBOARD:', 'Sideboard :']) {
    const d = parseDeck(`4 Doomsday\n${header}\n3 Fatal Push`);
    assert.deepEqual(d.main, { Doomsday: 4 }, header);
    assert.deepEqual(d.side, { 'Fatal Push': 3 }, header);
    assert.deepEqual(d.errors, [], header);
  }
});

test('duplicate names are summed within each zone', () => {
  const d = parseDeck('2 Island\n1 Swamp\n2x Island\nSideboard\n1 Daze\n2 Daze');
  assert.deepEqual(d.main, { Island: 4, Swamp: 1 });
  assert.deepEqual(d.side, { Daze: 3 });
});

test('malformed lines are reported with 1-based line numbers', () => {
  const d = parseDeck('4 Brainstorm\nBrainstorm\n\nfour Ponder\n0 Daze\n3 Ponder');
  assert.deepEqual(d.main, { Brainstorm: 4, Ponder: 3 });
  assert.deepEqual(d.errors.map((e) => e.line), [2, 4, 5]);
  for (const e of d.errors) assert.match(e.message, new RegExp(`Line ${e.line}`));
  assert.equal(d.errors[0].text, 'Brainstorm');
});

test('empty or missing input gives empty zones', () => {
  assert.deepEqual(parseDeck(''), { main: {}, side: {}, errors: [] });
  assert.deepEqual(parseDeck(undefined), { main: {}, side: {}, errors: [] });
});

test('default deck parses to 60 main + 15 side with no errors', () => {
  const d = parseDeck(DEFAULT_DECK_TEXT);
  assert.deepEqual(d.errors, []);
  const sum = (z) => Object.values(z).reduce((a, b) => a + b, 0);
  assert.equal(sum(d.main), 60);
  assert.equal(sum(d.side), 15);
  assert.equal(d.main.Doomsday, 4);
  assert.equal(d.main["Lion's Eye Diamond"], 1);
  assert.equal(d.side['Jace, Wielder of Mysteries'], 1);
});

test('deckToText writes main, then Sideboard, and round-trips', () => {
  const deck = { main: { Doomsday: 4, Island: 1 }, side: { Daze: 2 } };
  const text = deckToText(deck);
  assert.equal(text, '4 Doomsday\n1 Island\nSideboard\n2 Daze');
  const back = parseDeck(text);
  assert.deepEqual({ main: back.main, side: back.side }, deck);
});

test('deckToText omits empty sideboard and zero counts', () => {
  assert.equal(deckToText({ main: { Island: 2, Swamp: 0 } }), '2 Island');
  assert.equal(deckToText({ main: {}, side: {} }), '');
});

test('default deck round-trips through deckToText', () => {
  const d = parseDeck(DEFAULT_DECK_TEXT);
  const again = parseDeck(deckToText(d));
  assert.deepEqual(again, d);
});
