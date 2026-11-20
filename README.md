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

## v2 simplifications (adversary and board hate; SPEC_V2_API.md §13, SPEC_QUESTIONS.md v2)

- Everything aimed at the Oracle trigger (Stifle, Consign to Memory, removal, Endurance) is used when
  you pass priority with the trigger on the stack (W-oracle), never earlier (V2-Q2).
- Removal only targets a Thassa's Oracle whose trigger is pending; Lightning Bolt can also hit you (V2-Q3).
- Kozilek's Command is three packages: exile Oracle (X=2), make you draw (X=0), exile one graveyard
  card (X=1) (V2-Q4). Surgical Extraction has four zone variants. Flusterstorm's copies are one combined tax.
- The clock is the sum of the opponent's creature power at the start of each of their turns. No blocks,
  no Mobilize, exalted, prowess or first strike (V2-Q5, V2-Q6).
- The opponent's own spells are never taxed by Thalia, Sphere, Trinisphere, Damping Sphere, Silence or
  Archon (V2-Q7).
- Wasteland and Ghost Quarter act only at the start of the opponent's turn and of your turn, and you
  can't tap the land in response (V2-Q8).
- Alternative costs: any blue land counts as an Island for Daze, any black land as a Swamp for Snuff
  Out, and a pitch spell (Force of Will, Force of Negation, Solitude, Endurance, Unmask) can pitch an unknown
  card whenever their hand size is at least 2. Phyrexian mana is paid with life first (V2-Q10).
- Hullbreacher's Treasures pay like mana of any colour, but not {C} (V2-Q11).
- Torpor Orb also stops the opponent's ETBs: a Bowmasters flashed in does not ping, and an Endurance
  only adds a body (V2-Q12).
- There is no upkeep window for you before your draw step (V2-Q14).
- Not modelled: Teferi's −3, Narset's −2, Phelia's flicker, Dauthi Voidwalker's sacrifice ability,
  Cabal Therapy's flashback, Hexing Squelcher's ward, the opponent's creatures pinging their own
  permanents (V2-Q15).
- The interaction grade uses `deckEstimate` exactly as given (no padding to 60) (V2-Q16). Only pairs whose
  two singles both win are solved, and a hand is judged by its singles and pairs alone (monotonicity).
  Pact of Negation's upkeep only comes if the search reaches the opponent's next turn (V2-Q20).
- A fetchland commits to the land it searches for when you crack it. If Surgical Extraction exiles that
  land from your library in response, the fetch finds nothing.
- Your Duress and Thoughtseize still don't take cards from the opponent's modelled hand.
- One action may create at most 50,000 random orderings (for example Endurance followed by Surgical
  Extraction on a big library). Past that, the check reports TOO BIG (unknown), never a win.

## Data

No game data from the Boris Doomsday MCP is stored in this repo. The only thing
taken from it is the default decklist in `src/defaultDeck.js`. Scenarios from
real games can be pasted into the Scenario JSON box, but they stay in your browser.
