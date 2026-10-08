// Native React orchestration for the franchise tab — a 1:1 port of the site
// release's season-lab-preview control flow. Every worker command, validation
// gate, receipt check, and save path is preserved; only the DOM rendering is
// replaced by React state. The simulation engine modules are never touched.
import { useEffect, useReducer, useRef, useState } from 'react';
import {
  clone, normalizeName, formatMinutes, humanBytes, leagueStateFor, currentSource, currentModel,
  sessionForTeam, commandFailure, isStaleMessage, pinDetails, rosterRowsForTeam, savedRotation,
  loadRotationDraft, rotationValidation, rotationMatchesSaved, makeRotationControls, makeBrowserKey,
  exportedSaveMatches, upcomingGame, gameDateMap, completedGames, recordFor, statsForLog, displayBoxStat,
  multiTeamV4Choices, buildV4RosterChoiceReceipt, suggestionLabel, receiptPartSummary,
  deriveRosterModeAssignments, readPayload,
  GENERATED_SHOOTING_RATING_POLICY, COUNT_FIELDS, SEASON_OPTIONS, SAVE_KEY_PREFIX,
} from './franchiseLogic';
import {
  loadFranchiseEngine, createFranchiseWorker, fetchJsonText, loadVerifiedFixturePayload,
  GAME_MODEL_PATH, PRODUCTION_CANDIDATE_PATH,
} from './franchiseEngine';

const upper = value => String(value ?? '').toUpperCase();
const readSavedText = key => {
  try { return key ? localStorage.getItem(key) : null; }
  catch { return null; }
};

const freshState = () => ({
  // Setup inputs (mirror of the preview frame's control values)
  v4Year: 2025, v4YearSelected: false, v4UserTeam: '', fixtureUserTeam: '', generateRating: false,
  // Engine + session
  client: null, workerCapabilities: null, activeSession: null, activeTeamCode: '',
  rotationDraft: [], draftSessionRef: null, draftTeamRef: '', rawMinutesText: new Map(),
  fixturePayload: null, fixtureName: '', fixtureMeta: null,
  lastGameOutput: null, lastSeasonCompletion: null, lastSeasonCompletionRevision: null,
  busy: false,
  // V4 intake
  v4Api: null, v4Intake: null, v4GameModelText: '', v4ProductionCandidateText: '', v4GameModelMeta: null, v4ProductionMeta: null,
  v4RosterChoices: new Map(), v4ChoiceProvenance: new Map(), v4SuggestionsByName: new Map(),
  v4SuggestionSummary: null, v4OperationNotice: null,
  v4PlayerGamesPart: null, v4RosterMode: null,
  ratingReceipt: null,
  // Saves
  storageBackend: 'localstorage', franchiseBrowserStore: null, browserSaveCheckKey: '',
  browserSaveCheckPending: false, hasIndexedDbCheckpoint: false,
  // Status surfaces
  workerStatus: { text: 'Engine loading…', state: 'idle' }, message: null, saveStatus: 'No checkpoint loaded.',
});

function currentV4OperationNotice(state) {
  const notice = state.v4OperationNotice;
  if (!notice || Number(notice.seasonStartYear) !== Number(state.v4Year)) return null;
  if (notice.operation === 'suggestions' && !(state.v4Intake && Number(state.v4Intake.scenario?.seasonStartYear) === Number(state.v4Year))) return null;
  return notice;
}

function v4IntakeReadyForStart(state, selectedTeam) {
  const intake = state.v4Intake;
  const matchesYear = Boolean(intake && Number(intake.scenario?.seasonStartYear) === Number(state.v4Year));
  if (!matchesYear || !intake?.leagueState || !selectedTeam) return false;
  if (intake.status !== 'ready-for-user-scenario-setup' || (intake.unresolvedRosterChoices ?? []).length) return false;
  if (intake.scenario?.phase !== 'regular' || intake.scenario?.forecast !== false) return false;
  if ((intake.leagueState.teams ?? []).length !== 30 || (intake.teamRates?.rows ?? []).length !== 30) return false;
  if (!state.v4GameModelText || !state.v4ProductionCandidateText) return false;
  return (intake.leagueState.teams ?? []).some(team => upper(team.teamCode) === selectedTeam);
}

function setRatingReceipt(state, receipt = null, profileReview = null) {
  if (Array.isArray(profileReview)) {
    const missingShooting = profileReview.filter(row => (row.missingInputs ?? []).some(input => String(input).toLowerCase() === 'shootingrating'));
    if (!missingShooting.length) return;
    state.ratingReceipt = { kind: 'review', count: missingShooting.length, names: missingShooting.map(row => row.canonicalName ?? row.name ?? 'Unnamed player') };
    return;
  }
  if (!receipt) {
    state.ratingReceipt = { kind: 'idle', text: 'No scenario initialized. Missing shooting ratings are rejected unless you explicitly enable the provisional policy.' };
    return;
  }
  const rows = Array.isArray(receipt.rows) ? receipt.rows : [];
  const count = Number.isInteger(receipt.count) ? receipt.count : rows.length;
  if (count > 0) {
    state.ratingReceipt = {
      kind: 'generated', count, policy: receipt.policy ?? GENERATED_SHOOTING_RATING_POLICY,
      rows: rows.slice(0, 40).map(row => ({
        name: row.canonicalName ?? 'Unnamed player',
        value: Number.isFinite(Number(row.value)) ? Number(row.value).toFixed(1) : null,
        method: row.method ?? receipt.policy ?? 'Generated scenario method',
      })),
      more: count > rows.length ? count - rows.length : count > 40 ? count - 40 : 0,
      preserved: receipt.originalSourceValuesPreserved === true ? 'yes' : 'not confirmed',
    };
    return;
  }
  state.ratingReceipt = { kind: 'ready', text: `No provisional shooting ratings were generated under ${receipt.policy ?? 'reject'}; the source rating values were preserved.` };
}

function fixtureTeamValue(state) {
  const payloadState = leagueStateFor(state.fixturePayload);
  let teams = Array.isArray(payloadState?.teams) ? payloadState.teams : [];
  if (state.fixturePayload?.session) {
    const authorized = (payloadState?.userControlledTeamCodes ?? []).map(upper);
    if (authorized.length !== 1) teams = [];
    else teams = teams.filter(team => upper(team.teamCode) === authorized[0]);
  }
  const raw = state.fixtureUserTeam
    || (state.activeSession ? [...(state.activeSession.leagueState?.userControlledTeamCodes ?? [])][0] : '')
    || (payloadState?.userControlledTeamCodes ?? [])[0];
  const options = teams.map(team => {
    const code = upper(team.teamCode);
    return { code, label: `${team.teamName ?? team.name ?? code} · ${code}` };
  });
  const value = options.some(option => option.code === raw) ? raw : options[0]?.code ?? '';
  const message = !teams.length
    ? (state.fixturePayload?.session ? 'Saved session needs exactly one user team' : 'No teams found')
    : null;
  return { options, value, message };
}

// One render pass derives every display structure the site's render* functions
// produced, straight from the same state fields.
function computeView(state) {
  const session = state.activeSession;
  const busy = state.busy;
  const view = { busy, message: state.message, workerStatus: state.workerStatus, saveStatus: state.saveStatus, storageBackend: state.storageBackend, hasSession: Boolean(session) };
  view.pins = pinDetails(state.fixturePayload, session);
  view.qualityPill = { label: view.pins.provisional ? 'Provisional / generated' : 'Source reconciled', kind: view.pins.provisional ? 'amber' : 'green' };

  // === V4 intake panel ===
  const intake = state.v4Intake;
  const v4Year = Number(state.v4Year);
  const notice = currentV4OperationNotice(state);
  let v4Status;
  if (!intake) {
    v4Status = notice
      ? { state: notice.kind, title: notice.message, metrics: [], issues: [] }
      : { state: 'idle', title: `Choose your starting season to load the pinned regular-season V4 source set.${state.v4YearSelected ? ` No verified V4 source is loaded for ${state.v4Year}.` : ''}`, metrics: [], issues: [] };
  } else {
    const scenario = intake.scenario ?? {};
    const playerCount = Number(intake.candidatePlayerCount ?? intake.playerSeasonEvidence?.length ?? 0);
    const teamCount = intake.teamRates?.rows?.length ?? 0;
    const scheduleCount = intake.schedule?.games?.length ?? 0;
    const unresolvedCount = intake.unresolvedRosterChoices?.length ?? 0;
    const model = state.v4GameModelMeta;
    const production = state.v4ProductionMeta;
    let status = intake.status === 'ready-for-user-scenario-setup'
      ? session?.sourceReceipt?.mode === 'retrospective-user-scenario'
        ? 'The 30-team regular-season retrospective scenario is initialized. Source choices are locked for this session.'
        : 'All exact-team choices are resolved. This is ready to start as a regular-season retrospective/user-created scenario.'
      : intake.status === 'needs-explicit-roster-choice'
        ? `${unresolvedCount} multi-team names still need an exact franchise selection. Ties and unknown suggestions stay unresolved.`
        : `${intake.status ?? 'V4 intake loaded'} · review the listed source issues before continuing.`;
    const forecastLabel = scenario.forecast === false ? 'Not a forecast' : 'Forecast boundary unavailable';
    const loadedYear = Number(scenario.seasonStartYear);
    let statusState = intake.status === 'ready-for-user-scenario-setup' ? 'ready' : 'review';
    if (notice) {
      status = `${notice.message} Currently loaded source: ${loadedYear} (${scenario.phase ?? 'phase unavailable'} phase).`;
      statusState = notice.kind;
    } else if (v4Year !== loadedYear) {
      status = `Loaded V4 source is the ${loadedYear} regular season; the selected year is ${v4Year}. Load the selected year before applying choices or starting.`;
      statusState = 'review';
    }
    v4Status = {
      state: statusState, title: status,
      metrics: [
        `${scenario.seasonStartYear}–${String(Number(scenario.seasonStartYear) + 1).slice(-2)} · ${scenario.phase ?? 'phase unavailable'} phase`,
        `${teamCount} team rates · ${playerCount} player-team candidate rows · ${scheduleCount} scheduled games`,
        `${forecastLabel} · ${scenario.gameInputReadiness ?? 'rotation readiness unavailable'}`,
        `Game model: ${model?.modelId ?? model?.format ?? 'not loaded'} · ${model?.status ?? model?.version ?? 'status not supplied'}`,
        `Production source: ${production?.modelId ?? production?.candidateId ?? production?.format ?? 'not loaded'} · ${production?.status ?? production?.version ?? 'status not supplied'}`,
        'Contracts / payroll: unknown · postseason / offseason: disabled',
      ],
      issues: (intake.issues ?? []).map(issue => issue.message ?? issue.code ?? 'V4 issue requires review'),
    };
  }
  const loadedForSelectedYear = Boolean(intake && Number(intake.scenario?.seasonStartYear) === v4Year);
  const canReview = loadedForSelectedYear && !session;
  const readyForStart = v4IntakeReadyForStart(state, state.v4UserTeam);

  // Source receipts (renderV4Receipts)
  const receiptRows = intake
    ? Object.entries(intake.sourceReceipts ?? {}).filter(([, receipt]) => receipt && typeof receipt === 'object').map(([key, receipt]) => {
      const label = receipt.capabilityId ?? receipt.artifactId ?? key;
      const packageRef = receipt.package;
      const packageLabel = packageRef?.packageId
        ? `${packageRef.packageId} · ${packageRef.packageVersion ?? 'version not supplied'}`
        : receipt.source?.package?.packageId ?? 'Pinned local artifact';
      const manifest = packageRef?.packageManifestSha256 ?? receipt.source?.package?.packageManifestSha256
        ?? receipt.registrySha256 ?? receipt.sha256;
      const scope = receipt.registryUrl
        ? `${receipt.localMirror ? 'Same-origin local mirror' : 'Reviewed canonical'} · ${receipt.registryPath ?? receipt.registryUrl}`
        : receipt.scope?.kind === 'exact-season'
          ? `Exact ${receipt.scope.seasonStartYears?.join(', ') ?? 'season'} · ${receipt.scope.phases?.join(', ') ?? 'phase'}`
          : receipt.useBoundary ?? 'Pinned and hash-checked local evidence';
      return {
        label, packageLabel, scope, partSummary: receiptPartSummary(receipt),
        releaseHashes: receipt.registrySha256
          ? { registry: receipt.registrySha256.slice(0, 16), revision: String(receipt.registryRevisionSha256 ?? 'missing').slice(0, 16), pins: Number(receipt.packagePinCount ?? 0), full: receipt.registrySha256 }
          : null,
        manifest: manifest ? String(manifest).slice(0, 16) : null,
      };
    })
    : [];

  // Roster-choice review (renderV4RosterReview)
  let choiceCount = 'No V4 source loaded';
  let groups = [];
  let appliedSummary = null;
  if (intake) {
    const allGroups = multiTeamV4Choices(intake);
    const unresolved = new Map((intake.unresolvedRosterChoices ?? []).map(choice => [choice.normalizedPlayerNameKey, choice]));
    const generated = [], explicit = [], unresolvedNames = [];
    choiceCount = `${allGroups.length} multi-team names · ${unresolved.size} unresolved`;
    groups = allGroups.map(group => {
      const choice = unresolved.get(group.key);
      const suggestion = state.v4SuggestionsByName.get(group.key) ?? choice?.suggestion ?? null;
      const selectedTeam = state.v4RosterChoices.get(group.key) ?? '';
      const provenance = state.v4ChoiceProvenance.get(group.key) ?? '';
      if (provenance === 'generated') generated.push({ name: group.rows[0]?.displayName ?? group.key, teamCode: selectedTeam });
      else if (provenance === 'explicit' && selectedTeam) explicit.push({ name: group.rows[0]?.displayName ?? group.key, teamCode: selectedTeam });
      if (!selectedTeam || !group.teams.includes(selectedTeam)) unresolvedNames.push(group.key);
      const evidenceRows = group.rows.map(row => {
        const identity = row.identityEvidence?.status ?? row.identityEvidence?.reason ?? 'identity evidence retained';
        const source = row.source ?? {};
        return `${row.teamCode} · ${row.phase ?? 'regular'} · ${row.games ?? '—'} GP · ${formatMinutes(row.minutes)} min · ${source.artifactId ?? 'V4'} / ${source.recordId ?? 'record id unavailable'} · identity ${identity}`;
      });
      return {
        key: group.key,
        name: group.rows[0]?.displayName ?? group.key,
        label: suggestionLabel(suggestion, provenance, selectedTeam),
        observed: suggestion?.latestGameLocalDate ? `Latest observed game: ${suggestion.latestGameLocalDate}.` : '',
        provenance, selectedTeam,
        options: group.teams,
        evidenceCount: group.rows.length, evidenceRows,
        pill: provenance === 'generated' ? { text: 'Generated', kind: 'amber' } : selectedTeam ? { text: 'Chosen', kind: 'green' } : { text: 'Needs choice', kind: 'slate' },
      };
    });
    const applied = [...generated, ...explicit];
    const summary = [`${allGroups.length - unresolvedNames.length} multi-team choices applied`, `${generated.length} generated scenario choices`, `${explicit.length} explicit manual choices`, `${unresolvedNames.length} held for review`];
    const appliedRows = applied.map(row => `${row.name} · ${row.teamCode} · ${generated.some(item => item.name === row.name && item.teamCode === row.teamCode) ? 'generated scenario choice applied by user' : 'explicit user choice'}`);
    appliedSummary = {
      text: summary.join(' · '),
      suggestionNote: state.v4SuggestionSummary
        ? `${state.v4SuggestionSummary.uniqueApplied} unique latest-team suggestions applied by explicit click · ${state.v4SuggestionSummary.tiedHeld} tied names held · ${state.v4SuggestionSummary.unknownHeld} unknown names held`
        : '',
      appliedRows,
    };
  }

  const teamSource = intake?.leagueState?.teams?.length ? intake.leagueState.teams : (intake?.teamRates?.rows ?? []);
  const teamOptions = [...teamSource]
    .sort((a, b) => String(a.teamCode).localeCompare(String(b.teamCode)))
    .map(team => {
      const code = upper(team.teamCode);
      return { code, label: `${team.teamName ?? team.name ?? code} · ${code}` };
    })
    .filter(option => option.code);
  const v4TeamSelected = teamOptions.some(option => option.code === state.v4UserTeam) ? state.v4UserTeam : '';

  view.v4 = {
    year: state.v4YearSelected ? state.v4Year : '', seasons: SEASON_OPTIONS,
    yearDisabled: busy || Boolean(session),
    canLoad: !busy && !session && state.v4YearSelected,
    teamOptions, teamSelected: v4TeamSelected,
    teamDisabled: busy || Boolean(session) || !loadedForSelectedYear,
    teamMessage: teamOptions.length ? 'Choose a team to control' : 'Load V4 source first',
    canSuggest: !busy && canReview && Boolean(intake?.unresolvedRosterChoices?.length) && !intake?.suggestionsGenerated,
    ratingDisabled: busy || Boolean(session) || !loadedForSelectedYear,
    generateRating: state.generateRating,
    canInitialize: !busy && !session && readyForStart,
    status: v4Status, notice, choiceCount, groups, appliedSummary,
    ratingReceipt: state.ratingReceipt,
    choiceDisabled: busy || Boolean(session),
    sessionLocked: Boolean(session),
    rosterMode: state.v4RosterMode,
    canAssign: !busy && canReview && groups.length > 0,
    unresolvedGroups: groups.filter(group => !group.selectedTeam || !group.options.includes(group.selectedTeam)),
  };

  // === Fixture panel ===
  const fixtureTeams = fixtureTeamValue(state);
  view.fixture = {
    name: state.fixtureName, meta: state.fixtureMeta,
    options: fixtureTeams.options, value: fixtureTeams.value, optionMessage: fixtureTeams.message,
    selectDisabled: Boolean(session) || busy,
    canInitialize: !busy && !session && Boolean(state.fixturePayload) && Boolean(fixtureTeams.value),
    fileDisabled: busy || Boolean(session),
    sessionLocked: Boolean(session),
  };

  // === Session rail (renderState) ===
  if (!session) {
    view.revision = 'Revision —';
    view.stateMetrics = [
      { label: 'Season', value: '—' }, { label: 'Teams', value: '—' },
      { label: 'Games played', value: '—' }, { label: 'Remaining', value: '—' },
    ];
    view.stateQuality = 'State receipt not loaded.';
    view.records = [];
  } else {
    const league = session.leagueState;
    const games = completedGames(session);
    const remaining = Math.max(0, (session.schedule?.length ?? 0) - Number(session.scheduleCursor ?? 0));
    view.revision = `Revision ${session.revision ?? '—'}`;
    view.stateMetrics = [
      { label: 'Season', value: `${Number(league.seasonStartYear)}–${String(Number(league.seasonStartYear) + 1).slice(-2)}` },
      { label: 'Teams', value: league.teams?.length ?? 0 },
      { label: 'Games played', value: games.length },
      { label: 'Remaining', value: remaining },
    ];
    const quality = league.stateQuality ?? {};
    const reasons = Array.isArray(quality.reasons) ? quality.reasons : [];
    view.stateQuality = `${quality.status ?? 'quality unspecified'}${reasons.length ? ` · ${reasons.join(' ')}` : ''}`;
    view.records = (league.teams ?? []).map(team => {
      const code = upper(team.teamCode);
      const saved = team.seasonStatsByYear?.[String(league.seasonStartYear)];
      const record = saved ? { wins: Number(saved.wins ?? 0), losses: Number(saved.losses ?? 0) } : recordFor(code, games);
      return { code, wins: record.wins, losses: record.losses, games: record.wins + record.losses };
    }).sort((a, b) => (b.wins - a.wins) || (a.losses - b.losses) || a.code.localeCompare(b.code));
  }

  // === Team / rotation panel ===
  const league = session?.leagueState;
  const team = league?.teams?.find(row => upper(row.teamCode) === state.activeTeamCode);
  if (!session || !team) {
    view.team = {
      empty: true,
      text: 'Initialize a prepared scenario to inspect its roster and control the selected user team.',
      validationText: 'Load a scenario to inspect rotation readiness.', validationState: 'idle',
    };
    view.canSaveRotation = false; view.canAdvanceGame = false; view.canAdvanceUserGame = false;
  } else {
    const stats = team.seasonStatsByYear?.[String(league.seasonStartYear)] ?? {};
    const allRosterRows = rosterRowsForTeam(team, league);
    const draftByName = new Map(state.rotationDraft.map(row => [normalizeName(row.name), row]));
    const rows = allRosterRows.map(row => {
      const draft = draftByName.get(normalizeName(row.name));
      const raw = state.rawMinutesText.get(normalizeName(row.name));
      const displayedMinutes = raw !== undefined ? raw : formatRotationDisplay(draft?.minutes ?? 0);
      const availabilityLabel = row.availability === 'unknown' ? 'Availability not reported'
        : row.availability === 'available' ? 'Available' : row.availability === 'unavailable' ? 'Unavailable' : row.reason ?? 'Excluded';
      return {
        name: row.name, availabilityLabel, excluded: row.excluded, unavailable: row.unavailable,
        active: Boolean(draft?.active), starter: Boolean(draft?.starter), minutes: displayedMinutes,
        disabled: row.excluded || row.unavailable || busy,
      };
    });
    const validation = rotationValidation(session, state.activeTeamCode, state.rotationDraft);
    const control = team.franchiseControlsBySeason?.[String(league.seasonStartYear)];
    const saved = control && rotationMatchesSaved(control, state.rotationDraft);
    const prefix = saved ? `Saved control revision ${control.revision ?? '—'}. `
      : control ? 'Valid edits are not saved. Save rotation before simulating. ' : 'Draft only; not saved. ';
    const validationState = validation.ready && saved ? 'ready' : validation.ready ? 'dirty' : 'invalid';
    const validationText = validation.ready
      ? `${prefix}${validation.active.length} active · five starters · ${formatMinutes(validation.total)}/240 minutes.`
      : `${prefix}${validation.messages.slice(0, 4).join(' ')}${validation.messages.length > 4 ? ` +${validation.messages.length - 4} more.` : ''}`;
    view.team = {
      empty: false,
      code: state.activeTeamCode,
      name: team.teamName ?? team.name ?? 'Selected team',
      wins: Number(stats.wins ?? 0), losses: Number(stats.losses ?? 0),
      rosterCount: (team.rosterNames ?? []).length,
      rows, validationState, validationText,
      savedMatch: Boolean(saved),
    };
    // Rotation / advance gates (updateButtons)
    const next = upcomingGame(session);
    view.canSaveRotation = !busy && validation.ready && !saved;
    view.canAdvanceGame = !busy && Boolean(next) && Boolean(saved) && validation.ready;
    view.canAdvanceUserGame = view.canAdvanceGame;
    view.rotationSaved = Boolean(saved);
  }

  // === Schedule panel (renderGame) ===
  if (!session) {
    view.scheduleProgress = 'No schedule loaded';
    view.nextGame = null;
    view.scheduleComplete = false;
  } else {
    const schedule = session.schedule ?? [];
    const game = upcomingGame(session);
    const cursor = Number(session.scheduleCursor ?? 0);
    view.scheduleProgress = { cursor, total: schedule.length };
    view.scheduleComplete = !game;
    view.nextGame = game
      ? {
        away: upper(game.awayTeamCode), home: upper(game.homeTeamCode),
        date: game.gameLocalDate, gameId: game.gameId,
        available: Object.hasOwn(state.fixturePayload?.gameInputs ?? {}, game.gameId),
      }
      : null;
  }

  // === Full schedule board + season-pulse chart data ===
  if (!session) {
    view.scheduleList = [];
    view.seasonCurve = null;
  } else {
    const boardDates = gameDateMap(session);
    const playedByGameId = new Map(completedGames(session).map(game => [game.gameId, game]));
    const boardCursor = Number(session.scheduleCursor ?? 0);
    const userTeamCode = state.activeTeamCode;
    view.scheduleList = (session.schedule ?? []).map((game, index) => {
      const away = upper(game.awayTeamCode); const home = upper(game.homeTeamCode);
      const played = playedByGameId.get(game.gameId);
      return {
        index, gameId: game.gameId,
        date: boardDates.get(game.gameId) ?? game.gameLocalDate ?? '',
        away, home,
        awayScore: played ? played.awayScore : null,
        homeScore: played ? played.homeScore : null,
        status: played ? 'played' : index === boardCursor ? 'next' : 'upcoming',
        isUserGame: away === userTeamCode || home === userTeamCode,
        inputReady: played ? null : Object.hasOwn(state.fixturePayload?.gameInputs ?? {}, game.gameId),
      };
    });
    let wins = 0; let losses = 0;
    const curve = [];
    for (const row of view.scheduleList) {
      if (row.status !== 'played' || !row.isUserGame) continue;
      const userHome = row.home === userTeamCode;
      const userScore = Number(userHome ? row.homeScore : row.awayScore);
      const oppScore = Number(userHome ? row.awayScore : row.homeScore);
      if (userScore > oppScore) wins += 1; else losses += 1;
      curve.push({ game: curve.length + 1, wins, losses, margin: userScore - oppScore });
    }
    view.seasonCurve = curve.length ? curve : null;
  }

  // === Season completion (updateSeasonCompletionControls) ===
  const schedule = Array.isArray(session?.schedule) ? session.schedule : [];
  const cursor = Number(session?.scheduleCursor);
  const hasSchedule = schedule.length > 0;
  const validCursor = Number.isInteger(cursor) && cursor >= 0 && cursor <= schedule.length;
  const exhausted = Boolean(session) && hasSchedule && validCursor && cursor === schedule.length;
  let completionHint; let completionTitle;
  if (!session) {
    completionHint = 'Initialize a pinned season to inspect its scheduled games.';
    completionTitle = 'Initialize a pinned season before checking its completion.';
  } else if (!hasSchedule) {
    completionHint = 'This session has no schedule to verify; completion is held for review.';
    completionTitle = 'A nonempty schedule is required.';
  } else if (!validCursor) {
    completionHint = 'The schedule cursor is outside its valid range; inspect or restore the session before checking completion.';
    completionTitle = 'The session schedule cursor is invalid.';
  } else if (!exhausted) {
    const remaining = schedule.length - cursor;
    completionHint = `${remaining} scheduled game${remaining === 1 ? '' : 's'} remain. Finish every scheduled game before verification is enabled.`;
    completionTitle = `Complete all ${schedule.length} scheduled games first.`;
  } else if (state.workerCapabilities?.seasonCompletion !== true) {
    completionHint = 'The initialized worker does not advertise the versioned season-completion check.';
    completionTitle = 'Season completion verification is unavailable in this worker.';
  } else if (busy) {
    completionHint = 'A worker action is in progress. Completion verification will be available when it finishes.';
    completionTitle = 'Wait for the current worker action to finish.';
  } else {
    completionHint = `All ${schedule.length} schedule entries are exhausted. The worker will verify the completed-game ledger without changing session revision.`;
    completionTitle = 'Run the read-only versioned season-completion verification.';
  }
  const receiptIsCurrent = state.lastSeasonCompletion && state.lastSeasonCompletionRevision === session?.revision;
  view.completion = {
    enabled: !busy && exhausted && state.workerCapabilities?.seasonCompletion === true,
    hint: completionHint, title: completionTitle,
    status: receiptIsCurrent
      ? { state: 'verified', text: `Verified ${state.lastSeasonCompletion.status} for ${state.lastSeasonCompletion.seasonStartYear}; session revision ${state.lastSeasonCompletionRevision} is unchanged.`, receipt: JSON.stringify(state.lastSeasonCompletion, null, 2) }
      : { state: 'idle', text: exhausted ? 'Schedule cursor is exhausted; the ledger has not been verified yet.' : 'No completion receipt verified.', receipt: 'The exact worker receipt will appear here after verification.' },
  };

  // === History (renderHistory) ===
  const historyItems = [];
  if (!session) {
    view.historyEmpty = 'Completed games and actions appear here.';
  } else {
    const dates = gameDateMap(session);
    const games = completedGames(session).map(game => ({ kind: 'game', game }));
    const actions = session.actionHistory ?? [];
    const items = actions.map(action => {
      const game = games.find(row => row.game.gameId === action.gameId)?.game ?? null;
      return { kind: action.kind ?? 'action', revision: action.revision, gameId: action.gameId, action, game };
    }).slice(-8).reverse();
    if (!items.length && games.length) {
      for (const row of games.slice(-8).reverse()) items.push({ kind: 'game', gameId: row.game.gameId, game: row.game });
    }
    for (const item of items) {
      const gameId = item.gameId ?? item.game?.gameId ?? '—';
      const date = dates.get(gameId) ?? 'date unavailable';
      const detail = item.game
        ? `${item.game.awayTeamCode ?? item.game.awayTeam} at ${item.game.homeTeamCode ?? item.game.homeTeam} · ${date}`
        : `${item.action?.teamCode ?? item.action?.proposalId ?? 'Franchise action'} · ${date}`;
      const score = item.game ? `${item.game.awayScore}–${item.game.homeScore}` : String(item.kind).replaceAll('-', ' ');
      historyItems.push({ detail, kindText: String(item.kind).replaceAll('-', ' '), revision: item.revision, score, userTeam: Boolean(item.game) && [upper(item.game.awayTeamCode), upper(item.game.homeTeamCode)].includes(state.activeTeamCode) });
    }
    view.historyEmpty = historyItems.length ? null : 'No completed games or saved actions yet.';
  }
  view.history = historyItems;

  // === Box score (renderBoxScore) ===
  const latest = session ? completedGames(session).at(-1) ?? null : null;
  if (!latest) {
    view.box = { empty: 'No game has been completed in this session.' };
  } else {
    const rows = session.leagueState.playerGameLogs ?? [];
    let logs = rows.filter(row => row.gameId === latest.gameId && row.seasonStartYear === latest.seasonStartYear);
    if (!logs.length) {
      const sample = state.lastGameOutput?.result?.simulations?.[0] ?? state.lastGameOutput?.simulations?.[0] ?? null;
      const home = Array.isArray(sample?.homeBox) ? sample.homeBox : [];
      const away = Array.isArray(sample?.awayBox) ? sample.awayBox : [];
      logs = [
        ...home.map(row => ({ ...row, teamCode: latest.homeTeamCode, canonicalName: row.canonicalName ?? row.name, stats: row })),
        ...away.map(row => ({ ...row, teamCode: latest.awayTeamCode, canonicalName: row.canonicalName ?? row.name, stats: row })),
      ];
    }
    const groups = [latest.homeTeamCode, latest.awayTeamCode].map(code => {
      const codeUpper = upper(code);
      const teamRows = logs.filter(row => upper(row.teamCode) === codeUpper);
      const score = codeUpper === upper(latest.homeTeamCode) ? latest.homeScore : latest.awayScore;
      if (!teamRows.length) return { code, score, empty: 'Player box rows are not present in this completed-game ledger.', rows: [], totals: null };
      const body = teamRows.map(row => {
        const stats = statsForLog(row);
        return {
          name: row.canonicalName ?? row.name ?? stats.canonicalName ?? stats.name ?? 'Unknown player',
          cells: COUNT_FIELDS.map(([label, aliases]) => displayBoxStat(label, stats, aliases)),
        };
      });
      const teamLog = (session.leagueState.teamGameLogs ?? []).find(row => row.gameId === latest.gameId
        && row.seasonStartYear === latest.seasonStartYear && upper(row.teamCode) === codeUpper);
      const totals = teamLog ? COUNT_FIELDS.map(([label, aliases]) => displayBoxStat(label, statsForLog(teamLog), aliases)) : null;
      return { code, score, rows: body, totals };
    });
    view.box = { headline: `${latest.awayTeamCode} ${latest.awayScore} · ${latest.homeTeamCode} ${latest.homeScore}`, groups, statLabels: COUNT_FIELDS.map(([label]) => label) };
  }

  // === Saves (updateSaveControls) ===
  const saveKey = session ? makeBrowserKey(session, state.activeTeamCode) : null;
  const canResume = Boolean(session) && !busy && (state.storageBackend === 'indexeddb' ? state.hasIndexedDbCheckpoint : Boolean(readSavedText(saveKey)));
  view.saves = {
    backend: state.storageBackend,
    saveLabel: state.storageBackend === 'indexeddb' ? 'Save IndexedDB checkpoint' : 'Save in this browser',
    resumeLabel: state.storageBackend === 'indexeddb' ? 'Resume IndexedDB checkpoint' : 'Resume browser save',
    canSave: Boolean(session) && !busy,
    canResume,
    canExport: Boolean(session) && !busy,
    canImport: Boolean(session) && !busy,
    importTitle: (!busy && session) ? 'Import a matching portable franchise checkpoint.' : 'Initialize a franchise session before importing a checkpoint.',
    checking: state.browserSaveCheckPending,
  };
  return view;
}

const formatRotationDisplay = value => {
  const minutes = Number(value);
  return Number.isFinite(minutes) ? String(minutes) : '';
};

export default function useFranchiseSim() {
  const ref = useRef(null);
  if (!ref.current) ref.current = freshState();
  const [, forceRender] = useReducer(value => value + 1, 0);
  const render = () => forceRender();
  const [enginePhase, setEnginePhase] = useState('loading');
  const [engineError, setEngineError] = useState(null);
  const [attempt, setAttempt] = useState(0);

  const setWorkerStatus = (text, state = 'idle') => { ref.current.workerStatus = { text, state }; render(); };
  const showMessage = (value, kind = 'error') => { ref.current.message = value ? { text: value, kind } : null; render(); };
  const showFailure = (error, fallback = 'The worker action failed.', context = 'Worker') => {
    const detail = error?.message || String(error || fallback);
    const stale = isStaleMessage(detail);
    showMessage(`${stale ? 'Stale action: ' : `${context} error: `}${detail} The current visible session and last saved checkpoint were kept.`, stale ? 'notice' : 'error');
    setWorkerStatus(stale ? 'Stale action rejected' : `${context} action failed`, 'error');
  };
  const setBusy = next => { ref.current.busy = next; render(); if (next) setWorkerStatus('Worker is processing an action…', 'idle'); };
  const clearSeasonCompletionReceipt = () => {
    ref.current.lastSeasonCompletion = null;
    ref.current.lastSeasonCompletionRevision = null;
  };

  const ensureClient = async () => {
    const state = ref.current;
    if (!state.client) state.client = await createFranchiseWorker();
    return state.client;
  };
  const ensureV4Api = async () => {
    const state = ref.current;
    if (!state.v4Api) {
      const engine = await loadFranchiseEngine();
      state.v4Api = engine.intake;
      state.v4SnapshotBuilder = engine.buildV4SnapshotWorkerPayloadV1;
    }
    return { intake: state.v4Api, snapshotBuilder: state.v4SnapshotBuilder };
  };
  const ensureFranchiseBrowserStore = async () => {
    const state = ref.current;
    if (state.franchiseBrowserStore && !state.franchiseBrowserStore.closed) return state.franchiseBrowserStore;
    const engine = await loadFranchiseEngine();
    state.franchiseBrowserStore = await engine.openFranchiseBrowserStore();
    return state.franchiseBrowserStore;
  };

  const replaceSession = (result, { gameResult = false } = {}) => {
    const failure = commandFailure(result);
    if (failure) throw new Error(failure);
    if (!result.session || typeof result.session !== 'object') throw new Error('Worker action did not return a verified session snapshot.');
    clearSeasonCompletionReceipt();
    ref.current.activeSession = result.session;
    if (gameResult) ref.current.lastGameOutput = result.game ?? result.result ?? null;
    render();
  };

  const indexedDbLoadOptions = (session = ref.current.activeSession) => ({
    sourceReceipt: currentSource(null, session),
    expectedModelReceipt: currentModel(null, session),
    userTeamCode: ref.current.activeTeamCode || (session?.leagueState?.userControlledTeamCodes ?? [])[0],
  });

  const refreshIndexedDbCheckpointAvailability = async () => {
    const state = ref.current;
    if (state.storageBackend !== 'indexeddb' || !state.activeSession) return;
    const key = makeBrowserKey(state.activeSession, state.activeTeamCode);
    if (!key || key === state.browserSaveCheckKey || state.browserSaveCheckPending) return;
    state.browserSaveCheckKey = key;
    state.browserSaveCheckPending = true;
    state.hasIndexedDbCheckpoint = false;
    render();
    try {
      const store = await ensureFranchiseBrowserStore();
      await store.load(indexedDbLoadOptions());
      state.hasIndexedDbCheckpoint = true;
    } catch (error) {
      if (!/No franchise checkpoint exists/i.test(error?.message ?? '')) {
        state.saveStatus = `IndexedDB resume check failed: ${error?.message ?? error}. Saving remains available.`;
      }
      state.hasIndexedDbCheckpoint = false;
    } finally {
      state.browserSaveCheckPending = false;
      render();
    }
  };

  // Roster draft lifecycle: reload when the session snapshot or team changes.
  const syncTeamDraft = () => {
    const state = ref.current;
    const session = state.activeSession;
    const league = session?.leagueState;
    const team = state.activeTeamCode ? league?.teams?.find(row => upper(row.teamCode) === state.activeTeamCode) : null;
    if (!session || !team) {
      if (state.draftSessionRef !== null || state.draftTeamRef !== '' || state.rotationDraft.length) {
        state.rotationDraft = []; state.draftSessionRef = null; state.draftTeamRef = ''; state.rawMinutesText.clear();
        return true;
      }
      return false;
    }
    if (state.draftSessionRef !== session || state.draftTeamRef !== state.activeTeamCode) {
      state.rotationDraft = loadRotationDraft(team, league);
      state.draftSessionRef = session; state.draftTeamRef = state.activeTeamCode; state.rawMinutesText.clear();
      return true;
    }
    return false;
  };

  useEffect(() => {
    if (syncTeamDraft()) forceRender();
    void refreshIndexedDbCheckpointAvailability();
  });

  // Engine load (replaces the preview frame's relay connection step).
  useEffect(() => {
    if (enginePhase !== 'loading') return undefined;
    let live = true;
    loadFranchiseEngine()
      .then(() => {
        if (!live) return;
        setEnginePhase('ready');
        ref.current.workerStatus = { text: 'Franchise engine connected', state: 'idle' };
        render();
      })
      .catch(error => { if (live) { setEngineError(error.message); setEnginePhase('error'); } });
    return () => { live = false; };
  }, [attempt, enginePhase]);

  // Worker + IndexedDB shutdown.
  useEffect(() => () => {
    const state = ref.current;
    try { state.client?.dispose?.(); } catch { /* Best-effort worker shutdown. */ }
    try { state.franchiseBrowserStore?.close?.(); } catch { /* Best-effort IndexedDB shutdown. */ }
  }, []);

  // === Setup inputs ===
  const setV4Year = value => {
    const state = ref.current;
    state.v4Year = value; state.v4YearSelected = true; state.v4UserTeam = ''; state.generateRating = false;
    state.v4OperationNotice = null;
    setRatingReceipt(state, null);
    render();
  };
  const setV4UserTeam = value => { ref.current.v4UserTeam = value; render(); };
  const setFixtureUserTeam = value => { ref.current.fixtureUserTeam = value; render(); };
  const setGenerateRating = value => { ref.current.generateRating = Boolean(value); render(); };

  // === Scenario initialization (initializeScenario) ===
  const initializeScenario = async path => {
    const state = ref.current;
    const selectedTeam = path === 'v4' ? state.v4UserTeam : fixtureTeamValue(state).value;
    if (path === 'v4' ? !v4IntakeReadyForStart(state, selectedTeam) : (!state.fixturePayload || !selectedTeam)) return;
    showMessage('');
    if (path === 'v4') state.v4OperationNotice = null;
    setBusy(true);
    try {
      let prepared;
      if (path === 'v4') {
        const { intake, snapshotBuilder } = await ensureV4Api();
        prepared = snapshotBuilder({
          intake: state.v4Intake,
          userTeamCode: selectedTeam,
          gameModelText: state.v4GameModelText,
          productionCandidateText: state.v4ProductionCandidateText,
          seed: 1,
          missingShootingRatingPolicy: state.generateRating ? GENERATED_SHOOTING_RATING_POLICY : 'reject',
        });
        if (!prepared?.sessionInput?.sourceReceipt || !Array.isArray(prepared.sessionInput.leagueState?.teams)
          || prepared.sessionInput.leagueState.teams.length !== 30) {
          throw new Error('The V4 snapshot helper did not return a pinned 30-team session input.');
        }
        prepared.sessionInput.sourceReceipt = {
          ...prepared.sessionInput.sourceReceipt,
          rosterChoiceReceipt: buildV4RosterChoiceReceipt(state.v4Intake, state.v4RosterChoices, state.v4ChoiceProvenance, state.v4SuggestionsByName),
        };
      } else prepared = sessionForTeam(state.fixturePayload, selectedTeam);
      const worker = await ensureClient();
      const result = await worker.initialize(prepared);
      const failure = commandFailure(result);
      if (failure) throw new Error(failure);
      if (result?.status !== 'initialized' || !result.session) throw new Error('Worker initialization did not return an initialized session snapshot.');
      state.fixturePayload = prepared;
      state.fixtureName = path === 'v4' ? `V4 regular-season scenario · ${state.v4Intake.scenario.seasonStartYear}` : state.fixtureName;
      state.activeSession = result.session;
      state.workerCapabilities = result.capabilities ?? {};
      clearSeasonCompletionReceipt();
      state.activeTeamCode = upper(selectedTeam);
      state.storageBackend = path === 'v4' ? 'indexeddb' : 'localstorage';
      if (path === 'v4') {
        state.browserSaveCheckKey = '';
        state.hasIndexedDbCheckpoint = false;
        state.fixtureMeta = { name: state.fixtureName, detail: '30-team exact V4 regular-season snapshot · retrospective scenario · IndexedDB saves' };
        setRatingReceipt(state, state.activeSession.sourceReceipt?.generatedShootingRatings ?? null);
      }
      if (!(state.activeSession.leagueState.userControlledTeamCodes ?? []).map(upper).includes(state.activeTeamCode)) {
        throw new Error('Initialized session does not mark the selected team as user-controlled.');
      }
      state.lastGameOutput = null;
      state.saveStatus = path === 'v4'
        ? 'Thirty-team regular-season scenario initialized. Browser checkpoints use IndexedDB; portable export is available separately.'
        : 'Scenario initialized. Save a checkpoint to this browser or export a JSON file.';
      showMessage('');
      render();
    } catch (error) {
      if (path === 'v4' && Array.isArray(error?.profileReview) && error.profileReview.length) {
        const names = error.profileReview.slice(0, 8).map(row => `${row.canonicalName ?? 'Unnamed player'}: ${(row.missingInputs ?? []).join(', ')}`).join(' · ');
        state.v4OperationNotice = {
          operation: 'initialize', kind: 'error', seasonStartYear: Number(state.v4Year),
          message: `V4 player snapshot profile needs review. ${names}${error.profileReview.length > 8 ? ` · ${error.profileReview.length - 8} more rows` : ''}`,
        };
        setRatingReceipt(state, null, error.profileReview);
      }
      showFailure(error, 'Could not initialize this scenario.');
    } finally {
      setBusy(false);
      if (path === 'v4') forceRender();
      render();
    }
  };

  // === V4 season load (loadV4Season) ===
  const loadV4Season = async () => {
    const state = ref.current;
    if (state.activeSession) {
      showMessage('This page already has an active franchise session. Export or save it, then reload the preview to start a different year.', 'notice');
      return;
    }
    showMessage('');
    const requestedYear = Number(state.v4Year);
    const loadingMessage = `Loading pinned ${requestedYear}–${String(requestedYear + 1).slice(-2)} regular-season V4 sources and the exact model texts…`;
    state.v4OperationNotice = { operation: 'load', kind: 'loading', seasonStartYear: requestedYear, message: loadingMessage };
    setBusy(true);
    setWorkerStatus('Loading exact-season V4 sources…', 'idle');
    try {
      const { intake } = await ensureV4Api();
      const seasonStartYear = requestedYear;
      const releasePin = intake.createV4FranchiseLocalMirrorReleasePinV1({ origin: window.location.origin });
      const baseUrl = new URL('/tools/swishiq-studio/', window.location.origin).href;
      const [model, production, loadedIntake] = await Promise.all([
        fetchJsonText(GAME_MODEL_PATH, 'Game model'),
        fetchJsonText(PRODUCTION_CANDIDATE_PATH, 'Player production candidate'),
        intake.loadV4FranchiseIntakeV1({ seasonStartYear, phase: 'regular', releasePin, baseUrl }),
      ]);
      if (Number(loadedIntake.scenario?.seasonStartYear) !== seasonStartYear || loadedIntake.scenario?.phase !== 'regular') {
        throw new Error('V4 intake returned a different year or phase from the selected exact regular season.');
      }
      state.v4Intake = loadedIntake;
      state.v4OperationNotice = null;
      state.generateRating = false;
      setRatingReceipt(state, null);
      state.v4GameModelText = model.text;
      state.v4ProductionCandidateText = production.text;
      state.v4GameModelMeta = model.value;
      state.v4ProductionMeta = production.value;
      state.v4RosterChoices = new Map();
      state.v4ChoiceProvenance = new Map();
      state.v4SuggestionsByName = new Map();
      state.v4SuggestionSummary = null;
      state.v4PlayerGamesPart = null;
      state.v4RosterMode = null;
      state.workerStatus = { text: 'V4 intake verified · worker not initialized', state: 'idle' };
      showMessage('');
    } catch (error) {
      const loadedYear = Number(state.v4Intake?.scenario?.seasonStartYear);
      const retainedSource = Number.isFinite(loadedYear)
        ? ` The previously verified ${loadedYear} regular-season intake and its source receipts remain available.`
        : ' No verified prior V4 intake is available; retry source loading.';
      state.v4OperationNotice = { operation: 'load', kind: 'error', seasonStartYear: requestedYear,
        message: `V4 load for ${requestedYear} failed: ${error?.message ?? error}.${retainedSource}` };
      showFailure(error, 'Exact-season V4 intake could not be loaded.', 'V4 intake');
    } finally {
      setBusy(false);
      render();
    }
  };

  // === Latest-team suggestions (applyLatestTeamSuggestions) ===
  const applySuggestions = async () => {
    const state = ref.current;
    const intake = state.v4Intake;
    if (!intake || Number(intake.scenario?.seasonStartYear) !== Number(state.v4Year) || !intake?.unresolvedRosterChoices?.length || state.activeSession) return;
    showMessage('');
    const seasonStartYear = Number(intake.scenario.seasonStartYear);
    const loadingMessage = 'Loading package-wide regular-season player-game observations. Unique team choices will be applied only because you pressed this button; tied and unknown rows will remain open.';
    state.v4OperationNotice = { operation: 'suggestions', kind: 'loading', seasonStartYear, message: loadingMessage };
    setBusy(true);
    try {
      const { intake: api } = await ensureV4Api();
      const releasePin = api.createV4FranchiseLocalMirrorReleasePinV1({ origin: window.location.origin });
      const baseUrl = new URL('/tools/swishiq-studio/', window.location.origin).href;
      const suggestedIntake = await api.loadLastObservedTeamScenarioSuggestionsV1(intake, { releasePin, baseUrl });
      const nextChoices = new Map(state.v4RosterChoices);
      const nextProvenance = new Map(state.v4ChoiceProvenance);
      const nextSuggestions = new Map(state.v4SuggestionsByName);
      let uniqueApplied = 0, tiedHeld = 0, unknownHeld = 0;
      for (const choice of suggestedIntake.unresolvedRosterChoices ?? []) {
        const key = choice.normalizedPlayerNameKey;
        const suggestion = choice.suggestion ?? null;
        nextSuggestions.set(key, suggestion);
        if (suggestion?.status === 'suggested-not-applied' && suggestion.teamCode && !nextChoices.has(key)) {
          nextChoices.set(key, upper(suggestion.teamCode));
          nextProvenance.set(key, 'generated');
          uniqueApplied += 1;
        } else if (String(suggestion?.status ?? '').includes('tied')) tiedHeld += 1;
        else if (!suggestion || suggestion.status !== 'suggested-not-applied') unknownHeld += 1;
      }
      state.v4Intake = api.applyV4FranchiseRosterChoicesV1(suggestedIntake, { rosterChoicesByName: nextChoices });
      state.v4RosterChoices = nextChoices;
      state.v4ChoiceProvenance = nextProvenance;
      state.v4SuggestionsByName = nextSuggestions;
      state.v4SuggestionSummary = { uniqueApplied, tiedHeld, unknownHeld };
      state.v4OperationNotice = null;
      state.workerStatus = { text: 'V4 suggestions applied · worker not initialized', state: 'idle' };
      showMessage(`${uniqueApplied} unique last-observed-team suggestions were applied as generated scenario choices by explicit click. ${tiedHeld} tied and ${unknownHeld} unknown names remain held for exact user review.`, 'notice');
    } catch (error) {
      state.v4OperationNotice = { operation: 'suggestions', kind: 'error', seasonStartYear,
        message: `Latest-team suggestions for ${seasonStartYear} failed: ${error?.message ?? error}. Existing exact-team choices and V4 source receipts were preserved; unresolved names still need manual choices.` };
      showFailure(error, 'Latest-team suggestions could not be loaded.', 'V4 suggestions');
    } finally {
      setBusy(false);
      render();
    }
  };

  // === Start/end-of-season bulk roster assignment (applyRosterMode) ===
  const applyRosterMode = async mode => {
    const state = ref.current;
    const intake = state.v4Intake;
    if (!intake || Number(intake.scenario?.seasonStartYear) !== Number(state.v4Year) || state.activeSession || state.busy) return;
    const seasonStartYear = Number(intake.scenario.seasonStartYear);
    showMessage('');
    setBusy(true);
    try {
      const { intake: api } = await ensureV4Api();
      let cached = state.v4PlayerGamesPart;
      if (!cached || Number(cached.seasonStartYear) !== seasonStartYear) {
        const releasePin = api.createV4FranchiseLocalMirrorReleasePinV1({ origin: window.location.origin });
        const baseUrl = new URL('/tools/swishiq-studio/', window.location.origin).href;
        cached = { seasonStartYear, part: (await api.loadV4PlayerGamesForFranchiseSuggestionsV1({ seasonStartYear, releasePin, baseUrl })).part };
        state.v4PlayerGamesPart = cached;
      }
      const { applied, held } = deriveRosterModeAssignments(intake, cached.part.records, mode);
      const nextChoices = new Map(state.v4RosterChoices);
      const nextProvenance = new Map(state.v4ChoiceProvenance);
      const nextSuggestions = new Map(state.v4SuggestionsByName);
      const heldKeys = new Set(held.map(row => row.key));
      for (const row of applied) {
        nextChoices.set(row.key, row.teamCode);
        nextProvenance.set(row.key, 'generated');
        nextSuggestions.set(row.key, Object.freeze({
          status: 'suggested-not-applied',
          policy: mode === 'start' ? 'first-observed-team-scenario' : 'last-observed-team-scenario',
          teamCode: row.teamCode,
          latestGameLocalDate: row.boundaryDate,
          observations: Object.freeze(row.observations),
          explicitUserChoiceRequired: true,
          applied: false,
        }));
      }
      // A mode switch overrides prior generated assignments, but never an
      // explicit manual choice for a name the new mode could not resolve.
      for (const key of heldKeys) {
        if (nextProvenance.get(key) === 'generated') { nextChoices.delete(key); nextProvenance.delete(key); }
      }
      state.v4Intake = api.applyV4FranchiseRosterChoicesV1(intake, { rosterChoicesByName: nextChoices });
      state.v4RosterChoices = nextChoices;
      state.v4ChoiceProvenance = nextProvenance;
      state.v4SuggestionsByName = nextSuggestions;
      state.v4SuggestionSummary = null;
      state.v4RosterMode = mode;
      state.v4OperationNotice = null;
      state.workerStatus = { text: `Roster mode applied: ${mode === 'start' ? 'start' : 'end'} of season · worker not initialized`, state: 'idle' };
      showMessage(`${applied.length} multi-team name${applied.length === 1 ? '' : 's'} assigned to the team they ${mode === 'start' ? 'first played for in' : 'last played for in'} the season. ${held.length} remain held for a manual choice.`, 'notice');
    } catch (error) {
      state.v4OperationNotice = { operation: 'roster-mode', kind: 'error', seasonStartYear,
        message: `Roster assignment failed: ${error?.message ?? error}. Existing exact-team choices and V4 source receipts were preserved.` };
      showFailure(error, 'Roster assignment could not be applied.', 'Roster assignment');
    } finally {
      setBusy(false);
      render();
    }
  };

  // === Roster choice select (onV4RosterChoiceChange) ===
  const onRosterChoice = async (key, value) => {
    const state = ref.current;
    if (!key || !state.v4Intake || state.activeSession || state.busy) return;
    const nextChoices = new Map(state.v4RosterChoices);
    const nextProvenance = new Map(state.v4ChoiceProvenance);
    if (value) {
      nextChoices.set(key, upper(value));
      nextProvenance.set(key, 'explicit');
    } else {
      nextChoices.delete(key);
      nextProvenance.delete(key);
    }
    try {
      const { intake: api } = await ensureV4Api();
      state.v4Intake = api.applyV4FranchiseRosterChoicesV1(state.v4Intake, { rosterChoicesByName: nextChoices });
      state.v4OperationNotice = null;
      state.v4RosterChoices = nextChoices;
      state.v4ChoiceProvenance = nextProvenance;
      showMessage('Roster choice updated using retained exact-season player evidence. No V4 artifact refetch occurred.', 'notice');
    } catch (error) {
      showFailure(error, 'Roster choice was rejected.', 'V4 roster');
    }
    render();
  };

  // === Rotation draft edits (setDraftFromInput) ===
  const setDraft = (name, field, checkedOrValue, { typing = false } = {}) => {
    const state = ref.current;
    const draftRow = state.rotationDraft.find(row => normalizeName(row.name) === normalizeName(name));
    if (!draftRow || state.busy || !state.activeSession) return;
    if (field === 'active') {
      draftRow.active = Boolean(checkedOrValue);
      if (!draftRow.active) { draftRow.minutes = 0; draftRow.starter = false; }
      else if (!(Number(draftRow.minutes) > 0)) draftRow.minutes = Math.min(24, draftRow.limit ?? 48);
    } else if (field === 'starter') {
      draftRow.starter = Boolean(checkedOrValue);
      if (draftRow.starter && !draftRow.active) {
        draftRow.active = true;
        if (!(Number(draftRow.minutes) > 0)) draftRow.minutes = Math.min(24, draftRow.limit ?? 48);
      }
    } else if (field === 'minutes') {
      draftRow.minutes = checkedOrValue === '' ? NaN : Number(checkedOrValue);
      draftRow.active = Number(draftRow.minutes) > 0;
      if (!draftRow.active) draftRow.starter = false;
    }
    // Keep the numeric control's in-progress text while typing; reflect model
    // changes back into it whenever an edit originates elsewhere.
    if (field === 'minutes' && typing) state.rawMinutesText.set(normalizeName(name), checkedOrValue);
    else state.rawMinutesText.delete(normalizeName(name));
    render();
  };

  // === Rotation save (saveRotation) ===
  const saveRotation = async () => {
    const state = ref.current;
    if (!state.activeSession) return;
    showMessage('');
    setBusy(true);
    try {
      const worker = await ensureClient();
      const result = await worker.command('rotation', {
        expectedRevision: state.activeSession.revision,
        teamCode: state.activeTeamCode,
        controls: makeRotationControls(state.activeSession, state.activeTeamCode, state.rotationDraft),
      });
      const status = String(result?.status ?? '').toLowerCase();
      if (!['created', 'updated', 'ready', 'pass'].includes(status) && !result?.session) {
        throw new Error(commandFailure(result) ?? `Rotation was not saved (worker status: ${result?.status ?? 'unknown'}).`);
      }
      replaceSession(result);
      state.saveStatus = 'Rotation saved with an action receipt. Save the franchise checkpoint separately when ready.';
    } catch (error) { showFailure(error, 'Rotation was not saved.'); }
    finally { setBusy(false); render(); }
  };

  // === Next scheduled game (advanceGame) ===
  const advanceGame = async () => {
    const state = ref.current;
    if (!state.activeSession || !upcomingGame(state.activeSession)) return;
    showMessage('');
    setBusy(true);
    try {
      const worker = await ensureClient();
      const result = await worker.command('next-game', { expectedRevision: state.activeSession.revision });
      if (result?.status === 'season-games-complete') {
        replaceSession(result);
        showMessage('The selected regular-season schedule is complete. A new season or postseason cannot be started in this preview.', 'notice');
        return;
      }
      if (result?.status !== 'game-completed') throw new Error(commandFailure(result) ?? `Next game did not complete (worker status: ${result?.status ?? 'unknown'}).`);
      replaceSession(result, { gameResult: true });
      state.saveStatus = `Game completed at revision ${state.activeSession.revision}. The saved browser checkpoint is unchanged until you save it.`;
      showMessage('');
    } catch (error) { showFailure(error, 'The next game was not committed.'); }
    finally { setBusy(false); render(); }
  };

  // === Advance through the next user game (advanceToNextUserGame) ===
  const advanceUserGame = async () => {
    const state = ref.current;
    if (!state.activeSession || !upcomingGame(state.activeSession)) return;
    showMessage('');
    setBusy(true);
    try {
      const worker = await ensureClient();
      const result = await worker.command('next-user-game', { expectedRevision: state.activeSession.revision });
      if (result?.status !== 'game-completed') throw new Error(commandFailure(result) ?? `Advance through next user game did not complete (worker status: ${result?.status ?? 'unknown'}).`);
      if (result.atomicCheckpoint !== true || !Number.isInteger(result.gamesAdvanced) || !Array.isArray(result.advancedGames)) {
        throw new Error('Worker did not confirm an atomic schedule checkpoint with game summaries. The visible session was not updated.');
      }
      replaceSession(result, { gameResult: true });
      const count = result.gamesAdvanced;
      const first = result.advancedGames[0];
      const last = result.advancedGames.at(-1);
      const dateRange = first?.gameLocalDate && last?.gameLocalDate
        ? ` (${first.gameLocalDate}${first.gameLocalDate === last.gameLocalDate ? '' : ` to ${last.gameLocalDate}`})`
        : '';
      const finalGame = last ? `${last.awayTeamCode} at ${last.homeTeamCode} · ${last.awayScore}–${last.homeScore}` : 'the remaining schedule';
      state.saveStatus = `Advanced ${count} game${count === 1 ? '' : 's'} as one atomic checkpoint at revision ${state.activeSession.revision}. The browser checkpoint still reflects the last explicit save.`;
      showMessage(result.checkpointKind === 'remaining-league-schedule'
        ? `No later user-team game remained. Processed ${count} remaining league game${count === 1 ? '' : 's'}${dateRange}; final result: ${finalGame}.`
        : `Advanced ${count} scheduled game${count === 1 ? '' : 's'} through your next game${dateRange}; final result: ${finalGame}. All intervening results committed as one atomic checkpoint.`, 'notice');
    } catch (error) { showFailure(error, 'Games through the next user-team game were not committed.'); }
    finally { setBusy(false); render(); }
  };

  // === Season completion verification (verifySeasonCompletion) ===
  const verifyCompletion = async () => {
    const state = ref.current;
    const session = state.activeSession;
    const schedule = session?.schedule;
    const revision = session?.revision;
    if (!session || !Array.isArray(schedule) || schedule.length === 0
      || session.scheduleCursor !== schedule.length || !Number.isInteger(revision)) return;
    showMessage('');
    setBusy(true);
    try {
      if (state.workerCapabilities?.seasonCompletion !== true) throw new Error('The initialized worker does not support season completion verification.');
      const worker = await ensureClient();
      const result = await worker.command('verify-season-completion', { expectedRevision: revision });
      const failure = commandFailure(result);
      if (failure) throw new Error(failure);
      if (result?.status !== 'season-games-complete') {
        throw new Error(`Season completion verification did not complete (worker status: ${result?.status ?? 'unknown'}).`);
      }
      if (!result.session || JSON.stringify(result.session) !== JSON.stringify(session)) {
        try { worker.dispose?.(); } catch { /* The prior local snapshot remains authoritative for display. */ }
        if (state.client === worker) state.client = null;
        state.workerCapabilities = null;
        throw new Error('Worker changed or omitted session state during read-only verification. Its client was closed; the visible franchise snapshot and saved checkpoint were kept.');
      }
      const receipt = result.completion;
      const scheduleKind = receipt?.scheduleKind;
      const expectedStatus = scheduleKind === 'standard-season'
        ? 'standard-schedule-complete'
        : scheduleKind === 'labeled-scenario' ? 'scenario-schedule-complete' : null;
      const scenarioMetadataValid = scheduleKind === 'standard-season'
        ? receipt?.scenarioMetadata === null
        : receipt?.scenarioMetadata && ['generated-scenario', 'user-scenario'].includes(receipt.scenarioMetadata.sourceClass)
          && typeof receipt.scenarioMetadata.label === 'string' && receipt.scenarioMetadata.label.trim().length >= 3;
      if (receipt?.format !== 'djhc-franchise-season-completion-v1' || receipt.version !== '1.0.0'
        || receipt.scheduleComplete !== true || receipt.seasonStartYear !== session.leagueState.seasonStartYear
        || expectedStatus === null || receipt.status !== expectedStatus || !scenarioMetadataValid
        || receipt.scheduledGameCount !== schedule.length || receipt.completedGameCount !== schedule.length
        || !/^[a-f0-9]{64}$/.test(receipt.canonicalScheduleSha256 ?? '')) {
        throw new Error('Worker returned an incomplete or unsupported season-completion receipt.');
      }
      state.lastSeasonCompletion = clone(receipt);
      state.lastSeasonCompletionRevision = revision;
      setWorkerStatus('Season completion verified · session unchanged', 'ready');
      showMessage(`The worker verified ${receipt.status} for ${receipt.seasonStartYear}. Session revision ${revision} and the saved checkpoint were not changed.`, 'notice');
    } catch (error) {
      showFailure(error, 'Season completion could not be verified.', 'Season completion');
    } finally { setBusy(false); render(); }
  };

  // === Portable export (exportCurrentSave) ===
  const exportCurrentSave = async () => {
    const state = ref.current;
    if (!state.activeSession) return null;
    const worker = await ensureClient();
    const result = await worker.command('export', {});
    const failure = commandFailure(result);
    if (failure) throw new Error(failure);
    exportedSaveMatches(result?.saveText, state.activeSession, state.activeTeamCode);
    return result.saveText;
  };

  // === Browser checkpoint save (saveLocal) ===
  const saveLocal = async () => {
    const state = ref.current;
    if (!state.activeSession) return;
    showMessage('');
    setBusy(true);
    try {
      if (state.storageBackend === 'indexeddb') {
        const store = await ensureFranchiseBrowserStore();
        const result = await store.save(state.activeSession, { userTeamCode: state.activeTeamCode });
        if (result?.status !== 'checkpoint-saved') throw new Error(`IndexedDB did not confirm the checkpoint (status: ${result?.status ?? 'unknown'}).`);
        state.hasIndexedDbCheckpoint = true;
        state.browserSaveCheckKey = makeBrowserKey(state.activeSession, state.activeTeamCode);
        state.saveStatus = `IndexedDB checkpoint saved and verified · revision ${state.activeSession.revision} · ${humanBytes(result.bytes)} · ${result.previousCheckpointSaved ? 'previous checkpoint rotated' : 'no prior checkpoint rotated'}.`;
        showMessage('');
        return;
      }
      const key = makeBrowserKey(state.activeSession, state.activeTeamCode);
      if (!key) throw new Error('This session lacks exact source, model, season, or user-team pins for a local save key.');
      const saveText = await exportCurrentSave();
      const pending = `${key}:pending`;
      const previous = localStorage.getItem(key);
      try {
        localStorage.setItem(pending, saveText);
        if (localStorage.getItem(pending) !== saveText) throw new Error('Staging checkpoint readback failed.');
        exportedSaveMatches(localStorage.getItem(pending), state.activeSession, state.activeTeamCode);
        localStorage.setItem(key, saveText);
        if (localStorage.getItem(key) !== saveText) throw new Error('Browser checkpoint readback failed.');
        exportedSaveMatches(localStorage.getItem(key), state.activeSession, state.activeTeamCode);
      } catch (error) {
        if (previous === null) localStorage.removeItem(key); else localStorage.setItem(key, previous);
        throw error;
      } finally { localStorage.removeItem(pending); }
      state.saveStatus = `Browser checkpoint saved and read-back verified · revision ${state.activeSession.revision} · ${humanBytes(saveText.length)}.`;
      showMessage('');
    } catch (error) {
      state.saveStatus = state.storageBackend === 'indexeddb'
        ? `IndexedDB checkpoint at revision ${state.activeSession.revision} was not written. The active session and any earlier checkpoint remain intact; Export JSON is available as a portable fallback.`
        : `Browser checkpoint at revision ${state.activeSession.revision} was not written. The active session and any earlier checkpoint remain intact; Export JSON is available as a portable fallback.`;
      showFailure(error, 'Browser checkpoint was not changed.');
    }
    finally { setBusy(false); render(); }
  };

  // === Checkpoint restore (restoreSaveText) ===
  const restoreSaveText = async (saveText, label) => {
    const state = ref.current;
    const candidate = JSON.parse(saveText);
    const candidateTeams = (candidate?.leagueState?.userControlledTeamCodes ?? []).map(upper);
    if (candidateTeams.length !== 1) throw new Error('A portable franchise save must contain exactly one user-controlled team.');
    const worker = await ensureClient();
    const result = await worker.command('restore', { saveText });
    const failure = commandFailure(result);
    if (failure) throw new Error(failure);
    if (!result?.session) throw new Error('Worker restore did not return a verified session snapshot.');
    const restoredTeam = (result.session.leagueState?.userControlledTeamCodes ?? [])[0];
    if (!restoredTeam) throw new Error('Restored session has no user-controlled team.');
    state.activeSession = result.session;
    clearSeasonCompletionReceipt();
    state.activeTeamCode = upper(restoredTeam);
    state.storageBackend = candidate?.sourceReceipt?.mode === 'retrospective-user-scenario' && candidate?.sourceReceipt?.intakeVersion
      ? 'indexeddb' : 'localstorage';
    state.browserSaveCheckKey = '';
    state.hasIndexedDbCheckpoint = false;
    state.lastGameOutput = null;
    state.saveStatus = `${label} restored and verified · revision ${state.activeSession.revision}.`;
    showMessage('');
    render();
  };

  // === Browser checkpoint resume (resumeLocal) ===
  const resumeLocal = async () => {
    const state = ref.current;
    if (!state.activeSession) return;
    showMessage('');
    setBusy(true);
    try {
      if (state.storageBackend === 'indexeddb') {
        const store = await ensureFranchiseBrowserStore();
        const loaded = await store.load(indexedDbLoadOptions());
        const worker = await ensureClient();
        const result = await worker.command('restore-session', { session: loaded.session });
        const failure = commandFailure(result);
        if (failure) throw new Error(failure);
        if (!result?.session) throw new Error('Worker did not return the pinned IndexedDB checkpoint snapshot.');
        state.activeSession = result.session;
        clearSeasonCompletionReceipt();
        state.activeTeamCode = upper((result.session.leagueState?.userControlledTeamCodes ?? [])[0] ?? '');
        state.lastGameOutput = null;
        state.hasIndexedDbCheckpoint = true;
        state.browserSaveCheckKey = makeBrowserKey(state.activeSession, state.activeTeamCode);
        state.saveStatus = `IndexedDB ${String(loaded.status).replaceAll('-', ' ')} · revision ${state.activeSession.revision}${loaded.checkpoint?.bytes ? ` · ${humanBytes(loaded.checkpoint.bytes)}` : ''}.`;
        showMessage('');
        render();
      } else {
        const key = makeBrowserKey(state.activeSession, state.activeTeamCode);
        const saveText = readSavedText(key);
        if (!saveText) throw new Error('No browser checkpoint exists for this exact source/model/season/team pin.');
        await restoreSaveText(saveText, 'Browser checkpoint');
      }
    } catch (error) { showFailure(error, 'Browser checkpoint could not be resumed.'); }
    finally { setBusy(false); render(); }
  };

  // === Portable export download (exportSave) ===
  const exportSave = async () => {
    const state = ref.current;
    if (!state.activeSession) return;
    showMessage('');
    setBusy(true);
    try {
      const saveText = await exportCurrentSave();
      const blob = new Blob([saveText], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `season-lab-franchise-${state.activeTeamCode.toLowerCase()}-${state.activeSession.leagueState.seasonStartYear}-r${state.activeSession.revision}.json`;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      state.saveStatus = `Portable checkpoint exported · revision ${state.activeSession.revision} · ${humanBytes(saveText.length)}.`;
    } catch (error) { showFailure(error, 'Save export failed.'); }
    finally { setBusy(false); render(); }
  };

  // === Checkpoint import (importSave) ===
  const importSave = async file => {
    const state = ref.current;
    if (!state.activeSession || !file) return;
    showMessage('');
    setBusy(true);
    try {
      let saveText = await file.text();
      const parsed = JSON.parse(saveText);
      if (typeof parsed?.saveText === 'string') saveText = parsed.saveText;
      await restoreSaveText(saveText, 'Imported checkpoint');
      state.saveStatus += ` · ${file.name}`;
    } catch (error) { showFailure(error, 'Imported checkpoint was rejected; current session and browser save were kept.'); }
    finally { setBusy(false); render(); }
  };

  // === Fixture paths ===
  const loadFixture = async file => {
    const state = ref.current;
    if (!file) return;
    if (state.activeSession) {
      showMessage('This page already has an active franchise session. Export or save it, then reload the preview to start another scenario.', 'notice');
      return;
    }
    showMessage('');
    try {
      const parsed = JSON.parse(await file.text());
      const payload = readPayload(parsed);
      const leagueState = leagueStateFor(payload);
      if (!Array.isArray(leagueState?.teams) || !leagueState.teams.length) throw new Error('Fixture session state needs a non-empty teams array.');
      state.fixturePayload = payload;
      state.fixtureName = file.name;
      state.fixtureMeta = { name: file.name, detail: `${humanBytes(file.size)} · parsed locally` };
      state.activeSession = null;
      state.workerCapabilities = null;
      clearSeasonCompletionReceipt();
      state.activeTeamCode = '';
      state.storageBackend = 'localstorage';
      state.browserSaveCheckKey = '';
      state.hasIndexedDbCheckpoint = false;
      state.rotationDraft = [];
      state.draftSessionRef = null;
      state.draftTeamRef = '';
      state.lastGameOutput = null;
      state.saveStatus = 'No checkpoint loaded.';
      state.workerStatus = { text: 'Fixture parsed · worker not initialized', state: 'idle' };
      showMessage('');
      render();
    } catch (error) {
      showFailure(error, 'Fixture file was not loaded.', 'Fixture');
    }
  };

  const loadVerifiedFixture = async () => {
    const state = ref.current;
    if (state.activeSession) {
      showMessage('This page already has an active franchise session. Export or save it, then reload the preview to start another scenario.', 'notice');
      return;
    }
    showMessage('');
    setBusy(true);
    try {
      const { payload, meta } = await loadVerifiedFixturePayload();
      state.fixturePayload = payload;
      state.fixtureName = meta.name;
      state.fixtureMeta = meta;
      state.activeSession = null;
      state.workerCapabilities = null;
      clearSeasonCompletionReceipt();
      state.activeTeamCode = '';
      state.storageBackend = 'localstorage';
      state.browserSaveCheckKey = '';
      state.hasIndexedDbCheckpoint = false;
      state.rotationDraft = [];
      state.draftSessionRef = null;
      state.draftTeamRef = '';
      state.lastGameOutput = null;
      state.saveStatus = 'Two-team browser smoke input loaded. This is not full-league acceptance.';
      state.workerStatus = { text: 'Fixture parsed · worker not initialized', state: 'idle' };
      showMessage('');
      render();
    } catch (error) {
      showFailure(error, 'Prepared fixture could not be loaded.', 'Fixture');
    } finally { setBusy(false); render(); }
  };

  const view = computeView(ref.current);

  return {
    enginePhase, engineError, retry: () => setAttempt(value => value + 1),
    view,
    setV4Year, setV4UserTeam, setFixtureUserTeam, setGenerateRating,
    onRosterChoice, setDraft,
    loadV4Season, applySuggestions, applyRosterMode, initializeScenario,
    loadFixture, loadVerifiedFixture,
    saveRotation, advanceGame, advanceUserGame, verifyCompletion,
    saveLocal, resumeLocal, exportSave, importSave,
  };
}