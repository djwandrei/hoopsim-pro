export const ATLAS_METRICS = [['pts','PPG','Points / game'],['ast','APG','Assists / game'],['reb','RPG','Rebounds / game'],['mpg','MPG','Minutes / game'],['stl','SPG','Steals / game'],['blk','BPG','Blocks / game'],['ts','TS%','True shooting'],['three','3P%','Three-point'],['ft','FT%','Free throws'],['tov','TOV','Turnovers'],['pts36','PTS/36','Points / 36 min']];
export const SCATTER_PAIRS = [['pts','ts','PPG','TS%'],['mpg','pts','MPG','PPG'],['ast','reb','APG','RPG'],['stl','blk','SPG','BPG']];
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