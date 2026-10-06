/**
 * Shared selector and input primitives for the SwishIQ fan-tool suite.
 *
 * The helpers in this module are deliberately data-shape tolerant. Native
 * package rows, the pooled career reader, Lineup Lab records, and synthetic
 * browser fixtures use slightly different field names, but every UI surface
 * should expose the same filters and evidence labels. Nothing here invents a
 * player, team, metric, or image: rows are only rendered when they are present
 * in the caller-supplied public records.
 */

export const SWISHIQ_SELECTOR_SYSTEM_VERSION = 'swishiq-selector-system-v1';
export const ALL_TEAMS_VALUE = 'all';

export const NBA_TEAM_CODES = Object.freeze([
  'ATL', 'BOS', 'BKN', 'CHA', 'CHI', 'CLE', 'DAL', 'DEN', 'DET', 'GSW',
  'HOU', 'IND', 'LAC', 'LAL', 'MEM', 'MIA', 'MIL', 'MIN', 'NOP', 'NYK',
  'OKC', 'ORL', 'PHI', 'PHX', 'POR', 'SAC', 'SAS', 'TOR', 'UTA', 'WAS',
]);

const TEAM_CODE = /^[A-Z]{2,4}$/;
const OPAQUE_PLAYER_REF = /^p_[a-f0-9]{32}$/i;
const SAFE_HEADSHOT_PATH = /^(?:\/?(?:\.\.\/)*assets\/player-headshots\/(?:nba|nba-no-background)\/)[a-z0-9._-]+\.(?:avif|gif|jpe?g|png|webp)$/i;
const SAFE_HEADSHOT_ROOT = /^\/assets\/player-headshots\/(?:nba|nba-no-background)\/[a-z0-9._-]+\.(?:avif|gif|jpe?g|png|webp)$/i;
const TRANSPARENT_HEADSHOT_WEBP = /^(?:\/?(?:\.\.\/)*assets\/player-headshots\/nba-no-background\/)[a-z0-9._-]+\.webp$/i;
const SAFE_HEADSHOT_HOST = /^https:\/\/(?:www\.)?basketball-reference\.com\/req\/[^\s"']+\/images\/headshots\//i;

const text = value => String(value ?? '').trim();

export function normalizeSelectorText(value) {
  return text(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function initialsForName(value) {
  const name = text(value);
  if (!name) return '??';
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ''}${parts[parts.length - 1][0] || ''}`.toUpperCase();
}

function numberOrNull(value) {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

function firstNumber(...values) {
  for (const value of values) {
    const number = numberOrNull(value);
    if (number !== null) return number;
  }
  return null;
}

/** Return the best public sample/coverage number available on a row. */
export function coverageValue(record) {
  const row = record && typeof record === 'object' ? record : {};
  const coverage = row.coverage && typeof row.coverage === 'object' ? row.coverage : null;
  const sample = row.sample && typeof row.sample === 'object' ? row.sample : null;
  const exposure = row.exposure && typeof row.exposure === 'object' ? row.exposure : null;
  return firstNumber(
    row.coverage,
    coverage?.games,
    coverage?.appearances,
    coverage?.sampleSize,
    coverage?.matchedGames,
    row.games,
    row.gamesPlayed,
    row.appearances,
    sample?.games,
    sample?.appearances,
    sample?.sampleSize,
    exposure?.games,
    exposure?.appearances,
    row.minimumGames,
  );
}

function asPositions(value) {
  if (Array.isArray(value)) return value.map(text).filter(Boolean).map(item => item.toUpperCase());
  const valueText = text(value);
  return valueText ? valueText.split(/[\s,\/|]+/).map(item => item.trim().toUpperCase()).filter(Boolean) : [];
}

function teamCodeFor(record) {
  const value = text(record?.teamCode ?? record?.team ?? record?.teamId ?? record?.teamAbbreviation);
  return value.toUpperCase();
}

function playerNameFor(record) {
  return text(record?.displayName ?? record?.playerName ?? record?.player ?? record?.name);
}

function playerRefFor(record) {
  const explicit = text(record?.playerRef ?? record?.key);
  if (explicit) return explicit;
  const fallback = text(record?.id ?? record?.playerId);
  return OPAQUE_PLAYER_REF.test(fallback) ? fallback : '';
}

function seasonFor(record) {
  return firstNumber(record?.seasonStartYear, record?.season, record?.year, record?.seasonYear);
}

/*
 * Selector rows cross several public package readers. Keep their browser
 * shape allowlisted so an upstream row cannot accidentally carry provider
 * IDs, raw paths, joins, coefficients, or credentials into a rendered card.
 */
const PRIVATE_SELECTOR_KEY = /(?:^|[_-])(?:provider(?:id|ids)?|canonical(?:id)?|crosswalk|raw(?:archive|data)?|archive|coefficient|credential|token|secret|password|auth|api(?:key)?|internal|join(?:key|id)?|source(?:path|file|url))(?:$|[_-])/i;

function safePublicValue(value, depth = 0) {
  if (value === null || value === undefined) return value;
  if (depth > 3) return undefined;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(item => safePublicValue(item, depth + 1)).filter(item => item !== undefined);
  if (typeof value !== 'object') return undefined;
  const output = {};
  Object.entries(value).forEach(([key, item]) => {
    if (PRIVATE_SELECTOR_KEY.test(key)) return;
    const safe = safePublicValue(item, depth + 1);
    if (safe !== undefined) output[key] = safe;
  });
  return output;
}

/**
 * Resolve a row into the public fields consumed by all selector surfaces.
 * The returned object is a shallow copy with no private/provider fields.
 */
export function normalizeSelectorRecord(record, options = {}) {
  const row = record && typeof record === 'object' ? record : {};
  const name = playerNameFor(row);
  const playerRef = playerRefFor(row);
  const teamCode = teamCodeFor(row);
  const seasonStartYear = seasonFor(row);
  const positions = asPositions(row.positions ?? row.listedPositions ?? row.position);
  const coverage = coverageValue(row);
  const normalized = {
    playerRef,
    displayName: name,
    teamCode,
    team: teamCode,
    seasonStartYear,
    positions,
    coverage,
  };
  const safeFields = [
    'seasonEndYear', 'phase', 'games', 'gamesPlayed', 'appearances', 'sampleSize',
    'component', 'value', 'unit', 'evidence', 'evidenceKind', 'role', 'status',
    'headshotPath', 'approvedHeadshotPath', 'observed', 'duplicate', 'stats', 'metrics',
  ];
  safeFields.forEach(key => {
    const value = safePublicValue(row[key]);
    if (value !== undefined) normalized[key] = value;
  });
  if (options.component !== undefined) normalized.component = safePublicValue(options.component);
  if (options.value !== undefined) normalized.value = safePublicValue(options.value);
  if (options.unit !== undefined) normalized.unit = safePublicValue(options.unit);
  if (options.evidence !== undefined) normalized.evidence = safePublicValue(options.evidence);
  const approvedPath = approvedHeadshotFor(normalized, options.metadata);
  normalized.headshotPath = approvedPath;
  return normalized;
}

function normalizeTeamFilter(value) {
  const code = text(value).toUpperCase();
  return !code || code === ALL_TEAMS_VALUE.toUpperCase() || code === 'ALL' || code === 'ALL TEAMS' ? '' : code;
}

function normalizedTeamSet(filters = {}) {
  const values = Array.isArray(filters.teams)
    ? filters.teams
    : filters.teamCodes instanceof Set
      ? [...filters.teamCodes]
      : filters.team ? [filters.team] : [];
  return new Set(values.map(normalizeTeamFilter).filter(Boolean));
}

function matchesQuery(row, query) {
  const normalizedQuery = normalizeSelectorText(query);
  if (!normalizedQuery) return true;
  const haystack = normalizeSelectorText([
    row.displayName,
    row.teamCode,
    row.team,
    ...(row.positions || []),
    row.seasonStartYear,
    row.seasonEndYear,
    row.component,
    row.unit,
    row.evidence,
  ].filter(value => value !== undefined && value !== null).join(' '));
  return normalizedQuery.split(' ').every(token => haystack.includes(token));
}

/** Filter public player/donor rows by partial query, team, role, season, and coverage. */
export function filterSelectorRecords(records, filters = {}) {
  const rows = Array.isArray(records) ? records.map(record => normalizeSelectorRecord(record, filters)) : [];
  const teamSet = normalizedTeamSet(filters);
  const position = text(filters.position).toUpperCase();
  const season = firstNumber(filters.seasonStartYear, filters.season, filters.year);
  const minimumCoverage = firstNumber(filters.minCoverage, filters.minimumCoverage, filters.coverageMin);
  return rows.filter(row => {
    if (!matchesQuery(row, filters.query ?? filters.search)) return false;
    if (teamSet.size && !teamSet.has(row.teamCode)) return false;
    if (position && !row.positions.includes(position)) return false;
    if (season !== null && row.seasonStartYear !== season) return false;
    if (minimumCoverage !== null && (row.coverage === null || row.coverage < minimumCoverage)) return false;
    return true;
  });
}

export const filterPlayers = filterSelectorRecords;
export const filterDonors = filterSelectorRecords;

function donorKey(value, index, options = {}) {
  const row = value && typeof value === 'object' ? value : {};
  if (typeof options.key === 'function') return text(options.key(row, index));
  const ref = playerRefFor(row) || normalizeSelectorText(playerNameFor(row));
  return [ref, seasonFor(row), teamCodeFor(row)].join('|');
}

/** Return duplicate donor groups while preserving every selection index. */
export function duplicateDonorGroups(selections, options = {}) {
  const groups = new Map();
  (Array.isArray(selections) ? selections : []).forEach((selection, index) => {
    const key = donorKey(selection, index, options);
    if (!key || key === '||') return;
    const group = groups.get(key) || [];
    group.push(index);
    groups.set(key, group);
  });
  return [...groups.entries()]
    .filter(([, indices]) => indices.length > 1)
    .map(([key, indices]) => Object.freeze({ key, indices: Object.freeze(indices), count: indices.length }));
}

export const findDuplicateDonors = duplicateDonorGroups;

export function markDuplicateDonors(selections, options = {}) {
  const duplicateIndexes = new Set(duplicateDonorGroups(selections, options).flatMap(group => group.indices));
  return (Array.isArray(selections) ? selections : []).map((selection, index) => ({
    ...(selection && typeof selection === 'object' ? selection : {}),
    duplicate: duplicateIndexes.has(index),
  }));
}

function metadataRecord(metadata, name) {
  if (!metadata) return null;
  if (typeof metadata.get === 'function') return metadata.get(normalizeSelectorText(name)) || null;
  if (Array.isArray(metadata)) return metadata.find(record => normalizeSelectorText(record?.name ?? record?.displayName) === normalizeSelectorText(name)) || null;
  if (typeof metadata === 'object') return metadata[normalizeSelectorText(name)] || null;
  return null;
}

export function isApprovedHeadshot(value) {
  const candidate = text(value);
  if (!candidate) return false;
  return SAFE_HEADSHOT_PATH.test(candidate) || SAFE_HEADSHOT_ROOT.test(candidate) || SAFE_HEADSHOT_HOST.test(candidate);
}

/** Resolve only approved metadata/media paths; arbitrary provider URLs are ignored. */
export function approvedHeadshotFor(record, metadata) {
  const row = record && typeof record === 'object' ? record : {};
  const metadataRow = metadataRecord(metadata, playerNameFor(row));
  const transparentWebp = [metadataRow?.headshotPath, metadataRow?.approvedHeadshotPath]
    .find(candidate => TRANSPARENT_HEADSHOT_WEBP.test(text(candidate)) && isApprovedHeadshot(candidate));
  if (transparentWebp) return text(transparentWebp);
  const candidates = [
    row.headshotPath,
    row.approvedHeadshotPath,
    metadataRow?.headshotPath,
    metadataRow?.approvedHeadshotPath,
    row.headshotUrl,
    metadataRow?.headshotUrl,
  ];
  return candidates.find(isApprovedHeadshot) || '';
}

export const resolveApprovedHeadshot = approvedHeadshotFor;

function dom(documentRef, tag, className = '', content = '') {
  const element = documentRef.createElement(tag);
  if (className) element.className = className;
  if (content !== undefined && content !== null) element.textContent = String(content);
  return element;
}

/** Build an image/avatar with a deterministic initials fallback. */
export function createPlayerAvatar(documentRef = globalThis.document, record = {}, options = {}) {
  if (!documentRef) return null;
  const row = normalizeSelectorRecord(record, { metadata: options.metadata });
  const wrapper = dom(documentRef, 'span', `swishiq-player-avatar ${options.className || ''}`.trim());
  wrapper.dataset.playerRef = row.playerRef || '';
  const fallback = dom(documentRef, 'span', 'swishiq-player-avatar__initials', initialsForName(row.displayName));
  fallback.setAttribute('aria-hidden', 'true');
  // An explicit source is still caller input. Keep it behind the same
  // allowlist as metadata so a provider URL cannot bypass the public media
  // boundary simply by being passed through `options.src`.
  const explicitSource = isApprovedHeadshot(options.src) ? text(options.src) : '';
  const source = approvedHeadshotFor(
    explicitSource ? { ...row, headshotPath: explicitSource } : row,
    options.metadata,
  );
  if (source) {
    const image = dom(documentRef, 'img', 'swishiq-player-avatar__image');
    image.alt = options.alt || `${row.displayName || 'Player'} headshot`;
    image.loading = 'lazy';
    image.decoding = 'async';
    image.addEventListener('error', () => {
      image.hidden = true;
      fallback.hidden = false;
      wrapper.dataset.imageState = 'fallback';
    });
    wrapper.dataset.imageState = 'pending';
    fallback.hidden = true;
    wrapper.append(image, fallback);
    // Bind the fallback before assigning src so cached or test-provided
    // image implementations cannot report a failure before the listener.
    image.src = source;
  } else {
    wrapper.dataset.imageState = 'fallback';
    wrapper.append(fallback);
  }
  return wrapper;
}

function displaySeason(year) {
  const season = numberOrNull(year);
  return season === null ? 'Season unavailable' : `${season}–${String(season + 1).slice(-2)}`;
}

function valueText(value, unit = '') {
  if (value === null || value === undefined || value === '') return 'Unavailable';
  const numeric = numberOrNull(value);
  const rendered = numeric === null ? text(value) : Number.isInteger(numeric) ? String(numeric) : numeric.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
  return unit ? `${rendered} ${unit}` : rendered;
}

/** Render the shared stat-slab identity and compact metric treatment. */
export function createStatSlab(documentRef = globalThis.document, record = {}, options = {}) {
  if (!documentRef) return null;
  const row = normalizeSelectorRecord(record);
  const slab = dom(documentRef, 'article', `swishiq-stat-slab ${options.className || ''}`.trim());
  slab.dataset.playerRef = row.playerRef || '';
  slab.dataset.team = row.teamCode || '';
  if (row.seasonStartYear !== null) slab.dataset.season = String(row.seasonStartYear);
  const identity = dom(documentRef, 'div', 'swishiq-stat-slab__identity');
  identity.append(createPlayerAvatar(documentRef, row, options));
  const copy = dom(documentRef, 'div', 'swishiq-stat-slab__copy');
  copy.append(dom(documentRef, 'strong', 'swishiq-stat-slab__name', row.displayName || 'Player unavailable'));
  const context = [row.teamCode, displaySeason(row.seasonStartYear), row.positions?.join('/')].filter(Boolean).join(' · ');
  copy.append(dom(documentRef, 'span', 'swishiq-stat-slab__context', context || 'Public player context unavailable'));
  identity.append(copy);
  slab.append(identity);
  const stats = options.stats || row.stats || row.metrics || {};
  const entries = Array.isArray(stats)
    ? stats
    : Object.entries(stats).map(([key, value]) => ({ key, label: key, value: value?.value ?? value, unit: value?.unit || '' }));
  const statGrid = dom(documentRef, 'div', 'swishiq-stat-slab__stats');
  entries.slice(0, Number(options.limit) || 6).forEach(stat => {
    const cell = dom(documentRef, 'div', 'swishiq-stat-slab__stat');
    cell.dataset.metric = text(stat.key || stat.label);
    cell.append(dom(documentRef, 'span', 'swishiq-stat-slab__label', stat.label || stat.key || 'Stat'), dom(documentRef, 'strong', 'swishiq-stat-slab__value', valueText(stat.value, stat.unit)));
    statGrid.append(cell);
  });
  if (!statGrid.children.length) statGrid.append(dom(documentRef, 'p', 'swishiq-stat-slab__empty', options.emptyMessage || 'Published stats unavailable for this row.'));
  slab.append(statGrid);
  const evidence = options.evidence || row.evidence || row.evidenceKind;
  const coverage = row.coverage;
  if (evidence || coverage !== null) {
    const note = dom(documentRef, 'small', 'swishiq-stat-slab__evidence');
    note.textContent = [evidence || 'Evidence unavailable', coverage === null ? '' : `${coverage} games coverage`].filter(Boolean).join(' · ');
    slab.append(note);
  }
  return slab;
}

/** Render a provenance-rich donor card used by Composite/Player Builder. */
export function createDonorCard(documentRef = globalThis.document, donor = {}, options = {}) {
  if (!documentRef) return null;
  const row = normalizeSelectorRecord(donor, options);
  const card = dom(documentRef, 'article', `swishiq-donor-card ${row.duplicate ? 'is-duplicate' : ''}`.trim());
  card.dataset.donorKey = donorKey(row, 0, options);
  card.dataset.duplicate = String(Boolean(row.duplicate));
  const identity = dom(documentRef, 'div', 'swishiq-donor-card__identity');
  identity.append(createPlayerAvatar(documentRef, row, options));
  const heading = dom(documentRef, 'div', 'swishiq-donor-card__heading');
  heading.append(dom(documentRef, 'strong', '', row.displayName || 'Donor unavailable'));
  heading.append(dom(documentRef, 'span', '', [displaySeason(row.seasonStartYear), row.teamCode || 'Team unavailable'].join(' · ')));
  identity.append(heading); card.append(identity);
  const details = dom(documentRef, 'dl', 'swishiq-donor-card__details');
  const detail = (label, value) => { const wrapper = dom(documentRef, 'div'); wrapper.append(dom(documentRef, 'dt', '', label), dom(documentRef, 'dd', '', value)); details.append(wrapper); };
  detail('Component', row.component || options.component || 'Skill component unavailable');
  detail('Value', valueText(row.value, row.unit));
  detail('Unit', row.unit || 'Unit unavailable');
  detail('Coverage', row.coverage === null ? 'Coverage unavailable' : `${row.coverage} games`);
  detail('Evidence', row.evidence || row.evidenceKind || 'Evidence unavailable');
  card.append(details);
  if (row.duplicate) {
    const warning = dom(documentRef, 'p', 'swishiq-donor-card__warning', options.duplicateMessage || 'Duplicate donor selected. Consider a different source for independent coverage.');
    warning.setAttribute('role', 'alert');
    card.append(warning);
  }
  return card;
}

export const renderDonorCard = createDonorCard;

function normalizeTeams(teams) {
  const source = Array.isArray(teams) && teams.length ? teams : NBA_TEAM_CODES;
  const seen = new Set();
  return source.map(team => {
    if (typeof team === 'string') return { code: team.toUpperCase(), label: team.toUpperCase() };
    const code = text(team?.code ?? team?.id ?? team?.teamCode).toUpperCase();
    return { code, label: text(team?.label ?? team?.name) || code };
  }).filter(team => TEAM_CODE.test(team.code) && !seen.has(team.code) && seen.add(team.code));
}

function selectedValues(select) {
  return [...(select?.selectedOptions || [])].map(option => option.value).filter(Boolean);
}

/**
 * Create one accessible team control. In All 30 mode the custom selector,
 * chips, count, clear action, and schedule controls are hidden together.
 */
export function createTeamSelectionControl(documentRef = globalThis.document, options = {}) {
  if (!documentRef) return null;
  const id = text(options.id) || 'swishiqTeams';
  const teams = normalizeTeams(options.teams);
  const root = options.root || dom(documentRef, 'section', 'swishiq-team-selection');
  root.classList.add('swishiq-team-selection');
  root.dataset.selectorVersion = SWISHIQ_SELECTOR_SYSTEM_VERSION;
  root.dataset.teamCount = String(teams.length);
  const heading = dom(documentRef, 'h3', 'swishiq-team-selection__heading', options.heading || 'Teams in this lab');
  const modeLabel = dom(documentRef, 'label', 'swishiq-team-selection__mode-label', options.modeLabel || 'Team scope');
  const mode = dom(documentRef, 'select', 'swishiq-team-selection__mode');
  mode.id = `${id}Mode`;
  modeLabel.htmlFor = mode.id;
  mode.append(Object.assign(dom(documentRef, 'option', '', 'All 30 teams'), { value: ALL_TEAMS_VALUE }), Object.assign(dom(documentRef, 'option', '', 'Choose teams'), { value: 'custom' }));
  modeLabel.append(mode);
  const custom = dom(documentRef, 'div', 'swishiq-team-selection__custom');
  const teamLabel = dom(documentRef, 'label', 'swishiq-team-selection__teams-label', options.customLabel || 'Selected teams');
  const teamSelect = dom(documentRef, 'select', 'swishiq-team-selection__teams');
  teamSelect.id = `${id}Teams`; teamSelect.multiple = true; teamSelect.size = Math.min(8, Math.max(4, teams.length));
  teamLabel.htmlFor = teamSelect.id;
  teams.forEach(team => teamSelect.append(Object.assign(dom(documentRef, 'option', '', team.label), { value: team.code })));
  teamLabel.append(teamSelect);
  const chipRow = dom(documentRef, 'div', 'swishiq-team-selection__chips');
  chipRow.setAttribute('aria-label', 'Selected team filters');
  const count = dom(documentRef, 'span', 'swishiq-team-selection__count'); count.setAttribute('aria-live', 'polite');
  const clear = dom(documentRef, 'button', 'swishiq-team-selection__clear', options.clearLabel || 'Clear all'); clear.type = 'button';
  const scheduleLabel = dom(documentRef, 'label', 'swishiq-team-selection__schedule-label', options.scheduleLabel || 'Schedule');
  const schedule = dom(documentRef, 'select', 'swishiq-team-selection__schedule'); schedule.id = `${id}Schedule`;
  const scheduleOptions = options.scheduleOptions || [['actual', 'Actual schedule'], ['round-robin', 'Round-robin scenario'], ['custom', 'Custom schedule']];
  scheduleOptions.forEach(item => {
    const value = Array.isArray(item) ? item[0] : item?.value;
    const label = Array.isArray(item) ? item[1] : item?.label;
    if (value) schedule.append(Object.assign(dom(documentRef, 'option', '', label || value), { value }));
  });
  scheduleLabel.htmlFor = schedule.id; scheduleLabel.append(schedule);
  custom.append(teamLabel, chipRow, count, clear, scheduleLabel);
  root.replaceChildren(heading, modeLabel, custom);
  let syncing = false;
  const notify = () => { if (!syncing) options.onChange?.(api.getValue(), api); };
  const render = () => {
    const all = mode.value === ALL_TEAMS_VALUE;
    custom.hidden = all;
    root.dataset.mode = all ? ALL_TEAMS_VALUE : 'custom';
    const values = selectedValues(teamSelect);
    chipRow.replaceChildren();
    values.forEach(value => {
      const label = teams.find(team => team.code === value)?.label || value;
      const chip = dom(documentRef, 'span', 'swishiq-team-selection__chip');
      chip.dataset.team = value;
      chip.append(dom(documentRef, 'span', '', label));
      const remove = dom(documentRef, 'button', 'swishiq-team-selection__chip-remove', '×'); remove.type = 'button'; remove.setAttribute('aria-label', `Remove ${label}`);
      remove.addEventListener('click', () => { const option = [...teamSelect.options].find(item => item.value === value); if (option) option.selected = false; render(); notify(); });
      chip.append(remove); chipRow.append(chip);
    });
    count.textContent = all ? `All ${teams.length} teams selected` : `${values.length} team${values.length === 1 ? '' : 's'} selected`;
    clear.hidden = all || values.length === 0;
    scheduleLabel.hidden = all;
  };
  const api = {
    root,
    mode,
    teamSelect,
    schedule,
    chips: chipRow,
    count,
    clear,
    getValue() {
      const all = mode.value === ALL_TEAMS_VALUE;
      return { mode: all ? ALL_TEAMS_VALUE : 'custom', teamCodes: all ? teams.map(team => team.code) : selectedValues(teamSelect), schedule: schedule.value || null };
    },
    setValue(value = {}) {
      syncing = true;
      const all = value.mode === ALL_TEAMS_VALUE || value.allTeams === true || value.teamCodes === ALL_TEAMS_VALUE;
      mode.value = all ? ALL_TEAMS_VALUE : 'custom';
      const desired = new Set(Array.isArray(value.teamCodes) ? value.teamCodes.map(item => String(item).toUpperCase()) : Array.isArray(value.teams) ? value.teams.map(item => String(item).toUpperCase()) : []);
      [...teamSelect.options].forEach(option => { option.selected = !all && desired.has(option.value); });
      if (value.schedule && [...schedule.options].some(option => option.value === value.schedule)) schedule.value = value.schedule;
      syncing = false;
      render();
      return api.getValue();
    },
    destroy() { mode.removeEventListener('change', handleMode); teamSelect.removeEventListener('change', handleTeams); schedule.removeEventListener('change', handleSchedule); clear.removeEventListener('click', handleClear); },
  };
  const handleMode = () => { render(); notify(); };
  const handleTeams = () => { if (mode.value === ALL_TEAMS_VALUE) mode.value = 'custom'; render(); notify(); };
  const handleSchedule = () => { render(); notify(); };
  const handleClear = () => { [...teamSelect.options].forEach(option => { option.selected = false; }); render(); notify(); };
  mode.addEventListener('change', handleMode); teamSelect.addEventListener('change', handleTeams); schedule.addEventListener('change', handleSchedule); clear.addEventListener('click', handleClear);
  render();
  return api;
}

/** Add a small search field to an existing select without replacing its owner. */
export function enhanceSearchableSelect(documentRef = globalThis.document, select, options = {}) {
  if (!documentRef || !select || select.dataset.swishiqSearchEnhanced === 'true') return select?._swishIqSelectorApi || null;
  const owner = select.parentElement;
  if (!owner) return null;
  const input = dom(documentRef, 'input', 'swishiq-selector-search');
  input.type = 'search'; input.autocomplete = 'off'; input.placeholder = options.placeholder || 'Search by name, team, position, or season';
  input.setAttribute('aria-label', options.label || 'Search options');
  if (!select.id) select.id = `${text(select.name) || 'swishiqSelect'}SearchTarget`;
  input.id = `${select.id}Search`;
  input.setAttribute('role', 'searchbox');
  input.setAttribute('aria-controls', select.id);
  select.setAttribute('aria-describedby', input.id);
  owner.insertBefore(input, select);
  select.dataset.swishiqSearchEnhanced = 'true';
  let records = Array.isArray(options.records) ? options.records.slice() : [];
  const valueFor = row => text(typeof options.valueFor === 'function' ? options.valueFor(row) : row?.playerRef);
  const initialOptions = [...select.options].map(option => ({ value: option.value, label: option.textContent, record: records.find(row => valueFor(row) === option.value) }));
  const rebuild = () => {
    const query = input.value;
    if (!records.length) {
      [...select.options].forEach(option => { option.hidden = Boolean(query) && !normalizeSelectorText(option.textContent).includes(normalizeSelectorText(query)); });
      return;
    }
    const previous = select.value;
    const rows = filterSelectorRecords(records, { query });
    select.replaceChildren(...rows.map(row => Object.assign(dom(documentRef, 'option', '', options.labelFor ? options.labelFor(row) : row.displayName || row.playerRef), { value: valueFor(row) })));
    if (rows.some(row => valueFor(row) === previous)) select.value = previous;
    options.onFilter?.(rows, query, api);
  };
  const api = { input, select, setRecords(next) { records = Array.isArray(next) ? next.slice() : []; rebuild(); }, rebuild, getRecords: () => records.slice(), initialOptions };
  input.addEventListener('input', rebuild);
  select._swishIqSelectorApi = api;
  return api;
}

export function installSelectorSystem(documentRef = globalThis.document) {
  if (!documentRef) return null;
  documentRef.documentElement?.setAttribute('data-swishiq-selector-system', SWISHIQ_SELECTOR_SYSTEM_VERSION);
  return SWISHIQ_SELECTOR_SYSTEM_VERSION;
}
