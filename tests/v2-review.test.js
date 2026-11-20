// v2 adversarial review (REVIEW_V2.md). Each test pins a confirmed bug: it failed before the fix.
// Card texts: src/oppCards.js (verified). Spec: SPEC_V2.md, SPEC_V2_API.md.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ORACLE, WRAITH, SEA, PILE_A, ISLAND, STIFLE, BOLT, BOWMASTERS,
  makeSetup, withOpp, perm, bf, build, legalActions, applyAction, findAction,
  isPass, isCast, isResolve, using, setupA2, PILE_A2, oppObj,
} from './v2-helpers.js';
import { grade } from '../src/grade.js';
import { validateScenario } from '../src/scenario.js';
import { gradeView, boardView } from '../src/practiceLogic.js';
import { renderResultHTML } from '../src/uiLogic.js';

const WASTE = 'Wasteland';
const GQ = 'Ghost Quarter';
const CRYPT = "Tormod's Crypt";

/** Outcomes of passing from my Doomsday turn (W-oppturn runs inside). */
function passOutcomes(state) {
  return applyAction(state, findAction(state, isPass));
}

describe('R1. Blood Moon / Magus turn the opponent\'s own Wasteland and Ghost Quarter into Mountains', () => {
  // Blood Moon / Magus of the Moon (verified): "Nonbasic lands are Mountains." That includes THEIR
  // Wasteland and Ghost Quarter (each player's), which lose their "{T}, Sacrifice: Destroy target … land"
  // abilities (CR 305.7). So the visible ability must not be offered.
  const st = (moon, land) => build(withOpp(makeSetup({ hand: [ORACLE], battlefield: [bf(SEA)], turnsAhead: 1 }),
    { permanents: [perm(moon), perm(land)] }), PILE_A);
  for (const moon of ['Blood Moon', 'Magus of the Moon']) {
    for (const land of [WASTE, GQ]) {
      test(`${moon} + ${land}: no destroy option at W-oppturn`, () => {
        const outs = passOutcomes(st(moon, land));
        assert.equal(using(outs, land).length, 0, outs.map((o) => o.label).join(' | '));
      });
    }
  }
  test('without a Moon the Wasteland is still used (control)', () => {
    const s = build(withOpp(makeSetup({ hand: [ORACLE], battlefield: [bf(SEA)], turnsAhead: 1 }), { permanents: [perm(WASTE)] }), PILE_A);
    assert.ok(using(passOutcomes(s), WASTE).length > 0);
  });
});

describe('R2. Collector Ouphe / Pithing Needle stop the opponent\'s own visible abilities', () => {
  // Collector Ouphe (verified): "Activated abilities of artifacts can't be activated." (every artifact, theirs too)
  test('Ouphe: Tormod\'s Crypt cannot be activated', () => {
    const s = build(withOpp(makeSetup({ hand: [ORACLE], turnsAhead: 1 }), { permanents: [perm('Collector Ouphe'), perm(CRYPT)] }), PILE_A);
    assert.equal(using(passOutcomes(s), CRYPT).length, 0);
  });
  test('Karn only stops MY artifacts ("artifacts your opponents control"): their Crypt still works', () => {
    const s = build(withOpp(makeSetup({ hand: [ORACLE], turnsAhead: 1 }), { permanents: [perm('Karn, the Great Creator'), perm(CRYPT)] }), PILE_A);
    assert.ok(using(passOutcomes(s), CRYPT).length > 0);
  });
  // Pithing Needle (verified): "Activated abilities of sources with the chosen name can't be activated unless
  // they're mana abilities." — sources of every player.
  test('Pithing Needle naming Wasteland stops their Wasteland', () => {
    const s = build(withOpp(makeSetup({ hand: [ORACLE], battlefield: [bf(SEA)], turnsAhead: 1 }),
      { permanents: [perm('Pithing Needle', { named: WASTE }), perm(WASTE)] }), PILE_A);
    assert.equal(using(passOutcomes(s), WASTE).length, 0);
  });
});

describe('R3. The opponent\'s own Chalice of the Void counters THEIR noncreature spells too', () => {
  // Chalice (verified): "Whenever a player casts a spell with mana value equal to the number of charge
  // counters on Chalice of the Void, counter that spell." API §13 only exempts them from cost TAXES and the
  // Silence/Archon restrictions; a countered Stifle does nothing, so it is not a real option.
  const st = (x) => {
    const s0 = build(withOpp(makeSetup({ hand: [ORACLE], manaPool: { U: 2 }, turnsAhead: 0 }),
      { permanents: [perm('Chalice of the Void', { x })], hand: [STIFLE, BOLT], untapped: 2, total: 2, colors: 'UR' }), PILE_A);
    const s1 = applyAction(s0, findAction(s0, isCast(ORACLE)))[0].state;
    return applyAction(s1, findAction(s1, isResolve));
  };
  test('Chalice on 1: no Stifle, no Bolt on the Oracle trigger', () => {
    const outs = st(1);
    assert.equal(using(outs, STIFLE).length, 0, outs.map((o) => o.label).join(' | '));
    assert.equal(using(outs, BOLT).length, 0, outs.map((o) => o.label).join(' | '));
  });
  test('Chalice on 3: Stifle and Bolt (MV 1) are still options (control)', () => {
    const outs = st(3);
    assert.ok(using(outs, STIFLE).length > 0);
    assert.ok(using(outs, BOLT).length > 0);
  });
  test('verdict: Oracle with Stifle in their hand wins once their Chalice on 1 is counted', () => {
    // UU floating, Oracle in hand, library of 2 → devotion 2 wins unless they Stifle the trigger.
    const setup = withOpp(makeSetup({ deck: { Doomsday: 1, [ORACLE]: 1, Island: 2 }, hand: [ORACLE], manaPool: { U: 2 }, turnsAhead: 0 }),
      { permanents: [perm('Chalice of the Void', { x: 1 })], hand: [STIFLE], untapped: 1, total: 1, colors: 'U' });
    const g = grade({ ...setup, opponent: { ...setup.opponent, handSize: 1, deckEstimate: { [STIFLE]: 1 } } }, ['Island', 'Island']);
    assert.equal(g.goldfish.result, 'win');
    assert.equal(g.singles[0].wins, true);
  });
});

describe('R4. Trinisphere untaps in the opponent\'s untap step', () => {
  // Trinisphere (verified): "As long as Trinisphere is untapped, …". A Trinisphere that was tapped when Doomsday
  // resolved untaps at the start of their turn like every permanent they control.
  test('tapped at Doomsday, untapped from their turn on: my 1-mana instant then costs 3', () => {
    const s0 = build(withOpp(makeSetup({ hand: ['Dark Ritual'], manaPool: {}, battlefield: [bf('Swamp'), bf('Swamp')], turnsAhead: 1 }),
      { permanents: [perm('Trinisphere', { tapped: true })] }), PILE_A);
    const opp = passOutcomes(s0)[0].state;
    assert.equal(opp.opponent.permanents.find((p) => p.name === 'Trinisphere').tapped, false);
    // two Swamps = 2 mana: not enough for a 3-mana Dark Ritual
    let s = opp;
    for (const a of legalActions(s).filter((x) => x.type === 'tap')) s = applyAction(s, a)[0].state;
    s = applyAction(s, legalActions(s).find((x) => x.type === 'tap'))[0].state;
    assert.ok(!legalActions(s).some(isCast('Dark Ritual')));
  });
});

describe('R5. TOO BIG results carry and show their reason', () => {
  const reason = 'One action would create more than 50000 random outcomes (362880); the board is too big to enumerate.';
  const setup = withOpp(setupA2(), { hand: [], untapped: 1, colors: 'U' });
  setup.opponent.deckEstimate = { [STIFLE]: 2, Island: 10 };
  setup.opponent.handSize = 2;
  test('grade(): an aborted single/pair keeps the solver\'s reason', () => {
    const solver = (st) => (st.opp.hand.length ? { result: 'aborted', plan: null, nodes: 1, reason } : { result: 'win', plan: { kind: 'win' }, nodes: 1 });
    const g = grade(setup, [...PILE_A2], { solver });
    assert.equal(g.singles[0].wins, null);
    assert.equal(g.singles[0].reason, reason);
  });
  test('practice reveal: gradeView exposes the goldfish reason and singles mention it', () => {
    const v = gradeView({ goldfish: { result: 'aborted', reason }, pWin: null, pWinRange: [0, 1], singles: [] });
    assert.equal(v.goldfishLabel, 'TOO BIG');
    assert.equal(v.reason, reason);
    const w = gradeView({ goldfish: { result: 'win' }, pWin: null, pWinRange: [0, 1], singles: [{ card: STIFLE, k: 2, pHold: 0.3, wins: null, reason }] });
    assert.ok(w.singles[0].text.includes('too big'), w.singles[0].text);
  });
  test('Sandbox: renderResultHTML shows the reason of an aborted solve', () => {
    const html = renderResultHTML({ result: 'aborted', nodes: 5, reason });
    assert.ok(html.includes('TOO BIG') && html.includes('362880'), html);
  });
});

describe('R6. Practice board shows the engine\'s own warnings (state.warnings), not only the scenario\'s', () => {
  test('an unmodelled permanent with no scenario warning is still flagged', () => {
    const sc = {
      id: 'x', source: {}, setup: withOpp(setupA2(), { permanents: [perm('Goblin Bombardment')] }),
      actual: { pile: [...PILE_A2], pileOrdered: false, result: 'win' }, warnings: [],
    };
    const v = boardView(sc, null, (setup, pile) => build(setup, pile));
    assert.ok(v.warnings.some((w) => w.includes('Goblin Bombardment')), v.warnings.join(' | '));
  });
  test('no duplicate when the scenario already carries the same text', () => {
    const setup = withOpp(setupA2(), { permanents: [perm('Goblin Bombardment')] });
    const w = build(setup, PILE_A2).warnings[0];
    const sc = { id: 'x', source: {}, setup, actual: { pile: [...PILE_A2], pileOrdered: false, result: 'win' }, warnings: [w] };
    assert.deepEqual(boardView(sc, null, (s, p) => build(s, p)).warnings, [w]);
  });
});

describe('R7. Scenario validator: whitelist every object level, check deckEstimate (SPEC_V2 §9: no username in data/)', () => {
  function sample() {
    return {
      id: 'sample-r7',
      source: { player: 'SAMPLE', date: '2026-11-14', deck: 'Turbo DD', oppDeck: 'UR Delver', gameNumber: 2, onPlay: true },
      setup: {
        ...setupA2(),
        opponent: { ...oppObj({ permanents: [{ name: 'Delver of Secrets', power: 3 }], untapped: 1, total: 3, colors: 'UR', handSize: 4 }),
          deckEstimate: { 'Force of Will': 4, Island: 40 }, deckEstimateSource: 'SAMPLE' },
      },
      actual: { pile: [...PILE_A2], pileOrdered: false, result: 'win', winBy: 'normal', turnsAfterDoomsday: 0 },
      warnings: [],
    };
  }
  test('the base sample is valid', () => assert.deepEqual(validateScenario(sample()), []));
  test('an extra key at the top level, in actual, in setup or in a permanent is rejected', () => {
    const a = sample(); a.opponentName = 'OPPONENT_NAME';
    const b = sample(); b.actual.opponent = 'OPPONENT_NAME';
    const c = sample(); c.setup.opponentName = 'OPPONENT_NAME';
    const d = sample(); d.setup.opponent.permanents[0].controller = 'OPPONENT_NAME';
    for (const s of [a, b, c, d]) assert.ok(validateScenario(s).length > 0, JSON.stringify(s).slice(0, 80));
  });
  test('deckEstimate counts must be whole numbers ≥ 0 (grade() would throw a RangeError otherwise)', () => {
    const s = sample(); s.setup.opponent.deckEstimate = { 'Force of Will': 2.5, Island: 40 };
    assert.ok(validateScenario(s).length > 0);
    const t = sample(); t.setup.opponent.deckEstimate = ['Force of Will'];
    assert.ok(validateScenario(t).length > 0);
  });
});

describe('R8. Bowmasters flashed in is a 1/1 attacker next turn (control: clock + adversary together)', () => {
  test('flash at W-cast on my turn, it attacks on theirs', () => {
    const s0 = build(withOpp(makeSetup({ hand: [WRAITH, 'Brainstorm'], manaPool: { U: 1 }, lifeBeforeDoomsday: 20, turnsAhead: 1 }),
      { hand: [BOWMASTERS], untapped: 2, total: 2, colors: 'B' }), PILE_A);
    const outs = applyAction(s0, findAction(s0, isCast('Brainstorm')));
    const flashed = using(outs, BOWMASTERS, 'flash');
    assert.ok(flashed.length > 0);
    // put back two cards, pass: life − (1 Bowmasters + Army power)
    let s = flashed[0].state;
    s = applyAction(s, legalActions(s)[0])[0].state;
    const army = s.opponent.permanents.find((p) => p.name === 'Orc Army').power;
    const lifeBefore = s.life;
    const after = applyAction(s, findAction(s, isPass))[0].state;
    assert.equal(after.life, lifeBefore - 1 - army);
  });
});
void ISLAND;

describe('R9. grade() on a board where the opponent has no cards in hand', () => {
  // A real logged board can have handSize 0 (aggro emptied its hand). API §11.2 step 2 clamps h, and step 6 runs
  // a single per relevant card: the sub-solve's hand [r] must not make buildStartState throw
  // ("handSize ≥ hand.length"). With h = 0 they hold nothing: P(win) = the goldfish result.
  test('handSize 0: no throw, pWin = 1 when the goldfish wins', () => {
    const setup = withOpp(setupA2(), { hand: [], untapped: 1, total: 1, colors: 'U' });
    setup.opponent.handSize = 0;
    setup.opponent.deckEstimate = { [STIFLE]: 4, Island: 20 };
    const g = grade(setup, [...PILE_A2]);
    assert.equal(g.goldfish.result, 'win');
    assert.equal(g.h, 0);
    assert.deepEqual(g.pWinRange, [1, 1]);
    assert.equal(g.singles[0].pHold, 0);
  });
});

describe('R10. grade() probability step stays fast with many modelled names', () => {
  // The plain enumeration of API §11.1 is exponential in |R|: 18 names × 3 copies at h = 7 took ~3 s on its own,
  // 30 names over a minute (before any sub-solve). grade() now regroups names exactly (see bucketedProbability).
  test('24 relevant names, h = 7: under 2 s, and equal to the plain enumeration on a smaller case', async () => {
    const { MODELLED_HAND_CARDS } = await import('../src/opponent.js');
    const { handWinProbability, handVerdict, pairKey } = await import('../src/grade.js');
    const names = MODELLED_HAND_CARDS.slice(0, 24);
    const setup = withOpp(setupA2(), { hand: [], untapped: 6, total: 6, colors: 'WUBRGC' });
    setup.opponent.deckEstimate = { ...Object.fromEntries(names.map((n) => [n, 3])), Island: 20 };
    setup.opponent.handSize = 7;
    const lose = new Set(names.filter((_, i) => i % 4 === 0));
    const solver = (st) => {
      const h = st.opp.hand;
      const r = h.length === 2 && h[0] === names[1] && h[1] === names[2] ? 'no_win' : h.some((c) => lose.has(c)) ? 'no_win' : 'win';
      return { result: r, plan: null, nodes: 1 };
    };
    const t0 = Date.now();
    const g = grade(setup, [...PILE_A2], { solver });
    assert.ok(Date.now() - t0 < 2000, `took ${Date.now() - t0} ms`);
    assert.ok(g.pWin > 0 && g.pWin < 1);
    // small case: same number as the plain §11.1 enumeration
    const small = withOpp(setupA2(), { hand: [], untapped: 6, total: 6, colors: 'WUBRGC' });
    small.opponent.deckEstimate = { ...Object.fromEntries(names.slice(0, 8).map((n) => [n, 2])), Island: 20 };
    small.opponent.handSize = 5;
    const gs = grade(small, [...PILE_A2], { solver });
    const sm = Object.fromEntries(gs.singles.map((x) => [x.card, x.wins]));
    const pm = Object.fromEntries(gs.pairs.map((p) => [pairKey(p.cards[0], p.cards[1]), p.wins]));
    const ref = handWinProbability(Object.fromEntries(gs.singles.map((x) => [x.card, x.k])), gs.N, gs.h, (v) => handVerdict(v, sm, pm));
    assert.ok(Math.abs(ref.low - gs.pWinRange[0]) < 1e-12 && Math.abs(ref.high - gs.pWinRange[1]) < 1e-12);
  });
});

describe('R11. explain() prints the rest of the line after a pass with several outcomes', () => {
  // A pass opens W-oppturn / W-myturn, so with a visible Wasteland / Ghost Quarter (or any hand card) the
  // pass is a BRANCH (API §7). explain() treated every pass as a step and stopped: the reveal showed
  // "Turn 0, Opponent's turn" and nothing else, not even WIN.
  test('Ghost Quarter on the board: every branch is printed down to WIN', async () => {
    const { solve, explain } = await import('../src/solver.js');
    const setup = withOpp(makeSetup({
      deck: { Doomsday: 1, [ORACLE]: 1, [SEA]: 2, Island: 2, [WRAITH]: 1 }, hand: [ORACLE],
      battlefield: [bf(SEA, true), bf(SEA, true)], manaPool: {}, turnsAhead: 1,
    }), { permanents: [perm(GQ)] });
    const r = solve(build(setup, ['Island', WRAITH, 'Island']));
    assert.equal(r.result, 'win');
    const lines = explain(r.plan);
    assert.ok(lines.some((l) => l.includes('Ghost Quarter')), lines.join('\n'));
    assert.ok(lines.filter((l) => l.trim() === 'WIN').length >= 2, lines.join('\n'));
    assert.ok(lines.some((l) => l.includes('Turn 1')), lines.join('\n'));
  });
});

describe('R12. Float noise in P(win) is not shown as ">99%"', () => {
  // A sum of hypergeometric weights that is exactly 1 in theory comes out as 0.9999999999999999 (seen on a real
  // board: "est. 68%–>99%" for a [0.68, 1] range).
  test('formatPct(1 − 1e-16) is 100%; formatPct(1e-17) is 0%', async () => {
    const { formatPct } = await import('../src/practiceLogic.js');
    assert.equal(formatPct(0.9999999999999999), '100%');
    assert.equal(formatPct(1e-17), '0%');
    assert.equal(formatPct(0.999), '>99%');
  });
});

describe('R13. Under Blood Moon / Magus my fetchlands are Mountains that tap for {R}', () => {
  // SPEC_V2 §3: "my nonbasic lands are Mountains: Underground Sea / Undercity Sewers / Cavern / fetches tap for {R}
  // only and fetches lose their ability"; API §4: "my nonbasic lands on the battlefield tap only for R".
  // Blood Moon (verified): "Nonbasic lands are Mountains." A Mountain has "{T}: Add {R}." (CR 305.6).
  for (const moon of ['Blood Moon', 'Magus of the Moon']) {
    test(`${moon}: Polluted Delta taps for R and cannot be cracked`, () => {
      const s = build(withOpp(makeSetup({ hand: [ORACLE], battlefield: [bf('Polluted Delta')], turnsAhead: 0 }), { permanents: [perm(moon)] }), PILE_A);
      const acts = legalActions(s);
      assert.ok(acts.some((a) => a.type === 'tap' && a.card === 'Polluted Delta' && a.color === 'R'), acts.map((a) => a.desc).join(' | '));
      assert.ok(!acts.some((a) => a.type === 'crack_fetch'));
    });
  }
});
