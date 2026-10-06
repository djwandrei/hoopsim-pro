const POSITION_ORDER = Object.freeze(["C", "F", "G"]);
const POSITION_SET = new Set(POSITION_ORDER);
const SUPPORTED_METRICS_VERSIONS = new Set(["swishiq-v3-metrics-v1.1", "swishiq-v3-metrics-v1.2"]);
const TEAM_CODE = /^[A-Z]{3}$/;
const HASH = /^[a-f0-9]{64}$/i;
const PLAYER_REF = /^p_[a-f0-9]{32}$/;

export const POSITION_LENS_COLUMNS = Object.freeze([
  Object.freeze({ key: "name", label: "Player", kind: "text" }),
  Object.freeze({ key: "position", label: "Position assignment", kind: "text" }),
  Object.freeze({ key: "games", label: "GP", kind: "number" }),
  Object.freeze({ key: "minutes", label: "Minutes", kind: "number" }),
  Object.freeze({ key: "points", label: "PTS", kind: "number" }),
  Object.freeze({ key: "rebounds", label: "REB", kind: "number" }),
  Object.freeze({ key: "assists", label: "AST", kind: "number" }),
]);

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function dataNeeded(reason, source = null) {
  return Object.freeze({ status: "data-needed", reason, source });
}

function availableCapability(owner, capability, artifactId) {
  const descriptor = owner?.capabilities?.[capability];
  return descriptor?.status === "available"
    && Array.isArray(descriptor.artifactIds)
    && descriptor.artifactIds.includes(artifactId);
}

function descriptorFor(proof, artifactId) {
  return proof?.index?.artifacts?.find((item) => item.artifactId === artifactId) || null;
}

function sourceFor(proof) {
  const playerArtifact = descriptorFor(proof, "player-seasons");
  const rosterArtifact = descriptorFor(proof, "roster-memberships");
  const pkg = proof?.package || {};
  return Object.freeze({
    seasonStartYear: pkg.scope?.seasonStartYear ?? null,
    seasonEndYear: pkg.scope?.seasonEndYear ?? null,
    packageId: pkg.packageId || null,
    packageVersion: pkg.packageVersion || null,
    modelId: pkg.modelId || null,
    normalizer: pkg.normalizer || null,
    metricsVersion: pkg.metricsVersion || null,
    packageManifestSha256: pkg.packageManifestSha256 || null,
    sourceLockSha256: pkg.sourceLockSha256 || null,
    registryRevisionSha256: proof?.registry?.registryRevisionSha256 || null,
    artifacts: Object.freeze([playerArtifact, rosterArtifact].filter(Boolean).map((artifact) => Object.freeze({
      artifactId: artifact.artifactId,
      kind: artifact.kind,
      path: artifact.path,
      bytes: artifact.bytes,
      rows: artifact.rows,
      sha256: artifact.sha256,
    }))),
  });
}

function positionKey(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > POSITION_ORDER.length) return null;
  const positions = value.map((position) => String(position || "").trim().toUpperCase());
  if (positions.some((position) => !POSITION_SET.has(position)) || new Set(positions).size !== positions.length) return null;
  return POSITION_ORDER.filter((position) => positions.includes(position)).join(", ");
}

export function positionAssignmentLabel(positions) {
  return positionKey(positions) || "Unavailable";
}

function normalizedPartMatches(part, proof, artifactId, kind, startYear, endYear) {
  const pkg = proof?.package;
  return isObject(part)
    && part.format === "djhc-swishiq-public-projection-part-v1"
    && part.artifactId === artifactId
    && part.kind === kind
    && part.packageId === pkg.packageId
    && part.packageVersion === pkg.packageVersion
    && part.packageManifestSha256 === pkg.packageManifestSha256
    && part.sourceLockSha256 === pkg.sourceLockSha256
    && part.modelId === pkg.modelId
    && part.normalizer === pkg.normalizer
    && part.metricsVersion === pkg.metricsVersion
    && part.scope?.kind === "exact-season"
    && part.scope?.seasonStartYear === startYear
    && part.scope?.seasonEndYear === endYear
    && Array.isArray(part.records);
}

function rowIdentity(row) {
  return [row.playerRef, row.teamCode, row.seasonStartYear, row.phase].join("|");
}

function validNullableNumber(value) {
  return value === null || (typeof value === "number" && Number.isFinite(value) && value >= 0);
}

function normalizeObservedRow(row, membership, startYear) {
  const positions = positionKey(row.positions);
  const membershipPositions = positionKey(membership.positions);
  const name = typeof row.displayName === "string" ? row.displayName.trim() : "";
  const membershipName = typeof membership.displayName === "string" ? membership.displayName.trim() : "";
  if (!PLAYER_REF.test(String(row.playerRef || ""))
    || row.playerRef !== membership.playerRef
    || row.teamCode !== membership.teamCode
    || row.seasonStartYear !== startYear
    || row.phase !== "regular"
    || row.observed !== true
    || !positions
    || positions !== membershipPositions
    || !name
    || name !== membershipName
    || !Number.isSafeInteger(row.games)
    || row.games < 0
    || !validNullableNumber(row.minutes)
    || !isObject(row.box)) {
    return null;
  }
  const stats = {
    points: row.box.points,
    rebounds: row.box.rebounds,
    assists: row.box.assists,
  };
  if (Object.values(stats).some((value) => !validNullableNumber(value))) return null;
  return Object.freeze({
    playerRef: row.playerRef,
    displayName: name,
    teamCode: row.teamCode,
    seasonStartYear: row.seasonStartYear,
    phase: row.phase,
    positions: Object.freeze(POSITION_ORDER.filter((position) => positions.split(", ").includes(position))),
    positionKey: positions,
    observed: true,
    games: row.games,
    minutes: row.minutes,
    points: stats.points,
    rebounds: stats.rebounds,
    assists: stats.assists,
  });
}

/**
 * Admit only exact-team-season roster rows with a matching observed regular-
 * season player row from the same hash-verified package. No profile position,
 * neighboring season, or model-derived fit score can enter this dataset.
 */
export function preparePositionLensDataset(proof, playerPart, rosterPart, requestedSeasonEndYear) {
  const source = sourceFor(proof);
  const pkg = proof?.package;
  const scope = pkg?.scope;
  const endYear = Number(requestedSeasonEndYear);
  const startYear = endYear - 1;

  if (!Number.isInteger(endYear) || endYear < 1949 || endYear > 2200
    || proof?.request?.seasonEndYear !== endYear
    || proof?.request?.phase !== "regular"
    || scope?.kind !== "exact-season"
    || scope?.seasonStartYear !== startYear
    || scope?.seasonEndYear !== endYear
    || !Array.isArray(scope.seasonStartYears)
    || scope.seasonStartYears.length !== 1
    || scope.seasonStartYears[0] !== startYear
    || !Array.isArray(scope.phases)
    || !scope.phases.includes("regular")) {
    return dataNeeded("Choose one verified exact regular season. Pooled and neighboring seasons are not accepted.", source);
  }

  if (pkg?.format !== "djhc-swishiq-package-v3"
    || pkg.status !== "published"
    || !/^nba-swishiq-v3-\d{4}-\d{2}$/.test(String(pkg.packageId || ""))
    || !/^v3-\d{4}-\d{2}-[a-f0-9]{12}$/i.test(String(pkg.packageVersion || ""))
    || pkg.modelId !== "swishiq-v3"
    || pkg.normalizer !== "swishiq-v3-canonical-normalizer"
    || !SUPPORTED_METRICS_VERSIONS.has(pkg.metricsVersion)
    || !HASH.test(String(pkg.packageManifestSha256 || ""))
    || !HASH.test(String(pkg.sourceLockSha256 || ""))) {
    return dataNeeded("The selected package does not meet the published SwishIQ V3 contract.", source);
  }

  const requiredArtifactIds = ["player-seasons", "roster-memberships"];
  if (requiredArtifactIds.some((artifactId) => !availableCapability(pkg, "historicalSeason", artifactId)
    || !availableCapability(proof?.index, "historicalSeason", artifactId))) {
    return dataNeeded("This exact package does not publish both player-season and roster membership evidence under its historical-season capability.", source);
  }

  const playerArtifact = descriptorFor(proof, "player-seasons");
  const rosterArtifact = descriptorFor(proof, "roster-memberships");
  if (!playerArtifact || playerArtifact.kind !== "player-seasons"
    || !rosterArtifact || rosterArtifact.kind !== "roster-memberships"
    || !HASH.test(String(playerArtifact.sha256 || ""))
    || !HASH.test(String(rosterArtifact.sha256 || ""))
    || !HASH.test(String(proof?.registry?.registryRevisionSha256 || ""))) {
    return dataNeeded("The exact package does not contain complete provenance for both required public artifacts.", source);
  }

  if (!normalizedPartMatches(playerPart, proof, "player-seasons", "player-seasons", startYear, endYear)
    || !normalizedPartMatches(rosterPart, proof, "roster-memberships", "roster-memberships", startYear, endYear)) {
    return dataNeeded("The player-season or roster artifact does not match the selected exact-season package pins.", source);
  }

  const seasonRows = playerPart.records.filter((row) => row?.seasonStartYear === startYear && row?.phase === "regular");
  const rosterRows = rosterPart.records.filter((row) => row?.seasonStartYear === startYear && row?.phase === "regular");
  const seasonByIdentity = new Map();
  for (const row of seasonRows) {
    if (!TEAM_CODE.test(String(row?.teamCode || ""))) return dataNeeded("A regular-season player row contains an invalid team code.", source);
    const identity = rowIdentity(row);
    if (seasonByIdentity.has(identity)) return dataNeeded("The exact package repeats a regular-season player/team row.", source);
    seasonByIdentity.set(identity, row);
  }

  const membershipByIdentity = new Map();
  for (const row of rosterRows) {
    if (row?.displayEligible !== true && row?.displayEligible !== false) {
      return dataNeeded("A roster membership is missing its published display-eligibility flag.", source);
    }
    if (!TEAM_CODE.test(String(row?.teamCode || "")) || !positionKey(row?.positions)) {
      return dataNeeded("A regular-season roster row contains an unsupported team or position assignment.", source);
    }
    const identity = rowIdentity(row);
    if (membershipByIdentity.has(identity)) return dataNeeded("The exact package repeats a regular-season roster membership.", source);
    membershipByIdentity.set(identity, row);
  }

  const eligibleMemberships = [...membershipByIdentity.values()].filter((row) => row.displayEligible === true);
  if (!eligibleMemberships.length) return dataNeeded("The exact package contains no display-eligible regular-season roster memberships.", source);

  const rows = [];
  const matchedIdentities = new Set();
  for (const membership of eligibleMemberships) {
    const identity = rowIdentity(membership);
    const seasonRow = seasonByIdentity.get(identity);
    const normalized = seasonRow && normalizeObservedRow(seasonRow, membership, startYear);
    if (!normalized) return dataNeeded("An eligible roster membership lacks a matching observed player-season row with the same exact position assignment.", source);
    matchedIdentities.add(identity);
    rows.push(normalized);
  }
  if (seasonRows.some((row) => row?.observed === true && !matchedIdentities.has(rowIdentity(row)))) {
    return dataNeeded("An observed player-season row is not bound to a display-eligible exact-season roster membership.", source);
  }

  const teams = [...new Set(rows.map((row) => row.teamCode))].sort();
  return Object.freeze({
    status: "ready",
    source,
    seasonStartYear: startYear,
    seasonEndYear: endYear,
    phase: "regular",
    teams: Object.freeze(teams),
    rosterCount: rows.length,
    rows: Object.freeze(rows.sort((left, right) => left.teamCode.localeCompare(right.teamCode)
      || left.displayName.localeCompare(right.displayName)
      || left.playerRef.localeCompare(right.playerRef))),
    evidenceKind: "observed",
    positionEvidence: "published-season-specific-position-assignment",
    modeledFitStatus: "not-produced",
    hypotheticalStatus: "not-produced",
  });
}

/**
 * Admit an exact V4 playerContext response without translating it into the V3
 * projection proof shape. This route is descriptive only and joins season
 * totals to roster positions by stable player/team/season/phase identity.
 */
export function prepareCanonicalV4PositionLensDataset(data, requestedSeasonEndYear) {
  const endYear = Number(requestedSeasonEndYear);
  const startYear = endYear - 1;
  const pkg = data?.package || {};
  const scope = data?.scope;
  const source = Object.freeze({
    generation: "V4",
    seasonStartYear: startYear,
    seasonEndYear: endYear,
    releaseId: data?.source?.releaseId || null,
    registrySha256: data?.source?.registrySha256 || null,
    registryRevisionSha256: data?.source?.registryRevisionSha256 || null,
    packageId: pkg.packageId || null,
    packageVersion: pkg.packageVersion || null,
    packageManifestSha256: pkg.packageManifestSha256 || null,
    sourceLockSha256: pkg.sourceLockSha256 || null,
    capabilityId: data?.capabilityId || null,
    scope,
    artifacts: Object.freeze(["player-seasons", "roster-memberships"].flatMap((id) => {
      const part = data?.parts?.[id];
      return part ? [Object.freeze({ artifactId: id, path: part.path || null, bytes: part.bytes ?? null, rows: part.rows ?? null, sha256: part.sha256 || null, sourceScope: part.scope || null })] : [];
    })),
  });
  if (!Number.isInteger(endYear) || endYear < 2018 || endYear > 2026
    || data?.status !== "verified-data-access"
    || data?.capabilityId !== "franchiseInputs"
    || !data?.supplementalArtifactIds?.includes("player-seasons")
    || scope?.kind !== "exact-season"
    || !Array.isArray(scope.seasonStartYears)
    || scope.seasonStartYears.length !== 1
    || scope.seasonStartYears[0] !== startYear
    || !Array.isArray(scope.phases)
    || scope.phases.length !== 1
    || scope.phases[0] !== "regular") {
    return dataNeeded("Choose one verified exact V4 regular season. Pooled, neighboring seasons, and other phases are not accepted.", source);
  }

  const playerPart = data.parts?.["player-seasons"];
  const rosterPart = data.parts?.["roster-memberships"];
  const packageScope = pkg.scope;
  const partScopeMatchesPackage = (partScope) => isObject(partScope)
    && partScope.kind === "exact-season"
    && Array.isArray(partScope.seasonStartYears)
    && partScope.seasonStartYears.length === 1
    && partScope.seasonStartYears[0] === startYear
    && partScope.seasonStartYear === startYear
    && partScope.seasonEndYear === endYear
    && Array.isArray(partScope.phases)
    && partScope.phases.includes("regular")
    && packageScope?.kind === "exact-season"
    && Array.isArray(packageScope.seasonStartYears)
    && packageScope.seasonStartYears.length === 1
    && packageScope.seasonStartYears[0] === startYear
    && packageScope.seasonStartYear === startYear
    && packageScope.seasonEndYear === endYear
    && Array.isArray(packageScope.phases)
    && partScope.phases.length === packageScope.phases.length
    && partScope.phases.every((phase, index) => phase === packageScope.phases[index]);
  const partMatches = (part, artifactId) => isObject(part)
    && part.format === "djhc-swishiq-v4-verified-public-part-v1"
    && part.status === "verified"
    && part.artifactId === artifactId
    && part.package?.packageId === pkg.packageId
    && part.package?.packageVersion === pkg.packageVersion
    && partScopeMatchesPackage(part.scope)
    && Array.isArray(part.records);
  if (!partMatches(playerPart, "player-seasons") || !partMatches(rosterPart, "roster-memberships")) {
    return dataNeeded("The V4 player-season and roster parts are incomplete or do not match the same exact package and scope.", source);
  }

  const seasonRows = playerPart.records.filter((record) => record?.time?.seasonStartYear === startYear && record?.time?.phase === "regular");
  const rosterRows = rosterPart.records.filter((record) => record?.time?.seasonStartYear === startYear && record?.time?.phase === "regular");
  const valuesOf = (record) => record?.values || {};
  const playerRefOf = (record) => record?.entities?.playerRef || valuesOf(record).playerRef || null;
  const teamCodeOf = (record) => record?.entities?.teamCode || valuesOf(record).teamCode || valuesOf(record).team || null;
  const identityOf = (record) => [playerRefOf(record), teamCodeOf(record), record?.time?.seasonStartYear, record?.time?.phase].join("|");
  const seasonByIdentity = new Map();
  for (const record of seasonRows) {
    if (!TEAM_CODE.test(String(teamCodeOf(record) || "")) || !PLAYER_REF.test(String(playerRefOf(record) || ""))) {
      return dataNeeded("A V4 player-season row lacks a canonical player or team identity.", source);
    }
    const key = identityOf(record);
    if (seasonByIdentity.has(key)) return dataNeeded("The V4 package repeats a regular-season player/team row.", source);
    seasonByIdentity.set(key, record);
  }

  const memberships = new Map();
  for (const record of rosterRows) {
    const values = valuesOf(record);
    if (record?.evidence?.status !== "available" || (values.displayEligible !== true && values.displayEligible !== false)) {
      return dataNeeded("A V4 roster membership is held or missing its published display-eligibility flag.", source);
    }
    if (!TEAM_CODE.test(String(teamCodeOf(record) || ""))
      || !PLAYER_REF.test(String(playerRefOf(record) || ""))
      || !positionKey(values.positions)) {
      return dataNeeded("A V4 regular-season roster row has an unsupported team, player identity, or position assignment.", source);
    }
    const key = identityOf(record);
    if (memberships.has(key)) return dataNeeded("The V4 package repeats a regular-season roster membership.", source);
    memberships.set(key, record);
  }
  const eligibleMemberships = [...memberships.entries()].filter(([, record]) => valuesOf(record).displayEligible === true);
  if (!eligibleMemberships.length) return dataNeeded("The V4 package contains no display-eligible regular-season roster memberships.", source);

  const rows = [];
  const matched = new Set();
  for (const [key, membership] of eligibleMemberships) {
    const seasonRecord = seasonByIdentity.get(key);
    const row = valuesOf(seasonRecord);
    const membershipValues = valuesOf(membership);
    const positions = positionKey(row.positions);
    const membershipPositions = positionKey(membershipValues.positions);
    const displayName = typeof row.displayName === "string" ? row.displayName.trim() : "";
    const membershipName = typeof membershipValues.displayName === "string" ? membershipValues.displayName.trim() : "";
    const box = row.box;
    const validCount = (value) => Number.isSafeInteger(value) && value >= 0;
    const validNullable = (value) => value === null || (typeof value === "number" && Number.isFinite(value) && value >= 0);
    if (!seasonRecord || seasonRecord?.evidence?.status !== "available" || row.observed !== true
      || !positions || positions !== membershipPositions
      || !displayName || displayName !== membershipName
      || !validCount(row.games) || !validNullable(row.minutes)
      || !isObject(box)
      || !validNullable(box.points) || !validNullable(box.rebounds) || !validNullable(box.assists)) {
      return dataNeeded("An eligible V4 roster row lacks matching observed totals with the same identity, exact position assignment, and valid box values.", source);
    }
    matched.add(key);
    rows.push(Object.freeze({
      playerRef: playerRefOf(seasonRecord),
      displayName,
      teamCode: teamCodeOf(seasonRecord),
      seasonStartYear: startYear,
      phase: "regular",
      positions: Object.freeze(POSITION_ORDER.filter((position) => positions.split(", ").includes(position))),
      positionKey: positions,
      observed: true,
      games: row.games,
      minutes: row.minutes,
      points: box.points,
      rebounds: box.rebounds,
      assists: box.assists,
    }));
  }
  if (seasonRows.some((record) => record?.evidence?.status === "available" && valuesOf(record).observed === true && !matched.has(identityOf(record)))) {
    return dataNeeded("An observed V4 player-season row is not bound to a display-eligible roster membership in the same package.", source);
  }
  const teams = [...new Set(rows.map((row) => row.teamCode))].sort();
  return Object.freeze({
    status: "ready",
    source,
    seasonStartYear: startYear,
    seasonEndYear: endYear,
    phase: "regular",
    teams: Object.freeze(teams),
    rosterCount: rows.length,
    rows: Object.freeze(rows.sort((left, right) => left.teamCode.localeCompare(right.teamCode)
      || left.displayName.localeCompare(right.displayName)
      || left.playerRef.localeCompare(right.playerRef))),
    evidenceKind: "observed",
    positionEvidence: "v4-exact-season-roster-membership",
    modeledFitStatus: "not-produced",
    hypotheticalStatus: "not-produced",
  });
}

function normalizedSearch(value) {
  return String(value || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

export function filterPositionLensRows(dataset, { teamCode = "", positionKey: selectedPosition = "", search = "" } = {}) {
  if (dataset?.status !== "ready") return Object.freeze([]);
  const team = String(teamCode || "").trim().toUpperCase();
  const position = String(selectedPosition || "").trim();
  const query = normalizedSearch(search);
  return Object.freeze(dataset.rows.filter((row) => (
    (!team || row.teamCode === team)
    && (!position || row.positionKey === position)
    && (!query || normalizedSearch(row.displayName).includes(query))
  )));
}

export function sortPositionLensRows(rows, sortKey = "points", direction = "desc") {
  const column = POSITION_LENS_COLUMNS.find((item) => item.key === sortKey);
  if (!column) throw new TypeError("Unsupported Position Lens sort column.");
  const sign = direction === "asc" ? 1 : -1;
  return Object.freeze([...rows].sort((left, right) => {
    const a = column.key === "name" ? left.displayName : column.key === "position" ? left.positionKey : left[column.key];
    const b = column.key === "name" ? right.displayName : column.key === "position" ? right.positionKey : right[column.key];
    const aMissing = a === null || a === undefined || a === "";
    const bMissing = b === null || b === undefined || b === "";
    if (aMissing !== bMissing) return aMissing ? 1 : -1;
    if (!aMissing) {
      const compared = column.kind === "number"
        ? Number(a) - Number(b)
        : String(a).localeCompare(String(b), "en", { sensitivity: "base" });
      if (compared !== 0) return compared * sign;
    }
    return left.displayName.localeCompare(right.displayName, "en", { sensitivity: "base" })
      || left.playerRef.localeCompare(right.playerRef);
  }));
}

function sumField(rows, key) {
  const values = rows.map((row) => row[key]);
  if (values.some((value) => typeof value !== "number" || !Number.isFinite(value))) return null;
  return values.reduce((total, value) => total + value, 0);
}

export function summarizePositionAssignments(rows = []) {
  const groups = new Map();
  for (const row of rows) {
    if (!row?.positionKey) continue;
    if (!groups.has(row.positionKey)) groups.set(row.positionKey, []);
    groups.get(row.positionKey).push(row);
  }
  return Object.freeze([...groups.entries()].sort(([left], [right]) => left.localeCompare(right, "en"))
    .map(([position, members]) => Object.freeze({
      position,
      rosterMembers: members.length,
      minutes: sumField(members, "minutes"),
      points: sumField(members, "points"),
    })));
}
