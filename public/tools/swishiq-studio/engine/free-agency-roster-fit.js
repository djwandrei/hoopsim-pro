/*
 * Evidence-bound free-agent roster-fit recommendations for Franchise.
 *
 * The native SwishIQ season packages provide player production, skill
 * components, impact, and team membership. They do not provide a complete
 * NBA contract/cap ledger or free-agent transaction ledger. This module
 * therefore evaluates basketball fit from supplied evidence and only checks
 * a salary offer against an explicitly supplied scenario budget. It never
 * creates a contract, asserts CBA legality, or commits a signing.
 *
 * Rule references for a future cap-sheet adapter:
 * - https://www.nbpa.com/cba (current 2023 CBA, effective 2023-07-01)
 * - https://www.nba.com/news/free-agency-explained
 */

export const FREE_AGENCY_ROSTER_FIT_VERSION = 'swishiq-free-agency-roster-fit-v1';
export const DEFAULT_LONGITUDINAL_TREND_WEIGHT = 0.15;

export const FREE_AGENCY_SKILL_KEYS = Object.freeze([
  'scoring', 'shooting', 'creation', 'playmaking', 'rebounding',
  'defensiveActivity', 'efficiency', 'threePointShooting',
]);

// 2023 NBA-NBPA CBA term limits (max term includes option years). Amounts are
// deliberately excluded; they vary by Salary Cap Year and must come from an
// accepted, season-specific cap sheet. Source: NBA/NBPA CBA 101, pp. 10-11.
const CBA_MAX_YEARS = Object.freeze({
  bird: 5,
  'early-bird': 4,
  'non-bird': 4,
  'cap-room': 4,
  'non-taxpayer-mid-level': 4,
  'room-mid-level': 3,
  'bi-annual': 2,
  'taxpayer-mid-level': 2,
  minimum: 2,
  'rookie-scale': 4,
  // CBA 101 gives the Second Round Pick Exception a four-year max including
  // its option year (the underlying term is two or three years plus one team option).
  'second-round-pick': 4,
  'disabled-player': 1,
});
const BIRD_MECHANISMS = new Set(['bird', 'early-bird']);

const POSITION_KEYS = new Set(['G', 'F', 'C']);
const HASH = /^[a-f0-9]{64}$/i;
const finite = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
const text = value => String(value ?? '').trim();
const round = (value, digits = 4) => {
  const scale = 10 ** digits;
  return Math.round(Number(value) * scale) / scale;
};
const clamp = (value, low, high) => Math.max(low, Math.min(high, Number(value)));

function fail(message) { throw new Error(message); }

function sourcePackage(pin, evidenceSeasonStartYear) {
  if (!pin || pin.accepted !== true) fail('Free-agency evaluation needs a package accepted by the static capability resolver.');
  const ref = pin.packageRef && typeof pin.packageRef === 'object' ? pin.packageRef : pin;
  const scope = ref.scope;
  if (!text(ref.packageId) || !text(ref.packageVersion)
    || !HASH.test(text(ref.packageManifestSha256)) || !HASH.test(text(ref.sourceLockSha256))) {
    fail('Free-agency evaluation needs package, version, manifest, and source-lock pins.');
  }
  if (!scope || !['exact-season', 'pooled-window'].includes(scope.kind)) fail('Free-agency package scope is invalid.');
  const years = Array.isArray(scope.seasonStartYears) ? scope.seasonStartYears.map(Number) : [];
  if (!years.includes(Number(evidenceSeasonStartYear))) fail('Evidence season is outside the accepted package pin.');
  if (scope.kind === 'exact-season' && (Number(scope.seasonStartYear) !== Number(evidenceSeasonStartYear) || years.length !== 1)) {
    fail('Exact-season free-agency evidence must match its single selected season.');
  }
  return {
    packageId: text(ref.packageId), packageVersion: text(ref.packageVersion),
    packageManifestSha256: text(ref.packageManifestSha256).toLowerCase(),
    sourceLockSha256: text(ref.sourceLockSha256).toLowerCase(),
    scope: { kind: scope.kind, seasonStartYear: Number(scope.seasonStartYear), seasonStartYears: years },
  };
}

function sourceRow(candidate, key, playerRef, evidenceSeasonStartYear) {
  const row = candidate?.[key];
  if (!row || typeof row !== 'object' || Array.isArray(row)) return null;
  if (text(row.playerRef) !== playerRef || Number(row.seasonStartYear) !== Number(evidenceSeasonStartYear)
    || text(row.phase).toLowerCase() !== 'regular') return null;
  if (text(candidate?.teamCode) && text(row.teamCode) && text(candidate.teamCode) !== text(row.teamCode)) return null;
  return row;
}

function requireUniquePlayerRefs(rows, label) {
  const seen = new Set();
  for (const row of rows) {
    const playerRef = text(row?.playerRef || row?.skillComponent?.playerRef);
    if (!playerRef) fail(`${label} rows need stable player references.`);
    if (seen.has(playerRef)) fail(`${label} needs one season-level row per player; aggregate multi-team season records before evaluation.`);
    seen.add(playerRef);
  }
}

function componentValues(row) {
  if (!row || row.evidenceKind !== 'observed' || row.coverage !== 'normalized-observed-season'
    || !row.componentValues || typeof row.componentValues !== 'object') return {};
  return Object.fromEntries(FREE_AGENCY_SKILL_KEYS
    .filter(key => finite(row.componentValues[key]))
    .map(key => [key, Number(row.componentValues[key])]));
}

function metricValue(metrics, key, allowDerived = false) {
  const metric = metrics?.[key];
  if (!metric || metric.status !== 'available' || !finite(metric.value)) return null;
  if (metric.evidenceKind !== 'observed' && !(allowDerived && metric.evidenceKind === 'derived-estimate')) return null;
  if (metric.denominator !== null && metric.denominator !== undefined
    && (!finite(metric.denominator) || Number(metric.denominator) <= 0)) return null;
  return { value: Number(metric.value), unit: text(metric.unit) || null,
    denominator: finite(metric.denominator) ? Number(metric.denominator) : null,
    evidenceKind: metric.evidenceKind };
}

function observedPerformance(playerSeason, skillRow) {
  const metrics = playerSeason?.metrics || {};
  const metricKeys = [
    'pointsPerGame', 'pointsPer100Possessions', 'assistsPerGame', 'assistsPer100Possessions',
    'reboundsPerGame', 'reboundsPer100Possessions', 'stealsPerGame',
    'blocksPerGame', 'trueShootingPercentage', 'threePointPercentage',
  ];
  const observedMetrics = {};
  const derivedMetrics = {};
  for (const key of metricKeys) {
    const observed = metricValue(metrics, key);
    const derived = observed || metricValue(metrics, key, true);
    if (observed) observedMetrics[key] = observed;
    else if (derived) derivedMetrics[key] = derived;
  }
  const impact = playerSeason?.impact;
  const observedImpact = impact?.alreadyRegularized === true
    && finite(impact.offensePer100) && finite(impact.defensePer100)
    ? { offensePer100: Number(impact.offensePer100), defensePer100: Number(impact.defensePer100),
      reliability: finite(impact.reliability) ? clamp(impact.reliability, 0, 1) : null,
      evidenceKind: 'observed-regularized-impact', shrinkageAppliedBySource: true }
    : null;
  return {
    skillComponents: componentValues(skillRow),
    observedMetrics,
    derivedMetrics,
    impact: observedImpact,
    boxTotals: Object.fromEntries(['points', 'assists', 'rebounds', 'steals', 'blocks', 'turnovers']
      .filter(key => finite(playerSeason?.box?.[key]))
      .map(key => [key, Number(playerSeason.box[key])])),
  };
}

function availability(candidate, evaluationSeasonStartYear) {
  const evidence = candidate?.availabilityEvidence;
  if (!evidence || evidence.accepted !== true || evidence.status !== 'available'
    || !text(evidence.sourceRef) || Number(evidence.seasonStartYear) !== Number(evaluationSeasonStartYear)) {
    return { status: 'unavailable', signingPathStatus: 'unavailable',
      reason: 'No accepted free-agent availability record is pinned to the evaluation season.' };
  }
  const kind = text(evidence.freeAgentType).toLowerCase();
  if (['unrestricted', 'ufa'].includes(kind)) return {
    status: 'available', freeAgentType: 'unrestricted', signingPathStatus: 'standard-signing-subject-to-cap-and-cba-review',
    evidenceKind: text(evidence.evidenceKind) || 'accepted-availability-record',
    sourceRef: text(evidence.sourceRef), seasonStartYear: Number(evaluationSeasonStartYear),
  };
  if (['restricted', 'rfa'].includes(kind)) return {
    status: 'available', freeAgentType: 'restricted', signingPathStatus: 'offer-sheet-and-original-team-right-of-first-refusal-review-required',
    evidenceKind: text(evidence.evidenceKind) || 'accepted-availability-record',
    sourceRef: text(evidence.sourceRef), seasonStartYear: Number(evaluationSeasonStartYear),
  };
  return { status: 'unavailable', signingPathStatus: 'unavailable', sourceRef: text(evidence.sourceRef),
    seasonStartYear: Number(evaluationSeasonStartYear),
    reason: 'The accepted availability record does not classify the player as restricted or unrestricted.' };
}

function validatedCareerState(row) {
  if (!row || !['complete', 'sourced-complete'].includes(row.stateQuality)
    || !finite(row.age) || Number(row.age) < 16 || Number(row.age) > 50
    || !finite(row.experience) || Number(row.experience) < 0 || Number(row.experience) > 50
    || !text(row.ageSource) || !text(row.experienceSource)
    || ['conflict', 'missing'].includes(row.stateQuality)) return null;
  return { age: Number(row.age), experience: Number(row.experience), ageSource: text(row.ageSource),
    experienceSource: text(row.experienceSource), stateSource: text(row.stateSource) || null,
    stateQuality: row.stateQuality };
}

function trendScenario(candidate, currentValues, evidenceSeasonStartYear) {
  const history = Array.isArray(candidate?.careerStateHistory) ? candidate.careerStateHistory : [];
  const byYear = new Map();
  for (const row of history) {
    const year = Number(row?.seasonStartYear);
    const state = validatedCareerState(row);
    const values = row?.componentValues || row?.skillComponent?.componentValues;
    if (!Number.isInteger(year) || !state || !values || typeof values !== 'object') continue;
    byYear.set(year, { ...state, componentValues: values });
  }
  const latest = byYear.get(Number(evidenceSeasonStartYear));
  if (!latest) return { status: 'unavailable', reason: 'Validated age, experience, and current-season skill history are required.' };

  const transitions = (Array.isArray(candidate?.careerTransitions) ? candidate.careerTransitions : [])
    .filter(row => text(row?.playerRef) === text(candidate.playerRef)
      && Number(row?.toSeasonStartYear) === Number(row?.fromSeasonStartYear) + 1
      && Number(row?.toSeasonStartYear) <= Number(evidenceSeasonStartYear))
    .sort((a, b) => Number(a.toSeasonStartYear) - Number(b.toSeasonStartYear))
    .filter(row => {
      const from = byYear.get(Number(row.fromSeasonStartYear));
      const to = byYear.get(Number(row.toSeasonStartYear));
      return from && to && to.age === from.age + 1
        && to.experience === from.experience + 1
        && Number(row.fromGames) > 0 && Number(row.toGames) > 0
        && row.fromComponents && row.toComponents;
    });
  const recent = transitions.slice(-3);
  if (recent.length < 2) return {
    status: 'unavailable', reason: 'A player-specific trajectory needs at least two adjacent transitions and validated age/experience at every endpoint.',
    asOf: { age: latest.age, experience: latest.experience, ageSource: latest.ageSource, experienceSource: latest.experienceSource },
  };
  const projectedComponentChanges = {};
  for (const key of FREE_AGENCY_SKILL_KEYS) {
    const deltas = recent.map(row => Number(row.toComponents[key]) - Number(row.fromComponents[key]));
    if (deltas.some(value => !Number.isFinite(value))) continue;
    const sorted = [...deltas].sort((a, b) => a - b);
    const midpoint = Math.floor(sorted.length / 2);
    const median = sorted.length % 2 ? sorted[midpoint] : (sorted[midpoint - 1] + sorted[midpoint]) / 2;
    if (!finite(currentValues[key])) continue;
    projectedComponentChanges[key] = {
      observedAnnualChanges: deltas.map(value => round(value)),
      medianChangeScenario: round(median),
      nextSeasonComponentScenario: round(Number(currentValues[key]) + median),
      observedChangeRange: { low: round(sorted[0]), high: round(sorted[sorted.length - 1]) },
    };
  }
  return {
    status: Object.keys(projectedComponentChanges).length ? 'player-specific-scenario' : 'unavailable',
    calibration: 'uncalibrated-extrapolation',
    horizonSeasons: 1,
    asOf: { age: latest.age, experience: latest.experience, ageSource: latest.ageSource,
      experienceSource: latest.experienceSource, nextSeasonAge: latest.age + 1,
      nextSeasonExperience: latest.experience + 1 },
    transitionCount: recent.length,
    transitionYears: recent.map(row => [Number(row.fromSeasonStartYear), Number(row.toSeasonStartYear)]),
    projectedComponentChanges,
    uncertainty: { method: 'range-of-recent-observed-player-specific-annual-changes',
      predictiveInterval: false, note: 'This is a transparent trend scenario; it is not a calibrated forecast interval.' },
  };
}

/**
 * Summarize only the latest contiguous, package-pinned player skill transitions.
 * This is a conservative observed-momentum input, not an age curve or forecast.
 */
function observedSkillTrend(candidate, packageRef, evidenceSeasonStartYear, expectedGames) {
  if (!finite(expectedGames) || Number(expectedGames) <= 0) return {
    status: 'unavailable', reason: 'Explicit expected season games are needed to exposure-shrink historical transition changes.',
  };
  const allowedYears = new Set(packageRef.scope.seasonStartYears);
  const playerRef = text(candidate?.playerRef);
  const transitions = (Array.isArray(candidate?.careerTransitions) ? candidate.careerTransitions : [])
    .filter(row => text(row?.playerRef) === playerRef && row?.evidenceKind === 'observed-transition'
      && Number(row?.toSeasonStartYear) === Number(row?.fromSeasonStartYear) + 1
      && Number(row?.toSeasonStartYear) <= Number(evidenceSeasonStartYear)
      && allowedYears.has(Number(row?.fromSeasonStartYear)) && allowedYears.has(Number(row?.toSeasonStartYear))
      && finite(row?.fromGames) && Number(row.fromGames) > 0
      && finite(row?.toGames) && Number(row.toGames) > 0
      && row?.fromComponents && typeof row.fromComponents === 'object'
      && row?.toComponents && typeof row.toComponents === 'object')
    .sort((a, b) => Number(a.toSeasonStartYear) - Number(b.toSeasonStartYear));
  const latest = transitions.filter(row => Number(row.toSeasonStartYear) === Number(evidenceSeasonStartYear)).at(-1);
  if (!latest) return {
    status: 'unavailable', reason: 'No current-season endpoint is present in the accepted package transition history.',
  };
  const trailing = [latest];
  let priorStartYear = Number(latest.fromSeasonStartYear);
  for (let index = transitions.length - 1; index >= 0; index -= 1) {
    const row = transitions[index];
    if (row === latest || Number(row.toSeasonStartYear) !== priorStartYear) continue;
    trailing.unshift(row);
    priorStartYear = Number(row.fromSeasonStartYear);
  }
  const recent = trailing.slice(-3);
  if (recent.length < 2) return {
    status: 'unavailable', reason: 'At least two contiguous observed skill transitions are needed for a longitudinal trend.',
    transitionCount: recent.length,
  };
  const expected = Number(expectedGames);
  const components = {};
  for (const key of FREE_AGENCY_SKILL_KEYS) {
    const changes = recent.map(row => ({
      change: finite(row.toComponents[key]) && finite(row.fromComponents[key])
        ? Number(row.toComponents[key]) - Number(row.fromComponents[key]) : NaN,
      exposure: Math.sqrt(clamp(Math.min(Number(row.fromGames), Number(row.toGames)) / expected, 0, 1)),
    }));
    if (changes.some(change => !Number.isFinite(change.change))) continue;
    components[key] = {
      observedAnnualChanges: changes.map(change => round(change.change)),
      exposureAdjustedMedianChange: round(median(changes.map(change => change.change * change.exposure))),
      exposureReliability: round(changes.reduce((sum, change) => sum + change.exposure, 0) / changes.length),
    };
  }
  return Object.keys(components).length ? {
    status: 'observed-skill-trend',
    source: { packageId: packageRef.packageId, packageVersion: packageRef.packageVersion,
      packageManifestSha256: packageRef.packageManifestSha256, sourceLockSha256: packageRef.sourceLockSha256,
      seasonStartYears: recent.flatMap(row => [Number(row.fromSeasonStartYear), Number(row.toSeasonStartYear)])
        .filter((year, index, values) => values.indexOf(year) === index) },
    transitionCount: recent.length,
    latestSeasonStartYear: Number(evidenceSeasonStartYear),
    calibratedForecast: false,
    nextSeasonTrajectory: false,
    expectedGames: expected,
    components,
  } : { status: 'unavailable', reason: 'Transition rows lack comparable skill values.' };
}

function acceptedPotential(candidate) {
  const evidence = candidate?.potentialEvidence;
  if (evidence?.accepted !== true || !text(evidence.sourceRef) || !text(evidence.source)
    || !finite(evidence.value)) return { status: 'unavailable', reason: 'No accepted external potential source was supplied.' };
  return { status: 'available', value: Number(evidence.value), unit: text(evidence.unit) || null,
    source: text(evidence.source), sourceRef: text(evidence.sourceRef), evidenceKind: 'accepted-external' };
}

function marketValue(candidate) {
  const evidence = candidate?.marketValueEvidence;
  if (evidence?.accepted !== true || !text(evidence.sourceRef) || !text(evidence.modelId)
    || !finite(evidence.amount) || Number(evidence.amount) < 0) {
    return { status: 'unavailable', reason: 'No accepted market-value model output was supplied.' };
  }
  return { status: 'modeled-estimate', amount: Number(evidence.amount), currency: text(evidence.currency) || 'USD',
    modelId: text(evidence.modelId), sourceRef: text(evidence.sourceRef), signedSalary: false };
}

function budgetStatus(offer, capLedger, evaluationSeasonStartYear) {
  if (!offer || !finite(offer.firstYearSalary) || Number(offer.firstYearSalary) < 0) {
    return { status: 'unavailable', reason: 'An explicit user-supplied first-year offer is required.' };
  }
  if (!capLedger || capLedger.accepted !== true || Number(capLedger.seasonStartYear) !== Number(evaluationSeasonStartYear)
    || !text(capLedger.sourceRef) || !finite(capLedger.availableRoom) || Number(capLedger.availableRoom) < 0) {
    return { status: 'unavailable', reason: 'An accepted cap ledger for the evaluation season is required.' };
  }
  const salary = Number(offer.firstYearSalary);
  const withinRoom = salary <= Number(capLedger.availableRoom);
  return {
    status: withinRoom ? 'within-declared-room' : 'above-declared-room',
    firstYearSalary: salary,
    declaredRoom: Number(capLedger.availableRoom),
    offerSource: text(offer.source) || 'user-supplied-scenario-offer',
    capLedgerSourceRef: text(capLedger.sourceRef),
    seasonStartYear: Number(evaluationSeasonStartYear),
    cbaEligibility: 'not-evaluated',
    reason: withinRoom
      ? 'The explicit offer fits the supplied room value; CBA exceptions, holds, aprons, and contract terms still need an authoritative cap-sheet review.'
      : 'The explicit offer exceeds the supplied room value; no exception or alternate signing mechanism was inferred.',
  };
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[index] : (sorted[index - 1] + sorted[index]) / 2;
}

function robustScale(values) {
  if (values.length < 2) return null;
  const center = median(values);
  const deviations = values.map(value => Math.abs(value - center));
  const mad = median(deviations);
  if (mad > 0) return mad * 1.4826;
  const sorted = [...values].sort((a, b) => a - b);
  const q1 = sorted[Math.floor((sorted.length - 1) * 0.25)];
  const q3 = sorted[Math.ceil((sorted.length - 1) * 0.75)];
  const spread = (q3 - q1) / 1.349;
  return spread > 0 ? spread : null;
}

function tieHash(seed, playerRef) {
  let hash = 2166136261;
  for (const char of `${seed}:${playerRef}`) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function normalizedPositions(candidate) {
  const source = candidate?.positions || candidate?.skillComponent?.positions || candidate?.playerSeason?.positions || [];
  return [...new Set((Array.isArray(source) ? source : [source]).map(value => text(value).toUpperCase()).filter(value => POSITION_KEYS.has(value)))];
}

function roleComparisonRows(comparisonPool, role, evidenceSeasonStartYear) {
  return comparisonPool.map(candidate => {
    const ref = text(candidate?.playerRef || candidate?.skillComponent?.playerRef);
    const row = sourceRow(candidate, 'skillComponent', ref, evidenceSeasonStartYear);
    return { candidate, values: componentValues(row), positions: normalizedPositions(candidate) };
  }).filter(entry => entry.positions.includes(role));
}

function fitByRole(candidate, row, teamNeeds, comparisonPool, evidenceSeasonStartYear, expectedGames, expectedMinutes, skillTrend) {
  const positions = normalizedPositions(candidate);
  const games = finite(row?.games) && Number(row.games) >= 0 ? Number(row.games) : null;
  const minutes = finite(row?.minutes) && Number(row.minutes) >= 0 ? Number(row.minutes) : null;
  const roles = [];
  for (const need of teamNeeds) {
    const role = text(need.role).toUpperCase();
    if (!POSITION_KEYS.has(role) || !finite(need.weight) || Number(need.weight) <= 0) continue;
    const positionEligible = positions.includes(role);
    const requestedSkills = need.skillWeights && typeof need.skillWeights === 'object'
      ? Object.entries(need.skillWeights).filter(([key, weight]) => FREE_AGENCY_SKILL_KEYS.includes(key) && finite(weight) && Number(weight) > 0)
      : [];
    const rolePool = roleComparisonRows(comparisonPool, role, evidenceSeasonStartYear);
    const peerGames = rolePool.map(entry => Number(entry.candidate?.skillComponent?.games)).filter(value => Number.isFinite(value) && value > 0);
    const peerMinutes = rolePool.map(entry => Number(entry.candidate?.skillComponent?.minutes)).filter(value => Number.isFinite(value) && value > 0);
    const gameExposureReference = finite(expectedGames) && Number(expectedGames) > 0 ? Number(expectedGames) : peerGames.length ? median(peerGames) : null;
    const minuteExposureReference = finite(expectedMinutes) && Number(expectedMinutes) > 0 ? Number(expectedMinutes) : peerMinutes.length ? median(peerMinutes) : null;
    const gameCoverage = games !== null && gameExposureReference ? clamp(games / gameExposureReference, 0, 1) : null;
    const minuteCoverage = minutes !== null && minuteExposureReference ? clamp(minutes / minuteExposureReference, 0, 1) : null;
    const exposureCoverage = [gameCoverage, minuteCoverage].filter(finite);
    const workloadReliability = exposureCoverage.length
      ? Math.sqrt(Math.min(...exposureCoverage)) : null;
    const skills = {};
    let weightedSum = 0;
    let totalWeight = 0;
    let trendWeightedSum = 0;
    let trendTotalWeight = 0;
    for (const [key, rawWeight] of requestedSkills) {
      const values = rolePool.map(entry => entry.values[key]).filter(finite);
      const value = componentValues(row)[key];
      if (!finite(value) || values.length < 3) {
        skills[key] = { status: !finite(value) ? 'unavailable' : 'insufficient-comparison-cohort', value: finite(value) ? Number(value) : null,
          comparisonCount: values.length, weight: Number(rawWeight) };
        continue;
      }
      const center = median(values);
      const scale = robustScale(values);
      const rawZ = scale ? clamp((Number(value) - center) / scale, -3, 3) : 0;
      const adjustedZ = workloadReliability === null ? rawZ : rawZ * workloadReliability;
      skills[key] = { status: scale ? 'compared' : 'no-cohort-variation', value: Number(value), cohortMedian: round(center),
        robustZ: round(rawZ), workloadReliability: workloadReliability === null ? null : round(workloadReliability),
        workloadAdjustedZ: round(adjustedZ), comparisonCount: values.length, weight: Number(rawWeight) };
      weightedSum += adjustedZ * Number(rawWeight);
      totalWeight += Number(rawWeight);

      const observedTrend = skillTrend?.status === 'observed-skill-trend' ? skillTrend.components?.[key] : null;
      if (observedTrend && scale) {
        const normalizedTrend = clamp(Number(observedTrend.exposureAdjustedMedianChange) / scale, -1, 1);
        trendWeightedSum += normalizedTrend * Number(rawWeight);
        trendTotalWeight += Number(rawWeight);
        skills[key].longitudinalTrend = { status: 'compared', normalizedAnnualChange: round(normalizedTrend),
          exposureAdjustedMedianChange: observedTrend.exposureAdjustedMedianChange,
          transitionCount: skillTrend.transitionCount, exposureReliability: observedTrend.exposureReliability };
      } else {
        skills[key].longitudinalTrend = { status: 'unavailable', reason: skillTrend?.reason
          || (scale ? 'No accepted-package observed transition trend for this component.' : 'A same-role comparison scale is unavailable.') };
      }
    }
    const baseFitIndex = positionEligible && totalWeight > 0 ? weightedSum / totalWeight : null;
    const rawTrendIndex = trendTotalWeight ? trendWeightedSum / trendTotalWeight : null;
    const trendReliability = skillTrend?.status === 'observed-skill-trend'
      ? Math.min(1, skillTrend.transitionCount / 3)
        * median(Object.values(skillTrend.components).map(item => item.exposureReliability))
      : 0;
    const growthWeight = finite(need.longitudinalTrendWeight)
      ? clamp(Number(need.longitudinalTrendWeight), 0, 0.25) : DEFAULT_LONGITUDINAL_TREND_WEIGHT;
    const longitudinalAdjustment = rawTrendIndex === null ? 0
      : clamp(rawTrendIndex * trendReliability * growthWeight, -growthWeight, growthWeight);
    const roleWorkloadShrinkage = workloadReliability === null ? { status: 'unavailable', reason: 'Neither expected workload nor comparable same-role workload was supplied.' }
      : { status: 'applied', rule: 'role-fit deviation from same-role median multiplied by the square root of the lower available games/minutes exposure ratio',
        reliability: round(workloadReliability), observedGames: games, expectedGames: gameExposureReference,
        observedMinutes: minutes, expectedMinutes: minuteExposureReference,
        referenceKind: (finite(expectedGames) || finite(expectedMinutes)) ? 'caller-supplied-and-peer-fallback' : 'same-role-cohort-median' };
    roles.push({ role, needWeight: Number(need.weight), positionEligible,
      fitIndex: positionEligible && totalWeight > 0 ? round(baseFitIndex + longitudinalAdjustment) : null,
      baseFitIndex: positionEligible && totalWeight > 0 ? round(baseFitIndex) : null,
      longitudinalTrend: { status: rawTrendIndex === null ? 'unavailable' : 'applied',
        source: skillTrend?.status === 'observed-skill-trend' ? skillTrend.source : null,
        trendIndex: rawTrendIndex === null ? null : round(rawTrendIndex),
        reliability: round(trendReliability), weight: growthWeight,
        adjustment: round(longitudinalAdjustment), calibratedForecast: false },
      skillCoverage: totalWeight ? round(Object.values(skills).filter(item => ['compared', 'no-cohort-variation'].includes(item.status)).reduce((sum, item) => sum + item.weight, 0) / totalWeight) : 0,
      skills, comparisonCount: rolePool.length, workloadShrinkage: roleWorkloadShrinkage });
  }
  const scored = roles.filter(role => role.positionEligible && finite(role.fitIndex));
  const weight = scored.reduce((sum, role) => sum + role.needWeight, 0);
  return {
    status: scored.length ? 'scored' : 'unavailable',
    indexLabel: 'team-need-relative-fit-not-player-grade',
    needMatchIndex: weight ? round(scored.reduce((sum, role) => sum + role.fitIndex * role.needWeight, 0) / weight) : null,
    baseNeedMatchIndex: weight ? round(scored.reduce((sum, role) => sum + role.baseFitIndex * role.needWeight, 0) / weight) : null,
    workloadShrinkage: roles.map(({ role, workloadShrinkage }) => ({ role, ...workloadShrinkage })),
    roles,
  };
}

/**
 * Derive roster deficits against explicit user- or model-supplied role targets.
 * Multi-position players are fractionally credited across their listed roles;
 * no arbitrary position quotas are introduced here.
 */
export function deriveRosterRoleNeeds(roster, roleTargets, skillWeightsByRole = {}) {
  if (!Array.isArray(roster) || !roleTargets || typeof roleTargets !== 'object') {
    return { status: 'unavailable', reason: 'Roster rows and explicit role targets are required.', needs: [] };
  }
  const active = roster.filter(player => player?.status == null || player.status === 'active');
  const depth = Object.fromEntries([...POSITION_KEYS].map(role => [role, 0]));
  for (const player of active) {
    const roles = normalizedPositions(player);
    if (!roles.length) continue;
    for (const role of roles) depth[role] += 1 / roles.length;
  }
  const needs = Object.entries(roleTargets).flatMap(([roleValue, targetValue]) => {
    const role = text(roleValue).toUpperCase();
    const target = Number(targetValue);
    if (!POSITION_KEYS.has(role) || !Number.isFinite(target) || target < 0) return [];
    const deficit = Math.max(0, target - depth[role]);
    return deficit > 0 ? [{ role, weight: round(deficit), targetDepth: target, currentDepth: round(depth[role]),
      skillWeights: skillWeightsByRole[role] || {} }] : [];
  });
  return { status: 'available', basis: 'explicit-roster-role-targets', roleDepth: Object.fromEntries(Object.entries(depth).map(([key, value]) => [key, round(value)])), needs };
}

/**
 * Check only the CBA constraints that can be evaluated from an explicit offer,
 * player rights receipt, and accepted season-specific cap sheet. This is not a
 * substitute for the league's complete Team Salary/apron calculation.
 */
export function evaluateContractOfferConstraints({ offer, capLedger, playerRights = null,
  evaluationSeasonStartYear } = {}) {
  if (!offer || typeof offer !== 'object' || Array.isArray(offer)) {
    return { status: 'indeterminate', cbaVersion: 'nba-nbpa-cba-2023',
      reason: 'A user-supplied offer is required before checking any contract terms.' };
  }
  const mechanism = text(offer?.mechanism).toLowerCase();
  const maxYears = CBA_MAX_YEARS[mechanism];
  const salaries = Array.isArray(offer?.salaryBySeason) ? offer.salaryBySeason.map(Number) : [];
  const years = Number.isInteger(Number(offer?.years)) ? Number(offer.years) : salaries.length;
  const issues = [];
  const indeterminate = [];
  if (Number(evaluationSeasonStartYear) < 2023 || !Number.isInteger(Number(evaluationSeasonStartYear))) {
    return { status: 'indeterminate', cbaVersion: 'nba-nbpa-cba-2023', reason: 'The current 2023 CBA rule set only applies from Salary Cap Year 2023-24.' };
  }
  if (maxYears === undefined) indeterminate.push('Unknown signing mechanism; CBA term limit cannot be evaluated.');
  if (maxYears !== undefined && (!Number.isInteger(years) || years < 1 || years > maxYears)) {
    issues.push(`Contract term must be between one and ${maxYears} years for the supplied mechanism.`);
  }
  if (!salaries.length || salaries.length !== years || salaries.some(value => !Number.isFinite(value) || value <= 0)) {
    indeterminate.push('A complete positive salary-by-season schedule is required to check term and annual changes.');
  } else if (salaries.length > 1) {
    // Bird/Early Bird sign-and-trades are capped at the regular 5% rate.
    const increaseRate = BIRD_MECHANISMS.has(mechanism) && offer?.signAndTrade !== true ? 0.08 : 0.05;
    for (let index = 1; index < salaries.length; index += 1) {
      const change = salaries[index] - salaries[index - 1];
      if (change > salaries[0] * increaseRate + 0.01) {
        issues.push(`Year ${index + 1} increase exceeds ${Math.round(increaseRate * 100)}% of first-year salary.`);
      }
      if (change < -salaries[0] * increaseRate - 0.01) {
        issues.push(`Year ${index + 1} decrease exceeds ${Math.round(increaseRate * 100)}% of first-year salary.`);
      }
    }
  }
  if (BIRD_MECHANISMS.has(mechanism)) {
    if (playerRights?.accepted !== true || !text(playerRights.sourceRef)) {
      indeterminate.push('Bird or Early Bird eligibility needs an accepted player-rights record.');
    } else if (!text(capLedger?.teamId)) {
      indeterminate.push('Signing-team identity is required to check Bird or Early Bird rights.');
    } else if (text(playerRights.teamId) !== text(capLedger?.teamId)) {
      issues.push('Bird or Early Bird rights must belong to the signing team.');
    } else {
      const minimumSeasons = mechanism === 'bird' ? 3 : 2;
      if (!Number.isInteger(Number(playerRights.consecutiveQualifyingSeasons))
        || Number(playerRights.consecutiveQualifyingSeasons) < minimumSeasons) {
        issues.push(`${mechanism === 'bird' ? 'Bird' : 'Early Bird'} eligibility needs at least ${minimumSeasons} qualifying consecutive seasons.`);
      }
    }
  }
  if (mechanism === 'early-bird' && years < 2) issues.push('Early Bird contracts must be at least two seasons.');

  const firstYearSalary = salaries[0] ?? Number(offer?.firstYearSalary);
  const capSheetAccepted = capLedger?.accepted === true && !!text(capLedger.sourceRef)
    && Number(capLedger.seasonStartYear) === Number(evaluationSeasonStartYear)
    && Number.isInteger(Number(capLedger.seasonStartYear));
  if (!capSheetAccepted) {
    indeterminate.push('An accepted cap sheet for the evaluation Salary Cap Year is required for room/exception checks.');
  } else {
    const entry = mechanism === 'cap-room' ? {
      eligible: capLedger.roomStatus === 'available', remainingFirstYearSalary: capLedger.availableRoom,
    } : capLedger.mechanisms?.[mechanism];
    if (!entry || entry.eligible !== true || !finite(entry.remainingFirstYearSalary)) {
      indeterminate.push(`The accepted cap sheet does not establish available ${mechanism || 'mechanism'} room and eligibility.`);
    } else if (finite(firstYearSalary) && Number(firstYearSalary) > Number(entry.remainingFirstYearSalary)) {
      issues.push('First-year salary exceeds the explicitly supplied remaining room or exception amount.');
    }
  }

  const status = issues.length ? 'fails-supplied-constraints' : indeterminate.length ? 'indeterminate' : 'passes-checked-constraints';
  return { status, cbaVersion: 'nba-nbpa-cba-2023', mechanism: mechanism || null,
    seasonStartYear: Number(evaluationSeasonStartYear), years: Number.isInteger(years) ? years : null,
    firstYearSalary: finite(firstYearSalary) ? Number(firstYearSalary) : null,
    maxYears: maxYears ?? null, checkedRules: ['mechanism-specific-maximum-term', 'annual-salary-change-limit',
      ...(BIRD_MECHANISMS.has(mechanism) ? ['team-and-service-based-bird-rights-gate'] : []),
      'explicit-cap-room-or-exception-amount'],
    issues, indeterminate,
    notEvaluatedRules: ['maximum-player-salary-and-qualifying-offer-amounts',
      'minimum-player-salary-by-service-year', 'restricted-free-agent-offer-sheet-and-matching-rights',
      'salary-cap-holds-and-renounced-rights', 'team-salary-tax-and-apron-aggregation',
      'bonuses-options-incentives-and-guarantees', 'timing-and-transaction-sequence'],
    completeTeamSalaryAndApronReview: 'not-evaluated' };
}

/**
 * Build an evidence decomposition for a candidate. Trajectory and potential
 * stay unavailable unless accepted evidence is supplied; the output is not an
 * overall player grade.
 */
export function assessFreeAgencyCandidate({ candidate, evidenceSeasonStartYear, evaluationSeasonStartYear,
  packagePin, expectedGames = null, expectedMinutes = null, teamNeeds = [], comparisonPool = [], offer = null, capLedger = null } = {}) {
  const playerRef = text(candidate?.playerRef);
  if (!playerRef) fail('Free-agency candidate needs a stable player reference.');
  const packageSourceRef = sourcePackage(packagePin, evidenceSeasonStartYear);
  const skillRow = sourceRow(candidate, 'skillComponent', playerRef, evidenceSeasonStartYear);
  const playerSeason = sourceRow(candidate, 'playerSeason', playerRef, evidenceSeasonStartYear);
  const performance = observedPerformance(playerSeason, skillRow);
  const games = finite(skillRow?.games) ? Number(skillRow.games) : null;
  const minutes = finite(skillRow?.minutes) ? Number(skillRow.minutes) : null;
  const skillTrend = observedSkillTrend(candidate, packageSourceRef, evidenceSeasonStartYear, expectedGames);
  const fit = fitByRole(candidate, skillRow, teamNeeds, comparisonPool, evidenceSeasonStartYear,
    expectedGames, expectedMinutes, skillTrend);
  const trajectory = trendScenario(candidate, performance.skillComponents, evidenceSeasonStartYear);
  const availabilityEvidence = availability(candidate, evaluationSeasonStartYear);
  return {
    playerRef,
    displayName: text(candidate?.displayName || skillRow?.displayName || playerSeason?.displayName) || 'Unnamed player',
    positions: normalizedPositions(candidate),
    evidence: { packageRef: packageSourceRef, seasonStartYear: Number(evidenceSeasonStartYear), phase: 'regular',
      skillComponentCoverage: skillRow?.coverage || 'unavailable', skillEvidenceKind: skillRow?.evidenceKind || 'unavailable',
      teamCode: text(candidate?.teamCode || skillRow?.teamCode || playerSeason?.teamCode) || null,
      playerSeasonObserved: playerSeason?.observed === true },
    playerValue: {
      observedProductionAndImpact: performance,
      observedSkillTrend: skillTrend,
      ageExperienceTrajectory: trajectory,
      rosterRoleFit: fit,
      uncertainty: {
        observedGames: games, observedMinutes: minutes,
        expectedGames: finite(expectedGames) && Number(expectedGames) > 0 ? Number(expectedGames) : null,
        skillComponentCoverage: round(Object.keys(performance.skillComponents).length / FREE_AGENCY_SKILL_KEYS.length),
        metricCoverage: Object.keys(performance.observedMetrics).length,
        impactReliability: performance.impact?.reliability ?? null,
        trajectoryTransitions: trajectory.transitionCount ?? 0,
        calibration: trajectory.calibration || 'not-available',
      },
      potential: acceptedPotential(candidate),
      marketValueEstimate: marketValue(candidate),
      signedSalary: { status: 'unavailable', reason: 'A modeled market-value estimate is not a contract or signed salary.' },
    },
    freeAgentAvailability: availabilityEvidence,
    offerBudget: budgetStatus(offer, capLedger, evaluationSeasonStartYear),
    contractRuleCheck: evaluateContractOfferConstraints({ offer, capLedger,
      playerRights: candidate?.playerRights || null, evaluationSeasonStartYear }),
    action: 'recommendation-only; user decision required',
  };
}

/** Return decomposed, deterministic fit recommendations; never signs a player. */
export function evaluateFreeAgencyRosterFit({ packagePin, evidenceSeasonStartYear, evaluationSeasonStartYear,
  expectedGames = null, expectedMinutes = null, team, candidates, comparisonPool = candidates, roleNeeds = [], offer = null,
  capLedger = null, seed } = {}) {
  sourcePackage(packagePin, evidenceSeasonStartYear);
  if (!team || !text(team.teamId)) fail('Free-agency evaluation needs a destination team reference.');
  if (!Array.isArray(candidates)) fail('Free-agency evaluation needs an explicit candidate list.');
  if (!Array.isArray(comparisonPool)) fail('Free-agency evaluation needs a comparison pool array.');
  if (!Array.isArray(roleNeeds)) fail('Free-agency role needs must be an explicit array.');
  if (!text(seed)) fail('Free-agency recommendations need a deterministic seed.');
  requireUniquePlayerRefs(candidates, 'Free-agency candidate');
  requireUniquePlayerRefs(comparisonPool, 'Free-agency comparison-pool');
  const normalizedCandidates = candidates.map(candidate => assessFreeAgencyCandidate({ candidate, evidenceSeasonStartYear,
    evaluationSeasonStartYear, packagePin, expectedGames, expectedMinutes, teamNeeds: roleNeeds, comparisonPool, offer, capLedger }));
  const recommendationTier = item => {
    const available = item.freeAgentAvailability.status === 'available';
    const fit = item.playerValue.rosterRoleFit.status === 'scored';
    const kind = item.freeAgentAvailability.freeAgentType;
    if (available && fit && kind === 'unrestricted') return 0;
    if (available && fit && kind === 'restricted') return 1;
    if (available && kind === 'unrestricted') return 2;
    if (available && kind === 'restricted') return 3;
    return 4;
  };
  normalizedCandidates.sort((a, b) => {
    const aTier = recommendationTier(a);
    const bTier = recommendationTier(b);
    if (aTier !== bTier) return aTier - bTier;
    const aScore = Number.isFinite(a.playerValue.rosterRoleFit.needMatchIndex) ? a.playerValue.rosterRoleFit.needMatchIndex : -Infinity;
    const bScore = Number.isFinite(b.playerValue.rosterRoleFit.needMatchIndex) ? b.playerValue.rosterRoleFit.needMatchIndex : -Infinity;
    return bScore - aScore || tieHash(seed, a.playerRef).localeCompare(tieHash(seed, b.playerRef)) || a.playerRef.localeCompare(b.playerRef);
  });
  return {
    format: 'swishiq-free-agency-roster-fit-result-v1',
    modelVersion: FREE_AGENCY_ROSTER_FIT_VERSION,
    evaluation: { teamId: text(team.teamId), evidenceSeasonStartYear: Number(evidenceSeasonStartYear),
      evaluationSeasonStartYear: Number(evaluationSeasonStartYear), seed: text(seed), method: 'evidence-weighted-roster-role-fit',
      autoSigning: false, contractLegality: 'not-evaluated' },
    recommendations: normalizedCandidates.map((item, index) => ({ rank: index + 1,
      recommendationTier: recommendationTier(item), ...item,
      actionable: item.freeAgentAvailability.status === 'available'
        && item.freeAgentAvailability.freeAgentType === 'unrestricted'
        && item.playerValue.rosterRoleFit.status === 'scored' })),
    disclosures: [
      'Skill values and impact are observed package evidence; derived shooting estimates are separated from observed metrics.',
      'Role fit is relative to explicit team needs and the supplied same-season comparison pool; it is not a universal player rating.',
      'Workload shrinks role-fit deviations toward the peer median using explicit expected games/minutes when supplied, otherwise same-role peer medians; this heuristic is not calibrated.',
      'Age/experience trend scenarios use the player’s own adjacent observed transitions and validated state; they are uncalibrated and are not predictive intervals.',
      'Free-agent availability and restricted/unrestricted classification need an accepted evaluation-season source; restricted free agents require a separate offer-sheet and matching-rights review.',
      'No market value, contract, salary cap room, CBA exception, or signing is inferred from player statistics.',
    ],
  };
}
