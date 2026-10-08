import { normalizeCanonicalPlayerName } from './simulation-contracts-v1.mjs';
import { normalizeLiveRotationControls } from './live-rotation-controls-v1.mjs';
import { createRotationSchedule } from './rotation-schedule-v1.mjs';
import { evaluateFranchiseAutomationPermission } from './franchise-automation-v1.mjs';

const clone = value => structuredClone(value);
const FORMAT = 'djhc-franchise-rotation-v1';
const VALIDATION_FORMAT = 'djhc-franchise-rotation-validation-v1';
const RECEIPT_FORMAT = 'djhc-franchise-control-receipt-v1';
const REGULATION_GAME_MINUTES = 48;
const REGULATION_TEAM_MINUTES = 240;
const MINUTE_TOLERANCE = 1e-7;

function asTeamCode(value) {
  return String(value ?? '').trim().toUpperCase();
}

function asNameKey(value) {
  return normalizeCanonicalPlayerName(value);
}

function entryValue(value) {
  if (value && typeof value === 'object' && Object.hasOwn(value, 'value')) return value.value;
  return value;
}

function entryStatus(value) {
  if (!value || typeof value !== 'object') return null;
  return String(value.valueStatus ?? value.status ?? '').toLowerCase();
}

function explicitBoolean(value) {
  const status = entryStatus(value);
  if (status && /unknown|candidate|conflict|unresolved|missing|unreported|invalid/.test(status)) return null;
  const resolved = entryValue(value);
  return typeof resolved === 'boolean' ? resolved : null;
}

function explicitText(value) {
  const status = entryStatus(value);
  if (status && /unknown|candidate|conflict|unresolved|missing|unreported|invalid/.test(status)) return null;
  const resolved = entryValue(value);
  return typeof resolved === 'string' && resolved.trim() ? resolved.trim().toLowerCase() : null;
}

function currentTerm(player, seasonStartYear) {
  const terms = Array.isArray(player?.contractSeasons) && player.contractSeasons.length
    ? player.contractSeasons : player?.contract?.seasons;
  if (!Array.isArray(terms)) return null;
  const matches = terms.filter(term => Number(term?.seasonStartYear ?? term?.fromYear) === seasonStartYear);
  return matches.length === 1 ? matches[0] : null;
}

function retiredOrNotRostered(player, seasonStartYear) {
  if (explicitBoolean(player?.retired) === true || explicitText(player?.rosterStatus) === 'retired') return 'retired';
  if (['waived', 'free-agent', 'unsigned'].includes(explicitText(player?.rosterStatus))) return 'not-currently-rostered';
  const term = currentTerm(player, seasonStartYear);
  const optionStatus = String(term?.optionDecisionStatus ?? term?.optionStatus ?? term?.status ?? '').toLowerCase();
  if (term?.active === false || ['declined', 'expired', 'terminated', 'void', 'inactive'].includes(optionStatus)) return 'inactive-contract';
  return null;
}

function availabilityFor(player) {
  const statusNodes = [player?.gameAvailability, player?.availability, player?.availabilityStatus, player?.status];
  let rawStatus = null;
  for (const node of statusNodes) {
    const value = node && typeof node === 'object' && !Object.hasOwn(node, 'value')
      ? (/unknown|candidate|conflict|unresolved|missing|unreported|invalid/.test(entryStatus(node) ?? '') ? null : node.status)
      : explicitText(node);
    if (value !== null && value !== undefined && String(value).trim()) {
      rawStatus = String(value).trim().toLowerCase();
      break;
    }
  }
  const rosterStatus = explicitText(player?.rosterStatus);
  const availableFlag = explicitBoolean(player?.available ?? player?.isAvailable);
  const activeFlag = explicitBoolean(player?.active);
  if (rawStatus === 'unavailable' || ['out', 'inactive', 'not-available'].includes(rawStatus) || rosterStatus === 'inactive' ||
      availableFlag === false || activeFlag === false) {
    return { status: 'unavailable', reason: 'explicit-unavailable-or-inactive', minutesLimit: null };
  }
  const rawLimit = player?.gameAvailability?.minutesLimit ?? player?.availability?.minutesLimit ?? player?.minutesLimit;
  const hasLimit = rawLimit !== null && rawLimit !== undefined && rawLimit !== '';
  if (rawStatus === 'limited' || hasLimit) {
    const unresolved = /unknown|candidate|conflict|unresolved|missing|unreported|invalid/.test(entryStatus(rawLimit) ?? '');
    const value = entryValue(rawLimit);
    const numericType = typeof value === 'number' || (typeof value === 'string' && value.trim());
    const limit = !hasLimit || unresolved || !numericType ? null : Number(value);
    return Number.isFinite(limit) && limit > 0 && limit <= REGULATION_GAME_MINUTES
      ? { status: 'limited', reason: 'explicit-limited-minutes', minutesLimit: limit }
      : { status: 'unknown', reason: 'limited-status-without-valid-minutes-limit', minutesLimit: null };
  }
  if (rawStatus === 'available' || availableFlag === true || activeFlag === true) {
    return { status: 'available', reason: 'explicit-available', minutesLimit: null };
  }
  return { status: 'unknown', reason: 'no-explicit-current-game-availability', minutesLimit: null };
}

export function resolveRotationPlayerAvailability(player) { return availabilityFor(player); }

function isCurrentTeamRosterPlayer(player, teamCode) {
  return asTeamCode(player?.teamCode) === teamCode;
}

function teamContext(state, teamCodeInput, seasonStartYear) {
  const missingInputs = [];
  const violations = [];
  const teamCode = asTeamCode(teamCodeInput);
  if (!teamCode) missingInputs.push('A teamCode is required.');
  if (!Array.isArray(state?.teams)) missingInputs.push('LeagueState teams are unavailable.');
  if (!Array.isArray(state?.players)) missingInputs.push('LeagueState players are unavailable.');
  const teams = Array.isArray(state?.teams) ? state.teams : [];
  const teamsFound = teams.filter(team => asTeamCode(team?.teamCode) === teamCode);
  if (teamCode && teamsFound.length !== 1) {
    if (!teamsFound.length) missingInputs.push(`Team ${teamCode} is absent from LeagueState.`);
    else violations.push(`Team code ${teamCode} is ambiguous in LeagueState.`);
  }
  const team = teamsFound.length === 1 ? teamsFound[0] : null;
  if (team && !Array.isArray(team.rosterNames)) missingInputs.push(`${teamCode} rosterNames are unavailable.`);

  const players = Array.isArray(state?.players) ? state.players : [];
  const playerIndex = new Map();
  for (const player of players) {
    const key = asNameKey(player?.canonicalName ?? player?.name);
    if (!key) continue;
    const rows = playerIndex.get(key) ?? [];
    rows.push(player);
    playerIndex.set(key, rows);
  }

  const eligibleRoster = new Map();
  const excludedPlayers = [];
  const availabilityDisclosures = [];
  const rosterKeys = new Set();
  for (const rawName of Array.isArray(team?.rosterNames) ? team.rosterNames : []) {
    const key = asNameKey(rawName);
    if (!key) {
      missingInputs.push(`${teamCode} has a roster row without a resolvable exact name.`);
      continue;
    }
    if (rosterKeys.has(key)) violations.push(`${teamCode} roster contains duplicate normalized name ${rawName}.`);
    rosterKeys.add(key);
    const matches = playerIndex.get(key) ?? [];
    if (matches.length !== 1) {
      missingInputs.push(`${teamCode} roster player ${rawName} does not resolve to exactly one player state row.`);
      continue;
    }
    const player = matches[0];
    const canonicalName = String(player.canonicalName ?? player.name).trim();
    if (!isCurrentTeamRosterPlayer(player, teamCode)) {
      missingInputs.push(`${canonicalName} appears in ${teamCode} rosterNames but player.teamCode does not match.`);
      continue;
    }
    const excludedReason = retiredOrNotRostered(player, seasonStartYear);
    if (excludedReason) {
      excludedPlayers.push({ canonicalName, reason: excludedReason });
      continue;
    }
    const availability = availabilityFor(player);
    const row = { key, canonicalName, player, availability };
    eligibleRoster.set(key, row);
    availabilityDisclosures.push({ canonicalName, status: availability.status, reason: availability.reason,
      ...(availability.minutesLimit === null ? {} : { minutesLimit: availability.minutesLimit }) });
  }

  for (const player of players) {
    if (isCurrentTeamRosterPlayer(player, teamCode)) {
      const key = asNameKey(player?.canonicalName ?? player?.name);
      if (key && !rosterKeys.has(key)) missingInputs.push(`${player.canonicalName ?? player.name} is assigned to ${teamCode} but absent from rosterNames.`);
    }
  }

  const userTeams = new Set((state?.userControlledTeamCodes ?? []).map(asTeamCode));
  const permission = userTeams.has(teamCode) ? 'user' : null;
  return { teamCode, team, eligibleRoster, excludedPlayers, availabilityDisclosures, missingInputs, violations, permission };
}

function resolveNameList(values, label, context, violations) {
  if (!Array.isArray(values)) {
    violations.push(`${label} must be an array of exact player names.`);
    return [];
  }
  const result = [];
  const seen = new Set();
  for (const raw of values) {
    const key = asNameKey(raw);
    if (!key) {
      violations.push(`${label} contains a blank player name.`);
      continue;
    }
    if (seen.has(key)) {
      violations.push(`${label} contains duplicate normalized player name ${raw}.`);
      continue;
    }
    seen.add(key);
    const player = context.eligibleRoster.get(key);
    if (!player) {
      const excluded = context.excludedPlayers.find(row => asNameKey(row.canonicalName) === key);
      violations.push(excluded
        ? `${raw} is explicitly ${excluded.reason} and cannot be included in a rotation.`
        : `${raw} is not an eligible current-roster player for ${context.teamCode}.`);
      continue;
    }
    result.push(player.canonicalName);
  }
  return result;
}

function canonicalizeControls(controls, context, seasonStartYear, gameDurationMinutes, violations, missingInputs) {
  if (!controls || typeof controls !== 'object' || Array.isArray(controls)) {
    violations.push('Franchise rotation controls must be an object.');
    return null;
  }
  if (controls.seasonStartYear !== undefined && Number(controls.seasonStartYear) !== seasonStartYear) {
    violations.push(`Rotation controls season ${controls.seasonStartYear} conflicts with requested season ${seasonStartYear}.`);
  }
  const starters = resolveNameList(controls.starters, 'starters', context, violations);
  const activeRotation = resolveNameList(controls.activeRotation, 'activeRotation', context, violations);
  const inactiveRotation = resolveNameList(controls.inactiveRotation, 'inactiveRotation', context, violations);
  if (starters.length !== 5 || (Array.isArray(controls.starters) && controls.starters.length !== 5)) {
    violations.push('Exactly five unique starters are required.');
  }

  const activeKeys = new Set(activeRotation.map(asNameKey));
  const inactiveKeys = new Set(inactiveRotation.map(asNameKey));
  const starterKeys = new Set(starters.map(asNameKey));
  for (const name of activeRotation) if (inactiveKeys.has(asNameKey(name))) violations.push(`${name} appears in both activeRotation and inactiveRotation.`);
  for (const name of starters) if (!activeKeys.has(asNameKey(name))) violations.push(`Starter ${name} must appear in activeRotation.`);
  for (const row of context.eligibleRoster.values()) {
    const active = activeKeys.has(row.key), inactive = inactiveKeys.has(row.key);
    if (!active && !inactive) violations.push(`${row.canonicalName} must be assigned to activeRotation or inactiveRotation.`);
  }
  for (const row of context.excludedPlayers) {
    if (starterKeys.has(asNameKey(row.canonicalName)) || activeKeys.has(asNameKey(row.canonicalName)) || inactiveKeys.has(asNameKey(row.canonicalName))) {
      violations.push(`${row.canonicalName} is ${row.reason} and must be excluded from rotation controls.`);
    }
  }

  const requestedDuration = gameDurationMinutes ?? controls.gameDurationMinutes ?? REGULATION_GAME_MINUTES;
  const duration = Number(requestedDuration);
  if (!Number.isFinite(duration) || duration !== REGULATION_GAME_MINUTES) {
    violations.push(`The current live/coherent simulator supports fixed ${REGULATION_GAME_MINUTES}-minute regulation only; custom game duration is unsupported.`);
  }

  if (!Array.isArray(controls.minuteAssignments)) {
    violations.push('minuteAssignments must be an array of exact-name and numeric-minute rows.');
  }
  const assignments = new Map();
  for (const row of Array.isArray(controls.minuteAssignments) ? controls.minuteAssignments : []) {
    const key = asNameKey(row?.canonicalName ?? row?.playerName);
    const rawName = row?.canonicalName ?? row?.playerName;
    if (!key) {
      violations.push('A minute assignment is missing an exact player name.');
      continue;
    }
    if (assignments.has(key)) {
      violations.push(`minuteAssignments contains duplicate normalized player name ${rawName}.`);
      continue;
    }
    const rosterRow = context.eligibleRoster.get(key);
    if (!rosterRow) {
      const excluded = context.excludedPlayers.find(item => asNameKey(item.canonicalName) === key);
      violations.push(excluded
        ? `${rawName} is explicitly ${excluded.reason} and cannot receive a minute assignment.`
        : `${rawName} is not an eligible current-roster player for ${context.teamCode}.`);
      continue;
    }
    const rawMinutes = row?.minutes;
    const minutes = rawMinutes === null || rawMinutes === undefined || (typeof rawMinutes === 'string' && !rawMinutes.trim())
      ? NaN : Number(rawMinutes);
    if (!Number.isFinite(minutes) || minutes < 0 || minutes > REGULATION_GAME_MINUTES) {
      violations.push(`${rosterRow.canonicalName} minutes must be a finite number from 0 through ${REGULATION_GAME_MINUTES}.`);
      continue;
    }
    if (rosterRow.availability.status === 'limited' && minutes > rosterRow.availability.minutesLimit + MINUTE_TOLERANCE) {
      violations.push(`${rosterRow.canonicalName} exceeds its explicit ${rosterRow.availability.minutesLimit}-minute limit.`);
    }
    assignments.set(key, { canonicalName: rosterRow.canonicalName, minutes });
  }

  for (const row of context.eligibleRoster.values()) {
    const assignment = assignments.get(row.key);
    if (!assignment) {
      violations.push(`${row.canonicalName} requires a minute assignment.`);
      continue;
    }
    const active = activeKeys.has(row.key);
    const inactive = inactiveKeys.has(row.key);
    if (active && assignment.minutes <= 0) violations.push(`Active rotation player ${row.canonicalName} must receive positive minutes.`);
    if (inactive && Math.abs(assignment.minutes) > MINUTE_TOLERANCE) violations.push(`Inactive rotation player ${row.canonicalName} must receive zero minutes.`);
    if (active && ['unavailable'].includes(row.availability.status)) violations.push(`${row.canonicalName} is explicitly unavailable/inactive and cannot appear in activeRotation.`);
  }
  for (const name of starters) {
    const row = context.eligibleRoster.get(asNameKey(name));
    if (row?.availability.status === 'unavailable') violations.push(`Starter ${name} is explicitly unavailable/inactive.`);
  }
  if (activeRotation.length < 5) violations.push('The active rotation needs at least five players with positive minutes.');

  const assignedMinuteTotal = [...assignments.values()].reduce((sum, row) => sum + row.minutes, 0);
  if (assignments.size && Math.abs(assignedMinuteTotal - REGULATION_TEAM_MINUTES) > MINUTE_TOLERANCE) {
    violations.push(`Minute assignments total ${assignedMinuteTotal}; regulation requires exactly ${REGULATION_TEAM_MINUTES} player-minutes.`);
  }

  const expectedKeys = new Set(context.eligibleRoster.keys());
  for (const key of activeKeys) if (!expectedKeys.has(key)) missingInputs.push(`Active rotation player ${key} could not be mapped to the current roster.`);
  for (const key of inactiveKeys) if (!expectedKeys.has(key)) missingInputs.push(`Inactive rotation player ${key} could not be mapped to the current roster.`);
  for (const key of assignments.keys()) if (!expectedKeys.has(key)) missingInputs.push(`Minute assignment ${key} could not be mapped to the current roster.`);

  if (violations.length) return null;
  const rosterOrder = [...context.eligibleRoster.values()];
  const minuteAssignments = rosterOrder.map(row => assignments.get(row.key)).filter(Boolean);
  const rotationPlayers = activeRotation.map(name => ({ canonicalName: name,
    playerRef: context.eligibleRoster.get(asNameKey(name)).player.playerRef ?? name,
    minutesTarget: assignments.get(asNameKey(name)).minutes }));
  if (controls.rotationControls !== undefined && (!controls.rotationControls || typeof controls.rotationControls !== 'object' || Array.isArray(controls.rotationControls))) {
    violations.push('rotationControls must be an object.'); return null;
  }
  if (controls.rotationControls?.starters !== undefined && (!Array.isArray(controls.rotationControls.starters) ||
      JSON.stringify(controls.rotationControls.starters.map(asNameKey)) !== JSON.stringify(starters.map(asNameKey)))) {
    violations.push('rotationControls.starters conflicts with the saved starter five.');
  }
  const onCourt = normalizeLiveRotationControls({ players: rotationPlayers, controls: { ...(controls.rotationControls ?? {}), starters } });
  violations.push(...onCourt.violations);
  if (onCourt.status !== 'pass') return null;
  const schedule = createRotationSchedule({ players: rotationPlayers, starters,
    openingStintMinutes: onCourt.controls.openingStintMinutes });
  violations.push(...schedule.violations);
  if (violations.length) return null;
  return {
    format: FORMAT,
    teamCode: context.teamCode,
    seasonStartYear,
    revision: null,
    starters,
    activeRotation,
    inactiveRotation,
    minuteAssignments,
    gameDurationMinutes: REGULATION_GAME_MINUTES,
    totalRegulationMinutes: REGULATION_TEAM_MINUTES,
    rotationControls: onCourt.controls,
    availabilityStatus: context.availabilityDisclosures.some(row => row.status === 'unknown') ? 'availability-unresolved' : 'availability-explicit',
    availabilityDisclosures: clone(context.availabilityDisclosures),
    excludedRosterPlayers: clone(context.excludedPlayers),
  };
}

function actionPermission(state, teamCode, commissionerMode, violations, actor = 'user') {
  if (actor === 'cpu') {
    const permission = evaluateFranchiseAutomationPermission({ state, teamCode, domain: 'lineup', action: 'execute', actor });
    if (permission.allowed) return 'cpu';
    violations.push(permission.reason); return null;
  }
  if (!['user', 'commissioner'].includes(actor)) { violations.push('Unsupported franchise control actor.'); return null; }
  if (actor === 'commissioner') {
    if (commissionerMode === true) return 'commissioner';
    violations.push('A commissioner actor requires commissionerMode:true.'); return null;
  }
  const userTeams = new Set((state?.userControlledTeamCodes ?? []).map(asTeamCode));
  if (userTeams.has(teamCode)) return 'user';
  if (commissionerMode === true) return 'commissioner';
  violations.push(`Team ${teamCode} is not user-controlled; commissionerMode:true is required to edit it.`);
  return null;
}

/** Read the authoritative roster for planning without granting edit authority. */
export function getFranchiseRotationRoster({ state, teamCode, seasonStartYear = state?.seasonStartYear } = {}) {
  const context = teamContext(state, teamCode, seasonStartYear);
  const violations = [...context.violations];
  if (seasonStartYear !== state?.seasonStartYear) violations.push('Rotation roster season conflicts with current LeagueState.');
  return { status: violations.length || context.missingInputs.length ? 'requires-review' : 'pass',
    teamCode: context.teamCode, seasonStartYear, violations, missingInputs: context.missingInputs,
    players: [...context.eligibleRoster.values()].map(row => ({ ...clone(row.player), rotationAvailability: clone(row.availability) })),
    excludedPlayers: clone(context.excludedPlayers), availabilityDisclosures: clone(context.availabilityDisclosures) };
}

function findSavedControls(state, teamCode, seasonStartYear) {
  const team = (state?.teams ?? []).find(row => asTeamCode(row?.teamCode) === asTeamCode(teamCode));
  return team?.franchiseControlsBySeason?.[String(seasonStartYear)] ?? null;
}

function exactControlsPayload(teamCode, seasonStartYear, controls) {
  return JSON.stringify({ teamCode, seasonStartYear, starters: controls.starters,
    activeRotation: controls.activeRotation, inactiveRotation: controls.inactiveRotation,
    minuteAssignments: controls.minuteAssignments, gameDurationMinutes: controls.gameDurationMinutes,
    rotationControls: controls.rotationControls });
}

// Receipts are consistency records, not authentication tokens. Valid records
// remain usable after unrelated league actions; future or changed records hold.
function savedRecordViolations(record, teamCode, seasonStartYear, stateRevision) {
  const errors = [];
  const receipt = record?.actionReceipt;
  if (record?.format !== FORMAT || asTeamCode(record?.teamCode) !== teamCode || record?.seasonStartYear !== seasonStartYear) errors.push('Saved rotation format, team or season does not match its state entry.');
  if (!Number.isInteger(record?.revision) || record.revision < 1) errors.push('Saved rotation revision must be a positive integer.');
  if (!receipt || receipt.format !== RECEIPT_FORMAT) return [...errors, 'Saved rotation action receipt is missing or unsupported.'];
  if (asTeamCode(receipt.teamCode) !== teamCode || receipt.seasonStartYear !== seasonStartYear || receipt.controlRevision !== record.revision) errors.push('Saved rotation receipt team, season or control revision conflicts.');
  if (!Number.isInteger(receipt.priorControlRevision) || receipt.priorControlRevision < 0 || receipt.priorControlRevision + 1 !== record.revision) errors.push('Saved rotation prior control revision is invalid.');
  if (!['create', 'update'].includes(receipt.action) || (receipt.action === 'create' && receipt.priorControlRevision !== 0) || (receipt.action === 'update' && receipt.priorControlRevision < 1)) errors.push('Saved rotation action/revision sequence is invalid.');
  if (!Number.isInteger(receipt.stateRevision) || receipt.stateRevision < 0 || receipt.expectedStateRevision !== receipt.stateRevision || receipt.resultingStateRevision !== receipt.stateRevision + 1 || receipt.resultingStateRevision > stateRevision) errors.push('Saved rotation receipt has an invalid or future LeagueState revision.');
  const sourceClass = receipt.actor === 'cpu' ? 'generated-scenario' : 'user-scenario';
  if (!['user', 'commissioner', 'cpu'].includes(receipt.actor) || receipt.source?.sourceSystem !== 'djhc-franchise-controls' || receipt.source?.sourceVersion !== 'djhc-franchise-controls-v1' || receipt.source?.sourceClass !== sourceClass) errors.push('Saved rotation receipt actor/source evidence is invalid.');
  if (receipt.exactControlsPayload !== exactControlsPayload(teamCode, seasonStartYear, record)) errors.push('Saved rotation terms changed after the recorded action.');
  return errors;
}

/** Validate exact-name team rotation controls without changing LeagueState. */
export function validateFranchiseRotationState({ state, teamCode, seasonStartYear = state?.seasonStartYear,
  controls = null, commissionerMode = false, gameDurationMinutes = undefined } = {}) {
  const violations = [];
  const missingInputs = [];
  const team = asTeamCode(teamCode);
  const year = Number(seasonStartYear);
  if (!Number.isInteger(state?.revision)) missingInputs.push('LeagueState revision is unresolved.');
  else if (state.revision < 0) violations.push('LeagueState revision must be nonnegative.');
  if (!team) missingInputs.push('A teamCode is required.');
  if (!Number.isInteger(year)) missingInputs.push('A valid seasonStartYear is required.');
  if (Number.isInteger(year) && Number.isInteger(state?.seasonStartYear) && year !== state.seasonStartYear) {
    violations.push(`Rotation season ${year} does not match current LeagueState season ${state.seasonStartYear}.`);
  }
  // Validation is read-only. Create/update enforce actor ownership and any
  // explicit CPU delegation separately before committing a control record.

  const context = teamContext(state, team, year);
  violations.push(...context.violations);
  missingInputs.push(...context.missingInputs);
  const candidate = controls ?? findSavedControls(state, team, year);
  if (!candidate) missingInputs.push(`No saved or supplied franchise rotation controls exist for ${team}/${year}.`);
  if (candidate && (!controls || candidate.format === FORMAT || candidate.actionReceipt !== undefined || candidate.revision !== undefined)) {
    violations.push(...savedRecordViolations(candidate, team, year, state?.revision));
  }
  const canonicalControls = candidate
    ? canonicalizeControls(candidate, context, year, gameDurationMinutes, violations, missingInputs)
    : null;
  const status = violations.length ? 'fail' : missingInputs.length ? 'unknown' : 'pass';
  return {
    format: VALIDATION_FORMAT,
    status,
    violations: [...new Set(violations)],
    missingInputs: [...new Set(missingInputs)],
    teamCode: team || null,
    seasonStartYear: Number.isInteger(year) ? year : null,
    roster: { eligiblePlayerCount: context.eligibleRoster.size, excludedPlayers: clone(context.excludedPlayers) },
    availabilityStatus: context.availabilityDisclosures.some(row => row.status === 'unknown') ? 'availability-unresolved' : 'availability-explicit',
    availabilityDisclosures: clone(context.availabilityDisclosures),
    canonicalControls,
    legalReady: false,
  };
}

function saveFranchiseControls({ state, teamCode, seasonStartYear = state?.seasonStartYear, controls,
  expectedStateRevision, commissionerMode = false, actor = 'user' } = {}, action) {
  const code = asTeamCode(teamCode);
  const year = Number(seasonStartYear);
  const violations = [];
  const permission = actionPermission(state, code, commissionerMode, violations, actor);
  if (!Number.isInteger(state?.revision) || state.revision < 0) violations.push('A nonnegative LeagueState revision is required for a user-action receipt.');
  if (!Number.isInteger(expectedStateRevision) || expectedStateRevision !== state?.revision) {
    violations.push('Franchise controls were prepared against a different or missing LeagueState revision.');
  }
  const existing = findSavedControls(state, code, year);
  if (existing) violations.push(...savedRecordViolations(existing, code, year, state?.revision));
  if (action === 'create' && existing) violations.push(`Franchise controls already exist for ${code}/${year}; use update.`);
  if (action === 'update' && !existing) violations.push(`No existing franchise controls exist for ${code}/${year}; use create.`);

  const validation = validateFranchiseRotationState({ state, teamCode: code, seasonStartYear: year, controls,
    commissionerMode: commissionerMode === true });
  violations.push(...validation.violations);
  const missingInputs = [...validation.missingInputs];
  if (violations.length || missingInputs.length || validation.status !== 'pass') {
    return { format: 'djhc-franchise-control-action-result-v1', status: 'rejected', action,
      state: clone(state), controls: null, validation: { ...validation, status: violations.length ? 'fail' : validation.status,
        violations: [...new Set([...validation.violations, ...violations])] }, receipt: null };
  }

  const next = clone(state);
  const nextTeam = next.teams.find(row => asTeamCode(row.teamCode) === code);
  nextTeam.franchiseControlsBySeason ??= {};
  const priorControlRevision = Number(existing?.revision ?? 0);
  const controlRevision = priorControlRevision + 1;
  const canonicalControls = { ...clone(validation.canonicalControls), revision: controlRevision };
  const exactPayload = exactControlsPayload(code, year, canonicalControls);
  const receipt = {
    format: RECEIPT_FORMAT,
    action,
    actor: permission,
    teamCode: code,
    seasonStartYear: year,
    stateRevision: state.revision,
    expectedStateRevision,
    resultingStateRevision: state.revision + 1,
    priorControlRevision,
    controlRevision,
    exactControlsPayload: exactPayload,
    source: { sourceSystem: 'djhc-franchise-controls', sourceVersion: 'djhc-franchise-controls-v1', sourceClass: permission === 'cpu' ? 'generated-scenario' : 'user-scenario' },
  };
  canonicalControls.actionReceipt = receipt;
  nextTeam.franchiseControlsBySeason[String(year)] = canonicalControls;
  next.revision = state.revision + 1;
  return { format: 'djhc-franchise-control-action-result-v1', status: action === 'create' ? 'created' : 'updated', action,
    state: next, controls: clone(canonicalControls), validation, receipt: clone(receipt) };
}

/** Create the first versioned user rotation record for a team and season. */
export function createFranchiseRotationState(options = {}) {
  return saveFranchiseControls(options, 'create');
}

/** Update an existing versioned user rotation record using optimistic revision checks. */
export function updateFranchiseRotationState(options = {}) {
  return saveFranchiseControls(options, 'update');
}

/** Purely project saved or supplied controls to the live simulator's {teamCode, players[]} team input. */
export function projectFranchiseRotationToLiveGameTeam({ state, teamCode, seasonStartYear = state?.seasonStartYear,
  controls = null, commissionerMode = false, gameDurationMinutes = undefined } = {}) {
  const validation = validateFranchiseRotationState({ state, teamCode, seasonStartYear, controls,
    commissionerMode: commissionerMode === true, gameDurationMinutes });
  if (validation.status !== 'pass' || !validation.canonicalControls) {
    return { format: 'djhc-franchise-live-team-projection-v1', status: validation.status,
      violations: validation.violations, missingInputs: validation.missingInputs,
      validation, liveGameTeam: null, legalReady: false };
  }

  const teamCodeResolved = asTeamCode(teamCode);
  const year = Number(seasonStartYear);
  const playersByName = new Map((state.players ?? []).map(player => [asNameKey(player?.canonicalName ?? player?.name), player]));
  const assignments = new Map(validation.canonicalControls.minuteAssignments.map(row => [asNameKey(row.canonicalName), row.minutes]));
  const players = validation.canonicalControls.activeRotation.map(name => {
    const player = playersByName.get(asNameKey(name));
    const playerRef = String(player.playerRef ?? '').trim() || player.canonicalName;
    const displayName = String(player.displayName ?? '').trim() || player.canonicalName;
    return {
      ...clone(player),
      playerRef,
      displayName,
      canonicalName: player.canonicalName,
      projectedMinutes: assignments.get(asNameKey(name)),
    };
  });
  const playerRefs = players.map(player => String(player.playerRef));
  if (new Set(playerRefs).size !== playerRefs.length) {
    return { format: 'djhc-franchise-live-team-projection-v1', status: 'fail', violations: ['Projected live-game playerRef values must be unique.'],
      missingInputs: [], validation, liveGameTeam: null, legalReady: false };
  }
  const minuteTotal = players.reduce((sum, player) => sum + player.projectedMinutes, 0);
  if (Math.abs(minuteTotal - REGULATION_TEAM_MINUTES) > MINUTE_TOLERANCE || players.some(player => player.projectedMinutes > REGULATION_GAME_MINUTES)) {
    return { format: 'djhc-franchise-live-team-projection-v1', status: 'fail', violations: ['Projected live-game minutes do not satisfy the fixed 240-minute, 48-minute-per-player contract.'],
      missingInputs: [], validation, liveGameTeam: null, legalReady: false };
  }

  const liveGameTeam = { teamCode: teamCodeResolved, players,
    rotationControls: clone(validation.canonicalControls.rotationControls) };
  return {
    format: 'djhc-franchise-live-team-projection-v1', status: 'pass', teamCode: teamCodeResolved, seasonStartYear: year,
    liveGameTeam,
    storedStarters: clone(validation.canonicalControls.starters),
    availabilityStatus: validation.availabilityStatus,
    availabilityDisclosures: clone(validation.availabilityDisclosures),
    inactiveRotation: clone(validation.canonicalControls.inactiveRotation),
    excludedRosterPlayers: clone(validation.canonicalControls.excludedRosterPlayers),
    compatibility: {
      liveGameSimulatorV1TeamShape: 'compatible',
      acceptedFields: ['teamCode', 'players[].playerRef', 'players[].displayName', 'players[].projectedMinutes', 'rotationControls'],
      minuteBehavior: 'Planned stints reconcile exactly to requested 240 minutes. Live substitutions wait for modeled eligible stoppages, so actual player minutes can differ; overtime and conditional coaching are disclosed separately.',
      starterBehavior: 'Saved starters open the live game. Closing groups and optional conditional substitutions apply through the live rotation controls.',
      seasonIntegration: 'simulateLeagueGames applies accepted current saved controls at the game-input boundary; callers choose the coherent or live engine.',
      coherentBoxBehavior: 'The coherent box wrapper accepts the same roster fields but rounds its internal minute allocation to whole minutes.',
    },
    disclosure: 'User-supplied rotation scenario. Availability that is not explicit remains unresolved; this projection does not certify game-day eligibility or automatically affect season simulations.',
    legalReady: false,
  };
}
