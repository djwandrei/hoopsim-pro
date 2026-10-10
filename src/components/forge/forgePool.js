import { SKILLS, RATING_MODEL, RATING_POLICY, ROLE_SAMPLE_MIN, ROLE_BLEND } from './bapSkills.js';
import { forgeOverallScore, forgeCompositeOverallScore } from './forgeOverall.js';

const number = value => value != null && value !== '' && Number.isFinite(Number(value)) ? Number(value) : null;
const metric = (row, key) => row.metrics?.[key]?.status === 'available' ? number(row.metrics[key].value) : null;
const divide = (a, b) => Number.isFinite(a) && Number.isFinite(b) && b > 0 ? a / b : null;
const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, value));
const pair = (made, attempted) => Number.isFinite(made) && Number.isFinite(attempted) && attempted >= 0 && made >= 0 && made <= attempted;
export function forgeRole(positions = []) {
  if (positions.some(p => ['C', 'PF'].includes(p))) return 'Big';
  if (positions.some(p => ['G', 'PG', 'SG'].includes(p))) return 'Guard';
  return positions.some(p => ['F', 'SF'].includes(p)) ? 'Wing' : 'Unknown';
}
export function percentileRank(value, sorted) {
  if (!Number.isFinite(value) || !sorted.length) return null;
  const bound = inclusive => {
    let lo = 0, hi = sorted.length;
    while (lo < hi) { const mid = (lo + hi) >>> 1; if (sorted[mid] < value || inclusive && sorted[mid] === value) lo = mid + 1; else hi = mid; }
    return lo;
  };
  return (bound(false) + bound(true)) / (2 * sorted.length);
}
// Unpaired or invalid shooting counts never enter a league prior.
function leaguePercentage(rows, makes, attempts) {
  const valid = rows.filter(row => pair(row.totals[makes], row.totals[attempts]));
  return divide(valid.reduce((s, r) => s + r.totals[makes], 0), valid.reduce((s, r) => s + r.totals[attempts], 0));
}
function shrunkPercentage(makes, attempts, prior, strength) {
  if (!pair(makes, attempts) || attempts <= 0 || prior === null) return null;
  return (makes + prior * strength) / (attempts + strength);
}
export const FORGE_COMPONENTS = {
  scoring: [['pointsPer36', .65], ['trueShooting', .35]],
  jumpShot: [['threeAccuracy', .6], ['threeVolume', .25], ['freeThrowAccuracy', .15]],
  finishing: [['twoAccuracy', .6], ['twoVolume', .25], ['freeThrowVolume', .15]],
  playmaking: [['assistsPer36', .8], ['assistTurnoverRatio', .2]],
  decision: [['assistTurnoverRatio', .55], ['ballSecurity', .45]],
  rebounding: [['defensiveReboundsPer36', .8], ['reboundsPer36', .2]],
  clutch: [['clutchPointsPer36', .45], ['clutchTrueShooting', .4], ['clutchSecurity', .15]],
  perimeterDefense: [['perimeterSuppression', .4], ['deflectionsPer36', .3], ['stealsPer36', .3]],
  rimProtection: [['blocksPer36', 1]], body: [['height', .45], ['wingspan', .45], ['weight', .1]],
};
const REQUIRED = { jumpShot: 'threeAccuracy', finishing: 'twoAccuracy', scoring: 'pointsPer36', decision: 'ballSecurity', clutch: 'clutchTrueShooting', body: 'height' };
const bodyPosition = row => String(row.evidence?.body?.position || row.source.positions?.[0] || 'Unknown').split(/[-/]/)[0].trim();
const LIMITATIONS = {
  finishing: '2P shooting proxy; rim-location data is unavailable.',
  perimeterDefense: 'Outside defended shooting, deflections and steals are descriptive proxies; matchup difficulty and complete defensive impact are not measured.',
  rimProtection: 'Blocks are a box-score proxy, not a complete rim-defense impact rating.',
  clutch: 'Observed NBA clutch scoring (last five minutes, score within five points); small samples shrink toward neutral. This does not predict future clutch performance.',
  body: 'Position-relative size and reach, not athleticism. Height and weight use a current roster snapshot; wingspan uses an earlier combine measurement where verified.',
};

function addForgeEvidence(rows) {
  const validClutch = rows.map(row => row.evidence?.clutch).filter(c => c && c.minutes >= RATING_POLICY.clutchMinMinutes && c.games >= 3 && Number.isFinite(c.points) && c.points >= 0 && c.fga >= RATING_POLICY.clutchMinAttempts && pair(c.fgm, c.fga) && pair(c.ftm, c.fta));
  const clutchMinutes = validClutch.reduce((s, c) => s + c.minutes, 0);
  const clutchRate = divide(validClutch.reduce((s, c) => s + c.points * 36, 0), clutchMinutes);
  const clutchTs = divide(validClutch.reduce((s, c) => s + c.points / 2, 0), validClutch.reduce((s, c) => s + c.fga + .44 * c.fta, 0));
  for (const row of rows) {
    const { clutch: c, perimeter: p, body: b } = row.evidence || {};
    for (const key of ['clutchPointsPer36', 'clutchTrueShooting', 'clutchSecurity', 'deflectionsPer36', 'perimeterSuppression', 'height', 'weight', 'wingspan']) { row.raw[key] = null; row.reliability[key] = 0; }
    if (c && validClutch.includes(c) && clutchRate !== null && clutchTs !== null) {
      const exposure = c.fga + .44 * c.fta, minutesPrior = RATING_POLICY.clutchPriorMinutes, attemptsPrior = RATING_POLICY.clutchPriorAttempts;
      row.raw.clutchPointsPer36 = (c.points * 36 + minutesPrior * clutchRate) / (c.minutes + minutesPrior);
      row.raw.clutchTrueShooting = (c.points / 2 + attemptsPrior * clutchTs) / (exposure + attemptsPrior);
      row.reliability.clutchPointsPer36 = c.minutes / (c.minutes + minutesPrior);
      row.reliability.clutchTrueShooting = exposure / (exposure + attemptsPrior);
      if (Number.isFinite(c.turnovers) && c.turnovers >= 0) {
        row.raw.clutchSecurity = 1 - (c.turnovers + 25 * .13) / (exposure + c.turnovers + 25);
        row.reliability.clutchSecurity = exposure / (exposure + 25);
      }
    }
    if (p?.minutes > 0 && Number.isFinite(p.deflections) && p.deflections >= 0) {
      row.raw.deflectionsPer36 = p.deflections * 36 / p.minutes;
      row.reliability.deflectionsPer36 = p.minutes / (p.minutes + RATING_POLICY.ratePriorMinutes);
    }
    if (p?.defendedAttempts > 0 && pair(p.defendedMakes, p.defendedAttempts) && Number.isFinite(p.expectedPercentage) && p.expectedPercentage > 0 && p.expectedPercentage < 1) {
      row.raw.perimeterSuppression = (p.expectedPercentage * p.defendedAttempts - p.defendedMakes) / (p.defendedAttempts + 100);
      row.reliability.perimeterSuppression = p.defendedAttempts / (p.defendedAttempts + 100);
    }
    if (b) for (const [key, min, max] of [['height', 60, 96], ['weight', 130, 400], ['wingspan', 60, 110]]) {
      if (Number.isFinite(b[key]) && b[key] >= min && b[key] <= max) { row.raw[key] = b[key]; row.reliability[key] = 1; }
    }
    row.bodyPosition = bodyPosition(row);
  }
}
export function buildForgePool(source) {
  // One reel entry per player and season. Add regular-season team stints
  // together; keep the highest-minute team row only for the displayed team.
  const segments = [];
  for (const row of source?.blueprintRows || []) {
    const games = number(row.games), minutes = number(row.minutes);
    if (!row.playerRef || row.phase !== 'regular' || !row.observed || !Number.isFinite(games) || !Number.isFinite(minutes) || games <= 0 || minutes <= 0) continue;
    const box = row.box || {};
    const total = (key, fallback) => number(box[key]) ?? (fallback && metric(row, fallback) !== null ? metric(row, fallback) * games : null);
    const totals = {
      points: total('points', 'pointsPerGame'), assists: total('assists', 'assistsPerGame'), rebounds: total('rebounds', 'reboundsPerGame'),
      turnovers: total('turnovers'), steals: total('steals', 'stealsPerGame'), blocks: total('blocks', 'blocksPerGame'),
      offensiveRebounds: total('offensiveRebounds'), defensiveRebounds: total('defensiveRebounds'),
      fga: number(box.fieldGoalAttempts) ?? number(box.fieldGoalsAttempted), fgm: total('fieldGoalsMade'),
      threeAttempts: total('threePointAttempts'), threeMade: total('threePointersMade'),
      fta: number(box.freeThrowAttempts) ?? number(box.freeThrowsAttempted), ftm: total('freeThrowsMade'),
      twoAttempts: number(box.twoPointAttempts), twoMade: number(box.twoPointMakes),
    };
    segments.push({ playerRef: row.playerRef, source: row, games, minutes, totals });
  }
  const grouped = new Map();
  for (const segment of segments) {
    if (!grouped.has(segment.playerRef)) grouped.set(segment.playerRef, { source: segment.source, games: 0, minutes: 0, segments: [] });
    const group = grouped.get(segment.playerRef);
    group.games += segment.games; group.minutes += segment.minutes; group.segments.push(segment);
    if (segment.minutes > number(group.source.minutes)) group.source = segment.source;
  }
  const rows = [...grouped.values()].map(group => {
    const totals = {};
    for (const key of Object.keys(group.segments[0].totals)) {
      const values = group.segments.map(segment => segment.totals[key]);
      totals[key] = values.every(Number.isFinite) ? values.reduce((sum, value) => sum + value, 0) : null;
    }
    if (totals.twoAttempts === null && totals.fga !== null && totals.threeAttempts !== null) totals.twoAttempts = totals.fga - totals.threeAttempts;
    if (totals.twoMade === null && totals.fgm !== null && totals.threeMade !== null) totals.twoMade = totals.fgm - totals.threeMade;
    if (totals.defensiveRebounds === null && totals.rebounds !== null && totals.offensiveRebounds !== null) totals.defensiveRebounds = totals.rebounds - totals.offensiveRebounds;
    const evidence = source.forgeEvidence;
    const matchingSeason = evidence?.year === Number(group.source.seasonStartYear) && (!source.entry?.packageVersion || evidence.packageVersion === source.entry.packageVersion);
    return { source: group.source, totals, games: group.games, minutes: group.minutes, role: forgeRole(group.source.positions || []), evidence: matchingSeason ? evidence.records?.[group.source.playerRef] : null, raw: {}, reliability: {} };
  }).filter(row => row.games >= RATING_POLICY.minGames && row.minutes >= RATING_POLICY.minMinutes);
  const priors = { three: leaguePercentage(rows, 'threeMade', 'threeAttempts'), two: leaguePercentage(rows, 'twoMade', 'twoAttempts'), ft: leaguePercentage(rows, 'ftm', 'fta') };
  const countRates = { pointsPer36: 'points', assistsPer36: 'assists', reboundsPer36: 'rebounds', defensiveReboundsPer36: 'defensiveRebounds', offensiveReboundsPer36: 'offensiveRebounds', stealsPer36: 'steals', blocksPer36: 'blocks', threeVolume: 'threeAttempts', twoVolume: 'twoAttempts', freeThrowVolume: 'fta' };
  for (const [key, totalKey] of Object.entries(countRates)) {
    const valid = rows.filter(row => Number.isFinite(row.totals[totalKey]) && row.totals[totalKey] >= 0);
    const prior = divide(valid.reduce((s, r) => s + r.totals[totalKey] * 36, 0), valid.reduce((s, r) => s + r.minutes, 0));
    for (const row of rows) {
      const raw = divide(row.totals[totalKey] === null ? null : row.totals[totalKey] * 36, row.minutes);
      row.raw[key] = raw === null || raw < 0 || prior === null ? null : (raw * row.minutes + prior * RATING_POLICY.ratePriorMinutes) / (row.minutes + RATING_POLICY.ratePriorMinutes);
      row.reliability[key] = row.minutes / (row.minutes + RATING_POLICY.ratePriorMinutes);
    }
  }
  const validDecision = rows.filter(r => r.totals.assists !== null && r.totals.turnovers !== null && r.totals.turnovers >= 0);
  const priorRatio = divide(validDecision.reduce((s, r) => s + r.totals.assists, 0), validDecision.reduce((s, r) => s + r.totals.turnovers, 0));
  const tsRows = rows.filter(r => r.totals.points !== null && pair(r.totals.fgm, r.totals.fga) && pair(r.totals.ftm, r.totals.fta));
  const priorTs = divide(tsRows.reduce((s, r) => s + r.totals.points, 0), tsRows.reduce((s, r) => s + 2 * (r.totals.fga + .44 * r.totals.fta), 0));
  for (const row of rows) {
    const t = row.totals;
    for (const [key, made, attempts, prior, strength] of [
      ['threeAccuracy', t.threeMade, t.threeAttempts, priors.three, RATING_POLICY.threePriorAttempts],
      ['twoAccuracy', t.twoMade, t.twoAttempts, priors.two, RATING_POLICY.twoPriorAttempts],
      ['freeThrowAccuracy', t.ftm, t.fta, priors.ft, RATING_POLICY.freeThrowPriorAttempts],
    ]) { row.raw[key] = shrunkPercentage(made, attempts, prior, strength); row.reliability[key] = attempts > 0 ? attempts / (attempts + strength) : 0; }
    const opportunities = t.fga !== null && t.fta !== null && t.turnovers !== null ? t.fga + .44 * t.fta + t.turnovers : null;
    row.raw.ballSecurity = opportunities > 0 ? 1 - (t.turnovers + 10 * .13) / (opportunities + 10) : null;
    row.raw.assistTurnoverRatio = t.assists !== null && t.turnovers !== null && priorRatio !== null ? (t.assists + 20 * priorRatio) / (t.turnovers + 20) : null;
    row.reliability.ballSecurity = opportunities > 0 ? opportunities / (opportunities + 100) : 0;
    row.reliability.assistTurnoverRatio = t.turnovers >= 0 && t.turnovers !== null ? t.turnovers / (t.turnovers + 20) : 0;
    const shooting = t.fga !== null && t.fta !== null ? t.fga + .44 * t.fta : null;
    row.raw.trueShooting = shooting > 0 && t.points !== null && priorTs !== null ? (t.points / 2 + 100 * priorTs) / (shooting + 100) : null;
    row.reliability.trueShooting = shooting > 0 ? shooting / (shooting + 100) : 0;
  }
  addForgeEvidence(rows);
  const keys = [...new Set(Object.values(FORGE_COMPONENTS).flat().map(c => c[0]))];
  const population = new Map(keys.map(key => [key, rows.map(r => r.raw[key]).filter(Number.isFinite).sort((a, b) => a - b)]));
  const roles = new Map(keys.flatMap(key => ['Guard', 'Wing', 'Big'].map(role => [`${key}:${role}`, rows.filter(r => r.role === role).map(r => r.raw[key]).filter(Number.isFinite).sort((a, b) => a - b)])));
  const bodyGroups = new Map(['height', 'wingspan', 'weight'].flatMap(key => [...new Set(rows.map(row => row.bodyPosition))].map(position => [`${key}:${position}`, rows.filter(row => row.bodyPosition === position).map(row => row.raw[key]).filter(Number.isFinite).sort((a, b) => a - b)])));
  return rows.map(row => {
    const t = row.totals, r = row.source;
    const player = {
      playerRef: r.playerRef, name: r.displayName, teamCode: r.teamCode, positions: r.positions || [], headshotPath: r.headshotPath || null,
      seasonStartYear: Number(r.seasonStartYear), games: row.games, minutes: row.minutes, mpg: row.minutes / row.games,
      pts: divide(t.points, row.games), ast: divide(t.assists, row.games), reb: divide(t.rebounds, row.games), stl: divide(t.steals, row.games), blk: divide(t.blocks, row.games),
      fg: pair(t.fgm, t.fga) ? divide(t.fgm, t.fga) : null, tpp: pair(t.threeMade, t.threeAttempts) ? divide(t.threeMade, t.threeAttempts) : null,
      totals: t, roleGroup: row.role, ratingModel: RATING_MODEL, ratingEvidence: {}, measurements: row.evidence?.body || null,
    };
    for (const skill of SKILLS) {
      const components = FORGE_COMPONENTS[skill.key].map(([key, weight]) => {
        const season = population.get(key), role = roles.get(`${key}:${row.role}`) || [];
        const seasonPercentile = percentileRank(row.raw[key], season), rolePercentile = role.length >= ROLE_SAMPLE_MIN ? percentileRank(row.raw[key], role) : null;
        let percentile = seasonPercentile === null ? null : rolePercentile === null ? seasonPercentile : (1 - ROLE_BLEND) * seasonPercentile + ROLE_BLEND * rolePercentile;
        let comparison = 'season + role';
        if (skill.key === 'body') {
          const position = bodyGroups.get(`${key}:${row.bodyPosition}`) || [];
          const peers = position.length >= RATING_POLICY.bodyPopulationMin ? position : role;
          percentile = peers.length >= RATING_POLICY.bodyPopulationMin ? percentileRank(row.raw[key], peers) : null;
          comparison = position.length >= RATING_POLICY.bodyPopulationMin ? row.bodyPosition : row.role;
        }
        return { key, weight, rawValue: row.raw[key], seasonPopulation: season.length, seasonPercentile, rolePercentile, percentile, comparison, reliability: row.reliability[key] || 0 };
      });
      const available = components.filter(c => c.percentile !== null), coverage = available.reduce((s, c) => s + c.weight, 0);
      const missingRequired = REQUIRED[skill.key] && row.raw[REQUIRED[skill.key]] === null || skill.key === 'perimeterDefense' && row.raw.perimeterSuppression === null && row.raw.deflectionsPer36 === null;
      const percentile = !coverage || missingRequired ? null : available.reduce((s, c) => s + c.weight * c.percentile, 0) / coverage;
      // Curved display scale: a median skill is ~78, not an automatic failing grade.
      const confidence = percentile === null ? 0 : available.reduce((s, c) => s + c.weight * c.reliability, 0);
      const scaled = percentile === null ? null : 25 + 74 * Math.pow(percentile, .48);
      player[skill.key] = scaled === null ? null : Math.round(clamp(skill.key === 'clutch' ? 75 + (scaled - 75) * (.35 + .65 * confidence) : scaled, 25, 99));
      player.ratingEvidence[skill.key] = { model: RATING_MODEL, seasonStartYear: player.seasonStartYear, roleGroup: row.role, seasonPopulation: rows.length, components, percentile, confidence, coverage, confidenceLabel: confidence >= .8 ? 'High' : confidence >= .55 - 1e-9 ? 'Moderate' : 'Limited', limitation: LIMITATIONS[skill.key] || null, ...(skill.key === 'clutch' ? { observed: row.evidence?.clutch || null } : {}) };
    }
    return player;
  });
}
// Missing skills carry a neutral contribution, rather than inflating a partial OVR.
export function forgePlayerScore(player, weights = {}) {
  return forgeOverallScore(player, weights);
}
export function forgeCompositeScore(picks, group = 'All') {
  return forgeCompositeOverallScore(picks, group);
}
