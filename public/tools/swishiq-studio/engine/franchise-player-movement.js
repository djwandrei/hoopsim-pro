const HASH = /^[a-f0-9]{64}$/i;
const TEAM_CODE = /^[A-Z]{3}$/;
const PLAYER_REF = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
const SAFE_REF = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;

export const FRANCHISE_PLAYER_MOVEMENT_VERSION = 'swishiq-franchise-player-movement-v1';

function fail(message) { throw new Error(message); }
function object(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function clean(value, max = 160) { return typeof value === 'string' ? value.trim().slice(0, max) : ''; }
function validSeason(value) { return Number.isInteger(Number(value)) && Number(value) >= 1947 && Number(value) <= 2200; }
function sortedUnique(values) { return [...new Set(values)].sort((a, b) => a.localeCompare(b)); }

function packageSource(snapshot, role) {
  const packageRef = snapshot.packageRef;
  if (!object(packageRef)) fail(`${role} roster data needs its accepted package reference.`);
  const { packageId, packageVersion, packageManifestSha256, sourceLockSha256, scope } = packageRef;
  if (!SAFE_REF.test(clean(packageId)) || !SAFE_REF.test(clean(packageVersion))
    || !HASH.test(clean(packageManifestSha256)) || !HASH.test(clean(sourceLockSha256))) {
    fail(`${role} roster data needs package, version, manifest, and source-lock pins.`);
  }
  if (!object(scope) || scope.kind !== 'exact-season'
    || !validSeason(scope.seasonStartYear)
    || Number(scope.seasonStartYear) !== Number(snapshot.seasonStartYear)
    || !Array.isArray(scope.seasonStartYears)
    || scope.seasonStartYears.length !== 1
    || Number(scope.seasonStartYears[0]) !== Number(snapshot.seasonStartYear)) {
    fail(`${role} roster data must be pinned to one matching exact season; pooled packages cannot establish exact movement.`);
  }
  if (snapshot.accepted !== true) fail(`${role} roster data has not been accepted by the package resolver.`);
  return {
    packageId: clean(packageId), packageVersion: clean(packageVersion),
    packageManifestSha256: clean(packageManifestSha256).toLowerCase(),
    sourceLockSha256: clean(sourceLockSha256).toLowerCase(),
    scope: { kind: 'exact-season', seasonStartYear: Number(scope.seasonStartYear), seasonStartYears: [Number(scope.seasonStartYear)] },
  };
}

function artifactSource(artifact, role, expectedKind = null) {
  if (!object(artifact)) fail(`${role} roster data needs an artifact receipt.`);
  const artifactId = clean(artifact.artifactId, 80);
  const kind = clean(artifact.kind, 80);
  if (!SAFE_REF.test(artifactId) || !SAFE_REF.test(kind) || !HASH.test(clean(artifact.sha256))) {
    fail(`${role} roster artifact receipt is missing its ID, kind, or SHA-256.`);
  }
  if (expectedKind && kind !== expectedKind) fail(`${role} roster artifact must be ${expectedKind}.`);
  return { artifactId, kind, sha256: clean(artifact.sha256).toLowerCase(), rows: Number.isInteger(artifact.rows) ? artifact.rows : null };
}

function snapshotRoster(snapshot, role) {
  if (!object(snapshot) || snapshot.snapshotKind !== 'complete-exact-roster'
    || snapshot.complete !== true || !validSeason(snapshot.seasonStartYear)) {
    fail(`${role} must be a complete exact-season roster snapshot.`);
  }
  if (!['postseason-close', 'season-opening'].includes(snapshot.asOf)) {
    fail(`${role} roster snapshot needs an explicit postseason-close or season-opening point.`);
  }
  const packageRef = packageSource(snapshot, role);
  const artifact = artifactSource(snapshot.artifact, role, 'roster-snapshot');
  if (!Array.isArray(snapshot.teams) || snapshot.teams.length < 2) fail(`${role} snapshot needs its complete team roster list.`);
  const teamRows = [];
  const teamCodes = new Set();
  const playerTeams = new Map();
  for (const team of snapshot.teams) {
    const teamCode = clean(team?.teamCode, 8).toUpperCase();
    if (!TEAM_CODE.test(teamCode) || teamCodes.has(teamCode)) fail(`${role} snapshot has an invalid or repeated team code.`);
    teamCodes.add(teamCode);
    const sourcePlayers = Array.isArray(team?.players) ? team.players : null;
    if (!sourcePlayers) fail(`${role} snapshot team ${teamCode} needs a players array.`);
    const players = [];
    const seen = new Set();
    for (const row of sourcePlayers) {
      const playerRef = clean(row?.playerRef);
      const displayName = clean(row?.displayName || row?.playerName, 160);
      if (!PLAYER_REF.test(playerRef) || !displayName || seen.has(playerRef)) {
        fail(`${role} snapshot team ${teamCode} has an invalid or repeated player reference.`);
      }
      if (playerTeams.has(playerRef)) fail(`${role} full-roster snapshot places one player on multiple teams.`);
      seen.add(playerRef);
      playerTeams.set(playerRef, teamCode);
      players.push({ playerRef, displayName });
    }
    players.sort((a, b) => a.playerRef.localeCompare(b.playerRef));
    teamRows.push({ teamCode, players });
  }
  if (artifact.rows !== null && artifact.rows !== playerTeams.size) fail(`${role} roster snapshot row count does not match its receipt.`);
  teamRows.sort((a, b) => a.teamCode.localeCompare(b.teamCode));
  return {
    seasonStartYear: Number(snapshot.seasonStartYear), asOf: snapshot.asOf,
    packageRef, artifact, teamRows, teamCodes: [...teamCodes].sort(), playerTeams,
  };
}

function compareTeamCoverage(previous, next, expectedTeamCodes = null) {
  const priorTeams = previous.teamCodes;
  const nextTeams = next.teamCodes;
  if (priorTeams.length !== nextTeams.length || priorTeams.some((team, index) => team !== nextTeams[index])) {
    fail('Exact roster transition requires both snapshots to cover the same team universe.');
  }
  if (expectedTeamCodes) {
    if (!Array.isArray(expectedTeamCodes)) fail('The declared league team set must be an array of team codes.');
    const expected = sortedUnique(expectedTeamCodes.map(team => clean(team, 8).toUpperCase()));
    if (expected.length !== priorTeams.length || expected.some((team, index) => team !== priorTeams[index])) {
      fail('Exact roster snapshots do not match the caller’s declared league team set.');
    }
  }
}

function membershipPart(part, role) {
  if (!object(part) || part.accepted !== true || !Array.isArray(part.records)) {
    fail(`${role} needs records from an accepted roster-memberships artifact.`);
  }
  const packageRef = packageSource(part, role);
  const artifact = artifactSource(part.artifact, role, 'roster-memberships');
  const year = Number(part.seasonStartYear);
  if (!validSeason(year) || year !== packageRef.scope.seasonStartYear) fail(`${role} membership rows need the exact package season.`);
  const teamsByPlayer = new Map();
  const teams = new Set();
  for (const record of part.records) {
    if (!object(record) || Number(record.seasonStartYear) !== year) fail(`${role} membership row is outside its exact-season pin.`);
    const phase = clean(record.phase).toLowerCase();
    if (!['regular', 'in_season_tournament', 'play_in', 'playoffs'].includes(phase)) fail(`${role} membership row has an unsupported phase.`);
    if (phase !== 'regular') continue;
    const playerRef = clean(record.playerRef);
    const teamCode = clean(record.teamCode, 8).toUpperCase();
    if (!PLAYER_REF.test(playerRef) || !TEAM_CODE.test(teamCode)) fail(`${role} contains a malformed regular-season roster membership.`);
    teams.add(teamCode);
    const playerTeams = teamsByPlayer.get(playerRef) || new Set();
    playerTeams.add(teamCode);
    teamsByPlayer.set(playerRef, playerTeams);
  }
  if (artifact.rows !== null && artifact.rows !== part.records.length) fail(`${role} membership artifact row count does not match its receipt.`);
  if (teams.size < 2 || !teamsByPlayer.size) fail(`${role} artifact has insufficient regular-season team coverage.`);
  return { year, packageRef, artifact, teams: [...teams].sort(), teamsByPlayer };
}

function membershipSetDelta(previous, next) {
  const allPlayers = sortedUnique([...previous.teamsByPlayer.keys(), ...next.teamsByPlayer.keys()]);
  const changes = [];
  let addedAssociations = 0;
  let removedAssociations = 0;
  for (const playerRef of allPlayers) {
    const before = [...(previous.teamsByPlayer.get(playerRef) || [])].sort();
    const after = [...(next.teamsByPlayer.get(playerRef) || [])].sort();
    const addedTeamCodes = after.filter(team => !before.includes(team));
    const removedTeamCodes = before.filter(team => !after.includes(team));
    if (!addedTeamCodes.length && !removedTeamCodes.length) continue;
    addedAssociations += addedTeamCodes.length;
    removedAssociations += removedTeamCodes.length;
    changes.push({ playerRef, previousTeamCodes: before, nextTeamCodes: after, addedTeamCodes, removedTeamCodes });
  }
  return { changes, addedAssociations, removedAssociations };
}

/**
 * Reconciles two accepted, complete roster snapshots at postseason close and
 * the following season opening. It reports observed membership changes only;
 * the cause of a change is deliberately left unknown.
 */
export function reconcileExactRosterTransition({ previousSnapshot, nextSnapshot, expectedTeamCodes = null } = {}) {
  const previous = snapshotRoster(previousSnapshot, 'Previous');
  const next = snapshotRoster(nextSnapshot, 'Next');
  if (previous.asOf !== 'postseason-close' || next.asOf !== 'season-opening') {
    fail('Offseason reconciliation needs a postseason-close snapshot followed by a season-opening snapshot.');
  }
  if (next.seasonStartYear !== previous.seasonStartYear + 1) fail('Offseason roster snapshots must cover consecutive NBA seasons.');
  compareTeamCoverage(previous, next, expectedTeamCodes);

  const playerRefs = sortedUnique([...previous.playerTeams.keys(), ...next.playerTeams.keys()]);
  const changes = [];
  const counts = { retained: 0, teamChanged: 0, absentFromNext: 0, newlyPresent: 0 };
  for (const playerRef of playerRefs) {
    const previousTeamCode = previous.playerTeams.get(playerRef) || null;
    const nextTeamCode = next.playerTeams.get(playerRef) || null;
    if (previousTeamCode === nextTeamCode) { counts.retained += 1; continue; }
    const previousName = previous.teamRows.flatMap(team => team.players).find(player => player.playerRef === playerRef)?.displayName || null;
    const nextName = next.teamRows.flatMap(team => team.players).find(player => player.playerRef === playerRef)?.displayName || null;
    const classification = previousTeamCode && nextTeamCode ? 'team-membership-changed'
      : previousTeamCode ? 'absent-from-next-snapshot' : 'newly-present-in-next-snapshot';
    if (classification === 'team-membership-changed') counts.teamChanged += 1;
    else if (classification === 'absent-from-next-snapshot') counts.absentFromNext += 1;
    else counts.newlyPresent += 1;
    changes.push({ playerRef, displayName: nextName || previousName, previousTeamCode, nextTeamCode,
      classification, eventCause: 'unknown', eventType: null });
  }
  return {
    format: 'djhc-franchise-player-movement-receipt-v1',
    modelVersion: FRANCHISE_PLAYER_MOVEMENT_VERSION,
    mode: 'exact-roster-snapshot-reconciliation',
    previous: { seasonStartYear: previous.seasonStartYear, asOf: previous.asOf, packageRef: previous.packageRef, artifact: previous.artifact },
    next: { seasonStartYear: next.seasonStartYear, asOf: next.asOf, packageRef: next.packageRef, artifact: next.artifact },
    teamCodes: previous.teamCodes,
    counts,
    changes,
    disclosures: ['Roster membership is observed at the supplied boundary snapshots.',
      'A team change does not identify trade, free agency, draft, waiver, retirement, or any other cause.'],
    replay: { deterministic: true, seed: null },
  };
}

/**
 * Compares exact-season regular-season player/team membership parts. Package
 * rows establish regular-season associations, not full roster snapshots or
 * event dates, so these results must never be presented as offseason moves.
 */
export function compareExactSeasonMembershipParts({ previousPart, nextPart, expectedTeamCodes = null } = {}) {
  const previous = membershipPart(previousPart, 'Previous');
  const next = membershipPart(nextPart, 'Next');
  if (next.year !== previous.year + 1) fail('Membership comparison requires consecutive exact seasons.');
  if (previous.teams.length !== next.teams.length || previous.teams.some((team, index) => team !== next.teams[index])) {
    fail('Membership comparison requires the same represented team universe in both seasons.');
  }
  if (expectedTeamCodes) {
    if (!Array.isArray(expectedTeamCodes)) fail('The declared league team set must be an array of team codes.');
    const expected = sortedUnique(expectedTeamCodes.map(team => clean(team, 8).toUpperCase()));
    if (expected.length !== previous.teams.length || expected.some((team, index) => team !== previous.teams[index])) {
      fail('Membership artifacts do not match the caller’s declared league team set.');
    }
  }
  const delta = membershipSetDelta(previous, next);
  return {
    format: 'djhc-franchise-player-movement-receipt-v1',
    modelVersion: FRANCHISE_PLAYER_MOVEMENT_VERSION,
    mode: 'exact-season-membership-comparison',
    previous: { seasonStartYear: previous.year, packageRef: previous.packageRef, artifact: previous.artifact },
    next: { seasonStartYear: next.year, packageRef: next.packageRef, artifact: next.artifact },
    teamCodes: previous.teams,
    counts: { changedPlayerAssociations: delta.changes.length, addedTeamAssociations: delta.addedAssociations, removedTeamAssociations: delta.removedAssociations },
    changes: delta.changes,
    disclosures: ['All regular-season membership rows are included regardless of displayEligible; that flag gates impact display, not roster association.',
      'Package memberships do not establish a complete opening-day roster or transaction timing.',
      'Added or removed team associations do not identify trades, signings, draft selections, waivers, retirements, or other causes.'],
    replay: { deterministic: true, seed: null },
  };
}

function stableHash(text) {
  let value = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    value ^= text.charCodeAt(index);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

function seededRandom(seed) {
  let value = stableHash(seed) || 0x6d2b79f5;
  return () => {
    value = (value + 0x6d2b79f5) | 0;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Produces a deterministic scenario from explicit candidate player/destination
 * pairs. It does not invent players, transaction causes, retirements, or dates.
 */
export function createSeededMovementScenario({ seasonStartYear, teamRosters, candidates = [], movementCount = 0, seed } = {}) {
  if (!validSeason(seasonStartYear) || !Array.isArray(teamRosters) || teamRosters.length < 2) {
    fail('A movement scenario needs a season and an explicit starting roster for each team.');
  }
  const normalizedSeed = clean(seed, 128);
  if (!normalizedSeed) fail('A movement scenario needs an explicit replay seed.');
  if (!Number.isInteger(Number(movementCount)) || Number(movementCount) < 0) fail('Scenario movement count must be a nonnegative integer.');
  const teams = [];
  const codeSet = new Set();
  const playerTeam = new Map();
  for (const item of teamRosters) {
    const teamCode = clean(item?.teamCode, 8).toUpperCase();
    if (!TEAM_CODE.test(teamCode) || codeSet.has(teamCode) || !Array.isArray(item.playerRefs)) fail('Scenario rosters contain an invalid team or player list.');
    codeSet.add(teamCode);
    const playerRefs = item.playerRefs.map(value => clean(value));
    if (playerRefs.some(value => !PLAYER_REF.test(value)) || new Set(playerRefs).size !== playerRefs.length) fail(`Scenario roster ${teamCode} has invalid or repeated player references.`);
    for (const playerRef of playerRefs) {
      if (playerTeam.has(playerRef)) fail('A scenario player cannot start on multiple teams.');
      playerTeam.set(playerRef, teamCode);
    }
    teams.push({ teamCode, playerRefs: sortedUnique(playerRefs) });
  }
  teams.sort((a, b) => a.teamCode.localeCompare(b.teamCode));
  const candidateRows = candidates.map(row => {
    const playerRef = clean(row?.playerRef);
    const fromTeamCode = clean(row?.fromTeamCode, 8).toUpperCase();
    const targetTeamCodes = Array.isArray(row?.targetTeamCodes)
      ? sortedUnique(row.targetTeamCodes.map(value => clean(value, 8).toUpperCase())) : [];
    if (!PLAYER_REF.test(playerRef) || playerTeam.get(playerRef) !== fromTeamCode
      || targetTeamCodes.length === 0 || targetTeamCodes.some(team => !codeSet.has(team) || team === fromTeamCode)) {
      fail('Each scenario candidate must name a current player and explicit eligible destination teams.');
    }
    return { playerRef, fromTeamCode, targetTeamCodes };
  }).sort((a, b) => a.playerRef.localeCompare(b.playerRef));
  if (new Set(candidateRows.map(row => row.playerRef)).size !== candidateRows.length) fail('Scenario candidates must be unique by player.');
  if (Number(movementCount) > candidateRows.length) fail('Scenario movement count exceeds the explicit candidate pool.');

  const random = seededRandom(normalizedSeed);
  const available = [...candidateRows];
  const selected = [];
  for (let index = 0; index < Number(movementCount); index += 1) {
    const selectedIndex = Math.floor(random() * available.length);
    selected.push(available.splice(selectedIndex, 1)[0]);
  }
  const teamByCode = new Map(teams.map(team => [team.teamCode, team]));
  const moves = selected.map(row => {
    const toTeamCode = row.targetTeamCodes[Math.floor(random() * row.targetTeamCodes.length)];
    const from = teamByCode.get(row.fromTeamCode);
    const to = teamByCode.get(toTeamCode);
    from.playerRefs = from.playerRefs.filter(playerRef => playerRef !== row.playerRef);
    to.playerRefs.push(row.playerRef);
    to.playerRefs.sort((a, b) => a.localeCompare(b));
    playerTeam.set(row.playerRef, toTeamCode);
    return { playerRef: row.playerRef, fromTeamCode: row.fromTeamCode, toTeamCode, classification: 'scenario-membership-assignment', eventCause: 'not-modeled' };
  });
  const candidateFingerprint = stableHash(JSON.stringify(candidateRows)).toString(16).padStart(8, '0');
  return {
    format: 'djhc-franchise-player-movement-receipt-v1',
    modelVersion: FRANCHISE_PLAYER_MOVEMENT_VERSION,
    mode: 'seeded-player-movement-scenario',
    seasonStartYear: Number(seasonStartYear), nextSeasonStartYear: Number(seasonStartYear) + 1,
    teams,
    moves,
    counts: { scenarioAssignments: moves.length, playersAssignedToSameTeam: playerTeam.size - moves.length },
    assumptions: ['Only caller-supplied players and destination teams are eligible.',
      'A seeded uniform draw selects the requested number of candidate assignments and each destination.',
      'Assignments are hypothetical; transaction mechanism, date, contract terms, and retirement are not modeled.'],
    replay: { deterministic: true, seed: normalizedSeed, movementCount: moves.length,
      candidateCount: candidateRows.length, candidateFingerprint },
  };
}
