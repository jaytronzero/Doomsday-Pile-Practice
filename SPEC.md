# Doomsday Pile Practice — Specification v1

This document is the single source of truth. Tests are written from it; the
implementation must satisfy it. If the spec is ambiguous, the implementer
must NOT guess silently: record the question in `SPEC_QUESTIONS.md`.

## 1. Purpose

You've just resolved Doomsday (Legacy, Turbo DD). You pick a 5-card pile and its
order. The program searches every line of play you could take over the
rest of this turn, the opponent's turn and up to `turnsAhead` more of your
turns. It reports whether a line exists that wins **no matter how any shuffle
turns out**, and shows that line step by step. The opponent's board
(hate pieces) changes what you're allowed to do.

The opponent is passive in v1: no counterspells, discard, or removal from their
hidden hand. Only their static permanents matter.

## 2. Tech constraints

- Plain ES modules, no build step, no runtime dependencies. Runs in a modern
  mobile browser and in Node ≥ 20.
- `package.json` has `"type": "module"` and `"test": "node --test"`.
- Tests use only `node:test` and `node:assert/strict`.
- Engine and solver are **pure**: no DOM, no `Math.random`, no global mutable
  state. `applyAction` never mutates its input state.
- Files: `src/cards.js`, `src/engine.js`, `src/solver.js`, `src/ui.js`,
  `index.html`, `style.css`, `tests/*.test.js`.

## 3. Setup (input) schema

```js
{
  deck: { "Card Name": count, ... },   // main deck AFTER sideboarding; every card in every zone
  hand: ["Card Name", ...],              // hand right after Doomsday resolved (Doomsday not in it)
  battlefield: [{ name: "Underground Sea", tapped: false }, ...],  // my permanents
  graveyard: ["Card Name", ...],         // BEFORE Doomsday resolves (it will be exiled unless piled)
  exile: ["Card Name", ...],
  manaPool: { W:0, U:0, B:0, R:0, G:0, C:0 },  // floating after paying for Doomsday; missing keys = 0
  lifeBeforeDoomsday: 20,
  landPlayedThisTurn: false,
  noncreatureSpellsCastThisTurn: 1,      // INCLUDING the Doomsday itself
  cavernType: "Merfolk",                 // creature type named by any Cavern of Souls I control
  opponent: { permanents: [ { name: "Chalice of the Void", x: 1 }, { name: "Disruptor Flute", named: "Street Wraith" }, ... ] },
  turnsAhead: 1                          // 0 = must win this turn; 1 = may also win next turn; max 3
}
```

Defaults: `manaPool` all 0; `landPlayedThisTurn` false;
`noncreatureSpellsCastThisTurn` 1; `cavernType` "Merfolk"; `opponent.permanents`
[]; `turnsAhead` 1; `graveyard`, `exile`, `battlefield`, `hand` [].

**Library before Doomsday** = deck − hand − battlefield − graveyard − exile − 1 Doomsday
(the copy on the stack), counted by name.

**Pile pool** = library-before-Doomsday + graveyard (multiset by name).

### Validation (`buildStartState` throws `Error` with a helpful message)
- Any zone count of a name exceeds the deck count, or the deck has no
  Doomsday to account for the one being cast.
- `pile` is not an array of names, or it has the wrong length: it must be exactly
  5 cards, or exactly the whole pool size if the pool has fewer than 5.
- The pile uses a card more times than the pool contains it.
- `lifeBeforeDoomsday` is not an integer ≥ 1.
- `turnsAhead` is not an integer in 0..3.
- An opponent permanent has a name not in §6, Chalice is missing an integer `x ≥ 0`,
  or Flute is missing `named`.
- Battlefield entries that aren't permanents (instants or sorceries).

## 4. Doomsday resolution (`buildStartState(setup, pile)`)

`pile[0]` is the **top** of the library.
- Library := `pile` in that order.
- Graveyard := `["Doomsday"]`. All other pool cards and the old graveyard are
  exiled. Doomsday goes to the graveyard last, so it IS there afterwards.
- Life := `lifeBeforeDoomsday − ceil(lifeBeforeDoomsday / 2)` (lose half, rounded up).
  If that is ≤ 0, the state is already lost.
- Phase = `main`, turn = 0, no pending choice, no pending trigger.

## 5. Game model

### 5.1 State (opaque to tests except via accessors below)
Must expose (as plain fields, read-only for tests):
`state.library` (array, index 0 = top), `state.hand` (array), `state.graveyard`,
`state.exile`, `state.battlefield` (array of `{name, tapped}`), `state.life`,
`state.pool` ({W,U,B,R,G,C} counts), `state.restricted` ({W,U,B,R,G} Cavern
mana counts), `state.phase` ('main' | 'opp'), `state.turn` (0 = Doomsday turn),
`state.landPlayed`, `state.noncreatureCast`, `state.pendingTrigger` (bool),
`state.pendingChoice` (null or object), `state.opponent.permanents`.

### 5.2 Phases and turns
- `main`: my main phase on my turn `state.turn`.
- `pass` from `main` (only with no pending trigger or choice): empty the mana pool and
  restricted pool, go to phase `opp` (the opponent's turn). Reset
  `noncreatureCast` to 0 (new turn). Opponent does nothing in v1.
- `pass` from `opp`: empty the pools, then start my turn `turn+1`. Untap all my
  permanents, reset `landPlayed=false` and `noncreatureCast=0`, then **draw a card**
  (§5.6).
- `pass` is NOT legal from `main` when `turn == turnsAhead` (no further turn
  can win), and not legal from `opp` unless `turn+1 ≤ turnsAhead`.
- Sorcery speed (cast sorcery, creature or artifact spells, play a land) is allowed only
  in `main` with no pending trigger and no pending choice.
- Instant speed (cast instants, cycling, mana abilities, fetchland activation) is allowed
  in `main` and `opp`, including while `pendingTrigger` is true, but never while
  `pendingChoice` is set.
- While `pendingChoice` is set, the ONLY legal actions are that choice's options.

### 5.3 Stack simplification
Spells and abilities resolve immediately when cast or activated, with no responses,
with ONE exception: the Thassa's Oracle ETB trigger. When Oracle enters, set
`pendingTrigger = true`. The player may take instant-speed actions, then take
`resolve_oracle`. Devotion and library size are measured **at resolution**.
`pass` is illegal while the trigger is pending.

### 5.4 Mana
- Pool colors: W U B R G C. Restricted (Cavern) mana is kept separately and may be
  spent only on a **creature spell that has the creature type `cavernType`**.
- Mana abilities are explicit actions (tapping a land, Petal, LED).
- Pools empty when the phase changes (`pass`). They do NOT empty
  when a trigger resolves or a choice is made.
- Costs: colored symbols plus generic. A `cast` action includes an explicit
  `payment` object (a color → count map, with Cavern mana as `rU`, `rB`, `rG`, `rW`, `rR`).
  `legalActions` returns one `cast` action per **distinct** valid payment.
  A payment is valid if it exactly covers the total cost after cost
  increases (§6), colored symbols get their color, and restricted mana is only used
  when allowed.
- Alternative costs (Force of Will, Daze): not modelled in v1. Those cards are dead (§7).

### 5.5 Losing and winning (`status(state)` → 'win' | 'loss' | 'ongoing')
- **win**: the Oracle trigger resolved with devotion to blue ≥ library size.
- **loss**: life ≤ 0, OR the player drew from an empty library (checked after the action
  that caused it finishes, so drawing 3 with Brainstorm from a 2-card library is a
  loss even if later steps of that action happen).
- Otherwise 'ongoing'. Win and loss states have no legal actions.
- If both would happen at once, loss wins. (Oracle can't win and lose at the same
  time in v1, but code defensively.)

### 5.6 Drawing
Draw = move `library[0]` to the end of the hand. If the library is empty, set the drew-from-
empty flag instead (→ loss).

### 5.7 Shuffles (randomness)
Any effect that shuffles the library makes `applyAction` return **one outcome
per distinct ordering** (permutations deduplicated by card name), each
`{ state, label }` with a label like `"library: Island, Swamp"`. The solver needs a
win in **every** outcome (AND node). Known v1 simplification: after a shuffle the
solver may choose different follow-ups per ordering (it "knows" the order). The UI
must flag lines containing a shuffle with ⚠.

### 5.8 Devotion
Devotion to blue = number of {U} symbols in the mana costs of my permanents
(Oracle = 2; lands, Petal, LED, Street Wraith = 0).

## 6. Opponent permanents (static effects)
| Name | Effect in model |
|---|---|
| Deafening Silence | I can't cast more than one noncreature spell per turn. Uses `noncreatureCast` (which counts Doomsday on turn 0 via setup). A countered spell still counts. |
| Thalia, Guardian of Thraben | My noncreature spells cost {1} more. Creature (MV 2). |
| Gaddock Teeg | My noncreature spells with MV ≥ 4 or {X} in their cost can't be cast. Creature (MV 2). |
| Chalice of the Void (`x`) | When I cast a spell with MV == x, it is countered (unless any Cavern of Souls colored mana paid for it — Cavern makes it uncounterable): the card goes to my graveyard (permanent spells too), the mana is spent, nothing else happens, and it still counts as cast for Deafening Silence. Lands aren't cast, so they're unaffected. |
| Disruptor Flute (`named`) | Spells with that name cost {3} more. Non-mana activated abilities of sources with that name can't be activated. **Cycling counts** (it is an activated ability of the card in hand) and **fetchland activation counts**. Mana abilities (lands, Petal, LED) are unaffected. |

Cost increases add generic mana and stack (Thalia + Flute = +4). Mana value never changes.

## 7. Cards (my side)

`src/cards.js` exports `CARDS` (name → def) and `cardDef(name)`, which returns a dead
def for unknown names. Each def has: `name, types[], subtypes[], cost` (e.g.
`{U:1, generic:1}`), `mv, supported` (bool), `verified` (bool: text checked
against a web source on 2026-11-18), `oracle` (string).

### Lands (play one per turn from hand; `tap` actions)
- **Island**: Basic Land — Island. {T}: Add {U}. *(recalled)*
- **Swamp**: Basic Land — Swamp. {T}: Add {B}. *(recalled)*
- **Underground Sea**: Land — Island Swamp. {T}: Add {U} or {B}. *(recalled)*
- **Undercity Sewers**: Land — Island Swamp. ({T}: Add {U} or {B}.) Enters tapped. When it
  enters, surveil 1 (look at the top card and you may put it into the graveyard) → pendingChoice
  `{kind:'surveil'}`, options keep or graveyard; with an empty library, no choice. *(verified)*
- **Cavern of Souls**: {T}: Add {C}. {T}: Add one mana of any color, spendable only on a
  creature spell of the chosen type (→ restricted pool). *(recalled; the uncounterable part is irrelevant in v1)*
- **Fetchlands**: {T}, Pay 1 life, Sacrifice: search for a land card with one of the listed
  types, put it onto the battlefield (untapped unless it enters tapped), then shuffle.
  Finding nothing is allowed; the library is still shuffled. Paying 1 life needs life ≥ 1.
  *(recalled)*
  Polluted Delta: Island/Swamp · Flooded Strand: Plains/Island · Bloodstained Mire:
  Swamp/Mountain · Misty Rainforest: Forest/Island · Scalding Tarn: Island/Mountain ·
  Verdant Catacombs: Swamp/Forest.
  Order: search → put onto battlefield → shuffle (AND outcomes) → then any ETB (Sewers surveil)
  becomes a pendingChoice in each outcome.

### Mana artifacts
- **Lotus Petal** {0} Artifact: {T}, Sacrifice: Add one mana of any color. *(recalled)*
- **Lion's Eye Diamond** {0} Artifact: Discard your hand, Sacrifice: Add three mana of any one
  color. Activate only as an instant. *(recalled)* Mana ability, so allowed at instant speed, also while
  the Oracle trigger is pending.

### Spells
- **Thassa's Oracle** {U}{U} Creature — Merfolk Wizard 1/3. ETB → pendingTrigger. On
  `resolve_oracle`: X = devotion to blue. If X ≥ library size → **win**. Otherwise look at the
  top X: choose up to one to put on top; the rest go to the bottom in random order (AND
  outcomes over orderings). *(verified)*
- **Street Wraith** {3}{B}{B} Creature — Wraith. Cycling—Pay 2 life (discard it from hand, pay 2 life,
  draw a card). Paying 2 life requires life ≥ 2. *(recalled)*
- **Edge of Autumn** {1}{G} Sorcery. If you control 4 or fewer lands, search for a basic land
  card, put it onto the battlefield tapped, then shuffle (no shuffle with 5+ lands).
  Cycling—Sacrifice a land (choose which land: one action per distinct land name+tapped state). *(verified)*
- **Dark Ritual** {B} Instant: Add {B}{B}{B}. *(recalled)*
- **Brainstorm** {U} Instant: Draw three cards, then put two cards from your hand on top of
  your library in any order → pendingChoice `{kind:'brainstorm'}` with one option per distinct
  ordered pair (first = new top). If the hand has fewer than 2 cards, put back all of them. *(recalled)*
- **Ponder** {U} Sorcery: Look at the top three cards (fewer if the library is smaller) and put them
  back in any order, OR shuffle. Then draw a card. One pendingChoice covering every distinct ordering
  plus `shuffle`. *(recalled)*
- **Consider** {U} Instant: Look at the top card; you may put it into the graveyard. Draw a card.
  *(recalled)*
- **Personal Tutor** {U} Sorcery: Search for a sorcery card (or none), reveal it, shuffle, put it on
  top. Outcomes: the chosen card fixed on top, the rest AND-shuffled. *(verified)*
- **Flow State** {1}{U} Sorcery: Look at the top three. Put one into your hand and the rest on the bottom
  in any order. If there is an instant card AND a sorcery card in your graveyard (checked on
  resolution, before Flow State itself goes there), put two into hand instead. The bottom order is
  chosen. *(verified)*
- **Unearth** {B} Sorcery: Return target creature card with MV ≤ 3 from your graveyard to the
  battlefield (Oracle → ETB trigger). Cycling {2}. Needs a legal target to cast. *(recalled)*
- **Duress** {B} Sorcery; **Thoughtseize** {B} Sorcery (you lose 2 life): target opponent.
  No modelled effect beyond going to the graveyard and the life loss. *(recalled)*
- **Fatal Push** {B} Instant: destroy target opponent creature with MV ≤ 2 (Thalia, Teeg). Revolt not
  modelled. Needs a target. *(recalled)*
- Spells go to the graveyard after resolving or being countered; permanents go to the battlefield.

### Dead in v1 (`supported:false`)
Doomsday (recasting it), Daze, Force of Will, Force of Negation, Flusterstorm, Barrowgoyf,
Jace, Wielder of Mysteries, Leyline of the Void, Voice of Victory, and any unknown name.
They can sit in any zone, be drawn, discarded or sacrificed, but they have no actions. Dead cards
still count for type checks where their type is known (Doomsday is a sorcery; Daze, Force of Will,
Force of Negation and Flusterstorm are instants) so Flow State and Personal Tutor see them correctly.

## 8. Engine API (`src/engine.js`)
```js
export function buildStartState(setup, pile) // → State (throws on invalid)
export function availablePile(setup)         // → { name: count } pile pool
export function legalActions(state)          // → Action[]
export function applyAction(state, action)   // → [{ state, label }]  (length ≥ 1)
export function status(state)                // → 'win' | 'loss' | 'ongoing'
export function stateKey(state)              // → string; equal for game-identical states
```
Action = plain object with `type` and `desc` (human-readable, e.g. "Cycle Street Wraith (pay 2 life)").
Types: `play_land {card}`, `tap {card, color}` (also Cavern's `rU`-style colors), `sac_petal {color}`,
`activate_led {color}`, `crack_fetch {card, find}` (find = land name or null), `cast {card,
payment, target?}`, `cycle {card, sacrifice?}`, `resolve_oracle`, `choose {option}`, `pass`.
- `legalActions` returns no duplicates (same `type`+params) and never returns an illegal action.
- `applyAction` with an illegal action throws.
- Applying an action never mutates the input state (deep-frozen inputs must work).
- `stateKey` ignores history, hand order and graveyard order; it includes library order.

## 9. Solver API (`src/solver.js`)
```js
export function solve(state, { maxNodes = 200000 } = {})
// → { result: 'win' | 'no_win' | 'aborted', plan, nodes }
```
- OR over the player's actions, AND over the outcomes of one action. Memoize on `stateKey`.
- `plan` (only when result == 'win'):
  `{ kind:'win' }` |
  `{ kind:'step', action, then: plan }` (a deterministic action) |
  `{ kind:'branch', action, outcomes: [{ label, plan }] }` (a random action; every outcome is a win).
- Deterministic: the same input gives the same plan. Prefer the **shortest** winning line (fewest
  actions in the worst case), with ties broken by `legalActions` order.
- Search is finite: the turn limit plus a finite library makes every path end. 'aborted' when
  nodes > maxNodes.
- `explain(plan)` exported: returns a list of strings, one per step, with turn/phase headers
  ("Turn 0 (Doomsday turn)", "Opponent's turn", "Turn 1"), indenting branches.

## 10. UI (`index.html`, `src/ui.js`, `style.css`)
Mobile-first single page:
1. **Deck** textarea ("4 Brainstorm" lines; a "Sideboard" line ends the main deck).
   Pre-filled with the default Turbo DD list in `src/defaultDeck.js`.
2. **Board at Doomsday**: hand (multi-select with counts), my battlefield (with a tapped toggle),
   floating mana, life before DD, land played, noncreature spells cast, Cavern type.
3. **Opponent board**: checkboxes for the §6 pieces, plus an input for Chalice X and Flute name.
4. **Turns ahead**: 0–3.
5. **Pile builder**: 5 selects (top → bottom), each limited to the remaining pile pool;
   shows pool counts.
6. **Check pile** button → result banner (WIN / NO WIN / TOO BIG) and the `explain` output.
   ⚠ if the plan contains a branch.
7. **Scenario JSON** export/import (textarea) so game states from Boris's data can be pasted in.
Errors from `buildStartState` are shown inline. The solver runs synchronously
with a node limit; the UI must stay responsive for typical inputs (< 2 s).

## 11. Canonical puzzles (hand-checked; tests MUST include these)
Deck for A–F: `{ "Doomsday":4, "Thassa's Oracle":2, "Street Wraith":4, "Island":4, "Swamp":4,
"Underground Sea":4, "Brainstorm":4, "Dark Ritual":4, "Ponder":4, "Lotus Petal":4,
"Lion's Eye Diamond":1, "Consider":4, "Unearth":2, "Personal Tutor":3, "Flow State":4,
"Edge of Autumn":2, "Polluted Delta":4, "Undercity Sewers":2 }` (60).

- **A (win via cycling):** hand `[Thassa's Oracle, Street Wraith]`, pool `{U:2}`, life before 20
  (→10), pile `[Street Wraith, Street Wraith, Island, Island, Island]`, turnsAhead 0.
  Cycle ×3 (lib 5→2, life 10→4), cast Oracle UU, resolve → **win**.
- **B (life boundary):** same as A with life before 14 (→7): win (7→5→3→1).
  Life before 13 (→6): **no_win**. Life before 12 (→6): **no_win**.
- **C (Silence is irrelevant):** A + Deafening Silence → **win** (Oracle is a creature; cycling isn't casting).
- **D (Flute on Wraith):** A + Disruptor Flute named "Street Wraith" → **no_win**.
- **E (Flute on Oracle):** A + Flute named "Thassa's Oracle" → **no_win** (UU+3 > pool).
- **F (Chalice 2):** A + Chalice x=2 → **no_win** (Oracle countered).
- **G (cycling with Oracle trigger on the stack):** hand `[Thassa's Oracle, Street Wraith]`, pool `{U:2}`, life 20,
  pile `[Street Wraith, Street Wraith, Island, Island, Island]`. A win exists where Oracle is cast FIRST and
  all three cycles happen while the trigger is pending: check with a test that drives
  the actions by hand (cast Oracle → cycle, cycle, cycle → resolve_oracle → status 'win').
- **H (next-turn win needs the pass):** hand `[Street Wraith]`, battlefield
  `[{Underground Sea, tapped:true}, {Underground Sea, tapped:true}]`, pool `{}`, life 20 (→10),
  pile `[Street Wraith, Street Wraith, Thassa's Oracle, Island, Island]`.
  - turnsAhead 0 → **no_win** (no mana for Oracle this turn).
  - turnsAhead 1 → **win**. One line: on the opponent's turn cycle Wraith (draw Wraith, lib 4, life 8),
    cycle again (draw Wraith, lib 3, life 6), cycle again (draw Oracle, lib 2, life 4). Turn 1: untap,
    draw Island (lib 1), tap both Seas for UU, cast Oracle, resolve: devotion 2 ≥ 1 → win.
    (Cycling on my own turn 0 works too. The test asserts only `result === 'win'` and that replaying
    the plan's actions reaches status 'win'.)
- **H2 (draw step kills):** hand `[]`, battlefield two tapped Underground Seas, pool `{}`, life 20, pile
  `[Thassa's Oracle, Island, Island, Island, Island]`, turnsAhead 1 → **no_win** (draw Oracle,
  lib 4 > devotion 2).
- **I (Brainstorm empty-library loss):** deck `{Doomsday:1, Brainstorm:1, Island:2}`, hand `[Brainstorm]`,
  pool `{U:1}`, life 20, pile `[Island, Island]` (the pool has only 2 cards, so the pile is 2).
  Casting Brainstorm → status 'loss' (it draws 3 from 2). Solver → no_win.

## 12. Resolutions to SPEC_QUESTIONS.md (binding)
- **Q1/Q2/Q3:** EVERY in-resolution decision is a `pendingChoice`: Consider (`kind:'consider'`),
  Flow State (`'flow_state'`: which card(s) go to hand plus bottom order, as one option), Personal Tutor
  (`'personal_tutor'`, including "none"), Edge of Autumn search (`'edge_search'`, including "none"),
  Oracle's non-winning top choice (`'oracle_top'`, including "none"), plus `surveil`, `brainstorm`,
  `ponder`. `choose.option` is an opaque JSON-serialisable value taken from `legalActions`.
  A choice with exactly one option is still a pendingChoice. A choice with zero options (e.g. surveil
  on an empty library) is skipped.
- **Q4:** the count is SUMMED across zones: hand + battlefield + graveyard + exile + 1 (the Doomsday on the stack)
  must be ≤ deck count for every name, or it throws.
- **Q5:** `cycle` takes an optional `payment` for mana cycling costs (Unearth {2}). One action per distinct payment.
- **Q6:** Street Wraith can be cast as a creature for {3}{B}{B}.
- **Q7:** Edge of Autumn may find nothing; it still shuffles (with ≤ 4 lands).
- **Q9:** G, H and H2 use the canonical deck.
- **Q10:** the test script is `node --test` (fixed).
- **Q11:** `turn` stays N during the opponent's turn after my turn N.
- **Q12:** "shortest" counts every action, including taps, passes, chooses and resolve_oracle.
- **Q13:** types are lowercase in cards.js (`'creature'`, `'land'`, `'instant'`, `'sorcery'`, `'artifact'`).
