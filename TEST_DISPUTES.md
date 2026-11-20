# Test disputes (implementer → lead)

## D1. `tests/v2-board.test.js` › Voice of Victory › "no spells on the opponent's turn; cycling fine; my own turn unaffected"

**Assertion:** line 246, `assert.ok(hasAction(s, isCast('Dark Ritual')))` on
`st({ hand: ['Dark Ritual', WRAITH], battlefield: [bf(SWAMP)], turnsAhead: 1 }, [perm(VOICE)])`.

**Spec:** SPEC.md §5.4 (unchanged by v2): "Mana abilities are explicit actions (tapping a land, ...)" and
"A `cast` action includes an explicit `payment` object ... A payment is valid if it exactly covers the total
cost" from the pools. `legalActions` only offers a `cast` whose payment comes from the mana pool.

**Argument:** this board has an empty mana pool (`makeSetup` default `manaPool: {}`) and an UNTAPPED Swamp.
Dark Ritual can't be cast until the Swamp is tapped (a separate `tap` action), with or without Voice of
Victory, so the assertion fails for a reason that has nothing to do with Voice. The engine does offer
`Tap Swamp for B` and, after it, `Cast Dark Ritual`. Special-casing would break v1 §5.4 and the v1 suite.

**Side effect for the test's intent:** the later assertion `!hasAction(opp, isCast('Dark Ritual'))` on the
opponent's turn passes trivially for the same reason (empty pool), so it doesn't test Voice either. The same
holds for the Teferi test at v2-board.test.js:219–222 (it passes, but vacuously).

**Suggested fix:** use `manaPool: { B: 1 }` (the pool empties at the pass, so the opponent-turn check would also
need the Swamp tapped there: `act(opp, isTap(SWAMP, 'B'))` before asserting no Ritual cast). I checked by
hand that with `manaPool: { B: 1 }` the turn-0 assertion holds, and that tapping the Swamp on the opponent's turn
gives a {B} with no Dark Ritual cast offered under Voice (and one offered without Voice).
