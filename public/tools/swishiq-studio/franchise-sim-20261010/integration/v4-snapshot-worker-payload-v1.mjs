import { createFranchiseRotationState } from '../lib/franchise-controls-v1.mjs';
import { prepareCpuFranchiseRotation } from '../lib/cpu-franchise-rotation-v1.mjs';
import { validateLeagueState, normalizeCanonicalPlayerName } from '../lib/simulation-contracts-v1.mjs';
import { predictSharedPlayerProduction } from '../lib/shared-player-production-v1.mjs';
import { buildV4GeneratedShootingRatingsV1, V4_GENERATED_SHOOTING_RATING_POLICY } from './v4-generated-shooting-rating-v1.mjs';

const clone = value => structuredClone(value);
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const finite = Number.isFinite;
const ratingFields = ['overallRating', 'scoringRating', 'shootingRating', 'creationRating', 'reboundingRating', 'defenseRating'];
const statRates = { points: 'pointsPer36', rebounds: 'reboundsPer36', assists: 'assistsPer36',
  threePointersMade: 'threesPer36', turnovers: 'turnoversPer36', steals: 'stealsPer36', blocks: 'blocksPer36' };

/** Adapt verified season totals to an explicit hypothetical snapshot, with no
 * claim that final-season values were known before its historical games.
 * Model features mirror the legacy definitions; trends/load unavailable from
 * an aggregate start at explicit neutral scenario values, never as observations.
 */
export function createSnapshotPlayerProductionProfileV1(player, candidate, seasonStartYear) {
  const missing = [], assumptions = [];
  const rates = {};
  for (const [stat, field] of Object.entries(statRates)) {
    if (!finite(player[field]) || player[field] < 0) missing.push(field);
    else rates[stat] = player[field];
  }
  const centered = {};
  for (const field of ratingFields) {
    if (!finite(player[field]) || player[field] < 0 || player[field] > 100) missing.push(field);
    else centered[field] = player[field] - (field === 'overallRating' ? 75 : 50);
  }
  const minutes = player.seasonMinutes, box = player.box ?? {};
  if (!finite(minutes) || minutes <= 0 || !finite(player.games) || player.games <= 0) missing.push('positive season exposure');
  const count = key => Number.isSafeInteger(box[key]) && box[key] >= 0 ? box[key] : null;
  for (const key of ['points', 'rebounds', 'assists', 'threePointersMade', 'turnovers', 'steals', 'blocks',
    'fieldGoalsMade', 'fieldGoalAttempts', 'freeThrowsMade', 'freeThrowAttempts', 'threePointAttempts']) {
    if (count(key) === null) missing.push(`box.${key} integer count`);
  }
  const attemptRate = (key, playerField) => finite(player[playerField]) && player[playerField] >= 0 ? player[playerField]
    : count(key) !== null && minutes > 0 ? count(key) * 36 / minutes : null;
  const fga = attemptRate('fieldGoalAttempts', 'fieldGoalAttemptsPer36');
  const fta = attemptRate('freeThrowAttempts', 'freeThrowAttemptsPer36');
  const tpa = attemptRate('threePointAttempts', 'threePointAttemptsPer36');
  if (![fga, fta, tpa].every(finite) || tpa > fga) missing.push('reconciled shot attempts');
  const pct = (made, attempted, neutral, label) => {
    if (made === null || attempted === null || made > attempted) { missing.push(label); return neutral; }
    if (attempted > 0) return made / attempted;
    assumptions.push(`${label}: zero attempts; neutral scenario efficiency ${neutral}`);
    return neutral;
  };
  const fgm = count('fieldGoalsMade'), tpm = count('threePointersMade'), ftm = count('freeThrowsMade');
  const fgAttempts = count('fieldGoalAttempts'), threeAttempts = count('threePointAttempts'), ftAttempts = count('freeThrowAttempts');
  const twoAttempts = fgAttempts !== null && threeAttempts !== null ? fgAttempts - threeAttempts : null;
  const twoMakes = fgm !== null && tpm !== null ? fgm - tpm : null;
  const threePct = pct(tpm, threeAttempts, 0.35, 'three-point percentage');
  const freeThrowPct = pct(ftm, ftAttempts, 0.75, 'free-throw percentage');
  const twoPct = pct(twoMakes, twoAttempts, 0.5, 'two-point percentage');
  const points = count('points');
  if (twoMakes !== null && twoMakes < 0 || twoAttempts !== null && twoAttempts < 0 ||
    points === null || points !== 2 * fgm + tpm + ftm) missing.push('shot/point identities');
  if (count('offensiveRebounds') !== null && count('defensiveRebounds') !== null &&
    count('rebounds') !== count('offensiveRebounds') + count('defensiveRebounds')) missing.push('rebound identities');
  if (missing.length) return { status: 'requires-review', canonicalName: player.canonicalName, missingInputs: [...new Set(missing)] };
  const common = { ...centered, priorMinutesPerGame: minutes / player.games,
    priorGames: Math.min(20, player.games), fatigueLoad7: 0,
    priorPointsPer36: rates.points, priorReboundsPer36: rates.rebounds, priorAssistsPer36: rates.assists,
    priorThreesPer36: rates.threePointersMade, priorTurnoversPer36: rates.turnovers };
  const pointsFeatures = { ...common, priorPointsTrendPer36: 0,
    fieldGoalAttemptsPer36: fga, freeThrowAttemptsPer36: fta, threePointAttemptsPer36: tpa,
    twoPointAttemptsPer36: fga - tpa,
    effectiveFieldGoalPctAbove050: fgAttempts > 0 ? (fgm + 0.5 * tpm) / fgAttempts - 0.5 : 0,
    trueShootingPctAbove055: fgAttempts + 0.44 * ftAttempts > 0 ? points / (2 * (fgAttempts + 0.44 * ftAttempts)) - 0.55 : 0,
    threePointPctAbove035: threePct - 0.35, freeThrowPctAbove075: freeThrowPct - 0.75, twoPointPctAbove050: twoPct - 0.5 };
  const profile = { format: 'djhc-shared-production-game-profile-v1', canonicalName: player.canonicalName,
    seasonStartYear, evidence: { kind: 'explicit-scenario', source: `V4 snapshot ${player.sourceEvidence?.recordId ?? player.canonicalName}`,
      sourceEvidence: clone(player.sourceEvidence ?? null), retrospective: true, forecastingEligible: false,
      assumptions: ['Aggregate snapshot rates initialize a hypothetical game; recent trends and starting workload are set to zero.', ...assumptions] },
    pointsFeatures, boxCommonFeatures: common,
    boxRateFeatures: Object.fromEntries(Object.keys(statRates).filter(stat => stat !== 'points')
      .map(stat => [stat, { priorTargetRate: rates[stat], targetTrendPer36: 0 }])),
    candidateRateFeatures: { exposureShrunk: clone(rates), ewma: Object.fromEntries([5, 10, 20].map(window => [window, clone(rates)])) } };
  // Use the candidate's strict feature contract to prevent silent undefined inputs.
  predictSharedPlayerProduction(candidate, profile, { projectedMinutes: 24 });
  const orb = count('offensiveRebounds'), drb = count('defensiveRebounds');
  return { status: 'ready', player: { ...clone(player), displayName: player.canonicalName,
    priorMinutesPerGame: minutes / player.games, projectedMinutes: minutes / player.games,
    sharedProductionFeatures: profile, threePointPercentage: threePct, twoPointPercentage: twoPct, freeThrowPercentage: freeThrowPct,
    ...(orb !== null ? { offensiveReboundsPer36: orb * 36 / minutes } : {}),
    ...(drb !== null ? { defensiveReboundsPer36: drb * 36 / minutes } : {}) }, assumptions };
}

export function buildV4SnapshotWorkerPayloadV1({ intake, userTeamCode, gameModelText, productionCandidateText, seed = 1,
  missingShootingRatingPolicy = 'reject' } = {}) {
  assert(intake?.status === 'ready-for-user-scenario-setup' && intake.leagueState, 'Resolve the V4 intake and exact roster choices before initializing games.');
  const candidate = JSON.parse(productionCandidateText), model = JSON.parse(gameModelText);
  assert(model?.modelId, 'A complete game-model artifact is required.');
  const leagueState = clone(intake.leagueState);
  assert(['reject', V4_GENERATED_SHOOTING_RATING_POLICY].includes(missingShootingRatingPolicy), 'Unsupported missing shooting-rating policy.');
  const generatedRatings = missingShootingRatingPolicy === V4_GENERATED_SHOOTING_RATING_POLICY
    ? buildV4GeneratedShootingRatingsV1(leagueState.players) : new Map();
  const generatedRows = [];
  for (const player of leagueState.players) {
    const generated = generatedRatings.get(normalizeCanonicalPlayerName(player.canonicalName));
    if (generated?.status !== 'generated-scenario') continue;
    player.shootingRating = generated.value;
    player.scenarioGeneratedRatings = { ...(player.scenarioGeneratedRatings ?? {}), shootingRating: clone(generated) };
    generatedRows.push(clone(generated));
  }
  const teamCode = String(userTeamCode ?? '').trim().toUpperCase();
  assert(leagueState.teams.some(team => team.teamCode === teamCode), 'Choose one valid user-controlled team.');
  const mapped = leagueState.players.map(player => createSnapshotPlayerProductionProfileV1(player, candidate, leagueState.seasonStartYear));
  const unresolved = mapped.filter(row => row.status !== 'ready');
  if (unresolved.length) throw Object.assign(new Error(`${unresolved.length} player snapshot profiles require review.`), { profileReview: unresolved });
  leagueState.players = mapped.map(row => row.player);
  leagueState.userControlledTeamCodes = [teamCode];
  // Explicitly begin a regular-season-only scenario; do not imply offseason
  // events or resolved contracts were replayed on the way to this window.
  leagueState.transactionWindow = 'games';
  leagueState.stateQuality.reasons.push('Regular-season-only snapshot: offseason setup is not replayed; initial workload/trends are neutral scenario assumptions.');
  if (generatedRows.length) leagueState.stateQuality.reasons.push(`${generatedRows.length} unavailable shooting components use explicitly generated, exposure-shrunk scenario ratings.`);
  validateLeagueState(leagueState);
  const plan = prepareCpuFranchiseRotation({ state: leagueState, teamCode, actor: 'user' });
  assert(plan.status === 'prepared', `User team rotation requires review: ${(plan.violations ?? []).join(' ')}`);
  const saved = createFranchiseRotationState({ state: leagueState, teamCode, controls: plan.controls, expectedStateRevision: leagueState.revision });
  assert(saved.status === 'created', 'Initial user rotation could not be prepared.');
  const source = intake.sourceReceipts.franchiseInputs ?? Object.values(intake.sourceReceipts).find(receipt => receipt?.package?.packageId);
  assert(source?.package?.packageId && source.package.packageVersion, 'Intake source receipt is missing.');
  const packageRef = source.package;
  const sourceReceipt = { packageId: packageRef.packageId, packageVersion: packageRef.packageVersion,
    packageManifestSha256: packageRef.packageManifestSha256, seasonStartYear: leagueState.seasonStartYear,
    intakeVersion: intake.version, mode: intake.scenario.mode, scheduleSource: clone(intake.schedule.source),
    disclosure: intake.scenario.description,
    generatedShootingRatings: { policy: missingShootingRatingPolicy, count: generatedRows.length,
      rows: generatedRows, originalSourceValuesPreserved: true, calibrated: false } };
  const teams = new Map(intake.teamRates.rows.map(row => [row.teamCode, row]));
  for (const team of teams.values()) {
    for (const field of ['offense', 'defense']) {
      assert(team.metrics?.[field]?.status === 'available' && team.metrics[field].unit === 'points-per-100' &&
        finite(team.metrics[field].value), `Verified points-per-100 ${field} is required for ${team.teamCode}.`);
    }
  }
  const gameInputs = Object.fromEntries(intake.schedule.games.map(game => [game.gameId, {
    seasonStartYear: leagueState.seasonStartYear, gameLocalDate: game.gameLocalDate,
    features: { priorMatchupEfficiencyMean: (
      teams.get(game.homeTeamCode)?.metrics?.offense?.value + teams.get(game.awayTeamCode)?.metrics?.defense?.value +
      teams.get(game.awayTeamCode)?.metrics?.offense?.value + teams.get(game.homeTeamCode)?.metrics?.defense?.value) / 4 - 100 },
    featureEvidence: { priorMatchupEfficiencyMean: {
      use: 'explicit-retrospective-snapshot-scenario',
      formula: '(home offense + away defense + away offense + home defense) / 4 - 100',
      expectedUnit: 'points per 100 possessions, centered at 100',
      sourceRows: [clone(teams.get(game.homeTeamCode)?.source ?? null), clone(teams.get(game.awayTeamCode)?.source ?? null)],
      disclosure: 'The fitted field name is retained; these are same-season snapshot team-efficiency rates, not prior-game or prior-season evidence.' },
      neutralFormAssumptions: [
        'Recent margin, scoring, defensive form, rest, team fatigue and opponent-adjusted strength differences start at zero.',
        'The homeCourt input is 1; its effect depends on the selected fitted coefficients, which may be zero.'
      ] },
    home: { teamCode: game.homeTeamCode, pace: teams.get(game.homeTeamCode)?.metrics?.pace48?.value, players: [] },
    away: { teamCode: game.awayTeamCode, pace: teams.get(game.awayTeamCode)?.metrics?.pace48?.value, players: [] },
  }]));
  assert(Object.values(gameInputs).every(input => finite(input.home.pace) && finite(input.away.pace)), 'Verified pace is required for each team.');
  assert(Object.values(gameInputs).every(input => finite(input.features.priorMatchupEfficiencyMean)), 'Verified offensive and defensive efficiency is required for each team.');
  return { sessionInput: { leagueState: saved.state, schedule: clone(intake.schedule.games), sourceReceipt, seed },
    gameModelText, productionCandidateText, gameInputs,
    eventOptions: { playerEventMapping: 'rate-linked-recovery-possession-v3', playerReboundOwnership: 'player-rebound-budget-v1' } };
}
