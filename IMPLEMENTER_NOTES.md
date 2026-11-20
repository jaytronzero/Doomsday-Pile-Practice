# Implementer notes (v2 engine / solver / grade)

## Requests for the UI side (I did not edit UI files)
1. **Worker `grade()`**: please add a message type to `src/solveWorker.js` (or a new practice worker) that
   runs `grade(setup, pile, { maxNodes })` from `src/grade.js` and posts the `GradeResult` back.
   `GradeResult` is plain data except `goldfish.plan`. Plan action objects are plain, so it survives
   `postMessage` (structured clone). Typical sample boards take 0.01–0.5 s; the perf fixture takes ~4.4 s.
2. `solve()` can now return `{ result: 'aborted', reason }`, where `reason` is set when one action would create
   more than `OUTCOME_LIMIT` (50,000) random orderings (`OutcomeLimitError`, exported from `src/engine.js`).
   Show it like TOO BIG. `applyAction` itself throws that error in those states. The Sandbox step-through (if any)
   should catch it.
3. Outcomes now carry `adversary: [{card, mode, target?}]`, and labels of adversary outcomes start with
   `Opponent: …`, parts joined with ` | `. `explain()` prints them as branch labels (⚠ lines).
4. New action type `resolve_opp_spell` and choice kinds `pay_or_not` (options `'decline'` / `{pay}`) and
   `ghost_quarter` (options `null` / basic land name). While `pay_or_not` is pending, `tap` / `sac_petal` /
   `activate_led` are legal too.

## Decisions taken where the spec was silent (please confirm)
- **Warnings**: a permanent gets a "not modelled" warning unless it is in `MODELLED_PERMANENTS`, is `Orc Army`,
  or is a creature in `OPP_CARDS` (its only effect, attacking, is modelled). An OPP_CARDS creature with
  variable power and no scenario `power` gets a "variable power" warning. Each name is warned at most once.
- **My Fatal Push** now targets any opponent creature with MV ≤ 2 per its verified text (OPP_CARDS creatures
  with mv ≤ 2, plus Orc Army tokens), not just Thalia and Teeg. That lets Push kill Bowmasters, Goblin Guide,
  Voidwalker, Delver and others. This doesn't change v1 setups, whose only creatures were Thalia and Teeg.
- **Torpor Orb vs. opponent flash creatures**: a Bowmasters flashed in adds a 1/1 body with no ETB ping or
  amass (its draw trigger still works). Endurance gets mode `'flash'` instead of `'graveyard_to_library'`, and
  it stays even if evoked (V2-Q12). Solitude is never offered, since an Oracle trigger can't be pending under Torpor.
- **Collective Brutality escalate** with no unknown card left in their hand: one option per held card they
  discard (an entry's description says which).
- **Pact of Negation** cast on the opponent's own turn is due at their *following* turn.
- **Two Wastelands / Ghost Quarters**: the options are deduplicated by name (one option per (card, target));
  the window reopens for the second copy.
- **Fetch vs Surgical**: a fetch commits to its `find` when cracked. If Surgical exiles that land from the library
  in response, the fetch finds nothing (it still shuffles). This is slightly pessimistic for me.
- `src/cards.js`: the four oracle strings and Voice of Victory's subtypes are fixed per SPEC_V2 §10. I also set
  Voice's oracle to the verified text with its Mobilize reminder. `verified` flags are unchanged.

## Suggestion (not implemented: outside the spec)
- My Duress / Thoughtseize could take a card from the opponent's modelled hand (a choice of mine). This is
  a real part of Doomsday play ("Duress before going off"). It would make the grade fairer to piles that
  set up a protected turn. It needs a spec line and tests.

## Verification done (outside the repo)
- A brute-force AND/OR reference (no pruning, memoised on `stateKey`) was compared with `solve()` on random v2
  scenarios. Both ran with node limits; scenarios where either side aborted were skipped. Every `solve()` win
  plan was also replayed to the end. Results are in the implementer's report.
