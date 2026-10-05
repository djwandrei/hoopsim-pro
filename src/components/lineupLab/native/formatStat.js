// One shared formatter for every native result surface (run summary, diff,
// player detail) so numbers read the same everywhere. Unknown data is shown
// as an em dash, never as a measured zero.
export function hasFiniteNumber(value) {
  return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
}

export function formatStat(value, digits = 1) {
  if (!hasFiniteNumber(value)) return '—';
  const number = Number(value);
  if (!Number.isFinite(number)) return '-';
  return number.toFixed(digits).replace(/\.0$/, '');
}