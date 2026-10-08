// Pure franchise-preview logic, ported 1:1 from the vendored site release's
// season-lab-preview orchestration. The simulation engine, worker, and V4
// intake modules are untouched — these helpers only prepare validated inputs
// and derive display data for the native React UI.
export const SAVE_KEY_PREFIX = 'djhc:season-lab-franchise-preview:v1:';
export const GENERATED_SHOOTING_RATING_POLICY = 'generated-exposure-shrunk-snapshot-v1';
export const VERIFIED_FIXTURE_NAME = 'real-v4-browser-fixture-20261008.json';
export const VERIFIED_FIXTURE_RECEIPT_NAME = 'real-v4-browser-fixture-20261008.receipt.json';
export const VERIFIED_FIXTURE_RECEIPT_SHA256 = '4ccfb7481621a5297b0648a44b80edbaa2a2035eece5eeb99a4648b8fab37729';
export const COUNT_FIELDS = [
  ['MIN', ['minutes', 'minutesPlayed']], ['PTS', ['points', 'pts']], ['REB', ['rebounds', 'reb']],
  ['AST', ['assists', 'ast']], ['TOV', ['turnovers', 'tov']], ['STL', ['steals', 'stl']], ['BLK', ['blocks', 'blk']],
  ['FGM', ['fieldGoalsMade']], ['FGA', ['fieldGoalAttempts']],
  ['3PM', ['threePointersMade']], ['3PA', ['threePointAttempts']],
  ['FTM', ['freeThrowsMade']], ['FTA', ['freeThrowAttempts']],
  ['ORB', ['offensiveRebounds']], ['DRB', ['defensiveRebounds']], ['PF', ['personalFouls']],
];
export const SEASON_OPTIONS = [2025, 2024, 2023, 2022, 2021, 2020];

export const clone = value => structuredClone(value);

export const normalizeName = value =>
  String(value ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('en-US').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');

export function formatMinutes(value) {
  if (!Number.isFinite(Number(value))) return '—';
  return Number(Number(value).toFixed(3)).toString();
}

export const formatRotationInputDisplay = value => {
  const minutes = Number(value);
  return Number.isFinite(minutes) ? String(minutes) : '';
};

export function humanBytes(value) {
  const bytes = Number(value) || 0;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export async function sha256Hex(bytes) {
  if (!globalThis.crypto?.subtle?.digest) throw new Error('Web Crypto SHA-256 is unavailable; verified inputs were not loaded.');
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes));
  return [...digest].map(value => value.toString(16).padStart(2, '0')).join('');
}

export function readPayload(value) {
  const payload = value?.payload ?? value?.preparedPayload ?? value;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Fixture root must be a prepared franchise payload object.');
  const hasSession = payload.session && typeof payload.session === 'object';
  const hasInput = payload.sessionInput && typeof payload.sessionInput === 'object';
  if (!hasSession && !hasInput) throw new Error('Fixture needs either session or sessionInput.leagueState and schedule.');
  if (typeof payload.gameModelText !== 'string' || typeof payload.productionCandidateText !== 'string') {
    throw new Error('Fixture needs gameModelText and productionCandidateText as pinned text payloads.');
  }
  if (!payload.gameInputs || typeof payload.gameInputs !== 'object' || Array.isArray(payload.gameInputs)) {
    throw new Error('Fixture needs a gameInputs object keyed by scheduled game ID.');
  }
  return payload;
}

export function leagueStateFor(payload) {
  return payload?.session?.leagueState ?? payload?.sessionInput?.leagueState ?? null;
}

export function currentSource(payload, session) {
  return session?.sourceReceipt ?? payload?.session?.sourceReceipt ?? payload?.sessionInput?.sourceReceipt ?? null;
}

export function currentModel(payload, session) {
  return session?.modelReceipt ?? payload?.session?.modelReceipt ?? payload?.sessionInput?.modelReceipt ?? null;
}

export function sessionForTeam(payload, teamCode) {
  const prepared = { ...payload };
  if (prepared.sessionInput) {
    prepared.sessionInput = clone(prepared.sessionInput);
    const league = prepared.sessionInput.leagueState;
    if (!league || !Array.isArray(league.teams)) throw new Error('sessionInput.leagueState must contain the team roster.');
    if (!league.teams.some(team => String(team.teamCode).toUpperCase() === teamCode)) throw new Error(`User team ${teamCode} is outside this fixture.`);
    // User control is a local scenario choice when the fixture has not supplied one.
    league.userControlledTeamCodes = [teamCode];
  } else {
    const authorized = (prepared.session?.leagueState?.userControlledTeamCodes ?? []).map(code => String(code).toUpperCase());
    if (authorized.length !== 1) throw new Error('A saved franchise preview must name exactly one user-controlled team. Load sessionInput to choose the user team.');
    if (!authorized.includes(teamCode)) throw new Error(`Saved session is controlled by ${authorized.join(', ') || 'no team'}. Load a sessionInput fixture to choose another user team.`);
  }
  return prepared;
}

export function commandFailure(result) {
  if (!result || typeof result !== 'object') return 'Worker returned no action result.';
  if (result.error) return typeof result.error === 'string' ? result.error : result.error.message ?? JSON.stringify(result.error);
  if (['error', 'rejected', 'requires-review', 'stale', 'unavailable'].includes(String(result.status ?? '').toLowerCase())) {
    const details = result.violations ?? result.errors ?? result.validation?.violations ?? result.reason;
    return Array.isArray(details) ? details.join(' ') : (details || `Worker returned ${result.status}.`);
  }
  return null;
}

export const isStaleMessage = value => /stale|revision|already prepared against|out of date/i.test(String(value));

export function pinDetails(payload, session) {
  const source = currentSource(payload, session);
  const model = currentModel(payload, session);
  const state = session?.leagueState ?? leagueStateFor(payload);
  let modelText = null;
  try { modelText = JSON.parse(payload?.gameModelText ?? 'null'); } catch { modelText = null; }
  const packageName = source?.packageId ?? source?.sourceName ?? 'No package receipt';
  const season = source?.seasonStartYear ?? state?.seasonStartYear;
  const sourceDetail = source
    ? `Season ${season ?? '—'} · ${source.packageVersion ?? 'version not pinned'} · manifest ${String(source.packageManifestSha256 ?? 'missing').slice(0, 12)}${source.packageManifestSha256 ? '…' : ''}`
    : 'Package, season, and manifest pin are required.';
  const modelName = model?.modelId ?? modelText?.modelId ?? 'No model artifact';
  const modelDetail = model
    ? `${model.status ?? 'candidate status not supplied'} · ${session ? 'worker hash verified' : 'hash check pending'} · ${String(model.contentSha256 ?? 'missing').slice(0, 12)}${model.contentSha256 ? '…' : ''}`
    : modelText ? `${modelText.version ?? 'model artifact'} · worker will pin content hash at initialization`
      : 'A pinned game-model artifact is required.';
  const inputs = payload?.gameInputs && typeof payload.gameInputs === 'object' ? Object.keys(payload.gameInputs).length : 0;
  let candidateText = 'Production candidate text loaded; status not parsed.';
  try {
    const candidate = JSON.parse(payload?.productionCandidateText ?? 'null');
    if (candidate && typeof candidate === 'object') candidateText = `${candidate.modelId ?? candidate.id ?? 'Candidate'} · ${candidate.status ?? 'unverified'}`;
  } catch { candidateText = 'Production candidate text loaded; embedded metadata is not JSON.'; }
  const provisional = state?.stateQuality?.status !== 'reconciled' || model?.status !== 'validated';
  return { packageName, sourceDetail, modelName, modelDetail, inputs, candidateText, provisional };
}

export function rosterRowsForTeam(team, state) {
  const playerMap = new Map((state?.players ?? []).map(player => [normalizeName(player.canonicalName ?? player.name), player]));
  const year = state?.seasonStartYear;
  const rows = [];
  for (const rosterName of team?.rosterNames ?? []) {
    const player = playerMap.get(normalizeName(rosterName));
    if (!player) {
      rows.push({ name: String(rosterName), player: null, availability: 'unknown', excluded: true, reason: 'No exact player-state match' });
      continue;
    }
    const rosterStatus = String(player.rosterStatus?.value ?? player.rosterStatus?.status ?? player.rosterStatus ?? '').toLowerCase();
    const termList = player.contractSeasons ?? player.contract?.seasons ?? [];
    const terms = Array.isArray(termList) ? termList.filter(term => Number(term.seasonStartYear ?? term.fromYear) === Number(year)) : [];
    const term = terms.length === 1 ? terms[0] : null;
    const contractStatus = String(term?.optionDecisionStatus ?? term?.optionStatus ?? term?.status ?? '').toLowerCase();
    const excluded = player.retired === true || rosterStatus === 'retired' || ['waived', 'free-agent', 'unsigned'].includes(rosterStatus) ||
      term?.active === false || ['declined', 'expired', 'terminated', 'void', 'inactive'].includes(contractStatus);
    const gameStatusNode = player.gameAvailability ?? player.availability ?? player.availabilityStatus ?? player.status;
    const gameStatus = String(gameStatusNode?.value ?? gameStatusNode?.status ?? gameStatusNode ?? '').toLowerCase();
    const unavailable = !excluded && (gameStatus === 'unavailable' || ['out', 'inactive', 'not-available'].includes(gameStatus) ||
      player.available === false || player.isAvailable === false || player.active === false);
    const availability = excluded ? 'excluded' : unavailable ? 'unavailable' :
      (gameStatus === 'available' || player.available === true || player.isAvailable === true || player.active === true) ? 'available' : 'unknown';
    const limitValue = player.gameAvailability?.minutesLimit ?? player.availability?.minutesLimit ?? player.minutesLimit;
    const limitStatus = String(limitValue?.valueStatus ?? limitValue?.status ?? '').toLowerCase();
    const limitNumber = Number(limitValue?.value ?? limitValue);
    const limit = limitValue !== null && limitValue !== undefined && !/unknown|candidate|conflict|unresolved|missing|invalid/.test(limitStatus) && Number.isFinite(limitNumber)
      ? Math.min(48, Math.max(0, limitNumber)) : 48;
    rows.push({ name: String(player.canonicalName ?? player.name ?? rosterName), player,
      availability, unavailable: unavailable || excluded, excluded, limit, reason: excluded ? 'Excluded by current roster/contract status' : null });
  }
  return rows;
}

export const savedRotation = (team, year) => team?.franchiseControlsBySeason?.[String(year)] ?? null;

export function splitSavedControls(control) {
  const active = new Set((control?.activeRotation ?? []).map(normalizeName));
  const starters = new Set((control?.starters ?? []).map(normalizeName));
  const minutes = new Map((control?.minuteAssignments ?? []).map(row => [normalizeName(row.canonicalName ?? row.playerName), Number(row.minutes)]));
  return { active, starters, minutes };
}

export function defaultDraft(rows) {
  const eligible = rows.filter(row => !row.excluded);
  const chosen = eligible.filter(row => !row.unavailable).slice(0, Math.min(8, eligible.length));
  const minutes = new Map(eligible.map(row => [normalizeName(row.name), 0]));
  let assigned = 0;
  while (assigned < 240) {
    let progressed = false;
    const order = [...chosen].sort((a, b) => (minutes.get(normalizeName(a.name)) ?? 0) - (minutes.get(normalizeName(b.name)) ?? 0));
    for (const row of order) {
      if (assigned >= 240) break;
      const key = normalizeName(row.name);
      const current = minutes.get(key) ?? 0;
      const cap = Math.min(48, Math.floor(row.limit ?? 48));
      if (current < cap) { minutes.set(key, current + 1); assigned += 1; progressed = true; }
    }
    if (!progressed) break;
  }
  return eligible.map((row, index) => ({
    name: row.name,
    active: chosen.includes(row) && (minutes.get(normalizeName(row.name)) ?? 0) > 0,
    starter: chosen.slice(0, 5).includes(row) && (minutes.get(normalizeName(row.name)) ?? 0) > 0,
    minutes: minutes.get(normalizeName(row.name)) ?? 0,
    availability: row.availability,
    limit: row.limit,
    player: row.player,
    order: index,
  }));
}

export function loadRotationDraft(team, state) {
  const rows = rosterRowsForTeam(team, state);
  const eligible = rows.filter(row => !row.excluded);
  const control = savedRotation(team, state.seasonStartYear);
  if (!control) return defaultDraft(rows);
  const saved = splitSavedControls(control);
  return eligible.map((row, index) => {
    const key = normalizeName(row.name);
    return { name: row.name, active: saved.active.has(key), starter: saved.starters.has(key),
      minutes: saved.minutes.get(key) ?? 0, availability: row.availability, limit: row.limit,
      player: row.player, order: index, unavailable: row.unavailable };
  });
}

export function rotationValidation(activeSession, activeTeamCode, rotationDraft) {
  if (!activeSession || !activeTeamCode) return { ready: false, messages: ['Load a scenario first.'], total: 0, active: [], starters: [] };
  const state = activeSession.leagueState;
  const team = state.teams?.find(row => String(row.teamCode).toUpperCase() === activeTeamCode);
  const allRows = rosterRowsForTeam(team, state).filter(row => !row.excluded);
  const eligibleKeys = new Set(allRows.map(row => normalizeName(row.name)));
  const active = rotationDraft.filter(row => row.active);
  const starters = rotationDraft.filter(row => row.starter);
  const messages = [];
  const total = rotationDraft.reduce((sum, row) => sum + (Number.isFinite(Number(row.minutes)) ? Number(row.minutes) : 0), 0);
  if (active.length < 5) messages.push('Select at least five active players.');
  if (active.length > 10) messages.push('The active rotation can contain at most ten players.');
  if (starters.length !== 5) messages.push('Choose exactly five starters.');
  for (const row of rotationDraft) {
    const key = normalizeName(row.name);
    const minutes = Number(row.minutes);
    if (!eligibleKeys.has(key)) messages.push(`${row.name} is not an eligible current-roster player.`);
    if (!Number.isFinite(minutes) || minutes < 0 || minutes > 48) messages.push(`${row.name} needs minutes from 0 through 48.`);
    if (row.active && minutes <= 0) messages.push(`${row.name} is active but has no minutes.`);
    if (!row.active && Math.abs(minutes) > 0) messages.push(`${row.name} is inactive but has minutes.`);
    if (row.active && row.availability === 'unavailable') messages.push(`${row.name} is marked unavailable.`);
    if (minutes > (row.limit ?? 48)) messages.push(`${row.name} exceeds the explicit minutes limit of ${row.limit}.`);
  }
  for (const row of starters) if (!row.active) messages.push(`${row.name} must be active to start.`);
  if (Math.abs(total - 240) > 1e-7) messages.push(`Minutes total ${formatMinutes(total)}; regulation requires exactly 240.`);
  return { ready: messages.length === 0, messages: [...new Set(messages)], total, active, starters };
}

export function rotationMatchesSaved(control, rotationDraft) {
  if (!control || !Array.isArray(control.minuteAssignments)) return false;
  const sameNameSet = (left, right) => {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
    const leftNames = new Set(left.map(normalizeName)), rightNames = new Set(right.map(normalizeName));
    return leftNames.size === left.length && rightNames.size === right.length &&
      leftNames.size === rightNames.size && [...leftNames].every(name => rightNames.has(name));
  };
  const currentActive = rotationDraft.filter(row => row.active).map(row => row.name);
  const currentStarters = rotationDraft.filter(row => row.starter).map(row => row.name);
  const currentInactive = rotationDraft.filter(row => !row.active).map(row => row.name);
  if (!sameNameSet(control.activeRotation, currentActive) || !sameNameSet(control.starters, currentStarters) ||
      !sameNameSet(control.inactiveRotation, currentInactive)) return false;
  const storedMinutes = new Map(control.minuteAssignments.map(row => [normalizeName(row.canonicalName ?? row.playerName), Number(row.minutes)]));
  return rotationDraft.length === storedMinutes.size && rotationDraft.every(row => {
    const stored = storedMinutes.get(normalizeName(row.name));
    return Number.isFinite(stored) && Number.isFinite(Number(row.minutes)) && Math.abs(stored - Number(row.minutes)) <= 1e-7;
  });
}

export function makeRotationControls(activeSession, activeTeamCode, rotationDraft) {
  const validation = rotationValidation(activeSession, activeTeamCode, rotationDraft);
  if (!validation.ready) throw new Error(validation.messages.join(' '));
  const team = activeSession.leagueState.teams.find(row => String(row.teamCode).toUpperCase() === activeTeamCode);
  const saved = savedRotation(team, activeSession.leagueState.seasonStartYear);
  const preserveOrder = (rows, priorNames) => {
    const namesByKey = new Map(rows.map(row => [normalizeName(row.name), row.name]));
    const ordered = [];
    for (const name of Array.isArray(priorNames) ? priorNames : []) {
      const key = normalizeName(name);
      if (namesByKey.has(key)) { ordered.push(namesByKey.get(key)); namesByKey.delete(key); }
    }
    for (const row of rows) {
      const key = normalizeName(row.name);
      if (namesByKey.has(key)) { ordered.push(row.name); namesByKey.delete(key); }
    }
    return ordered;
  };
  const active = rotationDraft.filter(row => row.active);
  const inactive = rotationDraft.filter(row => !row.active);
  const starters = preserveOrder(validation.starters, saved?.starters);
  const activeRotation = preserveOrder(active, saved?.activeRotation);
  const inactiveRotation = preserveOrder(inactive, saved?.inactiveRotation);
  const benchOrder = preserveOrder(active.filter(row => !row.starter), saved?.rotationControls?.benchOrder);
  return {
    seasonStartYear: activeSession.leagueState.seasonStartYear,
    starters,
    activeRotation,
    inactiveRotation,
    minuteAssignments: rotationDraft.map(row => ({ canonicalName: row.name, minutes: Number(row.minutes) })),
    gameDurationMinutes: 48,
    rotationControls: {
      starters,
      benchOrder,
    },
  };
}

export function makeBrowserKey(session, activeTeamCode) {
  const source = currentSource(null, session);
  const model = currentModel(null, session);
  const year = session?.leagueState?.seasonStartYear;
  const team = activeTeamCode || (session?.leagueState?.userControlledTeamCodes ?? [])[0];
  if (!source?.packageManifestSha256 || !model?.contentSha256 || !Number.isInteger(year) || !team) return null;
  return `${SAVE_KEY_PREFIX}${source.packageManifestSha256.toLowerCase()}:${model.contentSha256.toLowerCase()}:${year}:${encodeURIComponent(String(team).toUpperCase())}`;
}

export function exportedSaveMatches(saveText, session, activeTeamCode) {
  if (typeof saveText !== 'string' || !saveText.trim()) throw new Error('Worker export did not return saveText.');
  const saved = JSON.parse(saveText);
  const source = currentSource(null, session);
  const model = currentModel(null, session);
  if (saved?.format !== 'djhc-player-franchise-session-v1') throw new Error('Export has an unsupported franchise save format.');
  if (saved?.sourceReceipt?.packageManifestSha256 !== source?.packageManifestSha256 ||
      saved?.modelReceipt?.contentSha256 !== model?.contentSha256) throw new Error('Export source or model pins do not match the active session.');
  if (saved?.leagueState?.seasonStartYear !== session?.leagueState?.seasonStartYear) throw new Error('Export season does not match the active session.');
  if (!Number.isInteger(saved?.revision) || saved.revision !== session?.revision) throw new Error('Export revision does not match the current session snapshot.');
  const savedTeams = (saved?.leagueState?.userControlledTeamCodes ?? []).map(code => String(code).toUpperCase());
  if (savedTeams.length !== 1 || savedTeams[0] !== activeTeamCode) throw new Error('Export user-team control does not match the active scenario.');
  return saved;
}

export const upcomingGame = session => session?.schedule?.[session.scheduleCursor] ?? null;

export const gameDateMap = (session = null) =>
  new Map((session?.schedule ?? []).map(game => [game.gameId, game.gameLocalDate]));

export const completedGames = session => {
  const year = session?.leagueState?.seasonStartYear;
  return (session?.leagueState?.completedGames ?? []).filter(game => game.seasonStartYear === year);
};

export function recordFor(teamCode, games) {
  let wins = 0, losses = 0;
  for (const game of games) {
    const homeCode = String(game.homeTeamCode ?? game.homeTeam ?? '').toUpperCase();
    const awayCode = String(game.awayTeamCode ?? game.awayTeam ?? '').toUpperCase();
    const homeWon = Number(game.homeScore) > Number(game.awayScore);
    if (homeCode === teamCode) { if (homeWon) wins += 1; else losses += 1; }
    if (awayCode === teamCode) { if (!homeWon) wins += 1; else losses += 1; }
  }
  return { wins, losses };
}

export const statsForLog = row => row?.stats && typeof row.stats === 'object' ? row.stats : row ?? {};

export function statValue(stats, aliases) {
  for (const key of aliases) if (stats?.[key] !== undefined && stats?.[key] !== null) return stats[key];
  return '—';
}

export function displayBoxStat(label, stats, aliases) {
  const value = statValue(stats, aliases);
  const numeric = Number(value);
  return label === 'MIN' && value !== '—' && Number.isFinite(numeric) ? numeric.toFixed(1) : value;
}

export function multiTeamV4Choices(intake) {
  const groups = new Map();
  for (const row of intake?.playerSeasonEvidence ?? []) {
    const key = String(row.normalizedPlayerNameKey ?? '');
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return [...groups.entries()].map(([key, rows]) => ({
    key,
    rows: rows.sort((a, b) => String(a.teamCode).localeCompare(String(b.teamCode))
      || String(a.source?.recordId).localeCompare(String(b.source?.recordId))),
    teams: [...new Set(rows.map(row => String(row.teamCode ?? '').toUpperCase()).filter(Boolean))].sort(),
  })).filter(group => group.teams.length > 1).sort((a, b) => {
    const aName = a.rows[0]?.displayName ?? a.key;
    const bName = b.rows[0]?.displayName ?? b.key;
    return String(aName).localeCompare(String(bName));
  });
}

export function buildV4RosterChoiceReceipt(intake, rosterChoices, choiceProvenance, suggestionsByName) {
  const choices = multiTeamV4Choices(intake).flatMap(group => {
    const teamCode = rosterChoices.get(group.key);
    if (!teamCode || !group.teams.includes(teamCode)) return [];
    const provenance = choiceProvenance.get(group.key) === 'generated'
      ? 'generated-last-observed-team-scenario-choice' : 'explicit-user-selection';
    const suggestion = suggestionsByName.get(group.key);
    const sourceRows = group.rows.filter(row => row.teamCode === teamCode).map(row => ({
      artifactId: row.source?.artifactId ?? null,
      recordId: row.source?.recordId ?? null,
      partSha256: row.source?.partSha256 ?? null,
    }));
    const suggestionEvidence = provenance === 'generated-last-observed-team-scenario-choice' && suggestion
      ? {
        policy: suggestion.policy ?? 'last-observed-team-scenario',
        teamCode: suggestion.teamCode ?? null,
        latestGameLocalDate: suggestion.latestGameLocalDate ?? null,
        observations: (suggestion.observations ?? []).map(row => ({
          artifactId: row.artifactId ?? null,
          recordId: row.recordId ?? null,
          partSha256: row.partSha256 ?? null,
          gameRef: row.gameRef ?? null,
          gameLocalDate: row.gameLocalDate ?? null,
          scheduledAtUtc: row.scheduledAtUtc ?? null,
          teamCode: row.teamCode ?? null,
        })),
      }
      : null;
    return [{
      normalizedPlayerNameKey: group.key,
      displayName: group.rows[0]?.displayName ?? group.key,
      teamCode,
      choiceSource: provenance,
      appliedByUser: true,
      exactSeasonAggregateRows: sourceRows,
      ...(suggestionEvidence ? { suggestion: suggestionEvidence } : {}),
    }];
  });
  return {
    format: 'djhc-v4-franchise-roster-choice-receipt-v1',
    seasonStartYear: intake?.scenario?.seasonStartYear ?? null,
    phase: 'regular',
    mode: 'retrospective-user-scenario',
    disclosure: 'Generated latest-team suggestions are scenario choices explicitly applied by the user; they are not roster or contract facts.',
    suggestionPolicy: intake?.sourceReceipts?.playerGames?.useBoundary ?? null,
    playerGamesPartSha256: intake?.sourceReceipts?.playerGames?.part?.sha256 ?? null,
    choices,
  };
}

export function suggestionLabel(suggestion, provenance, selectedTeam) {
  if (provenance === 'generated') return `Generated scenario choice · ${selectedTeam} · explicitly applied by user`;
  if (provenance === 'explicit') return `Explicit user roster choice · ${selectedTeam}`;
  if (suggestion?.status === 'suggested-not-applied') return `Unique latest regular-game observation · ${suggestion.teamCode} · not applied`;
  if (String(suggestion?.status ?? '').includes('tied')) {
    const codes = suggestion.teamCodes ?? suggestion.tiedTeamCodes ?? [];
    return `Tied latest date · held for review${codes.length ? ` · ${codes.join(' / ')}` : ''}`;
  }
  if (suggestion) return `No unique team suggestion · ${suggestion.status ?? 'unknown evidence'} · held for review`;
  return 'Exact team selection required';
}

export function receiptPartSummary(receipt) {
  const parts = Object.values(receipt?.parts ?? {});
  if (!parts.length) return receipt?.artifactId ? `${receipt.artifactId} · SHA ${String(receipt.sha256 ?? 'unavailable').slice(0, 12)}…` : 'Pinned artifact receipt';
  return parts.slice(0, 3).map(part => `${part.artifactId ?? 'part'} ${part.rows ?? '—'} rows · ${String(part.sha256 ?? 'missing').slice(0, 12)}…`).join(' · ');
}