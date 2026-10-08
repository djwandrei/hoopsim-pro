export const finite = value => typeof value === 'number' && Number.isFinite(value);

export const formatMetric = (value, type) => (
  !finite(value) ? '—' : type === 'fraction' ? `${(value * 100).toFixed(1)}%` : value.toFixed(1)
);

export const formatDifference = (value, type) => {
  if (!finite(value)) return 'Unavailable';
  const sign = value > 0 ? '+' : value < 0 ? '−' : '±';
  const absolute = type === 'fraction' ? Math.abs(value) * 100 : Math.abs(value);
  return `${sign}${absolute.toFixed(1)}${type === 'fraction' ? ' pp' : ''}`;
};

export const formatTotal = (value, kind = 'minutes') => (
  !finite(value) ? 'Unavailable' : kind === 'games' ? Math.round(value).toLocaleString() : value.toLocaleString(undefined, { maximumFractionDigits: 1 })
);

export const initials = name => (
  String(name || '').trim().split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]?.toUpperCase()).join('') || 'PL'
);

export const seasonLabel = scope => {
  const start = Number(scope?.seasonStartYear);
  const end = Number(scope?.seasonEndYear);
  return Number.isInteger(start) && Number.isInteger(end) ? `${start}–${String(end).slice(-2)}` : 'selected season';
};

export const comboKindLabel = kind => (kind === 'exact-five' ? 'Exact five' : kind === 'shared-floor' ? 'Shared floor' : kind);

export const comboValueText = metric => (
  metric?.status !== 'available' || !finite(metric?.value)
    ? '—'
    : `${Number(metric.value.toFixed(1))} ${metric.unit === 'points-per-100' ? 'pts/100' : metric.unit || ''}`
);

export const comboEvidenceText = metric => {
  if (!metric) return 'Unavailable';
  const parts = [];
  if (metric.status === 'limited_sample') parts.push('Limited sample');
  const games = metric.games ?? metric.knownGames;
  if (Number.isSafeInteger(games) && games >= 0) parts.push(`${games} ${games === 1 ? 'game' : 'games'}`);
  const denominator = metric.denominator ?? metric.metricDenominator;
  if (finite(denominator) && denominator >= 0) parts.push(`denominator ${denominator}`);
  if (metric.status && metric.status !== 'available' && metric.status !== 'limited_sample') parts.push(metric.status);
  return parts.length ? parts.join(' · ') : 'Published';
};

export const rosterMetricValue = (row, key) => {
  if (key === 'games') return Number.isSafeInteger(row?.games) ? row.games : null;
  const metric = row?.metrics?.[key];
  return metric && finite(metric.value) ? metric.value : null;
};