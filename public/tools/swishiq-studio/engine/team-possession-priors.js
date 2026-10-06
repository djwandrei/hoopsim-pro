/*
 * Exact-season SwishIQ V4 team-rate adapter for descriptive simulation inputs.
 * This module does not load files, substitute pooled packages, or alter a
 * simulation. Callers pass the verified V4 package index and source artifacts.
 */

export const TEAM_POSSESSION_PRIORS_VERSION = 'swishiq-v4-team-possession-priors-v1';

const SHA256 = /^[a-f0-9]{64}$/;
const NBA_TEAM_COUNT = 30;

function fail(message) { throw new Error(message); }
function isObject(value) { return Boolean(value && typeof value === 'object' && !Array.isArray(value)); }
function finite(value) { return typeof value === 'number' && Number.isFinite(value); }
function hash(value, label) {
  if (typeof value !== 'string' || !SHA256.test(value)) fail(`${label} must be a lowercase SHA-256 digest.`);
  return value;
}
function round(value) { return finite(value) ? Math.round(value * 10000) / 10000 : null; }
function frozen(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(frozen);
    Object.freeze(value);
  }
  return value;
}
function teamName(value, label) {
  if (typeof value !== 'string' || !value.trim() || value.length > 120 || /[\u0000-\u001f\u007f]/.test(value)) {
    fail(`${label} needs a bounded NBA team display name.`);
  }
  return value.trim();
}
function teamKey(value) { return value.toLocaleLowerCase('en-US'); }
function metricValue(record, key) {
  const value = record?.values?.metrics?.[key];
  return finite(value) ? value : null;
}
function metricRecord(value, { unit, source, formula = null, kind = 'observed-source-value' }) {
  return Object.freeze({ status: finite(value) ? 'available' : 'unavailable', value: finite(value) ? round(value) : null,
    unit, kind, formula, source: finite(value) ? source : null });
}
function coverageList(metadata, seasonStartYear, label) {
  const years = metadata?.expectedSeasonStartYears;
  if (Array.isArray(years) && (years.length !== 1 || years[0] !== seasonStartYear)) {
    fail(`${label} contains a pooled or cross-season source declaration; exact-season derivation will not substitute it.`);
  }
  const included = metadata?.includedSeasonStartYears;
  if (Array.isArray(included) && included.some(year => year !== seasonStartYear)) {
    fail(`${label} contains rows from outside the requested exact season.`);
  }
  return Object.freeze({
    status: typeof metadata?.coverageStatus === 'string' ? metadata.coverageStatus : 'unreported',
    expectedSeasonStartYears: Array.isArray(years) ? [...years] : null,
    includedSeasonStartYears: Array.isArray(included) ? [...included] : null,
    missingSeasonStartYears: Array.isArray(metadata?.missingSeasonStartYears) ? [...metadata.missingSeasonStartYears] : null,
    sourceDatasetVersion: metadata?.sourceDatasetVersion || null,
    sourcePublisher: metadata?.sourcePublisher || null,
    providerResponseHashesIncluded: metadata?.responseHashesIncluded === true,
  });
}

function validatePackageIndex(packageIndex) {
  if (!isObject(packageIndex) || !isObject(packageIndex.scope)) fail('A V4 package index with an explicit season scope is required.');
  const scope = packageIndex.scope;
  const years = scope.seasonStartYears;
  const year = scope.seasonStartYear;
  if (scope.kind !== 'exact-season' || !Number.isSafeInteger(year) || year < 1946 || year > 2100
    || !Array.isArray(years) || years.length !== 1 || years[0] !== year) {
    fail('Team possession priors require one exact-season V4 package; pooled input is not allowed.');
  }
  const seasonEndYear = scope.seasonEndYear ?? year + 1;
  if (!Number.isSafeInteger(seasonEndYear) || seasonEndYear !== year + 1) fail('V4 package season end year does not match its season key.');
  if (typeof packageIndex.packageId !== 'string' || !packageIndex.packageId.startsWith('nba-swishiq-v4-')
    || typeof packageIndex.packageVersion !== 'string' || !Array.isArray(packageIndex.artifacts)) {
    fail('A supported SwishIQ V4 package index is required.');
  }
  const packageHashes = Object.freeze({
    packageManifestSha256: hash(packageIndex.packageManifestSha256, 'V4 package manifest hash'),
    contentSha256: hash(packageIndex.contentSha256, 'V4 package content hash'),
    sourceLockSha256: hash(packageIndex.sourceLockSha256, 'V4 source-lock hash'),
  });
  return Object.freeze({ seasonStartYear: year, seasonEndYear, packageId: packageIndex.packageId,
    packageVersion: packageIndex.packageVersion, packageHashes, scope });
}

function validateTeamArtifact(packageIndex, artifact, artifactId, seasonStartYear, { optional = false } = {}) {
  if (artifact == null && optional) return null;
  if (!isObject(artifact) || artifact.artifactId !== artifactId || !Array.isArray(artifact.records)) {
    fail(`Expected V4 artifact ${artifactId} with a records array.`);
  }
  const descriptor = packageIndex.artifacts.find(row => row?.artifactId === artifactId);
  if (!descriptor || typeof descriptor.path !== 'string' || !Number.isSafeInteger(descriptor.rows)
    || !SHA256.test(descriptor.sha256 || '') || descriptor.rows !== artifact.records.length) {
    fail(`V4 package index does not pin the supplied ${artifactId} artifact and row count.`);
  }
  if (artifact.packageId !== packageIndex.packageId || artifact.packageVersion !== packageIndex.packageVersion
    || artifact.packageManifestSha256 !== packageIndex.packageManifestSha256
    || artifact.sourceLockSha256 !== packageIndex.sourceLockSha256
    || artifact.scope?.kind !== 'exact-season' || artifact.scope?.seasonStartYear !== seasonStartYear
    || !Array.isArray(artifact.scope?.seasonStartYears) || artifact.scope.seasonStartYears.length !== 1
    || artifact.scope.seasonStartYears[0] !== seasonStartYear) {
    fail(`V4 artifact ${artifactId} does not share the package's exact-season identity and pins.`);
  }
  const coverage = coverageList(artifact.sourceMetadata, seasonStartYear, artifactId);
  const provenance = artifact.provenance || {};
  return Object.freeze({ artifactId, path: descriptor.path, sha256: descriptor.sha256, bytes: descriptor.bytes ?? null,
    rowCount: artifact.records.length, sourceSystem: provenance.sourceSystem || null,
    sourceVersion: provenance.sourceVersion || artifact.sourceMetadata?.sourceDatasetVersion || null,
    sourceDatasetVersion: artifact.sourceMetadata?.sourceDatasetVersion || null,
    sourcePublisher: artifact.sourceMetadata?.sourcePublisher || null,
    sourcePhaseLabels: Object.freeze([...(artifact.sourceMetadata?.sourcePhaseLabels || [])]),
    retrievedAtBySeason: Object.freeze([...(provenance.retrievedAtBySeason || [])]),
    coverage, sourceHashStatus: artifact.sourceMetadata?.responseHashesIncluded === true
      ? 'provider-response-hashes-in-source-metadata' : 'provider-response-hashes-not-included',
    records: artifact.records });
}

function indexTeamRows(artifact, expectedSeasonStartYear, expectedFamily) {
  const indexed = new Map();
  for (const [rowIndex, row] of artifact.records.entries()) {
    if (!isObject(row) || !isObject(row.time) || row.time.seasonStartYear !== expectedSeasonStartYear
      || row.time.phase !== 'regular' || row.values?.entityLevel !== 'team' || row.values?.statFamily !== expectedFamily) {
      fail(`${artifact.artifactId} row ${rowIndex + 1} is outside the requested regular-season team scope.`);
    }
    const displayName = teamName(row.values.displayName, `${artifact.artifactId} row ${rowIndex + 1}`);
    const key = teamKey(displayName);
    if (indexed.has(key)) fail(`${artifact.artifactId} contains duplicate rows for ${displayName}.`);
    indexed.set(key, { displayName, teamCode: row.entities?.teamCode || row.values?.teamCode || null, row });
  }
  return indexed;
}

function observedInput(artifact, indexedRow, field, unit) {
  const value = indexedRow ? metricValue(indexedRow.row, field) : null;
  return Object.freeze({ status: finite(value) ? 'available' : 'unavailable', value: finite(value) ? round(value) : null,
    unit, source: finite(value) ? Object.freeze({ artifactId: artifact?.artifactId || null,
      artifactSha256: artifact?.sha256 || null, recordId: indexedRow?.row?.recordId || null, metric: field,
      sourceSystem: indexedRow?.row?.provenance?.sourceSystem || artifact?.sourceSystem || null,
      sourceVersion: indexedRow?.row?.provenance?.sourceVersion || artifact?.sourceVersion || null,
      retrievedAt: indexedRow?.row?.provenance?.retrievedAt || null,
      evidenceStatus: indexedRow?.row?.evidence?.status || null,
      temporalUseRole: indexedRow?.row?.temporalUse?.role || null }) : null });
}

function sourceRef(...inputs) {
  return Object.freeze(inputs.filter(input => input?.status === 'available').map(input => input.source));
}

function priorMetric(value, unit, { kind, formula, inputs, source }) {
  return Object.freeze({ status: finite(value) ? 'available' : 'unavailable', value: finite(value) ? round(value) : null,
    unit, kind: finite(value) ? kind : 'unavailable', formula: finite(value) ? formula : null,
    inputMetrics: finite(value) ? Object.freeze([...inputs]) : Object.freeze([]), source: finite(value) ? source : null });
}

/**
 * Derive exact-season team pace and rating priors from pinned NBA.com V4 team
 * totals/advanced rows. The function only consumes the season explicitly
 * named by the package index; missing exact-season inputs stay unavailable.
 */
export function deriveV4SeasonTeamPossessionPriors({ packageIndex, teamBaseArtifact, teamAdvancedArtifact, teamOpponentArtifact = null } = {}) {
  const identity = validatePackageIndex(packageIndex);
  const { seasonStartYear, packageId, packageVersion, packageHashes } = identity;
  const base = validateTeamArtifact(packageIndex, teamBaseArtifact, 'stats-nba-com-team-base', seasonStartYear);
  const advanced = validateTeamArtifact(packageIndex, teamAdvancedArtifact, 'stats-nba-com-team-advanced', seasonStartYear);
  const opponent = validateTeamArtifact(packageIndex, teamOpponentArtifact, 'stats-nba-com-team-opponent', seasonStartYear, { optional: true });
  const sources = [base, advanced, opponent].filter(Boolean);
  for (const source of sources) {
    if ((source.sourceSystem || source.sourcePublisher) !== 'NBA.com Stats') fail(`${source.artifactId} is not an NBA.com Stats source artifact.`);
  }
  const datasetVersions = [...new Set(sources.map(source => source.sourceDatasetVersion).filter(Boolean))];
  if (datasetVersions.length > 1) fail('NBA.com team artifacts use incompatible source dataset versions.');
  const baseRows = indexTeamRows(base, seasonStartYear, 'team-base');
  const advancedRows = indexTeamRows(advanced, seasonStartYear, 'team-advanced');
  const opponentRows = opponent ? indexTeamRows(opponent, seasonStartYear, 'team-opponent') : new Map();
  const names = [...new Set([...baseRows.keys(), ...advancedRows.keys(), ...opponentRows.keys()])].sort();
  const metricCoverage = {
    possessionsPer48: { observed: 0, componentDerived: 0, unavailable: 0 },
    possessionsPerTeamGame: { observed: 0, componentDerived: 0, unavailable: 0 },
    offensiveRating: { observed: 0, componentDerived: 0, unavailable: 0 },
    defensiveRating: { observed: 0, componentDerived: 0, unavailable: 0 },
  };
  const teams = names.map(key => {
    const baseRow = baseRows.get(key) || null, advancedRow = advancedRows.get(key) || null, opponentRow = opponentRows.get(key) || null;
    const displayName = baseRow?.displayName || advancedRow?.displayName || opponentRow?.displayName;
    const teamCodes = [...new Set([baseRow?.teamCode, advancedRow?.teamCode, opponentRow?.teamCode].filter(Boolean))];
    if (teamCodes.length > 1) fail(`Team code attribution conflicts for ${displayName}.`);
    const metrics = {
      pace48: observedInput(advanced, advancedRow, 'PACE', 'possessions-per-48-team-minutes'),
      possessions: observedInput(advanced, advancedRow, 'POSS', 'team-possessions-season-total'),
      games: observedInput(advanced, advancedRow, 'GP', 'games'),
      teamMinutes: observedInput(advanced, advancedRow, 'MIN', 'team-minutes'),
      pointsFor: observedInput(base, baseRow, 'PTS', 'points-season-total'),
      pointsAgainst: observedInput(opponent, opponentRow, 'OPP_PTS', 'opponent-points-season-total'),
      opponentPossessions: observedInput(opponent, opponentRow, 'OPP_POSS', 'opponent-possessions-season-total'),
      offenseRating: observedInput(advanced, advancedRow, 'OFF_RATING', 'points-per-100-possessions'),
      defenseRating: observedInput(advanced, advancedRow, 'DEF_RATING', 'points-per-100-possessions'),
    };
    const possessions = metrics.possessions.value, games = metrics.games.value, minutes = metrics.teamMinutes.value;
    const paceFromComponents = finite(possessions) && finite(minutes) && minutes > 0 ? possessions / (minutes / 48) : null;
    const possessionsPerGame = finite(possessions) && finite(games) && games > 0 ? possessions / games : null;
    const offensiveRatingFromComponents = finite(metrics.pointsFor.value) && finite(possessions) && possessions > 0
      ? (metrics.pointsFor.value / possessions) * 100 : null;
    const defensiveRatingFromComponents = finite(metrics.pointsAgainst.value) && finite(metrics.opponentPossessions.value)
      && metrics.opponentPossessions.value > 0 ? (metrics.pointsAgainst.value / metrics.opponentPossessions.value) * 100 : null;
    const pacePrior = priorMetric(metrics.pace48.value, 'possessions-per-48-team-minutes', {
      kind: 'direct-observed-rate', formula: 'NBA.com team advanced PACE; NBA glossary unit is possessions per 48 minutes',
      inputs: ['PACE'], source: metrics.pace48.source });
    const possessionsPerGamePrior = priorMetric(possessionsPerGame, 'team-possessions-per-game', { kind: 'component-derived-season-average',
      formula: 'POSS / GP', inputs: ['POSS', 'GP'], source: Object.freeze(sourceRef(metrics.possessions, metrics.games)) });
    const offensePrior = finite(metrics.offenseRating.value)
      ? priorMetric(metrics.offenseRating.value, 'points-per-100-possessions', { kind: 'direct-observed-rate', formula: 'NBA.com team advanced OFF_RATING', inputs: ['OFF_RATING'], source: metrics.offenseRating.source })
      : priorMetric(offensiveRatingFromComponents, 'points-per-100-possessions', { kind: 'component-derived-rate', formula: '(PTS / POSS) * 100', inputs: ['PTS', 'POSS'], source: Object.freeze(sourceRef(metrics.pointsFor, metrics.possessions)) });
    const defensePrior = finite(metrics.defenseRating.value)
      ? priorMetric(metrics.defenseRating.value, 'points-per-100-possessions', { kind: 'direct-observed-rate', formula: 'NBA.com team advanced DEF_RATING', inputs: ['DEF_RATING'], source: metrics.defenseRating.source })
      : priorMetric(defensiveRatingFromComponents, 'points-per-100-possessions', { kind: 'component-derived-rate', formula: '(OPP_PTS / OPP_POSS) * 100', inputs: ['OPP_PTS', 'OPP_POSS'], source: Object.freeze(sourceRef(metrics.pointsAgainst, metrics.opponentPossessions)) });
    const requiredPriors = { possessionsPer48: pacePrior, possessionsPerTeamGame: possessionsPerGamePrior,
      offensiveRating: offensePrior, defensiveRating: defensePrior };
    for (const [key, prior] of Object.entries(requiredPriors)) {
      if (prior.status !== 'available') metricCoverage[key].unavailable++;
      else if (prior.kind === 'direct-observed-rate') metricCoverage[key].observed++;
      else metricCoverage[key][key === 'possessionsPerTeamGame' ? 'componentDerived' : 'componentDerived']++;
    }
    const missingInputs = Object.entries(requiredPriors).filter(([, prior]) => prior.status !== 'available').map(([key]) => key);
    return Object.freeze({
      team: Object.freeze({ teamCode: teamCodes[0] || null, displayName, keyKind: teamCodes.length ? 'canonical-team-code' : 'provider-team-name',
        identityStatus: teamCodes.length ? 'code-present' : 'name-keyed-code-unresolved' }),
      sourceRecords: Object.freeze({ base: baseRow?.row?.recordId || null, advanced: advancedRow?.row?.recordId || null,
        opponent: opponentRow?.row?.recordId || null }),
      observed: Object.freeze(metrics),
      componentCrossChecks: Object.freeze({
        localPaceCrossCheck: metricRecord(paceFromComponents, { unit: 'possessions-per-48-team-minutes',
          kind: 'local-cross-check-not-used-as-prior', formula: 'POSS / (MIN / 48); dimensional cross-check only, not substituted for NBA.com PACE', source: sourceRef(metrics.possessions, metrics.teamMinutes) }),
        paceRateDifference: finite(metrics.pace48.value) && finite(paceFromComponents)
          ? round(metrics.pace48.value - paceFromComponents) : null,
        offensiveRatingFromTotals: metricRecord(offensiveRatingFromComponents, { unit: 'points-per-100-possessions',
          kind: 'derived-cross-check', formula: '(PTS / POSS) * 100', source: sourceRef(metrics.pointsFor, metrics.possessions) }),
        defensiveRatingFromTotals: metricRecord(defensiveRatingFromComponents, { unit: 'points-per-100-possessions',
          kind: 'derived-cross-check', formula: '(OPP_PTS / OPP_POSS) * 100', source: sourceRef(metrics.pointsAgainst, metrics.opponentPossessions) }),
      }),
      simulationPriors: Object.freeze(requiredPriors),
      missingInputs: Object.freeze(missingInputs),
    });
  });
  const completeTeamSet = names.length === NBA_TEAM_COUNT && baseRows.size === NBA_TEAM_COUNT
    && advancedRows.size === NBA_TEAM_COUNT && (!opponent || opponentRows.size === NBA_TEAM_COUNT);
  const teamNamesBySource = { base: [...baseRows.values()].map(row => row.displayName).sort(),
    advanced: [...advancedRows.values()].map(row => row.displayName).sort(),
    opponent: opponent ? [...opponentRows.values()].map(row => row.displayName).sort() : [] };
  const onlyIn = (left, right) => left.filter(name => !right.some(other => teamKey(other) === teamKey(name)));
  const missingCoverage = {
    expectedTeamCount: NBA_TEAM_COUNT,
    observedTeamCount: names.length,
    baseRows: baseRows.size,
    advancedRows: advancedRows.size,
    opponentRows: opponent ? opponentRows.size : null,
    baseOnlyNames: onlyIn(teamNamesBySource.base, teamNamesBySource.advanced),
    advancedOnlyNames: onlyIn(teamNamesBySource.advanced, teamNamesBySource.base),
    opponentOnlyNames: opponent ? onlyIn(teamNamesBySource.opponent, teamNamesBySource.advanced) : null,
    metrics: Object.fromEntries(Object.entries(metricCoverage).map(([key, counts]) => [key, Object.freeze({ ...counts,
      available: counts.observed + counts.componentDerived, missing: counts.unavailable })])),
  };
  const sourceArtifactsComplete = sources.every(source => source.coverage.status === 'complete');
  return frozen({
    format: TEAM_POSSESSION_PRIORS_VERSION,
    status: completeTeamSet && sourceArtifactsComplete && Object.values(metricCoverage).every(counts => counts.unavailable === 0) ? 'complete' : 'partial',
    interpretation: 'descriptive exact-season simulation priors; direct NBA.com observations remain separate from component-derived values; no pooled substitution, temporal forecast, or calibrated posterior is produced',
    season: Object.freeze({ seasonStartYear, seasonEndYear: identity.seasonEndYear,
      seasonKey: `${seasonStartYear}-${String((seasonStartYear + 1) % 100).padStart(2, '0')}`, phase: 'regular' }),
    package: Object.freeze({ packageId, packageVersion, ...packageHashes, hashStatus: 'declared-in-V4-package-index; helper does-not-rehash-file-bytes' }),
    sourceArtifacts: Object.freeze([base, advanced, ...(opponent ? [opponent] : [])].map(({ records: _records, ...descriptor }) => descriptor)),
    sourcePolicy: Object.freeze({ provider: 'NBA.com Stats', sourceDatasetVersion: advanced.sourceDatasetVersion || base.sourceDatasetVersion,
      metricDefinitionsSource: 'https://www.nba.com/stats/help/glossary',
      sourceHashAvailability: 'V4 artifact hashes are retained; NBA.com response hashes are absent where sourceMetadata.responseHashesIncluded is false',
      pooledSubstitution: 'forbidden', exactSeasonOnly: true }),
    priorDefinitions: Object.freeze({
      possessionsPer48: Object.freeze({ unit: 'possessions-per-48-team-minutes', directField: 'PACE',
        fallbackPolicy: 'missing-direct-PACE-remains-unavailable; POSS/MIN is retained only as an unvalidated local cross-check' }),
      possessionsPerTeamGame: Object.freeze({ unit: 'team-possessions-per-game', formula: 'POSS / GP', note: 'Observed season total divided by exact-season games; includes source-total scope.' }),
      offensiveRating: Object.freeze({ unit: 'points-per-100-possessions', directField: 'OFF_RATING', fallbackFormula: '(PTS / POSS) * 100' }),
      defensiveRating: Object.freeze({ unit: 'points-per-100-possessions', directField: 'DEF_RATING', fallbackFormula: '(OPP_PTS / OPP_POSS) * 100' }),
    }),
    coverage: Object.freeze({ completeTeamSet, missingCoverage: Object.freeze(missingCoverage),
      sourceArtifactCoverage: Object.freeze({ base: base.coverage, advanced: advanced.coverage, opponent: opponent?.coverage || null }) }),
    teams: Object.freeze(teams),
  });
}

function resolvePaceTeam(teamPriors, selector) {
  if (typeof selector !== 'string' || !selector.trim()) return null;
  const key = teamKey(selector);
  const matches = teamPriors.teams.filter(row => teamKey(row.team.displayName) === key
    || (row.team.teamCode && teamKey(row.team.teamCode) === key));
  return matches.length === 1 ? matches[0] : null;
}

function observedTeamPace(team, advancedArtifactSha256, seasonStartYear) {
  const pace = team?.observed?.pace48;
  const source = pace?.source;
  if (pace?.status !== 'available' || pace.unit !== 'possessions-per-48-team-minutes'
    || !finite(pace.value) || pace.value <= 0 || source?.metric !== 'PACE'
    || source.artifactId !== 'stats-nba-com-team-advanced' || source.artifactSha256 !== advancedArtifactSha256
    || source.temporalUseRole !== 'descriptive') return null;
  return Object.freeze({ team: team.team, value: pace.value, unit: pace.unit,
    source: Object.freeze({ ...source, seasonStartYear }) });
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function harmonicMean(left, right) {
  return 2 / ((1 / left) + (1 / right));
}

/**
 * Turn two same-season observed PACE inputs into a regulation possession input.
 * This is a rate-based simulator input only; it does not forecast points or
 * assert calibration. League shrinkage is exposed as sensitivity, not applied
 * to the selected default.
 */
export function deriveV4GameExpectedPossessionInput({ teamPriors, teamA, teamB } = {}) {
  if (!isObject(teamPriors) || teamPriors.format !== TEAM_POSSESSION_PRIORS_VERSION
    || teamPriors.sourcePolicy?.exactSeasonOnly !== true || teamPriors.sourcePolicy?.pooledSubstitution !== 'forbidden'
    || !Number.isSafeInteger(teamPriors.season?.seasonStartYear) || !isObject(teamPriors.package)
    || !Array.isArray(teamPriors.teams)) {
    fail('Game possession input needs an exact-season V4 team-prior result.');
  }
  if (!Array.isArray(teamPriors.sourceArtifacts)) fail('Game possession input needs pinned source-artifact descriptors.');
  const advancedArtifact = teamPriors.sourceArtifacts.find(source => source.artifactId === 'stats-nba-com-team-advanced');
  const advancedArtifactSha256 = advancedArtifact?.sha256;
  if (!SHA256.test(advancedArtifactSha256 || '')
    || !SHA256.test(teamPriors.package.packageManifestSha256 || '')
    || !SHA256.test(teamPriors.package.contentSha256 || '')
    || !SHA256.test(teamPriors.package.sourceLockSha256 || '')) {
    fail('Game possession input needs the pinned package and advanced-source hashes.');
  }
  const selectedA = resolvePaceTeam(teamPriors, teamA);
  const selectedB = resolvePaceTeam(teamPriors, teamB);
  if (selectedA && selectedB && selectedA.team.displayName === selectedB.team.displayName) {
    fail('Game possession input needs two different teams.');
  }
  const seasonStartYear = teamPriors.season.seasonStartYear;
  const observedA = observedTeamPace(selectedA, advancedArtifactSha256, seasonStartYear);
  const observedB = observedTeamPace(selectedB, advancedArtifactSha256, seasonStartYear);
  const pairAvailable = Boolean(observedA && observedB);

  const allPaces = teamPriors.teams.map(team => observedTeamPace(team, advancedArtifactSha256, seasonStartYear));
  const leagueSupported = teamPriors.coverage?.completeTeamSet === true && allPaces.length === NBA_TEAM_COUNT
    && allPaces.every(Boolean) && new Set(allPaces.map(row => row.team.teamCode || teamKey(row.team.displayName))).size === NBA_TEAM_COUNT;
  const leaguePaceValues = leagueSupported ? allPaces.map(row => row.value) : [];
  const leagueMean = leagueSupported ? leaguePaceValues.reduce((sum, value) => sum + value, 0) / leaguePaceValues.length : null;
  const leagueMedian = leagueSupported ? median(leaguePaceValues) : null;
  const pairPace = pairAvailable ? harmonicMean(observedA.value, observedB.value) : null;
  const expectedPossessions = pairAvailable ? round(pairPace * (48 / 48)) : null;
  const sensitivity = [];
  const addCase = ({ id, pairFormula, teamAWeight = null, teamBWeight = null, leagueWeight = 0, leagueValue = leagueMean }) => {
    if (!pairAvailable) {
      sensitivity.push(Object.freeze({ id, status: 'unavailable', reason: 'both-matching-observed-team-PACE-values-required' }));
      return;
    }
    if (leagueWeight > 0 && !leagueSupported) {
      sensitivity.push(Object.freeze({ id, status: 'unavailable', reason: 'complete-same-season-league-PACE-coverage-required' }));
      return;
    }
    const teamPairValue = pairFormula === 'arithmetic-mean'
      ? ((observedA.value * teamAWeight) + (observedB.value * teamBWeight)) : pairPace;
    const value = (teamPairValue * (1 - leagueWeight)) + ((leagueValue ?? 0) * leagueWeight);
    sensitivity.push(Object.freeze({ id, status: 'available', expectedRegulationPossessions: round(value), unit: 'possessions-per-team-in-48-minute-regulation',
      formula: pairFormula === 'arithmetic-mean' ? 'teamAWeight * teamA.PACE + teamBWeight * teamB.PACE; then blend with league PACE'
        : '(1 - leaguePriorWeight) * harmonicMean(teamA.PACE, teamB.PACE) + leaguePriorWeight * leaguePrior.PACE',
      weights: Object.freeze({ teamA: teamAWeight, teamB: teamBWeight, pairedPace: pairFormula === 'harmonic-mean' ? 1 - leagueWeight : null,
        leaguePrior: leagueWeight }), leagueStatistic: leagueWeight > 0 ? (leagueValue === leagueMedian ? 'equal-team-median' : 'equal-team-mean') : null,
      deltaFromSelectedPossessions: round(value - expectedPossessions) }));
  };
  addCase({ id: 'selected-harmonic-team-pace-no-shrinkage-v1', pairFormula: 'harmonic-mean' });
  addCase({ id: 'equal-weight-team-arithmetic-mean-v1', pairFormula: 'arithmetic-mean', teamAWeight: 0.5, teamBWeight: 0.5 });
  addCase({ id: 'harmonic-team-pace-75-league-mean-25-v1', pairFormula: 'harmonic-mean', leagueWeight: 0.25 });
  addCase({ id: 'harmonic-team-pace-50-league-mean-50-v1', pairFormula: 'harmonic-mean', leagueWeight: 0.5 });
  addCase({ id: 'harmonic-team-pace-75-league-median-25-v1', pairFormula: 'harmonic-mean', leagueWeight: 0.25, leagueValue: leagueMedian });

  const directPaceCount = allPaces.filter(Boolean).length;
  const missingPaceTeamNames = teamPriors.teams.filter((team, index) => !allPaces[index]).map(team => team.team.displayName);
  const leaguePrior = leagueSupported ? Object.freeze({ status: 'available', unit: 'possessions-per-48-team-minutes',
    aggregation: 'equal-weight mean and median of the 30 observed exact-season team PACE values', teamCount: NBA_TEAM_COUNT,
    mean: round(leagueMean), median: round(leagueMedian), sourceArtifactId: advancedArtifact.artifactId,
    sourceArtifactSha256: advancedArtifactSha256, seasonStartYear: teamPriors.season.seasonStartYear })
    : Object.freeze({ status: 'unavailable', reason: 'requires all-30-team direct observed PACE from the same exact-season advanced artifact',
      observedTeamPaceCount: directPaceCount, expectedTeamCount: NBA_TEAM_COUNT, missingTeamNames: Object.freeze(missingPaceTeamNames) });

  return frozen({
    format: 'swishiq-v4-game-possession-input-v1',
    status: pairAvailable ? 'available' : 'unavailable',
    use: 'regulation-possession-input-only',
    interpretation: 'observed-rate-derived simulation input; not a point forecast, prediction, or calibrated model output',
    season: Object.freeze({ ...teamPriors.season }),
    package: Object.freeze({ ...teamPriors.package }),
    sourceHashes: Object.freeze({ advancedArtifactId: advancedArtifact.artifactId, advancedArtifactSha256,
      packageManifestSha256: teamPriors.package.packageManifestSha256, packageContentSha256: teamPriors.package.contentSha256,
      sourceLockSha256: teamPriors.package.sourceLockSha256 }),
    teams: Object.freeze({ a: observedA, b: observedB }),
    observedInputs: Object.freeze({
      teamAPace: observedA?.value ?? null,
      teamBPace: observedB?.value ?? null,
      unit: 'possessions-per-48-team-minutes',
      bothPacesAreDirectObservedValues: pairAvailable,
    }),
    leaguePrior,
    selectedFormula: Object.freeze({ id: 'selected-harmonic-team-pace-no-shrinkage-v1',
      formula: 'harmonicMean(teamA.PACE, teamB.PACE) * regulationMinutes / 48',
      teamPairMethod: 'harmonic-mean; symmetric combination of same-season observed team PACE values',
      selectionRationale: 'deterministic, symmetric baseline; weights are not estimated or calibrated, and league shrinkage is shown only as sensitivity',
      leaguePriorWeight: 0,
      regulationMinutes: 48, overtimeIncluded: false }),
    expectedRegulationPossessions: expectedPossessions,
    unit: 'possessions-per-team-in-48-minute-regulation',
    sensitivityCases: Object.freeze(sensitivity),
    coverage: Object.freeze({ observedPairPaceAvailable: pairAvailable, directObservedTeamPaceCount: directPaceCount,
      expectedLeagueTeamCount: NBA_TEAM_COUNT, missingPaceTeamNames: Object.freeze(missingPaceTeamNames),
      leaguePriorAvailable: leagueSupported }),
    unsupportedComponents: Object.freeze(['score forecast', 'overtime possessions', 'team-specific game pace effect', 'pace matchup calibration']),
  });
}

function directTeamRating(team, field, advancedArtifactSha256) {
  const metric = field === 'OFF_RATING' ? team?.observed?.offenseRating : team?.observed?.defenseRating;
  const source = metric?.source;
  if (metric?.status !== 'available' || metric.unit !== 'points-per-100-possessions'
    || !finite(metric.value) || metric.value <= 0 || source?.metric !== field
    || source.artifactId !== 'stats-nba-com-team-advanced' || source.artifactSha256 !== advancedArtifactSha256
    || source.sourceSystem !== 'NBA.com Stats' || typeof source.recordId !== 'string' || !source.recordId
    || source.temporalUseRole !== 'descriptive') return null;
  return Object.freeze({ team: team.team, value: metric.value, unit: metric.unit, metric: field,
    source: Object.freeze({ ...source }) });
}

function mean(values) { return values.reduce((sum, value) => sum + value, 0) / values.length; }

function resolveGameScoreTeam(teamPriors, selector) {
  const team = resolvePaceTeam(teamPriors, selector);
  return team || null;
}

function requireMatchingPossessionInput({ teamPriors, possessionInput, teamA, teamB, advancedArtifactSha256 }) {
  const packagePins = ['packageManifestSha256', 'contentSha256', 'sourceLockSha256'];
  if (!isObject(possessionInput) || possessionInput.format !== 'swishiq-v4-game-possession-input-v1'
    || possessionInput.status !== 'available' || possessionInput.use !== 'regulation-possession-input-only'
    || possessionInput.unit !== 'possessions-per-team-in-48-minute-regulation'
    || !finite(possessionInput.expectedRegulationPossessions) || possessionInput.expectedRegulationPossessions <= 0
    || possessionInput.selectedFormula?.overtimeIncluded !== false
    || possessionInput.season?.seasonStartYear !== teamPriors.season.seasonStartYear
    || possessionInput.season?.seasonEndYear !== teamPriors.season.seasonEndYear
    || possessionInput.package?.packageId !== teamPriors.package.packageId
    || possessionInput.package?.packageVersion !== teamPriors.package.packageVersion
    || possessionInput.sourceHashes?.advancedArtifactSha256 !== advancedArtifactSha256) {
    fail('Score inputs require an available same-season regulation possession input from the matching advanced artifact.');
  }
  for (const pin of packagePins) {
    if (possessionInput.package?.[pin] !== teamPriors.package[pin]) {
      fail(`Possession input ${pin} does not match the team-prior package.`);
    }
  }
  if (possessionInput.sourceHashes?.packageManifestSha256 !== teamPriors.package.packageManifestSha256
    || possessionInput.sourceHashes?.packageContentSha256 !== teamPriors.package.contentSha256
    || possessionInput.sourceHashes?.sourceLockSha256 !== teamPriors.package.sourceLockSha256) {
    fail('Possession input source hashes do not match the team-prior package pins.');
  }
  const a = possessionInput.teams?.a, b = possessionInput.teams?.b;
  if (a?.team?.displayName !== teamA.team.displayName || b?.team?.displayName !== teamB.team.displayName
    || a?.source?.artifactSha256 !== advancedArtifactSha256 || b?.source?.artifactSha256 !== advancedArtifactSha256
    || a?.source?.metric !== 'PACE' || b?.source?.metric !== 'PACE'
    || !finite(a.value) || !finite(b.value)
    || a.value !== teamA.observed.pace48.value || b.value !== teamB.observed.pace48.value) {
    fail('Possession input team order or observed PACE values do not match the requested exact-season teams.');
  }
}

/**
 * Build descriptive, exact-season regulation score inputs from direct NBA.com
 * offensive/defensive ratings and a complete 30-team league baseline. This
 * derives expected efficiency and points inputs only; it does not simulate,
 * forecast, validate, or calibrate outcomes.
 */
export function deriveV4GameExpectedScoreInput({ teamPriors, possessionInput, teamA, teamB } = {}) {
  if (!isObject(teamPriors) || teamPriors.format !== TEAM_POSSESSION_PRIORS_VERSION
    || teamPriors.status !== 'complete' || teamPriors.sourcePolicy?.exactSeasonOnly !== true
    || teamPriors.sourcePolicy?.pooledSubstitution !== 'forbidden'
    || teamPriors.coverage?.completeTeamSet !== true
    || !Number.isSafeInteger(teamPriors.season?.seasonStartYear)
    || teamPriors.season.seasonEndYear !== teamPriors.season.seasonStartYear + 1
    || !isObject(teamPriors.package) || !Array.isArray(teamPriors.teams)
    || typeof teamPriors.package.packageId !== 'string' || !teamPriors.package.packageId.startsWith('nba-swishiq-v4-')
    || typeof teamPriors.package.packageVersion !== 'string'
    || !Array.isArray(teamPriors.sourceArtifacts)) {
    fail('Score inputs require a complete exact-season V4 team-prior result.');
  }
  for (const pin of ['packageManifestSha256', 'contentSha256', 'sourceLockSha256']) {
    if (!SHA256.test(teamPriors.package[pin] || '')) fail(`Team-prior package is missing ${pin}.`);
  }
  const advancedArtifact = teamPriors.sourceArtifacts.find(source => source.artifactId === 'stats-nba-com-team-advanced');
  const advancedArtifactSha256 = advancedArtifact?.sha256;
  if (!SHA256.test(advancedArtifactSha256 || '') || advancedArtifact.coverage?.status !== 'complete'
    || advancedArtifact.rowCount !== NBA_TEAM_COUNT
    || (advancedArtifact.sourceSystem || advancedArtifact.sourcePublisher) !== 'NBA.com Stats') {
    fail('Score inputs require a complete, pinned same-season NBA.com advanced team artifact.');
  }

  const selectedA = resolveGameScoreTeam(teamPriors, teamA);
  const selectedB = resolveGameScoreTeam(teamPriors, teamB);
  if (!selectedA || !selectedB) fail('Both score-input teams must resolve uniquely in the exact-season package.');
  if (selectedA.team.displayName === selectedB.team.displayName) fail('Score inputs need two different teams.');
  requireMatchingPossessionInput({ teamPriors, possessionInput, teamA: selectedA, teamB: selectedB, advancedArtifactSha256 });

  const allTeamRatings = teamPriors.teams.map(team => ({
    team: team.team,
    offense: directTeamRating(team, 'OFF_RATING', advancedArtifactSha256),
    defense: directTeamRating(team, 'DEF_RATING', advancedArtifactSha256),
  }));
  const identities = allTeamRatings.map(row => row.team?.teamCode || teamKey(row.team?.displayName || ''));
  if (allTeamRatings.length !== NBA_TEAM_COUNT || allTeamRatings.some(row => !row.offense || !row.defense)
    || identities.some(key => !key) || new Set(identities).size !== NBA_TEAM_COUNT) {
    fail('Score inputs reject partial league coverage; all 30 teams need direct same-season OFF_RATING and DEF_RATING.');
  }

  const teamAOffense = directTeamRating(selectedA, 'OFF_RATING', advancedArtifactSha256);
  const teamADefense = directTeamRating(selectedA, 'DEF_RATING', advancedArtifactSha256);
  const teamBOffense = directTeamRating(selectedB, 'OFF_RATING', advancedArtifactSha256);
  const teamBDefense = directTeamRating(selectedB, 'DEF_RATING', advancedArtifactSha256);
  if (!teamAOffense || !teamADefense || !teamBOffense || !teamBDefense) {
    fail('Both teams need direct observed same-season OFF_RATING and DEF_RATING values.');
  }
  const offenseValues = allTeamRatings.map(row => row.offense.value);
  const defenseValues = allTeamRatings.map(row => row.defense.value);
  const league = Object.freeze({
    status: 'available',
    method: 'equal-team aggregation of all 30 direct observed ratings from this exact-season advanced artifact',
    teamCount: NBA_TEAM_COUNT,
    unit: 'points-per-100-possessions',
    offenseMean: round(mean(offenseValues)),
    offenseMedian: round(median(offenseValues)),
    defenseMean: round(mean(defenseValues)),
    defenseMedian: round(median(defenseValues)),
    sourceArtifactId: advancedArtifact.artifactId,
    sourceArtifactSha256: advancedArtifactSha256,
    seasonStartYear: teamPriors.season.seasonStartYear,
  });

  const possessions = possessionInput.expectedRegulationPossessions;
  const scoreFor = (offense, opponentDefense, defenseBaseline, defenseWeight = 1, leagueShrinkage = 0) => {
    const matchupRating = league.offenseMean + (offense.value - league.offenseMean)
      + defenseWeight * (opponentDefense.value - defenseBaseline);
    const expectedRating = (matchupRating * (1 - leagueShrinkage)) + (league.offenseMean * leagueShrinkage);
    return Object.freeze({
      expectedOffensiveRating: round(expectedRating),
      expectedRegulationPoints: round(expectedRating * possessions / 100),
      formula: 'leagueOffenseBaseline + (teamOFF_RATING - leagueOffenseBaseline) + defenseWeight * (opponentDEF_RATING - leagueDefenseBaseline)',
      weights: Object.freeze({ teamOffenseAdjustment: 1, opponentDefenseAdjustment: defenseWeight,
        leagueOffenseShrinkage: leagueShrinkage }),
    });
  };
  const selectedAInput = scoreFor(teamAOffense, teamBDefense, league.defenseMean);
  const selectedBInput = scoreFor(teamBOffense, teamADefense, league.defenseMean);
  const selectedTotal = round(selectedAInput.expectedRegulationPoints + selectedBInput.expectedRegulationPoints);
  const scenarios = [];
  const addScenario = ({ id, defenseWeight = 1, defenseBaseline = league.defenseMean, baselineLabel = 'equal-team-mean', leagueShrinkage = 0 }) => {
    const a = scoreFor(teamAOffense, teamBDefense, defenseBaseline, defenseWeight, leagueShrinkage);
    const b = scoreFor(teamBOffense, teamADefense, defenseBaseline, defenseWeight, leagueShrinkage);
    const total = round(a.expectedRegulationPoints + b.expectedRegulationPoints);
    scenarios.push(Object.freeze({
      id,
      status: 'available',
      teamA: a,
      teamB: b,
      totalExpectedRegulationPoints: total,
      deltaFromSelected: Object.freeze({ teamA: round(a.expectedRegulationPoints - selectedAInput.expectedRegulationPoints),
        teamB: round(b.expectedRegulationPoints - selectedBInput.expectedRegulationPoints), total: round(total - selectedTotal) }),
      assumptions: Object.freeze({ defenseWeight, defenseBaseline: baselineLabel, leagueShrinkage }),
    }));
  };
  addScenario({ id: 'no-opponent-defense-adjustment-v1', defenseWeight: 0 });
  addScenario({ id: 'half-opponent-defense-adjustment-v1', defenseWeight: 0.5 });
  addScenario({ id: 'selected-full-opponent-defense-adjustment-v1' });
  addScenario({ id: 'amplified-opponent-defense-adjustment-v1', defenseWeight: 1.5 });
  addScenario({ id: 'median-league-defense-baseline-v1', defenseBaseline: league.defenseMedian, baselineLabel: 'equal-team-median' });
  addScenario({ id: '25-percent-league-offense-shrinkage-v1', leagueShrinkage: 0.25 });
  addScenario({ id: '50-percent-league-offense-shrinkage-v1', leagueShrinkage: 0.5 });

  return frozen({
    format: 'swishiq-v4-game-score-input-v1',
    status: 'available',
    use: 'descriptive-regulation-score-input-only',
    interpretation: 'scenario-derived score inputs from observed ratings and observed-rate possessions; not a game forecast, simulation result, predictive validation, or calibrated output',
    season: Object.freeze({ ...teamPriors.season }),
    package: Object.freeze({ ...teamPriors.package }),
    sourceHashes: Object.freeze({ advancedArtifactId: advancedArtifact.artifactId,
      advancedArtifactSha256, packageManifestSha256: teamPriors.package.packageManifestSha256,
      packageContentSha256: teamPriors.package.contentSha256, sourceLockSha256: teamPriors.package.sourceLockSha256 }),
    observedRatings: Object.freeze({
      teamA: Object.freeze({ offense: teamAOffense, defense: teamADefense }),
      teamB: Object.freeze({ offense: teamBOffense, defense: teamBDefense }),
    }),
    leagueBaseline: league,
    possessionInput: Object.freeze({ expectedRegulationPossessions: possessions,
      unit: possessionInput.unit, sourceFormat: possessionInput.format,
      selectedFormulaId: possessionInput.selectedFormula.id }),
    selectedFormula: Object.freeze({
      id: 'same-season-rating-plus-opponent-defense-v1',
      expectedRating: 'leagueOffenseMean + (teamOFF_RATING - leagueOffenseMean) + 1.0 * (opponentDEF_RATING - leagueDefenseMean)',
      expectedPoints: 'expectedOffensiveRating * expectedRegulationPossessions / 100',
      units: Object.freeze({ ratings: 'points-per-100-possessions', possessions: 'possessions-per-team-in-48-minute-regulation',
        points: 'expected-regulation-points-input' }),
      weights: Object.freeze({ teamOffenseAdjustment: 1, opponentDefenseAdjustment: 1, leagueOffenseShrinkage: 0 }),
      overtimeIncluded: false,
    }),
    selected: Object.freeze({
      teamA: Object.freeze({ expectedOffensiveRating: selectedAInput.expectedOffensiveRating,
        expectedRegulationPoints: selectedAInput.expectedRegulationPoints }),
      teamB: Object.freeze({ expectedOffensiveRating: selectedBInput.expectedOffensiveRating,
        expectedRegulationPoints: selectedBInput.expectedRegulationPoints }),
      totalExpectedRegulationPoints: selectedTotal,
    }),
    scenarioSensitivity: Object.freeze(scenarios),
    support: Object.freeze({ completeExactSeasonRatings: true, directObservedRatingCountPerMetric: NBA_TEAM_COUNT,
      pooledSubstitution: false, possessionInputMatchesSeasonPackageAndTeamOrder: true }),
    unsupportedComponents: Object.freeze(['overtime scoring', 'free-throw or shot-profile effects',
      'lineup and availability adjustments', 'home-court adjustment', 'game-level calibration']),
  });
}
