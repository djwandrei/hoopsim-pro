// Model check: lays the recommended group's model stat view next to the same
// players' recorded season per-game stats. Presentation only — every number
// is read from the site's own rendered result cards and pool table, so
// parity with the native tool is exact. The gap per player is what the
// model's stat view (minute allocation and impact estimates) adds to or
// takes from the recorded line.

import { clean, norm } from '@/lineupLab/lineup-lab/domText';

function readLineup(keeper) {
  const content = keeper.querySelector('#resultContent');
  if (!content) return { players: [], totals: {} };
  const players = [...content.querySelectorAll('.lineup-player')].map((card) => {
    const stats = {};
    card.querySelectorAll('dl > div').forEach((wrap) => {
      const label = clean(wrap.querySelector('dt')?.textContent);
      const value = parseFloat(clean(wrap.querySelector('dd')?.textContent));
      if (/pts/i.test(label) && Number.isFinite(value)) stats.points = value;
      else if (/reb/i.test(label) && Number.isFinite(value)) stats.rebounds = value;
      else if (/ast/i.test(label) && Number.isFinite(value)) stats.assists = value;
    });
    return {
      name: clean(card.querySelector('h3')?.textContent),
      position: clean(card.querySelector('.position-pill')?.textContent),
      minutes: clean(card.querySelector('.lineup-player__minutes')?.textContent),
      stats,
    };
  }).filter((player) => player.name && Object.keys(player.stats).length);
  const totals = {};
  [...content.querySelectorAll('.result-scoreboard .score-card')].forEach((card) => {
    const label = clean(card.querySelector('span')?.textContent);
    const value = parseFloat(clean(card.querySelector('strong')?.textContent));
    if (/pts/i.test(label) && Number.isFinite(value)) totals.points = value;
    else if (/reb/i.test(label) && Number.isFinite(value)) totals.rebounds = value;
    else if (/ast/i.test(label) && Number.isFinite(value)) totals.assists = value;
  });
  return { players, totals };
}

function readPool(keeper) {
  const body = keeper.querySelector('#playerTableBody');
  const pool = new Map();
  if (!body) return pool;
  [...body.querySelectorAll('tr')].forEach((tr) => {
    const name = clean(tr.querySelector('.player-name strong')?.textContent);
    if (!name) return;
    const cells = tr.children;
    pool.set(norm(name), {
      points: parseFloat(clean(cells[3]?.textContent)),
      rebounds: parseFloat(clean(cells[4]?.textContent)),
      assists: parseFloat(clean(cells[5]?.textContent)),
    });
  });
  return pool;
}

const gap = (model, actual) => (Number.isFinite(model) && Number.isFinite(actual) ? model - actual : null);

const deltaChip = (value) => {
  if (value == null || Math.abs(value) < 0.05) return Object.assign(document.createElement('span'), { textContent: '·' });
  const chip = document.createElement('span');
  chip.className = value > 0 ? 'mc-gap mc-gap-up' : 'mc-gap mc-gap-down';
  chip.textContent = `${value > 0 ? '+' : ''}${value.toFixed(1)}`;
  return chip;
};

const pair = (model, actual) => {
  if (!Number.isFinite(model) && !Number.isFinite(actual)) return '—';
  const left = Number.isFinite(model) ? model.toFixed(1) : '—';
  const right = Number.isFinite(actual) ? actual.toFixed(1) : '—';
  return `${left} → ${right}`;
};

function render(keeper, panel, button) {
  const { players, totals } = readLineup(keeper);
  const head = document.createElement('div');
  head.className = 'll-modelcheck__head';
  head.append(Object.assign(document.createElement('strong'), { className: 'll-modelcheck__title', textContent: 'Model check' }));
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'text-button';
  close.textContent = 'Close';
  close.addEventListener('click', () => { panel.hidden = true; button.classList.remove('is-active'); });
  head.append(close);
  panel.replaceChildren(head);

  const copy = document.createElement('p');
  copy.className = 'll-modelcheck__copy';
  copy.textContent = 'Each row pairs the recommended player\'s model stat view with their recorded season line — "model → season". The gap is what the model\'s minute allocation and impact estimates add to or take from the raw stats; it is not a prediction error.';
  panel.append(copy);

  if (!players.length) {
    panel.append(Object.assign(document.createElement('p'), { className: 'll-modelcheck__copy', textContent: 'Run a build first — the check reads the recommended group from the result desk.' }));
    return;
  }
  const pool = readPool(keeper);
  const table = document.createElement('table');
  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  for (const label of ['Player', 'PTS', 'REB', 'AST']) headRow.append(Object.assign(document.createElement('th'), { textContent: label }));
  thead.append(headRow);
  const tbody = document.createElement('tbody');
  const gaps = [];
  for (const player of players) {
    const actual = pool.get(norm(player.name));
    const tr = document.createElement('tr');
    const identity = document.createElement('td');
    identity.textContent = player.name + (player.minutes ? ` (${player.minutes})` : '') + (player.position ? ` · ${player.position}` : '');
    tr.append(identity);
    for (const key of ['points', 'rebounds', 'assists']) {
      const model = player.stats[key];
      const season = actual?.[key];
      const td = document.createElement('td');
      td.append(document.createTextNode(pair(model, season) + ' '));
      const difference = gap(model, season);
      if (difference != null) gaps.push(Math.abs(difference));
      td.append(deltaChip(difference));
      tr.append(td);
    }
    tbody.append(tr);
  }
  const totalRow = document.createElement('tr');
  totalRow.className = 'mc-totals';
  totalRow.append(Object.assign(document.createElement('td'), { textContent: 'Group total (model)' }));
  const seasonSums = {};
  for (const player of players) {
    const actual = pool.get(norm(player.name));
    for (const key of ['points', 'rebounds', 'assists']) {
      if (Number.isFinite(actual?.[key])) seasonSums[key] = (seasonSums[key] || 0) + actual[key];
    }
  }
  for (const key of ['points', 'rebounds', 'assists']) {
    const td = document.createElement('td');
    td.textContent = `${Number.isFinite(totals[key]) ? totals[key].toFixed(1) : '—'} → ${Number.isFinite(seasonSums[key]) ? seasonSums[key].toFixed(1) : '—'}`;
    totalRow.append(td);
  }
  tbody.append(totalRow);
  table.append(thead, tbody);
  panel.append(table);
  if (gaps.length) {
    const sorted = [...gaps].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    panel.append(Object.assign(document.createElement('p'), {
      className: 'll-modelcheck__copy',
      textContent: `Median per-player gap across PTS/REB/AST: ${median.toFixed(1)}. Compare runs with the same players loaded to see how stable the model's view is.`,
    }));
  }
}

export function buildModelCheckButton(keeper) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'button-secondary';
  button.textContent = 'Model check';
  const panel = document.createElement('section');
  panel.className = 'result-card ll-modelcheck';
  panel.hidden = true;
  button.addEventListener('click', () => {
    panel.hidden = !panel.hidden;
    button.classList.toggle('is-active', !panel.hidden);
    if (!panel.hidden) render(keeper, panel, button);
  });
  const results = keeper.querySelector('#results');
  if (results) {
    new MutationObserver((mutations) => {
      // Render mutates this panel itself; skip those records or the observer
      // would re-render itself forever while the panel is open.
      if (mutations.every((record) => panel.contains(record.target))) return;
      if (results.isConnected && !results.contains(panel)) results.append(panel);
      else if (!panel.hidden && results.contains(panel)) render(keeper, panel, button);
    }).observe(results, { childList: true, subtree: true });
  }
  return button;
}