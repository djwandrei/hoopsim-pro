// These descriptive joins never promote the provider's unresolved identities
// into the canonical registry. A season/team/stat fingerprint is required.
export const nameKey = value => String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim();
const finite = value => value !== null && value !== undefined && value !== '' && typeof value !== 'boolean' && Number.isFinite(Number(value)) ? Number(value) : null;
const fields = { GP: 'games', PTS: 'points', AST: 'assists', REB: 'rebounds', FGA: 'fieldGoalAttempts', FGM: 'fieldGoalsMade', FG3A: 'threePointAttempts', FG3M: 'threePointersMade', FTA: 'freeThrowAttempts', FTM: 'freeThrowsMade', STL: 'steals', BLK: 'blocks', TOV: 'turnovers' };
export function boxFingerprintMatches(canonical, provider) {
  let compared = 0;
  for (const [key, source] of Object.entries(fields)) {
    const a = finite(canonical[source]), b = finite(provider[key]);
    if (a === null || b === null) continue;
    if (Math.abs(a - b) > .01) return false;
    compared++;
  }
  return compared >= 8;
}
const uniqueByName = records => {
  const map = new Map();
  for (const row of records) { const key = nameKey(row.values?.displayName); if (!key) continue; map.set(key, map.has(key) ? null : row); }
  return map;
};
export function createForgeEvidence(year, packageVersion, parts, context, combineRows) {
  const groups = new Map();
  for (const row of parts.seasons) {
    const v = row.values, ref = row.entities?.playerRef;
    if (!ref || row.time?.seasonStartYear !== year || row.time?.phase !== 'regular' || !v.observed) continue;
    if (!groups.has(ref)) groups.set(ref, { name: v.displayName, teams: new Set(), box: {}, positions: v.positions || [] });
    const group = groups.get(ref); group.teams.add(v.teamCode);
    for (const key of Object.values(fields)) {
      const value = finite(key === 'games' ? v.games : v.box?.[key]);
      group.box[key] = group.box[key] === null || value === null ? null : (group.box[key] || 0) + value;
    }
  }
  const canonical = new Map();
  for (const [ref, group] of groups) { const key = nameKey(group.name); canonical.set(key, canonical.has(key) ? null : { ref, ...group }); }
  const inSeason = rows => rows.filter(row => row.time?.seasonStartYear === year && row.time?.phase === 'regular' && row.values?.entityLevel === 'player');
  const base = uniqueByName(inSeason(parts.base)), clutch = uniqueByName(inSeason(parts.clutch)), hustle = uniqueByName(inSeason(parts.hustle)), defense = uniqueByName(inSeason(parts.defense));
  const physical = new Map();
  for (const row of context.records || []) {
    if (!row.nba?.roster) continue;
    const key = nameKey(row.name); physical.set(key, physical.has(key) ? null : row);
  }
  const records = {}, coverage = { eligible: groups.size, anchored: 0, clutch: 0, perimeter: 0, height: 0, wingspan: 0 };
  for (const [key, group] of canonical) {
    const anchor = base.get(key), v = anchor?.values;
    if (!group || !v || !group.teams.has(v.teamCode) || !boxFingerprintMatches(group.box, v.metrics)) continue;
    coverage.anchored++;
    const linked = map => {
      const row = map.get(key);
      return row && row.values.teamCode === v.teamCode && row.values.sourceDatasetVersion === v.sourceDatasetVersion ? row : null;
    };
    const c = linked(clutch), h = linked(hustle), d = linked(defense), cm = c?.values.metrics, hm = h?.values.metrics, dm = d?.values.metrics;
    const record = { anchor: anchor.recordId, join: 'exact-season-name-team-box-fingerprint', clutch: null, perimeter: null, body: null };
    if (cm && finite(cm.MIN) > 0) {
      record.clutch = { minutes: finite(cm.MIN), games: finite(cm.GP), points: finite(cm.PTS), fga: finite(cm.FGA), fgm: finite(cm.FGM), fta: finite(cm.FTA), ftm: finite(cm.FTM), turnovers: finite(cm.TOV), recordId: c.recordId };
      coverage.clutch++;
    }
    if (hm || dm) {
      record.perimeter = { minutes: finite(hm?.MIN), deflections: finite(hm?.DEFLECTIONS), defendedAttempts: finite(dm?.FGA_GT_15), defendedMakes: finite(dm?.FGM_GT_15), expectedPercentage: finite(dm?.NS_GT_15_PCT), recordIds: [h?.recordId, d?.recordId].filter(Boolean) };
      coverage.perimeter++;
    }
    // Current roster measurements stay labeled as a snapshot, not historical
    // season measurements. A matching BRef season fingerprint confirms identity.
    const profile = physical.get(key), roster = profile?.nba.roster;
    const seasons = profile?.basketballReference?.seasons || [];
    const verifiedSeason = seasons.find(s => s.seasonStartYear === year && s.seasonPhase === 'regular' && (group.teams.has(s.teamCode) || s.isMultiTeamAggregate) && boxFingerprintMatches(group.box, {
      GP: s.totals?.gamesPlayed, PTS: s.totals?.points, AST: s.totals?.assists, REB: s.totals?.totalRebounds, FGA: s.totals?.fieldGoalsAttempted, FGM: s.totals?.fieldGoalsMade, FG3A: s.totals?.threePointFieldGoalsAttempted, FG3M: s.totals?.threePointFieldGoalsMade, FTA: s.totals?.freeThrowsAttempted, FTM: s.totals?.freeThrowsMade, STL: s.totals?.steals, BLK: s.totals?.blocks, TOV: s.totals?.turnovers,
    }));
    if (verifiedSeason && finite(roster.height?.totalInches) >= 60 && finite(roster.height?.totalInches) <= 96) {
      const height = Number(roster.height.totalInches), weight = finite(roster.weightPounds);
      const observations = combineRows.filter(row => nameKey(row.values?.displayName) === key && row.values.observationType === 'anthropometry' && row.time?.seasonStartYear <= year && Math.abs(row.time.seasonStartYear - Number(roster.nbaStartYear)) <= 1
        && Math.abs(Number(row.values.measurements?.heightWithoutShoes?.value) - height) <= 2);
      const spans = [...new Set(observations.map(row => finite(row.values.measurements?.wingspan?.value)).filter(n => n >= height - 4 && n <= height + 16))];
      record.body = { height, weight, wingspan: spans.length === 1 ? spans[0] : null, position: verifiedSeason.listedPosition || roster.position, heightSource: roster.source?.url || 'https://www.nba.com/players', measurementScope: 'current-roster-snapshot', combineYear: spans.length === 1 ? observations[0].time.seasonStartYear : null };
      coverage.height++; if (record.body.wingspan !== null) coverage.wingspan++;
    }
    records[group.ref] = record;
  }
  return { format: 'djhc-forge-season-evidence-v1', year, packageVersion, policy: 'Descriptive game ratings only. No canonical identities or predictive eligibility are changed. Missing measurements remain null.', coverage, records };
}
