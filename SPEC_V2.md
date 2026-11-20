# Doomsday Pile Practice — Specification v2 (practice on real boards)

v2 EXTENDS SPEC.md (v1). Everything in v1 stays binding unless this file changes it.
Where they conflict, v2 wins. Card behaviour must match the verified Oracle text in
`src/oppCards.js` / `docs/card-sources.md`. If a card's modelled behaviour below disagrees
with its verified text, the TEXT wins: raise it in SPEC_QUESTIONS.md.

## 1. Goal
Practice pile building on **real logged boards**. The app deals a real board as it stood the
moment Doomsday resolved. You build a pile, then it reveals:
1. **Goldfish grade**: does your pile win against the opponent's visible board, the clock
   (their attackers) and their visible activated abilities (Wasteland)? It shows the winning line,
   as in v1.
2. **Interaction grade**: an estimated chance your pile wins once the opponent's hidden hand
   is taken into account, with a breakdown by card ("loses to Stifle (est. 38% they hold one)").
3. **What actually happened**: the pile that was really played, its own grades on the same board,
   and how that game ended.
Attempts are tracked per board.

## 2. Scenario format (`data/scenarios.json`: `{ version: 2, scenarios: [Scenario] }`)
```js
Scenario = {
  id: "5480",                       // game id from the data source
  source: { player: "Jaytron", date: "2026-11-14", deck: "UB Tempo DD", oppDeck: "Eldrazi Stompy",
            gameNumber: 2, onPlay: true },   // NO opponent username, ever
  setup: { ...v1 Setup... ,         // my side, exactly as v1 §3, plus:
    opponent: {
      permanents: [ { name, tapped?:bool, power?:int, toughness?:int, x?:int, named?:string, counters?:int } ],
      graveyard: [names], exile: [names],
      life: 20,
      handSize: 4,                  // opponent's hand size when Doomsday resolved
      lands: { untapped: 2, total: 4, colors: "UB" },  // mana available now / after their untap
      deckEstimate: { "Force of Will": 4, ... },       // estimated 60-card main deck (see §6)
      deckEstimateSource: "max copies seen per game across N logged games of this archetype"
    }
  },
  actual: {
    pile: ["Street Wraith", ...],   // 5 names
    pileOrdered: false,             // true only if the log records the order
    result: "win" | "loss",         // that game's result
    winBy: "normal" | "concession" | "opponent_left" | ...,
    turnsAfterDoomsday: 1           // if known, else null
  },
  warnings: ["Opponent permanent 'Foo' not modelled: ignored"]
}
```
`buildStartState(setup, pile)` accepts the extended opponent object. Unknown opponent permanents
NO LONGER throw. They are kept, have no effect, and `buildStartState` returns their names in
`state.warnings`. Their `power` still counts for the clock if given (§4).

## 3. Opponent board: static effects (additions to v1 §6)
Each entry is defined by its verified text. The model's scope:
- **Cost / spell-count taxes:** Thorn of Amethyst, Sphere of Resistance, Trinisphere,
  Damping Sphere (the "per other spell this turn" part; its land clause too, if relevant), Archon of
  Emeria (the "one spell per turn" part), together with v1's Thalia, Deafening Silence, Gaddock Teeg, Chalice
  and Disruptor Flute. Trinisphere applies after the other increases.
- **Ability locks:** Pithing Needle (named), Collector Ouphe and Karn, the Great Creator (my artifacts'
  activated abilities, which kills Petal and LED; follow the text on mana abilities exactly),
  Grafdigger's Cage (Unearth on a creature card fails or can't target per text), Torpor Orb (Oracle's ETB
  doesn't trigger), Teferi, Time Raveler (my spells only at sorcery speed; cycling still allowed).
- **Draw locks:** Narset, Parter of Veils (I can't draw more than one card each turn; per text), Hullbreacher
  (per text: my non-draw-step draws are replaced), Orcish Bowmasters on the battlefield (per text: whenever
  I draw except my first draw in my draw step, it deals 1 damage; the adversary picks the target, which is me
  unless killing Oracle with the trigger pending is better: Oracle has toughness 3, so track damage on it).
- **Land hate:** Blood Moon and Magus of the Moon (my nonbasic lands are Mountains: Underground Sea /
  Undercity Sewers / Cavern / fetches tap for {R} only and fetches lose their ability), Back to Basics (my
  nonbasic lands don't untap).
- **Graveyard:** Tormod's Crypt (adversary activation: exile my graveyard at any priority window, once).
- **Unknown permanents:** no effect + a warning.

## 4. The clock
At the START of each opponent turn (on `pass` from main, before my instant window on their turn), every
opponent creature attacks: I lose life equal to the sum of their power. Use the scenario's `power` if
given, else the card's printed power from OPP_CARDS. Variable power (`*`) without a scenario value counts
as 0, plus a warning. No blocks are modelled (conservative: Oracle never blocks). Creatures entering
during the game don't attack that turn unless haste. Bowmasters tokens are permanents in the scenario with a
`power`. If my life ≤ 0 → loss.

## 5. Adversary (the opponent acts)
v1's passive opponent becomes an **adversary**: at defined windows it may take actions, and the solver
treats its choices as AND nodes (a pile wins only if it beats every adversary choice, including "do nothing").

### 5.1 Opponent resources in state
`state.opp = { hand: [names], manaAvailable: int, colors: "WUBRG subset", life, used: {...},
handSize }`. `hand` holds the CONCRETE interaction cards for this solve (§6 decides them). Other unknown
cards in their hand don't matter. `manaAvailable` starts at `lands.untapped`, resets to `lands.total` at
the start of each opponent turn, and resets again to `lands.total` at the start of my next turn if they didn't
use it (simplification: assume they untap; v2 doesn't model them tapping out on their own turn
for their own threats).

### 5.2 Windows (the adversary may act at each; "act" = use one or more held cards/abilities legally)
- **W-cast:** right after I cast a spell (counters, Mindbreak Trap, Bowmasters flash in response…).
- **W-ability:** right after I activate a non-mana ability (cycling, fetch) or a triggered ability of mine goes on the
  stack (Oracle ETB, Sewers surveil) → Stifle / Consign to Memory etc. per text.
- **W-oracle:** when I take `resolve_oracle` (I pass priority with the trigger on the stack) → removal on Oracle,
  Stifle, Surgical, Bolt. If they act, I get an instant-speed window again (`pendingTrigger` stays) before
  `resolve_oracle` can be taken again. They can't act twice with the same card.
- **W-oppturn:** at the start of their turn, after combat damage: discard spells (sorcery speed), Wasteland,
  Ghost Quarter, Tormod's Crypt. I get an instant-speed window in response to each discard spell before it
  resolves (a new pending state `pendingOppSpell`).
- **W-myturn:** at the start of my turn, after untap and before my draw: Wasteland/Ghost Quarter/instants.
A visible activated ability (Wasteland, Ghost Quarter, Tormod's Crypt) needs no hand card. It is in
`opponent.permanents` and can be used once (sacrificed) at any window per its text.

### 5.3 Paying for my spells against "unless" counters
Daze, Spell Pierce, Flusterstorm (per copy), Mana Leak-style: I get a pendingChoice `pay_or_not`.
"Pay" is legal only if I can pay right now from my pool + untapped mana sources (mana abilities may be activated
as part of paying). Cavern-paid creature spells can't be countered at all (v1 rule).

### 5.4 Hidden-hand cards modelled in v2 (exact behaviour from verified text)
Counters: Force of Will, Force of Negation (free only on my turn), Daze, Spell Pierce, Flusterstorm,
Pyroblast, Red Elemental Blast, Spell Snare, Pact of Negation, Mindbreak Trap, Mental Misstep, Kozilek's
Command (only the modes the text allows), Consign to Memory, Stifle.
Removal: Swords to Plowshares, Fatal Push, Snuff Out, Dismember, Solitude, Lightning Bolt (damage on Oracle),
Sink into Stupor (if its text can hit Oracle) and any other verified instant that can remove Oracle.
Graveyard: Surgical Extraction (per text, including the library search and shuffle).
Discard (their turn): Thoughtseize, Duress, Inquisition of Kozilek, Unmask, Cabal Therapy, Collective Brutality
(every mode per text, including life loss).
Flash: Orcish Bowmasters (ETB + draw trigger per text).
Free/alternative costs per text: Force of Will (they need another blue card: assume yes if handSize ≥ 2),
Force of Negation, Solitude (needs another white card: same assumption), Snuff Out (per text), Daze (needs an
untapped-or-tapped Island they control: per the text and their lands), Mindbreak Trap condition,
Pact of Negation, Unmask (needs another black card: same assumption), Mental Misstep/Dismember/Surgical
(Phyrexian mana: they pay life).
Mana costs use `manaAvailable` (count) and `colors` (has the color).
Any card outside this list in their deck estimate: ignored for grading (listed in the reveal as "not modelled").

## 6. Interaction grade (probability)
- **Unseen pool** U = deckEstimate − (opponent battlefield + graveyard + exile, by name, floored at 0). Size N.
- **Relevant set** R = cards in U that are in §5.4 and castable in principle (colors). For each r ∈ R with
  count k_r.
- Solve the scenario with `opp.hand = []` (goldfish), then for each r: `opp.hand = [r]` (single), then for each
  unordered pair {r, s} (r may equal s if k_r ≥ 2): `opp.hand = [r, s]`.
- Monotonicity assumption (documented): a hand containing a losing single or a losing pair loses. A hand
  whose relevant cards include no losing single and no losing pair is treated as a win.
- **P(win)** = Σ over relevant-card count vectors of the hand (multivariate hypergeometric over R ∪ {other},
  hand size h) × win(vector). Computed exactly by enumeration (h ≤ 9, |R| small).
- Output: `{ pWin, goldfish, singles: [{card, wins, pHold}], pairs: [{cards, wins}], notModelled: [...],
  assumptions: [...] }`, where pHold = P(hand has ≥ 1 copy).
- All numbers are labelled **estimates** in the UI ("est."), with the deckEstimate source shown.
- Budget: the whole grade must finish in < 10 s in Node for typical boards. If a sub-solve aborts, that
  single/pair is "unknown" and pWin is reported as a range [low, high] (unknown counted as loss / win).

## 7. Practice mode (UI)
- Loads `data/scenarios.json` (relative URL). If missing or empty, a clear message plus a "Load scenarios file"
  input. Bundled `data/sample-scenarios.json` holds hand-made samples (clearly marked SAMPLE) so the
  mode works before real data arrives.
- Filters: my deck (Turbo/Tempo/...), opponent archetype, player.
- Deal: random scenario (seeded; skip ones already solved correctly unless "repeat all").
- Board view: my hand, my battlefield (tapped state), floating mana, life after Doomsday, turn/on-play,
  the opponent's permanents (with power), graveyard, hand size, lands untapped/total, deck name, warnings.
  The pile pool with counts.
- Pile builder (5 ordered selects, as in v1). Submit → runs goldfish + interaction grade in the Web Worker
  (cancel button). Reveal per §1, including the actual pile's grades (if `pileOrdered` is false, grade
  the best order of the actual 5 cards: try all distinct orders, max 120).
- Stats in localStorage (try/catch; works if storage is unavailable): attempts, goldfish-win rate,
  average est. P(win), per-scenario best.
- The v1 manual "Board editor" stays as a second tab ("Sandbox").

## 8. Exporter (`tools/export-scenarios.mjs`), built when the data source works
Takes a JSON dump of games (one file per game, produced by the lead from the Boris MCP `game` tool) and writes
`data/scenarios.json`. Pure function `gameToScenario(gameJson)` with tests on fixtures. It strips opponent
usernames, keeps only player ∈ {Jaytron, boryas}, and only games with `my_dd_resolved=1` and a known pile. Blocked
until the `game` tool works; its input format will be specified then.

## 9. Testing requirements
As v1: tests first (node:test), from this spec and the verified texts; every modelled opponent card gets at
least one behaviour test plus one solver-level test proving it changes a verdict; the probability math gets
exact-fraction tests on tiny decks; monotonicity, budgets and determinism get tests too; the v1 suite must stay
green. No opponent username may appear anywhere in data/ (test it).

## 10. Additions after card verification (binding; see docs/card-sources.md)
The behaviour of every card listed here follows its verified text in `src/oppCards.js`.
- **Also modelled (hidden hand):** Endurance (flash, evoke for free per text; adversary may put MY graveyard
  on the bottom of MY library, e.g. in response to the Oracle trigger), Pyroblast and Red Elemental Blast
  (both modes: counter a blue spell, OR destroy a blue permanent such as Oracle with the trigger pending),
  Kozilek's Command (every mode per text, including making me draw), Sink into Stupor (bounce a spell or
  permanent per text; Cavern doesn't stop a bounce), Mindbreak Trap (exiles: Cavern doesn't stop it),
  Consign to Memory (per text, including colorless spells like Petal and LED).
- **Also modelled (board):** Voice of Victory (per text: I can't cast spells during their turn), Dauthi
  Voidwalker (per text: my cards that would go to the graveyard are exiled with void counters instead; this
  affects Unearth and Flow State's graveyard check), Goblin Guide (its attack trigger reveals my top card and
  if it's a land puts it in my hand: this matters during the opponent's attack), Archon of Emeria (one spell
  each turn, Oracle included; my nonbasic lands enter tapped), Ghost Quarter (the basic search is optional; if I
  search, my library shuffles: this is MY choice, so it's an OR node for me).
- **Corrections to src/cards.js** found by re-verification: fix the oracle strings of Fatal Push, Consider,
  Street Wraith and Flusterstorm to match docs/card-sources.md exactly; Voice of Victory's subtypes are
  Human Bard. Thoughtseize and Fatal Push may target any player or creature per their text: the model keeps
  them opponent-only (a documented simplification).
- `src/oppCards.js` cost is a printed string ("{1}{B/P}{B/P}"). The engine parses it (hybrid, Phyrexian, {X},
  {C}) to work out mana value checks and what the opponent can pay.
