import { SKILLS, RATING_MODEL, ROLE_SAMPLE_MIN, ROLE_BLEND } from '@/components/forge/bapSkills';

const number = value => (value != null && value !== '' && Number.isFinite(Number(value)) ? Number(value) : null);
const fromBox = (box, key) => number(box?.[key]);
const fromMetric = (row, key) => {
  const metric = row.metrics?.[key];
  return metric?.status === 'available' ? number(metric.value) : null;
};
const per36 = (total, minutes) => (Number.isFinite(total) && Number.isFinite(minutes) && minutes > 0 ? total * 36 / minutes : null);

// Midpoint percentile rank inside a sorted ascending population.
function percentileRank(value, sorted, direction = 'higher') {
  if (!Number.isFinite(value) || !sorted.length) return null;
  const keyed = item => (direction === 'lower' ? -item : item);
  const target = keyed(value);
  let low = 0; let high = sorted.length;
  while (low < high) {
    const mid = low + high >>> 1;
    if (keyed(sorted[mid]) < target) low = mid + 1; else high = mid;
  }
  const below = low;
  for (low = below, high = sorted.length; low < high;) {
    const mid = low + high >>> 1;
    if (keyed(sorted[mid]) <= target) low = mid + 1; else high = mid;
  }
  return (below + (low - below) / 2) / sorted.length;
}

// Attempt-shrunk percentage: blend a sparse sample toward the season rate.
function attemptShrunk(makes, attempts, leagueRate, shrink) {
  if (!Number.isFinite(attempts) || attempts < 0 || !Number.isFinite(leagueRate) || leagueRate < 0 || leagueRate > 1) return null;
  if (attempts === 0) return leagueRate;
  if (!Number.isFinite(makes) || makes < 0 || makes > attempts) return null;
  return (makes + shrink * leagueRate) / (attempts + shrink);
}

// Raw per-36 and shrunk-efficiency rows behind the rating pool.
function buildForgeRows(source) {
  return (source?.blueprintRows || [])
    .filter(row => row.phase === 'regular' && row.observed && Number(row.games) >= 15 && Number(row.minutes) >= 300)
    .map(row => {
      const box = row.box || {};
      const games = number(row.games) || 0;
      const minutes = number(row.minutes) || 0;
      const ppg = fromMetric(row, 'pointsPerGame');
      const apg = fromMetric(row, 'assistsPerGame');
      const rpg = fromMetric(row, 'reboundsPerGame');
      const spg = fromMetric(row, 'stealsPerGame');
      const bpg = fromMetric(row, 'blocksPerGame');
      const pointsPer36Metric = fromMetric(row, 'pointsPer36');
      const totals = {
        points: fromBox(box, 'points') ?? (ppg === null ? null : ppg * games),
        assists: fromBox(box, 'assists') ?? (apg === null ? null : apg * games),
        rebounds: fromBox(box, 'rebounds') ?? (rpg === null ? null : rpg * games),
        turnovers: fromBox(box, 'turnovers'),
        steals: fromBox(box, 'steals') ?? (spg === null ? null : spg * games),
        blocks: fromBox(box, 'blocks') ?? (bpg === null ? null : bpg * games),
        offensiveRebounds: fromBox(box, 'offensiveRebounds'),
        fieldGoalsAttempted: fromBox(box, 'fieldGoalsAttempted'),
        fieldGoalsMade: fromBox(box, 'fieldGoalsMade'),
        threePointAttempts: fromBox(box, 'threePointAttempts'),
        threePointersMade: fromBox(box, 'threePointersMade'),
      };
      const twoPointAttempts = Number.isFinite(totals.fieldGoalsAttempted) && Number.isFinite(totals.threePointAttempts) ? totals.fieldGoalsAttempted - totals.threePointAttempts : null;
      const twoPointMakes = Number.isFinite(totals.fieldGoalsMade) && Number.isFinite(totals.threePointersMade) ? totals.fieldGoalsMade - totals.threePointersMade : null;
      const roleGroup = (row.positions || []).includes('G') ? 'Guard' : (row.positions || []).some(code => code === 'F' || code === 'C') ? 'Big' : null;
      return { sourceRow: row, games, minutes, pointsPer36Metric, roleGroup, totals, twoPointAttempts, twoPointMakes };
    });
}

function attachRawValues(rows) {
  const threeAttempts = rows.reduce((sum, row) => sum + (row.totals.threePointAttempts || 0), 0);
  const league3p = threeAttempts ? rows.reduce((sum, row) => sum + (row.totals.threePointersMade || 0), 0) / threeAttempts : null;
  const twoAttempts = rows.reduce((sum, row) => sum + (row.twoPointAttempts || 0), 0);
  const league2p = twoAttempts ? rows.reduce((sum, row) => sum + (row.twoPointMakes || 0), 0) / twoAttempts : null;
  const assists = rows.reduce((sum, row) => sum + (row.totals.assists || 0), 0);
  const turnovers = rows.reduce((sum, row) => sum + (row.totals.turnovers || 0), 0);
  const leagueAstTo = turnovers > 0 ? assists / turnovers : null;
  for (const row of rows) {
    const { totals, minutes } = row;
    row.raw = {
      pointsPer36: per36(totals.points, minutes) ?? row.pointsPer36Metric,
      threePointPercentage: attemptShrunk(totals.threePointersMade, totals.threePointAttempts, league3p, 75) ?? fromMetric(row.sourceRow, 'threePointPercentage'),
      twoPointPercentage: attemptShrunk(row.twoPointMakes, row.twoPointAttempts, league2p, 50) ?? fromMetric(row.sourceRow, 'fieldGoalPercentage'),
      assistsPer36: per36(totals.assists, minutes),
      assistTurnoverRatio: Number.isFinite(totals.assists) && Number.isFinite(totals.turnovers) && Number.isFinite(leagueAstTo) ? (totals.assists + 15 * leagueAstTo) / (totals.turnovers + 15) : fromMetric(row.sourceRow, 'assistTurnoverRatio'),
      reboundsPer36: per36(totals.rebounds, minutes),
      offensiveReboundsPer36: per36(totals.offensiveRebounds, minutes),
      stealsPer36: per36(totals.steals, minutes),
      blocksPer36: per36(totals.blocks, minutes),
    };
  }
  return rows;
}

// Shared player-season pool for the forge draft games: raw rows plus the nine
// 25–99 DJHC skill ratings, each a season percentile blended toward a role
// percentile when the role sample supports it.
export function buildForgePool(source) {
  const rows = attachRawValues(buildForgeRows(source));
  const populations = new Map();
  const rolePopulations = new Map();
  for (const skill of SKILLS) {
    populations.set(skill.key, rows.map(row => row.raw[skill.metricKey]).filter(Number.isFinite).sort((a, b) => a - b));
    for (const role of ['Guard', 'Big']) {
      rolePopulations.set(`${skill.key}:${role}`, rows
        .filter(row => row.roleGroup === role && Number.isFinite(row.raw[skill.metricKey]))
        .map(row => row.raw[skill.metricKey])
        .sort((a, b) => a - b));
    }
  }
  return rows.map(row => {
    const sourceRow = row.sourceRow;
    const player = {
      playerRef: sourceRow.playerRef, name: sourceRow.displayName, teamCode: sourceRow.teamCode,
      positions: sourceRow.positions || [], headshotPath: sourceRow.headshotPath || null,
      seasonStartYear: Number(sourceRow.seasonStartYear), games: row.games, minutes: row.minutes,
      pts: Number.isFinite(row.totals.points) ? row.totals.points / (row.games || 1) : null,
      ast: Number.isFinite(row.totals.assists) ? row.totals.assists / (row.games || 1) : null,
      reb: Number.isFinite(row.totals.rebounds) ? row.totals.rebounds / (row.games || 1) : null,
      mpg: row.minutes / (row.games || 1),
      stl: Number.isFinite(row.totals.steals) ? row.totals.steals / (row.games || 1) : null,
      blk: Number.isFinite(row.totals.blocks) ? row.totals.blocks / (row.games || 1) : null,
      fg: Number.isFinite(row.totals.fieldGoalsMade) && Number.isFinite(row.totals.fieldGoalsAttempted) && row.totals.fieldGoalsAttempted > 0 ? row.totals.fieldGoalsMade / row.totals.fieldGoalsAttempted : null,
      tpp: Number.isFinite(row.totals.threePointAttempts) && row.totals.threePointAttempts > 0 ? row.totals.threePointersMade / row.totals.threePointAttempts : null,
      ratingModel: RATING_MODEL, ratingEvidence: {},
    };
    for (const skill of SKILLS) {
      const rawValue = row.raw[skill.metricKey];
      const seasonPopulation = populations.get(skill.key);
      const seasonPercentile = percentileRank(rawValue, seasonPopulation, skill.direction);
      const rolePopulation = row.roleGroup && rolePopulations.get(`${skill.key}:${row.roleGroup}`) || [];
      const rolePercentile = rolePopulation.length >= ROLE_SAMPLE_MIN ? percentileRank(rawValue, rolePopulation, skill.direction) : null;
      const blended = seasonPercentile === null ? null : rolePercentile === null ? seasonPercentile : (1 - ROLE_BLEND) * seasonPercentile + ROLE_BLEND * rolePercentile;
      player[skill.key] = blended === null ? null : Math.round(25 + 74 * blended);
      player.ratingEvidence[skill.key] = {
        rawValue, seasonStartYear: Number(sourceRow.seasonStartYear),
        seasonPopulation: seasonPopulation.length, seasonPercentile,
        roleGroup: row.roleGroup, rolePopulation: rolePopulation.length,
        roleRelativeApplied: rolePercentile !== null, rolePercentile,
      };
    }
    return player;
  });
}

// Mean of the finite 25–99 skill ratings; 50 when none are rated.
export function forgePlayerScore(player) {
  const values = SKILLS.map(skill => player[skill.key]).filter(Number.isFinite);
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 50;
}