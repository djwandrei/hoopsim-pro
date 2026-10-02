export const ATLAS_METRICS = [['pts','PPG','Points / game'],['ast','APG','Assists / game'],['reb','RPG','Rebounds / game'],['mpg','MPG','Minutes / game'],['stl','SPG','Steals / game'],['blk','BPG','Blocks / game'],['ts','TS%','True shooting'],['three','3P%','Three-point'],['ft','FT%','Free throws'],['tov','TOV','Turnovers'],['pts36','PTS/36','Points / 36 min']];
export const SCATTER_METRICS = [['pts','PPG'],['ast','APG'],['reb','RPG'],['stl','SPG'],['blk','BPG'],['tov','TOV'],['oreb','OREB/G'],['dreb','DREB/G'],['mpg','MPG'],['gp','GP'],['fg','FG%'],['three','3P%'],['ft','FT%'],['ts','TS%'],['efg','eFG%'],['pts36','PTS/36'],['ast36','AST/36'],['reb36','REB/36'],['stl36','STL/36'],['blk36','BLK/36'],['tov36','TOV/36'],['ftr','FT rate'],['threeRate','3PA rate'],['pps','PTS/FGA']];
export const SCATTER_LABEL = key => SCATTER_METRICS.find(([k]) => k === key)?.[1] || key;
const PCT_METRICS = new Set(['fg','three','ft','ts','efg','ftr','threeRate']);
export const scatterText = (key,value) => !Number.isFinite(value) ? '—' : PCT_METRICS.has(key) ? `${(value*100).toFixed(1)}%` : value.toFixed(1);
export const scatterTick = (key,value) => !Number.isFinite(value) ? '' : PCT_METRICS.has(key) ? `${Math.round(value*100)}%` : Number.isInteger(value) ? String(value) : value.toFixed(1);
export function buildLeagueAtlas(rows) {
  const pools = new Map();
  const poolFor = key => {
    if (!pools.has(key)) pools.set(key, rows.map(row => row.stats[key]).filter(Number.isFinite).sort((a,b) => a-b));
    return pools.get(key);
  };
  const percentile = (key,value) => {
    const pool = poolFor(key);
    if (!pool.length || !Number.isFinite(value)) return null;
    let count = 0;
    for (const item of pool) { if (item <= value) count += 1; else break; }
    return Math.round(count / pool.length * 100);
  };
  const median = key => { const pool = poolFor(key); return pool.length ? pool[Math.floor((pool.length-1)/2)] : null; };
  return { count: rows.length, poolFor, percentile, median };
}