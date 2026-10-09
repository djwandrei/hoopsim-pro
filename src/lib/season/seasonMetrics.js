// Missing metrics must remain unavailable; Number(null) would invent zero.
export const hasMetric = value => (typeof value === 'number'
  || (typeof value === 'string' && value.trim() !== '')) && Number.isFinite(Number(value));

export const formatProbability = value => hasMetric(value)
  ? `${Math.round(Number(value) * 100)}%` : '—';
