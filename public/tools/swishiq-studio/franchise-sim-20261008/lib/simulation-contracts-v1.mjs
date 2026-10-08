export const SIMULATION_CONTRACT_VERSION = '1.0.0';
export const TRANSACTION_STATUSES = Object.freeze(['confirmed-legal', 'provisional', 'illegal']);
export const LEAGUE_STATE_MODES = Object.freeze(['exact', 'provisional-sandbox']);

const copy = value => structuredClone(value);

/**
 * Names are the canonical player key in this prototype. This only normalizes
 * Unicode, case, punctuation, and whitespace; it never performs fuzzy matching.
 */
export function normalizeCanonicalPlayerName(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('en-US')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function createFieldEvidence(value, {
  field,
  seasonStartYear = null,
  unit = null,
  source = null,
  identityStatus = 'not-applicable',
  valueStatus = value === null || value === undefined ? 'unknown' : 'observed',
  notes = [],
} = {}) {
  if (!field) throw new Error('Field evidence requires a field name.');
  if (valueStatus === 'observed' && (source === null || source === undefined)) {
    throw new Error(`Observed field ${field} requires source provenance.`);
  }
  return {
    value: value ?? null,
    field,
    seasonStartYear,
    unit,
    valueStatus,
    identityStatus,
    source: source ? copy(source) : null,
    notes: [...notes],
  };
}

export function buildExactNameIndex(players = []) {
  const index = new Map();
  for (const player of players) {
    const key = normalizeCanonicalPlayerName(player?.canonicalName ?? player?.name);
    if (!key) continue;
    const rows = index.get(key) ?? [];
    rows.push(player);
    index.set(key, rows);
  }
  return index;
}

export function resolvePlayerByCanonicalName(playersOrIndex, requestedName) {
  const key = normalizeCanonicalPlayerName(requestedName);
  if (!key) return { status: 'unknown', canonicalName: null, matches: [] };
  const index = playersOrIndex instanceof Map ? playersOrIndex : buildExactNameIndex(playersOrIndex);
  const matches = index.get(key) ?? [];
  if (!matches.length) return { status: 'unresolved', canonicalName: null, matches: [] };
  if (matches.length > 1) return { status: 'ambiguous', canonicalName: null, matches };
  return { status: 'resolved', canonicalName: matches[0].canonicalName ?? matches[0].name, matches };
}

export function createLeagueState(input = {}) {
  if (!Number.isInteger(input.seasonStartYear)) throw new Error('LeagueState requires seasonStartYear.');
  const mode = input.mode ?? 'exact';
  if (!LEAGUE_STATE_MODES.includes(mode)) throw new Error(`Unsupported LeagueState mode: ${mode}`);
  const players = (input.players ?? []).map(player => {
    const canonicalName = String(player.canonicalName ?? player.name ?? '').trim();
    if (!normalizeCanonicalPlayerName(canonicalName)) throw new Error('Every player requires a canonical name.');
    return { ...copy(player), canonicalName };
  });
  const duplicateNames = [...buildExactNameIndex(players).entries()].filter(([, rows]) => rows.length > 1);
  if (duplicateNames.length) {
    throw new Error(`LeagueState has duplicate canonical player names: ${duplicateNames.map(([name]) => name).join(', ')}`);
  }
  const teams = (input.teams ?? []).map(team => ({
    ...copy(team),
    teamCode: String(team.teamCode ?? '').trim().toUpperCase(),
    rosterNames: (team.rosterNames ?? []).map(name => String(name).trim()),
    payrollState: copy(team.payrollState ?? { status: 'unknown', components: {} }),
    strategyProfile: team.strategyProfile ?? 'balanced',
  }));
  const teamCodes = teams.map(team => team.teamCode);
  if (teamCodes.some(code => !code) || new Set(teamCodes).size !== teamCodes.length) {
    throw new Error('LeagueState requires unique, non-empty team codes.');
  }
  const state = {
    format: 'djhc-league-state-v1',
    schemaVersion: SIMULATION_CONTRACT_VERSION,
    seasonStartYear: input.seasonStartYear,
    transactionWindow: input.transactionWindow ?? 'preseason',
    mode,
    stateQuality: input.stateQuality ?? { status: 'provisional', reasons: ['No source reconciliation receipt supplied.'] },
    players,
    teams,
    draftPicks: copy(input.draftPicks ?? []),
    rulesReference: copy(input.rulesReference ?? null),
    sourceCatalog: copy(input.sourceCatalog ?? []),
    transactionLedger: copy(input.transactionLedger ?? []),
    offerSheetLedger: copy(input.offerSheetLedger ?? []),
    simulationClock: copy(input.simulationClock ?? null),
    userControlledTeamCodes: [...(input.userControlledTeamCodes ?? [])].map(code => String(code).toUpperCase()),
    lastSeasonAged: input.lastSeasonAged ?? null,
    revision: input.revision === undefined ? 0 : input.revision,
  };
  validateLeagueState(state);
  return state;
}

export function validateLeagueState(state) {
  const errors = [];
  if (state?.format !== 'djhc-league-state-v1') errors.push('Unsupported LeagueState format.');
  if (!Number.isInteger(state?.seasonStartYear)) errors.push('Missing seasonStartYear.');
  if (!Number.isInteger(state?.revision) || state.revision < 0) errors.push('LeagueState revision must be a nonnegative integer.');
  if (!LEAGUE_STATE_MODES.includes(state?.mode)) errors.push('Invalid simulation mode.');
  const teamByCode = new Map((state?.teams ?? []).map(team => [team.teamCode, team]));
  const index = buildExactNameIndex(state?.players ?? []);
  const sheetIds = new Set();
  const pendingNames = new Set();
  for (const sheet of state?.offerSheetLedger ?? []) {
    if (!sheet.sheetId || sheetIds.has(sheet.sheetId)) errors.push('Offer sheets require unique nonempty sheet IDs.');
    sheetIds.add(sheet.sheetId);
    if (!['pending', 'resolving', 'matched', 'signed-with-new-team'].includes(sheet.status)) errors.push(`Unsupported offer-sheet status for ${sheet.sheetId}.`);
    if (resolvePlayerByCanonicalName(index, sheet.canonicalName).status !== 'resolved') errors.push(`Offer sheet ${sheet.sheetId} has unresolved player identity.`);
    if (!teamByCode.has(sheet.newTeamCode) || !teamByCode.has(sheet.priorTeamCode) || sheet.newTeamCode === sheet.priorTeamCode) errors.push(`Offer sheet ${sheet.sheetId} requires distinct existing teams.`);
    if (['pending', 'resolving'].includes(sheet.status)) {
      const key = normalizeCanonicalPlayerName(sheet.canonicalName);
      if (pendingNames.has(key)) errors.push(`Multiple outstanding offer sheets for ${sheet.canonicalName}.`);
      pendingNames.add(key);
      if (sheet.seasonStartYear !== state.seasonStartYear) errors.push(`Outstanding offer sheet ${sheet.sheetId} is from another season.`);
    }
  }
  for (const [name, rows] of index) if (rows.length > 1) errors.push(`Player name key is ambiguous: ${name}`);
  const rostered = new Map();
  for (const player of state?.players ?? []) {
    const termSeasons = (player.contractSeasons ?? player.contract?.seasons ?? []).map(term => Number(term.seasonStartYear ?? term.fromYear)).filter(Number.isInteger);
    if (new Set(termSeasons).size !== termSeasons.length) errors.push(`Player ${player.canonicalName} has duplicate contract terms for a season.`);
    if (!player.teamCode) continue;
    const teamCode = String(player.teamCode).toUpperCase();
    const team = teamByCode.get(teamCode);
    if (!team) errors.push(`Player ${player.canonicalName} references unknown team ${teamCode}.`);
    else if (!(team.rosterNames ?? []).some(name => normalizeCanonicalPlayerName(name) === normalizeCanonicalPlayerName(player.canonicalName))) {
      errors.push(`Player ${player.canonicalName} is assigned to ${teamCode} but is absent from that team's roster.`);
    }
  }
  for (const team of state?.teams ?? []) {
    if (!team.teamCode) errors.push('Team is missing a teamCode.');
    const teamRostered = new Set();
    for (const name of team.rosterNames ?? []) {
      const resolution = resolvePlayerByCanonicalName(index, name);
      if (resolution.status !== 'resolved') errors.push(`Roster player ${name} on ${team.teamCode} is ${resolution.status}.`);
      const key = normalizeCanonicalPlayerName(name);
      if (teamRostered.has(key)) errors.push(`${team.teamCode} roster contains duplicate normalized player name ${name}.`);
      teamRostered.add(key);
      const priorTeam = rostered.get(key);
      if (priorTeam && priorTeam !== team.teamCode) errors.push(`${name} is rostered by both ${priorTeam} and ${team.teamCode}.`);
      rostered.set(key, team.teamCode);
      const rosterPlayer = resolution.status === 'resolved' ? resolution.matches[0] : null;
      if (rosterPlayer?.teamCode && String(rosterPlayer.teamCode).toUpperCase() !== team.teamCode) {
        errors.push(`${name} roster membership on ${team.teamCode} conflicts with player-state team ${rosterPlayer.teamCode}.`);
      }
      if (!teamByCode.has(team.teamCode)) errors.push(`Unknown team ${team.teamCode}.`);
    }
  }
  if (errors.length) {
    const error = new Error(`Invalid LeagueState: ${errors.join(' ')}`);
    error.validationErrors = errors;
    throw error;
  }
  return { valid: true, playerCount: state.players.length, teamCount: state.teams.length };
}

export function markStateProvisional(state, reasons = []) {
  const next = copy(state);
  const combined = [...new Set([...(next.stateQuality?.reasons ?? []), ...reasons].filter(Boolean))];
  next.stateQuality = { status: 'provisional', reasons: combined };
  for (const team of next.teams) {
    team.payrollState = {
      ...team.payrollState,
      status: 'provisional',
      provisionalReasons: [...new Set([...(team.payrollState?.provisionalReasons ?? []), ...reasons].filter(Boolean))],
    };
  }
  next.revision += 1;
  return next;
}
