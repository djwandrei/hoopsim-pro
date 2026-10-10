import {
  attachResultPassport,
  createLineupScenarioEnvelope,
  decisionProofStatus,
  isResultPassport,
  resultPassportEvidenceContext,
  resultPassportFromOptimizerResult,
  validateResultPassport,
} from './result-passport.js?v=20260929e&rev=game-points-v2-20260929e';

// Lineup Lab and the public game surfaces share one Result Passport module
// instance. Re-export the pure passport builders from this already-loaded
// visual edge so consumers do not request the same file under a second cache
// key during startup.
export {
  attachResultPassport,
  createLineupScenarioEnvelope,
  resultPassportFromOptimizerResult,
};

/**
 * Browser-native, evidence-bound result visuals for the SwishIQ fan-tool
 * surfaces. The module intentionally has no chart dependency. Every renderer
 * emits the same context labels and an exact-value table, and refuses to draw
 * when its source context or values are incomplete.
 */

export const SWISHIQ_RESULT_VISUALS_VERSION = 'swishiq-result-visuals-v1';

const text = value => String(value ?? '').trim();
const numberOrNull = value => {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? number : null;
};
const CONTEXT_FIELDS = Object.freeze([
  ['scope', 'Scope'],
  ['phase', 'Phase'],
  ['denominator', 'Denominator'],
  ['coverage', 'Sample coverage'],
  ['evidence', 'Evidence'],
  ['reliability', 'Reliability'],
  ['uncertainty', 'Uncertainty'],
]);
let visualId = 0;

function element(documentRef, tag, className = '', content = '') {
  const node = documentRef.createElement(tag);
  if (className) node.className = className;
  if (content !== undefined && content !== null) node.textContent = String(content);
  return node;
}

function nextId(prefix = 'swishiqVisual') {
  visualId += 1;
  return `${prefix}-${visualId}`;
}

function displayValue(value, unit = '') {
  if (value === null || value === undefined || value === '') return 'Unavailable';
  const raw = typeof value === 'number' ? String(value) : text(value);
  return unit && raw !== 'Unavailable' ? `${raw} ${unit}` : raw;
}

function displayContextValue(value) {
  if (value === null || value === undefined || value === '') return 'Unavailable';
  if (typeof value === 'object') {
    if (value.kind && Array.isArray(value.seasonStartYears) && value.seasonStartYears.length) {
      return `${value.kind} · ${value.seasonStartYears.join(', ')}`;
    }
    if (value.label) return String(value.label);
    if (value.status && Number.isInteger(value.observations)) return `${value.status} · ${value.observations} observations`;
    try { return JSON.stringify(value); } catch { return 'Unavailable'; }
  }
  return String(value);
}

/**
 * Normalize the context shared by every visual. `complete` is deliberately
 * strict: charts cannot silently omit scope, denominator, evidence, or
 * reliability just because a caller has a convenient fallback string.
 */
export function normalizeVisualContext(context = {}) {
  const source = context && typeof context === 'object' ? context : {};
  const normalized = {};
  CONTEXT_FIELDS.forEach(([key]) => {
    normalized[key] = text(source[key]) || 'Unavailable';
  });
  normalized.complete = CONTEXT_FIELDS
    .filter(([key]) => key !== 'uncertainty')
    .every(([key]) => normalized[key] !== 'Unavailable');
  normalized.hasUncertainty = normalized.uncertainty !== 'Unavailable';
  return normalized;
}

export function normalizeVisualRows(rows, options = {}) {
  const source = Array.isArray(rows) ? rows : [];
  return source.map((row, index) => {
    const item = row && typeof row === 'object' ? row : {};
    const value = numberOrNull(item.value ?? item.amount ?? item.score);
    const label = text(item.label ?? item.name ?? item.key) || `Row ${index + 1}`;
    return {
      label,
      value,
      valueLabel: item.valueLabel === undefined ? null : text(item.valueLabel),
      unit: text(item.unit ?? options.unit),
      status: text(item.status) || (value === null ? 'unavailable' : 'available'),
    };
  });
}

export function usableVisualRows(rows, options = {}) {
  return normalizeVisualRows(rows, options).filter(row => row.value !== null);
}

function contextBlock(documentRef, context) {
  const normalized = normalizeVisualContext(context);
  const list = element(documentRef, 'dl', 'swishiq-result-visual__context');
  list.setAttribute('aria-label', 'Result scope and coverage');
  CONTEXT_FIELDS.filter(([key]) => !['evidence', 'reliability'].includes(key)).forEach(([key, label]) => {
    const wrapper = element(documentRef, 'div');
    wrapper.append(element(documentRef, 'dt', '', label), element(documentRef, 'dd', '', normalized[key]));
    list.append(wrapper);
  });
  return list;
}

function visualHeading(documentRef, figure, title, summary) {
  const headingId = nextId('swishiqVisualTitle');
  const caption = element(documentRef, 'figcaption', 'swishiq-result-visual__caption');
  const heading = element(documentRef, 'strong', '', title);
  heading.id = headingId;
  caption.append(heading);
  if (summary) caption.append(element(documentRef, 'span', '', summary));
  figure.setAttribute('aria-labelledby', headingId);
  figure.append(caption);
}

function exactTable(documentRef, title, columns, rows) {
  const wrap = element(documentRef, 'div', 'swishiq-result-visual__table-wrap');
  const table = element(documentRef, 'table', 'swishiq-result-visual__table');
  table.append(element(documentRef, 'caption', '', title));
  const thead = element(documentRef, 'thead');
  const headRow = element(documentRef, 'tr');
  columns.forEach(column => {
    const heading = element(documentRef, 'th', '', column);
    heading.scope = 'col';
    headRow.append(heading);
  });
  thead.append(headRow);
  const tbody = element(documentRef, 'tbody');
  (Array.isArray(rows) ? rows : []).forEach(row => {
    const tr = element(documentRef, 'tr');
    (Array.isArray(row) ? row : []).forEach((value, index) => {
      const cell = element(documentRef, index === 0 ? 'th' : 'td', '', value);
      if (index === 0) cell.scope = 'row';
      tr.append(cell);
    });
    tbody.append(tr);
  });
  table.append(tbody);
  wrap.append(table);
  return wrap;
}

function unavailable(documentRef, title, reason, context = {}) {
  const section = element(documentRef, 'section', 'swishiq-result-visual swishiq-result-visual--unavailable');
  const headingId = nextId('swishiqUnavailableTitle');
  const heading = element(documentRef, 'h3', '', title);
  heading.id = headingId;
  section.setAttribute('aria-labelledby', headingId);
  section.append(heading, element(documentRef, 'p', 'swishiq-result-visual__status', reason || 'The accepted evidence is unavailable; no visual was rendered.'));
  section.append(contextBlock(documentRef, context));
  return section;
}

function visualShell(documentRef, title, summary, context, className = '') {
  const figure = element(documentRef, 'figure', `swishiq-result-visual ${className}`.trim());
  visualHeading(documentRef, figure, title, summary);
  figure.append(contextBlock(documentRef, context));
  return figure;
}

function renderRowsAsBars(documentRef, figure, rows, options = {}) {
  const numericRows = rows.filter(row => row.value !== null);
  if (!numericRows.length) return false;
  // A published all-zero result is still an observed value. Use a neutral
  // unit scale so the exact table remains paired with a visible, non-invented
  // zero bar instead of turning valid zeros into an unavailable state.
  const max = Math.max(...numericRows.map(row => Math.abs(row.value)), 1);
  const list = element(documentRef, 'div', 'swishiq-result-visual__bars');
  list.setAttribute('role', 'list');
  list.setAttribute('aria-label', options.ariaLabel || 'Exact result values');
  numericRows.forEach(row => {
    const item = element(documentRef, 'div', 'swishiq-result-visual__bar-row');
    item.setAttribute('role', 'listitem');
    item.tabIndex = 0;
    const label = element(documentRef, 'span', 'swishiq-result-visual__bar-label', row.label);
    const track = element(documentRef, 'span', 'swishiq-result-visual__bar-track');
    const fill = element(documentRef, 'span', 'swishiq-result-visual__bar-fill');
    fill.style.setProperty('--swishiq-bar-width', `${Math.max(2, Math.min(100, Math.abs(row.value) / max * 100))}%`);
    fill.dataset.sign = row.value < 0 ? 'negative' : 'positive';
    track.append(fill);
    const value = row.valueLabel || displayValue(row.value, row.unit);
    const valueNode = element(documentRef, 'strong', 'swishiq-result-visual__bar-value', value);
    item.setAttribute('aria-label', `${row.label}: ${value}`);
    item.append(label, track, valueNode);
    list.append(item);
  });
  figure.append(list);
  return true;
}

function exactRowsForBars(rows) {
  return rows.map(row => [row.label, row.valueLabel || displayValue(row.value, row.unit), row.status]);
}

/** Render a responsive quantitative bar visual with its exact-value table. */
export function renderResponsiveBars(documentRef = globalThis.document, options = {}) {
  if (!documentRef) return null;
  const context = normalizeVisualContext(options.context);
  const rows = usableVisualRows(options.rows, options);
  if (!context.complete) return unavailable(documentRef, options.title || 'Result visual', 'The visual is unavailable because its scope, denominator, coverage, evidence, or reliability label is incomplete.', context);
  if (!rows.length) return unavailable(documentRef, options.title || 'Result visual', options.emptyMessage || 'Accepted values are unavailable; no visual was rendered.', context);
  const figure = visualShell(documentRef, options.title || 'Result visual', options.summary || 'Values are shown from the accepted result rows.', context, options.className || '');
  if (!renderRowsAsBars(documentRef, figure, rows, options)) return unavailable(documentRef, options.title || 'Result visual', 'All accepted values are zero or unavailable; no visual was rendered.', context);
  figure.append(exactTable(documentRef, options.tableTitle || 'Exact values', options.columns || ['Measure', 'Value', 'Status'], exactRowsForBars(rows)));
  return figure;
}

/** Render qualitative role coverage without converting statuses into scores. */
export function renderRoleCoverageVisual(documentRef = globalThis.document, options = {}) {
  if (!documentRef) return null;
  const context = normalizeVisualContext(options.context);
  const source = Array.isArray(options.rows) ? options.rows : [];
  const rows = source.map((row, index) => {
    const item = row && typeof row === 'object' ? row : {};
    return {
      label: text(item.label ?? item.role ?? item.name) || `Role ${index + 1}`,
      status: text(item.status ?? item.coverageStatus) || 'unavailable',
      value: numberOrNull(item.value ?? item.coverage),
      valueLabel: item.valueLabel === undefined ? null : text(item.valueLabel),
      evidence: text(item.evidence) || 'Evidence unavailable',
    };
  }).filter(row => row.status !== 'unavailable' || row.value !== null);
  if (!context.complete) return unavailable(documentRef, options.title || 'Role coverage', 'Role coverage is unavailable because its evidence context is incomplete.', context);
  if (!rows.length) return unavailable(documentRef, options.title || 'Role coverage', 'Accepted role coverage is unavailable; no visual was rendered.', context);
  const figure = visualShell(documentRef, options.title || 'Role coverage', options.summary || 'Qualitative statuses remain explicit; no status is converted into a made-up score.', context, options.className || '');
  const list = element(documentRef, 'ul', 'swishiq-result-visual__role-list');
  list.setAttribute('aria-label', 'Role coverage summary');
  rows.forEach(row => {
    const item = element(documentRef, 'li', 'swishiq-result-visual__role');
    item.tabIndex = 0;
    item.dataset.status = row.status;
    item.append(element(documentRef, 'strong', '', row.label), element(documentRef, 'span', '', row.status));
    if (row.value !== null || row.valueLabel) item.append(element(documentRef, 'small', '', row.valueLabel || displayValue(row.value)));
    item.setAttribute('aria-label', `${row.label}: ${row.status}${row.value !== null ? `, ${displayValue(row.value)}` : ''}`);
    list.append(item);
  });
  figure.append(list, exactTable(documentRef, options.tableTitle || 'Exact role coverage values', ['Role', 'Status', 'Value', 'Evidence'], rows.map(row => [row.label, row.status, row.valueLabel || displayValue(row.value), row.evidence])));
  return figure;
}

/** Render contribution shares as bars and retain the exact shares below. */
export function renderContributionVisual(documentRef = globalThis.document, options = {}) {
  return renderResponsiveBars(documentRef, {
    ...options,
    title: options.title || 'Contribution by source',
    summary: options.summary || 'Bars show accepted source contributions; the table preserves exact shares.',
    tableTitle: options.tableTitle || 'Exact contribution values',
    columns: options.columns || ['Source', 'Share', 'Status'],
    unit: options.unit || 'share',
  });
}

/** Render an observed-versus-modeled or before-versus-after comparison. */
export function renderBeforeAfterVisual(documentRef = globalThis.document, options = {}) {
  if (!documentRef) return null;
  const context = normalizeVisualContext(options.context);
  const rows = (Array.isArray(options.rows) ? options.rows : []).map((row, index) => {
    const item = row && typeof row === 'object' ? row : {};
    return {
      label: text(item.label ?? item.name) || `Measure ${index + 1}`,
      before: numberOrNull(item.before),
      after: numberOrNull(item.after),
      beforeLabel: item.beforeLabel === undefined ? null : text(item.beforeLabel),
      afterLabel: item.afterLabel === undefined ? null : text(item.afterLabel),
      unit: text(item.unit ?? options.unit),
    };
  }).filter(row => row.before !== null && row.after !== null);
  if (!context.complete) return unavailable(documentRef, options.title || 'Before and after', 'The comparison is unavailable because its evidence context is incomplete.', context);
  if (!rows.length) return unavailable(documentRef, options.title || 'Before and after', 'Both accepted values are required; no comparison was rendered.', context);
  const figure = visualShell(documentRef, options.title || 'Before and after', options.summary || 'Before and after values are shown without implying causality.', context, options.className || '');
  const list = element(documentRef, 'div', 'swishiq-result-visual__before-after');
  list.setAttribute('role', 'list');
  rows.forEach(row => {
    const item = element(documentRef, 'div', 'swishiq-result-visual__comparison-row');
    item.setAttribute('role', 'listitem');
    item.tabIndex = 0;
    const before = row.beforeLabel || displayValue(row.before, row.unit);
    const after = row.afterLabel || displayValue(row.after, row.unit);
    item.append(element(documentRef, 'strong', '', row.label), element(documentRef, 'span', '', `${options.beforeLabel || 'Before'}: ${before}`), element(documentRef, 'span', '', `${options.afterLabel || 'After'}: ${after}`));
    item.setAttribute('aria-label', `${row.label}. ${options.beforeLabel || 'Before'} ${before}. ${options.afterLabel || 'After'} ${after}.`);
    list.append(item);
  });
  figure.append(list, exactTable(documentRef, options.tableTitle || 'Exact before and after values', ['Measure', options.beforeLabel || 'Before', options.afterLabel || 'After'], rows.map(row => [row.label, row.beforeLabel || displayValue(row.before, row.unit), row.afterLabel || displayValue(row.after, row.unit)])));
  return figure;
}

/** Render a time series with explicit gap rows and an exact table. */
export function renderTimelineVisual(documentRef = globalThis.document, options = {}) {
  if (!documentRef) return null;
  const context = normalizeVisualContext(options.context);
  const source = Array.isArray(options.rows) ? options.rows : [];
  const rows = source.map((row, index) => {
    const item = row && typeof row === 'object' ? row : {};
    const value = numberOrNull(item.value ?? item.amount ?? item.score);
    return {
      label: text(item.label ?? item.season ?? item.name) || `Point ${index + 1}`,
      value,
      valueLabel: item.valueLabel === undefined ? null : text(item.valueLabel),
      unit: text(item.unit ?? options.unit),
      status: text(item.status) || (value === null ? 'gap' : 'observed'),
    };
  });
  if (!context.complete) return unavailable(documentRef, options.title || 'Timeline', 'The timeline is unavailable because its evidence context is incomplete.', context);
  if (!rows.some(row => row.value !== null)) return unavailable(documentRef, options.title || 'Timeline', 'Accepted timeline values are unavailable; gaps are retained without inventing a line.', context);
  const figure = visualShell(documentRef, options.title || 'Timeline', options.summary || 'Missing periods remain gaps and are not treated as zero.', context, options.className || '');
  const numericRows = rows.filter(row => row.value !== null);
  const max = Math.max(...numericRows.map(row => Math.abs(row.value)), 1);
  const list = element(documentRef, 'div', 'swishiq-result-visual__timeline');
  list.setAttribute('role', 'list');
  rows.forEach(row => {
    const item = element(documentRef, 'div', 'swishiq-result-visual__timeline-row');
    item.setAttribute('role', 'listitem');
    item.tabIndex = 0;
    item.dataset.status = row.status;
    item.append(element(documentRef, 'span', 'swishiq-result-visual__timeline-label', row.label));
    const track = element(documentRef, 'span', 'swishiq-result-visual__bar-track');
    const fill = element(documentRef, 'span', 'swishiq-result-visual__bar-fill');
    if (row.value !== null) fill.style.setProperty('--swishiq-bar-width', `${Math.max(2, Math.min(100, Math.abs(row.value) / max * 100))}%`);
    track.append(fill);
    const rendered = row.valueLabel || displayValue(row.value, row.unit);
    item.append(track, element(documentRef, 'strong', 'swishiq-result-visual__bar-value', rendered));
    item.setAttribute('aria-label', `${row.label}: ${rendered}`);
    list.append(item);
  });
  figure.append(list, exactTable(documentRef, options.tableTitle || 'Exact timeline values', ['Period', 'Value', 'Status'], rows.map(row => [row.label, row.valueLabel || displayValue(row.value, row.unit), row.status])));
  return figure;
}

function renderPassportPins(documentRef, passport) {
  const evidence = passport?.evidence && typeof passport.evidence === 'object' ? passport.evidence : {};
  const board = evidence.boardRef && typeof evidence.boardRef === 'object' ? evidence.boardRef : {};
  const packageRef = board.packageRef && typeof board.packageRef === 'object' ? board.packageRef : {};
  const scope = packageRef.scope && typeof packageRef.scope === 'object' ? packageRef.scope : {};
  const rows = [];
  const add = (label, value) => {
    if (value === undefined || value === null || value === '') return;
    rows.push([label, typeof value === 'object' ? JSON.stringify(value) : String(value)]);
  };
  add('Board', board.boardId);
  add('Board content pin', board.boardContentSha256);
  add('Package', packageRef.packageId);
  add('Package version', packageRef.packageVersion);
  add('Package scope', scope.kind || scope.seasonStartYear || scope.seasonEndYear);
  add('Phase', packageRef.phase);
  add('Registry revision', packageRef.registryRevisionSha256);
  return rows;
}

/**
 * Render a Result Passport as a browser-safe, keyboard-readable visual.
 * Numeric values are paired with an exact table; evidence labels and source
 * notes are rendered separately so a chart can never stand in for provenance.
 * Invalid or incomplete Passports fail closed to an unavailable panel.
 */
export function renderResultPassport(documentRef = globalThis.document, value, options = {}) {
  if (!documentRef) return null;
  const passport = value?.resultPassport || value;
  if (!isResultPassport(passport)) {
    return unavailable(documentRef, options.title || 'Result Passport', 'The Result Passport is unavailable; no values were rendered.', options.context || {});
  }
  try {
    validateResultPassport(passport, { requireEvidence: options.requireEvidence === true });
  } catch {
    return unavailable(documentRef, options.title || 'Result Passport', 'The Result Passport failed validation; no values were rendered.', options.context || {});
  }

  const context = resultPassportEvidenceContext(passport);
  const figure = visualShell(documentRef, options.title || 'Result Passport', options.summary || 'Native outcome, decision proof, and game reward remain separate.', {
    scope: displayContextValue(context.scope),
    phase: displayContextValue(context.phase),
    denominator: displayContextValue(context.denominator),
    coverage: displayContextValue(context.coverage),
    evidence: displayContextValue(context.evidenceLabel),
    reliability: displayContextValue(context.reliability),
    uncertainty: displayContextValue(context.uncertainty),
  }, options.className || 'swishiq-result-visual--passport');

  const native = passport.nativeOutcome || {};
  const decision = passport.decision || {};
  const points = passport.gamePoints || {};
  const proofStatus = decisionProofStatus(decision);
  const nativeValue = numberOrNull(native.value);
  const unit = text(native.unit);
  const nativeLabel = nativeValue === null ? 'Unavailable' : `${nativeValue > 0 ? '+' : ''}${nativeValue} ${unit}`.trim();
  const rankLabel = proofStatus.rankComplete
    ? `#${decision.rank} of ${decision.optionCount}`
    : decision && (decision.rank !== undefined || decision.optionCount !== undefined)
      ? proofStatus.bestLegalChoiceProven ? 'Best legal choice proven; full count unavailable' : 'Bounded ranking; full count not proven'
      : 'Unavailable';
  const decisionProofLabel = proofStatus.bestLegalChoiceProven
    ? 'Best legal choice proven'
    : proofStatus.rankComplete
      ? decision.quality === 'best-found' ? 'Best found among evaluated choices' : 'Complete rank proof'
      : decision ? proofStatus.disclosure : 'Decision ranking proof unavailable.';
  const pointsLabel = Number.isInteger(points.total) && Number.isInteger(points.max)
    ? `${points.total}/${points.max}` : 'Unavailable';

  const summary = element(documentRef, 'dl', 'swishiq-result-visual__passport-summary');
  summary.setAttribute('aria-label', 'Result Passport summary');
  [
    ['Native outcome', nativeLabel],
    [proofStatus.rankComplete ? 'Legal rank' : 'Search proof', rankLabel],
    ['Game Points', pointsLabel],
  ].forEach(([label, rendered]) => {
    const item = element(documentRef, 'div');
    item.append(element(documentRef, 'dt', '', label), element(documentRef, 'dd', '', rendered));
    summary.append(item);
  });
  figure.append(summary);

  if (nativeValue !== null) {
    const chart = renderResponsiveBars(documentRef, {
      title: 'Native outcome value',
      summary: 'The bar is a visual aid; the exact value and unit remain in the table.',
      rows: [{ label: native.kind || 'Native outcome', value: nativeValue, valueLabel: nativeLabel, unit, status: native.state || 'available' }],
      context: {
        scope: displayContextValue(context.scope),
        phase: displayContextValue(context.phase),
        denominator: displayContextValue(context.denominator),
        coverage: displayContextValue(context.coverage),
        evidence: displayContextValue(context.evidenceLabel),
        reliability: displayContextValue(context.reliability),
        uncertainty: displayContextValue(context.uncertainty),
      },
      className: 'swishiq-result-visual--passport-native',
      tableTitle: 'Exact native outcome value',
      columns: ['Measure', 'Value', 'State'],
    });
    if (chart) figure.append(chart);
  }

  const exactRows = [
    ['Native outcome', nativeLabel, native.state || 'Unavailable'],
    [proofStatus.rankComplete ? 'Decision rank' : 'Search proof', rankLabel, decisionProofLabel],
    ['Game Points', pointsLabel, points.ruleVersion || 'Unavailable'],
  ];
  figure.append(exactTable(documentRef, 'Exact Result Passport values', ['Measure', 'Value', 'Evidence state'], exactRows));

  const source = element(documentRef, 'aside', 'swishiq-result-visual__passport-source');
  source.setAttribute('aria-label', 'Result Passport evidence and source notes');
  source.append(element(documentRef, 'h4', '', context.evidenceLabel));
  source.append(element(documentRef, 'p', '', 'Source note: ' + context.sourceNote));
  const sourceNotes = passport.evidence && Array.isArray(passport.evidence.sourceNotes)
    ? passport.evidence.sourceNotes : [];
  if (sourceNotes.length) {
    const list = element(documentRef, 'ul');
    list.setAttribute('aria-label', 'Additional source notes');
    sourceNotes.forEach(note => list.append(element(documentRef, 'li', '', note)));
    source.append(list);
  }
  const pins = renderPassportPins(documentRef, passport);
  if (pins.length) source.append(exactTable(documentRef, 'Hash-bound replay pins', ['Pin', 'Value'], pins));
  figure.append(source);
  return figure;
}

export function renderResultContext(documentRef = globalThis.document, context = {}) {
  return documentRef ? contextBlock(documentRef, context) : null;
}
