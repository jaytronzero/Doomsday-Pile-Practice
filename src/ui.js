// DOM layer. Pure logic lives in uiLogic.js; engine/solver are loaded
// dynamically so the page stays usable (with a clear error) if they fail.
import { DEFAULT_DECK_TEXT } from './defaultDeck.js';
import { parseDeck } from './deckText.js';
import {
  COLORS, defaultModel, buildSetup, modelFromSetup, countNames, addName, removeName,
  pileSize, normalizePile, pileOptions, poolSummary, fallbackPilePool,
  renderResultHTML, escapeHtml, scenarioToJSON, parseScenario,
} from './uiLogic.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

let engine = null; // { buildStartState, availablePile }
let solver = null; // { solve, explain }
let model = defaultModel(DEFAULT_DECK_TEXT);
let deckNames = [];
let current = { setup: null, errors: [], pool: {} };
const MAX_NODES = 200000;

// ---------- module loading ----------

async function loadModules() {
  const problems = [];
  try {
    const m = await import('./engine.js');
    if (typeof m.buildStartState !== 'function' || typeof m.availablePile !== 'function') {
      throw new Error('it does not export buildStartState and availablePile');
    }
    engine = m;
  } catch (e) {
    problems.push(`the game engine (src/engine.js): ${e.message}`);
  }
  try {
    const m = await import('./solver.js');
    if (typeof m.solve !== 'function' || typeof m.explain !== 'function') {
      throw new Error('it does not export solve and explain');
    }
    solver = m;
  } catch (e) {
    problems.push(`the solver (src/solver.js): ${e.message}`);
  }
  if (problems.length) {
    const box = $('#load-error');
    box.hidden = false;
    box.innerHTML = '<strong>Could not load ' + problems.map(escapeHtml).join('; and ') + '.</strong> '
      + 'You can still edit the deck, board and scenario JSON, but piles cannot be checked.';
  }
  refresh();
}

// ---------- zone pickers (hand, battlefield, graveyard, exile) ----------

function nameOptionsHTML() {
  return deckNames.map((n) => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join('');
}

function renderZone(zone) {
  const el = $(`.zone[data-zone="${zone}"]`);
  const selected = $('select', el)?.value;
  let html = `<div class="add">
      <select aria-label="Card to add to ${zone}">${nameOptionsHTML()}</select>
      <button type="button" class="icon" data-act="add" aria-label="Add to ${zone}">+</button>
    </div><ul>`;
  if (zone === 'battlefield') {
    model.battlefield.forEach((p, i) => {
      html += `<li><span class="name">${escapeHtml(p.name)}</span>
        <button type="button" class="toggle" data-act="tap" data-i="${i}" aria-pressed="${p.tapped}">${p.tapped ? 'Tapped' : 'Untapped'}</button>
        <button type="button" class="icon" data-act="del" data-i="${i}" aria-label="Remove ${escapeHtml(p.name)}">−</button></li>`;
    });
    if (!model.battlefield.length) html += '<li class="empty">Nothing yet.</li>';
  } else {
    const counts = countNames(model[zone]);
    for (const [name, n] of Object.entries(counts)) {
      const a = escapeHtml(name);
      html += `<li><span class="name">${a}</span>
        <button type="button" class="icon" data-act="dec" data-name="${a}" aria-label="One fewer ${a}">−</button>
        <span class="count">${n}</span>
        <button type="button" class="icon" data-act="inc" data-name="${a}" aria-label="One more ${a}">+</button></li>`;
    }
    if (!model[zone].length) html += '<li class="empty">Nothing yet.</li>';
  }
  el.innerHTML = html + '</ul>';
  if (selected && deckNames.includes(selected)) $('select', el).value = selected;
}

function onZoneClick(ev) {
  const btn = ev.target.closest('button[data-act]');
  if (!btn) return;
  const el = ev.currentTarget;
  const zone = el.dataset.zone;
  const act = btn.dataset.act;
  if (zone === 'battlefield') {
    const i = Number(btn.dataset.i);
    if (act === 'add') {
      const name = $('select', el).value;
      if (name) model.battlefield = [...model.battlefield, { name, tapped: false }];
    } else if (act === 'tap') {
      model.battlefield = model.battlefield.map((p, j) => (j === i ? { ...p, tapped: !p.tapped } : p));
    } else if (act === 'del') {
      model.battlefield = model.battlefield.filter((_, j) => j !== i);
    }
  } else {
    if (act === 'add') {
      const name = $('select', el).value;
      if (name) model[zone] = addName(model[zone], name);
    } else if (act === 'inc') {
      model[zone] = addName(model[zone], btn.dataset.name);
    } else if (act === 'dec') {
      model[zone] = removeName(model[zone], btn.dataset.name);
    }
  }
  renderZone(zone);
  refresh();
}

// ---------- deck ----------

function onDeckChanged() {
  const parsed = parseDeck(model.deckText);
  deckNames = Object.keys(parsed.main).sort((a, b) => a.localeCompare(b));
  const total = (z) => Object.values(z).reduce((a, b) => a + b, 0);
  $('#deck-summary').textContent = `Main ${total(parsed.main)} · Sideboard ${total(parsed.side)}`;
  $('#deck-errors').innerHTML = parsed.errors.map((e) => `<li>${escapeHtml(e.message)}</li>`).join('');
  $('#card-names').innerHTML = nameOptionsHTML();
  for (const z of ['hand', 'battlefield', 'graveyard', 'exile']) renderZone(z);
}

// ---------- static fields <-> model ----------

function fillStaticFields() {
  $('#deck-text').value = model.deckText;
  $('#mana').innerHTML = COLORS.map((c) =>
    `<label>${c}<input type="number" inputmode="numeric" min="0" step="1" data-color="${c}" value="${escapeHtml(model.manaPool[c])}"></label>`).join('');
  $('#life').value = model.lifeBeforeDoomsday;
  $('#noncreature').value = model.noncreatureSpellsCastThisTurn;
  $('#cavern').value = model.cavernType;
  $('#land-played').checked = !!model.landPlayedThisTurn;
  for (const cb of $$('[data-opp]')) cb.checked = !!model.opponent[cb.dataset.opp];
  $('#chalice-x').value = model.opponent.chaliceX ?? '';
  $('#flute-name').value = model.opponent.fluteNamed ?? '';
  for (const r of $$('input[name=turns]')) r.checked = String(r.value) === String(model.turnsAhead);
}

function bindStaticFields() {
  let deckTimer = 0;
  $('#deck-text').addEventListener('input', (e) => {
    model.deckText = e.target.value;
    clearTimeout(deckTimer);
    deckTimer = setTimeout(() => { onDeckChanged(); refresh(); }, 250);
  });
  $('#deck-reset').addEventListener('click', () => {
    model.deckText = DEFAULT_DECK_TEXT;
    $('#deck-text').value = DEFAULT_DECK_TEXT;
    onDeckChanged();
    refresh();
  });
  $('#mana').addEventListener('input', (e) => {
    const c = e.target.dataset.color;
    if (c) { model.manaPool[c] = e.target.value; refresh(); }
  });
  $('#life').addEventListener('input', (e) => { model.lifeBeforeDoomsday = e.target.value; refresh(); });
  $('#noncreature').addEventListener('input', (e) => { model.noncreatureSpellsCastThisTurn = e.target.value; refresh(); });
  $('#cavern').addEventListener('input', (e) => { model.cavernType = e.target.value; refresh(); });
  $('#land-played').addEventListener('change', (e) => { model.landPlayedThisTurn = e.target.checked; refresh(); });
  for (const cb of $$('[data-opp]')) {
    cb.addEventListener('change', () => { model.opponent[cb.dataset.opp] = cb.checked; refresh(); });
  }
  $('#chalice-x').addEventListener('input', (e) => {
    model.opponent.chaliceX = e.target.value;
    if (e.target.value !== '') { model.opponent['Chalice of the Void'] = true; $('[data-opp="Chalice of the Void"]').checked = true; }
    refresh();
  });
  $('#flute-name').addEventListener('input', (e) => {
    model.opponent.fluteNamed = e.target.value;
    if (e.target.value.trim()) { model.opponent['Disruptor Flute'] = true; $('[data-opp="Disruptor Flute"]').checked = true; }
    refresh();
  });
  for (const r of $$('input[name=turns]')) {
    r.addEventListener('change', () => { if (r.checked) { model.turnsAhead = Number(r.value); refresh(); } });
  }
  for (const el of $$('.zone')) el.addEventListener('click', onZoneClick);
  $('#pile').addEventListener('change', onPileChange);
  $('#check').addEventListener('click', onCheck);
  $('#export').addEventListener('click', onExport);
  $('#import').addEventListener('click', onImport);
}

// ---------- derived state: setup, pool, pile ----------

function refresh() {
  const { setup, errors } = buildSetup(model);
  // While the setup is invalid (e.g. mid-typing), keep the last good pool so
  // pile picks are not wiped; Check pile is blocked until errors are fixed.
  let pool = current.pool;
  let poolOk = false;
  if (!errors.length) {
    try {
      const raw = engine ? engine.availablePile(setup) : fallbackPilePool(setup);
      pool = {};
      for (const [k, n] of Object.entries(raw ?? {})) if (n > 0) pool[k] = n;
      poolOk = true;
    } catch (e) {
      errors.push(e.message);
    }
  }
  current = { setup, errors, pool };

  $('#setup-errors').innerHTML = errors.map((e) => `<li>${escapeHtml(e)}</li>`).join('');
  const life = setup.lifeBeforeDoomsday;
  $('#life-after').textContent = Number.isInteger(life) && life >= 1
    ? `Life after Doomsday: ${life - Math.ceil(life / 2)}` : '';
  if (poolOk) model.pile = normalizePile(pool, model.pile);
  renderPile();
  $('#check').disabled = !(engine && solver);
}

function renderPile() {
  const { pool } = current;
  const size = model.pile.length;
  let html = '';
  for (let i = 0; i < size; i++) {
    const opts = pileOptions(pool, model.pile, i);
    const label = i === 0 ? 'Top' : i === size - 1 ? 'Bottom' : `Card ${i + 1}`;
    html += `<li><select data-i="${i}" aria-label="Pile card ${i + 1} (${label})">
      <option value="">— ${label} —</option>
      ${opts.map((o) => `<option value="${escapeHtml(o.name)}"${o.name === model.pile[i] ? ' selected' : ''}>${escapeHtml(o.name)} (${o.remaining})</option>`).join('')}
    </select></li>`;
  }
  $('#pile').innerHTML = size ? html : '<li class="meta">The pile pool is empty.</li>';

  const summary = poolSummary(pool, model.pile);
  const total = summary.reduce((a, s) => a + s.total, 0);
  $('#pool-total').textContent = `(${total} cards, pile of ${pileSize(pool)})`;
  $('#pool').innerHTML = summary.map((s) =>
    `<li class="${s.left ? '' : 'gone'}">${s.left}/${s.total} ${escapeHtml(s.name)}</li>`).join('');
}

function onPileChange(e) {
  const i = Number(e.target.dataset.i);
  if (!Number.isInteger(i)) return;
  const pile = [...model.pile];
  pile[i] = e.target.value;
  model.pile = normalizePile(current.pool, pile);
  renderPile();
  const next = $(`#pile select[data-i="${i}"]`);
  if (next) next.focus();
}

// ---------- check pile ----------

function showResultError(messages) {
  $('#result').innerHTML = `<ul class="errors">${messages.map((m) => `<li>${escapeHtml(m)}</li>`).join('')}</ul>`;
}

function onCheck() {
  if (!engine || !solver) {
    showResultError(['The engine or solver failed to load, so piles cannot be checked. See the message at the top.']);
    return;
  }
  refresh();
  if (current.errors.length) {
    showResultError(['Fix the setup first:', ...current.errors]);
    return;
  }
  const missing = model.pile.map((n, i) => (n ? null : i + 1)).filter(Boolean);
  if (missing.length) {
    showResultError([`Choose a card for pile position${missing.length > 1 ? 's' : ''} ${missing.join(', ')}.`]);
    return;
  }
  let start;
  try {
    start = engine.buildStartState(current.setup, [...model.pile]);
  } catch (e) {
    showResultError([e.message]);
    return;
  }
  const btn = $('#check');
  btn.disabled = true;
  btn.textContent = 'Solving…';
  $('#result').innerHTML = '<div class="banner busy" role="status">Solving…</div>';
  // Let the "Solving…" state paint before the synchronous search.
  setTimeout(() => {
    try {
      const t0 = performance.now();
      const res = solver.solve(start, { maxNodes: MAX_NODES });
      const lines = res.result === 'win' ? solver.explain(res.plan) : [];
      const ms = Math.round(performance.now() - t0);
      $('#result').innerHTML = renderResultHTML(res, lines) + `<p class="meta">Solved in ${ms} ms.</p>`;
    } catch (e) {
      showResultError([`Solver error: ${e.message}`]);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Check pile';
    }
  }, 30);
}

// ---------- scenario JSON ----------

function scenarioMsg(text, isError = false) {
  const el = $('#scenario-msg');
  el.textContent = text;
  el.className = isError ? 'errors' : 'meta';
}

function onExport() {
  const { setup } = buildSetup(model);
  const text = scenarioToJSON(setup, model.pile.filter(Boolean));
  $('#scenario').value = text;
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).then(
      () => scenarioMsg('Exported and copied to the clipboard.'),
      () => scenarioMsg('Exported. Copy it from the box above.'),
    );
  } else {
    scenarioMsg('Exported. Copy it from the box above.');
  }
}

function onImport() {
  try {
    const { setup, pile } = parseScenario($('#scenario').value);
    const { model: m, warnings } = modelFromSetup(setup, pile);
    model = m;
    fillStaticFields();
    onDeckChanged();
    refresh();
    $('#result').innerHTML = '';
    scenarioMsg(['Imported. The deck box now holds the scenario deck (main only).', ...warnings].join(' '));
  } catch (e) {
    scenarioMsg(e.message, true);
  }
}

// ---------- boot ----------

function boot() {
  fillStaticFields();
  bindStaticFields();
  onDeckChanged();
  refresh();
  loadModules();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
