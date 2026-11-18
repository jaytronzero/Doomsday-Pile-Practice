// Deck list text <-> { main, side } count maps. Pure, no DOM.

const CARD_LINE = /^(\d+)\s*[xX]?\s+(\S.*)$/;
const SIDEBOARD_LINE = /^sideboard\s*:?$/i;

/**
 * Parse a deck list such as "4 Brainstorm" / "4x Brainstorm" lines.
 * A line "Sideboard" (any case, optional colon) switches to the sideboard.
 * Blank lines are ignored; duplicate names are summed.
 * @returns {{ main: Object<string, number>, side: Object<string, number>,
 *             errors: { line: number, text: string, message: string }[] }}
 */
export function parseDeck(text) {
  const main = {};
  const side = {};
  const errors = [];
  let target = main;
  const lines = String(text ?? '').split(/\r?\n/);
  lines.forEach((raw, i) => {
    const line = raw.trim();
    if (line === '') return;
    if (SIDEBOARD_LINE.test(line)) {
      target = side;
      return;
    }
    const m = CARD_LINE.exec(line);
    if (!m) {
      errors.push({ line: i + 1, text: raw, message: `Line ${i + 1}: expected "<count> <card name>", got "${line}"` });
      return;
    }
    const count = Number(m[1]);
    const name = m[2].trim().replace(/\s+/g, ' ');
    if (count < 1) {
      errors.push({ line: i + 1, text: raw, message: `Line ${i + 1}: count must be at least 1` });
      return;
    }
    // Own properties only: "constructor" or "__proto__" lines must not read
    // (or write) Object.prototype.
    const prev = Object.prototype.hasOwnProperty.call(target, name) ? target[name] : 0;
    Object.defineProperty(target, name, { value: prev + count, enumerable: true, writable: true, configurable: true });
  });
  return { main, side, errors };
}

/** Inverse of parseDeck: "N Name" lines, then "Sideboard" and its lines if any. */
export function deckToText({ main = {}, side = {} } = {}) {
  const toLines = (zone) =>
    Object.entries(zone)
      .filter(([, n]) => Number.isInteger(n) && n > 0)
      .map(([name, n]) => `${n} ${name}`);
  const out = toLines(main);
  const sideLines = toLines(side);
  if (sideLines.length) out.push('Sideboard', ...sideLines);
  return out.join('\n');
}
