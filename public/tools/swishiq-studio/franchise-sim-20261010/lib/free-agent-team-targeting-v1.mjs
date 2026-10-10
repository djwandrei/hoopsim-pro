import {
  buildExactNameIndex,
  normalizeCanonicalPlayerName,
  resolvePlayerByCanonicalName,
} from './simulation-contracts-v1.mjs';
import { createCpuStrategyProfile } from './cpu-strategy-v1.mjs';
import { validateFranchiseRotationState } from './franchise-controls-v1.mjs';

const FORMAT = 'djhc-free-agent-team-fit-v1';
const STRATEGY_COMPONENTS = Object.freeze([
  'projectedWins', 'nearTermFit', 'development', 'futureFlexibility',
  'contractEfficiency', 'payrollRisk',
]);
const BAD_STATUSES = new Set(['unknown', 'unreported', 'conflict', 'unresolved', 'missing', 'missing-term', 'candidate', 'disputed', 'invalid']);
const clamp = (value, low = -1, high = 1) => Math.max(low, Math.min(high, value));
const asObject = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};

function unusableStatus(value) {
  const status = String(value ?? '').toLowerCase();
  return BAD_STATUSES.has(status) || [...BAD_STATUSES].some(bad => status.startsWith(`${bad}-`));
}

function rawEvidence(value) {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') return null;
  const wrapped = value && typeof value === 'object' && Object.hasOwn(value, 'value');
  const raw = wrapped ? value.value : value;
  if (raw === null || raw === undefined || raw === '' || typeof raw === 'boolean') return null;
  const status = String(wrapped ? (value.valueStatus ?? value.status ?? '') : '').toLowerCase();
  if (unusableStatus(status)) return null;
  const number = Number(raw);
  if (!Number.isFinite(number)) return null;
  return { value: number, valueStatus: status || 'unannotated', source: wrapped ? value.source ?? null : null,
    seasonStartYear: wrapped ? value.seasonStartYear ?? null : null };
}

function matchingSeason(record, targetSeasonStartYear, fallback = null) {
  const value = asObject(record);
  const season = value.targetSeasonStartYear ?? value.seasonStartYear ?? value.forecastSeasonStartYear ?? fallback;
  return Number.isInteger(Number(season)) && Number(season) === targetSeasonStartYear;
}

function numberAtSeason(value, targetSeasonStartYear, { fallbackSeason = null, allowUnscoped = false } = {}) {
  const parsed = rawEvidence(value);
  if (!parsed) return null;
  if (parsed.seasonStartYear !== null && Number(parsed.seasonStartYear) !== targetSeasonStartYear) return null;
  if (parsed.seasonStartYear === null && fallbackSeason !== null && Number(fallbackSeason) !== targetSeasonStartYear) return null;
  if (parsed.seasonStartYear === null && fallbackSeason === null && !allowUnscoped) return null;
  return { ...parsed, seasonStartYear: targetSeasonStartYear,
    seasonScope: parsed.seasonStartYear !== null || fallbackSeason !== null ? 'explicit' : 'assumed-current-state' };
}

function firstNumberAtSeason(records, fieldNames, targetSeasonStartYear, options = {}) {
  for (const record of records) {
    if (!record || typeof record !== 'object') continue;
    if (unusableStatus(record.valueStatus ?? record.status)) continue;
    for (const field of fieldNames) {
      if (!Object.hasOwn(record, field)) continue;
      const value = numberAtSeason(record[field], targetSeasonStartYear, {
        fallbackSeason: record[`${field}SeasonStartYear`] ?? record.targetSeasonStartYear ?? record.seasonStartYear ?? options.fallbackSeason ?? null,
        allowUnscoped: options.allowUnscoped === true,
      });
      if (value) return { ...value, field };
    }
  }
  return null;
}

function component(value, evidence = [], coverage = value === null ? 0 : 1, status = null) {
  return { value: value === null ? null : clamp(value), coverage,
    status: status ?? (value === null ? 'missing' : 'available'), evidence };
}

function forecastFor(player) {
  return asObject(player.projection ?? player.playerForecast ?? player.gameForecast ?? player.forecast);
}

function projectedWinsFor(player, targetSeasonStartYear, stateSeasonStartYear) {
  const forecast = forecastFor(player);
  const forecastSeason = forecast.targetSeasonStartYear ?? forecast.seasonStartYear ?? forecast.forecastSeasonStartYear ?? null;
  if (matchingSeason(forecast, targetSeasonStartYear)) {
    const value = firstNumberAtSeason([forecast], ['projectedWins', 'winsAdded', 'projectedContribution'], targetSeasonStartYear,
      { fallbackSeason: targetSeasonStartYear });
    if (value) return { value: clamp(value.value / 5), evidence: [{ field: value.field, value: value.value,
      unit: value.field === 'projectedWins' ? 'projected-wins' : 'forecast-contribution', source: value.source,
      valueStatus: value.valueStatus, seasonStartYear: targetSeasonStartYear }], status: 'forecast' };
  }
  const direct = firstNumberAtSeason([player], ['projectedWins'], targetSeasonStartYear, { fallbackSeason: stateSeasonStartYear });
  if (direct) return { value: clamp(direct.value / 5), evidence: [{ field: direct.field, value: direct.value,
    unit: 'projected-wins', source: direct.source, valueStatus: direct.valueStatus,
    seasonStartYear: targetSeasonStartYear }], status: 'forecast' };

  const rating = firstNumberAtSeason([forecast, player], ['rating', 'projectedRating', 'overallRating'], targetSeasonStartYear,
    { fallbackSeason: forecastSeason ?? player.ratingSeasonStartYear ?? stateSeasonStartYear, allowUnscoped: true });
  if (!rating || rating.value < 0 || rating.value > 100) return null;
  return { value: clamp((rating.value - 50) / 50), evidence: [{ field: rating.field, value: rating.value,
    unit: 'rating-0-to-100', source: rating.source, valueStatus: rating.valueStatus,
    seasonStartYear: targetSeasonStartYear }], status: 'provisional-rating-fallback' };
}

function positionGroups(player) {
  const fields = ['positionGroups', 'positionGroup', 'positions', 'position'];
  const values = [];
  for (const field of fields) {
    if (!Object.hasOwn(player, field)) continue;
    const supplied = player[field];
    const parentStatus = player[`${field}Status`] ?? (field.startsWith('position') ? player.positionEvidenceStatus : null);
    if (unusableStatus(parentStatus)) return [];
    if (supplied && typeof supplied === 'object' && Object.hasOwn(supplied, 'value')) {
      if (unusableStatus(supplied.valueStatus ?? supplied.status)) return [];
      const raw = supplied.value;
      if (Array.isArray(raw)) values.push(...raw);
      else if (raw !== null && raw !== undefined && raw !== '') values.push(raw);
    } else if (Array.isArray(supplied)) values.push(...supplied);
    else if (supplied !== null && supplied !== undefined && supplied !== '') values.push(supplied);
  }
  const groups = new Set();
  for (let raw of values) {
    if (raw && typeof raw === 'object' && Object.hasOwn(raw, 'value')) {
      if (unusableStatus(raw.valueStatus ?? raw.status)) return [];
      raw = raw.value;
    }
    const text = String(raw).trim().toLowerCase();
    if (['g', 'guard', 'pg', 'point guard', 'sg', 'shooting guard', 'combo guard'].includes(text)) groups.add('guard');
    else if (['f', 'forward', 'sf', 'small forward', 'pf', 'power forward', 'wing'].includes(text)) groups.add('forward');
    else if (['c', 'center', 'centre', 'big'].includes(text)) groups.add('center');
  }
  return [...groups].sort();
}

function projectedMinutesFor(player, targetSeasonStartYear, stateSeasonStartYear) {
  const forecast = forecastFor(player);
  if (matchingSeason(forecast, targetSeasonStartYear)) {
    const value = firstNumberAtSeason([forecast], ['projectedMinutes', 'minutes'], targetSeasonStartYear,
      { fallbackSeason: targetSeasonStartYear });
    if (value && value.value >= 0 && value.value <= 48) return { ...value, seasonScope: 'explicit' };
  }
  const direct = firstNumberAtSeason([player], ['projectedMinutes'], targetSeasonStartYear, { fallbackSeason: stateSeasonStartYear });
  if (direct && direct.value >= 0 && direct.value <= 48) return direct;
  const current = firstNumberAtSeason([player], ['minutesPerGame'], targetSeasonStartYear,
    { fallbackSeason: player.minutesSeasonStartYear ?? stateSeasonStartYear, allowUnscoped: true });
  if (current && current.value >= 0 && current.value <= 48) return { ...current, seasonScope: 'assumed-current-state' };
  return null;
}

function rosterMembers(state, team) {
  const exact = buildExactNameIndex(state.players ?? []);
  return (team.rosterNames ?? []).map(name => {
    const resolution = resolvePlayerByCanonicalName(exact, name);
    return resolution.status === 'resolved' ? resolution.matches[0] : null;
  });
}

function readPositionTargets(team) {
  const plan = asObject(team.rotationPlan ?? team.rotationNeeds);
  return asObject(plan.positionTargetsMinutes ?? plan.targetMinutesByPosition ?? team.positionTargetsMinutes);
}

function roleFitFor({ state, team, player, targetSeasonStartYear }) {
  const groups = positionGroups(player);
  if (!groups.length) return { role: component(null), minutes: null, missing: ['positionGroups'] };
  const targets = readPositionTargets(team);
  const targetValues = groups.map(group => ({ group, value: numberAtSeason(targets[group], targetSeasonStartYear,
    { fallbackSeason: targetSeasonStartYear }) })).filter(row => row.value && row.value.value >= 0);
  if (!targetValues.length) return { role: component(null, [{ field: 'positionGroups', value: groups }]), minutes: null,
    missing: ['rotationPlan.positionTargetsMinutes'] };

  const candidateMinutes = projectedMinutesFor(player, targetSeasonStartYear, state.seasonStartYear);
  if (!candidateMinutes || candidateMinutes.value <= 0) return { role: component(null), minutes: null,
    missing: ['candidate.projectedMinutes'] };

  const roster = rosterMembers(state, team);
  const manualControls = team.franchiseControlsBySeason?.[String(targetSeasonStartYear)];
  const manualValidation = manualControls ? validateFranchiseRotationState({ state, teamCode: team.teamCode,
    seasonStartYear: targetSeasonStartYear, controls: manualControls, commissionerMode: true }) : null;
  if (manualValidation && manualValidation.status !== 'pass') return { role: component(null), minutes: null,
    missing: ['saved franchise rotation requires review', ...manualValidation.violations, ...manualValidation.missingInputs] };
  const manualMinutes = new Map((manualValidation?.canonicalControls?.minuteAssignments ?? []).map(row =>
    [normalizeCanonicalPlayerName(row.canonicalName), row.minutes]));
  let unsupportedRoster = false;
  const scores = [];
  for (const { group, value: target } of targetValues) {
    let occupied = 0;
    for (const member of roster) {
      if (!member) { unsupportedRoster = true; continue; }
      const memberGroups = positionGroups(member);
      const allocations = team.rotationPlan?.projectedMinutesByPlayer ?? {};
      const allocationSeason = allocations[member.canonicalName]?.seasonStartYear;
      const explicitAllocation = Object.hasOwn(allocations, member.canonicalName) &&
        (allocationSeason == null || allocationSeason === targetSeasonStartYear);
      const manualMinute = manualMinutes.get(normalizeCanonicalPlayerName(member.canonicalName));
      const minutes = manualMinute !== undefined ? numberAtSeason({ value: manualMinute, seasonStartYear: targetSeasonStartYear,
        valueStatus: 'user-scenario' }, targetSeasonStartYear) : explicitAllocation ? numberAtSeason(allocations[member.canonicalName], targetSeasonStartYear,
        { fallbackSeason: state.seasonStartYear }) : projectedMinutesFor(member, targetSeasonStartYear, state.seasonStartYear);
      if (!memberGroups.length || !minutes || minutes.value < 0 || minutes.value > 48) { unsupportedRoster = true; continue; }
      if (memberGroups.includes(group)) {
        const positions = manualMinute !== undefined ? null : explicitAllocation ? allocations[member.canonicalName]?.positionMinutes : null;
        const allocated = positions ? numberAtSeason(positions[group], targetSeasonStartYear,
          { fallbackSeason: allocations[member.canonicalName].seasonStartYear ?? state.seasonStartYear }) : null;
        if (positions && (!allocated || allocated.value < 0 || allocated.value > 48)) { unsupportedRoster = true; continue; }
        occupied += positions ? allocated.value : minutes.value / memberGroups.length;
      }
    }
    if (unsupportedRoster) continue;
    const allocatedCandidateMinutes = candidateMinutes.value / Math.max(1, groups.length);
    const vacancy = Math.max(0, target.value - occupied);
    const coverage = clamp(vacancy / allocatedCandidateMinutes, 0, 1);
    scores.push({ group, vacancyMinutes: Math.round(vacancy * 100) / 100,
      projectedCandidateMinutes: Math.round(allocatedCandidateMinutes * 100) / 100,
      value: 2 * coverage - 1, targetMinutes: target.value,
      occupiedMinutes: Math.round(occupied * 100) / 100 });
  }
  if (unsupportedRoster || !scores.length) return { role: component(null), minutes: candidateMinutes.value,
    missing: unsupportedRoster ? ['roster position or projected-minutes evidence'] : ['matching position target'] };
  const value = scores.reduce((sum, row) => sum + row.value, 0) / scores.length;
  return { role: component(value, scores, 1), minutes: candidateMinutes.value, missing: [] };
}

function skillFitFor(player, team) {
  const needs = asObject(team.skillDomainNeeds ?? team.rotationNeeds?.skillDomains);
  const ratings = asObject(player.skillDomains ?? player.skillDomainRatings);
  const requested = Object.entries(needs).map(([domain, rawNeed]) => {
    const need = rawEvidence(rawNeed);
    if (!need || need.value < 0 || need.value > 1) return null;
    const rating = rawEvidence(ratings[domain] ?? player[`${domain}Domain`]);
    if (!rating || rating.value < 0 || rating.value > 100) return null;
    const normalized = rating.value <= 1 ? rating.value : rating.value / 100;
    return { domain, need: need.value, rating: normalized, value: 2 * normalized - 1 };
  });
  const known = requested.filter(Boolean);
  if (!known.length) return component(null, [], 0);
  const totalWeight = known.reduce((sum, row) => sum + row.need, 0);
  const weightedValue = totalWeight > 0 ? known.reduce((sum, row) => sum + row.value * row.need, 0) / totalWeight : null;
  const requestedWeight = Object.values(needs).reduce((sum, raw) => sum + (rawEvidence(raw)?.value ?? 0), 0);
  const coveredWeight = known.reduce((sum, row) => sum + row.need, 0);
  const coverage = requestedWeight > 0 ? coveredWeight / requestedWeight : known.length / Math.max(1, Object.keys(needs).length);
  return component(weightedValue, known, coverage);
}

function developmentFitFor(player, team, targetSeasonStartYear, stateSeasonStartYear) {
  const forecast = asObject(player.progressionForecast ?? player.progression ?? player.developmentForecast);
  const progression = matchingSeason(forecast, targetSeasonStartYear)
    ? firstNumberAtSeason([forecast], ['developmentValue', 'ratingChange', 'change'], targetSeasonStartYear,
      { fallbackSeason: targetSeasonStartYear }) : null;
  const items = [];
  if (progression) items.push({ field: progression.field, value: clamp(progression.value / 10), unit: 'rating-change-10-point-scale',
    seasonStartYear: targetSeasonStartYear, source: progression.source });
  const preference = asObject(team.agePreference ?? team.developmentAgePreference);
  const targetAge = rawEvidence(preference.targetAge);
  const tolerance = rawEvidence(preference.toleranceYears);
  const age = numberAtSeason(player.age, targetSeasonStartYear, {
    fallbackSeason: player.ageSeasonStartYear ?? stateSeasonStartYear, allowUnscoped: true,
  });
  if (targetAge && tolerance && tolerance.value > 0 && age && age.value >= 0 && age.value <= 100) {
    const distance = Math.abs(age.value - targetAge.value);
    items.push({ field: 'agePreference', value: clamp(1 - distance / tolerance.value, 0, 1) * 2 - 1,
      playerAge: age.value, targetAge: targetAge.value, toleranceYears: tolerance.value,
      seasonStartYear: targetSeasonStartYear, source: age.source });
  }
  if (!items.length) return component(null);
  return component(items.reduce((sum, row) => sum + row.value, 0) / items.length, items);
}

function contractSeasonsFor(player) {
  return player.contractSeasons ?? player.contract?.seasons ?? player.askingContract?.seasons ?? [];
}

function salaryCapFor(state, team, targetSeasonStartYear) {
  const rules = asObject(state.rulesReference);
  const thresholds = asObject(rules.thresholds ?? rules.seasonThresholds?.[String(targetSeasonStartYear)]);
  return firstNumberAtSeason([
    team.capPlanning, team, team.payrollState, thresholds, rules,
  ], ['salaryCapUsd', 'salaryCap', 'capUsd'], targetSeasonStartYear, { fallbackSeason: state.seasonStartYear });
}

function candidateCostFor(player, targetSeasonStartYear) {
  const season = contractSeasonsFor(player).find(row => Number(row.seasonStartYear ?? row.fromYear) === targetSeasonStartYear);
  const cost = firstNumberAtSeason([season, player.askingContract, player], ['capHit', 'capHitUsd', 'askingSalaryUsd', 'capCostUsd'], targetSeasonStartYear,
    { fallbackSeason: targetSeasonStartYear });
  return cost && cost.value >= 0 ? cost : null;
}

function flexibilityFor(team, state, targetSeasonStartYear) {
  return firstNumberAtSeason([team.capPlanning, team.payrollState, team],
    ['remainingFlexibilityUsd', 'remainingCapRoomUsd', 'capRoomUsd'], targetSeasonStartYear,
    { fallbackSeason: state.seasonStartYear });
}

function identityAndStatus(candidate, state, team) {
  const canonicalName = String(candidate.canonicalName ?? candidate.name ?? '').trim();
  const key = normalizeCanonicalPlayerName(canonicalName);
  if (!key) return { excluded: 'missing-canonical-name', canonicalName: null, key: '' };
  const explicitIdentity = String(candidate.identityStatus ?? '').toLowerCase();
  if (['ambiguous', 'unresolved', 'conflict', 'unknown'].includes(explicitIdentity)) {
    return { excluded: `identity-${explicitIdentity}`, canonicalName, key };
  }
  if (candidate.retired === true || String(candidate.rosterStatus ?? '').toLowerCase() === 'retired' || String(candidate.status ?? '').toLowerCase() === 'retired') {
    return { excluded: 'retired', canonicalName, key };
  }
  if (candidate.teamCode || candidate.attached === true || String(candidate.rosterStatus ?? '').toLowerCase() === 'rostered') return { excluded: 'already-attached', canonicalName, key };

  const resolution = resolvePlayerByCanonicalName(buildExactNameIndex(state.players ?? []), canonicalName);
  if (resolution.status === 'ambiguous') return { excluded: 'ambiguous-state-identity', canonicalName, key };
  if (resolution.status === 'resolved') {
    const player = resolution.matches[0];
    if (player.retired === true || String(player.rosterStatus ?? '').toLowerCase() === 'retired') return { excluded: 'retired', canonicalName, key };
    if (player.teamCode) return { excluded: 'already-attached', canonicalName, key };
    if ((team.rosterNames ?? []).some(name => normalizeCanonicalPlayerName(name) === key)) return { excluded: 'already-on-team-roster', canonicalName, key };
    return { canonicalName: player.canonicalName, key, linkedPlayer: player, identityStatus: 'exact-state-match' };
  }
  const rosteredElsewhere = (state.teams ?? []).some(row => (row.rosterNames ?? []).some(name => normalizeCanonicalPlayerName(name) === key));
  if (rosteredElsewhere) return { excluded: 'roster-name-already-attached', canonicalName, key };
  return { canonicalName, key, linkedPlayer: null, identityStatus: explicitIdentity === 'resolved' ? 'explicitly-resolved-candidate' : 'candidate-name-only' };
}

function teamPlayerCount(team) {
  return (team.rosterNames ?? []).length;
}

/** Evaluates basketball and roster fit only. Signing legality, budget and approval remain caller-owned. */
export function evaluateFreeAgentTeamFit({ state, teamCode, candidate, profile = null, targetSeasonStartYear = null } = {}) {
  if (!state || !Array.isArray(state.players) || !Array.isArray(state.teams)) throw new Error('Free-agent team fit requires a league state.');
  const normalizedTeamCode = String(teamCode ?? '').trim().toUpperCase();
  const team = state.teams.find(row => String(row.teamCode ?? '').toUpperCase() === normalizedTeamCode);
  if (!team) throw new Error(`Unknown team ${normalizedTeamCode || '(empty)'}.`);
  const targetYear = Number.isInteger(targetSeasonStartYear) ? targetSeasonStartYear : state.seasonStartYear;
  const identity = identityAndStatus(asObject(candidate), state, team);
  if (identity.excluded) return { format: FORMAT, status: 'excluded', teamCode: normalizedTeamCode,
    canonicalName: identity.canonicalName, exclusionReason: identity.excluded, seasonStartYear: targetYear };

  const selectedProfile = createCpuStrategyProfile(profile ?? team.strategyProfile ?? 'balanced');
  const sourcePlayer = { ...(identity.linkedPlayer ?? {}), ...asObject(candidate), canonicalName: identity.canonicalName };
  // Preserve authoritative attachment/retirement fields from the resolved state row.
  if (identity.linkedPlayer) {
    sourcePlayer.teamCode = identity.linkedPlayer.teamCode ?? null;
    sourcePlayer.retired = identity.linkedPlayer.retired === true;
    sourcePlayer.rosterStatus = identity.linkedPlayer.rosterStatus ?? sourcePlayer.rosterStatus;
  }
  const projected = projectedWinsFor(sourcePlayer, targetYear, state.seasonStartYear);
  const forecast = forecastFor(sourcePlayer);
  const forecastUncertainty = firstNumberAtSeason([forecast], ['projectedWinsUncertainty'], targetYear,
    { fallbackSeason: forecast.targetSeasonStartYear ?? forecast.seasonStartYear ?? targetYear });
  const role = roleFitFor({ state, team, player: sourcePlayer, targetSeasonStartYear: targetYear });
  const skill = skillFitFor(sourcePlayer, team);
  const development = developmentFitFor(sourcePlayer, team, targetYear, state.seasonStartYear);
  const salaryCap = salaryCapFor(state, team, targetYear);
  const cost = candidateCostFor(sourcePlayer, targetYear);
  const flexibility = flexibilityFor(team, state, targetYear);
  const costShare = salaryCap && salaryCap.value > 0 && cost ? clamp(cost.value / salaryCap.value, 0, 1) : null;
  const payrollRiskValue = costShare === null ? null : 1 - 2 * costShare;
  const roleAndSkill = [role.role, skill].filter(row => row.value !== null);
  const nearTermCoverage = roleAndSkill.length
    ? roleAndSkill.reduce((sum, row) => sum + row.coverage, 0) / Math.max(1, roleAndSkill.length) : 0;
  const nearTermFit = roleAndSkill.length
    ? component(roleAndSkill.reduce((sum, row) => sum + row.value, 0) / roleAndSkill.length,
      roleAndSkill.flatMap(row => row.evidence), nearTermCoverage) : component(null);
  const flexibilityScore = flexibility && salaryCap && salaryCap.value > 0
    ? component(2 * clamp(flexibility.value / salaryCap.value, 0, 1) - 1, [{ field: 'remaining-flexibility-to-cap',
      remainingFlexibilityUsd: flexibility.value, salaryCapUsd: salaryCap.value, seasonStartYear: targetYear }]) : component(null);
  const contractEfficiency = projected && costShare !== null
    ? component(clamp(projected.value - 2 * costShare), [...projected.evidence, { field: 'cap-cost-share', value: costShare,
      amountUsd: cost.value, salaryCapUsd: salaryCap.value, seasonStartYear: targetYear }], projected.status === 'forecast' ? 1 : 0.25,
      projected.status === 'forecast' ? 'available' : 'provisional-rating-fallback') : component(null);
  const components = {
    projectedWins: projected ? component(projected.value, projected.evidence, projected.status === 'forecast' ? 1 : 0.25,
      projected.status === 'forecast' ? 'forecast' : projected.status) : component(null),
    nearTermFit,
    development,
    futureFlexibility: flexibilityScore,
    draftAssetValue: component(null, [], 0, 'not-applicable-to-free-agent-targeting'),
    contractEfficiency,
    payrollRisk: payrollRiskValue === null ? component(null) : component(payrollRiskValue,
      [{ field: 'cap-cost-share', value: costShare, amountUsd: cost.value, salaryCapUsd: salaryCap.value,
        seasonStartYear: targetYear }]),
  };
  const relevantWeightTotal = STRATEGY_COMPONENTS.reduce((sum, key) => sum + selectedProfile.weights[key], 0);
  let availableWeight = 0;
  let weightedScore = 0;
  let weightedCoverage = 0;
  for (const key of STRATEGY_COMPONENTS) {
    const weight = selectedProfile.weights[key];
    const row = components[key];
    if (row.value === null) continue;
    availableWeight += weight;
    weightedScore += row.value * weight;
    weightedCoverage += weight * row.coverage;
  }
  const score = availableWeight > 0 ? weightedScore / availableWeight : null;
  const coverage = relevantWeightTotal > 0 ? weightedCoverage / relevantWeightTotal : 0;
  const missingInputs = [];
  for (const key of STRATEGY_COMPONENTS) if (components[key].value === null) missingInputs.push(key);
  if (role.missing.length) missingInputs.push(...role.missing);
  if (skill.value === null) missingInputs.push('skillDomainNeeds or candidate skillDomains');
  if (!projected || projected.status !== 'forecast') missingInputs.push('target-season projectedWins forecast');
  if (!salaryCap || !(salaryCap.value > 0)) missingInputs.push('positive target-season salary cap for relative cost');
  if (!cost) missingInputs.push('target-season candidate cap cost');
  if (!flexibility) missingInputs.push('team remaining cap flexibility');
  if (projected?.status === 'provisional-rating-fallback') missingInputs.push('projectedWins forecast (rating fallback used provisionally)');
  const assumptions = [];
  if (identity.identityStatus === 'candidate-name-only') assumptions.push('Candidate name is not linked to a unique player row in league state; exact text is preserved and no fuzzy identity match is attempted.');
  if (projected?.status === 'provisional-rating-fallback') assumptions.push('Current overall/projected rating is a provisional proxy for contribution because no target-season projected-wins value was supplied; it is not a wins forecast.');
  if (role.minutes !== null) assumptions.push('Position vacancy is estimated from the team rotation position-minute targets less rostered-player projected minutes supplied for the target season.');
  if (!cost || !salaryCap) assumptions.push('Missing salary or cap inputs leave relative contract cost unknown; no contract legality or signing budget was evaluated.');
  const status = score === null ? 'insufficient-evidence' : coverage >= 0.999 && projected?.status === 'forecast' ? 'supported' : 'provisional';
  return {
    format: FORMAT,
    status,
    teamCode: normalizedTeamCode,
    canonicalName: identity.canonicalName,
    candidateId: sourcePlayer.playerId ?? sourcePlayer.candidateId ?? null,
    identityStatus: identity.identityStatus,
    seasonStartYear: targetYear,
    strategyProfile: selectedProfile.profileId,
    score: score === null ? null : Math.round(score * 1e6) / 1e6,
    coverage: Math.round(coverage * 1e6) / 1e6,
    uncertainty: {
      missingEvidenceShare: Math.round((1 - coverage) * 1e6) / 1e6,
      projectedWinsHalfWidth: forecastUncertainty && forecastUncertainty.value >= 0
        ? Math.round(clamp(forecastUncertainty.value / 5, 0, 1) * 1e6) / 1e6 : null,
      projectedWinsEvidence: forecastUncertainty ? { value: forecastUncertainty.value,
        valueStatus: forecastUncertainty.valueStatus, source: forecastUncertainty.source,
        seasonStartYear: targetYear } : null,
      basis: 'Coverage reflects weighted missing/provisional scoring inputs. Forecast uncertainty is shown only when an explicit target-season projectedWinsUncertainty input is supplied; neither measure is a calibrated ranking interval.',
    },
    components,
    missingInputs: [...new Set(missingInputs)].sort(),
    assumptions,
    rosterContext: { rosterCount: teamPlayerCount(team), positionMinutes: role.role.evidence },
    decisionBoundary: 'Team-fit ranking only. Contract budgets and transaction legality must be evaluated by the shared transaction engine. No signing or approval is performed.',
  };
}

/** Stable per-team target ranking; duplicate/attached/retired identities are reported as exclusions. */
export function rankFreeAgentTargets({ state, teamCode, candidates = [], profile = null, targetSeasonStartYear = null } = {}) {
  const normalizedTeamCode = String(teamCode ?? '').trim().toUpperCase();
  const exactCandidateNames = new Map();
  (candidates ?? []).forEach((candidate, index) => {
    const name = candidate?.canonicalName ?? candidate?.name;
    const key = normalizeCanonicalPlayerName(name);
    if (!key) return;
    const rows = exactCandidateNames.get(key) ?? [];
    rows.push(index);
    exactCandidateNames.set(key, rows);
  });
  const rankings = [];
  const excludedCandidates = [];
  (candidates ?? []).forEach((candidate, index) => {
    const name = candidate?.canonicalName ?? candidate?.name ?? null;
    const key = normalizeCanonicalPlayerName(name);
    if (key && (exactCandidateNames.get(key)?.length ?? 0) > 1) {
      excludedCandidates.push({ index, canonicalName: name, reason: 'duplicate-candidate-identity' });
      return;
    }
    const fit = evaluateFreeAgentTeamFit({ state, teamCode: normalizedTeamCode, candidate,
      profile, targetSeasonStartYear });
    if (fit.status === 'excluded') {
      excludedCandidates.push({ index, canonicalName: fit.canonicalName, reason: fit.exclusionReason });
      return;
    }
    rankings.push({ candidateIndex: index, canonicalName: fit.canonicalName, candidateId: fit.candidateId,
      status: fit.status, score: fit.score, coverage: fit.coverage, fit });
  });
  rankings.sort((left, right) => {
    if (left.score === null && right.score !== null) return 1;
    if (right.score === null && left.score !== null) return -1;
    if (left.score !== right.score) return (right.score ?? 0) - (left.score ?? 0);
    const leftName = normalizeCanonicalPlayerName(left.canonicalName);
    const rightName = normalizeCanonicalPlayerName(right.canonicalName);
    return leftName.localeCompare(rightName, 'en') || left.candidateIndex - right.candidateIndex;
  });
  rankings.forEach((row, index) => { row.rank = index + 1; });
  excludedCandidates.sort((left, right) => left.index - right.index);
  return {
    format: 'djhc-free-agent-target-rankings-v1',
    teamCode: normalizedTeamCode,
    seasonStartYear: Number.isInteger(targetSeasonStartYear) ? targetSeasonStartYear : state?.seasonStartYear ?? null,
    strategyProfile: rankings[0]?.fit.strategyProfile ?? createCpuStrategyProfile(profile ?? 'balanced').profileId,
    rankings,
    excludedCandidates,
    rankingMethod: 'Available normalized components are reweighted over available evidence; missing inputs reduce coverage and are never scored as zero. Ties use exact normalized canonical name, then candidate order.',
    decisionBoundary: 'Rankings are informational targets only. Contract legality, budgets, and approval are caller-evaluated; no player is signed.',
  };
}
