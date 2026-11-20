# Spec questions (from the test author)

Each entry says what is unclear and how the tests handle it. No test depends on a
guessed answer: either the assertion is skipped or only the unambiguous part is tested.

## Q1. How are the decisions in Consider, Flow State, Personal Tutor, Edge of Autumn's search and Oracle's top-X modelled?
§7 says Brainstorm, Ponder and Sewers' surveil use a `pendingChoice`, but it does not say
whether these use a `pendingChoice` or action parameters: Consider (keep or graveyard),
Flow State (which card(s) to hand plus bottom order), Personal Tutor (which sorcery),
Edge of Autumn (which basic), and Oracle's "choose up to one to put on top" (`resolve_oracle`
has no parameters, so presumably a `pendingChoice`).
**Tests:** do not depend on the mechanism. They use `leaves()` / `decisionGroups()` in
`tests/helpers.js`, which follow every `pendingChoice` option and every random outcome, and
assert on the set of states you can reach (and, where it matters, which steps are random).

## Q2. What is the format of `choose.option`, and what does `pendingChoice` contain beyond `kind`?
§8 says only `choose {option}`. **Tests:** never build `choose` actions themselves. They
take them from `legalActions` and tell options apart by what they do. The only
`pendingChoice` fields checked are `kind: 'surveil'` and `kind: 'brainstorm'` (spelled out
in §7). Ponder's `shuffle` option is found as the option whose result has more than one
outcome, not by its literal value.

## Q3. Is a choice with only one option still a `pendingChoice`?
Examples: Brainstorm when every ordered pair has the same names, Ponder's top cards when
they are all the same, Consider with an empty library. **Tests:** go through every option
whatever the count. They only count options where the spec gives the count (Brainstorm:
distinct ordered pairs; Ponder: distinct orderings + shuffle; surveil: 2).

## Q4. Is the zone-count check per zone or summed over zones?
§3: "Any zone count of a name exceeds the deck count". Read literally, that is per zone.
But hand 2 Oracles + graveyard 1 Oracle with a deck of 2 gives a negative library count,
and so does a deck of 1 Doomsday with a Doomsday in hand (the one on the stack is subtracted
too). Should those throw? **Tests:** only check the per-zone case and a name missing from
the deck.

## Q5. Unearth's cycling {2}: how is it paid?
The `cycle {card, sacrifice?}` action has no `payment`, but Unearth's cycling costs mana.
With a mixed pool (for example {U:1, B:1}), which mana is spent? One action per payment?
**Tests:** only use a single-color pool ({B:2}: one cycle action, pool empty afterwards;
{B:1}: no cycle action). (A reference implementation gave `cycle` an optional `payment`.)

## Q6. Gaddock Teeg can't be tested for blocking anything.
None of my supported cards is a noncreature spell with MV ≥ 4 or {X}. Doomsday has MV 3
and is dead anyway. Street Wraith (MV 5) is a creature. **Tests:** only check that Teeg
does NOT stop my supported spells and that Fatal Push can kill it.
Related: can Street Wraith be cast as a creature ({3}{B}{B})? §7 lists its cost but no cast
behaviour. Not tested.

## Q7. Can Edge of Autumn find nothing?
Fetchlands say so explicitly. Edge of Autumn doesn't. **Tests:** check only that the basic it
finds enters tapped and the library is shuffled, that a nonbasic can't be found, and that with
5+ lands there is no search and no shuffle.

## Q8. Wording of labels and `explain`.
Shuffle labels are only "like" `"library: Island, Swamp"`. **Tests:** check only that labels
are non-empty, pairwise distinct strings, and that `explain()` lines include the three header
strings given in §9 and that some line of a branch plan is indented.

## Q9. Which deck do puzzles G, H and H2 use?
§11 says "Deck for A–F". G, H and H2 only name hands, piles and battlefields. **Tests:** use
the canonical deck for G, H and H2. Every pile and zone fits within it. Please confirm.

## Q10. `npm test` (`node --test tests/`) doesn't run any tests on Node 22.
On Node v22.23.5, `node --test tests/` treats `tests/` as a module path and fails with
"Cannot find module …/tests". It also runs **no** tests. `node --test tests/*.test.js` (or plain
`node --test`, which uses the default `**/*.test.js` patterns) works. This affects
`package.json` and `.github/workflows/test.yml` (both mandated by §2). Suggest changing the
script to `node --test` or `node --test "tests/*.test.js"`.

## Q11. Should `state.turn` change on the opponent's turn?
§5.2: `pass` from `main` "go to phase `opp`"; `pass` from `opp` "start my turn `turn+1`". This
suggests `turn` stays at N during the opponent's turn after my turn N. **Tests:** assert
`turn === 0` in the first `opp` phase. If you meant something else, say so.

## Q12. What does "shortest" count?
§9: "fewest actions in the worst case". **Tests:** count every action in a plan (taps, passes,
`choose`, `resolve_oracle`). They assert depth 5 for A and C, 8 for H (turnsAhead 1), 7 for
the branch puzzle and 6 for custom puzzle 1. Each was worked out by hand as the minimum.

## Q13. Type-name casing in `cards.js`.
§7 doesn't say whether types are spelled `'Creature'` or `'creature'`. **Tests:** compare
case-insensitively.

# v2

Written with the v2 test suite (`tests/v2-*.test.js`) and `SPEC_V2_API.md`. Each entry says what is open and
what the tests do. No test depends on a guessed answer to anything listed as open here.

## V2-Q1. A v1 test contradicts SPEC_V2 (needs the lead).
`tests/setup.test.js` "throws when an opponent permanent has a name not in §6" builds a board with Blood Moon and
expects a throw. SPEC_V2 §2 says unknown permanents no longer throw, and §3 models Blood Moon. That v1 test will
fail once v2 is implemented. I didn't edit it (v1 tests are off-limits to me). Suggestion: change it to assert
"no throw and a warning" for an unknown name (`tests/v2-setup.test.js` already covers that).

## V2-Q2. Everything aimed at the Oracle trigger happens at W-oracle, not W-ability.
SPEC_V2 §5.2 lists the Oracle ETB under W-ability *and* lists Stifle/removal at W-oracle. The API puts all of it at
W-oracle: within one turn the adversary's resources don't change, and acting later gives them more information,
so an earlier window is never better for them. **Tests:** Stifle/Consign/removal/Endurance on the trigger are all
tested at `resolve_oracle`.

## V2-Q3. Removal only targets an Oracle whose trigger is pending.
A removed Oracle can matter later: its devotion counts for a second Oracle. The API limits removal to
"Oracle-pending" to keep branching down. **Tests:** only Oracle-pending removal; one test checks removal isn't
offered before Oracle is in play.

## V2-Q4. Kozilek's Command is modelled as three single-purpose packages.
X=2 exile Oracle; X=0 "I draw"; X=1 exile one graveyard card. The other chosen mode is always the spawn-token mode
on themselves. Real pairs (exile Oracle + exile graveyard; draw + exile graveyard) aren't modelled.

## V2-Q5. Voice of Victory's Mobilize 2.
Per its text, it attacks with two extra 1/1 tokens: that's 3 damage, not 1. SPEC_V2 §4 says "sum of their power".
The API doesn't add Mobilize (§13). **Tests:** the Voice tests don't depend on its damage. Decide which to use.

## V2-Q6. Other attack modifiers.
These aren't in the clock: exalted (Hierarchs), prowess, Guide of Souls, mobilize, first strike. Bowmasters' amass
IS modelled per text (an `Orc Army` permanent whose power grows), and the Army attacks. Please confirm.

## V2-Q7. Opponent costs are never taxed.
Thalia, Sphere, Thorn, Trinisphere, Damping Sphere, Archon and Deafening Silence affect both players per their
texts. For example, Trinisphere makes a pitched Force of Will cost 3. The model applies them to me only. This makes
the opponent's spells cheaper than they really are, so it is pessimistic for me.

## V2-Q8. Wasteland and Ghost Quarter windows.
They're only used at W-oppturn and W-myturn, and I can't tap the land in response. In a real game, killing an
untapped land in my main phase lets me float its mana first. Please confirm.

## V2-Q9. New setup fields the exporter must fill.
- `cardsDrawnThisTurn` (default 1) for Narset, since turn 1 on the play has no draw step.
- `spellsCastThisTurn` (default = `noncreatureSpellsCastThisTurn`) for Archon, Damping Sphere, Mindbreak Trap and
  the Flusterstorm storm count.

The v2 scenario format (§2) doesn't list either field.

## V2-Q10. Alternative-cost assumptions (SPEC_V2_API §8.2).
- Daze needs `'U'` in colors and `landsTotal ≥ 1`: any blue land is assumed to be an Island. The returned
  Island goes back to their hand (handSize +1).
- Snuff Out needs `'B'` and a land.
- Pitch spells need `handSize ≥ 2`. If no unknown card is left in their hand, they must pitch a concrete held card
  of that colour.
- Phyrexian symbols are paid with life first. Their life matters for nothing else in the model.

## V2-Q11. Treasures from Hullbreacher.
The API lets the adversary spend them as mana of any colour. **Tests:** only check `opp.treasures` increments.

## V2-Q12. Torpor Orb also stops the opponent's ETBs.
Bowmasters, Solitude and Endurance all have ETB triggers. An evoked creature's sacrifice is also an ETB trigger,
so under Torpor an evoked Solitude stays. That's in the API but untested.

## V2-Q13. v1 solver prunings need re-proving under v2.
- PRUNING 2 assumes Oracle never returns from the battlefield or exile, and never moves graveyard → library.
  Sink into Stupor (bounce to hand) and Endurance (graveyard → library) break that.
- PRUNING 3's bound "≤ 2 library cards per action" breaks too: Surgical can exile several library cards, and a
  forced Command draw happens on the opponent's action.
- PRUNING 1 (tap only right before spending) must allow mana during `pay_or_not`. Its claim that "no action reads
  whether a land is tapped" no longer holds once Wasteland and Ghost Quarter can destroy lands.

## V2-Q14. Upkeep window (carried over from the v1 review, gap 2).
W-myturn comes after untap and before the draw, but I still get no instant window there.

## V2-Q15. Not modelled (documented in API §13).
- Teferi's −3 and Narset's −2.
- Phelia's flicker, which re-triggers my Oracle.
- Dauthi Voidwalker's sacrifice ability, which plays my exiled Oracle or Doomsday.
- Cabal Therapy's flashback.
- Hexing Squelcher's ward on Thalia/Teeg, which makes my Fatal Push cost 2 life.
- Endurance or Bowmasters pinging their own permanents (that's never a threat to me).

## V2-Q16. Probability input.
`grade()` uses `deckEstimate` literally: N = Σ unseen, with no padding to 60. The exact-fraction tests rely on
this. If an estimate sums to less than 60, the exporter should add an "(unknown)" filler entry.

## V2-Q17. Which pairs are solved.
Only pairs whose two singles both WIN are solved. A pair with a losing single is implied lost. A pair with an
unknown (aborted) single is unknown, and so is any hand containing that card. This saves budget; please confirm.

## V2-Q18. The username blocklist is stored as SHA-256 digests.
The names must never be published, and a test file is published. So `tests/v2-scenario.test.js` stores only the
SHA-256 digests of the lower-cased names and matches hashed tokens (`[A-Za-z0-9_]+`) of every file and path under
`data/`.
- Limit 1: a name embedded inside a longer token isn't caught.
- Limit 2: short names are brute-forceable from their digests.

If that matters, keep the list out of the repo (for example as a CI secret).

## V2-Q19. Built-in modules beyond node:test / node:assert.
SPEC.md §2 says tests use only `node:test` and `node:assert/strict`. The v2 tests also use `node:fs`, `node:path`,
`node:url`, `node:crypto` and `node:perf_hooks`, all built-ins. The v1 review test already uses `node:fs`.

## V2-Q20. Pact of Negation upkeep timing.
The upkeep is checked at the next opponent turn start after the turn Pact was cast. If `turnsAhead` ends before
then, it never comes.

## V2-Q21. Practice mode, stats and the actual pile's best order (SPEC_V2 §7) have no tests here.
They're UI. The pure parts could be tested if the lead wants: seeded deal, best order of the actual 5 cards, and
the localStorage stats shape.

## Lead rulings on v2 questions (binding)
- V2-Q1: the v1 Blood Moon "throws" test is replaced by a warning test (SPEC_V2 §2 supersedes v1).
- V2-Q2..Q4, Q7, Q8, Q10–Q12, Q14–Q16, Q20: accept the test author's simplifications as written in SPEC_V2_API.md; each must be listed in README "Simplifications".
- V2-Q13: any v1 pruning that isn't sound under adversary/bounce/Endurance/Surgical/Wasteland must be switched off when those are in play (gate per state) or re-proved in a comment. Sound > fast.
- V2-Q17: pairs are solved only when both singles win (a losing single already loses every hand that holds it).
- V2-Q18/Q19: fine.
- V2-Q21: the practice-mode UI gets its own tests from the UI agent (pure logic in uiLogic/practiceLogic).
