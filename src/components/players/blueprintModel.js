import { normalizePlayerName } from '@/lib/normalizePlayerName';
export const PHASES = [['regular','Regular season'],['in_season_tournament','In-season tournament'],['play_in','Play-in'],['playoffs','Playoffs']];
export const BLUEPRINT_STATS = [['pts','PPG','Scoring'],['ast','APG','Playmaking'],['reb','RPG','Rebounding'],['mpg','MPG','Minutes'],['fg','FG%','Field goals'],['three','3P%','Three-point'],['ft','FT%','Free throws'],['ts','TS%','True shooting'],['efg','eFG%','Effective field goals'],['stl','SPG','Steals'],['blk','BPG','Blocks'],['tov','TOV','Turnovers'],['oreb','OREB/G','Offensive rebounds'],['dreb','DREB/G','Defensive rebounds'],['pts36','PTS/36','Points per 36'],['gp','GP','Games played']];
const fraction = new Set(['fg','three','ft','ts','efg']);
export const statText = (key,value) => Number.isFinite(value) ? key === 'gp' ? String(value) : `${(fraction.has(key) ? value*100 : value).toFixed(1)}${fraction.has(key) ? '%' : ''}` : '—';
const value = raw => typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
const ratio = (numerator,denominator,multiplier = 1) => Number.isFinite(numerator) && Number.isFinite(denominator) && denominator > 0 ? numerator/denominator*multiplier : null;
export function statsFromTotals(totals = {}, advanced = {}) {
  const g = value(totals.gamesPlayed), min = value(totals.minutesPlayed), fga = value(totals.fieldGoalsAttempted), fgm = value(totals.fieldGoalsMade), fta = value(totals.freeThrowsAttempted), points = value(totals.points), threes = value(totals.threePointFieldGoalsMade), threesA = value(totals.threePointFieldGoalsAttempted), ast = value(totals.assists), reb = value(totals.totalRebounds), stl = value(totals.steals), blk = value(totals.blocks), tov = value(totals.turnovers);
  return { gp:g,mpg:ratio(min,g),pts:ratio(points,g),ast:ratio(ast,g),reb:ratio(reb,g),stl:ratio(stl,g),blk:ratio(blk,g),tov:ratio(tov,g),oreb:ratio(value(totals.offensiveRebounds),g),dreb:ratio(value(totals.defensiveRebounds),g),fg:ratio(fgm,fga),three:ratio(threes,threesA),ft:ratio(value(totals.freeThrowsMade),fta),ts:value(advanced.true_shooting_percentage) ?? ratio(points,Number.isFinite(fga) && Number.isFinite(fta) ? 2*(fga+.44*fta) : null),efg:ratio(Number.isFinite(fgm) && Number.isFinite(threes) ? fgm+.5*threes : null,fga),pts36:ratio(points,min,36),ast36:ratio(ast,min,36),reb36:ratio(reb,min,36),stl36:ratio(stl,min,36),blk36:ratio(blk,min,36),tov36:ratio(tov,min,36),ftr:ratio(fta,fga),threeRate:ratio(threesA,fga),pps:ratio(points,fga) };
}

export function sumCompleteTotals(rows, key) {
  if (!rows.length) return null;
  const values = rows.map(row => row.totals?.[key]);
  if (values.some(value => !Number.isFinite(value))) return null;
  return values.reduce((total, value) => total + value, 0);
}

function publicRecordForName(index, name) {
  const candidates = index.get(normalizePlayerName(name)) || [];
  if (candidates.length < 1) return null;
  const exact = candidates.filter(record => record.name === name);
  if (exact.length === 1) return exact[0];
  if (exact.length > 1 || candidates.length > 1) return null;
  return candidates[0];
}

function publicSeasonForRow(record, row) {
  const matches = (record?.seasons || []).filter(item =>
    item.seasonStartYear === row.seasonStartYear
    && item.seasonPhase === row.phase
    && item.teamCode === row.teamCode
    && !item.isMultiTeamAggregate
  );
  return matches.length === 1 ? matches[0] : null;
}

export function buildBlueprintRows(source,phase = 'regular') {
  const names = new Map(source.players.map(row => [row.playerRef,row.displayName]));
  const official = new Map();
  source.publicStats.forEach(record => {
    const key = normalizePlayerName(record.normalizedName || record.name);
    const candidates = official.get(key) || [];
    candidates.push(record);
    official.set(key,candidates);
  });
  return source.blueprintRows.filter(row => row.phase === phase && row.observed && row.games > 0).map(row => {
    const name = names.get(row.playerRef) || row.displayName;
    // Public context has no shared playerRef, so exact names disambiguate a
    // normalized-name collision. If neither source is unique, leave stats out.
    const publicRecord = publicRecordForName(official,name);
    const matched = publicSeasonForRow(publicRecord,row);
    const publicRow = phase === 'regular' ? matched : null;
    const box = row.box || {};
    const totals = publicRow?.totals || (phase !== 'regular' ? { gamesPlayed:row.games,minutesPlayed:row.minutes,points:box.points,totalRebounds:box.rebounds,assists:box.assists,steals:box.steals,blocks:box.blocks,turnovers:box.turnovers,fieldGoalsAttempted:box.fieldGoalAttempts,fieldGoalsMade:box.fieldGoalsMade,threePointFieldGoalsAttempted:box.threePointAttempts,threePointFieldGoalsMade:box.threePointersMade,freeThrowsAttempted:box.freeThrowAttempts,freeThrowsMade:box.freeThrowsMade,offensiveRebounds:box.offensiveRebounds,defensiveRebounds:box.defensiveRebounds } : {});
    const stats = statsFromTotals(totals,publicRow?.advanced);
    if (phase !== 'regular' && row.metrics?.trueShootingPercentage?.status === 'available') stats.ts = row.metrics.trueShootingPercentage.value;
    return { ...row,id:`${row.playerRef}:${row.teamCode}`,name,stats,totals,available:phase !== 'regular' || Boolean(publicRow),statsSource:publicRow ? 'Published full-season totals' : phase !== 'regular' ? 'Observed package phase' : 'Full-season totals unavailable',provenance:publicRow?.provenance || [],phase };
  }).sort((a,b) => a.name.localeCompare(b.name) || a.teamCode.localeCompare(b.teamCode));
}
