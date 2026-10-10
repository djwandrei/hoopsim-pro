import { hash } from './artifacts.mjs';

export function validLocalDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(value + 'T00:00:00Z'))
    && new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value;
}
const finite = Number.isFinite;
export function indexChronology(rows, { kind = 'forecast' } = {}) {
  if (!Array.isArray(rows) || !rows.length || !['forecast', 'feature'].includes(kind)) throw Error('Nonempty forecast/feature rows required');
  const seen = new Set(), dates = [], seasons = new Map();
  let previous = null;
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index], date = row.gameDateLocal;
    if (typeof row.gameRef !== 'string' || !row.gameRef.trim() || seen.has(row.gameRef)
      || !validLocalDate(date) || !Number.isSafeInteger(row.seasonStartYear)) throw Error('Invalid or duplicate game identity at row ' + index);
    const teamRef = value => typeof value === 'string' && value.trim().length > 0 || Number.isSafeInteger(value);
    if (!teamRef(row.homeTeamRef) || !teamRef(row.awayTeamRef) || row.homeTeamRef === row.awayTeamRef) throw Error('Paired distinct home/away team references required: ' + row.gameRef);
    if (previous && (previous.gameDateLocal > date || previous.gameDateLocal === date && previous.gameRef.localeCompare(row.gameRef) > 0)) throw Error('Require date/game-ref order; sorting belongs to explicit preparation, not implicit scoring');
    seen.add(row.gameRef);
    const fields = kind === 'forecast' ? ['featureObservedThrough', 'coefficientObservedThrough', 'standardizationObservedThrough'] : ['observedThrough'];
    for (const field of fields) if (!validLocalDate(row[field]) || row[field] >= date) throw Error('Prior-date cutoff failed: ' + row.gameRef + '/' + field);
    const target = row.target;
    if (!target || !finite(target.homeScore) || !finite(target.awayScore) || target.homeScore < 0 || target.awayScore < 0
      || target.homeScore === target.awayScore || target.total !== target.homeScore + target.awayScore || target.margin !== target.homeScore - target.awayScore) throw Error('Incoherent outcome: ' + row.gameRef);
    if (kind === 'forecast') {
      const p = row.prediction;
      if (typeof row.modelVersion !== 'string' || !row.modelVersion.trim()) throw Error('Mean model version required: ' + row.gameRef);
      if (!p || !finite(p.total) || !finite(p.margin) || !finite(p.homeScore) || !finite(p.awayScore)
        || Math.abs(p.total - (p.homeScore + p.awayScore)) > 1e-9 || Math.abs(p.margin - (p.homeScore - p.awayScore)) > 1e-9) throw Error('Incoherent forecast: ' + row.gameRef);
    } else if (!row.features?.total || !row.features?.margin) throw Error('Head features required: ' + row.gameRef);
    if (!dates.length || dates.at(-1).date !== date) dates.push({ date, ordinal: Date.parse(date + 'T00:00:00Z') / 86400000, start: index, end: index + 1 });
    else dates.at(-1).end = index + 1;
    if (!seasons.has(row.seasonStartYear)) seasons.set(row.seasonStartYear, []);
    seasons.get(row.seasonStartYear).push(index);
    previous = row;
  }
  for (const batch of dates) if (new Set(rows.slice(batch.start, batch.end).map(row => row.seasonStartYear)).size !== 1) throw Error('One local date belongs to multiple season folds');
  const identity = rows.map(row => [row.gameRef, row.gameDateLocal, row.seasonStartYear, row.homeTeamRef ?? null, row.awayTeamRef ?? null, row.target]);
  return { format: 'swishiq-chronology-index-v1', kind, rowCount: rows.length, targetIdentitySha256: hash(identity),
    dates, seasons: Object.fromEntries([...seasons].sort((a, b) => a[0] - b[0])), sameLocalDateBatchingRequired: true };
}
export function validateSeasons(years, available) {
  if (!Array.isArray(years) || !years.length || years.some((year, i) => !Number.isSafeInteger(year) || i && year <= years[i - 1])) throw Error('Ascending unique season start years required');
  for (const year of years) if (!available[String(year)]) throw Error('Requested season is absent: ' + year);
  return years;
}
