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
