import {
  careerRegularSeasonSummary,
  profileForPlayerContext,
} from './player-context.js?v=20261001e&rev=player-context-v4-source-gate-v1';

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function contextMetric(createElement, label, value, detail = '') {
  const card = createElement('div', 'swishiq-player-context__metric');
  const heading = createElement('span');
  heading.textContent = label;
  const amount = createElement('strong');
  amount.textContent = value;
  card.append(heading, amount);
  if (detail) {
    const note = createElement('small');
    note.textContent = detail;
    card.append(note);
  }
  return card;
}

function contextSectionHeading(createElement, kicker, title, copy = '') {
  const heading = createElement('div', 'swishiq-player-context__heading');
  const copyWrap = createElement('div');
  const label = createElement('span', 'swishiq-kicker');
  label.textContent = kicker;
  const titleElement = createElement('h5');
  titleElement.textContent = title;
  copyWrap.append(label, titleElement);
  if (copy) {
    const note = createElement('p');
    note.textContent = copy;
    copyWrap.append(note);
  }
  heading.append(copyWrap);
  return heading;
}

const PLAYER_BLUEPRINT_TABS = Object.freeze([
  { key: 'profile', label: 'Profile' },
  { key: 'stats', label: 'Stats' },
  { key: 'bio', label: 'Bio' },
]);

const BLUEPRINT_SEASON_PHASES = Object.freeze([
  { key: 'regular', label: 'Regular Season' },
  { key: 'in_season_tournament', label: 'In-Season Tournament' },
  { key: 'play_in', label: 'Play-In' },
  { key: 'playoffs', label: 'Playoffs' },
]);

export const PLAYER_BLUEPRINT_SEASON_PHASES = BLUEPRINT_SEASON_PHASES;

export function blueprintSeasonTypeLabel(phase) {
  return BLUEPRINT_SEASON_PHASES.find(option => option.key === phase)?.label || 'Season';
}

function safeDomId(value) {
  return String(value || 'player').replace(/[^a-z0-9_-]+/gi, '-');
}

export function createPlayerBlueprintTabs({ createElement, idPrefix, initialTab = 'stats', onChange }) {
  const prefix = safeDomId(idPrefix);
  const activeKey = PLAYER_BLUEPRINT_TABS.some(tab => tab.key === initialTab) ? initialTab : 'stats';
  const element = createElement('section', 'swishiq-blueprint__profile-tabs');
  const tabList = createElement('div', 'swishiq-blueprint__profile-tablist');
  tabList.setAttribute('role', 'tablist');
  tabList.setAttribute('aria-label', 'Player profile sections');
  const panels = {};
  const tabs = [];

  PLAYER_BLUEPRINT_TABS.forEach(tab => {
    const button = createElement('button', 'swishiq-blueprint__profile-tab');
    button.id = `${prefix}-${tab.key}-tab`;
    button.type = 'button';
    button.textContent = tab.label;
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-controls', `${prefix}-${tab.key}-panel`);
    button.setAttribute('aria-selected', String(tab.key === activeKey));
    button.tabIndex = tab.key === activeKey ? 0 : -1;

    const panel = createElement('section', `swishiq-blueprint__profile-tabpanel swishiq-blueprint__profile-tabpanel--${tab.key}`);
    panel.id = `${prefix}-${tab.key}-panel`;
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', button.id);
    panel.tabIndex = 0;
    panel.hidden = tab.key !== activeKey;
    panels[tab.key] = panel;
    tabs.push({ ...tab, button, panel });
    tabList.append(button);
  });

  const activate = key => {
    tabs.forEach(tab => {
      const selected = tab.key === key;
      tab.button.setAttribute('aria-selected', String(selected));
      tab.button.tabIndex = selected ? 0 : -1;
      tab.panel.hidden = !selected;
    });
    onChange?.(key);
  };

  tabs.forEach((tab, index) => {
    tab.button.addEventListener('click', () => activate(tab.key));
    tab.button.addEventListener('keydown', event => {
      let nextIndex = null;
      if (event.key === 'ArrowRight') nextIndex = (index + 1) % tabs.length;
      else if (event.key === 'ArrowLeft') nextIndex = (index - 1 + tabs.length) % tabs.length;
      else if (event.key === 'Home') nextIndex = 0;
      else if (event.key === 'End') nextIndex = tabs.length - 1;
      if (nextIndex === null) return;
      event.preventDefault?.();
      tabs[nextIndex].button.focus?.();
      activate(tabs[nextIndex].key);
    });
  });

  element.append(tabList, ...Object.values(panels));
  return { element, tabList, panels, activate };
}

export function createBlueprintSeasonTypeControl({ createElement, id, phases, value = 'regular', onChange }) {
  const availableKeys = new Set(Array.isArray(phases) ? phases : []);
  const options = BLUEPRINT_SEASON_PHASES.filter(phase => availableKeys.has(phase.key));
  const selectedKey = options.some(option => option.key === value)
    ? value
    : options.find(option => option.key === 'regular')?.key || options[0]?.key || '';
  const field = createElement('label', 'swishiq-blueprint__season-type');
  const label = createElement('span', 'swishiq-blueprint__field-label');
  label.id = `${safeDomId(id)}-label`;
  label.textContent = 'Season Type';
  const select = createElement('select', 'swishiq-blueprint__season-type-select');
  select.id = safeDomId(id);
  select.setAttribute('aria-labelledby', label.id);
  options.forEach(phase => {
    const option = createElement('option');
    option.value = phase.key;
    option.textContent = phase.label;
    select.append(option);
  });
  select.value = selectedKey;
  select.disabled = options.length < 2;
  select.addEventListener('change', () => {
    if (options.some(option => option.key === select.value)) onChange?.(select.value);
  });
  field.append(label, select);
  return { element: field, select, value: selectedKey, options };
}

/**
 * Render awards only from award-history rows already present in the
 * player context. A decorative trophy shape is never a claim that an award
 * exists; missing, loading, and unavailable data are shown without invented
 * award entries so the Profile tab keeps an explicit, accessible shelf.
 */
export function renderTrophyCase({ createElement, context, formatSeasonLabel, status = 'ready' }) {
  const awards = Array.isArray(context?.espn?.awards)
    ? context.espn.awards.filter(award => isObject(award) && typeof award.award === 'string' && award.award.trim())
    : [];
  const casePanel = createElement('section', 'swishiq-trophy-case');
  casePanel.setAttribute('role', 'region');
  casePanel.setAttribute('aria-label', 'Trophy Case');
  casePanel.append(contextSectionHeading(createElement, 'CAREER AWARDS', 'Trophy Case'));
  if (status === 'loading') {
    const note = createElement('p', 'swishiq-trophy-case__empty');
    note.setAttribute('role', 'status');
    note.textContent = 'Loading public award records…';
    casePanel.append(note);
    return casePanel;
  }
  if (status === 'elsewhere') {
    const note = createElement('p', 'swishiq-trophy-case__empty');
    note.textContent = 'Award history is shown on this player’s first team row.';
    casePanel.append(note);
    return casePanel;
  }
  if (status === 'unavailable') {
    const note = createElement('p', 'swishiq-trophy-case__empty');
    note.textContent = 'Public award records are unavailable for this player.';
    casePanel.append(note);
    return casePanel;
  }
  if (!awards.length) {
    const note = createElement('p', 'swishiq-trophy-case__empty');
    note.textContent = 'No public award records are available for this player.';
    casePanel.append(note);
    return casePanel;
  }
  const shelf = createElement('ul', 'swishiq-trophy-case__shelf');
  awards
    .slice()
    .sort((left, right) => Number(right.seasonEndYear || 0) - Number(left.seasonEndYear || 0)
      || String(left.award).localeCompare(String(right.award)))
    .forEach(award => {
      const item = createElement('li', 'swishiq-trophy-case__award');
      const trophy = createElement('span', 'swishiq-trophy-case__trophy');
      trophy.setAttribute('aria-hidden', 'true');
      trophy.append(createElement('span', 'swishiq-trophy-case__cup'), createElement('span', 'swishiq-trophy-case__stem'), createElement('span', 'swishiq-trophy-case__base'));
      const plaque = createElement('span', 'swishiq-trophy-case__plaque');
      const awardName = createElement('strong');
      awardName.textContent = award.award;
      const season = createElement('small');
      season.textContent = Number.isInteger(Number(award.seasonStartYear))
        ? formatSeasonLabel(Number(award.seasonStartYear))
        : 'Season unavailable';
      plaque.append(awardName, season);
      item.append(trophy, plaque);
      shelf.append(item);
  });
  casePanel.append(shelf);
  return casePanel;
}

function careerPerGame(totals, key, games) {
  const value = Number(totals?.[key]);
  return Number.isFinite(value) && Number.isFinite(games) && games > 0 ? value / games : null;
}

function careerPercentage(totals, madeKey, attemptKey) {
  const makes = Number(totals?.[madeKey]);
  const attempts = Number(totals?.[attemptKey]);
  return Number.isFinite(makes) && Number.isFinite(attempts) && attempts > 0 ? makes / attempts : null;
}

function renderCareerSeasonTable({ createElement, career, formatInteger, formatMetric, formatSeasonLabel }) {
  if (!Array.isArray(career?.seasons) || !career.seasons.length) return null;
  const section = createElement('section', 'swishiq-player-context__career-seasons');
  section.append(contextSectionHeading(
    createElement,
    'Career history',
    'Year-by-year career regular-season stats',
  ));
  const tableWrap = createElement('div', 'swishiq-player-context__career-table-wrap');
  tableWrap.setAttribute('role', 'region');
  tableWrap.setAttribute('aria-label', 'Year-by-year career regular-season stats');
  tableWrap.tabIndex = 0;
  const table = createElement('table', 'swishiq-player-context__career-table');
  const caption = createElement('caption');
  caption.textContent = 'Career regular-season stats by season';
  table.append(caption);
  const headers = ['Season', 'Team(s)', 'GP', 'MPG', 'PPG', 'RPG', 'APG', 'FG%', '3P%', 'FT%'];
  const head = createElement('thead');
  const headRow = createElement('tr');
  headers.forEach(text => {
    const cell = createElement('th');
    cell.scope = 'col';
    cell.textContent = text;
    headRow.append(cell);
  });
  head.append(headRow);
  table.append(head);
  const body = createElement('tbody');
  career.seasons.slice().sort((left, right) => right.seasonStartYear - left.seasonStartYear).forEach(season => {
    const totals = season?.totals || {};
    const games = Number(totals.gamesPlayed);
    const row = createElement('tr');
    const values = [
      formatSeasonLabel(season.seasonStartYear),
      Array.isArray(season.teamCodes) && season.teamCodes.length ? season.teamCodes.join(' / ') : '—',
      Number.isFinite(games) ? formatInteger(games) : '—',
      careerPerGame(totals, 'minutesPlayed', games),
      careerPerGame(totals, 'points', games),
      careerPerGame(totals, 'totalRebounds', games),
      careerPerGame(totals, 'assists', games),
      careerPercentage(totals, 'fieldGoalsMade', 'fieldGoalsAttempted'),
      careerPercentage(totals, 'threePointFieldGoalsMade', 'threePointFieldGoalsAttempted'),
      careerPercentage(totals, 'freeThrowsMade', 'freeThrowsAttempted'),
    ];
    values.forEach((value, index) => {
      const cell = index === 0 ? createElement('th') : createElement('td');
      if (index === 0) cell.scope = 'row';
      cell.textContent = index >= 3 && index <= 6
        ? Number.isFinite(value) ? formatMetric(value) : '—'
        : index >= 7
          ? Number.isFinite(value) ? `${formatMetric(value * 100)}%` : '—'
          : value;
      row.append(cell);
    });
    body.append(row);
  });
  table.append(body);
  tableWrap.append(table);
  section.append(tableWrap);
  return section;
}

/**
 * Context-only Player Blueprint surface. The controller owns selection and
 * fetching; this renderer owns identity-adjacent public record presentation.
 * The explicit dependency list keeps this reusable by a future analytics view
 * without coupling it to Studio DOM state or any package loader. The selected
 * season values stay in the primary Player Blueprint snapshot; this renderer
 * adds biography, career history, and awards.
 */
export function renderPlayerContext({
  createElement,
  row,
  player,
  context,
  formatDate,
  formatHeight,
  formatInteger,
  formatMetric,
  formatSeasonLabel,
}) {
  const panel = createElement('section', 'swishiq-player-context');
  if (!context) {
    panel.classList.add('swishiq-player-context--unavailable');
    panel.append(
      contextSectionHeading(createElement, 'Player profile', 'Player details unavailable'),
      createElement('p'),
    );
    panel.lastElementChild.textContent = `Season stats are available, but player details and career history are not available for ${player.displayName}.`;
    return panel;
  }
  const profile = profileForPlayerContext(context, row.seasonStartYear);
  const career = careerRegularSeasonSummary(context);
  panel.append(contextSectionHeading(
    createElement,
    'Player profile',
    'Player context',
  ));

  let bio = null;
  const detail = (label, value) => {
    if (!value || value === 'Unavailable') return;
    bio ||= createElement('dl', 'swishiq-player-context__bio');
    const item = createElement('div');
    const term = createElement('dt');
    term.textContent = label;
    const definition = createElement('dd');
    definition.textContent = value;
    item.append(term, definition);
    bio.append(item);
  };
  detail('Jersey', profile?.jerseyNumber ? `#${profile.jerseyNumber}` : '');
  detail('Height', formatHeight(profile?.height));
  detail('Birthday', formatDate(profile?.birthDate));
  detail('College', profile?.college || '');
  detail('Country', profile?.country || '');
  detail('Experience', Number.isFinite(profile?.experience) ? `${profile.experience} seasons played` : '');
  if (bio) panel.append(bio);

  let careerPanel = null;
  if (career) {
    careerPanel = createElement('section', 'swishiq-player-context__career');
    careerPanel.append(contextSectionHeading(
      createElement,
      'Career record',
      'Career regular-season totals and averages',
    ));
    const totals = createElement('div', 'swishiq-player-context__metrics');
    totals.append(
      contextMetric(createElement, 'Games', formatInteger(career.totals.gamesPlayed), 'total'),
      contextMetric(createElement, 'Points', formatInteger(career.totals.points), 'total'),
      contextMetric(createElement, 'Rebounds', formatInteger(career.totals.totalRebounds), 'total'),
      contextMetric(createElement, 'Assists', formatInteger(career.totals.assists), 'total'),
    );
    careerPanel.append(totals);
    const careerAverageMetrics = career.perGame ? [
      ['PPG', career.perGame.points, 'pointsPerGame'],
      ['RPG', career.perGame.rebounds, 'reboundsPerGame'],
      ['APG', career.perGame.assists, 'assistsPerGame'],
      ['MPG', career.perGame.minutes, 'minutesPerGame'],
    ].filter(([, value, key]) => {
      if (!Number.isFinite(value)) return false;
      const seasonValue = row?.metrics?.[key]?.value;
      return !Number.isFinite(seasonValue) || Math.abs(value - seasonValue) > 1e-9;
    }) : [];
    if (careerAverageMetrics.length) {
      const averages = createElement('div', 'swishiq-player-context__metrics swishiq-player-context__metrics--averages');
      careerAverageMetrics.forEach(([label, value]) => {
        averages.append(contextMetric(createElement, label, formatMetric(value), 'career average'));
      });
      careerPanel.append(averages);
    }
    const history = createElement('div', 'swishiq-player-context__team-history');
    const historyLabel = createElement('strong');
    historyLabel.textContent = 'Team history';
    const historyList = createElement('ul');
    career.seasons.forEach(season => {
      const item = createElement('li');
       item.textContent = `${formatSeasonLabel(season.seasonStartYear)} · ${season.teamCodes.join(' / ') || 'Team unavailable'}`;
      historyList.append(item);
    });
    history.append(historyLabel, historyList);
    careerPanel.append(history);
    const seasonTable = renderCareerSeasonTable({ createElement, career, formatInteger, formatMetric, formatSeasonLabel });
    if (seasonTable) careerPanel.append(seasonTable);
  } else {
    const unavailable = createElement('p', 'swishiq-player-context__unavailable');
    unavailable.textContent = 'Career totals are not available for this player.';
    careerPanel = unavailable;
  }

  panel.append(careerPanel);
  return panel;
}
