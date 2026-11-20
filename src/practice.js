// Practice mode DOM layer (SPEC_V2 §7). Pure logic lives in practiceLogic.js.
// The engine, scenario validator and grader are loaded dynamically so the tab
// stays usable (with a clear message) while any of them is missing.
import { escapeHtml, normalizePile, pileOptions, poolSummary, pileSize } from './uiLogic.js';
import {
  makeRng, parseScenarioFile, filterOptions, filterScenarios, dealScenario,
  loadStats, saveStats, emptyStats, recordAttempt, applyActualComparison, statsSummary, isMastered,
  boardView, revealView, formatPct,
} from './practiceLogic.js';

const $ = (sel, root = document) => root.querySelector(sel);
const MAX_NODES = 200000;
const SCENARIOS_URL = './data/scenarios.json';
const SAMPLES_URL = './data/sample-scenarios.json';

let engine = null;            // { buildStartState, availablePile } or null
let validateFile = null;      // scenario.js validateScenarioFile or null
let storage = null;
let stats = emptyStats();
let scenarios = [];
let sourceLabel = '';
const seed = (() => {
  const q = new URLSearchParams(location.search).get('seed');
  return q !== null && /^\d+$/.test(q) ? Number(q) : (Date.now() >>> 0);
})();
const rng = makeRng(seed);
let current = null;           // { scenario, view, pile }
let lastId = null;

// ---------- tabs ----------

function selectTab(name) {
  for (const t of ['practice', 'sandbox']) {
    const on = t === name;
    const tab = $(`#tab-${t}`);
    tab.setAttribute('aria-selected', String(on));
    tab.tabIndex = on ? 0 : -1;
    $(`#${t}`).hidden = !on;
  }
  try { history.replaceState(null, '', name === 'sandbox' ? '#sandbox' : location.pathname + location.search); } catch { /* ignore */ }
}

function bindTabs() {
  $('#tab-practice').addEventListener('click', () => selectTab('practice'));
  $('#tab-sandbox').addEventListener('click', () => selectTab('sandbox'));
  $('.tabs').addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const next = $('#tab-practice').getAttribute('aria-selected') === 'true' ? 'sandbox' : 'practice';
    selectTab(next);
    $(`#tab-${next}`).focus();
  });
  selectTab(location.hash === '#sandbox' ? 'sandbox' : 'practice');
}

// ---------- banner ----------

function banner(html, kind = 'info') {
  const el = $('#p-banner');
  if (!html) { el.hidden = true; el.innerHTML = ''; return; }
  el.hidden = false;
  el.className = `notice ${kind}`;
  el.innerHTML = html;
}

// ---------- loading ----------

async function loadOptionalModules() {
  try {
    const m = await import('./engine.js');
    if (typeof m.availablePile === 'function' && typeof m.buildStartState === 'function') engine = m;
  } catch { /* the Sandbox tab reports engine load errors */ }
  try {
    const m = await import('./scenario.js');
    if (typeof m.validateScenarioFile === 'function') validateFile = m.validateScenarioFile;
  } catch { /* structural checks only */ }
}

async function fetchFile(url) {
  const r = await fetch(url, { cache: 'no-cache' });
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  return parseScenarioFile(await r.text(), validateFile);
}

async function loadScenarios() {
  const notes = [];
  try {
    const { scenarios: list, errors } = await fetchFile(SCENARIOS_URL);
    if (list.length) {
      setScenarios(list, 'data/scenarios.json');
      if (errors.length) banner(problemsHTML(`Some boards in data/scenarios.json were skipped (${errors.length} problem${errors.length > 1 ? 's' : ''}).`, errors), 'warn');
      else banner('');
      return;
    }
    notes.push(errors.length ? `data/scenarios.json has no usable boards (${errors[0]})` : 'data/scenarios.json is empty');
  } catch (e) {
    notes.push('data/scenarios.json not found');
  }
  try {
    const { scenarios: list, errors } = await fetchFile(SAMPLES_URL);
    if (!list.length) throw new Error(errors[0] ?? 'no boards');
    setScenarios(list, 'sample boards');
    banner('<strong>Sample boards: real boards not loaded yet.</strong> These are hand-made SAMPLE boards with SAMPLE deck estimates, '
      + 'not logged games. Use “Load scenarios file” below to practise on a real file.'
      + (errors.length ? problemsHTML(' Some samples were skipped:', errors) : ''), 'warn');
  } catch (e) {
    setScenarios([], '');
    banner(`<strong>No boards loaded.</strong> ${escapeHtml(notes.join('; '))}; the samples failed too (${escapeHtml(e.message)}). `
      + 'Use “Load scenarios file” below.', 'error');
    $('#p-sec-deal details').open = true;
  }
}

function problemsHTML(lead, errors) {
  const shown = errors.slice(0, 8);
  return `${escapeHtml(lead)}<details><summary>Details</summary><ul class="errors">${shown.map((m) => `<li>${escapeHtml(m)}</li>`).join('')}`
    + `${errors.length > shown.length ? `<li>… ${errors.length - shown.length} more</li>` : ''}</ul></details>`;
}

function setScenarios(list, label) {
  scenarios = list;
  sourceLabel = label;
  const { decks, oppDecks, players } = filterOptions(list);
  const fill = (id, values) => {
    const sel = $(id);
    const prev = sel.value;
    sel.innerHTML = '<option value="">Any</option>' + values.map((v) => `<option>${escapeHtml(v)}</option>`).join('');
    if (values.includes(prev)) sel.value = prev;
  };
  fill('#p-f-deck', decks);
  fill('#p-f-opp', oppDecks);
  fill('#p-f-player', players);
  updateCount();
  renderStats();
}

async function onFile(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  let text;
  try { text = await file.text(); } catch (err) { banner(`Could not read ${escapeHtml(file.name)}: ${escapeHtml(err.message)}`, 'error'); return; }
  const { scenarios: list, errors } = parseScenarioFile(text, validateFile);
  if (!list.length) {
    banner(problemsHTML(`${file.name}: no usable boards.`, errors.length ? errors : ['The file has no scenarios.']), 'error');
    return;
  }
  setScenarios(list, file.name);
  banner(`Loaded ${list.length} board${list.length > 1 ? 's' : ''} from <strong>${escapeHtml(file.name)}</strong>.`
    + (errors.length ? problemsHTML(` ${errors.length} problem${errors.length > 1 ? 's' : ''}; invalid boards were skipped.`, errors) : ''),
  errors.length ? 'warn' : 'info');
  clearBoard();
}

// ---------- filters / deal ----------

function currentFilter() {
  return { deck: $('#p-f-deck').value, oppDeck: $('#p-f-opp').value, player: $('#p-f-player').value };
}

function updateCount() {
  const list = filterScenarios(scenarios, currentFilter());
  const open = list.filter((s) => !isMastered(stats, s.id)).length;
  $('#p-count').textContent = scenarios.length
    ? `${list.length} board${list.length === 1 ? ' matches' : 's match'} (${open} not solved yet) · from ${sourceLabel} · seed ${seed}`
    : 'No boards loaded.';
  $('#p-deal').disabled = !list.length;
}

function onDeal() {
  stopWorker();
  const list = filterScenarios(scenarios, currentFilter());
  const { scenario, allMastered } = dealScenario(list, stats, { rng, repeatAll: $('#p-repeat').checked, lastId });
  if (!scenario) return;
  lastId = scenario.id;
  const view = boardView(scenario, engine ? engine.availablePile : null);
  current = { scenario, view, pile: normalizePile(view.pool, []) };
  renderBoard(view, allMastered);
  renderPile();
  $('#p-result').innerHTML = '';
  finishSubmit();
  $('#p-sec-board').hidden = false;
  $('#p-sec-pile').hidden = false;
  $('#p-sec-board').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function clearBoard() {
  stopWorker();
  current = null;
  $('#p-sec-board').hidden = true;
  $('#p-sec-pile').hidden = true;
  $('#p-result').innerHTML = '';
}

// ---------- board view ----------

const chips = (items, empty = 'none') => (items.length
  ? `<ul class="chips">${items.join('')}</ul>` : `<p class="meta">${empty}</p>`);
const chip = (text, cls = '') => `<li${cls ? ` class="${cls}"` : ''}>${text}</li>`;

function renderBoard(v, allMastered) {
  $('#p-title').textContent = v.title;
  const me = v.me;
  const opp = v.opp;
  let html = '';
  if (allMastered) html += '<p class="notice info">Every matching board is solved: dealing from all of them.</p>';
  html += `<p class="meta">${v.meta.map(escapeHtml).join(' · ')}${v.isSample ? ' · <strong class="tag">SAMPLE</strong>' : ''}</p>`;
  html += `<div class="facts">
    <div><span class="k">Life after Doomsday</span><span class="v">${me.lifeAfter ?? '?'}</span><span class="meta">from ${escapeHtml(me.lifeBefore)}</span></div>
    <div><span class="k">Floating mana</span><span class="v">${escapeHtml(me.mana)}</span></div>
    <div><span class="k">Turns ahead</span><span class="v">${v.turnsAhead}</span><span class="meta">${v.turnsAhead === 0 ? 'win this turn' : 'incl. this turn'}</span></div>
    <div><span class="k">Land drop</span><span class="v">${me.landPlayed ? 'used' : 'available'}</span><span class="meta">${escapeHtml(me.spellsCast)} spell${me.spellsCast === 1 ? '' : 's'} cast</span></div>
  </div>`;
  html += '<h3>My hand</h3>' + chips(me.hand.map((c) => chip(`${escapeHtml(c.name)}${c.n > 1 ? ` <b>×${c.n}</b>` : ''}`)), 'empty');
  html += '<h3>My battlefield</h3>' + chips(me.battlefield.map((p) =>
    chip(`${escapeHtml(p.name)}${p.tapped ? ' <span class="meta">(tapped)</span>' : ''}`, p.tapped ? 'tapped' : '')), 'empty');
  if (me.graveyard.length || me.exile.length) {
    html += `<details><summary>My graveyard and exile <span class="meta">(before Doomsday)</span></summary>
      <h3>Graveyard</h3>${chips(me.graveyard.map((n) => chip(escapeHtml(n))), 'empty')}
      <h3>Exile</h3>${chips(me.exile.map((n) => chip(escapeHtml(n))), 'empty')}</details>`;
  }
  html += `<h3>Opponent</h3>
    <div class="facts">
      <div><span class="k">Hand</span><span class="v">${escapeHtml(opp.handSize)}</span><span class="meta">cards</span></div>
      <div><span class="k">Lands</span><span class="v">${escapeHtml(opp.lands)}</span></div>
      <div><span class="k">Life</span><span class="v">${escapeHtml(opp.life)}</span></div>
      <div><span class="k">Clock</span><span class="v">${opp.clock}${opp.clockUnknown ? '+' : ''}</span><span class="meta">damage per turn</span></div>
    </div>`;
  html += '<h3>Opponent permanents <span class="meta">(lands not listed)</span></h3>' + chips(opp.permanents.map((p) => {
    const pt = p.power === null ? '' : ` <b class="pw">${escapeHtml(p.power)}${p.toughness !== null ? `/${escapeHtml(p.toughness)}` : ''}</b>`;
    return chip(`${escapeHtml(p.name)}${pt}${p.detail ? ` <span class="meta">(${escapeHtml(p.detail)})</span>` : ''}`);
  }), 'none');
  html += '<h3>Opponent graveyard</h3>' + chips(opp.graveyard.map((n) => chip(escapeHtml(n))), 'empty');
  if (opp.exile.length) html += '<h3>Opponent exile</h3>' + chips(opp.exile.map((n) => chip(escapeHtml(n))), 'empty');
  if (v.warnings.length || v.poolError) {
    html += `<ul class="warnlist">${[...v.warnings, ...(v.poolError ? [`Pile pool: ${v.poolError}`] : [])]
      .map((w) => `<li>${escapeHtml(w)}</li>`).join('')}</ul>`;
  }
  $('#p-board').innerHTML = html;
}

// ---------- pile builder (v1 pile-select logic) ----------

function renderPile() {
  const pool = current.view.pool;
  const size = current.pile.length;
  let html = '';
  for (let i = 0; i < size; i++) {
    const opts = pileOptions(pool, current.pile, i);
    const label = i === 0 ? 'Top' : i === size - 1 ? 'Bottom' : `Card ${i + 1}`;
    html += `<li><select data-i="${i}" aria-label="Pile card ${i + 1} (${label})">
      <option value="">— ${label} —</option>
      ${opts.map((o) => `<option value="${escapeHtml(o.name)}"${o.name === current.pile[i] ? ' selected' : ''}>${escapeHtml(o.name)} (${o.remaining})</option>`).join('')}
    </select></li>`;
  }
  $('#p-pile').innerHTML = size ? html : '<li class="meta">The pile pool is empty.</li>';
  const summary = poolSummary(pool, current.pile);
  const total = summary.reduce((a, s) => a + s.total, 0);
  $('#p-pool-total').textContent = `(${total} cards, pile of ${pileSize(pool)})`;
  $('#p-pool').innerHTML = summary.map((s) =>
    `<li class="${s.left ? '' : 'gone'}">${s.left}/${s.total} ${escapeHtml(s.name)}</li>`).join('');
}

function onPileChange(e) {
  const i = Number(e.target.dataset.i);
  if (!Number.isInteger(i) || !current) return;
  const pile = [...current.pile];
  pile[i] = e.target.value;
  current.pile = normalizePile(current.view.pool, pile);
  renderPile();
  $(`#p-pile select[data-i="${i}"]`)?.focus();
}

// ---------- submit / worker ----------

let worker;          // undefined = none running; null = workers unsupported
let job = 0;
let phase = null;    // null | 'mine' | 'actual'
let partial = null;  // { mine: {pile, grade, lines}, progress }

function stopWorker() {
  if (worker) worker.terminate();
  if (worker !== null) worker = undefined;
  job += 1;
  phase = null;
}

function finishSubmit() {
  const btn = $('#p-submit');
  btn.textContent = 'Submit pile';
  btn.disabled = !current;
}

function showError(messages) {
  $('#p-result').innerHTML = `<ul class="errors">${messages.map((m) => `<li>${escapeHtml(m)}</li>`).join('')}</ul>`;
}

function onSubmit() {
  if (phase) { // the button reads "Cancel" while grading
    const hadMine = phase === 'actual';
    stopWorker();
    finishSubmit();
    if (hadMine && partial) renderReveal(partial.mine, null, 'Grading the real pile was cancelled.');
    else $('#p-result').innerHTML = '<p class="meta">Cancelled.</p>';
    return;
  }
  if (!current) return;
  const missing = current.pile.map((n, i) => (n ? null : i + 1)).filter(Boolean);
  if (missing.length) { showError([`Choose a card for pile position${missing.length > 1 ? 's' : ''} ${missing.join(', ')}.`]); return; }
  const { scenario } = current;
  if (engine) {
    try { engine.buildStartState(scenario.setup, [...current.pile]); } catch (e) { showError([e.message]); return; }
  }
  const pile = [...current.pile];
  partial = { mine: null, progress: null, scenarioId: scenario.id };
  $('#p-result').innerHTML = '<div class="banner busy" role="status">Grading your pile…</div>';
  const msg = {
    type: 'grade', setup: scenario.setup, pile, maxNodes: MAX_NODES,
    actual: { pile: [...scenario.actual.pile], ordered: !!scenario.actual.pileOrdered },
  };
  phase = 'mine';
  $('#p-submit').textContent = 'Cancel';
  if (!startWorker(msg)) gradeInline(msg);
}

function onWorkerMessage(data) {
  if (!current || partial?.scenarioId !== current.scenario.id) return;
  if (!data.ok) {
    const where = phase === 'actual' ? 'Grading the real pile failed' : 'Grading failed';
    stopWorker();
    finishSubmit();
    if (partial?.mine) renderReveal(partial.mine, null, `${where}: ${data.error}`);
    else showError([`${where}: ${data.error}`]);
    return;
  }
  if (data.phase === 'mine') {
    partial.mine = { pile: [...current.pile], grade: data.grade, lines: data.lines, ms: data.ms };
    stats = recordAttempt(stats, current.scenario.id, data.grade);
    saveStats(storage, stats);
    renderStats();
    phase = 'actual';
    renderReveal(partial.mine, null, 'Grading the real pile…');
  } else if (data.phase === 'progress') {
    partial.progress = data;
    const el = $('#p-actual-progress');
    if (el) el.textContent = `Grading the real pile… ${data.done}/${data.total} orders`;
  } else if (data.phase === 'actual') {
    stopWorker();
    finishSubmit();
    stats = applyActualComparison(stats, current.scenario.id, partial.mine.grade, data.actual.best?.grade ?? null);
    saveStats(storage, stats);
    renderStats();
    updateCount();
    renderReveal(partial.mine, data.actual, null, data.ms);
  }
}

function startWorker(msg) {
  if (worker === null || typeof Worker === 'undefined') return false;
  try {
    worker = new Worker(new URL('./solveWorker.js', import.meta.url), { type: 'module' });
  } catch {
    worker = null;
    return false;
  }
  const id = ++job;
  worker.onmessage = (e) => { if (e.data.id === id) onWorkerMessage(e.data); };
  worker.onerror = (e) => {
    e.preventDefault?.();
    if (worker) worker.terminate();
    worker = null; // module workers unsupported or the worker failed to load: grade inline
    gradeInline(msg);
  };
  worker.postMessage({ id, ...msg });
  return true;
}

/** No module-worker support: grade on the main thread (the page freezes meanwhile). */
function gradeInline(msg) {
  const id = ++job;
  setTimeout(async () => {
    try {
      const { gradeScenario } = await import('./solveWorker.js');
      await gradeScenario(msg, (m) => { if (id === job) onWorkerMessage({ ok: true, ...m }); });
    } catch (e) {
      if (id === job) onWorkerMessage({ ok: false, error: e.message });
    }
  }, 30);
}

// ---------- reveal ----------

const pileList = (pile) => `<ol class="pile-ro">${pile.map((n) => `<li>${escapeHtml(n)}</li>`).join('')}</ol>`;

function planHTML(lines, summary) {
  if (!lines?.length) return '';
  return `<details><summary>${escapeHtml(summary)}</summary><ol class="plan">${lines.map((l) => {
    const hdr = /^(Turn \d|Opponent's turn)/.test(l.trim());
    return `<li${hdr ? ' class="hdr"' : ''}>${escapeHtml(l)}</li>`;
  }).join('')}</ol></details>`;
}

function breakdownHTML(g) {
  if (!g.goldfishWin) {
    return `<p class="meta">${g.goldfish === 'aborted' ? 'The goldfish search ran out of budget, so the hand was not graded (est. range 0–100%).'
      : 'It does not win even if they do nothing, so their hand was not graded (est. 0%).'}</p>`;
  }
  if (g.goldfishOnly) return '';
  let html = '';
  if (g.singles.length) {
    html += `<h4>One card in their hand</h4><ul class="singles">${g.singles.map((s) =>
      `<li class="${s.wins === false ? 'lose' : s.wins === true ? 'ok' : 'unk'}">${escapeHtml(s.text)}</li>`).join('')}</ul>`;
  } else {
    html += '<p class="meta">No modelled interaction left in their estimated deck.</p>';
  }
  if (g.losingPairs.length || g.unknownPairs.length) {
    html += `<h4>Two cards together</h4><ul class="singles">${g.losingPairs.map((p) => `<li class="lose">loses to ${escapeHtml(p.text)}</li>`).join('')}`
      + `${g.unknownPairs.map((p) => `<li class="unk">unknown vs ${escapeHtml(p.text)}</li>`).join('')}</ul>`;
  } else if (g.pairsTested) {
    html += `<p class="meta">Beats all ${g.pairsTested} tested pairs of cards it beats one at a time.</p>`;
  }
  const extra = [];
  if (g.notModelled.length) extra.push(`<p><strong>Not modelled</strong> (ignored): ${g.notModelled.map(escapeHtml).join(', ')}</p>`);
  if (g.offColor.length) extra.push(`<p><strong>Off-colour</strong> (they can't cast it): ${g.offColor.map(escapeHtml).join(', ')}</p>`);
  if (g.assumptions.length) extra.push(`<p><strong>Assumptions</strong></p><ul>${g.assumptions.map((a) => `<li>${escapeHtml(a)}</li>`).join('')}</ul>`);
  if (Number.isInteger(g.N) && Number.isInteger(g.h)) extra.push(`<p class="meta">Hand of ${g.h} from ${g.N} unseen cards.</p>`);
  if (extra.length) html += `<details><summary>What the estimate leaves out</summary>${extra.join('')}</details>`;
  return html;
}

function renderReveal(mine, actualRes, actualNote = null, actualMs = null) {
  const r = revealView(current.scenario, mine, actualRes);
  const m = r.mine;
  const a = r.actual;
  const sourceLine = `<p class="source">Deck estimate: ${escapeHtml(r.source ?? 'not given')}</p>`;
  let html = `<div class="card">
    <h3>Your pile</h3>${pileList(m.pile)}
    <div class="banner ${m.goldfishWin ? 'win' : m.goldfish === 'no_win' ? 'nowin' : 'big'}" role="status">Goldfish: ${escapeHtml(m.goldfishLabel)}</div>
    <p class="meta">Against their visible board, clock and visible abilities, with no cards in their hand.</p>
    ${planHTML(m.lines, 'Winning line')}
    <div class="est"><span class="estnum">${escapeHtml(m.est)}</span><span class="meta">chance to win once their hidden hand is counted</span></div>
    ${sourceLine}
    ${breakdownHTML(m)}
    ${Number.isFinite(mine.ms) ? `<p class="meta">Graded in ${mine.ms} ms.</p>` : ''}
  </div>`;

  html += `<div class="card"><h3>What actually happened</h3>
    ${pileList(a.pile)}
    <p class="meta">${a.ordered ? 'Pile order as logged.' : 'The log does not record the order.'}</p>
    <p class="result-real ${current.scenario.actual.result === 'win' ? 'win' : 'nowin'}">${escapeHtml(a.resultText)}</p>`;
  if (a.graded) {
    html += `<p><strong>Its grade:</strong> goldfish ${escapeHtml(a.goldfishLabel)} · ${escapeHtml(a.est)}</p>`;
    if (!a.ordered && a.bestOrder) html += `<p class="meta">${escapeHtml(a.orderNote)} Best order: ${a.bestOrder.map(escapeHtml).join(' → ')}</p>`;
    if (r.verdict) {
      const word = { better: 'better than', equal: 'as good as', worse: 'worse than' }[r.verdict];
      html += `<p class="verdict ${r.verdict}">Your pile grades ${word} the real one (est.).</p>`;
    }
    html += breakdownHTML(a) + planHTML(a.lines, 'Its winning line');
    if (a.errors.length) html += `<details><summary>${a.errors.length} order(s) failed</summary><ul class="errors">${a.errors.slice(0, 5).map((e) => `<li>${escapeHtml(e)}</li>`).join('')}</ul></details>`;
    if (Number.isFinite(actualMs)) html += `<p class="meta">Graded in ${actualMs} ms.</p>`;
  } else if (actualNote) {
    html += `<p class="meta" id="p-actual-progress">${escapeHtml(actualNote)}</p>`;
  }
  html += '</div>';
  html += '<button type="button" id="p-next" class="primary">Next board</button>';
  $('#p-result').innerHTML = html;
  $('#p-next').addEventListener('click', onDeal);
}

// ---------- stats ----------

function renderStats() {
  const s = statsSummary(stats, scenarios);
  const pct = (x) => (x === null ? '—' : formatPct(x));
  let html = `<div class="facts">
    <div><span class="k">Attempts</span><span class="v">${s.attempts}</span></div>
    <div><span class="k">Goldfish wins</span><span class="v">${pct(s.goldfishRate)}</span><span class="meta">${s.goldfishWins}/${s.attempts}</span></div>
    <div><span class="k">Avg est. P(win)</span><span class="v">${pct(s.avgPWin)}</span><span class="meta">${s.pWinCount} graded</span></div>
    <div><span class="k">Boards solved</span><span class="v">${s.mastered}/${s.total}</span></div>
  </div>`;
  if (s.rows.length) {
    html += `<details><summary>Per board</summary><table class="stats"><thead><tr><th>Board</th><th>Tries</th><th>Best est.</th><th>Solved</th></tr></thead><tbody>${
      s.rows.map((r) => `<tr><td>${escapeHtml(r.id)}</td><td>${r.attempts}</td><td>${pct(r.best)}</td><td>${r.mastered ? 'yes' : 'no'}</td></tr>`).join('')
    }</tbody></table></details>`;
  }
  html += '<p class="meta">“Solved” = your pile wins the goldfish and its est. P(win) is at least the real pile’s.'
    + (storage ? '' : ' Storage is unavailable: stats last until you reload.') + '</p>';
  $('#p-stats').innerHTML = html;
}

function onStatsReset() {
  stats = emptyStats();
  saveStats(storage, stats);
  renderStats();
  updateCount();
}

// ---------- boot ----------

async function boot() {
  bindTabs();
  try { storage = window.localStorage; storage.getItem('x'); } catch { storage = null; }
  stats = loadStats(storage);
  renderStats();
  for (const id of ['#p-f-deck', '#p-f-opp', '#p-f-player']) $(id).addEventListener('change', updateCount);
  $('#p-repeat').addEventListener('change', updateCount);
  $('#p-deal').addEventListener('click', onDeal);
  $('#p-file').addEventListener('change', onFile);
  $('#p-pile').addEventListener('change', onPileChange);
  $('#p-submit').addEventListener('click', onSubmit);
  $('#p-stats-reset').addEventListener('click', onStatsReset);
  $('#p-count').textContent = 'Loading boards…';
  $('#p-deal').disabled = true;
  await loadOptionalModules();
  await loadScenarios();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
