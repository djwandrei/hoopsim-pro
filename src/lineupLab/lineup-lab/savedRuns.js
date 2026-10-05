// Saved-run comparison desk. A saved run snapshots the result scoreboard
// metrics, the lineup signature, and the workflow inputs that produced it.
// "Apply" replays the inputs through the native change handlers and reloads
// the dataset; the native run button still owns the solve itself, so native
// validation and V4 gating remain in charge.

import { collectInputs, restoreInputs } from '@/lineupLab/lineup-lab/sessionMemory';

const RUNS_KEY = 'swishiq-lineup-lab-saved-runs';
const MAX_RUNS = 6;

function readRuns() {
  try {
    const runs = JSON.parse(localStorage.getItem(RUNS_KEY) || '[]');
    return Array.isArray(runs) ? runs : [];
  } catch {
    return [];
  }
}

function writeRuns(runs) {
  try {
    localStorage.setItem(RUNS_KEY, JSON.stringify(runs));
  } catch {
    // Best effort; comparison still works from the in-memory current run.
  }
}

function captureRun(keeper) {
  const results = keeper.querySelector('#results');
  if (!results?.querySelector('.result-scoreboard')) return null;
  const metrics = [...results.querySelectorAll('.result-scoreboard .score-card')].map(card => ({
    label: card.querySelector('span')?.textContent.trim() || '',
    value: card.querySelector('strong')?.textContent.trim() || '',
  }));
  if (!metrics.length) return null;
  const table = results.querySelector('table');
  const lineup = table
    ? [...table.querySelectorAll('tbody tr')]
      .map(row => (row.children[0]?.innerText || '').replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .slice(0, 15)
    : [];
  const picks = [...(keeper.querySelector('#workspace') || keeper).querySelectorAll('select')]
    .map(select => select.selectedOptions?.[0]?.text)
    .filter(Boolean);
  return {
    id: Date.now(),
    label: `${picks.slice(0, 2).join(' · ') || 'Saved run'} — ${new Date().toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`,
    metrics,
    lineup,
    inputs: collectInputs(keeper),
  };
}

// Numeric rows highlight their best column: production metrics favor the
// maximum, rank coverage favors the minimum. Non-numeric rows stay neutral.
function isBestRow(label) {
  if (/rank|coverage/i.test(label)) return 'min';
  if (/PTS|REB|AST/i.test(label)) return 'max';
  return null;
}

function bestIndexes(values) {
  const numbers = values.map(value => {
    const parsed = parseFloat(String(value).replace(/[^0-9.\-]/g, ''));
    return Number.isFinite(parsed) ? parsed : null;
  });
  const usable = numbers.filter(value => value !== null);
  if (usable.length < 2) return new Set();
  const target = Math.min(...usable);
  return new Set(numbers.reduce((best, value, index) => {
    if (value !== null && value === target) best.push(index);
    return best;
  }, []));
}

function buildCompareTable(keeper, panel) {
  const current = captureRun(keeper);
  const runs = readRuns().reverse();
  const columns = [
    ...(current ? [{ ...current, label: 'Current result', saved: false }] : []),
    ...runs.map(run => ({ ...run, saved: true })),
  ];
  const table = document.createElement('table');
  if (columns.length < 2) {
    const note = document.createElement('p');
    note.className = 'll-compare__empty';
    note.textContent = current
      ? 'Save this run, then solve a different scenario to compare them here.'
      : 'Solve a scenario, then use “Save run” to start a comparison.';
    return note;
  }
  const labels = [...new Set(columns.flatMap(run => run.metrics.map(metric => metric.label)))];
  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  headRow.append(document.createElement('th'));
  for (const run of columns) {
    const th = document.createElement('th');
    th.textContent = run.label;
    if (!run.saved) th.className = 'll-compare__current';
    headRow.append(th);
  }
  thead.append(headRow);
  const tbody = document.createElement('tbody');
  const addRow = (label, cells, highlight) => {
    const tr = document.createElement('tr');
    const th = document.createElement('td');
    th.textContent = label;
    tr.append(th);
    const best = highlight ? bestIndexes(cells.map(cell => cell?.value ?? '')) : new Set();
    cells.forEach((cell, index) => {
      const td = document.createElement('td');
      td.textContent = cell?.value || '—';
      if (best.has(index)) td.className = 'll-compare__best';
      tr.append(td);
    });
    tbody.append(tr);
  };
  addRow('Lineup', columns.map(run => ({ value: (run.lineup || []).join(' · ') })), false);
  for (const label of labels) {
    addRow(
      label,
      columns.map(run => run.metrics.find(metric => metric.label === label)),
      isBestRow(label),
    );
  }
  const actions = document.createElement('tr');
  const actionsLabel = document.createElement('td');
  actionsLabel.textContent = 'Preset';
  actions.append(actionsLabel);
  columns.forEach(run => {
    const td = document.createElement('td');
    if (run.saved && run.inputs) {
      const apply = document.createElement('button');
      apply.type = 'button';
      apply.className = 'button-secondary';
      apply.textContent = 'Apply';
      apply.addEventListener('click', () => applySavedRun(keeper, run, apply));
      td.append(apply);
    } else {
      td.textContent = '—';
    }
    actions.append(td);
  });
  tbody.append(actions);
  table.append(thead, tbody);
  return table;
}

async function applySavedRun(keeper, run, button) {
  if (!run?.inputs || button.disabled) return;
  button.disabled = true;
  try {
    restoreInputs(keeper, run.inputs);
    await new Promise(resolve => setTimeout(resolve, 350));
    restoreInputs(keeper, run.inputs);
    const load = keeper.querySelector('#loadLiveDataButton');
    if (load && !load.disabled) load.click();
    (keeper.querySelector('#workspace') || keeper).scrollIntoView({ behavior: 'smooth', block: 'start' });
  } finally {
    button.disabled = false;
  }
}

function buildPanel(keeper) {
  const panel = document.createElement('section');
  panel.className = 'result-card ll-compare';
  panel.hidden = true;
  return panel;
}

export function buildSavedRunButtons(keeper) {
  const results = keeper.querySelector('#results');
  if (!results) return [];
  const panel = buildPanel(keeper);
  let panelOpen = false;

  const renderPanel = () => {
    panel.replaceChildren(buildCompareTable(keeper, panel));
  };

  const saveButton = document.createElement('button');
  saveButton.type = 'button';
  saveButton.className = 'button-secondary';
  saveButton.textContent = 'Save run';
  saveButton.addEventListener('click', () => {
    const run = captureRun(keeper);
    if (!run) {
      saveButton.textContent = 'No result yet';
      setTimeout(() => { saveButton.textContent = 'Save run'; }, 1400);
      return;
    }
    const runs = readRuns();
    runs.unshift(run);
    writeRuns(runs.slice(0, MAX_RUNS));
    saveButton.textContent = 'Saved ✓';
    setTimeout(() => { saveButton.textContent = 'Save run'; }, 1400);
    if (panelOpen) renderPanel();
  });

  const compareButton = document.createElement('button');
  compareButton.type = 'button';
  compareButton.className = 'button-secondary';
  compareButton.textContent = 'Compare runs';
  compareButton.addEventListener('click', () => {
    panelOpen = !panelOpen;
    if (panelOpen) renderPanel();
    panel.hidden = !panelOpen;
    compareButton.classList.toggle('is-active', panelOpen);
  });

  // Rerenders rebuild the results container; keep the panel present while open.
  new MutationObserver(() => {
    if (panelOpen && results.isConnected && !results.contains(panel)) results.append(panel);
  }).observe(results, { childList: true });

  return [saveButton, compareButton];
}