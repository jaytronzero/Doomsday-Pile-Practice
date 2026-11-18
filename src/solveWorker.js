// Runs a pile check off the main thread (SPEC §10: the UI must stay
// responsive). The solver itself is unchanged and synchronous; it just runs in
// a module Web Worker so a search that takes seconds (or hits the node limit)
// doesn't freeze the page. Also importable in Node/tests: solveScenario is pure.
import { buildStartState } from './engine.js';
import { solve, explain } from './solver.js';

/** { setup, pile, maxNodes } → { res, lines } (throws on an invalid setup/pile). */
export function solveScenario({ setup, pile, maxNodes }) {
  const start = buildStartState(setup, pile);
  const res = solve(start, { maxNodes });
  const lines = res.result === 'win' ? explain(res.plan) : [];
  return { res, lines };
}

const inWorker = typeof WorkerGlobalScope !== 'undefined' && typeof self !== 'undefined'
  && self instanceof WorkerGlobalScope; // eslint-disable-line no-undef
if (inWorker) {
  self.onmessage = (e) => {
    const { id } = e.data;
    try {
      const t0 = performance.now();
      const out = solveScenario(e.data);
      self.postMessage({ id, ok: true, ...out, ms: Math.round(performance.now() - t0) });
    } catch (err) {
      self.postMessage({ id, ok: false, error: err.message });
    }
  };
}
