// League scan: solves the current setup for every team in the selected
// season. The scan drives the site's own team select, load button, and build
// button — every result keeps full native parity (validation, V4 gating, and
// the real worker stay in charge). Results land in this panel; nothing is
// written to the site's state beyond what its own controls already do.

import { captureScoreboard, downloadBlob } from '@/lineupLab/lineup-lab/resultCapture';

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(test, timeout, step = 300) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (test()) return true;
    await wait(step);
  }
  return test();
}

const click = (el) => {
  el?.dispatchEvent(new Event('input', { bubbles: true }));
  el?.dispatchEvent(new Event('change', { bubbles: true }));
};

const production = (metrics) => metrics.find((m) => /production|projected|score/i.test(m.label))?.value || metrics[0]?.value || '—';

function rowsToCsv(rows) {
  const cell = (text) => (/[",\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text);
  const header = ['Team', 'Status', 'Production', 'Lineup'].map(cell).join(',');
  const lines = rows.map((row) => [row.label, row.status, production(row.metrics || []), (row.lineup || []).join(' · ')].map(cell).join(','));
  return [header, ...lines].join('\n');
}

export function installLeagueScan(keeper) {
  const results = keeper.querySelector('#results');
  if (!results) return;
  const state = { running: false, stopped: false, rows: [], index: 0, total: 0, startedAt: 0, finishedAt: 0 };
  const panel = document.createElement('section');
  panel.className = 'result-card ll-scan';
  panel.hidden = true;

  const statusLabel = () => `Solving ${Math.min(state.index + 1, state.total)} of ${state.total}`;

  const render = () => {
    const teams = [...(keeper.querySelector('#nbaTeamInput')?.options || [])].filter((option) => option.value && !option.disabled);
    const head = document.createElement('div');
    head.className = 'll-scan__head';
    head.append(Object.assign(document.createElement('strong'), { className: 'll-scan__title', textContent: 'League scan' }));
    if (!state.running) {
      const close = document.createElement('button');
      close.type = 'button';
      close.className = 'text-button';
      close.textContent = 'Close';
      close.addEventListener('click', () => { panel.hidden = true; button.classList.remove('is-active'); });
      head.append(close);
    }
    panel.replaceChildren(head);

    if (!state.running && !state.rows.length) {
      const copy = document.createElement('p');
      copy.className = 'll-scan__copy';
      copy.textContent = `Runs this exact setup — boundaries, weights, and model — against ${teams.length ? `all ${teams.length} teams` : 'every team'} in the selected season, one team at a time, using the site's own load and build controls. It takes several minutes and you can stop it any time.`;
      const start = document.createElement('button');
      start.type = 'button';
      start.className = 'button';
      start.textContent = teams.length ? `Scan all ${teams.length} teams` : 'Scan all teams';
      start.disabled = !teams.length;
      start.addEventListener('click', () => runScan());
      const actions = document.createElement('div');
      actions.className = 'll-scan__actions';
      actions.append(start);
      panel.append(copy, actions);
      return;
    }

    const bar = document.createElement('div');
    bar.className = 'll-scan__bar';
    const fill = document.createElement('span');
    const done = state.rows.length;
    fill.style.width = `${state.total ? Math.round((done / state.total) * 100) : 0}%`;
    bar.append(fill);
    const status = document.createElement('p');
    status.className = 'll-scan__status';
    status.textContent = state.running ? statusLabel() : state.rows.length
      ? `Solved ${state.rows.filter((row) => row.status === 'ok').length} of ${state.total} teams${state.finishedAt ? ` in ${Math.round((state.finishedAt - state.startedAt) / 1000)}s` : ''}.`
      : 'Scan stopped before any team was solved.';
    const controls = document.createElement('div');
    controls.className = 'll-scan__actions';
    if (state.running) {
      const stop = document.createElement('button');
      stop.type = 'button';
      stop.className = 'button-secondary';
      stop.textContent = 'Stop scan';
      stop.addEventListener('click', () => { state.stopped = true; });
      controls.append(stop);
    } else {
      const again = document.createElement('button');
      again.type = 'button';
      again.className = 'button-secondary';
      again.textContent = 'Run again';
      again.addEventListener('click', () => runScan());
      const csv = document.createElement('button');
      csv.type = 'button';
      csv.className = 'button-secondary';
      csv.textContent = 'Export CSV';
      csv.addEventListener('click', () => downloadBlob(new Blob([rowsToCsv(state.rows)], { type: 'text/csv' }), 'league-scan.csv'));
      controls.append(again, csv);
    }
    const table = document.createElement('table');
    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');
    for (const label of ['Team', 'Production', 'Lineup', 'Status']) headRow.append(Object.assign(document.createElement('th'), { textContent: label }));
    thead.append(headRow);
    const tbody = document.createElement('tbody');
    for (const row of state.rows) {
      const tr = document.createElement('tr');
      if (row.status === 'ok') tr.className = 'is-ok';
      for (const value of [row.label, row.status === 'ok' ? production(row.metrics) : '—', (row.lineup || []).join(' · ') || '—', row.status]) {
        tr.append(Object.assign(document.createElement('td'), { textContent: value }));
      }
      tbody.append(tr);
    }
    table.append(thead, tbody);
    panel.append(bar, status, controls, table);
  };

  async function runScan() {
    const teamSelect = keeper.querySelector('#nbaTeamInput');
    const load = keeper.querySelector('#loadLiveDataButton');
    const optimize = keeper.querySelector('#optimizeButton');
    const cancel = keeper.querySelector('#cancelOptimizeButton');
    const liveStatus = keeper.querySelector('#liveDataStatus');
    if (state.running || !teamSelect || !load || !optimize) return;
    const teams = [...teamSelect.options].filter((option) => option.value && !option.disabled).map((option) => ({ value: option.value, label: option.text }));
    if (!teams.length) return;
    const previousTeam = teamSelect.value;
    Object.assign(state, { running: true, stopped: false, rows: [], index: 0, total: teams.length, startedAt: Date.now(), finishedAt: 0 });
    render();
    for (const team of teams) {
      if (state.stopped) break;
      state.index += 1;
      render();
      teamSelect.value = team.value;
      click(teamSelect);
      await wait(400);
      if (state.stopped) break;
      load.click();
      const loaded = await waitFor(() => liveStatus && (liveStatus.dataset.tone === 'success' || liveStatus.dataset.tone === 'warning'), 90000);
      if (state.stopped) break;
      if (!loaded) { state.rows.push({ label: team.label, status: 'load failed' }); render(); continue; }
      await waitFor(() => !optimize.disabled, 15000);
      if (state.stopped) break;
      if (optimize.disabled) { state.rows.push({ label: team.label, status: 'no eligible pool' }); render(); continue; }
      await wait(300);
      if (state.stopped) break;
      optimize.click();
      const solved = await waitFor(() => !!captureScoreboard(keeper.querySelector('#results')), 240000, 500);
      if (state.stopped) {
        if (cancel && !cancel.disabled) cancel.click();
        break;
      }
      if (!solved) {
        if (cancel && !cancel.disabled) cancel.click();
        state.rows.push({ label: team.label, status: 'solve failed' });
        render();
        continue;
      }
      state.rows.push({ label: team.label, status: 'ok', ...captureScoreboard(keeper.querySelector('#results')) });
      render();
      await wait(300);
    }
    state.running = false;
    state.finishedAt = Date.now();
    // Restore the team the user had loaded; the site's cache makes this quick.
    if (previousTeam && teamSelect.value !== previousTeam) {
      teamSelect.value = previousTeam;
      click(teamSelect);
      await wait(400);
      if (load && !load.disabled) load.click();
    }
    render();
  }

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'button-secondary';
  button.textContent = 'League scan';
  button.addEventListener('click', () => {
    if (state.running) return;
    panel.hidden = !panel.hidden;
    if (!panel.hidden) render();
    button.classList.toggle('is-active', !panel.hidden);
  });

  new MutationObserver(() => {
    if (results.isConnected && !results.contains(panel)) results.append(panel);
  }).observe(results, { childList: true });

  return button;
}