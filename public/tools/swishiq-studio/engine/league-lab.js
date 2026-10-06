import { GAME_LAB_POLICY, seasonEndYearForStartYear } from './possession-simulator.js?v=20261001c&rev=possession-workbench-v10-score-mean-se-v1';
import { simulateSeasonLab } from './season-lab-model.js?v=20261001b&rev=season-model-v26-fixed-16-team-playoffs-20261001b';
import { deriveActualNbaTeamRecords, generateFutureNbaSchedule, selectActualNbaSchedule } from './nba-schedule-source.js?v=20260920c&rev=structure-v1';
import {
  applyFranchiseCoaching,
  advanceFranchiseOffseason,
  applyFranchiseTransaction,
  clearFranchiseLeague,
  createFranchiseLeague,
  FRANCHISE_STORAGE_KEY,
  loadFranchiseLeague,
  saveFranchiseLeague,
  simulateFranchiseCheckpoint,
  simulateFranchiseSeason,
} from './franchise-simulation.js?v=20261001c&rev=franchise-simulation-v10-score-contributions-v1';
import { resolveSimulationSeed } from './simulation-seed.js?v=20260920c&rev=random-by-default-v1';
import { createSimulationPauseGate, mountSimulationSessionHud } from '../simulation-session-ui.js?v=20260926g&rev=session-loop-v5-reset-restore-replay';

const node = (tag, text, className = '') => {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  if (className) element.className = className;
  return element;
};
const choice = (labelText, id, options) => {
  const label = node('label', labelText), input = node('select');
  input.id = id;
  options.forEach(([value, text]) => { const option = node('option', text); option.value = value; input.append(option); });
  label.append(input); return { label, input };
};
const fixedField = (labelText, valueText, className = '') => {
  const field = node('div', undefined, `studio-fixed-field ${className}`.trim());
  field.setAttribute('role', 'group');
  field.setAttribute('aria-label', labelText);
  field.append(node('span', labelText, 'studio-fixed-field__label'), node('strong', valueText, 'studio-fixed-field__value'));
  return field;
};
const textInput = (labelText, id, value = '') => {
  const label = node('label', labelText), input = node('input');
  Object.assign(input, { id, value, type: 'text' }); label.append(input); return { label, input };
};
const rangeChoice = (labelText, id, value, min, max, step, formatValue = current => current) => {
  const label = node('label', undefined, 'studio-range-control');
  const heading = node('span', labelText, 'studio-range-control__label');
  const output = node('output', formatValue(value), 'studio-range-control__value');
  const input = node('input'); Object.assign(input, { id, type: 'range', value, min, max, step, required: true });
  input.setAttribute('aria-label', labelText);
  const update = () => { output.value = formatValue(input.value); output.textContent = output.value; };
  input.addEventListener('input', update); label.append(heading, output, input); return { label, input, update };
};
const checkbox = (labelText, id, checked = false) => {
  const label = node('label'), input = node('input'); Object.assign(input, { id, type: 'checkbox', checked });
  label.append(input, node('span', labelText)); return { label, input };
};
const pretty = value => value === null || value === undefined ? 'Unavailable' : Number.isFinite(Number(value)) ? Number(value).toFixed(1) : String(value);
const percent = (value, digits = 1) => value === null || value === undefined ? 'Unavailable' : `${(Number(value) * 100).toFixed(digits)}%`;
const percentWithWilsonInterval = (value, interval) => {
  if (value === null || value === undefined) return 'Unavailable';
  const rate = percent(value);
  if (interval?.lower === null || interval?.lower === undefined
    || interval?.upper === null || interval?.upper === undefined) return `${rate} (95% Wilson interval unavailable)`;
  return `${rate} (${percent(interval.lower)}–${percent(interval.upper)})`;
};

function table(title, headers, rows) {
  const block = node('div', undefined, 'studio-table-block'), wrap = node('div', undefined, 'studio-table-wrap');
  wrap.tabIndex = 0; wrap.setAttribute('role', 'region'); wrap.setAttribute('aria-label', title);
  const tableNode = node('table', undefined, 'studio-table'); tableNode.append(node('caption', title));
  const head = node('thead'), header = node('tr'); headers.forEach(label => { const cell = node('th', label); cell.scope = 'col'; header.append(cell); });
  head.append(header); tableNode.append(head);
  const body = node('tbody'); rows.forEach(row => { const tr = node('tr'); row.forEach((value, index) => { const cell = node(index ? 'td' : 'th', String(value)); if (!index) cell.scope = 'row'; tr.append(cell); }); body.append(tr); });
  tableNode.append(body); wrap.append(tableNode); block.append(wrap, node('p', 'Scroll tables sideways on narrow screens.', 'studio-table-hint studio-muted')); return block;
}

function seasonTable(title, headers, rows, kind = 'evidence') {
  const block = table(title, headers, rows);
  block.classList.add('season-results-table');
  block.dataset.seasonTable = kind;
  return block;
}

function readableLabel(value, fallback = 'Unavailable') {
  const text = String(value || '').trim();
  if (!text) return fallback;
  return text.replace(/[-_]+/g, ' ').replace(/\b\w/g, character => character.toUpperCase());
}

function seasonScheduleLabel(value) {
  return ({
    actual: 'Reviewed actual NBA calendar',
    'round-robin': 'Generated round-robin scenario',
    'nba-cup-completion': 'Published 2026–27 NBA Cup scenario',
    custom: 'Custom scenario schedule',
  })[value] || readableLabel(value);
}

function seasonSourceLabel(source) {
  if (source?.kind === 'exact-season') return 'Exact historical package';
  if (source?.kind === 'pooled-window') return 'Accepted pooled package';
  if (source?.kind === 'forecast-season') return 'Accepted forecast package';
  return 'Package-bound evidence';
}

function seasonResultMetric(label, value, detail) {
  const card = node('article', undefined, 'season-result-metric');
  card.append(node('span', label, 'season-result-metric__label'), node('strong', value, 'season-result-metric__value'));
  if (detail) card.append(node('span', detail, 'season-result-metric__detail'));
  return card;
}

function seasonResultSection(id, eyebrow, heading, description, className = '') {
  const section = node('section', undefined, `season-result-section ${className}`.trim());
  const header = node('div', undefined, 'season-result-section__header');
  const title = node('h4', heading); title.id = id;
  header.append(node('span', eyebrow, 'studio-eyebrow'), title);
  if (description) header.append(node('p', description, 'studio-muted'));
  section.setAttribute('aria-labelledby', id);
  section.append(header);
  return section;
}

function seasonResultDetails(summaryText, content) {
  const details = node('details', undefined, 'studio-panel season-result-details');
  details.append(node('summary', summaryText), content);
  return details;
}

function provenanceItem(label, value) {
  const item = node('div');
  item.append(node('dt', label), node('dd', value));
  return item;
}

function playoffBracketGraphic(series = []) {
  if (!Array.isArray(series) || !series.length) return null;
  const figure = node('figure', undefined, 'studio-bracket');
  const caption = node('figcaption', undefined, 'studio-bracket__caption');
  caption.append(node('strong', 'Playoff bracket'), node('span', 'Outcome view · scores and winners stay tied to this run'));
  figure.append(caption);
  const rounds = [...new Set(series.map(item => item.round || 'Round'))];
  const columns = node('div', undefined, 'studio-bracket__columns');
  rounds.forEach(round => {
    const column = node('section', undefined, 'studio-bracket__round');
    const heading = node('h4', String(round)); column.append(heading);
    series.filter(item => (item.round || 'Round') === round).forEach(item => {
      const card = node('article', undefined, 'studio-bracket__series');
      const phase = item.conference === 'finals' ? 'NBA Finals' : item.conference
        ? `${String(item.conference).toUpperCase()} · ${item.stage || 'conference round'}`
        : 'Generic bracket';
      const matchup = node('div', undefined, 'studio-bracket__matchup');
      const a = node('span', item.a || 'Unavailable');
      const b = node('span', item.b || 'Unavailable');
      if (item.winner && item.winner === item.a) a.classList.add('is-winner');
      if (item.winner && item.winner === item.b) b.classList.add('is-winner');
      matchup.append(a, b);
      const score = node('strong', `${item.winsA ?? '—'}–${item.winsB ?? '—'}`, 'studio-bracket__score');
      const winner = node('small', item.winner ? `Winner · ${item.winner}` : 'Winner unresolved', 'studio-bracket__winner');
      card.append(node('small', phase, 'studio-bracket__phase'), matchup, score, winner); column.append(card);
    });
    columns.append(column);
  });
  figure.append(columns);
  return figure;
}

function parseJson(value, label) {
  if (!String(value || '').trim()) return null;
  try { return JSON.parse(value); } catch { throw new Error(`${label} must be valid JSON.`); }
}
function parseYears(value) {
  const years = String(value || '').split(',').map(item => Number(item.trim())).filter(Number.isFinite);
  if (!years.length) throw new Error('Enter at least one season start year, such as 2024.');
  return years;
}
function selectNativeEvidencePackage(source, sourceKind, years) {
  const packages = Array.isArray(source?.nativePackages) ? source.nativePackages : [];
  if (!packages.length) return null;
  if (sourceKind === 'pooled-window') {
    const pooled = packages.find(item => item.entry?.scope?.kind === 'pooled-window');
    if (!pooled) throw new Error('The accepted native pooled package is unavailable.');
    return {
      ...pooled,
      pooled: true,
      seasonPackages: [],
      packageRefs: [pooled.packageRef],
    };
  }
  const selected = years.map(year => {
    const matches = packages.filter(item => item.entry?.scope?.kind === 'exact-season'
      && Number(item.entry.scope.seasonStartYear) === Number(year));
    return matches.length === 1 ? matches[0] : null;
  });
  if (selected.some(item => !item)) {
    const missing = years.filter(year => packages.filter(item => item.entry?.scope?.kind === 'exact-season'
      && Number(item.entry.scope.seasonStartYear) === Number(year)).length !== 1);
    throw new Error(`No unique exact native package is available for ${missing.join(', ')}.`);
  }
  const byTeam = new Map();
  for (const item of selected) for (const payload of item.payloads || []) {
    const current = byTeam.get(payload.team) || { ...payload, nativeProfiles: [], seasonProfiles: {} };
    const packagePin = Object.freeze({ ...item.packageRef, seasonStartYear: item.entry.scope.seasonStartYear });
    current.nativeProfiles.push(...(payload.nativeProfiles || []).map(profile => ({ ...profile, packageRef: packagePin })));
    for (const [playerRef, rows] of Object.entries(payload.seasonProfiles || {})) {
      const existing = current.seasonProfiles[playerRef] || [];
      current.seasonProfiles[playerRef] = existing.concat((Array.isArray(rows) ? rows : []).map(row => ({ ...row, packageRef: packagePin })));
    }
    current.packageRefs = [...(current.packageRefs || []), packagePin];
    byTeam.set(payload.team, current);
  }
  return {
    entry: selected[0].entry,
    packageRef: selected[0].packageRef,
    payloads: [...byTeam.values()].map(payload => ({
      ...payload,
      packageRefs: Object.freeze(payload.packageRefs || []),
      nativeProfiles: Object.freeze(payload.nativeProfiles || []),
      seasonProfiles: Object.freeze(Object.fromEntries(Object.entries(payload.seasonProfiles || {}).map(([id, rows]) => [id, Object.freeze(rows)]))),
    })),
    pooled: false,
    packageRefs: selected.map(item => ({ ...item.packageRef, seasonStartYear: item.entry.scope.seasonStartYear })),
    seasonPackages: selected.map(item => ({ seasonStartYear: item.entry.scope.seasonStartYear, ...item.packageRef })),
  };
}

// An exact observed calendar can contain many more matchups than the selected
// horizon when the user picks a small subset of teams. Keep a deterministic,
// chronological matching so no team exceeds the requested games-per-team
// target while every retained matchup remains an exact source row.
function limitCalendarToTeamHorizon(games, teamIds, gamesPerTeam) {
  const target = Number(gamesPerTeam);
  if (!Array.isArray(games) || !Number.isInteger(target) || target < 1) return [];
  const appearances = new Map(teamIds.map(teamId => [teamId, 0]));
  const ordered = games.map((game, inputOrder) => ({ game, inputOrder })).sort((left, right) => {
    const leftTime = left.game.scheduledAt && Number.isFinite(Date.parse(left.game.scheduledAt))
      ? Date.parse(left.game.scheduledAt) : Number.POSITIVE_INFINITY;
    const rightTime = right.game.scheduledAt && Number.isFinite(Date.parse(right.game.scheduledAt))
      ? Date.parse(right.game.scheduledAt) : Number.POSITIVE_INFINITY;
    return leftTime - rightTime || left.inputOrder - right.inputOrder;
  });
  const selected = [];
  for (const { game } of ordered) {
    if (!appearances.has(game.home) || !appearances.has(game.away)
      || appearances.get(game.home) >= target || appearances.get(game.away) >= target) continue;
    selected.push(game);
    appearances.set(game.home, appearances.get(game.home) + 1);
    appearances.set(game.away, appearances.get(game.away) + 1);
  }
  return selected;
}

function parseRoster(rosterJson, mode, id) { return rosterJson?.[id] ? { rosterMode: mode, roster: rosterJson[id] } : { rosterMode: mode }; }
function selectedTeamIds(selectors) { return selectors.map(item => item.input.value).filter(Boolean); }

export function createLeagueLab(root, request, options = {}) {
  let source = null, active = null, pauseGate = null, generation = 0, currentReport = null, currentPreparedInput = null, reference = null, franchiseState = null, franchiseBusy = false, franchiseActive = null, franchiseGeneration = 0;
  let franchiseCheckpoints = [], franchiseAsOfGameCount = 0, franchiseRosterTeamId = '', franchiseRosterPlayerRef = '';
  let franchiseCalendarMonth = '', franchiseCalendarDate = '', franchiseSelectedScheduleGameId = '';
  let nextRunAction = 'run';
  const documentRef = root?.ownerDocument || globalThis.document;
  const heading = node('h2', 'Season Lab'); heading.id = 'leagueLabTitle';
  const modeNavigation = node('nav', undefined, 'studio-team-form season-lab-mode-switch');
  modeNavigation.setAttribute('aria-label', 'Season Lab views');
  const seasonMode = node('button', 'Season Simulation', 'button'); seasonMode.type = 'button'; seasonMode.setAttribute('aria-pressed', 'true');
  const franchiseMode = node('button', 'Franchise Simulation', 'button-secondary'); franchiseMode.type = 'button'; franchiseMode.setAttribute('aria-pressed', 'false');
  const seasonView = node('section', undefined, 'season-lab-mode-panel');
  const franchiseView = node('section', undefined, 'season-lab-mode-panel'); franchiseView.hidden = true;
  seasonMode.setAttribute('aria-controls', 'seasonLabSimulationView');
  franchiseMode.setAttribute('aria-controls', 'seasonLabFranchiseView');
  seasonView.id = 'seasonLabSimulationView';
  franchiseView.id = 'seasonLabFranchiseView';
  seasonView.setAttribute('aria-label', 'Season simulation setup and results');
  franchiseView.setAttribute('aria-label', 'Persistent Franchise simulation');
  modeNavigation.append(seasonMode, franchiseMode);
  const activateMode = mode => {
    const showFranchise = mode === 'franchise';
    seasonView.hidden = showFranchise;
    franchiseView.hidden = !showFranchise;
    seasonMode.setAttribute('aria-pressed', String(!showFranchise));
    franchiseMode.setAttribute('aria-pressed', String(showFranchise));
    seasonMode.className = showFranchise ? 'button-secondary' : 'button';
    franchiseMode.className = showFranchise ? 'button' : 'button-secondary';
  };
  const updateModeButtons = () => {
    const locked = Boolean(active || franchiseBusy);
    seasonMode.disabled = locked;
    franchiseMode.disabled = locked;
  };
  seasonMode.addEventListener('click', () => activateMode('season'));
  franchiseMode.addEventListener('click', () => activateMode('franchise'));
  const form = node('form'), teamField = node('div', undefined, 'studio-league-teams'), teamSelectors = [];
  const teamCount = choice('Teams in this lab', 'leagueTeamCount', []);
  const teamPicker = choice('Choose teams', 'leagueTeams', []);
  teamPicker.input.multiple = true;
  teamPicker.input.size = 6;
  const sourceKind = choice('Evidence scope', 'leagueSourceKind', [['exact-season', 'Exact historical evidence'], ['pooled-window', 'Accepted pooled package']]);
  const roster = choice('Roster source', 'leagueRosterMode', [['actual', 'Actual season rosters'], ['user-built', 'User-built rosters'], ['managed', 'Managed roster declarations'], ['custom', 'Custom team rosters']]);
  const horizon = choice('Horizon', 'leagueHorizon', [['game', 'One game'], ['short', 'Short season · scenario'], ['full', 'Full season'], ['multi-season', 'Multiple explicit seasons']]);
  const schedule = choice('Schedule', 'leagueScheduleKind', [['actual', 'Reviewed actual NBA calendar'], ['round-robin', 'Generated round-robin · scenario'], ['custom', 'Custom declared schedule · scenario']]);
  const control = choice('Control', 'leagueControlKind', [['deterministic-bot', 'Deterministic bot'], ['user-managed', 'User-managed teams'], ['mixed', 'Mixed control']]);
  const season = textInput('Season start years · comma-separated', 'leagueSeasons', '2024');
  const managedTeams = textInput('Managed team IDs · comma-separated', 'leagueManagedTeams');
  const rosterJson = textInput('Optional roster JSON by team ID', 'leagueRosterJson');
  const actualRecords = textInput('Optional actual-records JSON · scenario schedules only', 'leagueActualRecords');
  const declaredSchedule = textInput('Declared schedule JSON', 'leagueDeclaredSchedule');
  const acceptedPool = checkbox('I accept this pooled package for cross-team/era use.', 'leagueAcceptPooled', false);
  const pooledScopeStatus = node('p', 'Pooled Season Lab evidence is unavailable until a published package declares the seasonSimulation capability.', 'studio-muted');
  pooledScopeStatus.id = 'leaguePooledScopeStatus';
  const cycles = rangeChoice('Round-robin cycles for compact labs', 'leagueCycles', 2, 1, 4, 1, value => `${value} cycle${Number(value) === 1 ? '' : 's'}`);
  const gamesPerTeam = rangeChoice('Games per team', 'leagueGamesPerTeam', 82, 1, 200, 1, value => `${Number(value)} games`);
  const playoffField = fixedField('Playoff field', '16 teams', 'studio-fixed-field--playoff');
  const seriesLength = choice('Series length', 'leagueSeriesLength', [[7, 'Best of seven'], [5, 'Best of five'], [3, 'Best of three'], [1, 'One game']]);
  const repeats = choice('Repeat count', 'leagueTrials', [[1, '1 run'], [2, '2 runs'], [5, '5 runs'], [10, '10 runs'], [25, '25 runs'], [50, '50 runs'], [100, '100 runs'], [250, '250 runs'], [500, '500 runs']]);
  const pace = rangeChoice('Scenario pace note · display only', 'leaguePace', 100, 90, 110, 5, value => `${value} · display only`);
  pace.input.disabled = true;
  pace.input.title = 'Display-only annotation. Native package pace is used by the engine; this control does not alter scoring.';
  const blend = rangeChoice('Matchup scoring blend', 'leagueBlend', 0.5, 0, 1, 0.05, value => `${Math.round(Number(value) * 100)}% own offense`);
  const seed = textInput('Replay seed (optional)', 'leagueSeed'); seed.input.required = false; seed.input.pattern = '[a-zA-Z0-9:._\\-]+'; seed.input.placeholder = 'Leave blank for a new random run';
  const pooledOption = [...sourceKind.input.options].find(option => option.value === 'pooled-window');
  const pooledArtifacts = ['player-seasons', 'roster-memberships', 'rules', 'team-styles'];
  let pooledSeasonAvailable = false;
  function updatePooledAvailability() {
    const entries = source?.packageRegistry?.packages;
    const pooledEntries = Array.isArray(entries) ? entries.filter(entry => entry?.status === 'published' && entry.scope?.kind === 'pooled-window') : [];
    const pooledEntry = pooledEntries.length === 1 ? pooledEntries[0] : null;
    const capability = pooledEntry?.capabilities?.seasonSimulation;
    const missingArtifacts = pooledArtifacts.filter(artifactId => !capability?.artifactIds?.includes(artifactId));
    pooledSeasonAvailable = Boolean(pooledEntry && capability?.status === 'available' && missingArtifacts.length === 0);
    if (pooledOption) {
      pooledOption.disabled = !pooledSeasonAvailable;
      pooledOption.textContent = pooledSeasonAvailable ? 'Accepted pooled package' : 'Accepted pooled package · unavailable';
    }
    pooledScopeStatus.textContent = pooledEntries.length > 1
      ? 'Multiple pooled packages are published; Season Lab requires one unambiguous pooled package.'
      : !pooledEntry
        ? 'No published pooled package is available for Season Lab.'
        : capability?.status !== 'available'
        ? 'Pooled Season Lab unavailable; Career or Composite data cannot substitute.'
        : `The pooled package is missing required Season Lab artifacts: ${missingArtifacts.join(', ')}.`;
    if (!pooledSeasonAvailable && sourceKind.input.value === 'pooled-window') {
      sourceKind.input.value = 'exact-season';
      acceptedPool.input.checked = false;
    }
    acceptedPool.label.hidden = !pooledSeasonAvailable || sourceKind.input.value !== 'pooled-window';
    pooledScopeStatus.hidden = pooledSeasonAvailable;
  }
  const top = node('div', undefined, 'season-setup-groups');
  const scopeGroup = node('fieldset', undefined, 'season-setup-group');
  scopeGroup.append(node('legend', 'Evidence and roster scope'), teamCount.label, sourceKind.label, roster.label, season.label, acceptedPool.label, pooledScopeStatus);
  const runGroup = node('fieldset', undefined, 'season-setup-group');
  const playoffSetupNote = node('p', '', 'studio-muted season-lab-playoff-note');
  playoffSetupNote.setAttribute('role', 'status');
  runGroup.append(node('legend', 'Run setup'), horizon.label, schedule.label, control.label, playoffField, repeats.label, seed.label, playoffSetupNote);
  top.append(scopeGroup, runGroup);
  const teamHelp = node('p', 'All 30 teams uses the full verified league automatically. For a smaller lab, choose the teams here in one menu.', 'studio-muted');
  teamHelp.id = 'leagueTeamHelp';
  const advanced = node('details', undefined, 'studio-panel'); advanced.append(node('summary', 'Advanced · custom rosters, schedules, and assumptions'));
  const advancedGrid = node('div', undefined, 'studio-roadmap'); advancedGrid.append(managedTeams.label, rosterJson.label, actualRecords.label, declaredSchedule.label, gamesPerTeam.label, cycles.label, seriesLength.label, pace.label, blend.label);
  const scheduleStatus = node('p', '', 'studio-muted'); scheduleStatus.id = 'leagueScheduleStatus';
  advanced.append(advancedGrid, node('p', 'Advanced inputs declare team rosters, custom matchups, comparison records, and simulation assumptions. The pace note is display-only; native team-season pace remains package evidence.', 'studio-muted'));
  runGroup.append(scheduleStatus);
  const brief = node('p', '', 'studio-muted'); brief.id = 'leagueBrief';
  const controls = node('div', undefined, 'studio-team-form'), run = node('button', 'Simulate Season Lab', 'button'), nextOutcome = node('button', 'Try another outcome', 'button-secondary'), cancel = node('button', 'Cancel Season Lab', 'button-secondary');
  run.type = 'submit'; run.id = 'leagueRun'; nextOutcome.type = 'button'; nextOutcome.id = 'leagueNextOutcome'; nextOutcome.hidden = true; cancel.type = 'button'; cancel.id = 'leagueCancel'; cancel.hidden = true; controls.append(run, nextOutcome, cancel); form.append(teamHelp, teamField, top, brief, controls, advanced);
  const status = node('p'), results = node('div'); status.id = 'leagueStatus'; results.id = 'leagueResults'; status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  const referenceControls = node('div', undefined, 'studio-team-form'), pin = node('button', 'Pin this Season Lab result', 'button-secondary'), clear = node('button', 'Clear Season Lab reference', 'button-secondary');
  pin.type = 'button'; clear.type = 'button'; pin.disabled = true; clear.hidden = true; const referenceStatus = node('p', 'No pinned Season Lab result.', 'studio-muted');
  referenceStatus.id = 'leagueReferenceStatus'; referenceStatus.setAttribute('role', 'status'); referenceControls.append(pin, clear);

  // Persistent franchise mode is deliberately separate from the evidence
  // report above. It reuses the same selected public payloads, but stores a
  // seeded league state locally and labels every output as simulated.
  const franchise = node('section', undefined, 'studio-panel studio-franchise-panel');
  const franchiseHeading = node('h3', 'Persistent Franchise Simulation'); franchiseHeading.id = 'seasonLabFranchiseHeading';
  franchiseView.setAttribute('aria-labelledby', franchiseHeading.id);
  franchise.append(franchiseHeading);
  franchise.append(node('p', 'Franchise uses the selected exact season. Outcomes are simulations, not forecasts.', 'studio-muted'));
  const franchiseGrid = node('div', undefined, 'studio-roadmap');
  const franchiseSeason = choice('Starting season', 'franchiseSeason', []);
  const franchiseTeam = choice('User-controlled team', 'franchiseUserTeam', []);
  const franchiseGames = rangeChoice('Games per team', 'franchiseGames', 82, 1, 200, 1, value => `${Number(value)} games`);
  const franchisePlayoffField = fixedField('Playoff field', '16 teams', 'studio-fixed-field--playoff');
  const franchisePlayoffNote = node('p', 'Full NBA fields use a fixed 16-team bracket; compact mini-leagues with fewer teams end at the standings.', 'studio-muted season-lab-playoff-note');
  const franchiseSeriesLength = choice('Playoff series length', 'franchiseSeriesLength', [[7, 'Best of seven'], [5, 'Best of five'], [3, 'Best of three'], [1, 'One game']]);
  const franchiseSeed = textInput('League seed (optional)', 'franchiseSeed'); franchiseSeed.input.placeholder = 'Leave blank for a new random league';
  const franchiseAction = choice('Roster scenario action', 'franchiseAction', [['waive', 'Waive / release'], ['trade', 'Move to another team'], ['sign', 'Sign from free-agent pool']]);
  const franchisePlayer = choice('Player', 'franchisePlayer', []);
  const franchiseDestination = choice('Destination team', 'franchiseDestination', []);
  franchiseGrid.append(franchiseSeason.label, franchiseTeam.label, franchiseGames.label, franchisePlayoffField, franchiseSeriesLength.label, franchiseSeed.label);
  const franchiseControls = node('div', undefined, 'studio-team-form franchise-controls');
  franchiseControls.setAttribute('role', 'group'); franchiseControls.setAttribute('aria-label', 'Season actions');
  const franchiseStart = node('button', 'Start new league', 'button'); franchiseStart.type = 'button';
  const franchiseRun = node('button', 'Simulate season', 'button'); franchiseRun.type = 'button'; franchiseRun.disabled = true; franchiseRun.hidden = true;
  const franchiseWindowSize = choice('Games before next decision', 'franchiseWindowSize', [[1, '1 game'], [5, '5 games'], [10, '10 games'], [25, '25 games']]);
  const franchisePlayWindow = node('button', 'Play next game window', 'button-secondary'); franchisePlayWindow.type = 'button'; franchisePlayWindow.disabled = true; franchisePlayWindow.hidden = true;
  const updateFranchisePlayWindowLabel = () => {
    const games = Number(franchiseWindowSize.input.value);
    franchisePlayWindow.textContent = games === 1 ? 'Play next game' : `Play next ${games} games`;
  };
  franchiseWindowSize.input.addEventListener('input', updateFranchisePlayWindowLabel);
  franchiseWindowSize.input.addEventListener('change', updateFranchisePlayWindowLabel);
  const franchiseCancel = node('button', 'Cancel season', 'button-secondary'); franchiseCancel.type = 'button'; franchiseCancel.hidden = true; franchiseCancel.disabled = true;
  const franchiseOffseason = node('button', 'Advance offseason', 'button-secondary'); franchiseOffseason.type = 'button'; franchiseOffseason.disabled = true; franchiseOffseason.hidden = true;
  const franchiseSave = node('button', 'Save league locally', 'button-secondary'); franchiseSave.type = 'button'; franchiseSave.disabled = true;
  const franchiseLoad = node('button', 'Load saved league', 'button-secondary'); franchiseLoad.type = 'button';
  const franchiseClear = node('button', 'Clear saved league', 'button-secondary'); franchiseClear.type = 'button'; franchiseClear.disabled = true;
  franchiseControls.append(franchiseStart, franchisePlayWindow, franchiseWindowSize.label, franchiseRun, franchiseCancel, franchiseOffseason);
  const franchiseSaveDetails = node('details', undefined, 'studio-panel franchise-save-details');
  franchiseSaveDetails.id = 'franchiseSaveDetails';
  franchiseSaveDetails.append(node('summary', 'Local league storage'));
  const franchiseSaveControls = node('div', undefined, 'studio-team-form franchise-save-details__actions');
  franchiseSaveControls.setAttribute('role', 'group'); franchiseSaveControls.setAttribute('aria-label', 'Local league save actions');
  franchiseSaveControls.append(franchiseSave, franchiseLoad, franchiseClear);
  franchiseSaveDetails.append(franchiseSaveControls);
  const franchiseReplayDetails = node('details', undefined, 'studio-panel franchise-replay-details');
  franchiseReplayDetails.id = 'franchiseReplayDetails';
  franchiseReplayDetails.append(node('summary', 'More season actions'));
  const franchiseReplay = node('button', 'Resimulate with current game plan', 'button-secondary'); franchiseReplay.type = 'button'; franchiseReplay.disabled = true;
  franchiseReplayDetails.append(franchiseReplay); franchiseReplayDetails.hidden = true;
  const franchiseRosterDetails = node('details', undefined, 'studio-panel season-result-details franchise-roster-details');
  franchiseRosterDetails.append(node('summary', 'Roster moves · user scenario'));
  const franchiseRosterGrid = node('div', undefined, 'studio-roadmap');
  franchiseRosterGrid.append(franchiseAction.label, franchisePlayer.label, franchiseDestination.label);
  const franchiseTransaction = node('button', 'Apply roster action', 'button-secondary'); franchiseTransaction.type = 'button'; franchiseTransaction.disabled = true;
  franchiseRosterDetails.append(node('p', 'These are user-declared roster scenarios. Contract, cap, free-agent, trade-deadline, and trade-matching eligibility are not verified by the current public package.', 'studio-muted'), franchiseRosterGrid, franchiseTransaction);
  franchiseRosterDetails.hidden = true;
  const franchiseCoachDetails = node('details', undefined, 'studio-panel season-result-details franchise-coach-details');
  franchiseCoachDetails.append(node('summary', 'Coach your team · pace, emphasis, and rotation'));
  const franchiseCoachingPace = rangeChoice('Tempo target', 'franchiseCoachingPace', 100, 94, 106, 1, value => `${value} possessions target`);
  const franchiseCoachingOffense = rangeChoice('Offense emphasis', 'franchiseCoachingOffense', 50, 0, 100, 5, value => `${value}%`);
  const franchiseCoachingDefense = rangeChoice('Defense emphasis', 'franchiseCoachingDefense', 50, 0, 100, 5, value => `${value}%`);
  const franchiseRotationEditor = node('div', undefined, 'studio-roadmap franchise-rotation-editor');
  const franchiseRotationSourceStatus = node('p', '', 'studio-muted franchise-rotation-source-status');
  franchiseRotationSourceStatus.id = 'franchiseRotationSourceStatus';
  const franchiseRotationPlanReceipt = node('p', '', 'studio-muted franchise-rotation-plan-receipt');
  franchiseRotationPlanReceipt.id = 'franchiseRotationPlanReceipt';
  franchiseRotationPlanReceipt.setAttribute('role', 'status');
  franchiseRotationPlanReceipt.setAttribute('aria-live', 'polite');
  franchiseRotationPlanReceipt.hidden = true;
  const franchiseRotationInputs = [];
  let franchiseRotationEdited = false;
  const franchiseApplyCoaching = node('button', 'Save game plan', 'button-secondary'); franchiseApplyCoaching.type = 'button';
  franchiseCoachDetails.append(franchiseCoachingPace.label, franchiseCoachingOffense.label, franchiseCoachingDefense.label,
    node('p', 'Regulation target minutes are share weights, not observed or guaranteed playing time. The engine allocates 240 regulation team minutes across these players; overtime adds minutes to the box score. The season ledger’s simulated total minutes sums box-score minutes through the selected season point. These controls affect your user-controlled team only.', 'studio-muted'),
    franchiseRotationSourceStatus, franchiseRotationEditor, franchiseApplyCoaching);
  franchiseCoachDetails.hidden = true;
  const franchiseStatus = node('p', 'Choose a verified season, then start a league.', 'studio-muted'); franchiseStatus.id = 'franchiseStatus'; franchiseStatus.setAttribute('role', 'status'); franchiseStatus.setAttribute('aria-live', 'polite');
  const franchiseResults = node('div'); franchiseResults.id = 'franchiseResults';
  const franchiseJourney = node('section', undefined, 'studio-panel franchise-journey'); franchiseJourney.id = 'franchiseJourney';
  franchiseJourney.setAttribute('aria-label', 'Franchise season objective and next action');
  franchise.append(franchiseGrid, franchisePlayoffNote, franchiseJourney, franchiseControls, franchiseSaveDetails, franchiseReplayDetails, franchiseRosterDetails, franchiseCoachDetails, franchiseStatus, franchiseRotationPlanReceipt, franchiseResults);
  const sessionHud = mountSimulationSessionHud(documentRef, root, {
    id: 'seasonLabSessionHud',
    objective: 'Season simulation',
    steps: ['Setup', 'Run', 'Review'],
    retainedProvenanceNote: '',
    provenance: {
      scope: 'Selected exact season or explicitly accepted pooled package',
      cutoff: 'Explicit season start years and declared schedule',
      output: 'Seeded replay output stays separate from native evidence',
    },
    initialMessage: 'Ready.',
    onPause: () => {
      pauseGate?.pause();
      status.textContent = 'Season Lab paused at the last completed checkpoint. Resume when ready.';
    },
    onResume: () => {
      pauseGate?.resume();
      status.textContent = 'Season Lab resumed. Building the next checkpoint…';
    },
    onCancel: () => {
      pauseGate?.resume();
      active?.abort();
      status.textContent = 'Cancelling Season Lab…';
    },
    onReset: () => {
      pauseGate?.resume();
      pauseGate = null;
      active?.abort();
      active = null;
      generation += 1;
      currentReport = null;
      currentPreparedInput = null;
      nextRunAction = 'run';
      reference = null;
      results.replaceChildren();
      pin.disabled = true;
      nextOutcome.hidden = true;
      clear.hidden = true;
      referenceStatus.textContent = 'No pinned Season Lab result.';
      busy(false);
      status.textContent = 'Session reset.';
    },
    onReplay: () => {
      if (!currentReport) {
        status.textContent = 'Run the Season Lab once before replaying it.';
        return;
      }
      if (currentPreparedInput) {
        status.textContent = `Replaying the declared Season Lab input with seed ${currentReport.seed}…`;
        void runPreparedInput(currentPreparedInput, { action: 'replay' }).catch(() => {});
        return;
      }
      seed.input.value = currentReport.seed || seed.input.value;
      nextRunAction = 'replay';
      status.textContent = `Replaying Season Lab with seed ${seed.input.value}…`;
      form.requestSubmit();
    },
  });
  seasonView.setAttribute('aria-labelledby', heading.id);
  seasonView.append(sessionHud?.element || documentRef.createElement('span'), form, status, referenceControls, referenceStatus, results);
  franchiseView.append(franchise);
  root.append(heading, modeNavigation, seasonView, franchiseView);
  const name = id => source?.teams.find(team => team.id === id)?.name || id;
  function refreshTeamSelectors(count) {
    const options = source?.teams || [];
    teamField.replaceChildren();
    teamSelectors.length = 0;
    teamPicker.input.replaceChildren(...options.map(team => {
      const option = node('option', team.name);
      option.value = team.id;
      return option;
    }));
    teamCount.input.value = count;
    if (count >= options.length && options.length) {
      teamField.hidden = true;
      teamHelp.hidden = true;
      teamField.dataset.mode = 'all';
      return;
    }
    teamField.hidden = false;
    teamHelp.hidden = false;
    teamField.dataset.mode = 'selected';
    teamPicker.input.selectedIndex = -1;
    [...teamPicker.input.options].slice(0, count).forEach(option => { option.selected = true; });
    teamField.append(teamPicker.label);
    teamSelectors.push(teamPicker);
  }
  function updateLabels() {
    updatePooledAvailability();
    const count = Number(teamCount.input.value) || 0, horizonKind = horizon.input.value, scheduleKind = schedule.input.value;
    const scheduleLabel = seasonScheduleLabel(scheduleKind);
    const playoffReady = count >= 16;
    if (horizonKind === 'game') gamesPerTeam.input.value = 1; else if (count === 4 && horizonKind === 'short') gamesPerTeam.input.value = Number(cycles.input.value) * (count - 1); else if (horizonKind === 'full') gamesPerTeam.input.value = 82;
    gamesPerTeam.update();
    gamesPerTeam.input.disabled = scheduleKind !== 'round-robin' || horizonKind === 'full' || horizonKind === 'game' || (count === 4 && horizonKind === 'short');
    declaredSchedule.input.disabled = scheduleKind !== 'custom'; acceptedPool.label.hidden = !pooledSeasonAvailable || sourceKind.input.value !== 'pooled-window'; managedTeams.input.disabled = control.input.value === 'deterministic-bot';
    if (scheduleKind === 'actual') {
      const years = String(season.input.value || '').split(',').map(item => Number(item.trim())).filter(Number.isFinite);
      const available = source?.scheduleArtifact && years.length
        ? years.every(year => source.scheduleArtifact.seasons?.some(item => Number(item.seasonStartYear) === year))
        : false;
      scheduleStatus.textContent = available
        ? horizonKind === 'game'
          ? 'Exact NBA schedule loaded. One observed matchup per team is comparison evidence; new outcomes are simulated.'
          : 'Exact NBA schedule loaded. Records use final scores; game outcomes are simulated.'
        : 'Exact NBA schedule is unavailable for the selected season(s); this run will stop instead of falling back to a round-robin calendar.';
    } else if (scheduleKind === 'round-robin') {
      scheduleStatus.textContent = 'Round-robin is a generated scenario schedule.';
    } else {
      scheduleStatus.textContent = 'Custom schedule is an explicit scenario; enter bounded game records below.';
    }
    const nonDefaultBlend = Number(blend.input.value) !== 0.5;
    brief.textContent = `${count} teams · ${horizonKind} · ${scheduleLabel}${horizonKind === 'short' || scheduleKind === 'custom' || nonDefaultBlend ? ' · Scenario' : ''} · ${repeats.input.value} replay${Number(repeats.input.value) === 1 ? '' : 's'}${Number(repeats.input.value) === 1 ? ' · variation unavailable at one run' : ''}.`;
    playoffSetupNote.textContent = playoffReady
      ? 'The NBA playoff bracket is fixed at 16 teams.'
      : 'Compact leagues with fewer than 16 teams finish at the standings; the playoff field does not resize.';
    run.disabled = !source;
    run.textContent = count === 30 ? 'Simulate Season Lab' : 'Simulate mini league';
  }
  function busy(value) { form.querySelectorAll('input,select,button').forEach(input => { input.disabled = value; }); cancel.disabled = false; cancel.hidden = !value; pin.disabled = value || !currentReport; clear.disabled = value; updateModeButtons(); }
  function changed() {
    try { options?.onSetupChanged?.(); } catch { /* optional observers cannot block setup changes */ }
    pauseGate?.resume();
    pauseGate = null;
    active?.abort();
    generation += 1;
    currentReport = null;
    currentPreparedInput = null;
    nextRunAction = 'run';
    results.replaceChildren();
    pin.disabled = true;
    nextOutcome.hidden = true;
    clear.hidden = !reference;
    referenceStatus.textContent = reference ? `Pinned benchmark: ${reference.setup.teams.length} teams · ${reference.repeatCount} repeats · seed ${reference.seed}. Run the same teams and season to compare.` : 'No pinned Season Lab result.';
    sessionHud?.session.reset('Setup changed.');
    updateLabels();
    status.textContent = 'Setup changed. Previous result cleared.';
  }
  function cancelActive(reason = 'Season Lab cancelled. No partial result was saved.') {
    if (!active) return false;
    sessionHud?.session.requestCancel(reason);
    pauseGate?.resume();
    active.abort();
    status.textContent = reason;
    return true;
  }
  form.addEventListener('input', changed); form.addEventListener('change', changed);
  teamCount.input.addEventListener('change', () => { if (source) refreshTeamSelectors(Number(teamCount.input.value)); updateLabels(); });
  cancel.addEventListener('click', () => {
    cancelActive('Cancelling Season Lab…');
  });
  nextOutcome.addEventListener('click', () => {
    if (!currentReport || active) return;
    if (currentPreparedInput?.setup?.source?.kind === 'year-advance-scenario') {
      const resolved = resolveSimulationSeed('', 'season-lab');
      const input = {
        ...currentPreparedInput,
        setup: { ...currentPreparedInput.setup, randomness: { ...currentPreparedInput.setup.randomness, seed: resolved.seed } },
      };
      status.textContent = `Drawing another next-season outcome with new seed ${resolved.seed}…`;
      void runPreparedInput(input).catch(() => {});
      return;
    }
    seed.input.value = '';
    nextRunAction = 'run';
    status.textContent = 'Drawing a new seed for another outcome with this setup…';
    form.requestSubmit();
  });

  function render(report) {
    currentReport = report;
    const seasonText = report.seasons.map(item => `${item.seasonStartYear}–${String(item.seasonStartYear + 1).slice(-2)}`).join(', ');
    const title = node('h3', `${report.label}: ${seasonText}`); title.tabIndex = -1; title.dataset.leagueResult = '';
    const structureNote = report.playoffStructure === 'conference-aware'
      ? ' Playoff structure: East and West conference brackets feed the Finals.'
      : ' Playoff structure: generic seeded bracket for an unmapped/custom league.';
    const source = report.setup?.source || {};
    const scheduleAudit = report.scheduleAudit || {};
    const firstSeason = report.seasons?.[0] || {};
    const firstSeasonStartYear = Number(firstSeason.seasonStartYear);
    const firstSeasonText = Number.isSafeInteger(firstSeasonStartYear)
      ? `${firstSeasonStartYear}–${String(firstSeasonStartYear + 1).slice(-2)}`
      : 'first selected season';
    const firstStanding = report.standings?.[0] || null;
    const replayChampion = report.setup?.playoff?.enabled ? firstSeason.champion : null;
    const evidenceLabel = seasonSourceLabel(source);
    const packageLabel = [source.packageId, source.packageVersion].filter(Boolean).join(' @ ') || 'Package identifier unavailable';
    const scheduleReceipt = report.setup?.schedule?.sourceReceipt?.id || null;
    const scheduleKind = seasonScheduleLabel(report.setup?.schedule?.kind);
    const scenarioLabel = report.scenario ? 'Scenario run' : 'Historical-shape replay';

    const resultHeader = node('section', undefined, 'season-result-header');
    const resultBadges = node('div', undefined, 'season-result-badges');
    resultBadges.append(
      node('span', `Evidence · ${evidenceLabel}`, 'season-result-badge'),
      node('span', `Schedule · ${scheduleKind}`, 'season-result-badge'),
      node('span', scenarioLabel, 'season-result-badge'),
    );
    resultHeader.append(
      node('span', 'Season Lab result', 'studio-eyebrow'),
      title,
      node('p', `${report.setup.teams.length} teams · ${report.repeatCount} repeat${report.repeatCount === 1 ? '' : 's'} · seed ${report.seed} · ${scheduleKind} schedule.${report.setup.playoff.enabled ? structureNote : ''}`, 'studio-muted'),
      node('p', 'This view keeps first-replay outcomes, native package evidence, and repeated-run distributions as separate layers.', 'season-result-header__note'),
      resultBadges,
    );
    const summaryGrid = node('div', undefined, 'season-result-summary-grid');
    summaryGrid.append(
      seasonResultMetric(replayChampion ? 'First replay champion' : 'First replay leader', replayChampion || firstStanding?.displayTeam || 'Unavailable', replayChampion
        ? 'Winner of this replay’s playoff bracket.'
        : firstStanding ? `${firstStanding.wins}–${firstStanding.losses}–${firstStanding.ties} · ${percent(firstStanding.winRate)} win rate${report.setup?.playoff?.enabled ? ' · champion unresolved' : ''}` : 'No standings row is available.'),
      seasonResultMetric('Evidence scope', evidenceLabel, `${seasonText} · ${report.setup.teams.length} teams`),
      seasonResultMetric('Standings schedule', scheduleKind, `${scheduleAudit.standingsGames ?? firstSeason.standingsGames ?? '—'} standings-eligible games`),
      seasonResultMetric('Run count', `${report.repeatCount} replay${report.repeatCount === 1 ? '' : 's'}`, report.repeatCount > 1 ? `Run-to-run variation · seed ${report.seed}` : `Variation unavailable at one run · seed ${report.seed}`),
    );
    resultHeader.append(summaryGrid);
    results.replaceChildren(resultHeader);
    if (firstSeason.cupCompletion) {
      const cup = firstSeason.cupCompletion;
      const coverage = cup.coverage || {};
      const priorRecordReceipt = cup.priorSeasonRecordsSourceReceipt || {};
      const section = seasonResultSection('seasonCupCompletionTitle', 'Modeled competition', '2026–27 NBA Cup schedule completion',
        'The 1,200 source-published games, including 60 Group Play games, stay fixed. Group Play and knockout outcomes are simulated once per replay; the remaining completion games are seeded scenario output, not announced NBA matchups.',
        'season-result-section--methodology');
      section.append(node('p', `${coverage.announcedGamesPreserved ?? cup.publishedSchedule?.announcedGames ?? '1,200'} published games preserved · ${coverage.standingsEligibleGames ?? firstSeason.standingsGames ?? '—'} standings-eligible games · ${coverage.decidedStandingsGames ?? '—'} decided results · ${coverage.appearancesPerTeam ? '82 games per team' : 'team-game coverage unavailable'} · maximum ${coverage.maximumOvertimePeriods ?? '—'} OT periods per game. The NBA Cup Championship is excluded from regular-season standings.`, 'studio-muted'));
      section.append(seasonTable('Seeded NBA Cup schedule completion', ['Round', 'Home', 'Away', 'Score', 'Phase'], (cup.games || []).map(game => [
        readableLabel(game.round || game.cupRound || game.stage || 'completion'),
        game.home || game.homeTeamId || 'Unavailable',
        game.away || game.awayTeamId || 'Unavailable',
        `${game.scoreHome ?? '—'}–${game.scoreAway ?? '—'}`,
        readableLabel(game.phase || 'regular'),
      ]), 'cup-completion'));
      section.append(node('p', `Replay-specific Cup completion seed ${cup.seed || 'unavailable'} · source receipt ${cup.sourceReceipt?.id || report.setup?.schedule?.sourceReceipt?.id || 'unavailable'}. ${cup.note || ''}`, 'studio-muted'));
      section.append(node('p', `Cup tiebreak baseline: exact 2025–26 all-team regular-season records from ${priorRecordReceipt.scheduleId || priorRecordReceipt.id || priorRecordReceipt.source?.provider || 'the pinned prior-season schedule receipt'}.`, 'studio-muted'));
      results.append(section);
    }
    if (reference) {
      const comparable = reference.setup?.schedule?.kind === report.setup?.schedule?.kind
        && reference.setup?.horizon?.kind === report.setup?.horizon?.kind
        && reference.setup?.teams?.map(team => team.id).sort().join(',') === report.setup?.teams?.map(team => team.id).sort().join(',')
        && reference.seasons?.map(item => item.seasonStartYear).join(',') === report.seasons?.map(item => item.seasonStartYear).join(',')
        && reference.scheduleAudit?.standingsGames === report.scheduleAudit?.standingsGames;
      const challenge = seasonResultSection('seasonChallengeTitle', 'Experiment progress', 'Against your pinned run',
        comparable ? 'First-replay wins are compared under matching teams, season, horizon, and schedule shape. The seed and settings can still change the simulated outcome.' : 'The pinned run has a different league or schedule shape, so raw wins are not compared. Match its setup or pin this result as the new benchmark.',
        'season-result-section--challenge');
      if (comparable) {
        const baseline = new Map(reference.standings.map(row => [row.teamId, row]));
        challenge.append(seasonTable('First-replay wins versus pinned run', ['Team', 'Pinned wins', 'This run wins', 'Change'], report.standings.map(row => {
          const prior = baseline.get(row.teamId);
          const difference = row.wins - Number(prior?.wins || 0);
          return [row.displayTeam, prior?.wins ?? 'Unavailable', row.wins, `${difference > 0 ? '+' : ''}${difference}`];
        }), 'challenge'));
      }
      results.append(challenge);
    }

    const provenance = seasonResultSection('seasonProvenanceTitle', 'Run receipt', 'Evidence and reproducibility',
      'The data inputs, schedule declaration, and replay key are shown before the results so the layers below can be read in context.', 'season-result-section--provenance');
    const provenanceCard = node('aside', undefined, 'season-provenance-card');
    const provenanceList = node('dl');
    provenanceList.append(
      provenanceItem('Evidence', evidenceLabel),
      provenanceItem('Package', packageLabel),
      provenanceItem('Schedule input', scheduleReceipt ? `${scheduleKind} · receipt ${scheduleReceipt}` : `${scheduleKind} · no receipt identifier supplied`),
      provenanceItem('Replay key', report.seed || 'Unavailable'),
    );
    provenanceCard.append(provenanceList, node('p', 'Native package rates remain evidence. Replay results are conditional on the declared schedule, setup, and displayed seed.', 'studio-muted'));
    provenance.append(provenanceCard);

    const outcomes = seasonResultSection('seasonOutcomesTitle', 'Outcome view', `First replay standings · ${firstSeasonText}`,
      `This table reports the first replay for ${firstSeasonText}. Simulated score rates stay distinct from native rates shown in the evidence section.`, 'season-result-section--outcomes');
    const standingsTable = seasonTable(`First replay standings · ${firstSeasonText}`, ['Seed', 'Team', 'Conference', 'Division', 'W–L–T', 'Win rate', 'Replay offense PPG', 'Replay defense PPG', 'Replay net PPG', 'Native net rank', 'Schedule strength'], report.standings.map(row => [
      row.seed,
      row.displayTeam,
      row.conference || 'Unmapped',
      row.division || 'Unmapped',
      `${row.wins}–${row.losses}–${row.ties}`,
      percent(row.winRate),
      pretty(row.simulatedMetrics?.offense),
      pretty(row.simulatedMetrics?.defense),
      pretty(row.simulatedMetrics?.net),
      row.nativeNetRank ?? 'Unavailable',
      `${pretty(row.scheduleStrength?.opponentAverageNet)} native net / ${row.scheduleStrength?.games ?? '—'} games`,
    ]), 'standings');
    outcomes.append(standingsTable);

    const distributions = seasonResultSection('seasonDistributionTitle', 'Variation', report.repeatCount > 1 ? `Repeated-run distribution · ${firstSeasonText}` : `Variation unavailable · ${firstSeasonText}`,
      report.repeatCount > 1
        ? `These rates summarize simulation frequencies for ${firstSeasonText} under the declared setup. Their 95% Wilson intervals describe sampling uncertainty across replays only; they are not model/input uncertainty intervals or calibrated forecasts. These are not player or team grades.`
        : `A single replay cannot show between-run variation for ${firstSeasonText}. Increase the repeat count to compare the range of simulated outcomes.`, 'season-result-section--distribution');
    if (report.repeatCount > 1) {
      distributions.append(seasonResultDetails(`Open distribution table · ${report.repeatCount} replays`, seasonTable(`Repeated-run distributions · ${firstSeasonText}`, ['Team', 'Average wins', 'Wins P10 / P50 / P90', 'Seed P10 / P50 / P90', 'Playoff rate · 95% Wilson interval', 'Title rate · 95% Wilson interval'], report.repeatedRunDistributions.map(row => [
        row.team,
        pretty(row.averageWins),
        [10, 50, 90].map(key => pretty(row.winQuantiles[key])).join(' / '),
        [10, 50, 90].map(key => pretty(row.seedQuantiles[key])).join(' / '),
        percentWithWilsonInterval(row.playoffAppearanceRate, row.playoffAppearanceInterval),
        percentWithWilsonInterval(row.titleRate, row.titleInterval),
      ]), 'distribution')));
    } else {
      distributions.append(node('p', 'No sampling interval or repeat-rate estimate is available for one run.', 'studio-muted'));
    }
    results.append(outcomes, distributions, seasonResultDetails('Run receipt · evidence, schedule, and replay seed', provenance));

    const evidence = seasonResultSection('seasonEvidenceTitle', 'Evidence layers', 'Native team evidence',
      'Raw native rates and observed Four Factors stay visible instead of being overwritten by the replay.', 'season-result-section--evidence');
    evidence.append(seasonTable('Native offense, defense, and net metrics', ['Team', 'Offense / 100', 'Defense / 100', 'Net / 100', 'Status / sample'], report.nativeMetrics.map(row => {
      const observedGames = Number.isSafeInteger(row.sample?.games) ? `${row.sample.games} observed games` : 'observed-game count unavailable';
      return [row.team, pretty(row.offense.value), pretty(row.defense.value), pretty(row.net.value), `${row.offense.status} · ${observedGames}`];
    }), 'native-rates'));
    const factor = (row, side, key) => {
      const value = row.fourFactors?.[side]?.[key];
      return value?.status === 'observed'
        ? `${percent(value.value)} (${pretty(value.numerator)}/${pretty(value.denominator)})`
        : 'Unavailable';
    };
    evidence.append(node('p', 'Four Factors cells show a raw numerator and denominator only when the selected package marks that rate observed.', 'season-evidence-note'));
    evidence.append(seasonTable('Observed Four Factors evidence', ['Team', 'eFG%', 'FT attempt rate', 'Off. rebound rate', 'Turnover rate', 'Opp. eFG%', 'Opp. FT attempt rate', 'Def. rebound rate', 'Opp. turnover rate'], report.nativeMetrics.map(row => [row.team,
      factor(row, 'offense', 'effectiveFieldGoal'), factor(row, 'offense', 'freeThrowAttemptRate'), factor(row, 'offense', 'offensiveReboundRate'), factor(row, 'offense', 'turnoverRate'),
      factor(row, 'defense', 'opponentEffectiveFieldGoal'), factor(row, 'defense', 'opponentFreeThrowAttemptRate'), factor(row, 'defense', 'defensiveReboundRate'), factor(row, 'defense', 'opponentTurnoverRate')] ), 'four-factors'));
    evidence.append(seasonTable('Rotation usage', ['Team', 'Status', 'Observed players', 'Top observed usage', 'Observed season minutes', 'Evidence note'], report.rotationUsage.map(row => [
      row.team,
      readableLabel(row.status),
      row.observedPlayers ?? 'Unavailable',
      row.players?.slice(0, 5).map(player => `${player.name} ${pretty(player.minutes)}`).join(', ') || 'Unavailable',
      pretty(row.totalMinutes),
      row.note,
    ]), 'rotation'));
    results.append(seasonResultDetails('Native team evidence · rates, Four Factors, and rotation', evidence));

    const comparison = seasonResultSection('seasonComparisonTitle', 'Comparison', 'Scenario versus actual record',
      'This comparison appears only when a compatible actual-record source is available for the selected league scope.', 'season-result-section--comparison');
    const comparisonRows = report.scenarioVsActual.comparisons.length
      ? report.scenarioVsActual.comparisons.map(row => [row.team, row.scenarioWins ?? 'Unavailable', row.actualWins ?? 'Unavailable', percent(row.scenarioWinRate), percent(row.actualWinRate), percent(row.winRateDifference)])
      : [['—', 'Unavailable', 'Unavailable', '—', '—', 'No actual record input']];
    comparison.append(seasonTable('Scenario versus actual', ['Team', 'Replay wins', 'Actual wins', 'Replay rate', 'Actual rate', 'Difference'], comparisonRows, 'comparison'));
    comparison.append(node('p', `${readableLabel(report.scenarioVsActual.status)}: ${report.scenarioVsActual.note}`, 'studio-muted'));
    results.append(seasonResultDetails(
      report.scenarioVsActual.comparisons.length ? 'Scenario versus actual · comparison available' : 'Scenario versus actual · no actual records supplied',
      comparison,
    ));

    const methodology = seasonResultSection('seasonMethodologyTitle', 'Method', 'Bracket, schedule, and assumptions',
      'Open the detailed audit tables when you need the exact bracket or first-replay game records.', 'season-result-section--methodology');
    if (report.playoffBracket) {
      const graphic = playoffBracketGraphic(report.playoffBracket);
      if (graphic) methodology.append(graphic);
      const bracket = node('details', undefined, 'studio-panel');
      bracket.append(node('summary', 'Open exact playoff bracket values'), seasonTable('Playoff bracket', ['Round', 'Stage', 'Conference', 'Matchup', 'Series', 'Winner'], report.playoffBracket.map(series => [series.round, series.stage || 'generic-round', series.conference || 'generic', `${series.a} / ${series.b}`, `${series.winsA}–${series.winsB}`, series.winner || 'Unresolved']), 'bracket'));
      methodology.append(bracket);
    }
    const assumptions = node('details', undefined, 'studio-panel'); assumptions.append(node('summary', 'Uncertainty and assumptions'), node('p', report.uncertainty.parameter), node('p', report.uncertainty.monteCarlo), node('ul')); report.assumptions.forEach(note => assumptions.querySelector('ul').append(node('li', note))); methodology.append(assumptions);
    const scheduleView = node('details', undefined, 'studio-panel'); scheduleView.append(node('summary', 'First-run schedule and scores'), seasonTable('Declared schedule', ['Round', 'Home', 'Away', 'Score'], report.seasons[0].exampleGames.map(game => [game.round, game.home, game.away, `${game.scoreHome}–${game.scoreAway}`]), 'schedule')); methodology.append(scheduleView);
    methodology.append(node('p', `${report.modelVersion} · ${source.packageId || 'package-bound source'} · seed ${report.seed}. ${report.note}`, 'studio-muted studio-game-repro'));
    results.append(seasonResultDetails('Methodology · bracket, schedule, and assumptions', methodology));
    pin.disabled = false; nextOutcome.hidden = false; clear.hidden = !reference; referenceStatus.textContent = reference ? `Pinned: ${reference.setup.teams.length} teams · ${reference.repeatCount} repeats · seed ${reference.seed}.` : 'No pinned Season Lab result.'; title.focus();
  }
  pin.addEventListener('click', () => { reference = currentReport; referenceStatus.textContent = `Pinned: ${reference.setup.teams.length} teams · ${reference.repeatCount} repeats · seed ${reference.seed}.`; clear.hidden = false; });
  clear.addEventListener('click', () => { reference = null; referenceStatus.textContent = 'No pinned Season Lab result.'; clear.hidden = true; pin.focus(); });

  function renderFranchise() {
    updateModeButtons();
    if (!franchiseState) {
      franchiseCheckpoints = []; franchiseAsOfGameCount = 0; franchiseRosterTeamId = ''; franchiseRosterPlayerRef = '';
      franchiseJourney.replaceChildren(node('h4', 'Choose your team and season'), node('p', 'Start a league to set a first-season win target. Each completed season becomes the benchmark for the next one.'));
      franchiseStart.textContent = 'Start new league';
      franchiseStart.hidden = false; franchiseStart.disabled = franchiseBusy || franchiseSeason.input.disabled;
      franchiseRun.hidden = true; franchiseRun.disabled = true;
      franchisePlayWindow.hidden = true; franchisePlayWindow.disabled = true;
      franchiseOffseason.hidden = true; franchiseOffseason.disabled = true;
      franchiseReplayDetails.hidden = true; franchiseReplay.disabled = true;
      franchiseCancel.hidden = !franchiseBusy; franchiseCancel.disabled = !franchiseBusy;
      franchiseSave.disabled = true; franchiseLoad.disabled = franchiseBusy; franchiseClear.disabled = true;
      franchiseRosterDetails.hidden = true;
      franchiseCoachDetails.hidden = true;
      franchiseResults.replaceChildren();
      franchiseTransaction.disabled = true; franchisePlayer.input.replaceChildren(); franchiseDestination.input.replaceChildren();
      return;
    }
    const seasonComplete = franchiseState.calendar.status === 'complete';
    const userTeam = franchiseState.teams.find(team => team.control === 'user') || franchiseState.teams[0];
    const previous = franchiseState.history?.at(-1)?.standings?.find(row => row.teamId === userTeam.teamId);
    const previousWasPerfect = previous && Number(previous.wins || 0) >= franchiseState.settings.gamesPerTeam;
    const targetWins = previous
      ? Math.min(franchiseState.settings.gamesPerTeam, Number(previous.wins || 0) + (previousWasPerfect ? 0 : 1))
      : Math.floor(franchiseState.settings.gamesPerTeam / 2) + 1;
    const challengeLabel = previousWasPerfect
      ? `match last season’s perfect ${previous.wins} wins`
      : previous ? `beat last season’s ${previous.wins} wins` : 'reach a winning record';
    const current = franchiseState.standings?.find(row => row.teamId === userTeam.teamId);
    const wins = current?.wins ?? userTeam.record?.wins ?? 0;
    const metTarget = seasonComplete && wins >= targetWins;
    const stage = seasonComplete ? 'Review' : franchiseBusy ? 'Running' : 'Manage roster';
    const nextAction = seasonComplete
      ? `Advance the offseason to carry this league into ${franchiseState.currentSeason + 1}, or resimulate from game one with the current roster and game plan. Earlier choices are not replayed at their original game dates.`
      : 'Set your game plan or make a roster move, then play the next game window or finish the season.';
    franchiseJourney.replaceChildren(
      node('h4', `Season ${franchiseState.currentSeason} · ${stage}`),
      node('p', `${userTeam.displayName} challenge: ${challengeLabel} · target ${targetWins} wins. ${seasonComplete ? `${wins} wins · ${metTarget ? 'challenge met' : 'challenge missed'}.` : 'Outcome pending.'}`),
      node('p', nextAction, 'studio-muted'),
    );
    franchiseStart.hidden = false; franchiseStart.disabled = franchiseBusy || franchiseSeason.input.disabled;
    franchiseStart.textContent = 'Start another league';
    franchiseRun.hidden = seasonComplete; franchiseRun.disabled = franchiseBusy;
    franchisePlayWindow.hidden = seasonComplete; franchisePlayWindow.disabled = franchiseBusy;
    franchiseWindowSize.label.hidden = seasonComplete;
    franchiseWindowSize.input.disabled = franchiseBusy || seasonComplete;
    updateFranchisePlayWindowLabel();
    franchiseOffseason.hidden = !seasonComplete; franchiseOffseason.disabled = franchiseBusy || !seasonComplete;
    franchiseReplayDetails.hidden = !seasonComplete; franchiseReplay.disabled = franchiseBusy;
    franchiseCancel.hidden = !franchiseBusy; franchiseCancel.disabled = !franchiseBusy;
    franchiseSave.disabled = franchiseBusy; franchiseLoad.disabled = franchiseBusy; franchiseClear.disabled = franchiseBusy;
    franchiseRosterDetails.hidden = seasonComplete;
    const controlledTeam = franchiseState.teams.find(team => team.control === 'user') || null;
    franchiseCoachDetails.hidden = !controlledTeam || seasonComplete;
    [franchiseCoachingPace, franchiseCoachingOffense, franchiseCoachingDefense].forEach(control => {
      control.input.disabled = franchiseBusy || seasonComplete || !controlledTeam;
    });
    franchiseApplyCoaching.disabled = franchiseBusy || seasonComplete || !controlledTeam;
    const coaching = controlledTeam?.coaching || {};
    franchiseCoachingPace.input.value = coaching.pace ?? 100; franchiseCoachingPace.update();
    franchiseCoachingOffense.input.value = coaching.offense ?? 50; franchiseCoachingOffense.update();
    franchiseCoachingDefense.input.value = coaching.defense ?? 50; franchiseCoachingDefense.update();
    const usesDefaultRotation = controlledTeam?.rotationSource !== 'user-saved';
    franchiseRotationSourceStatus.textContent = usesDefaultRotation
      ? 'Rotation source: evidence-position default. Saving pace or emphasis keeps this plan. Change a target minute to save a custom rotation.'
      : 'Rotation source: your saved rotation. Saving pace or emphasis keeps your minute choices.';
    franchiseRotationSourceStatus.hidden = !controlledTeam;
    const latestTeamRotationReceipt = controlledTeam ? [...(franchiseState.gameLogs || [])].reverse()
      .find(game => game.homeTeamId === controlledTeam.teamId || game.awayTeamId === controlledTeam.teamId)
      ?.rotationPlanReceipts?.[controlledTeam.teamId] : null;
    const rotationPlanStatus = usesDefaultRotation
      ? latestTeamRotationReceipt?.status || controlledTeam?.rotationPlanStatus : null;
    const rotationPlanReason = String(latestTeamRotationReceipt?.reason || controlledTeam?.rotationPlanReason
      || 'The planner could not certify a position-covered rotation.').trim();
    const roleMinuteCoverage = latestTeamRotationReceipt?.roleMinuteCoverage;
    const roleCoverageText = roleMinuteCoverage ? `Per-game regulation role-minute capacity: ${['G', 'F', 'C']
      .map(role => `${role} ${roleMinuteCoverage[role]?.minutes ?? 0}/${roleMinuteCoverage[role]?.required ?? '—'}`)
      .join(' · ')}.` : '';
    const hasSuccessfulCpuRotationReceipt = usesDefaultRotation
      && latestTeamRotationReceipt?.source === 'evidence-position-default'
      && latestTeamRotationReceipt?.status === 'ready'
      && latestTeamRotationReceipt?.roleCoverageStatus === 'covered'
      && Number(latestTeamRotationReceipt?.totalRegulationMinutes) === 240;
    const rotationPlanReceipt = rotationPlanStatus === 'evidence-position-fallback'
      ? `Evidence-position fallback in use: ${rotationPlanReason}${roleCoverageText ? ` ${roleCoverageText}` : ''}`
      : rotationPlanStatus === 'unavailable'
        ? `Evidence-position rotation unavailable: ${rotationPlanReason}${roleCoverageText ? ` ${roleCoverageText}` : ''}`
        : hasSuccessfulCpuRotationReceipt
          ? `CPU evidence-position rotation ready (${latestTeamRotationReceipt.modelVersion || 'version unavailable'}) · ${latestTeamRotationReceipt.totalRegulationMinutes} regulation minutes.${roleCoverageText ? ` ${roleCoverageText}` : ''}`
          : '';
    franchiseRotationPlanReceipt.textContent = rotationPlanReceipt;
    franchiseRotationPlanReceipt.hidden = !rotationPlanReceipt;
    franchiseRotationEdited = false;
    franchiseRotationInputs.length = 0; franchiseRotationEditor.replaceChildren();
    if (controlledTeam) {
      const rotationPlayers = (controlledTeam.roster || []).filter(player => player.status === 'active')
        .sort((left, right) => Number(right.rotationMinutes || 0) - Number(left.rotationMinutes || 0) || left.displayName.localeCompare(right.displayName))
        .slice(0, 10);
      if (rotationPlayers.length >= 5) {
        rotationPlayers.forEach(player => {
          const savedRole = controlledTeam.rotation?.find(row => row.playerRef === player.playerRef);
          const playerControls = node('fieldset', undefined, 'franchise-rotation-player');
          playerControls.append(node('legend', player.displayName));
          const minutesLabel = node('label', 'Regulation target minutes');
          const minutesInput = node('input'); Object.assign(minutesInput, { type: 'number', min: 1, max: 48, step: 1,
            value: Math.max(1, Math.min(48, Number(savedRole?.minutes ?? player.rotationMinutes) || 24)) });
          minutesInput.dataset.playerRef = player.playerRef;
          minutesInput.setAttribute('aria-label', `${player.displayName} regulation target minutes`);
          const utilizationLabel = node('label', 'Utilization role');
          const roleInput = node('select'); roleInput.setAttribute('aria-label', `${player.displayName} utilization role`);
          [['lead-creator', 'Lead creator'], ['primary-scorer', 'Primary scorer'], ['balanced', 'Balanced'],
            ['connector', 'Connector'], ['low-usage', 'Low usage'], ['custom', 'Custom']]
            .forEach(([value, title]) => { const option = node('option', title); option.value = value; roleInput.append(option); });
          roleInput.value = savedRole?.usageRole || 'balanced';
          const usageLabel = node('label', 'Relative usage');
          const usageInput = node('input'); Object.assign(usageInput, { type: 'range', min: 0.5, max: 1.5, step: 0.05,
            value: Number(savedRole?.relativeUsage ?? 1) });
          usageInput.setAttribute('aria-label', `${player.displayName} relative usage`);
          const usageOutput = node('output', `${Math.round(Number(usageInput.value) * 100)}% of baseline`);
          const updateUsageOutput = () => { usageOutput.value = `${Math.round(Number(usageInput.value) * 100)}% of baseline`; usageOutput.textContent = usageOutput.value; };
          usageInput.addEventListener('input', updateUsageOutput);
          [minutesInput, roleInput, usageInput].forEach(input => input.addEventListener('input', () => { franchiseRotationEdited = true; }));
          roleInput.addEventListener('change', () => { franchiseRotationEdited = true; });
          minutesLabel.append(minutesInput); utilizationLabel.append(roleInput); usageLabel.append(usageOutput, usageInput);
          playerControls.append(minutesLabel, utilizationLabel, usageLabel); franchiseRotationEditor.append(playerControls);
          franchiseRotationInputs.push({ playerRef: player.playerRef, minutesInput, roleInput, usageInput });
        });
      } else franchiseRotationEditor.append(node('p', 'At least five active players are required to set a rotation. Pace and emphasis controls can still be saved.', 'studio-muted'));
    }
    const rosterPlayers = franchiseAction.input.value === 'sign'
      ? (franchiseState.freeAgents || []).map(player => ({ ...player, teamId: 'Free agent' }))
      : userTeam.roster.filter(player => player.status === 'active').map(player => ({ ...player, teamId: userTeam.teamId }));
    franchisePlayer.input.replaceChildren(...rosterPlayers.map(player => node('option', `${player.displayName} · ${player.teamId}`)).map((option, index) => { option.value = rosterPlayers[index].playerRef; return option; }));
    const destinationTeams = franchiseAction.input.value === 'trade'
      ? franchiseState.teams.filter(team => team.teamId !== userTeam.teamId)
      : franchiseState.teams.filter(team => team.teamId === userTeam.teamId);
    franchiseDestination.input.replaceChildren(...destinationTeams.map(team => { const option = node('option', team.displayName); option.value = team.teamId; return option; }));
    franchiseDestination.label.hidden = franchiseAction.input.value !== 'trade' && franchiseAction.input.value !== 'sign';
    franchiseTransaction.disabled = franchiseBusy || seasonComplete || !rosterPlayers.length || !destinationTeams.length;
    const latest = franchiseState.lastResult;
    const scheduleSource = franchiseState.source?.schedule || {};
    const coverage = scheduleSource.coverage || {};
    const scheduleReceipt = scheduleSource.receipt?.id ? ` · receipt ${scheduleSource.receipt.id}` : '';
    const scheduleLabel = scheduleSource.kind === 'actual' ? 'reviewed exact calendar' : 'generated scenario calendar';
    const summary = node('section', undefined, 'season-result-header franchise-result-summary');
    summary.append(
      node('span', 'Franchise result', 'studio-eyebrow'),
      node('h3', `Season ${franchiseState.currentSeason} · ${franchiseState.calendar.status}`),
      node('p', `${franchiseState.teams.length} teams · ${franchiseState.settings.gamesPerTeam} games per team · ${scheduleLabel} · seed ${franchiseState.seed}.`, 'studio-muted'),
      node('p', 'Season outcomes are simulated; native net ratings remain published team evidence.', 'season-result-header__note'),
    );
    franchiseResults.replaceChildren(summary);
    franchiseResults.append(seasonResultDetails('Schedule receipt and league settings', node('p',
      `${franchiseState.settings.seriesLength || 7}-game playoff series · ${coverage.minGamesPerTeam ?? '—'}–${coverage.maxGamesPerTeam ?? '—'} scheduled appearances${scheduleReceipt || ' · receipt unavailable'}.`,
      'studio-muted')));
    franchiseResults.append(renderFranchiseCalendar());
    const latestFranchiseGame = franchiseState.calendar?.lastGame || franchiseState.gameLogs?.at(-1) || null;
    const latestGameWithMinutes = latestFranchiseGame?.minutesReconciliation ? latestFranchiseGame : null;
    if (latestGameWithMinutes) {
      const reconciliation = latestGameWithMinutes.minutesReconciliation;
      const receiptNumber = value => value == null || value === '' || !Number.isFinite(Number(value)) ? null : Number(value);
      const overtimePeriodsValue = receiptNumber(reconciliation.overtimePeriods);
      const overtimePeriods = Number.isInteger(overtimePeriodsValue) && overtimePeriodsValue >= 0 ? overtimePeriodsValue : null;
      const overtimeMinutesPerPeriod = receiptNumber(reconciliation.overtimeTeamMinutesPerPeriod);
      const overtimePlayerMinuteCap = receiptNumber(reconciliation.overtimePlayerMinuteCapPerPeriod);
      const regulationTeamMinutes = receiptNumber(reconciliation.regulationTeamMinutes);
      const regulationPlayerMinuteCap = receiptNumber(reconciliation.regulationPlayerMinuteCap);
      const expectedTeamMinutes = receiptNumber(reconciliation.expectedTeamMinutes);
      const regulationContext = regulationTeamMinutes === null || regulationPlayerMinuteCap === null
        ? 'The saved receipt is missing regulation totals or player caps.'
        : `Regulation uses ${regulationTeamMinutes} team player-minutes with a ${regulationPlayerMinuteCap}-minute cap per player.`;
      const overtimeRule = overtimeMinutesPerPeriod === null || overtimePlayerMinuteCap === null
        ? 'The saved receipt is missing overtime totals or player caps.'
        : `Each overtime adds ${overtimeMinutesPerPeriod} team player-minutes, with a ${overtimePlayerMinuteCap}-minute per-player cap in that period.`;
      const maxPlayerRule = regulationPlayerMinuteCap === null || overtimePlayerMinuteCap === null
        ? 'The saved receipt does not contain the caps needed to explain a maximum player total.'
        : `A player can reach ${regulationPlayerMinuteCap + 3 * overtimePlayerMinuteCap} total minutes only after three overtimes (${regulationPlayerMinuteCap} regulation + ${3 * overtimePlayerMinuteCap} overtime).`;
      const overtimeContext = overtimePeriods === null
        ? 'The saved receipt does not report how many overtime periods were played.'
        : overtimePeriods === 0
          ? 'This game had no overtime, so player totals are regulation minutes only.'
          : `This game played ${overtimePeriods} ${overtimePeriods === 1 ? 'overtime period' : 'overtime periods'}.`;
      const minuteRows = ['home', 'away'].map(side => {
        const teamId = side === 'home' ? latestGameWithMinutes.homeTeamId : latestGameWithMinutes.awayTeamId;
        const teamName = franchiseState.teams.find(team => team.teamId === teamId)?.displayName || teamId || side;
        const teamMinutes = reconciliation.teams?.[side] || {};
        const overtimeByPeriod = Array.isArray(teamMinutes.overtimeByPeriod) ? teamMinutes.overtimeByPeriod : [];
        const regulation = receiptNumber(teamMinutes.regulation);
        const overtime = receiptNumber(teamMinutes.overtime);
        const total = receiptNumber(teamMinutes.total);
        const expectedText = expectedTeamMinutes === null ? '—' : expectedTeamMinutes;
        const periodCountText = overtimePeriods === null ? 'Unavailable'
          : `${overtimePeriods} ${overtimePeriods === 1 ? 'period' : 'periods'}`;
        const overtimeByPeriodText = overtimePeriods === null ? 'Unavailable'
          : overtimePeriods === 0 ? '0 min'
            : overtimeByPeriod.length === overtimePeriods ? `${overtimeByPeriod.join(' + ')} min` : 'Unavailable';
        const playerLines = Array.isArray(latestGameWithMinutes.boxScores?.[teamId])
          ? latestGameWithMinutes.boxScores[teamId] : [];
        const highestPlayer = [...playerLines].sort((left, right) => Number(right.minutes || 0) - Number(left.minutes || 0))[0];
        const highestPlayerText = highestPlayer
          ? `${highestPlayer.displayName || highestPlayer.playerRef} — ${highestPlayer.minutes} min (${highestPlayer.regulationMinutes} regulation + ${highestPlayer.overtimeMinutes} overtime)`
          : 'Player detail unavailable';
        const receiptComplete = overtimePeriods !== null && overtimeMinutesPerPeriod !== null
          && overtimePlayerMinuteCap !== null && regulationTeamMinutes !== null
          && regulationPlayerMinuteCap !== null && expectedTeamMinutes !== null
          && regulation !== null && overtime !== null && total !== null
          && overtimeByPeriod.length === overtimePeriods;
        const status = !receiptComplete ? 'Incomplete receipt' : teamMinutes.status === 'reconciled' ? 'Reconciled'
          : teamMinutes.status === 'mismatch' ? 'Needs review' : 'Unavailable';
        return [teamName, periodCountText, `${regulation ?? '—'} min`, overtimeByPeriodText, `${overtime ?? '—'} min`,
          `${total ?? '—'} / ${expectedText} min`, highestPlayerText, status];
      });
      const minuteSummary = node('section', undefined, 'studio-panel franchise-minute-reconciliation');
      minuteSummary.append(
        node('h4', 'Latest game minute reconciliation'),
        node('p', `${regulationContext} ${overtimeRule} ${maxPlayerRule} ${overtimeContext}`, 'studio-muted'),
        table('Latest game minute reconciliation', ['Team', 'Overtime periods', 'Regulation team minutes', 'Overtime by period', 'Overtime team minutes', 'Total / expected', 'Highest player total', 'Status'], minuteRows),
      );
      franchiseResults.append(minuteSummary);
    } else if (latestFranchiseGame) {
      const unavailable = node('section', undefined, 'studio-panel franchise-minute-reconciliation');
      unavailable.append(node('h4', 'Latest game minute reconciliation'),
        node('p', 'Minute detail is unavailable for the latest saved game because it has no retained reconciliation receipt.', 'studio-muted'));
      franchiseResults.append(unavailable);
    }
    if (latest?.championId) {
      const playoffMode = latest.playoffStructure === 'conference-aware' ? 'East/West bracket' : 'generic bracket';
      franchiseResults.append(node('p', `Champion: ${franchiseState.teams.find(team => team.teamId === latest.championId)?.displayName || latest.championId} · ${playoffMode}.`, 'studio-franchise-champion'));
    } else if (latest && franchiseState.standings?.length) {
      const leader = franchiseState.standings[0];
      franchiseResults.append(node('p', `Season leader: ${leader.displayName} · simulated ${leader.wins}–${leader.losses} · ${percent(leader.winRate)} win rate.`, 'studio-franchise-champion'));
    }
    if (franchiseState.standings?.length) {
      const standings = table('Franchise standings', ['Seed', 'Team', 'Conference', 'Division', 'Sim W–L', 'Sim win rate', 'Sim point differential', 'Sim O / D / net / 100', 'Native net / 100'], franchiseState.standings.map(row => {
        const team = franchiseState.teams.find(item => item.teamId === row.teamId);
        const strength = team?.strength;
        return [row.seed, row.displayName, row.conference || 'Unmapped', row.division || 'Unmapped', `${row.wins}–${row.losses}`, percent(row.winRate), row.pointDifferential > 0 ? `+${row.pointDifferential}` : row.pointDifferential, strength ? `${pretty(strength.offense)} / ${pretty(strength.defense)} / ${pretty(strength.net)}` : 'Unavailable', pretty(strength?.nativeNet)];
      }));
      franchiseResults.append(seasonResultDetails(`Standings · ${franchiseState.standings.length} teams`, standings));
    }
    const leaderRows = Object.entries(franchiseState.leaders || {}).slice(0, 6).map(([key, rows]) => [key, rows?.[0]?.displayName || 'Unavailable', rows?.[0]?.teamId || '—', rows?.[0]?.[key] ?? '—']);
    if (leaderRows.length) franchiseResults.append(seasonResultDetails(`Season leaders · ${leaderRows.length} categories`, table('Season leaders', ['Stat', 'Player', 'Team', 'Total'], leaderRows)));
    if (franchiseState.history?.length) franchiseResults.append(seasonResultDetails(`Recent league history · ${Math.min(8, franchiseState.history.length)} seasons`, table('League history', ['Season', 'Champion', 'Games'], franchiseState.history.slice(-8).reverse().map(item => [item.seasonStartYear, franchiseState.teams.find(team => team.teamId === item.championId)?.displayName || item.championId || 'Unavailable', item.games || '—']))));
    renderFranchiseRosterAudit();
  }

  function renderFranchiseCalendar() {
    const section = node('section', undefined, 'studio-panel franchise-calendar');
    section.append(node('h4', 'Interactive season calendar'));
    const schedule = Array.isArray(franchiseState?.schedule) ? franchiseState.schedule : [];
    const gamesById = new Map((franchiseState?.gameLogs || [])
      .filter(game => game?.scheduleGameId)
      .map(game => [game.scheduleGameId, game]));
    const entries = schedule.map((game, index) => ({
      game,
      index,
      result: gamesById.get(game.scheduleGameId) || null,
      dateKey: game.scheduledAt && Number.isFinite(Date.parse(game.scheduledAt))
        ? new Date(game.scheduledAt).toISOString().slice(0, 10) : '',
    }));
    const datedEntries = entries.filter(entry => entry.dateKey);
    const monthKeys = [...new Set(datedEntries.map(entry => entry.dateKey.slice(0, 7)))].sort();
    let selected = entries.find(entry => entry.game.scheduleGameId === franchiseSelectedScheduleGameId);
    if (!selected) selected = [...entries].reverse().find(entry => entry.result) || entries.find(entry => !entry.result) || null;
    if (selected) franchiseSelectedScheduleGameId = selected.game.scheduleGameId;

    if (!monthKeys.length) {
      section.append(node('p', 'This schedule has no verified game dates, so a calendar month cannot be inferred. Select a matchup in schedule order instead.', 'studio-muted'));
      const gamePicker = choice('Scheduled matchup', 'franchiseUndatedGame', entries.map(entry => {
        const game = entry.game;
        const home = franchiseState.teams.find(team => team.teamId === game.homeTeamId)?.displayName || game.homeTeamId;
        const away = franchiseState.teams.find(team => team.teamId === game.awayTeamId)?.displayName || game.awayTeamId;
        return [game.scheduleGameId, `Round ${game.round} · ${away} at ${home}${entry.result ? ` · ${entry.result.homeScore}–${entry.result.awayScore}` : ' · not played'}`];
      }));
      if (selected) gamePicker.input.value = selected.game.scheduleGameId;
      gamePicker.input.addEventListener('change', () => {
        franchiseSelectedScheduleGameId = gamePicker.input.value;
        renderFranchise();
      });
      section.append(gamePicker.label);
      appendFranchiseGameDetail(section, selected, entries);
      return section;
    }

    if (!monthKeys.includes(franchiseCalendarMonth)) {
      const selectedMonth = selected?.dateKey.slice(0, 7);
      franchiseCalendarMonth = monthKeys.includes(selectedMonth) ? selectedMonth : monthKeys[0];
    }
    const monthIndex = monthKeys.indexOf(franchiseCalendarMonth);
    const firstMonthEntry = datedEntries.find(entry => entry.dateKey.slice(0, 7) === franchiseCalendarMonth);
    if (!franchiseCalendarDate || franchiseCalendarDate.slice(0, 7) !== franchiseCalendarMonth) {
      franchiseCalendarDate = selected?.dateKey.slice(0, 7) === franchiseCalendarMonth
        ? selected.dateKey : firstMonthEntry.dateKey;
    }
    const monthGames = datedEntries.filter(entry => entry.dateKey.slice(0, 7) === franchiseCalendarMonth);
    const daysWithGames = new Map();
    monthGames.forEach(entry => {
      if (!daysWithGames.has(entry.dateKey)) daysWithGames.set(entry.dateKey, []);
      daysWithGames.get(entry.dateKey).push(entry);
    });
    if (!daysWithGames.has(franchiseCalendarDate)) {
      franchiseCalendarDate = monthGames[0]?.dateKey || firstMonthEntry.dateKey;
    }
    const toolbar = node('div', undefined, 'studio-team-form franchise-calendar__toolbar');
    const previousMonth = node('button', 'Previous month', 'button-secondary'); previousMonth.type = 'button';
    previousMonth.disabled = monthIndex <= 0;
    const monthHeading = node('strong', new Date(`${franchiseCalendarMonth}-01T00:00:00Z`).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }));
    const nextMonth = node('button', 'Next month', 'button-secondary'); nextMonth.type = 'button';
    nextMonth.disabled = monthIndex >= monthKeys.length - 1;
    const selectMonth = month => {
      franchiseCalendarMonth = month;
      const firstEntry = datedEntries.find(entry => entry.dateKey.slice(0, 7) === month);
      franchiseCalendarDate = firstEntry?.dateKey || `${month}-01`;
      if (firstEntry) franchiseSelectedScheduleGameId = firstEntry.game.scheduleGameId;
      renderFranchise();
    };
    previousMonth.addEventListener('click', () => { if (monthIndex > 0) selectMonth(monthKeys[monthIndex - 1]); });
    nextMonth.addEventListener('click', () => { if (monthIndex < monthKeys.length - 1) selectMonth(monthKeys[monthIndex + 1]); });
    toolbar.append(previousMonth, monthHeading, nextMonth);
    section.append(toolbar);

    const grid = node('div', undefined, 'franchise-calendar__grid');
    grid.setAttribute('role', 'grid');
    grid.style.display = 'grid';
    grid.style.gridTemplateColumns = 'repeat(7, minmax(0, 1fr))';
    grid.style.gap = '.3rem';
    ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].forEach(label => {
      const heading = node('span', label, 'studio-muted'); heading.setAttribute('role', 'columnheader'); grid.append(heading);
    });
    const [year, month] = franchiseCalendarMonth.split('-').map(Number);
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const offset = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
    for (let index = 0; index < offset; index += 1) {
      const blank = node('span'); blank.setAttribute('aria-hidden', 'true'); grid.append(blank);
    }
    for (let day = 1; day <= daysInMonth; day += 1) {
      const dateKey = `${franchiseCalendarMonth}-${String(day).padStart(2, '0')}`;
      const dayGames = daysWithGames.get(dateKey) || [];
      const dateButton = node('button', undefined, 'button-secondary franchise-calendar__day');
      dateButton.type = 'button'; dateButton.disabled = dayGames.length === 0;
      dateButton.setAttribute('role', 'gridcell');
      dateButton.setAttribute('aria-label', `${dateKey}, ${dayGames.length} scheduled ${dayGames.length === 1 ? 'game' : 'games'}`);
      dateButton.setAttribute('aria-pressed', String(franchiseCalendarDate === dateKey));
      dateButton.append(node('span', String(day)));
      if (dayGames.length) dateButton.append(node('small', `${dayGames.length} ${dayGames.length === 1 ? 'game' : 'games'}`));
      dateButton.addEventListener('click', () => {
        franchiseCalendarDate = dateKey;
        franchiseSelectedScheduleGameId = dayGames[0].game.scheduleGameId;
        renderFranchise();
      });
      grid.append(dateButton);
    }
    section.append(grid);
    if (entries.some(entry => !entry.dateKey)) {
      section.append(node('p', `${entries.filter(entry => !entry.dateKey).length} scheduled matchups have no source date and are omitted from the calendar.`, 'studio-muted'));
    }
    const selectedDateGames = daysWithGames.get(franchiseCalendarDate) || [];
    const gameList = node('div', undefined, 'franchise-calendar__games');
    gameList.append(node('h5', new Date(`${franchiseCalendarDate}T00:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })));
    selectedDateGames.forEach(entry => {
      const game = entry.game, result = entry.result;
      const home = franchiseState.teams.find(team => team.teamId === game.homeTeamId)?.displayName || game.homeTeamId;
      const away = franchiseState.teams.find(team => team.teamId === game.awayTeamId)?.displayName || game.awayTeamId;
      const label = result
        ? `${away} at ${home} · ${result.awayScore}–${result.homeScore} · Final`
        : `${away} at ${home} · Scheduled`;
      const gameButton = node('button', label, 'button-secondary franchise-calendar__game');
      gameButton.type = 'button'; gameButton.setAttribute('aria-pressed', String(franchiseSelectedScheduleGameId === game.scheduleGameId));
      gameButton.addEventListener('click', () => {
        franchiseSelectedScheduleGameId = game.scheduleGameId;
        renderFranchise();
      });
      gameList.append(gameButton);
    });
    section.append(gameList);
    selected = entries.find(entry => entry.game.scheduleGameId === franchiseSelectedScheduleGameId) || selectedDateGames[0] || null;
    appendFranchiseGameDetail(section, selected, entries);
    return section;
  }

  function appendFranchiseGameDetail(section, selected, entries) {
    const detail = node('section', undefined, 'franchise-calendar__detail');
    if (!selected) {
      detail.append(node('p', 'No scheduled games are available for this season.', 'studio-muted'));
      section.append(detail);
      return;
    }
    const game = selected.game;
    const result = selected.result;
    const home = franchiseState.teams.find(team => team.teamId === game.homeTeamId)?.displayName || game.homeTeamId;
    const away = franchiseState.teams.find(team => team.teamId === game.awayTeamId)?.displayName || game.awayTeamId;
    detail.append(node('h5', `Game detail · ${away} at ${home}`));
    detail.append(node('p', result
      ? `${result.awayScore}–${result.homeScore} · ${result.winner === game.homeTeamId ? home : away} win${result.scheduledAt ? ` · ${new Date(result.scheduledAt).toLocaleDateString('en-US', { timeZone: 'UTC' })}` : ''}`
      : `Scheduled · Round ${game.round}${game.scheduledAt ? ` · ${new Date(game.scheduledAt).toLocaleDateString('en-US', { timeZone: 'UTC' })}` : ''}. Games advance in schedule order.`));
    const nextGame = entries[Number(franchiseState.calendar?.gameIndex || 0)];
    if (!result && nextGame?.game.scheduleGameId === game.scheduleGameId && !franchiseBusy) {
      const playGame = node('button', 'Play this game', 'button'); playGame.type = 'button';
      playGame.addEventListener('click', () => {
        franchiseWindowSize.input.value = '1'; updateFranchisePlayWindowLabel(); franchisePlayWindow.click();
      });
      detail.append(playGame);
    }
    if (!result) {
      detail.append(node('p', 'The box score will be available after this game is simulated.', 'studio-muted'));
      section.append(detail);
      return;
    }
    const scoreRows = teamId => (result.boxScores?.[teamId] || []).map(line => [
      line.displayName || line.playerRef, line.minutes ?? '—', line.points ?? '—', line.rebounds ?? '—',
      line.assists ?? '—', line.steals ?? '—', line.blocks ?? '—', line.turnovers ?? '—',
      readableLabel(line.usageRole, 'Balanced'), `${Math.round(Number(line.relativeUsage ?? 1) * 100)}%`,
    ]);
    const boxHeaders = ['Player', 'MIN', 'PTS', 'REB', 'AST', 'STL', 'BLK', 'TO', 'Role', 'Usage'];
    const homeLines = scoreRows(game.homeTeamId), awayLines = scoreRows(game.awayTeamId);
    if (!homeLines.length || !awayLines.length) {
      detail.append(node('p', 'This saved game retains its final score, but its individual box-score lines are unavailable in the compact local league save.', 'studio-muted'));
    } else {
      detail.append(table(`${home} box score`, boxHeaders, homeLines), table(`${away} box score`, boxHeaders, awayLines));
    }
    section.append(detail);
  }

  function renderFranchiseRosterAudit() {
    if (!franchiseState) return;
    const section = node('section', undefined, 'studio-panel franchise-roster-audit');
    section.append(node('h4', 'Current roster and season ledger'), node('p', 'Browse every team’s current active roster and a player’s simulated production, package-derived traits, sourced age/potential, and contract fields. The season-point control changes the displayed totals; past roster membership is not retained by this local save. Missing facts remain unavailable.', 'studio-muted'));
    const teams = franchiseState.teams || [];
    if (!teams.length) { section.append(node('p', 'No team roster is available.', 'studio-muted')); franchiseResults.append(section); return; }
    const teamPicker = choice('Team roster', 'franchiseRosterTeam', teams.map(team => [team.teamId, team.displayName]));
    if (!teams.some(team => team.teamId === franchiseRosterTeamId)) franchiseRosterTeamId = teams[0].teamId;
    teamPicker.input.value = franchiseRosterTeamId;
    const team = teams.find(item => item.teamId === franchiseRosterTeamId) || teams[0];
    const activePlayers = (team.roster || []).filter(player => player.status === 'active');
    const playerPicker = choice('Player', 'franchiseRosterPlayer', activePlayers.map(player => [player.playerRef, player.displayName]));
    if (!activePlayers.some(player => player.playerRef === franchiseRosterPlayerRef)) franchiseRosterPlayerRef = activePlayers[0]?.playerRef || '';
    playerPicker.input.value = franchiseRosterPlayerRef;

    const detailedGames = franchiseState.gameLogs || [];
    const regularGames = detailedGames.filter(game => game.phase === 'regular');
    const playedGames = Number(franchiseState.calendar?.gameIndex || 0);
    const hasDetailedLogs = regularGames.length === playedGames && detailedGames.every(game =>
      game.boxScores && Number.isFinite(Number(game.homeScore)) && Number.isFinite(Number(game.awayScore)));
    const retainedCounts = hasDetailedLogs
      ? Array.from({ length: detailedGames.length + 1 }, (_, index) => index)
      : [0, playedGames];
    const checkpointCounts = franchiseBusy
      ? [...retainedCounts, ...franchiseCheckpoints.map(item => item.completedGameIndex).filter(Number.isSafeInteger)]
      : retainedCounts;
    const counts = [...new Set(checkpointCounts)].sort((left, right) => left - right);
    const selectedCount = counts.reduce((best, value) => value <= franchiseAsOfGameCount ? value : best, counts[0] || 0);
    franchiseAsOfGameCount = selectedCount;
    const pointLabel = node('label', undefined, 'studio-range-control');
    const pointHeading = node('span', 'Season point', 'studio-range-control__label');
    const pointOutput = node('output', '', 'studio-range-control__value');
    const point = node('input');
    Object.assign(point, { type: 'range', min: 0, max: Math.max(0, counts.length - 1), step: 1, value: Math.max(0, counts.indexOf(selectedCount)) });
    point.setAttribute('aria-label', 'Season point');
    const describePoint = count => {
      const game = franchiseCheckpoints.find(item => item.completedGameIndex === count)?.lastGame
        || (hasDetailedLogs ? detailedGames[count - 1] : count === playedGames ? franchiseState.calendar?.lastGame : null);
      const gameDate = game?.scheduledAt && Number.isFinite(Date.parse(game.scheduledAt))
        ? new Date(game.scheduledAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' })
        : null;
      return count === 0 ? 'Before first simulated game'
        : `After ${count} league games${count > playedGames ? ' · includes playoffs' : ''}${gameDate ? ` · ${gameDate}` : ''}`;
    };
    const updatePointLabel = () => {
      franchiseAsOfGameCount = counts[Number(point.value)] ?? 0;
      pointOutput.value = describePoint(franchiseAsOfGameCount); pointOutput.textContent = pointOutput.value;
      point.setAttribute('aria-valuetext', pointOutput.value);
    };
    updatePointLabel(); pointLabel.append(pointHeading, pointOutput, point);
    const controls = node('div', undefined, 'studio-roadmap'); controls.append(teamPicker.label, playerPicker.label, pointLabel); section.append(controls);
    teamPicker.input.addEventListener('change', () => { franchiseRosterTeamId = teamPicker.input.value; franchiseRosterPlayerRef = ''; renderFranchise(); });
    playerPicker.input.addEventListener('change', () => { franchiseRosterPlayerRef = playerPicker.input.value; renderFranchise(); });
    point.addEventListener('input', () => { updatePointLabel(); renderFranchise(); });

    const player = activePlayers.find(item => item.playerRef === franchiseRosterPlayerRef) || null;
    let teamSnapshot = null, playerSnapshot = null;
    const checkpoint = franchiseCheckpoints.find(item => item.completedGameIndex === selectedCount);
    if (checkpoint) {
      teamSnapshot = checkpoint?.teams.find(item => item.teamId === team.teamId) || null;
      playerSnapshot = teamSnapshot?.players.find(item => item.playerRef === player?.playerRef) || null;
    } else if (!hasDetailedLogs && selectedCount === playedGames && playedGames > 0) {
      const playoffRecord = franchiseState.calendar.status === 'complete' ? team.postseasonRecord || {} : {};
      teamSnapshot = { teamId: team.teamId, displayName: team.displayName,
        record: {
          wins: Number(team.record?.wins || 0) + Number(playoffRecord.wins || 0),
          losses: Number(team.record?.losses || 0) + Number(playoffRecord.losses || 0),
          pointsFor: Number(team.record?.pointsFor || 0) + Number(playoffRecord.pointsFor || 0),
          pointsAgainst: Number(team.record?.pointsAgainst || 0) + Number(playoffRecord.pointsAgainst || 0),
        }, teamStats: { ...team.teamStats } };
      const ledgerStats = player ? team.playerLedger?.[player.playerRef] : null;
      playerSnapshot = ledgerStats ? { playerRef: player.playerRef, displayName: player.displayName, seasonStats: ledgerStats } : null;
    } else if (hasDetailedLogs) {
      const gamesToDate = detailedGames.slice(0, selectedCount);
      const teamGames = gamesToDate.filter(game => game.homeTeamId === team.teamId || game.awayTeamId === team.teamId);
      const wins = teamGames.filter(game => game.winner === team.teamId).length;
      const pointsFor = teamGames.reduce((sum, game) => sum + (game.homeTeamId === team.teamId ? game.homeScore : game.awayScore), 0);
      const pointsAgainst = teamGames.reduce((sum, game) => sum + (game.homeTeamId === team.teamId ? game.awayScore : game.homeScore), 0);
      const statKeys = ['games', 'minutes', 'points', 'assists', 'rebounds', 'turnovers', 'steals', 'blocks'];
      const teamStats = Object.fromEntries(statKeys.map(key => [key, key === 'games' ? teamGames.length : 0]));
      gamesToDate.forEach(game => (game.boxScores?.[team.teamId] || []).forEach(line => statKeys.filter(key => key !== 'games').forEach(key => { teamStats[key] += Number(line[key]) || 0; })));
      teamSnapshot = { teamId: team.teamId, displayName: team.displayName,
        record: { wins, losses: teamGames.length - wins, pointsFor, pointsAgainst }, teamStats };
      const playerLines = gamesToDate.flatMap(game => game.boxScores?.[team.teamId] || []).filter(line => line.playerRef === player?.playerRef);
      const seasonStats = Object.fromEntries(statKeys.map(key => [key, key === 'games'
        ? playerLines.length
        : playerLines.reduce((sum, line) => sum + (Number(line[key]) || 0), 0)]));
      playerSnapshot = player ? { playerRef: player.playerRef, displayName: player.displayName, seasonStats } : null;
    }
    if (!teamSnapshot && selectedCount === 0) {
      const statKeys = ['games', 'minutes', 'points', 'assists', 'rebounds', 'turnovers', 'steals', 'blocks'];
      teamSnapshot = { teamId: team.teamId, displayName: team.displayName,
        record: { wins: 0, losses: 0, pointsFor: 0, pointsAgainst: 0 }, teamStats: Object.fromEntries(statKeys.map(key => [key, 0])) };
      playerSnapshot = player ? { playerRef: player.playerRef, displayName: player.displayName,
        seasonStats: Object.fromEntries(statKeys.map(key => [key, 0])) } : null;
    }
    section.append(seasonResultDetails(`Active roster · ${team.displayName} · ${activePlayers.length} players`, table('Active roster', ['Player', 'Position', 'Age', 'Experience', 'Potential', 'Salary', 'Status'], activePlayers.map(item => [
      item.displayName, (item.positions || [item.position]).join('/'), item.age == null ? 'Unavailable' : `${item.age} · ${item.ageSource || 'source unavailable'}`,
      item.experience == null ? 'Unavailable' : item.experience,
      item.potential == null ? 'Unavailable' : `${item.potential} · ${item.potentialSource || 'source unavailable'}`,
      item.contract?.salary == null ? 'Unavailable' : `$${Number(item.contract.salary).toLocaleString('en-US')} · ${item.contract.source || 'source unavailable'}`,
      item.status || 'Unavailable',
    ]))));
    const record = teamSnapshot?.record || {};
    const stats = playerSnapshot?.seasonStats || {};
    const displayedStat = key => stats[key] ?? (selectedCount === 0 ? 0 : 'Unavailable');
    const sumPlayerMinutes = (players, readMinutes = item => item?.seasonStats?.minutes) => {
      if (!Array.isArray(players) || !players.length) return null;
      let total = 0;
      for (const item of players) {
        const minutes = readMinutes(item);
        if (typeof minutes !== 'number' || !Number.isFinite(minutes)) return null;
        total += minutes;
      }
      return total;
    };
    const latestCompleteLedger = !hasDetailedLogs && selectedCount === playedGames && playedGames > 0
      && team.playerLedgerCoverage === 'complete'
      ? Object.values(team.playerLedger || {})
      : null;
    const teamMinutes = Number.isFinite(teamSnapshot?.teamStats?.minutes)
      ? teamSnapshot.teamStats.minutes
      : sumPlayerMinutes(teamSnapshot?.players)
        ?? sumPlayerMinutes(latestCompleteLedger, item => item?.minutes)
        ?? 'Unavailable';
    const totalsScope = !hasDetailedLogs && selectedCount === playedGames && franchiseState.calendar.status === 'complete'
      ? 'All simulated games including playoffs'
      : selectedCount > playedGames ? 'Regular season and playoffs to selected point' : 'Regular season to selected point';
    section.append(table(`Team and player totals · ${totalsScope}`, ['Scope', 'W–L / stat', 'Points', 'Simulated total minutes', 'Assists', 'Rebounds', 'Turnovers', 'Steals', 'Blocks'], [
      [team.displayName, `${record.wins ?? 'Unavailable'}–${record.losses ?? 'Unavailable'}`, `${record.pointsFor ?? 'Unavailable'} for · ${record.pointsAgainst ?? 'Unavailable'} against`, teamMinutes, teamSnapshot?.teamStats?.assists ?? 'Unavailable', teamSnapshot?.teamStats?.rebounds ?? 'Unavailable', teamSnapshot?.teamStats?.turnovers ?? 'Unavailable', teamSnapshot?.teamStats?.steals ?? 'Unavailable', teamSnapshot?.teamStats?.blocks ?? 'Unavailable'],
      [player?.displayName || 'No active player selected', `${displayedStat('games')} games`, displayedStat('points'), displayedStat('minutes'), displayedStat('assists'), displayedStat('rebounds'), displayedStat('turnovers'), displayedStat('steals'), displayedStat('blocks')],
    ]));
    if (player) {
      const baseline = player.baselinePerGame || {};
      const baselineRows = ['points', 'assists', 'rebounds', 'turnovers', 'steals', 'blocks'].map(key => [readableLabel(key), baseline[key] ?? 'Unavailable']);
      const detail = node('div');
      detail.append(node('p', `${player.displayName} · ${player.age == null ? 'age unavailable' : `age ${player.age}`} · ${player.experience == null ? 'experience unavailable' : `${player.experience} years’ experience`}.`));
      detail.append(table('Package-observed baseline per game', ['Stat', 'Package value'], baselineRows));
      detail.append(table('Model-derived traits', ['Trait', 'Value', 'Source label'], Object.entries(player.ratings || {}).map(([key, value]) => [readableLabel(key), value ?? 'Unavailable', 'Derived from the selected season row; not an official rating'])));
      detail.append(node('p', player.contract?.salary == null
        ? 'Contract terms and salary are unavailable in this public package; no actual salary is inferred.'
        : `Sourced/declared contract salary: $${Number(player.contract.salary).toLocaleString('en-US')} · ${player.contract.source || 'source unavailable'}.`, 'studio-muted'));
      section.append(seasonResultDetails(`Selected player · ${player.displayName}`, detail));
    }
    section.append(node('p', hasDetailedLogs
      ? 'This open session retains regular-season game detail. After a compact local reload, only season-to-date totals and the latest game remain; earlier per-game box scores are unavailable. Traits and observed baselines stay separate from simulated totals.'
      : 'This compact local state retains current season totals and the latest game, but earlier per-game box scores are unavailable. Traits and observed baselines stay separate from simulated totals.', 'studio-muted'));
    franchiseResults.append(section);
  }

  function saveFranchiseAndVerify(state) {
    const storage = globalThis.localStorage;
    if (typeof storage?.getItem !== 'function') throw new Error('Local Franchise League storage cannot verify its saved value.');
    const serialized = saveFranchiseLeague(state, storage);
    if (storage.getItem(FRANCHISE_STORAGE_KEY) !== serialized) throw new Error('The saved league could not be verified after writing.');
    return serialized;
  }

  function selectedFranchiseSource() {
    if (!source) throw new Error('Load a published exact-season package before starting a franchise league.');
    const years = parseYears(franchiseSeason.input.value);
    if (years.length !== 1) throw new Error('Franchise mode uses one exact season at a time.');
    const selected = selectNativeEvidencePackage(source, 'exact-season', years);
    if (!selected?.payloads?.length || selected.pooled) throw new Error('Franchise mode requires the selected exact-season public package; pooled data cannot substitute for an exact season.');
    return { selected, seasonStartYear: years[0] };
  }

  function exactFranchiseSchedule(seasonStartYear, teamIds) {
    // The reviewed calendar is complete only for the all-30-team league. A
    // reduced franchise is intentionally a generated mini-league scenario;
    // it must not be presented as each club's real NBA record.
    if (teamIds.length !== 30) return null;
    if (!source?.scheduleArtifact) throw new Error('The exact NBA schedule artifact is unavailable; the all-30 Franchise Lab path will not silently generate a replacement calendar.');
    const selected = selectActualNbaSchedule(source.scheduleArtifact, { seasonStartYear, teamIds, phases: ['regular'] });
    if (selected.status !== 'ready') throw new Error(selected.reason || `The exact NBA schedule for ${seasonStartYear} is unavailable.`);
    return {
      games: selected.games,
      gamesPerTeam: selected.gamesPerTeam,
      receipt: {
        id: selected.sourceReceipt?.scheduleId || `nba-actual-${seasonStartYear}`,
        version: source.scheduleSourceReceipt?.version || 'nba-schedule-source-v2',
        contentSha256: source.scheduleSourceReceipt?.contentSha256 || null,
      },
    };
  }

  function nextFranchiseSchedule(seasonStartYear, teamIds) {
    if (teamIds.length !== 30) return null;
    if (source?.scheduleArtifact) {
      const selected = selectActualNbaSchedule(source.scheduleArtifact, { seasonStartYear, teamIds, phases: ['regular'] });
      if (selected.status === 'ready') {
        return {
          games: selected.games,
          gamesPerTeam: selected.gamesPerTeam,
          receipt: {
            id: selected.sourceReceipt?.scheduleId || `nba-actual-${seasonStartYear}`,
            version: source.scheduleSourceReceipt?.version || 'nba-schedule-source-v2',
            contentSha256: source.scheduleSourceReceipt?.contentSha256 || null,
          },
        };
      }
    }
    const scheduleSeed = franchiseState?.seed || franchiseSeed.input.value || 'franchise-schedule';
    const generated = generateFutureNbaSchedule({ seasonStartYear, teamIds, seed: `${scheduleSeed}:${seasonStartYear}` });
    return {
      games: generated.games,
      gamesPerTeam: generated.gamesPerTeam,
      receipt: {
        id: `nba-generated-${seasonStartYear}`,
        version: generated.sourceReceipt?.model || 'nba-schedule-source-v2',
        contentSha256: null,
        kind: 'generated',
      },
      generated: true,
    };
  }

  async function startFranchise() {
    if (franchiseBusy) return;
    const previousState = franchiseState;
    franchiseBusy = true; franchiseStatus.textContent = 'Building the persistent league from public season rows…';
    updateModeButtons();
    try {
      const { selected, seasonStartYear } = selectedFranchiseSource();
      const resolvedSeed = resolveSimulationSeed(franchiseSeed.input.value, 'franchise');
      franchiseSeed.input.value = resolvedSeed.seed;
      const teamIds = selected.payloads.map(payload => payload.team);
      const exactSchedule = exactFranchiseSchedule(seasonStartYear, teamIds);
      const teamNames = Object.fromEntries((source.teams || []).map(team => [team.id, team.name]));
      franchiseState = createFranchiseLeague({
        leagueId: `swishiq-${seasonStartYear}-franchise`, seasonStartYear, teamPayloads: selected.payloads, teamNames,
        userTeamIds: franchiseTeam.input.value ? [franchiseTeam.input.value] : [], seed: resolvedSeed.seed,
        gamesPerTeam: exactSchedule?.gamesPerTeam || Number(franchiseGames.input.value), playoffTeams: teamIds.length >= 16 ? 16 : 0, seriesLength: Number(franchiseSeriesLength.input.value),
        scope: 'exact-season', packageRef: selected.packageRef,
        scheduleGames: exactSchedule?.games || null, scheduleReceipt: exactSchedule?.receipt || null,
      });
      franchiseCheckpoints = []; franchiseAsOfGameCount = 0; franchiseRosterTeamId = ''; franchiseRosterPlayerRef = '';
      const scheduleLabel = franchiseState.source.schedule.kind === 'actual' ? 'reviewed exact NBA calendar' : 'deterministic generated scenario calendar';
      franchiseStatus.textContent = `League ready for ${seasonStartYear}–${String(seasonStartYear + 1).slice(-2)} using the ${scheduleLabel} · ${resolvedSeed.generated ? `new seed ${resolvedSeed.seed}` : `replay seed ${resolvedSeed.seed}`}. Run the regular season when you are ready.`;
      renderFranchise();
    } catch (error) { franchiseState = previousState; renderFranchise(); franchiseStatus.textContent = error instanceof Error ? error.message : 'The franchise league could not be created.'; }
    finally { franchiseBusy = false; renderFranchise(); }
  }

  function cancelFranchise(reason = 'Franchise season cancelled. No partial champion was assigned.') {
    if (!franchiseActive) return false;
    franchiseGeneration += 1;
    franchiseActive.abort();
    franchiseActive = null;
    franchiseBusy = false;
    franchiseCheckpoints = [];
    franchiseStatus.textContent = reason;
    renderFranchise();
    return true;
  }

  franchiseStart.addEventListener('click', () => { void startFranchise(); });
  franchiseCancel.addEventListener('click', () => {
    cancelFranchise('Franchise season cancelled. No partial champion was assigned.');
  });
  async function simulateFranchise({ finishSeason = false, replay = false } = {}) {
    if (!franchiseState || franchiseBusy) return;
    const own = new AbortController();
    const requestGeneration = ++franchiseGeneration;
    franchiseActive = own;
    franchiseBusy = true; franchiseStatus.textContent = 'Simulating the league schedule…'; renderFranchise();
    const regularGamesPlayed = replay ? 0 : Number(franchiseState.calendar?.gameIndex || 0);
    const remainingGames = Math.max(1, (franchiseState.schedule || []).length - Number(franchiseState.calendar?.gameIndex || 0));
    const requestedGames = finishSeason ? remainingGames : Number(franchiseWindowSize.input.value);
    franchiseCheckpoints = []; franchiseAsOfGameCount = regularGamesPlayed;
    try {
      const options = {
        games: requestedGames,
        yieldEvery: finishSeason ? 1 : requestedGames,
        checkpointEvery: finishSeason ? 50 : requestedGames,
        signal: own.signal,
        onProgress: progress => {
          if (requestGeneration === franchiseGeneration && franchiseActive === own) {
            franchiseStatus.textContent = `Simulating the league schedule… ${Math.round(progress * 100)}%`;
          }
        },
        onCheckpoint: snapshot => {
          if (requestGeneration !== franchiseGeneration || franchiseActive !== own) return;
          // A full season can emit many roster-wide snapshots. Keep only the
          // latest while running; the completed game's retained log supports
          // every in-session season point without repeatedly rebuilding DOM.
          franchiseCheckpoints = [snapshot];
        },
      };
      const report = replay ? await simulateFranchiseSeason(franchiseState, options)
        : await simulateFranchiseCheckpoint(franchiseState, options);
      if (requestGeneration !== franchiseGeneration || franchiseActive !== own) return;
      franchiseState = report.state;
      franchiseAsOfGameCount = report.result
        ? (franchiseState.gameLogs || []).length
        : report.checkpoint?.completedGameIndex ?? Number(franchiseState.calendar?.gameIndex || 0);
      let saved = true;
      try { saveFranchiseAndVerify(franchiseState); } catch { saved = false; /* the in-memory result remains available in this view */ }
      const checkpoint = report.checkpoint;
      const completion = report.result
        ? `Season ${franchiseState.currentSeason} complete${report.result.championId ? ` · champion ${franchiseState.teams.find(team => team.teamId === report.result.championId)?.displayName || report.result.championId}` : ''}.`
        : checkpoint ? `Checkpoint ${checkpoint.completedGameIndex} of ${checkpoint.totalGames} league games saved. Adjust the game plan before the next window.`
          : `Season ${franchiseState.currentSeason} is ready to continue.`;
      franchiseStatus.textContent = saved ? completion : `${completion} Local save unavailable.`;
    } catch (error) {
      if (requestGeneration !== franchiseGeneration || franchiseActive !== own) return;
      franchiseStatus.textContent = error?.name === 'AbortError' ? 'Franchise season cancelled before a champion was assigned.' : (error instanceof Error ? error.message : 'The franchise season could not be simulated.');
    }
    finally {
      if (franchiseActive === own) { franchiseActive = null; franchiseBusy = false; renderFranchise(); }
    }
  }
  franchiseRun.addEventListener('click', () => { void simulateFranchise({ finishSeason: true }); });
  franchisePlayWindow.addEventListener('click', () => { void simulateFranchise(); });
  franchiseReplay.addEventListener('click', () => { void simulateFranchise({ finishSeason: true, replay: true }); });
  franchiseOffseason.addEventListener('click', () => {
    if (!franchiseState || franchiseBusy) return;
    try {
      const nextSeason = franchiseState.currentSeason + 1;
      const nextSchedule = nextFranchiseSchedule(nextSeason, franchiseState.teams.map(team => team.teamId));
      const report = advanceFranchiseOffseason(franchiseState, { seed: franchiseState.seed, scheduleGames: nextSchedule?.games || null, scheduleReceipt: nextSchedule?.receipt || null, scheduleKind: nextSchedule?.generated ? 'generated' : 'actual' }); franchiseState = report.state;
      franchiseCheckpoints = []; franchiseAsOfGameCount = 0; franchiseRosterPlayerRef = '';
      const scheduleLabel = franchiseState.source.schedule.kind === 'actual' ? 'reviewed exact calendar' : 'deterministic generated NBA-style calendar';
      const offseasonSummary = `Offseason complete. ${report.receipt.retired.length} retirements, ${report.receipt.draft.length} draft selections, and ${report.receipt.freeAgents} free agents are recorded. Season ${nextSeason} uses a ${scheduleLabel}.`;
      try {
        saveFranchiseAndVerify(franchiseState);
        franchiseStatus.textContent = offseasonSummary;
      } catch (error) {
        const reason = error instanceof Error ? error.message : 'Browser local storage could not save the league.';
        franchiseStatus.textContent = `${offseasonSummary} Local save failed: ${reason}. These changes remain in this session; the save result could not be confirmed.`;
      }
      renderFranchise();
    } catch (error) { franchiseStatus.textContent = error instanceof Error ? error.message : 'The offseason could not be advanced.'; }
  });
  franchiseSave.addEventListener('click', () => {
    if (!franchiseState) return;
    try { saveFranchiseAndVerify(franchiseState); franchiseStatus.textContent = 'Franchise saved locally on this device.'; } catch (error) { franchiseStatus.textContent = error instanceof Error ? error.message : 'The franchise could not be saved locally.'; }
  });
  franchiseLoad.addEventListener('click', () => {
    try { franchiseState = loadFranchiseLeague(); if (!franchiseState) throw new Error('No saved franchise league is available on this device.'); franchiseCheckpoints = []; franchiseAsOfGameCount = Number(franchiseState.calendar?.gameIndex || 0); franchiseRosterPlayerRef = ''; franchiseStatus.textContent = `Loaded season ${franchiseState.currentSeason} from the local franchise ledger.`; renderFranchise(); } catch (error) { franchiseStatus.textContent = error instanceof Error ? error.message : 'The saved franchise could not be loaded.'; }
  });
  franchiseApplyCoaching.addEventListener('click', () => {
    if (!franchiseState || franchiseBusy || franchiseState.calendar.status === 'complete') return;
    try {
      const team = franchiseState.teams.find(item => item.control === 'user');
      if (!team) throw new Error('Choose a user-controlled team before setting a game plan.');
      const rotation = franchiseRotationEdited && franchiseRotationInputs.length >= 5
        ? franchiseRotationInputs.map(({ playerRef, minutesInput, roleInput, usageInput }) => ({
          playerRef, minutes: Number(minutesInput.value), usageRole: roleInput.value, relativeUsage: Number(usageInput.value),
        })) : undefined;
      const result = applyFranchiseCoaching(franchiseState, {
        teamId: team.teamId,
        pace: Number(franchiseCoachingPace.input.value),
        offense: Number(franchiseCoachingOffense.input.value),
        defense: Number(franchiseCoachingDefense.input.value),
        rotation,
      });
      franchiseState = result.state;
      const summary = `Game plan saved for ${team.displayName} after ${result.receipt.afterGame} completed league games. These are declared scenario controls.`;
      try { saveFranchiseAndVerify(franchiseState); franchiseStatus.textContent = summary; }
      catch (error) {
        const reason = error instanceof Error ? error.message : 'Browser local storage could not save the league.';
        franchiseStatus.textContent = `${summary} Local save failed: ${reason}. The game plan remains in this session; the save result could not be confirmed.`;
      }
      renderFranchise();
    } catch (error) { franchiseStatus.textContent = error instanceof Error ? error.message : 'The game plan could not be saved.'; }
  });
  franchiseClear.addEventListener('click', () => {
    if (!franchiseState) return;
    try {
      const storage = globalThis.localStorage;
      if (typeof storage?.removeItem !== 'function' || typeof storage.getItem !== 'function') throw new Error('Local Franchise League storage is unavailable.');
      clearFranchiseLeague(storage);
      if (storage.getItem(FRANCHISE_STORAGE_KEY) !== null) throw new Error('The saved league is still present after the clear request.');
      franchiseState = null;
      franchiseStatus.textContent = 'Saved franchise cleared from this device.';
      renderFranchise();
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Browser local storage could not clear the league.';
      franchiseStatus.textContent = `The saved franchise could not be cleared: ${reason} The active league remains open.`;
    }
  });
  franchiseAction.input.addEventListener('change', renderFranchise);
  franchiseTransaction.addEventListener('click', () => {
    if (!franchiseState || franchiseBusy || franchiseState.calendar.status === 'complete') return;
    try {
      const player = [...franchiseState.teams.flatMap(team => team.roster), ...(franchiseState.freeAgents || [])]
        .find(item => item.playerRef === franchisePlayer.input.value);
      const fromTeamId = player?.teamId || franchiseState.teams.find(team => team.roster.some(item => item.playerRef === franchisePlayer.input.value))?.teamId;
      const result = applyFranchiseTransaction(franchiseState, { type: franchiseAction.input.value, playerRef: franchisePlayer.input.value, fromTeamId, toTeamId: franchiseDestination.input.value });
      franchiseState = result.state;
      const transactionSummary = `${result.receipt.type} recorded for ${player?.displayName || 'the selected player'} as a user-declared roster scenario. NBA transaction eligibility is not verified.`;
      try {
        saveFranchiseAndVerify(franchiseState);
        franchiseStatus.textContent = transactionSummary;
      } catch (error) {
        const reason = error instanceof Error ? error.message : 'Browser local storage could not save the league.';
        franchiseStatus.textContent = `${transactionSummary} Local save failed: ${reason}. This move remains in this session; the save result could not be confirmed.`;
      }
      renderFranchise();
    } catch (error) { franchiseStatus.textContent = error instanceof Error ? error.message : 'The roster action could not be applied.'; }
  });

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (active || !source) return;
    const ids = teamField.dataset.mode === 'all'
      ? source.teams.map(team => team.id)
      : [...teamPicker.input.selectedOptions].map(option => option.value).filter(Boolean);
    const requestedCount = Number(teamCount.input.value) || 0;
    if (ids.length !== requestedCount) {
      status.textContent = `Choose exactly ${requestedCount} teams before running the lab.`;
      return;
    }
    if (new Set(ids).size !== ids.length) {
      status.textContent = 'Choose each team once.';
      return;
    }
    const own = new AbortController(), requestGeneration = ++generation; active = own; pauseGate = createSimulationPauseGate(); currentReport = null; currentPreparedInput = null; busy(true); results.replaceChildren();
    let sessionRunToken = null;
    const setSessionTerminal = (method, message) => {
      const update = sessionHud?.session?.[method];
      if (typeof update !== 'function') return;
      if (sessionRunToken) update.call(sessionHud.session, message, sessionRunToken);
      else update.call(sessionHud.session, message);
    };
    try {
      const resolvedSeed = resolveSimulationSeed(seed.input.value, 'season-lab');
      seed.input.value = resolvedSeed.seed;
      const years = parseYears(season.input.value), firstYear = years[0];
      const nativeSelection = selectNativeEvidencePackage(source, sourceKind.input.value, years);
      const selectedPackage = nativeSelection;
      if (!selectedPackage) throw new Error(`No native SwishIQ package is published for ${firstYear}; the former package path is retired and cannot be used as a fallback.`);
      const pooled = nativeSelection ? nativeSelection.pooled : selectedPackage.entry.seasonStartYears.length > 1;
      if (sourceKind.input.value === 'pooled-window' && !acceptedPool.input.checked) throw new Error('Accept the pooled package before using cross-team or era evidence.');
      let actual = parseJson(actualRecords.input.value, 'Actual records');
      const rosterOverrides = parseJson(rosterJson.input.value, 'Roster JSON'), declared = parseJson(declaredSchedule.input.value, 'Declared schedule');
      let scheduleGames = declared || [];
      let scheduleReceipt = null;
      let actualRecordSourceNote = null;
      if (schedule.input.value === 'actual') {
        if (source.scheduleArtifact) {
          const selectedSchedules = years.map(year => selectActualNbaSchedule(source.scheduleArtifact, { seasonStartYear: year, teamIds: ids, phases: ['regular'] }));
          const unavailable = selectedSchedules.find(item => item.status !== 'ready');
          if (unavailable) throw new Error(unavailable.reason || `The exact NBA schedule for ${unavailable.seasonStartYear} is unavailable.`);
          scheduleGames = selectedSchedules.flatMap(item => item.games);
          if (horizon.input.value === 'game') {
            scheduleGames = limitCalendarToTeamHorizon(scheduleGames, ids, Number(gamesPerTeam.input.value));
            if (!scheduleGames.length) throw new Error('The exact schedule has no observed matchup for this one-game team scope.');
          }
          scheduleReceipt = {
            id: selectedSchedules.length === 1 ? selectedSchedules[0].sourceReceipt.scheduleId : 'nba-actual-multi-season',
            version: source.scheduleSourceReceipt?.version || 'nba-schedule-source-v2',
            contentSha256: source.scheduleSourceReceipt?.contentSha256 || null,
          };
          // Only an all-30-team selection has a complete league record. A
          // reduced exact schedule deliberately contains only within-scope
          // games, so it must not masquerade as each club's NBA record.
          if (ids.length === 30) {
            if (actual) {
              throw new Error('Actual records are derived from the reviewed exact NBA schedule for an all-30-team run. Remove the optional JSON instead of overriding source results.');
            }
            const recordSets = years.map(year => deriveActualNbaTeamRecords(source.scheduleArtifact, {
              seasonStartYear: year,
              teamIds: ids,
              phases: ['regular'],
            }));
            const unavailableRecords = recordSets.find(item => item.status !== 'ready');
            if (unavailableRecords) throw new Error(unavailableRecords.reason || `Final-score records for ${unavailableRecords.seasonStartYear} are unavailable.`);
            actual = years.length === 1
              ? recordSets[0].records
              : Object.fromEntries(recordSets.map(item => [item.seasonStartYear, item.records]));
            actualRecordSourceNote = 'Scenario-versus-actual records were derived from final scores in the reviewed exact NBA schedule artifact; no manually entered record table was used.';
          }
        } else if (!scheduleGames.length) {
          throw new Error(source.scheduleSourceReceipt?.reason || 'The exact NBA schedule artifact is unavailable; provide an explicit declared calendar or use a generated scenario.');
        }
      }
      const payloads = ids.map(id => {
        const payload = nativeSelection.payloads.find(item => item.team === id);
        if (!payload) throw new Error(`The native SwishIQ package has no verified payload for ${id}.`);
        return payload;
      });
      const setup = { teams: ids.map(id => ({ id, name: name(id), ...parseRoster(rosterOverrides, roster.input.value, id) })), source: sourceKind.input.value === 'pooled-window'
        ? { kind: 'pooled-window', packageId: selectedPackage.packageRef.packageId, packageVersion: selectedPackage.packageRef.packageVersion, acceptedPooledPackage: acceptedPool.input.checked }
        : { kind: 'exact-season', packageId: selectedPackage.packageRef.packageId, packageVersion: selectedPackage.packageRef.packageVersion, exactSeasonEvidence: true, seasonPackages: selectedPackage.seasonPackages || years.map(year => ({ seasonStartYear: year, packageId: selectedPackage.packageRef.packageId, packageVersion: selectedPackage.packageRef.packageVersion })) },
      horizon: { kind: horizon.input.value, seasonStartYears: years }, schedule: { kind: schedule.input.value, scheduleId: scheduleReceipt?.id || null, sourceReceipt: scheduleReceipt, gamesPerTeam: Number(gamesPerTeam.input.value), games: scheduleGames },
      control: { kind: control.input.value, managedTeamIds: managedTeams.input.value.split(',').map(item => item.trim()).filter(Boolean) }, matchupWeights: { ownOffense: Number(blend.input.value) }, repeats: Number(repeats.input.value), seed: resolvedSeed.seed,
      playoff: { enabled: ids.length >= 16, teams: ids.length >= 16 ? 16 : 0, seriesLength: Number(seriesLength.input.value) },
      assumptions: [`${pace.input.value} pace is a display-only note; native team-season pace remains package evidence and no unsupported pace effect is applied. The ${Math.round(Number(blend.input.value) * 100)}% own-offense / ${Math.round((1 - Number(blend.input.value)) * 100)}% opponent-defense blend is an explicit scoring scenario control that leaves native evidence unchanged.`, pooled ? 'The selected package spans multiple seasons; this run uses it only through the accepted package scope.' : 'Historical evidence is requested by explicit season package selection.', actualRecordSourceNote, 'Injuries, contracts, player development, and transactions are not modeled because no dedicated accepted model was supplied.'].filter(Boolean) };
      const runAction = nextRunAction;
      nextRunAction = 'run';
      const sessionRun = sessionHud?.session.begin(runAction, { step: 1, feedback: runAction === 'replay' ? 'Replay is running from the recorded seed and declared evidence scope.' : 'Simulation is running. Building the declared schedule and replay outcomes.' });
      sessionRunToken = sessionRun?.runToken || null;
      const report = await simulateSeasonLab({ setup, teams: payloads, actualRecords: actual }, {
        signal: own.signal,
        onProgress: (progress, activity = {}) => {
          if (requestGeneration !== generation) return;
          const percent = Math.round(progress * 100);
          const seasonStartYear = Number(activity.seasonStartYear);
          const seasonLabel = Number.isSafeInteger(seasonStartYear)
            ? `${seasonStartYear}–${String(seasonStartYear + 1).slice(-2)}` : 'Selected season';
          const replayLabel = `Replay ${activity.repeat || 1}/${activity.repeatCount || Number(repeats.input.value) || 1}`;
          let activityLabel = `${seasonLabel} · ${replayLabel}`;
          if (activity.stage === 'preparing') activityLabel += ' · preparing the schedule';
          else if (activity.stage === 'replay-complete') activityLabel += ' · replay complete';
          else if (activity.stage === 'playoffs') {
            const bracketRound = Number.isSafeInteger(Number(activity.round)) ? ` · Round ${activity.round}` : '';
            const matchup = activity.home && activity.away ? ` · ${activity.home} vs ${activity.away}` : '';
            activityLabel += ` · ${readableLabel(activity.seriesStage || 'playoffs')}${bracketRound} · Game ${activity.gameNumber} of ${activity.gamesInStage}${matchup}`;
          } else if (Number.isSafeInteger(Number(activity.gameNumber))) {
            const phase = readableLabel(activity.phase || 'regular season');
            const matchup = activity.home && activity.away ? ` · ${activity.away} at ${activity.home}` : '';
            activityLabel += ` · ${phase} game ${activity.gameNumber} of ${activity.gamesInStage}${matchup}`;
          }
          const message = `Season Lab is running… ${percent}% · ${activityLabel}`;
          sessionHud?.session.setProgress(progress, message, sessionRunToken);
          status.textContent = message;
        },
        yieldEveryBatch: () => pauseGate?.wait(own.signal) || Promise.resolve(),
      });
      if (requestGeneration !== generation) return;
      currentPreparedInput = { setup: report.setup, teams: payloads, actualRecords: actual };
      render(report);
      sessionHud?.updateProvenance({
        scope: seasonSourceLabel(report.setup?.source),
        source: [report.setup?.source?.packageId, report.setup?.source?.packageVersion].filter(Boolean).join(' @ ') || 'Package identifier unavailable',
        cutoff: `${years.join(', ')} · ${readableLabel(report.setup?.schedule?.kind)} schedule`,
        output: `Seed ${report.seed} · ${report.repeatCount} replay${report.repeatCount === 1 ? '' : 's'} · ${report.modelVersion || 'model version unavailable'}`,
      });
      setSessionTerminal('complete', 'Season Lab complete. Review the first replay, variation, and native evidence below.');
      // Public adapters may consume a bounded report handoff, but the model
      // remains usable without a callback and no callback may change results.
      try { options?.onReport?.(report, { source, setup, teams: payloads }); } catch { /* optional handoff observers cannot fail a run */ }
      status.textContent = `${ids.length === 30 ? 'Season Lab' : 'Mini-league'} experiment complete · ${resolvedSeed.generated ? `new seed ${resolvedSeed.seed}` : `replay seed ${resolvedSeed.seed}`}. Change a setting to run again.`;
    } catch (error) {
      if (requestGeneration === generation) {
        const message = error.name === 'AbortError' ? 'Season Lab cancelled. No partial champion was assigned.' : error.message;
        if (error.name === 'AbortError') setSessionTerminal('cancelled', message);
        else setSessionTerminal('fail', message);
        status.textContent = message;
      }
    }
    finally { if (active === own) { active = null; pauseGate?.resume(); pauseGate = null; busy(false); updateLabels(); } }
  });
  async function runPreparedInput(input, { action = 'advance' } = {}) {
    if (active) throw new Error('Season Lab is already running. Wait for the current simulation to finish.');
    if (!input?.setup || !Array.isArray(input.teams) || !input.teams.length) {
      throw new Error('The prepared Season Lab input is incomplete.');
    }
    const own = new AbortController(), requestGeneration = ++generation;
    active = own;
    pauseGate = createSimulationPauseGate();
    currentReport = null;
    currentPreparedInput = null;
    busy(true);
    results.replaceChildren();
    const sessionRun = sessionHud?.session.begin(action, {
      step: 1,
      feedback: action === 'replay'
        ? 'The same validated Season Lab input is replaying with its recorded seed.'
        : 'The declared next-season scenario is running with its pinned native evidence.',
    });
    const sessionRunToken = sessionRun?.runToken || null;
    const setSessionTerminal = (method, message) => {
      const update = sessionHud?.session?.[method];
      if (typeof update !== 'function') return;
      if (sessionRunToken) update.call(sessionHud.session, message, sessionRunToken);
      else update.call(sessionHud.session, message);
    };
    try {
      const report = await simulateSeasonLab(input, {
        signal: own.signal,
        onProgress: (progress, activity = {}) => {
          if (requestGeneration !== generation) return;
          const percent = Math.round(progress * 100);
          const year = Number(activity.seasonStartYear);
          const yearLabel = Number.isSafeInteger(year) ? `${year}–${String(year + 1).slice(-2)}` : 'Next season';
          const operation = input.setup.source?.kind === 'year-advance-scenario' ? 'next season' : 'prepared input';
          const repeatCount = input.setup.randomness?.repeats || input.setup.repeats || input.setup.repeatCount || 1;
          const message = `Season Lab is running ${operation}… ${percent}% · ${yearLabel} · ${activity.stage === 'preparing' ? 'preparing the declared schedule' : `replay ${activity.repeat || 1}/${activity.repeatCount || repeatCount}`}`;
          sessionHud?.session.setProgress(progress, message, sessionRunToken);
          status.textContent = message;
        },
        yieldEveryBatch: () => pauseGate?.wait(own.signal) || Promise.resolve(),
      });
      if (requestGeneration !== generation) return null;
      currentPreparedInput = { setup: report.setup, teams: input.teams, actualRecords: input.actualRecords ?? null,
        ...(input.cupCompletion ? { cupCompletion: input.cupCompletion } : {}) };
      render(report);
      const years = input.setup.horizon.seasonStartYears || [];
      sessionHud?.updateProvenance({
        scope: seasonSourceLabel(report.setup?.source),
        source: [report.setup?.source?.packageId, report.setup?.source?.packageVersion].filter(Boolean).join(' @ ') || 'Pinned native evidence receipt',
        cutoff: `${years.join(', ')} · ${readableLabel(report.setup?.schedule?.kind)} schedule`,
        output: `Seed ${report.seed} · ${report.repeatCount} replay${report.repeatCount === 1 ? '' : 's'} · ${report.modelVersion || 'model version unavailable'}`,
      });
      setSessionTerminal('complete', input.setup.source?.kind === 'year-advance-scenario'
        ? 'Next-season scenario complete. Review its pinned evidence and generated schedule.'
        : 'Season Lab replay complete. Review its pinned evidence and schedule.');
      try { options?.onReport?.(report, { source, setup: input.setup, teams: input.teams }); } catch { /* optional handoff observers cannot fail a run */ }
      status.textContent = action === 'replay'
        ? `Prepared Season Lab replay complete · seed ${report.seed}. The original validated schedule and evidence pin were retained.`
        : input.setup.source?.kind === 'year-advance-scenario'
        ? `Next-season scenario complete · seed ${report.seed}. The native evidence remains pinned to ${report.setup?.source?.evidenceSeasonStartYear || 'the declared source season'}.`
        : `Prepared Season Lab replay complete · seed ${report.seed}.`;
      return report;
    } catch (error) {
      if (requestGeneration === generation) {
        const message = error.name === 'AbortError' ? 'Next-season scenario cancelled. No partial result was saved.' : error.message;
        if (error.name === 'AbortError') setSessionTerminal('cancelled', message);
        else setSessionTerminal('fail', message);
        status.textContent = message;
      }
      throw error;
    } finally {
      if (active === own) { active = null; pauseGate?.resume(); pauseGate = null; busy(false); updateLabels(); }
    }
  }
  return { cancel: cancelActive, cancelFranchise, runPreparedInput, destroy() {
    cancelActive('Season Lab closed because another workbench is active. No partial result was saved.');
    cancelFranchise('Season Lab closed because another workbench is active. No partial champion was assigned.');
    pauseGate?.resume();
    pauseGate = null;
    generation += 1;
    sessionHud?.destroy?.();
  }, setSource(value) {
    try { options?.onSetupChanged?.(); } catch { /* optional observers cannot block source changes */ }
    cancelFranchise('Season source changed. No partial champion was assigned.');
    pauseGate?.resume(); pauseGate = null; active?.abort(); active = null; generation += 1; currentReport = null; currentPreparedInput = null; reference = null; nextRunAction = 'run'; results.replaceChildren(); source = value?.phase === 'ready' && value.teams?.length >= 2 ? value : null;
    const available = source?.teams || []; teamCount.input.replaceChildren(...available.map((team, index) => { const option = node('option', `${index + 1} teams`); option.value = index + 1; return option; }).filter((option, index) => index >= 1));
    if (available.length) { teamCount.input.value = available.length; refreshTeamSelectors(available.length); } else refreshTeamSelectors(0);
    franchiseTeam.input.replaceChildren(...available.map(team => { const option = node('option', team.name); option.value = team.id; return option; }));
    if (available.length) franchiseTeam.input.value = available[0].id;
    const sourceYears = Array.isArray(source?.source?.seasonStartYears) && source.source.seasonStartYears.length ? source.source.seasonStartYears : GAME_LAB_POLICY.seasons;
    const exactYears = [...new Set((source?.nativePackages || []).filter(item => item.entry?.scope?.kind === 'exact-season').map(item => Number(item.entry.scope.seasonStartYear)))].sort((a, b) => a - b);
    franchiseSeason.input.replaceChildren(...exactYears.map(year => { const option = node('option', `${year}–${String(year + 1).slice(-2)}`); option.value = year; return option; }));
    franchiseSeason.input.value = exactYears.at(-1) || '';
    franchiseSeason.input.disabled = !exactYears.length;
    franchiseStart.disabled = !exactYears.length;
    season.input.value = sourceYears.at(-1) || 2024; gamesPerTeam.input.value = available.length === 30 ? 82 : Math.max(1, Math.min(82, available.length * 3)); horizon.input.value = available.length === 30 ? 'full' : 'short'; run.disabled = !source; updateLabels();
    if (!source) { franchiseState = null; }
    renderFranchise();
    sessionHud?.session.reset(source ? 'Ready.' : 'A validated SwishIQ league package with at least two teams is required.');
    status.textContent = source ? `${available.length} validated teams loaded.` : 'A validated SwishIQ league package with at least two teams is required.';
  } };
}
