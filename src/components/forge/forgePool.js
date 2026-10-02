import { SKILLS } from '@/components/forge/bapSkills';

// Shared player-season pool for the forge draft games, mapped to the nine
// BAP-style attributes. Perimeter D blends steals + blocks per 36.
export function buildForgePool(source) {
  return (source.blueprintRows || [])
    .filter(row => row.phase === 'regular' && row.observed && row.games >= 15 && row.minutes >= 300)
    .map(row => {
      const m = row.metrics || {};
      const value = metric => (Number.isFinite(metric?.value) ? metric.value : 0);
      const player = {
        playerRef: row.playerRef, name: row.displayName, teamCode: row.teamCode,
        positions: row.positions || [], headshotPath: row.headshotPath || null,
        games: row.games, minutes: row.minutes,
        pts: value(m.pointsPerGame), ast: value(m.assistsPerGame), reb: value(m.reboundsPerGame), mpg: value(m.minutesPerGame),
        stl: value(m.stealsPerGame), blk: value(m.blocksPerGame),
        fg: value(m.fieldGoalPercentage), tpp: value(m.threePointPercentage),
      };
      for (const skill of SKILLS) {
        player[skill.key] = skill.key === 'perimeterD'
          ? value(m.stealsPer36) + value(m.blocksPer36)
          : value(m[skill.metricKey]);
      }
      return player;
    });
}

export function forgeMax(pool) {
  return Object.fromEntries(SKILLS.map(({ key }) => [key, pool.length ? Math.max(...pool.map(player => player[key] || 0)) : 0]));
}

export function forgeRanks(pool) {
  return Object.fromEntries(SKILLS.map(({ key }) => {
    const sorted = [...pool].sort((a, b) => (b[key] || 0) - (a[key] || 0));
    return [key, new Map(sorted.map((player, index) => [player.playerRef, index + 1]))];
  }));
}