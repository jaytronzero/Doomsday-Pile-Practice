# Hostile review: Doomsday pile trainer v1

Reviewed against `SPEC.md` (including the §12 resolutions) on 2026-11-18. Every change is
uncommitted, so `git diff` shows it. New files: `tests/review.test.js`, `src/solveWorker.js`.

## Summary

- **No wrong win/no_win answer found in the engine or solver.** I fuzzed 6,761 random
  scenarios against a brute-force reference with no pruning. There were 0 answer
  mismatches, 0 plans that failed on replay and 0 non-shortest plans. I read each pruning
  argument and tried to break it; none broke.
- **Two major UI bugs, both fixed:**
  - A Disruptor Flute name typed in the wrong case silently did nothing, so the UI said
    WIN for a no_win pile.
  - The solver ran on the main thread and froze the page for 6–9 s on a realistic hand.
- **Five minor robustness bugs, all fixed:** error messages, deck-text parsing, and
  scenario import.
- **Several real-rules deviations come from the spec itself**, not from the code. They are
  listed under "Spec gaps". The most important is that Cavern of Souls mana should make
  Oracle immune to Chalice of the Void. As written, the spec gives no_win for a pile that
  wins in a real game.
- Tests: 243 → **251** (8 new in `tests/review.test.js`), all green. On the original code,
  7 of the 8 new tests fail. R1b is a guard test and passes on both.

## Findings

| # | Severity | Description | Repro | Fix | Test |
|---|---|---|---|---|---|
| R1 | major | A Flute name in a different case or spacing (e.g. "street wraith") went to the engine as typed. §6 matches names exactly, so the Flute did nothing. Puzzle D (§11) showed **WIN** in the UI instead of NO WIN. | UI: puzzle A board, tick Flute, type `street wraith`, Check pile → WIN. | `uiLogic.buildSetup` maps the typed Flute name onto the deck's spelling, ignoring case and extra spaces. Names that match no deck card are kept as typed. | `R1`, `R1b` |
| R2 | major | §10 says "the UI must stay responsive (< 2 s)". `solve()` ran on the main thread. Hand Oracle, Brainstorm, Ponder, Dark Ritual, Lotus Petal, Polluted Delta; battlefield Underground Sea, Polluted Delta, Scalding Tarn, LED; pool {B:1}; turnsAhead 1; pile Petal, Petal, Ponder, Ritual, Edge. This hit the 200k node limit after **6.5 s with the page frozen** (headless Chrome, desktop CPU; a phone will be slower). | Import that scenario and press Check pile. | New `src/solveWorker.js` runs the same synchronous `solve` + `explain` inside a module Web Worker. While it runs, Check pile becomes **Cancel**. If module workers aren't available, it falls back to the old inline path. Measured after the fix: worst main-thread lag 44 ms while solving, and Cancel works. | `R2` (module and wiring; responsiveness was checked in the browser, see below) |
| R3 | minor | A zone card named like an `Object.prototype` member read the prototype. Error text: "constructor: … use NaN copies but the deck has function Object() { [native code] }". | `buildStartState({deck:{Doomsday:1,Island:5},hand:['constructor']}, 5×Island)` | `engine.poolOf`/`validate` read deck counts as own properties only. | `R3` |
| R4 | minor | NaN/Infinity showed up as "(got null)" in validation messages, because `JSON.stringify(NaN)` is `"null"`. | `lifeBeforeDoomsday: NaN` | `show()` prints numbers with `String()`. | `R4` |
| R5 | minor | Deck text is user input. The line `2 __proto__` vanished silently. `4 constructor` became the string `"function Object() {…}4"`. | `parseDeck('4 constructor\n2 __proto__')` | `parseDeck` accumulates with an own-property check and `defineProperty`. | `R5` |
| R6 | minor | Scenario import silently dropped deck entries whose count isn't a whole number (e.g. `"Brainstorm": "4"`). The page then checked a different deck than the one pasted. | Import `{setup:{deck:{…, Brainstorm:"4"}}}` | `modelFromSetup` returns a warning for each dropped entry. The UI already shows warnings. | `R6` |
| R7 | minor | Importing an invalid setup with a long `pile` array rendered one select per entry (40 selects in the repro), because the pile is only normalised once the setup is valid. | Import `{setup:{deck, lifeBeforeDoomsday:0}, pile:[40×"Island"]}` | `modelFromSetup` keeps at most 5 entries (§3 caps a pile at 5). | `R7` |

Not fixed (cosmetic): after TOO BIG, the banner says "Try fewer turns ahead" even when
turnsAhead is already 0 or 1. An Oracle bottom outcome whose looked-at cards were all kept
on top gets the label `"bottom: "`.

## Spec gaps

> Gap 1 (Cavern vs Chalice) was fixed by the lead after review: Cavern-paid creature spells are uncounterable; regression test in tests/review.test.js. The other gaps below remain open (spec, not code; nothing changed).

1. **Cavern of Souls vs Chalice of the Void (real-rules error, would be critical).** §7 says
   Cavern's "can't be countered" clause is "irrelevant in v1". But Chalice is in v1, and
   Chalice's trigger counters the spell. Cavern's text: mana spent "to cast a creature spell
   of the chosen type, and that spell can't be countered". An uncounterable spell can't be
   countered by Chalice.
   - Example: Chalice X=2, Cavern naming Merfolk or Wizard, Oracle cast with at least one
     Cavern mana. That Oracle should resolve; the engine counters it, so it says no_win.
   - Suggested rule: a creature spell paid with at least one restricted Cavern mana ignores
     Chalice.
2. **No upkeep window.** §5.2 turns `pass` from `opp` into untap and draw in one step. In
   real Magic, you get priority in your upkeep, after untap and before the draw. Lands
   untapped that turn can then pay for instants (e.g. Consider or Brainstorm to fix the
   draw). Lines that need untapped mana before the draw step are missing. The model only
   allows instants on the opponent's turn, while those lands are still tapped.
3. **Tie-breaking vs pruning (§9).** PRUNING 1 forces each mana tap to come right before
   the spend. So the solver's plan can differ from the literal rule "ties broken by
   `legalActions` order". The length is the same and the result is deterministic. Fuzz:
   1 of 21 winning scenarios differed. Literal order taps Underground Sea before cracking a
   fetch; the solver taps it later. Suggested wording: "ties broken by `legalActions` order
   among lines where mana is made just before it is spent".
4. **Jace, Wielder of Mysteries on my battlefield** is allowed by validation. Its static
   "draw from an empty library → win instead" is ignored because Jace is "dead". Either
   reject Jace on the battlefield or model the replacement effect.
5. **Card-name case in the deck text.** `4 brainstorm` becomes an unknown (dead) card
   without any warning (§7: unknown names are dead). The UI should list deck names that
   aren't modelled, or match them case-insensitively to `CARDS`. R1 fixes only the Flute
   field.
6. **Validation the spec doesn't define:**
   - `landPlayedThisTurn: "false"` is coerced to `true`.
   - `cavernType` objects become `"[object Object]"`.
   - Two Thalias or two Teegs are accepted, although both are legendary.
   - Huge deck counts build an exile array of that size: 1e6 Islands works in 77 ms; 1e9
     would exhaust memory.

   The spec should say whether to throw on these.
7. **UI vs engine on `noncreatureSpellsCastThisTurn`.** The UI requires ≥ 1 and the engine
   allows 0. That's harmless, but the spec should pick one.

## Fuzzing

The reference checker (`/tmp/fuzz/ref.mjs`, not in the repo) is plain AND/OR minimax over
`legalActions` / `applyAction`, memoised on the spec's `stateKey`. It has no pruning, no
lower bounds, no colour folding and no solver key. For every scenario I compared:

- win vs no_win;
- that the solver's plan replays with `applyAction` to `win` in every branch, with
  matching labels;
- that the plan's worst-case length equals the reference optimum.

| Generator | Scenarios | Wins | Plans with shuffle branches | Mismatches |
|---|---|---|---|---|
| Random boards (hate pieces, Cavern with 4 types, LED, Petal, Unearth + Oracle in gy, Flow State, fetches, Sewers, tapped lands, land drop used, turnsAhead 0–2) | 1,380 | 166 | n/a | 0 |
| Near-win biased (more Oracle, Wraith, Edge, Unearth, Barrowgoyf in gy, Flute on Unearth, Edge, Delta or Petal) | 4,172 | 270 | 55 | 0 |
| Mutation around wins (life ±, one less mana, tap/untap a land, add a hate piece, swap pile cards, turnsAhead ±1, land drop, Cavern type) | 1,209 | 515 | 105 | 0 |
| **Total** | **6,761** | **951** | | **0** answer, **0** replay, **0** length |

Also:

- **Engine invariant walk:** about 43,500 action applications on deep-frozen states along
  random paths. Checked: no duplicate legal actions, distinct outcome labels and states,
  pools never negative, JSON round-trip keeps `stateKey` and `legalActions`. 0 problems.
- **Not fuzzed:** turnsAhead 3, because the brute force is too slow there.

## Checked and found correct

**Rules (§5–§7 against the code, plus hand-driven engine checks):**

- Colored vs generic payments:
  - One `cast` per distinct exact payment.
  - Restricted Cavern mana only for creature spells of `cavernType` (case-insensitive); it
    never reaches noncreature spells or Unearth's cycling.
  - Cavern mana can pay Flute's tax on a matching creature.
- Cost increases: Thalia (noncreature only, Petal/LED included) and Flute stack, e.g.
  Brainstorm under Thalia + Flute costs U + 4. Mana value never changes.
- Deafening Silence:
  - counts noncreature casts, including Doomsday via setup and spells countered by
    Chalice;
  - ignores creatures and cycling;
  - resets on each pass.
- Chalice on 0-MV Petal/LED and on Oracle (card to the graveyard; Unearth can return it).
  Lands are unaffected.
- Teeg blocks nothing supported.
- Flute blocks cycling and fetch activation but not mana abilities (land taps, Petal, LED).
- LED:
  - discards the whole hand, Oracle included, and those cards become Unearth/Flow State
    fodder;
  - works with the Oracle trigger pending or on the opponent's turn, but not during a
    pendingChoice.
- Draw from an empty library is a loss after the action: Brainstorm drawing 3 from 2 never
  offers its choice, and the draw step, cycling, Consider and Ponder behave the same.
- Life thresholds: cycling needs life ≥ 2 and may hit 0; a fetch needs life ≥ 1 (1 → 0 is
  a loss).
- Oracle:
  - devotion is counted at resolution; X ≥ library wins, including 0 ≥ 0;
  - the non-winning case is an `oracle_top` choice (including none) followed by random
    bottom outcomes.
- Unearth: target must be a creature with MV ≤ 3 in the graveyard (not Wraith; Barrowgoyf
  yes). No target means it can't be cast.
- Flow State's instant + sorcery check happens before Flow State itself is in the
  graveyard.
- Shuffle outcomes for Personal Tutor (fixed top), Ponder (shuffle then draw), fetches and
  Edge: enumerated and deduplicated by name.
- Edge of Autumn:
  - counts lands at resolution (5 or more → no search, no shuffle);
  - can find nothing;
  - finds only basics, which enter tapped;
  - cycling sacrifices one land per name/tapped group.
- Undercity Sewers: enters tapped; surveil from play_land and after a fetch shuffle; no
  choice on an empty library.
- Turn structure:
  - pools (both) empty on each pass;
  - untap → reset → draw;
  - one land drop per turn; fetched lands don't count;
  - the `pass` horizon follows turnsAhead.

**Solver (§9):**

- PRUNING 1–5 arguments:
  - Tap-just-before-spend: tried LED in between, Edge cycling of the tapped land, passes
    and same-name lands.
  - Hopeless: no Oracle path.
  - Admissible lower bound: Φ drops by at most 2 per action. Checked every action type.
  - Colour folding for Petal/LED: only colours absent from every castable cost.
  - Solver memo key: graveyard reduced to the instant/sorcery flags plus Unearth targets;
    exile dropped; Silence-conditional count; choice identified by kind/X/mode. Every
    engine reader of the dropped data was traced.
- Iterative-deepening memo: exact values vs lower bounds. The `cap < 0` break only happens
  after a plan exists.
- ABORT is never cached.
- `explain` headers.

**Validation (§3):**

- NaN, Infinity and huge `turnsAhead` throw.
- Non-array zones, non-string names, null entries and bad Chalice/Flute params throw.
- Instants or sorceries on the battlefield throw.
- Deep-frozen setup and pile work; JSON round trip works.

**UI (headless Chrome 153, 390 × 844):**

- The page loads from a sub-path (`/doomsday-pile-practice/`); all paths are relative. The
  only 404 is `/favicon.ico`.
- No horizontal scroll (scrollWidth 390).
- Default deck → add hand cards → U mana → turnsAhead 0 → pick pile → Check pile works.
- Export and re-import round-trip the pile.
- Error paths: bad life, invalid JSON, missing pile picks.
- XSS: card names like `<img src=x onerror=alert(1)>` and `"><svg onload=…>` in the deck,
  hand, battlefield, graveyard, Flute field, pile selects and results produced no
  elements and no dialogs. Everything goes through `escapeHtml` or `textContent`.
