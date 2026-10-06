// Season-keyed donor recipes for Composite Forge. This module deliberately
// keeps season evidence separate from the pooled-window player blueprint.

export const SEASON_FORGE_BLOCKS = Object.freeze([
  { key: 'shooting', label: 'Shooting choices and accuracy', components: [
    ['fieldGoalAccuracy', 'Field-goal accuracy', 'percent'],
    ['threePointAccuracy', 'Three-point accuracy', 'percent'],
    ['threePointFrequency', 'Three-point frequency', 'percent'],
    ['freeThrowAccuracy', 'Free-throw accuracy', 'percent'],
  ] },
  { key: 'scoring', label: 'Scoring production', components: [['points', 'Points per game', 'perGame']] },
  { key: 'creation', label: 'Creation and ball security', components: [
    ['assists', 'Assists per game', 'perGame'], ['turnovers', 'Turnovers per game', 'perGame'],
  ] },
  { key: 'rebounding', label: 'Rebounding production', components: [['rebounds', 'Rebounds per game', 'perGame']] },
  { key: 'disruption', label: 'Recorded disruption', components: [
    ['steals', 'Steals per game', 'perGame'], ['blocks', 'Blocks per game', 'perGame'],
  ] },
].map(block => Object.freeze({ ...block, components: Object.freeze(block.components.map(([key, label, unit]) => Object.freeze({ key, label, unit }))) })));

const finite = value => typeof value === 'number' && Number.isFinite(value);
const integer = value => Number.isSafeInteger(value);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = value => typeof value === 'string' && value.trim() && value.length <= 320 ? value.trim() : null;
const round = value => finite(value) ? Math.round(value * 10000) / 10000 : null;
const profileKey = profile => text(profile?.key) || [profile?.playerId, profile?.seasonStartYear, profile?.phase, profile?.team, profile?.scope].join('|');

const FALLBACKS = Object.freeze({
  fieldGoalAccuracy: profile => profile?.shooting?.fieldGoalPercentage,
  threePointAccuracy: profile => profile?.shooting?.threePointPercentage,
  threePointFrequency: profile => profile?.shooting?.threePointAttemptShare,
  freeThrowAccuracy: profile => profile?.shooting?.freeThrowPercentage,
  points: profile => profile?.perGame?.points,
  assists: profile => profile?.perGame?.assists,
  turnovers: profile => profile?.perGame?.turnovers,
  rebounds: profile => profile?.perGame?.rebounds,
  steals: profile => profile?.perGame?.steals,
  blocks: profile => profile?.perGame?.blocks,
});
const DESCRIPTIVE_ONLY_INTERPRETATION = Object.freeze({
  temporalRole: 'descriptive',
  predictiveUseStatus: 'not-validated-for-predictive-use',
  outcomeValidationStatus: 'not-established',
  causalImpactSupported: false,
  calibratedForecastSupported: false,
});
const BLOCKED_SOURCE_STATUSES = new Set(['held', 'unavailable', 'invalid', 'rejected', 'not-observed']);
const USABLE_SOURCE_STATUSES = new Set(['available', 'observed', 'limited_sample', 'partial', 'complete_with_caveats']);
const COMPONENT_SPEC_BY_KEY = new Map(SEASON_FORGE_BLOCKS.flatMap(block => block.components.map(spec => [spec.key, spec])));
const SUPPORT_WEIGHT_UNITS = Object.freeze({
  fieldGoalAccuracy: 'field-goal-attempts',
  threePointAccuracy: 'three-point-attempts',
  threePointFrequency: 'field-goal-attempts',
  freeThrowAccuracy: 'free-throw-attempts',
});

function validProfile(profile) {
  return object(profile) && integer(profile.seasonStartYear) && profile.seasonStartYear >= 1947
    && text(profile.phase) && ['team', 'all-teams'].includes(profile.scope)
    && text(profile.player || profile.playerName) && text(profile.team)
    && integer(profile.games) && profile.games >= 0;
}

export function validateSeasonDonorProfiles(profiles) {
  if (!Array.isArray(profiles) || profiles.length < 1 || profiles.length > 4000 || profiles.some(profile => !validProfile(profile))) {
    throw new Error('Load a bounded season donor catalog before building this recipe.');
  }
  const keys = profiles.map(profileKey);
  if (keys.some(key => !text(key)) || new Set(keys).size !== keys.length) throw new Error('Season donor catalog contains duplicate or invalid profile keys.');
  return profiles;
}

function normalizeSeasonShrinkageConfig(shrinkage) {
  if (shrinkage === null || shrinkage === undefined) return null;
  if (!object(shrinkage) || !object(shrinkage.priors)) throw new Error('Season composite shrinkage requires an explicit priors map.');
  if (!Object.keys(shrinkage.priors).length) throw new Error('Season composite shrinkage requires at least one explicit component prior.');
  const priors = {};
  Object.entries(shrinkage.priors).forEach(([key, prior]) => {
    const spec = COMPONENT_SPEC_BY_KEY.get(key);
    if (!spec || !object(prior)) throw new Error(`Season composite shrinkage has an unsupported component prior: ${key}.`);
    const weightUnit = SUPPORT_WEIGHT_UNITS[key] || 'games';
    const sourceStatus = text(prior.sourceStatus)?.toLowerCase() || '';
    const modeledPriorEvidence = ['model', 'forecast', 'project', 'predict', 'synthetic', 'imput', 'simulat']
      .some(marker => text(prior.evidenceKind)?.toLowerCase().includes(marker));
    if (!finite(prior.value) || prior.unit !== spec.unit
      || !finite(prior.priorWeight) || prior.priorWeight < 0 || prior.priorWeight > 1_000_000_000
      || prior.priorWeightUnit !== weightUnit
      || !text(prior.source)
      || !['observed', 'limited_sample'].includes(sourceStatus)
      || modeledPriorEvidence) {
      throw new Error(`Season composite prior for ${key} needs a finite same-unit value, non-negative denominator-equivalent priorWeight, exact priorWeightUnit (${weightUnit}), source, observed/limited sourceStatus, and non-modeled evidenceKind.`);
    }
    priors[key] = Object.freeze({
      value: round(prior.value),
      unit: prior.unit,
      priorWeight: prior.priorWeight,
      priorWeightUnit: weightUnit,
      source: text(prior.source),
      sourceStatus,
      evidenceKind: text(prior.evidenceKind),
      retrievedAt: text(prior.retrievedAt),
    });
  });
  return Object.freeze({ version: 1, method: 'observed-support-weighted-prior-shrinkage-v1', priors: Object.freeze(priors) });
}

export function seasonComponentEvidence(profile, key, unit) {
  const source = object(profile?.components?.[key]) ? profile.components[key] : null;
  const fallbackUsed = source?.value === null || source?.value === undefined;
  const raw = fallbackUsed ? FALLBACKS[key]?.(profile) : source.value;
  const reportedValue = finite(raw) ? round(raw) : null;
  const sourceStatus = text(source?.status)?.toLowerCase() || null;
  const sourceEvidenceKind = text(source?.evidenceKind)?.toLowerCase() || null;
  const explicitlyModeled = ['model', 'forecast', 'project', 'predict', 'synthetic', 'imput', 'simulat']
    .some(marker => sourceEvidenceKind?.includes(marker))
    || sourceStatus === 'modeled' || sourceStatus === 'projected'
    || ['forecast', 'prediction', 'projection'].includes(text(source?.temporalUse?.role)?.toLowerCase());
  const explicitStatusRejected = sourceStatus !== null
    && (!USABLE_SOURCE_STATUSES.has(sourceStatus) || BLOCKED_SOURCE_STATUSES.has(sourceStatus));
  const knownGames = integer(source?.knownGames) ? source.knownGames : integer(profile?.games) ? profile.games : null;
  const denominator = integer(source?.denominator) && source.denominator >= 0 ? source.denominator
    : unit === 'perGame' ? knownGames : null;
  const numerator = integer(source?.numerator) && source.numerator >= 0 ? source.numerator
    : integer(source?.total) && source.total >= 0 ? source.total : null;
  const metricDenominatorRequired = unit !== 'perGame';
  const denominatorInvalid = metricDenominatorRequired && denominator !== null && denominator <= 0;
  const denominatorMissing = metricDenominatorRequired && denominator === null;
  const blocked = reportedValue === null || knownGames === null || knownGames < 1 || explicitStatusRejected || explicitlyModeled || denominatorInvalid;
  const value = blocked ? null : reportedValue;
  const status = blocked ? 'unavailable'
    : ['limited_sample', 'partial', 'complete_with_caveats'].includes(sourceStatus) || knownGames < 5 || denominatorMissing ? 'limited_sample' : 'observed';
  const native = object(profile?.nativeProvenance) ? profile.nativeProvenance : {};
  const temporalUse = object(source?.temporalUse) ? source.temporalUse
    : object(profile?.temporalUse) ? profile.temporalUse : {};
  const sourcePackage = Object.freeze({
    packageId: text(native.packageId),
    packageVersion: text(native.packageVersion),
    packageManifestSha256: text(native.packageManifestSha256),
    sourceLockSha256: text(native.sourceLockSha256),
    artifactId: text(native.playerSeasonsArtifactId),
    artifactSha256: text(native.playerSeasonsArtifactSha256),
  });
  const reason = explicitlyModeled ? 'A modeled or projected input is not treated as an observed season donor.'
    : explicitStatusRejected ? `The source status ${sourceStatus} is not eligible as an observed donor.`
      : denominatorInvalid ? 'The published rate has a zero denominator; its value is withheld.'
        : denominatorMissing && !blocked ? 'The source denominator is missing; the value is retained as limited-support evidence.'
      : status === 'observed' ? 'Observed season component with its published season exposure.'
        : status === 'limited_sample' ? 'Observed, but the source marks limited exposure or fewer than five games.'
          : 'This component is missing, has no positive exposure, or failed its source field gate.';
  return Object.freeze({ key, unit, value, reportedValue, numerator, denominator, knownGames, status, reason,
    evidence: Object.freeze({
      kind: 'descriptive-season-component',
      sourceStatus,
      evidenceKind: sourceEvidenceKind || (source ? null : 'season-profile-field-fallback'),
      sourceMetric: text(source?.sourceMetric) || (fallbackUsed ? key : null),
      sourceReason: text(source?.reason),
      coverage: text(source?.coverage),
      method: text(source?.method),
      temporalRole: text(temporalUse.role) || 'descriptive',
      sourceEligibleForPredictiveFeatures: temporalUse.eligibleForPredictiveFeatures === true,
      fallbackUsed,
      denominatorStatus: denominatorInvalid ? 'zero-denominator'
        : denominatorMissing ? 'missing-denominator' : denominator === null ? 'not-applicable' : 'available',
      sourcePackage,
      ...DESCRIPTIVE_ONLY_INTERPRETATION,
    }),
  });
}

function normalizeSeasonComparisonPairs(componentPairs) {
  const requested = componentPairs === undefined
    ? SEASON_FORGE_BLOCKS.flatMap(block => block.components.map(component => component.key))
    : componentPairs;
  if (!Array.isArray(requested) || requested.length < 1 || requested.length > 32) {
    throw new Error('Season component comparison requires between one and thirty-two component keys.');
  }
  const seen = new Set();
  return requested.map((entry, index) => {
    const descriptor = typeof entry === 'string' ? { key: entry } : entry;
    if (!object(descriptor)) throw new Error(`Season component comparison entry ${index + 1} must be a key or key descriptor.`);
    const key = text(descriptor.key) || text(descriptor.leftKey) || text(descriptor.rightKey);
    const leftKey = text(descriptor.leftKey) || key;
    const rightKey = text(descriptor.rightKey) || key;
    if (!key || !leftKey || !rightKey || seen.has(key)) {
      throw new Error(`Season component comparison entry ${index + 1} needs a unique output key and explicit component keys.`);
    }
    seen.add(key);
    return Object.freeze({ key, leftKey, rightKey, requestedUnit: text(descriptor.unit) || null });
  });
}

function seasonComparisonSide(profile, key) {
  const spec = COMPONENT_SPEC_BY_KEY.get(key) || null;
  const source = object(profile.components?.[key]) ? profile.components[key] : null;
  const declaredUnit = text(source?.unit);
  const hasDeclaredUnit = source?.unit !== null && source?.unit !== undefined;
  const sourceUnit = declaredUnit || spec?.unit || null;
  const invalidDeclaredUnit = hasDeclaredUnit && !declaredUnit;
  if (!spec) {
    return Object.freeze({
      componentKey: key,
      unit: sourceUnit,
      invalidDeclaredUnit,
      status: 'unsupported-component-key',
      rawValue: finite(source?.value) ? round(source.value) : null,
      admissibleObservedValue: null,
      knownGames: integer(source?.knownGames) ? source.knownGames : profile.games,
      numerator: integer(source?.numerator) && source.numerator >= 0 ? source.numerator : null,
      denominator: integer(source?.denominator) && source.denominator >= 0 ? source.denominator : null,
      denominatorUnit: SUPPORT_WEIGHT_UNITS[key] || 'games',
      reason: 'The component key is not defined in the season-composite component contract.',
      provenance: Object.freeze({ sourceStatus: text(source?.status)?.toLowerCase() || null,
        evidenceKind: text(source?.evidenceKind)?.toLowerCase() || null, sourceMetric: text(source?.sourceMetric),
        sourcePackage: profile.nativeProvenance || null }),
    });
  }
  const evidence = seasonComponentEvidence(profile, key, spec.unit);
  return Object.freeze({
    componentKey: key,
    unit: sourceUnit,
    invalidDeclaredUnit,
    status: evidence.status,
    rawValue: evidence.reportedValue,
    admissibleObservedValue: evidence.status === 'observed' ? evidence.value : null,
    knownGames: evidence.knownGames,
    numerator: evidence.numerator,
    denominator: evidence.denominator,
    denominatorUnit: SUPPORT_WEIGHT_UNITS[key] || 'games',
    reason: evidence.reason,
    provenance: evidence.evidence,
  });
}

function seasonComparisonSideReason(side, label, profile) {
  const source = object(profile.components?.[side.componentKey]) ? profile.components[side.componentKey] : null;
  const status = text(source?.status)?.toLowerCase() || '';
  const evidenceKind = text(source?.evidenceKind)?.toLowerCase() || '';
  const temporalRole = text(source?.temporalUse?.role || profile.temporalUse?.role)?.toLowerCase() || '';
  if (status.includes('held') || source?.held === true || source?.isHeld === true) return `${label}-held-evidence`;
  if (['model', 'forecast', 'project', 'predict', 'synthetic', 'imput', 'simulat'].some(marker =>
    [status, evidenceKind, temporalRole].some(value => value.includes(marker)))) return `${label}-modeled-or-projected-evidence`;
  if (side.status === 'unsupported-component-key') return `${label}-unsupported-component-key`;
  if (['unavailable', 'invalid', 'rejected', 'not-observed'].includes(status)) return `${label}-unavailable-evidence`;
  if (side.rawValue === null || side.rawValue === undefined) return `${label}-missing-component-value`;
  if (side.invalidDeclaredUnit) return `${label}-invalid-component-unit`;
  if (side.status === 'unavailable') return `${label}-unavailable-evidence`;
  if (side.status !== 'observed') return `${label}-not-admissible-observed-evidence`;
  return null;
}

function seasonProfilePairReason(leftProfile, rightProfile) {
  const normalizeName = profile => text(profile.player || profile.playerName)?.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase() || null;
  if (!normalizeName(leftProfile) || normalizeName(leftProfile) !== normalizeName(rightProfile)) return 'player-identity-mismatch';
  if (leftProfile.phase !== rightProfile.phase) return 'season-phase-mismatch';
  if (leftProfile.scope !== rightProfile.scope) return 'profile-scope-mismatch';
  if (leftProfile.seasonStartYear === rightProfile.seasonStartYear) return 'season-pair-not-distinct';
  return null;
}

/**
 * Compare exactly two caller-supplied season profiles. Deltas are exposed only
 * for identical component keys/units with observed evidence on both sides.
 * This helper never looks up, substitutes, pools, calibrates, or forecasts data.
 */
export function compareSeasonComponents(leftProfile, rightProfile, componentPairs = undefined) {
  validateSeasonDonorProfiles([leftProfile]);
  validateSeasonDonorProfiles([rightProfile]);
  const pairs = normalizeSeasonComparisonPairs(componentPairs);
  const pairReason = seasonProfilePairReason(leftProfile, rightProfile);
  const components = pairs.map(pair => {
    const left = seasonComparisonSide(leftProfile, pair.leftKey);
    const right = seasonComparisonSide(rightProfile, pair.rightKey);
    const leftSpec = COMPONENT_SPEC_BY_KEY.get(pair.leftKey) || null;
    const rightSpec = COMPONENT_SPEC_BY_KEY.get(pair.rightKey) || null;
    const componentKeyCompatible = Boolean(leftSpec && rightSpec && pair.leftKey === pair.rightKey);
    const expectedUnit = pair.requestedUnit || (componentKeyCompatible ? leftSpec.unit : null);
    const unitEvidenceCompatible = Boolean(leftSpec && rightSpec && leftSpec.unit === rightSpec.unit
      && left.unit === leftSpec.unit && right.unit === rightSpec.unit
      && (!pair.requestedUnit || pair.requestedUnit === leftSpec.unit)
      && !left.invalidDeclaredUnit && !right.invalidDeclaredUnit);
    const unitCompatible = componentKeyCompatible && unitEvidenceCompatible;
    const reasons = [];
    if (pairReason) reasons.push(pairReason);
    if (!componentKeyCompatible) reasons.push(pair.leftKey === pair.rightKey ? 'unsupported-component-key' : 'component-key-mismatch');
    if (leftSpec && rightSpec && !unitEvidenceCompatible) reasons.push('component-unit-mismatch');
    const leftReason = seasonComparisonSideReason(left, 'left', leftProfile);
    const rightReason = seasonComparisonSideReason(right, 'right', rightProfile);
    if (leftReason) reasons.push(leftReason);
    if (rightReason) reasons.push(rightReason);
    const comparable = reasons.length === 0
      && finite(left.admissibleObservedValue) && finite(right.admissibleObservedValue);
    return Object.freeze({
      key: pair.key,
      leftComponentKey: pair.leftKey,
      rightComponentKey: pair.rightKey,
      requestedUnit: pair.requestedUnit,
      componentKeyCompatible,
      unitCompatible,
      status: comparable ? 'comparable-observed-season-pair' : 'non-comparable',
      reasons: Object.freeze(reasons),
      reason: reasons[0] || null,
      direction: 'right-minus-left',
      deltaUnit: comparable ? expectedUnit : null,
      rawDelta: comparable ? round(right.admissibleObservedValue - left.admissibleObservedValue) : null,
      left,
      right,
    });
  });
  return Object.freeze({
    status: components.every(component => component.status === 'comparable-observed-season-pair')
      ? 'complete-observed-season-comparison' : 'comparison-with-caveats',
    method: 'paired-season-observed-component-delta-v1',
    temporalRole: 'descriptive',
    calibrationStatus: 'not-run',
    predictiveUseStatus: 'not-validated-for-predictive-use',
    interpretation: Object.freeze({ ...DESCRIPTIVE_ONLY_INTERPRETATION }),
    sourceLookup: 'caller-supplied-profile-pair-only',
    pooledSubstitution: false,
    leftSeason: Object.freeze({ key: profileKey(leftProfile), player: leftProfile.player || leftProfile.playerName,
      seasonStartYear: leftProfile.seasonStartYear, phase: leftProfile.phase, scope: leftProfile.scope, team: leftProfile.team }),
    rightSeason: Object.freeze({ key: profileKey(rightProfile), player: rightProfile.player || rightProfile.playerName,
      seasonStartYear: rightProfile.seasonStartYear, phase: rightProfile.phase, scope: rightProfile.scope, team: rightProfile.team }),
    components: Object.freeze(components),
    note: 'Raw deltas are reported only for matching component keys and units with admissible observed evidence on both caller-supplied season rows. Held, missing, unavailable, limited, modeled, projected, mismatched, and unsupported evidence remains non-comparable. Results are descriptive and are not calibrated forecasts or causal estimates.',
  });
}

export function createSeasonForgeRecipe(profiles, donors = {}, options = {}) {
  validateSeasonDonorProfiles(profiles);
  if (options !== null && !object(options)) throw new Error('Season composite recipe options must be an object.');
  if (!object(donors) || Object.keys(donors).some(key => !SEASON_FORGE_BLOCKS.some(block => block.key === key))) throw new Error('Unknown season composite block.');
  const available = new Set(profiles.map(profileKey));
  const selected = Object.fromEntries(SEASON_FORGE_BLOCKS.map(block => {
    const key = donors[block.key] ?? '';
    if (key && !available.has(key)) throw new Error('Season recipe references a profile outside the loaded catalog.');
    return [block.key, key];
  }));
  const normalizedShrinkage = normalizeSeasonShrinkageConfig(object(options) ? options.shrinkage : null);
  return { version: normalizedShrinkage ? 2 : 1, scope: 'season-keyed-observed', donors: selected,
    ...(normalizedShrinkage ? { shrinkage: normalizedShrinkage } : {}) };
}

function applySupportAwarePriorShrinkage(evidence, componentKey, shrinkage) {
  const prior = shrinkage?.priors?.[componentKey] || null;
  const supportUnit = SUPPORT_WEIGHT_UNITS[componentKey] || 'games';
  const observedWeight = supportUnit === 'games' ? evidence.knownGames : evidence.denominator;
  const unchanged = evidence.value;
  const base = { ...evidence, rawValue: unchanged, adjustedValue: unchanged, valueKind: 'observed-source-value' };
  if (!prior) return { ...base, shrinkage: { status: 'not-configured', method: null,
    observedWeight: finite(observedWeight) && observedWeight >= 0 ? observedWeight : null,
    observedWeightUnit: supportUnit, coverage: null,
    reason: 'No explicit prior was supplied for this component.' } };
  const sharedReceipt = {
    method: shrinkage.method,
    observedWeight: finite(observedWeight) && observedWeight >= 0 ? observedWeight : null,
    observedWeightUnit: supportUnit,
    priorValue: prior.value,
    priorUnit: prior.unit,
    priorWeight: prior.priorWeight,
    priorWeightUnit: prior.priorWeightUnit,
    priorSource: prior.source,
    priorSourceStatus: prior.sourceStatus,
    priorEvidenceKind: prior.evidenceKind,
    priorRetrievedAt: prior.retrievedAt,
    totalWeight: null,
    observedShare: null,
    priorShare: null,
    coverage: null,
  };
  if (!finite(evidence.value)) {
    return { ...base, shrinkage: { ...sharedReceipt, status: 'not-applied', reason: 'The observed donor value is unavailable.' } };
  }
  if (!finite(observedWeight) || observedWeight <= 0) {
    return { ...base, shrinkage: { ...sharedReceipt, status: 'not-applied', reason: 'Observed denominator or games support is unavailable or zero.' } };
  }
  if (prior.priorWeight === 0) {
    return { ...base, shrinkage: { ...sharedReceipt, status: 'not-applied', reason: 'The configured priorWeight is zero.' } };
  }
  const totalWeight = observedWeight + prior.priorWeight;
  const observedShare = observedWeight / totalWeight;
  const priorShare = prior.priorWeight / totalWeight;
  const adjustedValue = round((evidence.value * observedWeight + prior.value * prior.priorWeight) / totalWeight);
  return {
    ...base,
    value: adjustedValue,
    adjustedValue,
    valueKind: 'support-weighted-prior-adjusted-descriptive-value',
    shrinkage: {
      ...sharedReceipt,
      status: 'applied',
      totalWeight,
      observedShare: round(observedShare),
      priorShare: round(priorShare),
      coverage: round(observedShare),
      coverageDefinition: 'observed donor weight divided by observed donor weight plus configured prior weight',
      formula: '(rawValue * observedWeight + priorValue * priorWeight) / (observedWeight + priorWeight)',
      reason: 'Descriptive value regularized by the explicitly supplied same-unit prior and denominator-equivalent support.',
    },
  };
}

function normalizeShrinkageSensitivityScenarios(sensitivity, selectedShrinkage) {
  if (sensitivity === null || sensitivity === undefined) return [];
  if (!object(sensitivity) || !Array.isArray(sensitivity.scenarios)
    || !sensitivity.scenarios.length || sensitivity.scenarios.length > 12) {
    throw new Error('Prior-weight sensitivity requires between one and twelve caller-supplied scenarios.');
  }
  if (!selectedShrinkage || !Object.keys(selectedShrinkage.priors || {}).length) {
    throw new Error('Prior-weight sensitivity requires observed-provenance priors in the selected recipe.');
  }
  const seenIds = new Set();
  return sensitivity.scenarios.map((scenario, index) => {
    const id = text(scenario?.id);
    const label = text(scenario?.label);
    if (!object(scenario) || !id || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/.test(id)
      || !label || seenIds.has(id) || !object(scenario.weights) || !Object.keys(scenario.weights).length) {
      throw new Error(`Prior-weight sensitivity scenario ${index + 1} needs a unique safe id, label, and non-empty weights map.`);
    }
    seenIds.add(id);
    const priors = { ...selectedShrinkage.priors };
    Object.entries(scenario.weights).forEach(([key, candidate]) => {
      const selectedPrior = selectedShrinkage.priors[key];
      if (!selectedPrior || !object(candidate)
        || !finite(candidate.priorWeight) || candidate.priorWeight < 0 || candidate.priorWeight > 1_000_000_000
        || candidate.priorWeightUnit !== selectedPrior.priorWeightUnit) {
        throw new Error(`Prior-weight sensitivity scenario ${id} requires a candidate priorWeight with the selected denominator unit for ${key}.`);
      }
      priors[key] = { ...selectedPrior, priorWeight: candidate.priorWeight };
    });
    return Object.freeze({
      id,
      label,
      shrinkage: normalizeSeasonShrinkageConfig({ priors }),
    });
  });
}

function sensitivityComponentReceipt(component) {
  const shrinkage = component.shrinkage || {};
  return Object.freeze({
    key: component.key,
    label: component.label,
    status: component.status,
    valueKind: component.valueKind,
    rawValue: component.rawValue,
    adjustedValue: component.adjustedValue,
    observedWeight: shrinkage.observedWeight ?? null,
    observedWeightUnit: shrinkage.observedWeightUnit || SUPPORT_WEIGHT_UNITS[component.key] || 'games',
    priorValue: shrinkage.priorValue ?? null,
    priorUnit: shrinkage.priorUnit || component.unit,
    priorWeight: shrinkage.priorWeight ?? null,
    priorWeightUnit: shrinkage.priorWeightUnit || null,
    priorSource: shrinkage.priorSource || null,
    priorSourceStatus: shrinkage.priorSourceStatus || null,
    priorEvidenceKind: shrinkage.priorEvidenceKind || null,
    priorRetrievedAt: shrinkage.priorRetrievedAt || null,
    coverage: shrinkage.coverage ?? null,
    coverageDefinition: shrinkage.coverageDefinition || null,
    adjustmentStatus: shrinkage.status || 'not-configured',
    reason: shrinkage.reason || component.reason,
    evidenceKind: component.evidence?.evidenceKind || null,
    sourceMetric: component.evidence?.sourceMetric || null,
    sourcePackage: component.evidence?.sourcePackage || null,
  });
}

function selectedSensitivityRow(blocks, shrinkage) {
  const priorWeights = Object.fromEntries(Object.entries(shrinkage?.priors || {}).map(([key, prior]) => [key, {
    priorWeight: prior.priorWeight,
    priorWeightUnit: prior.priorWeightUnit,
    priorSource: prior.source,
    priorSourceStatus: prior.sourceStatus,
    priorEvidenceKind: prior.evidenceKind,
    priorRetrievedAt: prior.retrievedAt,
  }]));
  return Object.freeze({
    id: 'selected',
    label: 'Selected recipe weights',
    selected: true,
    priorWeights: Object.freeze(priorWeights),
    blocks: Object.freeze(blocks.map(block => Object.freeze({
      key: block.key,
      label: block.label,
      donor: block.donor,
      components: Object.freeze(block.components.map(sensitivityComponentReceipt)),
    }))),
  });
}

function candidateSensitivityRow(profiles, recipe, scenario) {
  const byKey = new Map(profiles.map(profile => [profileKey(profile), profile]));
  const blocks = SEASON_FORGE_BLOCKS.map(block => {
    const donor = recipe.donors[block.key] ? byKey.get(recipe.donors[block.key]) : null;
    const components = block.components.map(spec => {
      const evidence = seasonComponentEvidence(donor, spec.key, spec.unit);
      const adjusted = applySupportAwarePriorShrinkage(evidence, spec.key, scenario.shrinkage);
      return sensitivityComponentReceipt({ ...adjusted, label: spec.label });
    });
    return Object.freeze({
      key: block.key,
      label: block.label,
      donor: donor ? Object.freeze({ key: profileKey(donor), player: donor.player || donor.playerName, season: donor.season,
        seasonStartYear: donor.seasonStartYear, phase: donor.phase, team: donor.team, scope: donor.scope }) : null,
      components: Object.freeze(components),
    });
  });
  const priorWeights = Object.fromEntries(Object.entries(scenario.shrinkage.priors).map(([key, prior]) => [key, {
    priorWeight: prior.priorWeight,
    priorWeightUnit: prior.priorWeightUnit,
    priorSource: prior.source,
    priorSourceStatus: prior.sourceStatus,
    priorEvidenceKind: prior.evidenceKind,
    priorRetrievedAt: prior.retrievedAt,
  }]));
  return Object.freeze({
    id: scenario.id,
    label: scenario.label,
    selected: false,
    priorWeights: Object.freeze(priorWeights),
    blocks: Object.freeze(blocks),
  });
}

function buildShrinkageSensitivityReceipt(profiles, recipe, selectedBlocks, requestedSensitivity) {
  if (requestedSensitivity === null || requestedSensitivity === undefined) return null;
  const scenarios = normalizeShrinkageSensitivityScenarios(requestedSensitivity, recipe.shrinkage);
  return Object.freeze({
    status: 'exploratory-descriptive-sensitivity',
    method: 'caller-supplied-prior-weight-scenarios-v1',
    calibrationStatus: 'not-run',
    outcomeBasedWeightTuning: false,
    weightsSelectedByModel: false,
    scenarioOrdering: 'caller-supplied-order-no-ranking',
    selected: selectedSensitivityRow(selectedBlocks, recipe.shrinkage),
    candidates: Object.freeze(scenarios.map(scenario => candidateSensitivityRow(profiles, recipe, scenario))),
    interpretation: Object.freeze({ ...DESCRIPTIVE_ONLY_INTERPRETATION }),
    note: 'Candidate prior weights are supplied by the caller and reported in input order. No best weight is selected, no outcomes are scored for tuning, and these descriptive differences are not calibration or predictive validation.',
  });
}

export function buildSeasonComposite(profiles, recipe, baselineKey = '', options = {}) {
  validateSeasonDonorProfiles(profiles);
  if (![1, 2].includes(recipe?.version) || recipe.scope !== 'season-keyed-observed') throw new Error('This season recipe has an unsupported version.');
  if (!object(options)) throw new Error('Season composite build options must be an object.');
  const shrinkage = object(options) && Object.prototype.hasOwnProperty.call(options, 'shrinkage')
    ? options.shrinkage : recipe.shrinkage ?? null;
  const clean = createSeasonForgeRecipe(profiles, recipe.donors, { shrinkage });
  const byKey = new Map(profiles.map(profile => [profileKey(profile), profile]));
  const baseline = baselineKey ? byKey.get(baselineKey) : null;
  if (baselineKey && !baseline) throw new Error('The selected season baseline is not in this catalog.');
  const blocks = SEASON_FORGE_BLOCKS.map(block => {
    const donor = clean.donors[block.key] ? byKey.get(clean.donors[block.key]) : null;
    const components = block.components.map(spec => {
      const rawEvidence = donor ? seasonComponentEvidence(donor, spec.key, spec.unit) : seasonComponentEvidence(null, spec.key, spec.unit);
      const evidence = applySupportAwarePriorShrinkage(rawEvidence, spec.key, clean.shrinkage);
      const rawReference = baseline ? seasonComponentEvidence(baseline, spec.key, spec.unit) : null;
      const reference = rawReference ? applySupportAwarePriorShrinkage(rawReference, spec.key, clean.shrinkage) : null;
      const evidenceAdjusted = evidence.shrinkage?.status === 'applied';
      const referenceAdjusted = reference?.shrinkage?.status === 'applied';
      const sameComparisonBasis = evidenceAdjusted === referenceAdjusted;
      const differenceAvailable = evidence.status === 'observed' && reference?.status === 'observed'
        && finite(evidence.value) && finite(reference.value) && sameComparisonBasis;
      const rawDifferenceAvailable = evidence.status === 'observed' && rawReference?.status === 'observed'
        && finite(evidence.rawValue) && finite(rawReference.value);
      const supportAdjustedComparison = evidenceAdjusted && referenceAdjusted;
      return { ...evidence, label: spec.label,
        rawBaseline: rawReference?.value ?? null,
        baseline: reference?.value ?? null,
        baselineAdjustedValue: reference?.adjustedValue ?? null,
        baselineStatus: reference?.status || 'unavailable',
        rawDifference: rawDifferenceAvailable ? round(evidence.rawValue - rawReference.value) : null,
        difference: differenceAvailable ? round(evidence.value - reference.value) : null,
        differenceBasis: supportAdjustedComparison ? 'support-adjusted-values'
          : sameComparisonBasis ? 'raw-observed-values' : 'unavailable-mixed-support-adjustment-basis',
        differenceStatus: differenceAvailable ? supportAdjustedComparison ? 'support-adjusted-descriptive-comparison' : 'descriptive-observed-comparison'
          : evidence.status === 'observed' && reference?.status === 'observed' && !sameComparisonBasis
            ? 'withheld-mixed-shrinkage-basis'
          : evidence.status === 'limited_sample' || reference?.status === 'limited_sample'
            ? 'withheld-limited-exposure' : 'unavailable-input' };
    });
    return { key: block.key, label: block.label,
      donor: donor ? { key: profileKey(donor), player: donor.player || donor.playerName, season: donor.season, phase: donor.phase, team: donor.team, scope: donor.scope } : null,
      components };
  });
  const shrinkageSensitivity = buildShrinkageSensitivityReceipt(profiles, clean, blocks,
    Object.prototype.hasOwnProperty.call(options, 'sensitivity') ? options.sensitivity : null);
  const assigned = blocks.filter(block => block.donor).length;
  const all = blocks.flatMap(block => block.components);
  const priorAdjustedComponents = all.filter(item => item.shrinkage?.status === 'applied').length;
  const evidenceSummary = Object.freeze({
    observedComponents: all.filter(item => item.status === 'observed').length,
    limitedSampleComponents: all.filter(item => item.status === 'limited_sample').length,
    unavailableComponents: all.filter(item => item.status === 'unavailable').length,
    priorAdjustedComponents,
    shrinkageConfiguredComponents: all.filter(item => item.shrinkage?.method).length,
    shrinkageNotAppliedComponents: all.filter(item => item.shrinkage?.method && item.shrinkage.status !== 'applied').length,
    predictiveFeaturesEligible: false,
    causalImpactSupported: false,
    calibratedForecastSupported: false,
  });
  const hasEvidenceCaveats = all.some(item => item.status !== 'observed') || priorAdjustedComponents > 0
    || all.some(item => item.shrinkage?.priorSourceStatus === 'limited_sample');
  return { recipe: clean, blocks, assigned, totalBlocks: SEASON_FORGE_BLOCKS.length,
    ...(shrinkageSensitivity ? { shrinkageSensitivity } : {}),
    interpretation: Object.freeze({ ...DESCRIPTIVE_ONLY_INTERPRETATION }),
    evidenceSummary,
    status: assigned < SEASON_FORGE_BLOCKS.length ? 'incomplete' : hasEvidenceCaveats ? 'complete_with_caveats' : 'complete',
    note: priorAdjustedComponents
      ? 'Hypothetical season-keyed component recipe. Prior-adjusted values remain descriptive estimates, with their raw observed values, donor support, prior values, prior support, and coverage shown separately. No combined player totals, RAPM, chemistry, physical feasibility, causal impact, or future performance is inferred.'
      : 'Hypothetical season-keyed component recipe. Donor rows retain their own games and denominators; no combined player totals, RAPM, chemistry, physical feasibility or future performance is inferred.',
  };
}

export function seasonProfileLabel(profile) {
  if (!profile) return 'Unassigned';
  const player = profile.player || profile.playerName || 'Unnamed player';
  return `${player} · ${profile.season || profile.seasonStartYear} · ${profile.phase || 'unknown phase'} · ${profile.team || 'unknown team'}`;
}
