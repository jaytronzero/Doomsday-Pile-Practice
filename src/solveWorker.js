// Runs pile checks off the main thread (SPEC §10: the UI must stay
// responsive). The solver itself is unchanged and synchronous; it just runs in
// a module Web Worker so a search that takes seconds (or hits the node limit)
// doesn't freeze the page. Also importable in Node/tests: solveScenario and
// gradeScenario are pure.
//
// Messages:
//   { id, setup, pile, maxNodes }                  (or type: 'solve') → { id, ok, res, lines, ms }   (v1 Sandbox)
//   { id, type: 'grade', setup, pile, maxNodes, actual?: { pile, ordered } }   (v2 Practice) →
//       { id, ok, phase: 'mine', grade, lines, ms }
//       { id, ok, phase: 'progress', done, total }       (while grading the actual pile's orders)
//       { id, ok, phase: 'actual', actual, ms }           (only if `actual` was sent)
//   errors: { id, ok: false, phase?, error }
import { buildStartState } from './engine.js';
import { solve, explain } from './solver.js';
import { bestOrderOfPile } from './practiceLogic.js';

/** { setup, pile, maxNodes } → { res, lines } (throws on an invalid setup/pile). */
export function solveScenario({ setup, pile, maxNodes }) {
  const start = buildStartState(setup, pile);
  const res = solve(start, { maxNodes });
  const lines = res.result === 'win' ? explain(res.plan) : [];
  return { res, lines };
}

const linesOf = (g) => (g?.goldfish?.result === 'win' && g.goldfish.plan ? explain(g.goldfish.plan) : []);

/** grade.js is loaded lazily so the v1 'solve' path keeps working if it is missing. */
async function loadGrade() {
  let m;
  try {
    m = await import('./grade.js');
  } catch (e) {
    throw new Error(`the grader (src/grade.js) could not be loaded: ${e.message}`);
  }
  if (typeof m.grade !== 'function') throw new Error('src/grade.js does not export grade');
  return m.grade;
}

/** Grade my pile; then (optionally) the best order of the actual pile. `post` receives each phase. */
export async function gradeScenario({ setup, pile, maxNodes, actual = null }, post = () => {}, gradeFn = null) {
  const grade = gradeFn ?? await loadGrade();
  const t0 = Date.now();
  const mine = grade(setup, pile, { maxNodes });
  post({ phase: 'mine', grade: mine, lines: linesOf(mine), ms: Date.now() - t0 });
  if (!actual || !Array.isArray(actual.pile)) return;
  const t1 = Date.now();
  const goldfishSetup = { ...setup, opponent: { ...(setup.opponent ?? {}), hand: [] } };
  const res = bestOrderOfPile(actual.pile, {
    ordered: !!actual.ordered,
    grade: (order) => grade(setup, order, { maxNodes }),
    goldfish: (order) => solve(buildStartState(goldfishSetup, order), { maxNodes }),
    onProgress: ({ done, total }) => post({ phase: 'progress', done, total }),
  });
  res.lines = res.best ? linesOf(res.best.grade) : [];
  post({ phase: 'actual', actual: res, ms: Date.now() - t1 });
}

const inWorker = typeof WorkerGlobalScope !== 'undefined' && typeof self !== 'undefined'
  && self instanceof WorkerGlobalScope; // eslint-disable-line no-undef
if (inWorker) {
  self.onmessage = async (e) => {
    const { id, type } = e.data;
    if (type === 'grade') {
      try {
        await gradeScenario(e.data, (msg) => self.postMessage({ id, ok: true, ...msg }));
      } catch (err) {
        self.postMessage({ id, ok: false, error: err.message });
      }
      return;
    }
    try {
      const t0 = performance.now();
      const out = solveScenario(e.data);
      self.postMessage({ id, ok: true, ...out, ms: Math.round(performance.now() - t0) });
    } catch (err) {
      self.postMessage({ id, ok: false, error: err.message });
    }
  };
}
