import { comparePublicPlayers, boardRules, draftNeeds } from './game-decision-model.js?v=20260917b&rev=public-daily-ui';
import { decisionPointsForRank, decisionProofStatus, resultPassportEvidenceContext } from './result-passport.js?v=20260930f';
import { renderResultContext } from './result-visuals.js?v=20260930f';
export { decisionProofStatus };
const node = (tag, text, className = '') => {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  if (className) element.className = className;
  return element;
};
const number = value => value === null ? 'Unavailable' : value.toFixed(1);
// Compatibility export for existing game pages. The shared contract owns the
// native placement rule so a board cannot acquire a second scoring formula.
export const fitPointsForRank = decisionPointsForRank;
export function decisionBrief(board, action, { showLegalChoices = true } = {}) {
  const section = node('section', undefined, 'game-decision-brief');
  section.setAttribute('aria-label', 'Your objective and rules');
  section.append(node('strong', `Goal: ${board.objective?.label || 'SwishIQ board rank'}`),
    node('p', board.focus || 'Choose the option that ranks highest on this fixed board.'),
    node('p', action));
  if (showLegalChoices) section.append(node('small', `Legal choices: ${boardRules(board).replace(/^Role minimums:\s*/i, '')}`));
  return section;
}
export function candidateComparison(players, baseline = null) {
  const details = node('details', undefined, 'game-decision-details');
  // Candidate stats are decision context, not hidden documentation. Keep the
  // comparison open at the pick surface so players can compare every legal
  // option before committing to a swap.
  details.open = true;
  details.append(node('summary', 'Compare player stats'));
  const note = 'Per-game values from this board, not lineup totals or a model score. Players may come from different team-seasons. A larger number is not always better; turnovers are a cost. Missing values stay unavailable.';
  details.append(node('p', note));
  const wrap = node('div', undefined, 'game-decision-table');
  wrap.tabIndex = 0; wrap.setAttribute('role', 'region'); wrap.setAttribute('aria-label', 'Player stat comparison; scroll horizontally for all players');
  const table = node('table'); table.append(node('caption', baseline ? `Player stat comparison with outgoing player ${baseline.name}` : 'Candidates from this board'));
  const head = node('thead'), row = node('tr');
  ['Metric', ...(baseline ? [`Outgoing: ${baseline.name}`] : []), ...players.map(player => player.name)].forEach(text => {
    const cell = node('th', text); cell.scope = 'col'; row.append(cell);
  });
  head.append(row); table.append(head);
  const body = node('tbody');
  for (const metric of comparePublicPlayers(players, baseline)) {
    const tr = node('tr'), heading = node('th', metric.label); heading.scope = 'row'; tr.append(heading);
    [...(baseline ? [metric.baseline] : []), ...metric.values].forEach(value => tr.append(node('td', number(value))));
    body.append(tr);
  }
  table.append(body); wrap.append(table); details.append(wrap, node('small', 'On narrow screens, scroll the comparison sideways.'));
  return details;
}
export function decisionPreview(player, { action, description, pending = false }) {
  const section = node('section', undefined, 'game-decision-preview');
  const label = player?.displayName || player?.name || player?.playerName || 'Player unavailable';
  const heading = node('h3', `Review ${label}`); heading.id = 'decisionPreviewTitle';
  section.append(heading, node('p', description));
  const actions = node('div', undefined, 'fix-five-result-actions');
  const confirm = node('button', pending ? 'Checking…' : action, 'button');
  confirm.type = 'button'; confirm.dataset.action = 'confirm'; confirm.disabled = pending;
  const cancel = node('button', 'Back to candidates', 'button-secondary');
  cancel.type = 'button'; cancel.dataset.action = 'cancel-preview'; cancel.disabled = pending;
  actions.append(confirm, cancel); section.append(actions);
  return section;
}
export function draftChecklist(deck, selections) {
  const context = draftNeeds(deck, selections), section = node('section', undefined, 'game-draft-needs');
  if (!context) return section;
  section.setAttribute('aria-label', 'Remaining board roles');
  section.append(node('strong', `${context.picked}/5 picks committed · ${context.remaining.length} remaining`),
    node('p', context.remaining.length ? `Still to fill: ${context.remaining.map(round => round.title).join(' · ')}` : 'Every board slot is filled.'),
    node('small', context.note));
  return section;
}
export function decisionDebrief(title, lines) {
  const section = node('section', undefined, 'game-decision-debrief');
  section.append(node('h3', title));
  const list = node('ul'); lines.forEach(text => list.append(node('li', text))); section.append(list);
  return section;
}

/*
 * Keep the result contract visible without turning a decision rank or the
 * separate game reward into a basketball rating.  Daily-game callers pass the
 * result response; only the result summary fields below
 * are rendered.
 */
export function resultPassportPanel(result, { title = 'Result summary' } = {}) {
  const passport = result?.resultPassport || result;
  const section = node('section', undefined, 'game-result-passport');
  const headingTitle = title === 'Result summary' ? 'What this result means' : title;
  section.setAttribute('aria-label', headingTitle);
  const heading = node('div', undefined, 'game-result-passport__heading');
  heading.append(node('span', 'Result summary', 'kicker'), node('h3', headingTitle));
  section.append(heading);

  const native = passport?.nativeOutcome;
  const decision = passport?.decision;
  const points = passport?.gamePoints;
  const proofStatus = decisionProofStatus(decision);
  const nativeValue = Number(native?.value);
  const hasNativeValue = Number.isFinite(nativeValue) && typeof native?.unit === 'string' && native.unit;
  const nativeLabel = hasNativeValue
    ? `${nativeValue > 0 ? '+' : ''}${Number(nativeValue.toFixed(1))} ${native.unit}`
    : 'Unavailable';
  const nativeDetail = hasNativeValue
    ? `${humanizeNativeKind(native.kind)} · ${humanizeNativeState(native.state)}`
    : 'No basketball measure was returned; rank is not a player rating.';
  const rank = Number(decision?.rank);
  const optionCount = Number(decision?.optionCount);
  const rankLabel = proofStatus.rankComplete
    ? `#${rank} of ${optionCount}`
    : decision && (decision.rank !== undefined || decision.optionCount !== undefined)
      ? proofStatus.bestLegalChoiceProven ? 'Best legal choice; full count unavailable' : 'Bounded ranking; full count unavailable'
      : 'Unavailable';
  const rankDetail = proofStatus.rankComplete
    ? `${humanizeDecisionState(decision.state)} · all legal choices searched`
    : proofStatus.bestLegalChoiceProven
      ? 'Best legal choice found; full count unavailable.'
      : Number.isSafeInteger(decision?.search?.evaluatedChoices) && decision.search.evaluatedChoices > 0
        ? 'Rank covers the choices evaluated; full legal-choice count unavailable.'
        : 'Full legal-choice ranking unavailable.';
  const decisionQuality = decisionQualityLabel(decision, proofStatus);
  const pointsLabel = Number.isInteger(points?.total) && Number.isInteger(points?.max)
    ? `${points.total}/${points.max}`
    : 'Unavailable';
  const pointsDetail = points?.ruleVersion === 'swishiq-game-points-v2'
    ? '1 point for a legal choice plus up to 9 from a complete rank. No placement bonus without a complete rank; not a basketball rating.'
    : points?.ruleVersion === 'swishiq-game-points-v1'
      ? 'Game reward for a legal choice, rule completion, and rank; not a basketball rating.'
      : 'Separate game reward; policy unavailable.';
  const summary = node('div', undefined, 'game-result-passport__summary');
  const quality = node('div', undefined, `game-result-passport__featured${decisionQuality !== 'Unavailable' ? ' game-result-passport__featured--available' : ''}`);
  quality.append(node('span', 'Decision quality'), node('strong', decisionQuality), node('small', rankDetail));
  const rankCard = node('div', undefined, 'game-result-passport__rank');
  rankCard.append(node('span', proofStatus.rankComplete ? 'Legal rank' : 'Rank scope'), node('strong', rankLabel));
  summary.append(quality, rankCard);
  section.append(summary);

  const metrics = node('dl', undefined, 'game-result-passport__metrics');
  metrics.setAttribute('aria-label', 'Result Passport values');
  metrics.append(
    resultMetric('Basketball outcome', nativeLabel, nativeDetail),
    resultMetric('Game Points', pointsLabel, pointsDetail),
  );
  section.append(metrics);

  const coverage = native?.coverage;
  const uncertainty = native?.uncertainty;
  const evidenceContext = resultPassportEvidenceContext(passport);
  const contextLabel = value => {
    if (typeof value === 'string') return value;
    if (!value || typeof value !== 'object') return '';
    if (value.kind && Array.isArray(value.seasonStartYears) && value.seasonStartYears.length) return `${value.seasonStartYears.join(', ')}`;
    if (value.status && Number.isInteger(value.observations)) return `${value.observations} observations`;
    return '';
  };
  section.append(renderResultContext(document, {
    scope: contextLabel(evidenceContext.scope) || 'Result scope unavailable',
    phase: contextLabel(evidenceContext.phase) || 'Phase unavailable',
    denominator: contextLabel(evidenceContext.denominator) || 'Denominator unavailable',
    coverage: contextLabel(evidenceContext.coverage) || 'Sample coverage unavailable',
    uncertainty: contextLabel(evidenceContext.uncertainty) || 'Uncertainty interval unavailable',
  }));
  const boundary = node('p', undefined, 'game-result-passport__boundary');
  const coverageText = coverage?.status
    ? `Coverage: ${coverage.status}${Number.isInteger(coverage.observations) ? ` · ${coverage.observations} player-impact rows` : ''}.`
    : 'Coverage is not reported.';
  const uncertaintyText = uncertainty?.status === 'interval' && Number.isFinite(uncertainty.lower) && Number.isFinite(uncertainty.upper)
    ? ` Uncertainty: ${uncertainty.lower} to ${uncertainty.upper} ${uncertainty.unit || native?.unit || ''}.`
    : ' Uncertainty interval is not available.';
  boundary.textContent = `${coverageText}${uncertaintyText}`;
  section.append(boundary);
  return section;
}

function decisionQualityLabel(decision, proofStatus) {
  if (proofStatus.bestLegalChoiceProven) return 'Best legal choice';
  if (decision?.state === 'best-found' || decision?.quality === 'best-found') {
    return 'Best found among evaluated choices';
  }
  if (proofStatus.rankComplete) return `Legal choice ${decision.rank} of ${decision.optionCount}`;
  return 'Decision quality unavailable';
}

function resultMetric(label, value, detail) {
  const item = node('div');
  item.append(node('dt', label), node('dd', value));
  if (detail) item.querySelector('dd').append(node('small', detail));
  return item;
}

function humanizeNativeKind(value) {
  return String(value || 'Native outcome').replaceAll('-', ' ')
    .replace(/\b\w/g, character => character.toUpperCase());
}

function humanizeNativeState(value) {
  return String(value || 'state unavailable').replaceAll('-', ' ');
}

function humanizeDecisionState(value) {
  return String(value || 'Decision state unavailable').replaceAll('-', ' ');
}

export function decisionHistoryPanel(report) {
  const details = node('details', undefined, 'game-decision-details'); details.dataset.decisionHistory = '';
  details.append(node('summary', `Decision history · ${report.count} checked ${report.count === 1 ? 'choice' : 'choices'}`));
  details.append(node('p', report.note));
  if (!report.first) return details;
  const rankCopy = entry => {
    if (!entry) return 'Unavailable';
    if (entry.countComplete === true && Number.isInteger(entry.rank) && Number.isInteger(entry.optionCount)) {
      return `rank ${entry.rank} of ${entry.optionCount}`;
    }
    if (entry.bestLegalChoiceProven === true) return 'best legal choice found; full count unavailable';
    return 'ranking covers evaluated choices; full count unavailable';
  };
  const pointLabel = entry => {
    const points = entry?.points;
    return Number.isInteger(points?.total) && Number.isInteger(points?.max)
      ? `Game points ${points.total}/${points.max}`
      : 'Game points unavailable';
  };
  details.append(node('p', `First checked: ${rankCopy(report.first)} (${pointLabel(report.first)}). Current: ${rankCopy(report.current)} (${pointLabel(report.current)}).`));
  details.append(node('p', report.best
    ? `Best checked: ${rankCopy(report.best)}.`
    : 'Best checked: unavailable because the full legal-choice count is missing.'));
  const delta = report.rankChange;
  details.append(node('p', Number.isInteger(delta)
    ? delta > 0 ? `Your current choice moved ${delta} place(s) up this same board.`
      : delta < 0 ? `Your current choice moved ${Math.abs(delta)} place(s) down this same board.`
        : 'Your current choice has the same rank as your first checked choice. A tied rank does not establish equal basketball ability.'
    : 'Rank change is unavailable because the full legal-choice count is missing for one or both choices.'));
  const list = node('ol');
  for (const entry of report.recent) list.append(node('li', `Choice ${entry.number}: ${entry.names.join(' + ')} · ${rankCopy(entry)} · ${pointLabel(entry)}`));
  details.append(list, node('small', 'Shows up to eight recent choices. This reflects this board, not a player rating.'));
  return details;
}
