# Doomsday Pile Practice

A practice tool for Legacy Doomsday (Turbo DD). Describe the board right after
Doomsday resolves, choose a 5-card pile and its order, and press **Check pile**.
The solver searches every line over the rest of this turn, the opponent's turn and
up to 3 more of your turns. It reports **WIN** (with the line step by step),
**NO WIN**, or **TOO BIG** (the search hit its node limit). Opponent hate pieces
change what you are allowed to do.

It is a static site: plain ES modules, no build step, no dependencies.
`SPEC.md` is the full specification.

## Run it

- Locally: serve the folder over HTTP (ES modules don't load from `file://`),
  e.g. `python3 -m http.server`, then open http://localhost:8000/.
- Tests (Node ≥ 20): `npm test`

## GitHub Pages

Settings → Pages → Source: **Deploy from a branch** → Branch: **main**, folder **/ (root)** → Save.
All paths are relative, so the site works under `https://<user>.github.io/<repo>/`.

## v1 simplifications

- The opponent is passive: no counterspells, discard or removal from their hand.
  Only their permanents matter: Deafening Silence, Thalia, Gaddock Teeg,
  Chalice of the Void and Disruptor Flute.
- Spells resolve immediately with no responses. The only exception is the Thassa's
  Oracle trigger, which waits so you can act (cycle, crack a fetch, etc.) before it resolves.
- After a shuffle, the solver may choose a different follow-up for each possible
  order, as if it knew the new order. Lines that include a shuffle are marked ⚠.
  Treat them with suspicion: in a real game you would not know the order.
- Alternative costs (Force of Will, Daze) are not modelled. Those cards, and
  Doomsday, Force of Negation, Flusterstorm, Barrowgoyf, Jace, Leyline of the Void,
  Voice of Victory and any unknown card, do nothing: they can be drawn,
  discarded or sacrificed, but never cast.
- Fatal Push ignores revolt. Duress and Thoughtseize have no effect beyond going to the
  graveyard (and Thoughtseize's life loss).
- Some card texts were written from memory rather than checked against a source; `SPEC.md` §7
  marks which ones.

## Data

No game data from the Boris Doomsday MCP is stored in this repo. The only thing
taken from it is the default decklist in `src/defaultDeck.js`. Scenarios from
real games can be pasted into the Scenario JSON box, but they stay in your browser.
