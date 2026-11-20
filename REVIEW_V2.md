# Hostile review: Doomsday pile trainer v2

Reviewed on 2026-11-20 against `SPEC.md`, `SPEC_V2.md` (§10 included), `SPEC_V2_API.md`, the rulings in
`SPEC_QUESTIONS.md` and the verified texts in `src/oppCards.js`. Nothing is committed: `git diff HEAD` shows
every change. New files: `tests/v2-review.test.js` (27 tests) and this file.

## Summary

- **No wrong win/no_win answer found in the solver.** I wrote my own brute-force reference: an exact
  minimax value with no pruning, memoised on the full JSON of the state and using only the public
  `legalActions`/`applyAction`/`status`. I compared it with `solve()` on **6,416 random v2 boards (6,600 generated) plus 154
  sample-board variants**:
  - **0** win/no_win mismatches
  - **0** plans longer than the true shortest worst case
  - **0** plans that failed on replay
  I also tried to break P1–P5 and the memo key by hand (details below). None broke.
- **Engine rules: 5 bugs, all fixed.** Each one comes from a verified card text the engine didn't follow.
  - The opponent's own hate pieces also bind **them**: Blood Moon / Magus turn their Wasteland and Ghost
    Quarter into plain Mountains, Collector Ouphe stops their Tormod's Crypt, Pithing Needle stops every
    source with that name, and their Chalice counters their own Stifle or Bolt.
  - A tapped Trinisphere never untapped.
  - Under the Moon, my fetchlands couldn't tap for {R}.
  Most of these were pessimistic: they understated my P(win), so the trainer called good piles worse than
  they are. The fetchland bug also took away mana I really have.
- **grade(): 2 bugs, both fixed.**
  - A board where the opponent has **0 cards in hand** threw instead of grading. Real boards like this
    exist.
  - The probability step was exponential in the number of modelled names: 18 names took 3 s, and 24 names
    took 23 s before any sub-solve.
  The math itself is right: I recomputed it with exact fractions.
- **UI: 4 bugs, all fixed.**
  - `explain()` cut the winning line off after any pass with several outcomes. Any board with a Wasteland,
    Ghost Quarter or Crypt and a win on a later turn showed "Turn 0 / Opponent's turn" and nothing else.
  - The TOO BIG reason (OutcomeLimitError) was never shown.
  - The engine's own warnings didn't reach the board.
  - Float noise showed as "68%–>99%".
- **Scenario validator: hardened.** Before, it whitelisted only `source` and `setup.opponent` keys. A
  username under any other key (top level, `actual`, `setup`, a permanent entry, `lands`) passed, and so
  did non-integer `deckEstimate` counts. Now every object level is whitelisted and the counts are checked.
- **No XSS.** I loaded a scenario whose every string field (id, player, deck names, card names, Needle name,
  warnings, `deckEstimateSource`, `winBy`, estimate keys) carried an `onerror` payload. Nothing ran:
  `window.__xss` stayed 0 and the page title was unchanged.
- **Tests: 530 → 557, all green.** On the original code, 21 of the 27 new tests fail. The other 6 are
  controls and pass on both: R1.5 (no Moon), R2.2 (Karn), R3.2 (Chalice on 3), R6.2 (no duplicate warning),
  R7.1 (the base sample is valid) and R8 (Bowmasters attacks).

## Findings

| # | Severity | Finding (text / spec cited) | Repro | Fix | Test |
|---|---|---|---|---|---|
| F1 | **major** | `explain()` handled every `pass` as a single-outcome step: `cur = cur.then`. In v2 a pass opens W-oppturn / W-myturn (API §5, §7). So with any visible Wasteland, Ghost Quarter or Tormod's Crypt the pass is a **branch**, `cur.then` is undefined, and the printed line stopped at "Opponent's turn", with no steps and no WIN. The Practice reveal only shows goldfish plans, so every later-turn win on a board with a visible ability was shown truncated. Branches caused by the opponent were also labelled "random outcome". | Sorcery-speed board: Oracle in hand, 2 tapped Seas, Ghost Quarter, library [Island, Wraith, Island], turnsAhead 1. | A branching pass prints its header, then every outcome. The branch note says "the opponent's choice or a random outcome" when a label carries `Opponent:`. | R11 |
| F2 | **major** | `grade()` threw on a board with `opponent.handSize` 0. Each single runs `buildStartState` with `hand:[r]`, and that throws "handSize must be ≥ the number of hand cards". The Practice reveal showed "Grading failed". An emptied hand on a real logged board is ordinary. | `handSize: 0`, `deckEstimate: {Stifle: 4, Island: 20}` | The sub-solve's handSize is `max(handSize, hand.length)`. Such cards have pHold 0, so P(win) is unchanged (API §11.2). | R9 |
| F3 | **major** | The API §11.1 enumeration is exponential in \|R\|. Measured: 15 names × 3 copies at h=7 took 1.0 s, 18 names 3.1 s, 30 names × 2 copies 86 s, all **before** any sub-solve. That breaks the §6 "< 10 s" budget for the wide `deckEstimate`s an estimate built from max copies per game produces (sideboard cards included). At h=12 it never finishes. | `handWinProbability` with 18 names × k=3, h=7 | `grade()` regroups names exactly by `handVerdict`'s own rules. Every false single goes into one bucket F (present ⇒ false). Every unknown single goes into one bucket U (pairs with it are never solved). A winning single with no losing or unknown pair joins "other". Only cards in a losing or unknown pair keep their own dimension. Checked against the plain enumeration on 300 random maps: max difference 3e-15. `handWinProbability`/`handVerdict` are unchanged. | R10 (23.5 s → ~20 ms) |
| F4 | minor | **Blood Moon / Magus vs. the opponent's own Wasteland and Ghost Quarter.** "Nonbasic lands are Mountains" covers their lands too: those lose "{T}, Sacrifice: Destroy target land" (CR 305.7). The adversary still used them. This is pessimistic, and it matters for UR Delver, which sides in Moon and plays 4 Wasteland. | Moon + Wasteland, pass from main → a Wasteland outcome | `advOptions`: no Wasteland / Ghost Quarter option under Moon. | R1 |
| F5 | minor | **Collector Ouphe vs. their own Tormod's Crypt.** Ouphe: "Activated abilities of artifacts can't be activated" (every artifact). **Pithing Needle / Disruptor Flute** naming Wasteland, Ghost Quarter or Crypt: "sources with the chosen name". Both were ignored. Karn ("artifacts your opponents control") correctly doesn't stop their Crypt. | Ouphe + Crypt, pass → a Crypt outcome | `advOptions` checks `abilityLocked` and Ouphe. | R2 |
| F6 | minor | **The opponent's own Chalice of the Void.** "Whenever a **player** casts a spell with mana value equal to…, counter that spell." The adversary cast Stifle or Bolt through their own Chalice on 1. API §13 only exempts them from cost **taxes** and the Silence / Archon restrictions, and Chalice is neither. With Chalice 1 and Stifle as their only card, a winning Oracle line graded as "loses to Stifle". | R3 verdict test | `advOptions`' `add`: no option for a **noncreature** spell whose MV (+X for Kozilek's Command) equals a Chalice's x. Creature spells are kept, since their Cavern (not modelled) could protect them; keeping them is pessimistic. | R3 |
| F7 | minor | **My fetchlands under Blood Moon / Magus didn't tap for {R}.** SPEC_V2 §3 says "fetches tap for {R} only". `landColors` returned `null` before the Moon check, because fetches have no `produces`. The {R} pays generic costs: Flow State, Daze / Spell Pierce / Flusterstorm taxes, Thalia / Trinisphere, Unearth cycling. | Moon + Polluted Delta: no tap action | `landColors`: every supported nonbasic land of mine taps for R under the Moon. | R13 |
| F8 | minor | **A tapped Trinisphere never untapped.** "As long as Trinisphere is untapped…": a Trinisphere tapped when Doomsday resolved untaps in the opponent's untap step. The engine kept `tapped: true` forever, so my spells on later turns were too cheap. That is optimistic, the wrong direction. | Trinisphere `{tapped:true}`, pass: still tapped | `pass` from main untaps their tapped permanents (only Trinisphere reads the flag). | R4 |
| F9 | minor | **The TOO BIG reason was never shown.** `solve()` returns `reason` for OutcomeLimitError, and the implementer asked for it to be shown. Instead, Practice said "ran out of budget". `grade()` dropped the reasons of aborted singles and pairs, so they showed as a bare "unknown vs X". The Sandbox ignored the reason too. | Endurance vs. a 12-card graveyard (via LED): "unknown vs Endurance" | `grade()` adds `reason` to aborted singles and pairs (only when aborted, so existing shapes are unchanged). `gradeView` exposes the goldfish reason. Practice and the Sandbox print it. Checked in Chrome: "unknown vs Endurance (est. 32% …) (too big to solve: One action would create more than 50000 random outcomes (479001600)…)", "est. 68%–100%". | R5 |
| F10 | minor | **The board view showed only `scenario.warnings`, never the engine's `state.warnings`** (SPEC_V2 §2: unmodelled permanents, variable power). A file without precomputed warnings showed an unmodelled Goblin Bombardment silently. | `boardView` of a scenario with Goblin Bombardment and `warnings: []` | `boardView(scenario, availablePile, buildStartState)` merges the engine's warnings, without duplicates. `practice.js` passes the engine. | R6 |
| F11 | minor | **Validator whitelist was incomplete (SPEC_V2 §2 "NO opponent username, ever", §9).** Only `source` and `setup.opponent` keys were whitelisted, so `actual.opponent`, `setup.opponentName`, `permanents[i].controller` or an extra top-level key passed. Non-integer or negative `deckEstimate` counts also passed; `grade()` then threw a RangeError. | R7 cases | `validateScenario` also whitelists the top-level, `actual`, `setup`, battlefield-entry, permanent-entry and `lands` keys. It requires whole-number `deckEstimate` counts and a string `deckEstimateSource`. All 5 samples still validate. | R7 |
| F12 | minor (cosmetic) | Float noise: a range whose high end is exactly 1 in theory came out as 0.9999999999999999 and was shown as "est. 68%–>99%". | the F9 board | `formatPct` treats values within 1e-12 of 0 or 1 as exact. | R12 |

Seen but not fixed (minor, outside the tests):
- My Fatal Push targets a creature **name** and removes the first entry with that name. If two entries share
  a name but have different scenario `power`s, which one dies depends on array order. The solver's memo key
  sorts permanents, so that order isn't part of the state. Exporters should not emit same-name creatures
  with different powers, or the target should be one per distinct entry.
- In the reveal, an indented turn header inside a branch is styled as a header and loses its indentation.
  It still reads correctly.

## Spec gaps (not code bugs; nothing guessed)

1. **V2-Q5 / V2-Q6 have no lead ruling.**
   - Voice of Victory's Mobilize 2 makes its attack 3, not 1.
   - Exalted (Noble / Ignoble Hierarch), "Other colorless creatures you control get +1/+1" (It That Heralds
     the End), Eldrazi Linebreaker's +X/+0, prowess and Guide of Souls are not in the clock.
   - The implementer's choice gives OPP_CARDS creatures **no warning**, and `tests/v2-setup.test.js` requires
     that for Delver. So these understated clocks are silent. This is optimistic: the app can say WIN where
     the real clock kills. It needs a ruling: either the exporter writes the effective attack power into
     `power`, or such creatures get a "clock may be higher" warning.
2. **V2-Q9 has no ruling.** `spellsCastThisTurn` and `cardsDrawnThisTurn` are not in the SPEC_V2 §2 format,
   but Archon, Damping Sphere, Mindbreak Trap, Flusterstorm and Narset read them.
3. **Unseen pool and their lands.** SPEC_V2 §6 subtracts their *battlefield*, but the format records their
   lands only as counts, so their lands in play are never subtracted. N is too large by `lands.total`
   (2–4 cards out of ~55), so pHold is a few % too low. That is optimistic. The exporter could add the land
   names to an `opponent.landNames` list (needs a spec line, and a whitelist entry).
4. **Opponent mana across turns.**
   - SPEC_V2 §5.1 says mana "resets again … at the start of my next turn if they didn't use it". API §5
     resets it unconditionally. So mana spent on their turn (Duress) comes back for my turn (Spell Pierce).
     That is pessimistic. Which one is meant?
   - Daze's returned Island is never replayed (`landsTotal − 1` for good). That is optimistic: e.g. a Pact
     upkeep they "can't pay", or less mana on my next turn.
5. **Their hate pieces bind them too (§13 is partial).** §13 exempts them from taxes and from Silence /
   Archon. It is silent on:
   - **Gaddock Teeg**: their FoW, Snuff Out, Mindbreak Trap, Unmask and Kozilek's Command (X) can't be cast.
   - **Their own Blood Moon** on their duals: colors, and Daze needs an *Island*.
   - **Back to Basics** on their nonbasics.
   - **Ouphe** on their Hullbreacher Treasures.
   - Their **Cavern** (F6 keeps creature spells for that reason).
   I fixed only what is a counter or a lost ability (F4–F6). The rest needs rulings.
6. **Pitch costs vs. monotonicity.** A single FoW assumes an unknown blue card to pitch when handSize ≥ 2.
   But the pair FoW + a non-blue card at handSize 2 can't pitch. So "a losing single ⇒ every hand with it
   loses" overstates such hands. This is inherent to the §5.4 assumption. On the samples I solved every pair
   that holds a losing single (37) and every triple of winning cards whose pairs all win (2): no
   monotonicity violation.
7. **Fetch vs. Surgical (implementer decision).** A fetch commits to its land when cracked. In real Magic the
   search is chosen on resolution, so after a Surgical in response I could fetch a different land. This is
   pessimistic. Fixing it changes v1's `crack_fetch {find}` action shape, so it needs a ruling.
8. **`castableInPrinciple` ignores alternative costs.** FoW, FoN, Solitude and Endurance can be pitched with
   no land of that color. The API defines it this way, which is fine in practice.
9. **`source.player`** is not checked against {Jaytron, boryas} (§8 says only the exporter filters). The
   samples use "SAMPLE". A username in a *value* (deck name, estimate key) can't be detected by any
   whitelist. Only the SHA-256 blocklist test on `data/` covers it.

## Fuzz stats

The reference is in `/tmp/rv/ref.mjs` and the generator in `/tmp/rv/fuzz.mjs`. The generator varies:
- my hand, battlefield, graveyard, pool and pile, including a 60% small-pool mode so many boards are winnable;
- 0–2 modelled permanents plus Chalice, Needle and Flute;
- unknown attackers with `power`;
- an opponent hand of 0–2 modelled cards (a "focus" mode biases it toward Endurance, Surgical, Command,
  Sink, Stifle, Daze, Bowmasters, Bolt, Consign, Flusterstorm, Pact, Duress) and Crypt, Goblin Guide,
  Bowmasters, Wasteland, Ghost Quarter, Narset, Hullbreacher, B2B on board;
- handSize, lands, colors, turnsAhead 0–2.

Each compared board checks that the result is the same, that the plan depth equals the reference value, and
that the plan replays through `applyAction`.

| Run | Code | Generated | Compared | Ref over budget (skipped) | Wins | Hand flipped the verdict | Mismatches |
|---|---|---|---|---|---|---|---|
| A (4 seeds) | HEAD | 2,400 | 2,334 | 66 | 637 | n/a | **0** |
| B focus (4 seeds) | HEAD | 2,000 | 1,931 | 69 | 534 | 93 (+70 longer lines) | **0** |
| C focus (4 seeds) | after fixes | 2,200 | 2,151 | 49 | 564 | 66 (+71 longer lines) | **0** |
| Sample boards × each of the 30 modelled cards (all colors, all lands untapped) | HEAD | 155 | 154 | 1 | | | **0** |

Total: 6,600 generated, **6,416 compared, 0 mismatches**, plus 154 sample-board variants (0 mismatches).

`solve()` never aborted on the fuzz boards (budget 2M).

## What I checked and found correct

- **Every modelled hand card** against its verified text:
  - FoW (pitch with life > 1), FoN (free only on my turn), Daze (Island return, handSize +1).
  - Spell Pierce, and Flusterstorm's storm, which is `spellsCast + opp.spellsCast` before it. That includes
    my spell on the stack and Doomsday. Paying the combined tax is exact, because declining any copy
    counters the spell.
  - Spell Snare and Mental Misstep (MV), Pact (due at their *next* upkeep: the same turn number if cast on my
    turn, the next if cast on theirs).
  - Mindbreak Trap (free at ≥ 3 of my spells; exiles through Cavern).
  - Pyroblast / REB (both modes; destroy only a pending Oracle), Consign (colorless spells, triggered
    abilities only, never cycling or fetches), Stifle (cycle: no draw; fetch: no search and no shuffle).
  - Sink (bounces through Cavern; the trigger stays and resolves with lower devotion), StP / Solitude
    (+1 life), Push / Snuff Out (nonblack) / Dismember, Bolt (me or the Oracle).
  - Command (three packages; the draw obeys Narset, Hullbreacher and Bowmasters).
  - Surgical (every copy from the chosen zones, then always a shuffle; basic lands excluded).
  - Endurance (bottom in random order; hard-cast body attacks; under Torpor the evoked body stays).
  - Bowmasters (flash ping + amass; the draw-step exception; Oracle targetable only while pending; tracks 3
    damage).
  - All discard spells, and Brutality's modes and escalate.
- **Board pieces**:
  - Thorn, Sphere, Damping (counts Doomsday), Trinisphere after every other increase (Oracle needs 3 mana).
  - Archon (one spell per turn; nonbasics enter tapped, fetched ones too).
  - Needle / Flute (cycling and fetches; mana abilities unaffected), Ouphe / Karn (Petal and LED).
  - Cage (Unearth resolves to nothing), Torpor (no Oracle trigger).
  - Teferi: no Brainstorm in response to the trigger, cycling still allowed. Voice: no Ritual on their turn,
    my turn unaffected. I verified both with mana available; the D1 dispute is right that the suite's own
    tests are vacuous.
  - Narset, Hullbreacher (replaced draws give no Bowmasters ping and no empty-library loss), Moon
    (Sewers untapped, no surveil, Cavern R only), B2B.
  - Dauthi Voidwalker (Doomsday, countered spells, LED discards and Wasteland victims all go to exile).
  - Goblin Guide (reveal per Guide; a land goes to hand, which is not a draw).
  - Wasteland / Ghost Quarter (my OR choice to search; no search means no shuffle), the clock (printed or
    scenario power, flashed bodies and Orc Army attack next turn).
- **Implementer decisions**:
  - Fatal Push vs. any MV ≤ 2 creature: rules-correct.
  - Torpor vs. Bowmasters, Endurance and Solitude: correct (evoke's sacrifice is an ETB trigger).
  - Brutality escalate options: correct. Pact due on their following turn: correct.
  - Wasteland / Ghost Quarter options deduplicated by name with the window reopening: correct.
  - Fetch commit and the warning policy: see Spec gaps 7 and 1.
- **Solver**. I re-derived P1–P5 for v2 and tried concrete states against each:
  - **P1**: tap, then Wasteland. Wasteland only acts after a pass, which empties the pool. B2B keeps a
    tapped nonbasic tapped, and dropping that tap is never worse. Mana during `pay_or_not` is covered.
  - **P2**: Sink only bounces a pending Oracle. Endurance and Unearth are covered.
  - **P3**: Brainstorm put-backs are counted in Φ, and Goblin Guide in m. Command, Surgical and Endurance
    are optional, so the do-nothing outcome bounds them.
  - **P4**: exile is never read; the graveyard is kept in full whenever a reader is in play;
    `noncreatureCast` is only read by Silence.
  - **P5**: Pyroblast reads the spell's color, never the pool's.
  The fuzz agrees.
- **grade()**: `pHold`, the multivariate weights and `handVerdict` match exact fractions:
  - 1/3: N=10, h=3, A:2 losing, B:3 with BB losing;
  - [2/3, 1]: an unknown single;
  - 20/21: a losing pair;
  - P(hold ≥ 1 of 4 in 7 from 53) = 25928/58565.
  The same-card pair needs k ≥ 2, unseen-pool flooring works, and the range for aborted sub-solves is right.
- **Practice UI** (headless Chrome, 390×844, real grader): all 5 samples ran end to end.
  - Times: 0.2–9 s; the actual pile's best order is up to 120 orders.
  - "est." and "Deck estimate: …" appear on every reveal.
  - Cancel works in both phases.
  - Stats persist across a reload, and the Sandbox still checks piles.
  - A malformed file (non-objects, 5,000-deep nesting, `__proto__` / `constructor` deck keys, strings for
    arrays) is rejected with messages and never throws.

## Confidence

- **High** that `solve()` is sound and returns shortest plans for the v2 model: 6,570 compared boards, 0
  mismatches, plus a by-hand review of every pruning.
- **High** that the probability math is right.
- **Medium-high** on card behaviour versus real Magic. The model follows the verified texts, now including
  their effects on the opponent's own pieces. The largest remaining distortions of real-game answers are spec
  choices, not code: the understated clock (gap 1), the unseen pool (gap 3) and opponent mana (gap 4).
