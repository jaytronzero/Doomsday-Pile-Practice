# Doomsday Pile Practice — v2 API (binding for the implementer)

This file fills in what SPEC_V2.md leaves open. It EXTENDS the v1 API (SPEC.md §8/§9):
nothing in v1's API is removed or renamed. The v2 tests (`tests/v2-*.test.js`) are written
against this file. Card behaviour still comes from the verified text in `src/oppCards.js`.
Where this file simplifies a card, it says so (§13); open points are in SPEC_QUESTIONS.md "v2".

## 1. Modules and exports

| Module | Exports |
|---|---|
| `src/engine.js` (extended) | v1 exports unchanged: `buildStartState, availablePile, legalActions, applyAction, status, stateKey` |
| `src/solver.js` (extended) | v1 exports unchanged: `solve, explain` |
| `src/opponent.js` (new) | `MODELLED_HAND_CARDS`, `MODELLED_PERMANENTS`, `parseCost`, `castableInPrinciple` |
| `src/grade.js` (new) | `grade`, `unseenPool`, `pHold`, `handWinProbability`, `handVerdict`, `pairKey` |
| `src/scenario.js` (new) | `validateScenario`, `validateScenarioFile` |

### 1.1 `src/opponent.js`
```js
export const MODELLED_HAND_CARDS   // frozen array, exactly these 30 names (SPEC_V2 §5.4 + §10):
  // 'Force of Will','Force of Negation','Daze','Spell Pierce','Flusterstorm','Pyroblast',
  // 'Red Elemental Blast','Spell Snare','Pact of Negation','Mindbreak Trap','Mental Misstep',
  // "Kozilek's Command",'Consign to Memory','Stifle',
  // 'Swords to Plowshares','Fatal Push','Snuff Out','Dismember','Solitude','Lightning Bolt',
  // 'Sink into Stupor','Surgical Extraction',
  // 'Thoughtseize','Duress','Inquisition of Kozilek','Unmask','Cabal Therapy','Collective Brutality',
  // 'Orcish Bowmasters','Endurance'
export const MODELLED_PERMANENTS   // frozen array, exactly these 28 names:
  // v1: 'Deafening Silence','Thalia, Guardian of Thraben','Gaddock Teeg','Chalice of the Void','Disruptor Flute',
  // v2: 'Thorn of Amethyst','Sphere of Resistance','Trinisphere','Damping Sphere','Archon of Emeria',
  //     'Pithing Needle','Collector Ouphe','Karn, the Great Creator',"Grafdigger's Cage",'Torpor Orb',
  //     'Teferi, Time Raveler','Narset, Parter of Veils','Hullbreacher','Orcish Bowmasters',
  //     'Blood Moon','Magus of the Moon','Back to Basics',"Tormod's Crypt",'Wasteland','Ghost Quarter',
  //     'Voice of Victory','Dauthi Voidwalker','Goblin Guide'
export function parseCost(cost)      // printed cost string → parsed cost (below)
export function castableInPrinciple(name, colors) // → bool (§11.2)
```
`parseCost(s)` returns a plain object with exactly these keys:
```js
{ generic: int,                       // sum of numeric symbols ({0} adds 0)
  colored: { W, U, B, R, G, C },      // single-colour symbols; {C} counts under C; all keys present
  hybrid: [[a, b], ...],              // {B/G} → ['B','G'] in printed order
  phyrexian: { W, U, B, R, G },       // {B/P} counts under B; all keys present
  x: int }                            // number of {X} symbols
```
`''` (lands) parses to all zeros. Mana value of a parsed cost = generic + Σcolored + hybrid.length +
Σphyrexian (X = 0), and must equal `OPP_CARDS[name].mv` for every card.

## 2. Setup additions (`buildStartState(setup, pile)`)
New optional top-level fields:
- `spellsCastThisTurn` (int ≥ 0): spells of any type I cast this turn, Doomsday included.
  Default: the value of `noncreatureSpellsCastThisTurn` (so 1 by default).
- `cardsDrawnThisTurn` (int ≥ 0): cards I drew this turn before Doomsday resolved. Default 1.

`setup.opponent` (all optional except where noted):
```js
{ permanents: [ { name, tapped?, power?, toughness?, x?, named?, counters? } ],  // default []
  hand: [names],          // CONCRETE hidden-hand cards for this solve (default []); each ∈ MODELLED_HAND_CARDS
  handSize: int,          // default hand.length; must be ≥ hand.length
  lands: { untapped, total, colors },  // default {untapped:0,total:0,colors:''}; 0 ≤ untapped ≤ total;
                          // colors: string of distinct letters from "WUBRGC" ('C' = colourless sources)
  life: int,              // default 20, ≥ 1
  graveyard: [names], exile: [names],          // default []; used by grade() only
  deckEstimate: {name: count}, deckEstimateSource: string }  // used by grade() only
```
Validation (throws `Error`), in addition to v1's: an `opponent.hand` name not in `MODELLED_HAND_CARDS`;
`handSize` < `hand.length` or not an int; bad `lands`/`colors`/`life`; a permanent `power` that is
present but not an int ≥ 0; Pithing Needle without a string `named` (like Flute); Chalice/Flute as v1.
**Unknown opponent permanents no longer throw** (SPEC_V2 §2).
Wasteland / Ghost Quarter listed in `permanents` are NOT included in `lands` (the exporter excludes them).

## 3. State additions
v1 fields are unchanged. New plain fields (read-only for tests):
```js
state.opp = { hand: [names], handSize, manaAvailable, landsTotal, colors, life, treasures, spellsCast }
   // manaAvailable starts at lands.untapped; landsTotal = lands.total; treasures 0;
   // spellsCast = spells the OPPONENT cast this turn (reset at every turn start).
   // Implementation-private extra fields are allowed (e.g. pending Pact upkeeps).
state.warnings        // [string]; one per unmodelled opponent permanent name, and per variable-power
                      // creature without a scenario power (§5). Each warning contains the card name.
state.spellsCast      // my spells cast this turn (all types, countered ones included)
state.drawsThisTurn   // cards I actually drew this turn
state.pendingOppSpell // null | { card, mode? } : an opponent sorcery-speed spell waiting to resolve (§8.6)
state.battlefield[i].damage // optional int, damage marked this turn (only tracked on my creatures)
state.opponent.permanents   // scenario entries keep all their given fields
```
`stateKey` must distinguish states that differ in any of these (except `warnings`).
Default `state.opp.colors` etc. come from §2 defaults. Counters `spellsCast`, `drawsThisTurn`,
`opp.spellsCast` and all `damage` reset at every turn start.

## 4. Static opponent permanents (my side of the rules)
"Nonbasic" = my `Underground Sea`, `Undercity Sewers`, `Cavern of Souls` and fetchlands.
| Name | Model |
|---|---|
| Thorn of Amethyst | my noncreature spells cost {1} more |
| Sphere of Resistance | my spells cost {1} more |
| Damping Sphere | my spells cost {1} more per `state.spellsCast` (spells I already cast this turn). Land clause: no effect (my lands make 1 mana) |
| Trinisphere | if its entry is not `tapped: true`: after all other increases, a total cost below 3 becomes 3 (extra is generic) |
| Archon of Emeria | I can't cast a spell if `state.spellsCast ≥ 1`. My nonbasic lands enter tapped (played or fetched) |
| Pithing Needle (`named`) | as Flute's ability clause: no `cycle` of that name, no `crack_fetch` of that name. No tax |
| Collector Ouphe, Karn, the Great Creator | no `sac_petal`, no `activate_led` (artifact mana abilities). Casting is unaffected |
| Grafdigger's Cage | Unearth may be cast at a creature card, but on resolution the card stays in the graveyard (no ETB) |
| Torpor Orb | creatures entering cause no ETB triggers: Oracle sets no `pendingTrigger`; also no Bowmasters / Solitude / Endurance ETB for the opponent |
| Teferi, Time Raveler | I may cast spells only at sorcery timing: phase `main`, no pendingTrigger / pendingChoice / pendingOppSpell. Abilities (cycling, fetches, mana) unaffected |
| Voice of Victory | I can't cast spells while `phase === 'opp'` |
| Narset, Parter of Veils | a draw of mine does not happen if `drawsThisTurn ≥ 1` (§6) |
| Hullbreacher | a draw of mine other than the first draw of my draw step is replaced: no card moves, `opp.treasures += 1` (§6) |
| Orcish Bowmasters | each draw of mine other than the first draw of my draw step triggers it (§6) |
| Blood Moon, Magus of the Moon | my nonbasic lands on the battlefield tap only for `R` (Cavern: only `R`, no restricted mana); fetchlands can't be cracked; Undercity Sewers enters untapped and doesn't surveil (Scryfall Blood Moon rulings, 2020-08-07) |
| Back to Basics | my nonbasic lands don't untap in my untap step |
| Dauthi Voidwalker | every card of mine that would go to my graveyard goes to my exile instead. At Doomsday resolution this includes Doomsday itself: start graveyard `[]`, Doomsday in exile. Its sacrifice ability is not modelled |
| Goblin Guide | its attack trigger (§5) |
| Tormod's Crypt, Wasteland, Ghost Quarter | adversary abilities (§8.4) |
| v1 five | unchanged |
Cost order: v1 increases (Thalia, Flute) + Thorn + Sphere + Damping, then Trinisphere. Chalice reads mana value, never cost.

## 5. Turn structure and the clock
`pass` from `main` (illegal while `pendingOppSpell` is set), in this order:
1. v1 effects (pools empty, phase `opp`); reset `spellsCast`, `drawsThisTurn`, `opp.spellsCast`, all damage.
2. `opp.manaAvailable = opp.landsTotal`.
3. Pact upkeeps due (§8.5).
4. Combat: each Goblin Guide reveals my top card; a land card moves to the END of my hand (not a draw).
   Then I lose life = Σ attack power of every opponent permanent. Attack power: the entry's int `power`
   if given; else OPP_CARDS printed power if the card is a creature with a numeric power; else 0
   (variable power `*` without a scenario value → 0 plus a `state.warnings` entry made by buildStartState).
   Creatures added during the game (Bowmasters, Orc Army, hard-cast Solitude/Endurance) attack too.
5. If not lost: window **W-oppturn** (§8).

`pass` from `opp`: v1 effects (pools empty, untap — Back to Basics exempts nonbasics — `landPlayed=false`,
`turn+1`), reset the counters of step 1, `opp.manaAvailable = opp.landsTotal`, window **W-myturn**,
then my draw step (the first draw of my draw step). If a W-myturn action leaves a pendingChoice
(Ghost Quarter), the draw step happens when that choice is made.

## 6. My draws
Every draw of mine goes through, in order: Narset (skip if `drawsThisTurn ≥ 1`) → Hullbreacher (replace if
not the draw-step draw) → the v1 draw (`drawsThisTurn += 1`; empty library → loss) → each Bowmasters on the
opponent's battlefield triggers if it was not the draw-step draw. A Bowmasters trigger = 1 damage to a
target the adversary picks (AND outcomes): `'me'` (life −1), or, only while `pendingTrigger` is true,
my Thassa's Oracle (`damage += 1`; at damage ≥ 3 it dies → graveyard). Then amass Orcs 1: if the
opponent has a permanent named `Orc Army`, its `power` and `toughness` +1, else add
`{ name: 'Orc Army', power: 1, toughness: 1 }`.
Brainstorm under Narset/Hullbreacher draws what it may (possibly 0) and still puts back 2 (or all if fewer).

## 7. Outcomes, labels and the "do nothing" branch
`applyAction` still returns `[{ state, label }]`. An outcome may also carry
`adversary: [{ card, mode, target? }]`: the adversary choices made inside this call, in order
(Bowmasters ping target choices included). Absent or `[]` = the adversary did nothing.
- The "do nothing" branch is always present: the outcome(s) of the action as if the adversary had no
  options (one outcome, or several when the action shuffles), none with adversary entries.
- When the adversary has NO legal option at a window (e.g. empty `opp.hand`, no usable visible ability),
  the result is exactly v1's (same outcomes, same labels). **v1 compatibility:** for a setup with no
  opponent hand and no v2 permanent, `legalActions` and `applyAction` return exactly what v1 returns
  (same order, same labels), so `solve` returns v1's result and plan.
- Labels are pairwise distinct within one call.
- `solve` treats all outcomes of an action as AND (as for shuffles); its API is unchanged.

## 8. The adversary
### 8.1 Windows
- **W-cast**: after each of my `cast` actions, once costs are paid and after Chalice (a Chalice-countered
  spell opens no window). The spell is "on the stack".
- **W-ability**: after each `cycle` and `crack_fetch` (costs paid: card discarded, life paid, land/fetch
  sacrificed), and after a Sewers surveil trigger is created (before its choice). Oracle's ETB trigger does
  NOT open W-ability: everything aimed at it happens at W-oracle.
- **W-oracle**: when I take `resolve_oracle`. If the adversary acts, the trigger stays pending (unless
  countered) and I get priority again; the next `resolve_oracle` opens W-oracle again.
- **W-oppturn**, **W-myturn**: §5.
At W-cast, W-ability, W-oppturn and W-myturn, after each adversary action (and after any choice /
pendingOppSpell it causes is finished) the SAME window opens again with the remaining resources, until the
adversary does nothing; only then does my spell/ability resolve (if still on the stack) or the turn go on.

### 8.2 Options and costs
At a window the adversary's options are: do nothing, or one use of one held card (removed from `opp.hand`;
`opp.handSize −= 1`; `opp.spellsCast += 1` for spells) or of one visible ability (that permanent is removed
from `state.opponent.permanents`). There is one option per distinct (card, mode, target) — targets are
compared by name (lands: name + tapped state), so two tapped Seas are one target; modes are never merged even
when two have the same effect — and, for each, one per payment method that differs (mana vs alternative
cost; which card is pitched). `target` in the adversary entry is the name only.
Payments (opponent costs are never taxed by any permanent, see §13):
- Mana: total ≤ `manaAvailable + treasures`; each coloured symbol needs its colour in `colors` (hybrid: either
  colour), or a treasure. Spent from `manaAvailable` first.
- Phyrexian `{c/P}`: paid with 2 life when `opp.life > 2`, else with mana of colour c.
- Life payments need `opp.life > amount`.
- "Pitch" alternative costs (exile a card of colour c from hand: Force of Will U + 1 life, Force of Negation U,
  Solitude W, Endurance G, Unmask B): legal iff `handSize ≥ 2`. If `handSize > hand.length` an unknown card
  is pitched (`handSize −= 1` more); otherwise another card of colour c in `opp.hand` is pitched (removed),
  one option per distinct choice; none → illegal.
- Daze alternative: needs `'U'` in colors and `landsTotal ≥ 1`: `landsTotal −= 1`, `handSize += 1`,
  `manaAvailable = min(manaAvailable, landsTotal)`.
- Snuff Out alternative: needs `'B'` in colors and `landsTotal ≥ 1`, and 4 life.
- Mindbreak Trap alternative ({0}): `state.spellsCast ≥ 3` (the targeted spell counts).
- Force of Negation alternative: only while it is my turn (`phase === 'main'`).
- When mana and an alternative cost are both legal, each is a separate option.

### 8.3 Cards (mode strings are exact; `target` is a card name, `'me'`, or a land name)
"Oracle-pending" = I have a Thassa's Oracle on the battlefield and `pendingTrigger` is true; removal
aims only at Oracle-pending Oracles. "Protected" = a creature spell paid with ≥ 1 Cavern restricted mana.
| Card | Window(s) | Legal when | mode | Effect |
|---|---|---|---|---|
| Force of Will | W-cast | spell not protected | `counter` | countered → my graveyard |
| Force of Negation | W-cast | noncreature spell | `counter` | → my exile |
| Daze | W-cast | not protected | `counter` | pay_or_not 1 (§9) |
| Spell Pierce | W-cast | noncreature | `counter` | pay_or_not 2 |
| Flusterstorm | W-cast | instant/sorcery | `counter` | pay_or_not `1 + storm`, storm = `state.spellsCast + opp.spellsCast` before this cast (copies modelled as one combined tax) |
| Spell Snare | W-cast | MV == 2, not protected | `counter` | countered |
| Mental Misstep | W-cast | MV == 1, not protected | `counter` | countered |
| Pact of Negation | W-cast | not protected | `counter` | countered; a Pact upkeep becomes due (§8.5) |
| Mindbreak Trap | W-cast | any spell (protected too) | `exile` | → my exile |
| Pyroblast, Red Elemental Blast | W-cast / any | blue spell, not protected / Oracle-pending | `counter` / `destroy` | countered / Oracle → my graveyard |
| Consign to Memory | W-cast / W-ability, W-oracle | colorless spell (Lotus Petal, LED) / a triggered ability (Sewers surveil, Oracle trigger) | `counter` / `counter_ability` | countered / trigger gone (`pendingTrigger=false`, or no surveil) |
| Stifle | W-ability, W-oracle | activated (cycle, fetch) or triggered ability | `counter_ability` | cycle: no draw; fetch: no search, no shuffle; trigger gone |
| Sink into Stupor | W-cast / any | any spell (protected too) / Oracle-pending | `bounce` | spell or Oracle → my hand (trigger stays pending) |
| Swords to Plowshares | any | Oracle-pending | `exile` | Oracle → exile; my life += 1 |
| Fatal Push, Snuff Out, Dismember | any | Oracle-pending | `destroy` | Oracle → graveyard |
| Solitude | any | Oracle-pending | `exile` | Oracle → exile, my life += 1; hard-cast: add `{name:'Solitude'}` to opponent permanents |
| Lightning Bolt | any | always / Oracle-pending | `damage` | target `'me'`: life −3; target Oracle: dies |
| Kozilek's Command | any | see right | `exile_creature` / `draw` / `exile_graveyard` | X=2, cost {2}{C}{C}: exile an Oracle-pending Oracle / X=0, cost {C}{C}: I draw a card (§6 applies) / X=1, cost {1}{C}{C}: exile one card (target) from my graveyard |
| Surgical Extraction | any | a non-basic-land card in my graveyard | `graveyard`, `graveyard+hand`, `graveyard+library`, `graveyard+hand+library` | exile every copy of target from the listed zones, then shuffle my library (AND outcomes) |
| Endurance | any | always | `graveyard_to_library` (target `'me'`) | my graveyard → bottom of my library in random order (AND outcomes over distinct orders); hard-cast: add `{name:'Endurance'}` |
| Orcish Bowmasters | any | always | `flash`, then `ping` entries | ETB ping (§6 targets; `'me'` only unless Oracle-pending) + amass; adds `{name:'Orcish Bowmasters'}` to opponent permanents |
| Thoughtseize, Duress, Inquisition of Kozilek, Unmask, Cabal Therapy | W-oppturn | always | `cast` | sets `pendingOppSpell` (§8.6) |
| Collective Brutality | W-oppturn | always | `discard`, `drain`, `discard+drain` (the last needs `handSize ≥ 2` before casting) | pendingOppSpell; drain: my life −2, opp life +2 |
| Tormod's Crypt (visible) | any | my graveyard not empty | `exile_graveyard` | my graveyard → my exile |
| Wasteland (visible) | W-oppturn, W-myturn | a nonbasic land of mine | `destroy` (target land) | land → my graveyard |
| Ghost Quarter (visible) | W-oppturn, W-myturn | a land of mine | `destroy` (target land) | land → my graveyard; then my pendingChoice `ghost_quarter` (§9) |
A countered or exiled spell still counts in `spellsCast` / `noncreatureCast` (v1 rule).

### 8.4 Visible abilities
Wasteland, Ghost Quarter and Tormod's Crypt in `opponent.permanents` need no hand card and no mana
(their `tapped` flag is ignored: they are only used at windows where they are untapped). Each is used at
most once (the permanent is removed).

### 8.5 Pact of Negation upkeep
At step 3 of the next opponent turn after the turn Pact was cast: if they can pay {3}{U}{U} (§8.2 mana rules)
they pay it; otherwise they lose: `status(state) === 'win'`.

### 8.6 Opponent sorcery-speed spells (`pendingOppSpell`)
While `pendingOppSpell` is set, legal actions are my instant-speed actions (v1 instant speed, plus Teferi /
Voice restrictions) and **`{ type: 'resolve_opp_spell' }`**. `pass` is illegal. On `resolve_opp_spell` the
adversary picks (AND outcomes, entries `{card, mode:'discard', target}`): Thoughtseize / Unmask: any nonland
card in my hand (Thoughtseize: opp life −2); Duress: noncreature nonland; Inquisition: nonland with MV ≤ 3;
Cabal Therapy: names a nonland card in my hand, I discard all copies; Brutality `discard`: an instant or
sorcery. No legal card → nothing happens (one outcome, no entry). Then W-oppturn reopens.

## 9. My new choices
- `pendingChoice = { kind: 'pay_or_not', card, amount }` (card = the counter, amount = generic mana to pay).
  Options: `'decline'` (the spell is countered: it goes to my graveyard, or exile under Dauthi Voidwalker)
  and one `{ pay: payment }` per distinct exact payment of `amount`
  from my unrestricted pool (payment as v1: colour → count). While it is pending, my mana abilities
  (`tap`, `sac_petal`, `activate_led`) are ALSO legal. After paying, W-cast reopens.
- `pendingChoice = { kind: 'ghost_quarter' }`. Options: `null` (don't search) and one basic land name per
  distinct basic in my library (search it, put it onto the battlefield untapped, then shuffle: AND outcomes).

## 10. Status
`status` is `'loss'` as in v1 (checked first), `'win'` if the Oracle trigger won or the opponent lost (Pact),
else `'ongoing'`.

## 11. `src/grade.js`
```js
export function unseenPool(opponent)            // deckEstimate − (permanents names + graveyard + exile), floored at 0;
                                                // returns {name: count} without zero entries
export function pHold(N, k, h)                  // P(a uniform h-card hand from N cards holds ≥1 of k copies)
                                                // = 1 − C(N−k, h) / C(N, h); RangeError if not 0 ≤ k ≤ N, 0 ≤ h ≤ N
export function pairKey(a, b)                   // the two names sorted (Array.prototype.sort), joined with ' + '
export function handVerdict(vector, singles, pairs) // → true | false | null (§11.1)
export function handWinProbability(counts, N, h, verdict) // → { low, high } (§11.1)
export function grade(setup, pile, { maxNodes = 200000, solver = solve } = {}) // → GradeResult (§11.2)
```
### 11.1 Probability
`counts` = {r: k_r} for the relevant set; `N` ≥ Σk_r; `h` ≤ N (else RangeError). `handWinProbability`
enumerates every vector `{r: n_r}` (every name of `counts` present, 0 ≤ n_r ≤ k_r, Σn_r ≤ h, h − Σn_r ≤ N − Σk_r)
with multivariate hypergeometric weight Π C(k_r, n_r) · C(N − Σk, h − Σn) / C(N, h), and returns
`low` = Σ weight over verdict === true, `high` = Σ weight over verdict !== false.
`handVerdict(vector, singles, pairs)`: singles = {r: true|false|null}, pairs = {pairKey: true|false|null}.
A card is present if n_r ≥ 1; a pair {a,b} is present if a≠b both present, or a=b with n_a ≥ 2.
false if any present card's single is false or any present pair is false; else null if any present single
or present pair is null or missing from the map; else true (monotonicity assumption).

### 11.2 `grade(setup, pile, opts)`
1. Throw if `setup.opponent.deckEstimate` is not an object or `handSize` is not an int ≥ 0.
2. `unseen = unseenPool(setup.opponent)`, `N = Σ unseen`, `h = min(handSize, N)` (an assumption string if clamped).
3. Relevant set R = names with unseen count > 0, in `MODELLED_HAND_CARDS`, and
   `castableInPrinciple(name, lands.colors)`: every non-Phyrexian coloured symbol (incl. C) of its printed
   cost has its colour in `colors` (hybrid: either). R is sorted (Array.prototype.sort).
   `notModelled` = sorted unseen names not in `MODELLED_HAND_CARDS`; `offColor` = sorted unseen names in
   `MODELLED_HAND_CARDS` but not castable.
4. Each sub-solve is `solver(buildStartState(S, pile), { maxNodes })` where S = setup with `opponent.hand`
   replaced. `wins` = true for 'win', false for 'no_win', null for 'aborted'.
5. goldfish: hand `[]`. If its result is not 'win': `singles = []`, `pairs = []`; pWin 0 / range [0,0] for
   'no_win', pWin null / range [0,1] for 'aborted'. Otherwise:
6. singles: for each r in R, hand `[r]` → `{ card: r, k: unseen[r], pHold: pHold(N, k, h), wins }`.
7. pairs (only if h ≥ 2): for each r ≤ s in R (r = s only if k_r ≥ 2) whose singles BOTH have
   `wins === true`: hand `[r, s]` → `{ cards: [r, s], wins }`. Ordered by (r, s). No other sub-solves run.
8. `{low, high} = handWinProbability({r: k_r}, N, h, v => handVerdict(v, singlesMap, pairsMap))`.
```js
GradeResult = { goldfish: <solve result>, pWin: number|null /* null unless low === high */,
  pWinRange: [low, high], singles, pairs, notModelled, offColor, unseen, N, h,
  source: deckEstimateSource|null, assumptions: [non-empty strings] }
```
Deterministic: the same input gives a deep-equal result (no timing fields).

## 12. `src/scenario.js`
`validateScenario(s) → string[]` (errors; `[]` = valid). Checks: `id` non-empty string; `source` is an object
whose keys are ALL in {player, date, deck, oppDeck, gameNumber, onPlay} (anything else, e.g. an opponent
name, is an error); `setup.opponent` keys all in {permanents, graveyard, exile, life, handSize, lands,
deckEstimate, deckEstimateSource, hand}; `buildStartState(setup, actual.pile)` doesn't throw;
`actual.result` ∈ {'win','loss'}; `actual.pileOrdered` boolean; `warnings` (if present) an array of strings.
`validateScenarioFile(f) → string[]`: `f.version === 2`, `f.scenarios` an array, each valid (errors prefixed
with the id), ids unique.

## 13. Documented simplifications (v2)
Opponent costs are not taxed (Thalia, Sphere, Trinisphere, Damping Sphere, Silence, Archon don't restrict
them). Kozilek's Command: only the three single-purpose packages of §8.3 (the second mode is the
spawn-token mode on themselves). Surgical: four zone variants. Flusterstorm copies: one combined tax.
Removal targets only Oracle-pending Oracles; Bolt can also hit me. Cabal Therapy flashback, Teferi's
−3, Narset's −2, Phelia, Voidwalker's sacrifice ability, Voice of Victory's Mobilize tokens and every
unlisted ability are not modelled. Wasteland/Ghost Quarter only at W-oppturn/W-myturn, and I can't
tap the land in response. Treasures pay like mana of any colour.
