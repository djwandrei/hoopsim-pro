export function careerSeasonsThroughCutoff(seasons, cutoffYear) {
  const rows = Array.isArray(seasons) ? seasons : [];
  if (!Number.isInteger(cutoffYear)) return [...rows];
  return rows.filter(row => Number.isInteger(row.year) && row.year <= cutoffYear);
}
