// Native React orchestration for the franchise tab — a 1:1 port of the site
// release's season-lab-preview control flow. Every worker command, validation
// gate, receipt check, and save path is preserved; only the DOM rendering is
// replaced by React state. The simulation engine modules are never touched.
import { useEffect, useReducer, useRef, useState } from 'react';
import {
  clone, normalizeName, formatMinutes, humanBytes, leagueStateFor, currentSource, currentModel,
  sessionForTeam, commandFailure, isStaleMessage, pinDetails, rosterRowsForTeam,
  loadRotationDraft, rotationValidation, rotationMatchesSaved, makeRotationControls, makeBrowserKey,
  exportedSaveMatches, upcomingGame, gameDateMap, completedGames, recordFor, statsForLog, displayBoxStat,
  multiTeamV4Choices, buildV4RosterChoiceReceipt, suggestionLabel, receiptPartSummary,
  deriveRosterModeAssignments, readPayload,
  GENERATED_SHOOTING_RATING_POLICY, COUNT_FIELDS, SEASON_OPTIONS, NBA_TEAMS,
} from './franchiseLogic';
import {
  loadFranchiseEngine, createFranchiseWorker, fetchJsonText, loadVerifiedFixturePayload,
  GAME_MODEL_PATH, PRODUCTION_CANDIDATE_PATH,
} from './franchiseEngine';
import {
  createStandaloneFranchiseWorkerAdapter,
  validateStandaloneSeasonAwardsFinalization,
  validateStandaloneTransactionCommit,
  validateStandaloneTransactionEvaluation,
  validateStandaloneNextSeasonAdvance,
  validateStandaloneOffseasonApproval,
  validateStandaloneOffseasonPhase,
  validateStandaloneOffseasonWindowAdvance,
  validateStandalonePostseasonCommit,
  validateStandalonePostseasonPreparation,
  validateStandaloneRotationRefresh,
} from './standaloneFranchiseWorkerAdapter';

const upper = value => String(value ?? '').toUpperCase();
const plainReceipt = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const ROSTER_MOVE_WINDOWS = new Set(['option-decisions', 'free-agency', 'trade-window', 'roster-finalization']);
const OFFSEASON_WINDOWS = ['preseason', 'option-decisions', 'draft', 'free-agency', 'trade-window', 'roster-finalization', 'games'];
const nextOffseasonWindow = window => {
  const index = OFFSEASON_WINDOWS.indexOf(window);
  return index >= 0 ? OFFSEASON_WINDOWS[index + 1] ?? null : null;
};
const sameSnapshot = (left, right) => JSON.stringify(left) === JSON.stringify(right);
function transactionBindingMatches(binding, session) {
  return Boolean(binding && session
    && binding.sessionRevision === session.revision
    && binding.leagueStateRevision === session.leagueState?.revision
    && binding.seasonStartYear === session.leagueState?.seasonStartYear
    && binding.transactionWindow === session.leagueState?.transactionWindow
    && sameSnapshot(binding.sourceReceipt, session.sourceReceipt)
    && sameSnapshot(binding.modelReceipt, session.modelReceipt)
    && sameSnapshot(binding.schedule, session.schedule)
    && binding.scheduleCursor === session.scheduleCursor);
}
function resolvedMoney(value) {
  const status = String(value?.valueStatus ?? value?.status ?? '').toLowerCase();
  if (/unknown|candidate|conflict|unresolved|missing|invalid/.test(status)) return null;
  const amount = value && typeof value === 'object' && Object.hasOwn(value, 'value') ? value.value : value;
  return amount !== null && amount !== undefined && amount !== '' && typeof amount !== 'boolean' && Number.isFinite(Number(amount))
    ? Number(amount) : null;
}
// V4 release data reaches the intake through the page-by-page service-worker
// relay on this host, so one fetch can stream for minutes. The loaders' 30s
// default is sized for direct site fetches and aborts long streams mid-read
// (Safari surfaces that as "Fetch is aborted."), so every intake call from the
// franchise workspace raises its own relay-sized ceiling.
const V4_RELAY_TIMEOUT_MS = 300000;
const readSavedText = key => {
  try { return key ? localStorage.getItem(key) : null; }
  catch { return null; }
};
// The package-wide player-games part is a large relay stream; one dropped
// connection used to fail the whole roster assignment, so the stream gets
// bounded retries before the failure is surfaced.
const PLAYER_GAMES_ATTEMPTS = 3;
const fetchPlayerGamesWithRetry = async (api, options) => {
  let lastError;
  for (let attempt = 0; attempt < PLAYER_GAMES_ATTEMPTS; attempt += 1) {
    try {
      return await api.loadV4PlayerGamesForFranchiseSuggestionsV1(options);
    } catch (error) {
      lastError = error;
      if (attempt < PLAYER_GAMES_ATTEMPTS - 1) await new Promise(resolve => setTimeout(resolve, 1500 * (attempt + 1)));
    }
  }
  throw lastError;
};

const freshState = () => ({
  // Setup inputs (mirror of the preview frame's control values)
  v4Year: 2025, v4YearSelected: false, v4UserTeam: '', fixtureUserTeam: '', generateRating: false,
  // Engine + session
  client: null, workerCapabilities: null, activeSession: null, activeTeamCode: '', validateFranchiseRotationState: null,
  rotationDraft: [], draftSessionRef: null, draftTeamRef: '', rawMinutesText: new Map(),
  fixturePayload: null, fixtureName: '', fixtureMeta: null,
  lastGameOutput: null, lastSeasonCompletion: null, lastSeasonCompletionRevision: null,
  lastSeasonAwardsFinalization: null,
  lastPreparedPostseason: null, lastLifecycleAction: null,
  lastTransactionEvaluation: null, lastTransactionProposal: null, lastTransactionEvaluationRevision: null,
  lastTransactionSessionBinding: null,
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
        'Contracts / payroll: unknown · postseason / offseason: worker-supported, capability-gated; controls not exposed here',
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

  // Before any V4 intake loads, the static 30-team list keeps the picker
  // ready; after load, the exact-season intake team list takes over.
  const teamSource = intake?.leagueState?.teams?.length ? intake.leagueState.teams : (intake?.teamRates?.rows ?? []);
  const teamOptions = teamSource.length
    ? [...teamSource]
      .sort((a, b) => String(a.teamCode).localeCompare(String(b.teamCode)))
      .map(team => {
        const code = upper(team.teamCode);
        return { code, label: `${team.teamName ?? team.name ?? code} · ${code}` };
      })
      .filter(option => option.code)
    : NBA_TEAMS.map(([code, name]) => ({ code, label: `${name} · ${code}` }));
  const v4TeamSelected = teamOptions.some(option => option.code === state.v4UserTeam) ? state.v4UserTeam : '';

  view.v4 = {
    year: state.v4YearSelected ? state.v4Year : '', seasons: SEASON_OPTIONS,
    yearDisabled: busy || Boolean(session),
    canLoad: !busy && !session && state.v4YearSelected,
    teamOptions, teamSelected: v4TeamSelected,
    teamDisabled: busy || Boolean(session),
    teamMessage: 'Choose a team to control',
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
        shotUsageMultiplier: Number.isFinite(Number(draft?.shotUsageMultiplier)) ? Number(draft.shotUsageMultiplier) : 1,
        disabled: row.excluded || row.unavailable || busy,
        shotUsageDisabled: row.excluded || row.unavailable || !draft?.active || busy,
      };
    });
    const validation = rotationValidation(session, state.activeTeamCode, state.rotationDraft);
    if (validation.ready) {
      try {
        if (typeof state.validateFranchiseRotationState !== 'function') throw new Error('The Franchise control validator is unavailable.');
        const proposedControls = makeRotationControls(session, state.activeTeamCode, state.rotationDraft);
        const contract = state.validateFranchiseRotationState({
          state: session.leagueState,
          teamCode: state.activeTeamCode,
          controls: proposedControls,
        });
        if (contract.status !== 'pass') {
          validation.ready = false;
          validation.messages.push(...(contract.violations ?? []), ...(contract.missingInputs ?? []));
        }
      } catch (error) {
        validation.ready = false;
        validation.messages.push(`Franchise control validation failed: ${error?.message ?? error}`);
      }
    }
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
    view.canAdvanceGame = !busy && Boolean(next) && Boolean(saved) && validation.ready
      && state.workerCapabilities?.preparedGameInputs === true;
    view.canAdvanceUserGame = view.canAdvanceGame;
    view.rotationSaved = Boolean(saved);
  }

  if (!session || !team) {
    view.contracts = { empty: true, text: 'Initialize a franchise scenario to inspect contract and payroll inputs.' };
  } else {
    const year = Number(league.seasonStartYear);
    const payroll = team.payrollState ?? {};
    const roster = rosterRowsForTeam(team, league).map(row => {
      const terms = row.player?.contractSeasons ?? row.player?.contract?.seasons ?? [];
      const currentTerms = Array.isArray(terms)
        ? terms.filter(term => Number(term.seasonStartYear ?? term.fromYear) === year) : [];
      const term = currentTerms.length === 1 ? currentTerms[0] : null;
      const termStatus = currentTerms.length > 1 ? 'Multiple current-season terms'
        : !row.player ? 'Player state missing'
          : !term ? 'No exact-season term' : String(term.optionDecisionStatus ?? term.optionStatus ?? term.status ?? 'Term present');
      return {
        name: row.name,
        availableForWaiver: Boolean(row.player && !row.excluded),
        contractStatus: termStatus,
        salaryUsd: term ? resolvedMoney(term.salary) : null,
        capHitUsd: term ? resolvedMoney(term.capHit) : null,
        contractTerm: term,
      };
    });
    const evaluationIsCurrent = state.lastTransactionEvaluationRevision === session.revision
      && transactionBindingMatches(state.lastTransactionSessionBinding, session);
    const evaluation = evaluationIsCurrent ? state.lastTransactionEvaluation : null;
    const proposal = evaluationIsCurrent ? state.lastTransactionProposal : null;
    const approvalOnlyBlocks = (evaluation?.blockedReasons ?? []).filter(reason => !/user approval is required/i.test(String(reason)));
    const transactionWindow = String(league.transactionWindow ?? 'unknown');
    const transactionCapability = state.workerCapabilities?.transactions === true;
    const windowAllowsRosterMove = ROSTER_MOVE_WINDOWS.has(transactionWindow);
    const canApprove = Boolean(!busy && evaluation && proposal && evaluation.userApprovalRequired === true
      && evaluation.approvalReceived !== true && approvalOnlyBlocks.length === 0
      && transactionCapability && windowAllowsRosterMove
      && (evaluation.status === 'confirmed-legal'
        || (league.mode === 'provisional-sandbox' && evaluation.status === 'provisional')));
    const canEvaluate = Boolean(!busy && transactionCapability && windowAllowsRosterMove && roster.some(row => row.availableForWaiver));
    const transactionMessage = !transactionCapability
      ? 'The initialized worker does not advertise transaction evaluation.'
      : !windowAllowsRosterMove
        ? `The worker supports transactions, but the ${transactionWindow} window does not allow roster moves.`
        : !roster.some(row => row.availableForWaiver)
          ? 'No exact rostered player is available for a waiver proposal.'
          : 'Select one rostered player to build an exact-revision waiver proposal; the worker reports any missing contract or payroll evidence.';
    const payrollSources = Array.isArray(payroll.sourceRefs) ? payroll.sourceRefs : [];
    view.contracts = {
      empty: false,
      teamCode: state.activeTeamCode,
      teamName: team.teamName ?? team.name ?? state.activeTeamCode,
      seasonStartYear: year,
      transactionWindow,
      mode: league.mode ?? 'unknown',
      rulesReferenceStatus: league.rulesReference?.status ?? 'missing',
      payroll: {
        status: payroll.status ?? 'unknown',
        seasonStartYear: payroll.seasonStartYear ?? null,
        rulesVersionId: payroll.rulesVersionId ?? null,
        sourceCount: payrollSources.length,
        totalTeamSalaryUsd: resolvedMoney(payroll.totalTeamSalaryUsd ?? payroll.components?.totalTeamSalaryUsd),
        apronTeamSalaryUsd: resolvedMoney(payroll.apronTeamSalaryUsd ?? payroll.components?.apronTeamSalaryUsd),
        taxTeamSalaryUsd: resolvedMoney(payroll.taxTeamSalaryUsd ?? payroll.components?.taxTeamSalaryUsd),
        unresolvedLiabilityCount: Array.isArray(payroll.unresolvedLiabilities) ? payroll.unresolvedLiabilities.length : null,
      },
      roster,
      transactionMessage,
      canEvaluateTransaction: canEvaluate,
      canApproveTransaction: canApprove,
      needsSandboxApproval: Boolean(evaluation?.status === 'provisional' && league.mode === 'provisional-sandbox'),
      evaluation: evaluation ? {
        proposal,
        playerName: proposal?.legs?.[0]?.canonicalName ?? '',
        status: evaluation.status,
        legalityOutcome: evaluation.legalityOutcome ?? 'unknown',
        evidenceBasis: evaluation.evidenceBasis ?? 'unknown',
        executionStatus: evaluation.executionStatus ?? 'blocked',
        blockedReasons: evaluation.blockedReasons,
        missingInputs: evaluation.missingInputs,
        violations: evaluation.violations,
        payrollAfterByTeam: evaluation.legality?.calculations?.resultingPayrollByTeam ?? null,
        provisionalSandbox: league.mode === 'provisional-sandbox',
      } : state.lastTransactionEvaluation ? {
        stale: true,
        evaluatedRevision: state.lastTransactionEvaluationRevision,
        currentRevision: session.revision,
        playerName: state.lastTransactionProposal?.legs?.[0]?.canonicalName ?? '',
      } : null,
      latestTransaction: league.transactionLedger?.at(-1) ?? null,
    };
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
        available: state.workerCapabilities?.preparedGameInputs === true,
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
        inputReady: played ? null : state.workerCapabilities?.preparedGameInputs === true,
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
  const seasonKey = Number.isInteger(session?.leagueState?.seasonStartYear)
    ? String(session.leagueState.seasonStartYear) : null;
  const closeoutReceipt = seasonKey
    ? session?.leagueState?.franchiseLifecycleReceiptsBySeason?.[seasonKey] ?? null : null;
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
  } else if (closeoutReceipt) {
    completionHint = 'The regular season is already closed with a revision-bound handoff receipt.';
    completionTitle = 'The completed schedule has already been closed for this franchise revision.';
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
    enabled: !busy && exhausted && !closeoutReceipt && state.workerCapabilities?.seasonCompletion === true,
    hint: completionHint, title: completionTitle,
    status: receiptIsCurrent
      ? { state: 'verified', text: `Verified ${state.lastSeasonCompletion.status} for ${state.lastSeasonCompletion.seasonStartYear}; session revision ${state.lastSeasonCompletionRevision} is unchanged.`, receipt: JSON.stringify(state.lastSeasonCompletion, null, 2) }
      : { state: 'idle', text: exhausted ? 'Schedule cursor is exhausted; the ledger has not been verified yet.' : 'No completion receipt verified.', receipt: 'The exact worker receipt will appear here after verification.' },
  };
  const closeoutReady = !busy && exhausted && receiptIsCurrent
    && session?.leagueState?.transactionWindow === 'games'
    && state.workerCapabilities?.seasonEndTransition === true;
  view.closeout = session ? {
    state: closeoutReceipt ? 'closed'
      : state.workerCapabilities?.seasonEndTransition !== true ? 'unavailable'
        : closeoutReady ? 'ready' : 'blocked',
    seasonStartYear: session.leagueState?.seasonStartYear ?? null,
    statusText: closeoutReceipt
      ? `Regular season closed at session revision ${session.revision}.`
      : state.workerCapabilities?.seasonEndTransition !== true
        ? 'The initialized runtime does not support the versioned regular-season closeout transition.'
        : closeoutReady
          ? 'The completed schedule is verified and ready for regular-season closeout.'
          : 'Finish and verify the exact regular-season schedule before closeout is available.',
    hint: closeoutReceipt
      ? 'This handoff records the games-to-season-end state transition. It does not simulate postseason or advance the season year.'
      : 'Closeout is bound to the current completion receipt and cannot run against a stale session revision.',
    receipt: closeoutReceipt,
  } : null;

  const savedAwardsRecord = seasonKey ? session?.leagueState?.awardHistoryBySeason?.[seasonKey] ?? null : null;
  const savedAwardsReceipt = savedAwardsRecord?.finalizationReceipt ?? null;
  const awardActions = (session?.actionHistory ?? []).filter(action => action.kind === 'finalize-season-awards'
    && action.seasonStartYear === session?.leagueState?.seasonStartYear);
  const awardReceiptHasSupportedShape = Boolean(savedAwardsRecord
    && savedAwardsRecord.seasonStartYear === session?.leagueState?.seasonStartYear
    && savedAwardsReceipt?.format === 'djhc-franchise-season-awards-finalize-v1'
    && savedAwardsReceipt.version === '1.0.0'
    && savedAwardsReceipt.previewFeatureFlag === 'seasonAwardsFinalizeV1'
    && savedAwardsReceipt.classification === 'development-scenario; not-certified'
    && savedAwardsReceipt.status === 'season-awards-finalized'
    && savedAwardsReceipt.seasonStartYear === session?.leagueState?.seasonStartYear
    && Number.isSafeInteger(savedAwardsReceipt.awardsSeed)
    && Number.isSafeInteger(savedAwardsReceipt.priorSessionRevision)
    && savedAwardsReceipt.sessionRevision === savedAwardsReceipt.priorSessionRevision + 1
    && Number.isSafeInteger(savedAwardsReceipt.priorLeagueStateRevision)
    && savedAwardsReceipt.leagueStateRevision === savedAwardsReceipt.priorLeagueStateRevision + 1
    && /^[a-f0-9]{64}$/.test(savedAwardsReceipt.receiptSha256 ?? '')
    && /^[a-f0-9]{64}$/.test(savedAwardsReceipt.completionReceiptSha256 ?? '')
    && /^[a-f0-9]{64}$/.test(savedAwardsReceipt.historyRecordSha256 ?? '')
    && /^[a-f0-9]{64}$/.test(savedAwardsReceipt.inputKeySha256 ?? '')
    && savedAwardsReceipt.allStarSelectionTiming === 'end-of-season-modeled-selection'
    && savedAwardsReceipt.handoffReceiptSha256 === closeoutReceipt?.receiptSha256
    && savedAwardsReceipt.canonicalScheduleSha256 === closeoutReceipt?.canonicalScheduleSha256
    && JSON.stringify(savedAwardsReceipt.sourceReceipt) === JSON.stringify(session?.sourceReceipt)
    && JSON.stringify(savedAwardsReceipt.modelReceipt) === JSON.stringify(session?.modelReceipt)
    && savedAwardsReceipt.sessionRevision <= session?.revision
    && savedAwardsReceipt.leagueStateRevision <= session?.leagueState?.revision);
  const awardActionMatchesReceipt = awardReceiptHasSupportedShape && awardActions.length === 1
    && awardActions[0].revision === savedAwardsReceipt.sessionRevision
    && awardActions[0].finalizationReceiptSha256 === savedAwardsReceipt.receiptSha256
    && awardActions[0].canonicalScheduleSha256 === savedAwardsReceipt.canonicalScheduleSha256
    && awardActions[0].handoffReceiptSha256 === savedAwardsReceipt.handoffReceiptSha256;
  const seasonEndClosed = Boolean(session && exhausted
    && session.leagueState?.transactionWindow === 'season-end'
    && closeoutReceipt?.status === 'regular-season-closed'
    && closeoutReceipt.seasonStartYear === session.leagueState.seasonStartYear
    && plainReceipt(closeoutReceipt.completionReceipt)
    && /^[a-f0-9]{64}$/.test(closeoutReceipt.receiptSha256 ?? '')
    && /^[a-f0-9]{64}$/.test(closeoutReceipt.canonicalScheduleSha256 ?? ''));
  const closeoutRevisionIsCurrent = closeoutReceipt?.sessionRevision === session?.revision
    && closeoutReceipt?.leagueStateRevision === session?.leagueState?.revision;
  const verifiedAwards = Boolean(awardActionMatchesReceipt
    && state.lastSeasonAwardsFinalization?.sessionRevision === session?.revision
    && state.lastSeasonAwardsFinalization?.receiptSha256 === savedAwardsReceipt?.receiptSha256);
  const historyRecord = savedAwardsRecord
    ? Object.fromEntries(Object.entries(savedAwardsRecord).filter(([key]) => key !== 'finalizationReceipt'))
    : null;
  let awardsState = 'blocked';
  let awardsStatusText = 'Close and verify the regular season before simulated awards are available.';
  if (!session) {
    awardsState = 'unavailable';
    awardsStatusText = 'Initialize a franchise season before checking season-end awards.';
  } else if (state.workerCapabilities?.seasonAwardsFinalization !== true) {
    awardsState = 'unavailable';
    awardsStatusText = 'The initialized worker does not advertise revision-bound season-awards finalization.';
  } else if (!seasonEndClosed) {
    awardsState = session.leagueState?.transactionWindow === 'season-end'
      ? 'error' : 'blocked';
    awardsStatusText = session.leagueState?.transactionWindow === 'season-end'
      ? 'The season-end handoff receipt is missing or does not match this completed schedule.'
      : 'Close the verified regular season before simulated awards can be recorded.';
  } else if (savedAwardsRecord && (!awardActionMatchesReceipt || awardActions.length !== 1)) {
    awardsState = 'error';
    awardsStatusText = 'Saved awards history or action history does not match a supported finalization receipt.';
  } else if (savedAwardsRecord) {
    awardsState = verifiedAwards ? 'finalized' : 'recorded';
    awardsStatusText = verifiedAwards
      ? `Simulated awards receipt verified for the ${session.leagueState.seasonStartYear} season at session revision ${session.revision}.`
      : 'A saved awards receipt is present. Verify it against the current franchise session before treating it as finalized.';
  } else if (awardActions.length) {
    awardsState = 'error';
    awardsStatusText = 'Award action history exists without a matching saved awards record; finalization is held for review.';
  } else if (!closeoutRevisionIsCurrent) {
    awardsState = 'blocked';
    awardsStatusText = 'The closeout receipt is stale for this session revision. Restore the exact closed-season checkpoint before finalizing awards.';
  } else {
    awardsState = 'ready';
    awardsStatusText = `The ${session.leagueState.seasonStartYear} regular season is closed with a current receipt. Enter a seed to record simulated awards.`;
  }
  const awardsAvailable = state.workerCapabilities?.seasonAwardsFinalization === true
    && seasonEndClosed
    && (savedAwardsRecord ? awardActionMatchesReceipt : awardActions.length === 0 && closeoutRevisionIsCurrent);
  const awardsCanRun = !busy && awardsAvailable;
  view.awards = session ? {
    state: awardsState,
    available: awardsAvailable,
    enabled: awardsCanRun,
    hasSavedRecord: Boolean(savedAwardsRecord),
    verifiedForCurrentRevision: verifiedAwards,
    seasonStartYear: session.leagueState?.seasonStartYear ?? null,
    seed: savedAwardsReceipt?.awardsSeed ?? 1,
    historyRecord,
    receipt: savedAwardsReceipt,
    formKey: `${seasonKey ?? 'season'}:${closeoutReceipt?.receiptSha256 ?? 'no-closeout'}:${savedAwardsReceipt?.receiptSha256 ?? 'new-awards'}`,
    statusText: awardsStatusText,
    hint: awardsCanRun
      ? 'The worker will recheck the exact closed-season ledger, pinned source/model, and receipt before recording this action.'
      : 'Award finalization uses this franchise session only. It does not advance the season year or open offseason actions.',
    buttonTitle: savedAwardsRecord
      ? 'Ask the worker to revalidate the stored simulated awards receipt for this exact session.'
      : 'Record simulated awards from the verified closed-season ledger using the explicit seed.',
  } : null;

  // === Verified postseason, offseason, and rollover controls ===
  if (!session) {
    view.lifecycle = null;
  } else {
    const lifecycleCapabilities = state.workerCapabilities ?? {};
    const currentWindow = session.leagueState?.transactionWindow ?? 'unknown';
    const nextWindow = nextOffseasonWindow(currentWindow);
    const postseasonReceipt = session.leagueState?.franchisePostseasonReceiptsBySeason?.[seasonKey] ?? null;
    const postseasonHistory = session.leagueState?.postseasonHistoryBySeason?.[seasonKey] ?? null;
    const postseasonSaved = postseasonReceipt?.status === 'franchise-postseason-completed'
      && postseasonReceipt.seasonStartYear === session.leagueState?.seasonStartYear
      && /^[a-f0-9]{64}$/.test(postseasonReceipt.receiptSha256 ?? '')
      && postseasonHistory?.champion?.teamCode === postseasonReceipt.champion?.teamCode;
    const preview = state.lastPreparedPostseason;
    const previewCurrent = Boolean(preview && preview.sessionRevision === session.revision
      && preview.receipt?.priorSessionRevision === session.revision);
    const canPreparePostseason = !busy && lifecycleCapabilities.postseasonInputPreparation === true
      && seasonEndClosed && awardActionMatchesReceipt && !postseasonSaved && !session.pendingOffseasonApproval;
    const canCommitPostseason = !busy && lifecycleCapabilities.postseason === true && previewCurrent;
    const postseasonStatus = postseasonSaved ? 'completed'
      : previewCurrent ? 'prepared'
        : currentWindow !== 'season-end' ? 'blocked'
          : !seasonEndClosed ? 'blocked'
            : !awardActionMatchesReceipt ? 'blocked'
              : lifecycleCapabilities.postseasonInputPreparation === true ? 'ready' : 'unavailable';
    const pendingApproval = session.pendingOffseasonApproval ?? null;
    const phaseCapability = currentWindow === 'free-agency' ? lifecycleCapabilities.freeAgencyMarket === true
      : currentWindow === 'trade-window' ? lifecycleCapabilities.tradeWindow === true
        : currentWindow === 'draft' ? lifecycleCapabilities.draft === true : false;
    const latestPhase = state.lastLifecycleAction?.window === currentWindow
      && state.lastLifecycleAction?.sessionRevision === session.revision ? state.lastLifecycleAction : null;
    const phaseMissingInputs = latestPhase?.missingInputs ?? [];
    const canRunPhase = !busy && lifecycleCapabilities.offseasonPhaseRunner === true
      && phaseCapability && !pendingApproval && phaseMissingInputs.length === 0;
    const phaseName = currentWindow === 'free-agency' ? 'free agency'
      : currentWindow === 'trade-window' ? 'trade window'
        : currentWindow === 'draft' ? 'draft' : null;
    const nextSeasonReady = currentWindow === 'season-end'
      && lifecycleCapabilities.seasonRollover === true
      && seasonEndClosed && awardActionMatchesReceipt && postseasonSaved && !pendingApproval;
    const windowAdvanceReady = !busy && lifecycleCapabilities.offseasonWindowAdvance === true
      && Boolean(nextWindow) && !['games', 'season-end'].includes(currentWindow) && !pendingApproval;
    let lifecycleHint;
    if (currentWindow === 'season-end' && !seasonEndClosed) lifecycleHint = 'The regular-season closeout receipt must match this schedule before later season steps can run.';
    else if (currentWindow === 'season-end' && !awardActionMatchesReceipt) lifecycleHint = 'Finalize and verify simulated awards against the saved closeout receipt before postseason.';
    else if (currentWindow === 'season-end' && !postseasonSaved && !previewCurrent) lifecycleHint = lifecycleCapabilities.postseasonInputPreparation === true
      ? 'Postseason results are prepared for review, then committed as a separate approved action.'
      : 'The worker has not prepared postseason inputs for this revision.';
    else if (currentWindow === 'season-end' && postseasonSaved && !nextSeasonReady) lifecycleHint = 'The saved postseason receipt is present; the worker will revalidate it before any next-season transition.';
    else if (phaseName && !phaseCapability) lifecycleHint = `No ready ${phaseName} executor is advertised by this worker.`;
    else if (phaseMissingInputs.length) lifecycleHint = `The latest ${phaseName} run needs inputs: ${phaseMissingInputs.join(', ')}.`;
    else if (pendingApproval && pendingApproval.stateRevision !== session.leagueState?.revision) lifecycleHint = 'The saved offseason proposal is stale and cannot be approved.';
    else lifecycleHint = 'Each offseason window advances one step. The worker checks the current revision and transaction rules.';
    view.lifecycle = {
      seasonStartYear: session.leagueState?.seasonStartYear ?? null,
      currentWindow,
      capabilities: lifecycleCapabilities,
      hint: lifecycleHint,
      postseason: {
        state: postseasonStatus,
        available: canPreparePostseason,
        enabled: canPreparePostseason,
        canCommit: canCommitPostseason,
        preview: previewCurrent ? preview : null,
        receipt: postseasonSaved ? postseasonReceipt : null,
        history: postseasonSaved ? postseasonHistory : null,
        formKey: `${session.leagueState?.seasonStartYear ?? 'season'}:${closeoutReceipt?.receiptSha256 ?? 'no-closeout'}:${savedAwardsReceipt?.receiptSha256 ?? 'no-awards'}`,
        statusText: postseasonSaved ? `Postseason completed for ${session.leagueState.seasonStartYear}; ${postseasonHistory.champion.teamCode} won the simulated championship.`
          : previewCurrent ? `${preview.postseason?.games?.length ?? 0} simulated postseason games are prepared and waiting for your commit approval.`
            : canPreparePostseason ? 'Verified closeout and award receipts are ready for a reproducible postseason run.'
              : currentWindow === 'season-end' ? lifecycleHint
                : 'Postseason opens after a verified regular-season closeout and finalized awards.',
      },
      nextSeason: {
        enabled: !busy && nextSeasonReady,
        targetSeasonStartYear: Number(session.leagueState?.seasonStartYear) + 1,
        statusText: currentWindow === 'season-end'
          ? postseasonSaved ? 'A verified simulated championship is saved. The next action advances exactly one season into preseason.'
            : 'Complete postseason before advancing this Franchise season.'
          : 'Next-season rollover becomes available after postseason completion.',
      },
      offseason: {
        pendingApproval,
        canResolveApproval: !busy && lifecycleCapabilities.offseasonApprovalResolution === true
          && Boolean(pendingApproval) && pendingApproval.stateRevision === session.leagueState?.revision,
        canRunPhase,
        phaseName,
        phaseMissingInputs,
        phaseResult: latestPhase?.status ?? null,
        canAdvanceWindow: windowAdvanceReady,
        nextWindow,
        statusText: currentWindow === 'season-end' ? 'Offseason windows open after the postseason is complete and the season advances to preseason.'
          : phaseName && !phaseCapability ? `${phaseName} is the current window; this worker does not expose a ready phase executor.`
            : `Current window: ${currentWindow.replaceAll('-', ' ')}${nextWindow ? ` · next: ${nextWindow.replaceAll('-', ' ')}` : ''}.`,
      },
      latestAction: state.lastLifecycleAction,
    };
  }

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

  // Speed pass: the two pinned model texts are static same-origin assets, so
  // they start loading the moment the page opens instead of waiting for the
  // season pick. A failed prefetch clears itself for a retry on the next load.
  const modelPrefetch = useRef(null);
  const startModelPrefetch = () => {
    if (!modelPrefetch.current) {
      modelPrefetch.current = Promise.all([
        fetchJsonText(GAME_MODEL_PATH, 'Game model'),
        fetchJsonText(PRODUCTION_CANDIDATE_PATH, 'Player production candidate'),
      ]).catch(error => { modelPrefetch.current = null; throw error; });
    }
    return modelPrefetch.current;
  };

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
    if (!state.client) {
      const client = await createFranchiseWorker();
      state.client = createStandaloneFranchiseWorkerAdapter(client);
    }
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
    if (result.session.revision !== ref.current.activeSession?.revision) {
      ref.current.lastPreparedPostseason = null;
      ref.current.lastLifecycleAction = null;
    }
    if (result.capabilities && typeof result.capabilities === 'object') ref.current.workerCapabilities = result.capabilities;
    clearSeasonCompletionReceipt();
    ref.current.lastSeasonAwardsFinalization = null;
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
      .then(engine => {
        if (!live) return;
        ref.current.validateFranchiseRotationState = engine.validateFranchiseRotationState;
        setEnginePhase('ready');
        ref.current.workerStatus = { text: 'Franchise engine connected', state: 'idle' };
        render();
      })
      .catch(error => { if (live) { setEngineError(error.message); setEnginePhase('error'); } });
    return () => { live = false; };
  }, [attempt, enginePhase]);

  // Warm the model texts alongside the engine while the page opens.
  useEffect(() => { void startModelPrefetch().catch(() => {}); }, []);

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
        prepared = await snapshotBuilder({
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
      state.lastSeasonAwardsFinalization = null;
      state.lastPreparedPostseason = null;
      state.lastLifecycleAction = null;
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
    let autoRosterStart = false;
    const loadingMessage = `Loading pinned ${requestedYear}–${String(requestedYear + 1).slice(-2)} regular-season V4 sources and the exact model texts…`;
    state.v4OperationNotice = { operation: 'load', kind: 'loading', seasonStartYear: requestedYear, message: loadingMessage };
    setBusy(true);
    setWorkerStatus('Loading exact-season V4 sources…', 'idle');
    try {
      const { intake } = await ensureV4Api();
      const seasonStartYear = requestedYear;
      const releasePin = intake.createV4FranchiseLocalMirrorReleasePinV1({ origin: window.location.origin });
      const baseUrl = new URL('/tools/swishiq-studio/', window.location.origin).href;
      // Three relay/fetch streams overlap: model texts (usually already warm),
      // the season package, and the player-game observations the default
      // start-of-season roster assignment needs — that last stream previously
      // waited for the whole intake to finish first.
      const playerGames = fetchPlayerGamesWithRetry(intake, { seasonStartYear, releasePin, baseUrl, requestTimeoutMs: V4_RELAY_TIMEOUT_MS })
        .then(result => { const cached = { seasonStartYear, part: result.part }; state.v4PlayerGamesPart = cached; return cached; })
        .catch(() => null);
      const [modelProduction, loadedIntake] = await Promise.all([
        startModelPrefetch(),
        intake.loadV4FranchiseIntakeV1({ seasonStartYear, phase: 'regular', releasePin, baseUrl, requestTimeoutMs: V4_RELAY_TIMEOUT_MS }),
      ]);
      void playerGames;
      const [model, production] = modelProduction;
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
      state.v4RosterMode = null;
      state.workerStatus = { text: 'V4 intake verified · worker not initialized', state: 'idle' };
      showMessage('');
      autoRosterStart = true;
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
    // Default roster set: start-of-season assignment runs as soon as the
    // season package finishes loading, without a separate click.
    if (autoRosterStart) await applyRosterMode('start');
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
      const suggestedIntake = await api.loadLastObservedTeamScenarioSuggestionsV1(intake, { releasePin, baseUrl, requestTimeoutMs: V4_RELAY_TIMEOUT_MS });
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
        cached = { seasonStartYear, part: (await fetchPlayerGamesWithRetry(api, { seasonStartYear, releasePin, baseUrl, requestTimeoutMs: V4_RELAY_TIMEOUT_MS })).part };
        state.v4PlayerGamesPart = cached;
      }
      const { applied, held } = deriveRosterModeAssignments(intake, cached.part.records, mode, cached.part);
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
    } else if (field === 'shotUsageMultiplier') {
      draftRow.shotUsageMultiplier = Number(checkedOrValue);
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
    const currentSession = state.activeSession;
    if (!currentSession) return;
    showMessage('');
    setBusy(true);
    try {
      const worker = await ensureClient();
      const result = await worker.saveRotation({
        expectedRevision: currentSession.revision,
        teamCode: state.activeTeamCode,
        controls: makeRotationControls(currentSession, state.activeTeamCode, state.rotationDraft),
      });
      const failure = commandFailure(result);
      if (failure) throw new Error(failure);
      const status = String(result?.status ?? '').toLowerCase();
      if (!['created', 'updated', 'ready', 'pass'].includes(status)) throw new Error(`Rotation was not saved (worker status: ${result?.status ?? 'unknown'}).`);
      const verifiedSession = await validateStandaloneRotationRefresh({ result, currentSession,
        teamCode: state.activeTeamCode });
      replaceSession(result);
      state.activeSession = verifiedSession;
      state.workerCapabilities = result.capabilities;
      state.saveStatus = result.capabilities?.preparedGameInputs === true
        ? `Rotation and refreshed game-input bundle verified · revision ${verifiedSession.revision}. Save the franchise checkpoint separately when ready.`
        : `Rotation saved · revision ${verifiedSession.revision}. The worker did not refresh prepared game inputs, so game advancement remains disabled.`;
      setWorkerStatus(result.capabilities?.preparedGameInputs === true
        ? 'Rotation saved · game inputs refreshed and verified' : 'Rotation saved · game inputs need refresh',
      result.capabilities?.preparedGameInputs === true ? 'ready' : 'review');
      if (result.capabilities?.preparedGameInputs !== true) {
        showMessage('Rotation was saved, but the worker did not return a current prepared game-input receipt. Game advancement stays disabled until the inputs are refreshed.', 'notice');
      }
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
      if (state.workerCapabilities?.preparedGameInputs !== true) throw new Error('The worker has no receipt-validated prepared game inputs for this session revision. Save or refresh the rotation inputs before advancing.');
      const worker = await ensureClient();
      const result = await worker.advanceNextGame(state.activeSession.revision);
      if (result?.status === 'season-games-complete') {
        replaceSession(result);
        showMessage('The regular-season flow is complete. Postseason and next-season steps are runtime-gated worker actions; this UI exposes the regular-season flow only.', 'notice');
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
      if (state.workerCapabilities?.preparedGameInputs !== true) throw new Error('The worker has no receipt-validated prepared game inputs for this session revision. Save or refresh the rotation inputs before advancing.');
      const worker = await ensureClient();
      const result = await worker.advanceNextUserGame(state.activeSession.revision);
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
      const result = await worker.verifySeasonCompletion(revision);
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

  // === Regular-season closeout (closeRegularSeason) ===
  // The worker recomputes the completion receipt against the exact schedule and
  // ledger, then performs only games -> season-end. It does not imply
  // postseason, awards, offseason transactions, or next-season readiness.
  const closeRegularSeason = async () => {
    const state = ref.current;
    const session = state.activeSession;
    const completion = state.lastSeasonCompletion;
    const completionRevision = state.lastSeasonCompletionRevision;
    if (!session || state.busy) return;
    showMessage('');
    setBusy(true);
    try {
      if (state.workerCapabilities?.seasonEndTransition !== true) {
        throw new Error('The initialized franchise runtime does not support regular-season closeout.');
      }
      if (session.leagueState?.transactionWindow !== 'games'
        || session.scheduleCursor !== session.schedule?.length || !session.schedule?.length) {
        throw new Error('Finish the canonical regular-season schedule before closeout.');
      }
      if (!completion || completionRevision !== session.revision) {
        throw new Error('Verify season completion against the exact current session before closeout.');
      }
      const worker = await ensureClient();
      const expectedRevision = session.revision;
      const result = await worker.closeRegularSeason({
        expectedRevision,
        completionSessionRevision: expectedRevision,
        completionReceipt: clone(completion),
      });
      const failure = commandFailure(result);
      if (failure) throw new Error(failure);
      if (result?.status !== 'regular-season-closed' || !result.session
        || result.session.revision !== expectedRevision + 1
        || result.session.leagueState?.transactionWindow !== 'season-end') {
        throw new Error(`Regular-season closeout did not return a valid season-end session (status: ${result?.status ?? 'unknown'}).`);
      }
      const receipt = result.handoffReceipt;
      const year = result.session.leagueState.seasonStartYear;
      const savedReceipt = result.session.leagueState?.franchiseLifecycleReceiptsBySeason?.[String(year)];
      if (!receipt || receipt.status !== 'regular-season-closed'
        || receipt.priorSessionRevision !== expectedRevision
        || receipt.sessionRevision !== result.session.revision
        || savedReceipt?.receiptSha256 !== receipt.receiptSha256) {
        throw new Error('Regular-season closeout returned an unbound handoff receipt.');
      }
      if (JSON.stringify(result.completion) !== JSON.stringify(completion)) {
        throw new Error('Regular-season closeout returned a completion receipt that does not match the verified session.');
      }
      state.activeSession = result.session;
      state.workerCapabilities = result.capabilities ?? state.workerCapabilities;
      state.lastSeasonAwardsFinalization = null;
      state.lastPreparedPostseason = null;
      state.lastLifecycleAction = null;
      clearSeasonCompletionReceipt();
      state.lastGameOutput = null;
      state.saveStatus = `Regular season closed and receipt-bound · revision ${state.activeSession.revision}. Save or export this season-end checkpoint before a later lifecycle step.`;
      state.lastPreparedPostseason = null;
      state.lastLifecycleAction = null;
      setWorkerStatus('Regular season closed · season-end actions ready', 'ready');
      showMessage(`The ${year} regular-season schedule is closed with a revision-bound receipt. Finalize simulated awards, then use the season lifecycle panel below for postseason and next-season steps.`, 'notice');
    } catch (error) {
      showFailure(error, 'Regular-season closeout could not be completed.', 'Season closeout');
    } finally { setBusy(false); render(); }
  };

  // === Season-awards finalization (finalizeSeasonAwards) ===
  // The worker owns the season-end simulation and receipt. Keep the exact
  // current closeout/session pins in view until its revision-bound result has
  // passed local receipt and SHA-256 validation.
  const finalizeSeasonAwards = async awardsSeed => {
    const state = ref.current;
    const session = state.activeSession;
    if (!session || state.busy) return;
    showMessage('');
    setBusy(true);
    try {
      if (state.workerCapabilities?.seasonAwardsFinalization !== true) {
        throw new Error('The initialized franchise runtime does not support simulated season-awards finalization.');
      }
      if (!Number.isSafeInteger(awardsSeed) || awardsSeed < 0 || awardsSeed > 0xffffffff) {
        throw new Error('Enter an explicit unsigned 32-bit integer awards seed.');
      }
      const year = session.leagueState?.seasonStartYear;
      const closeout = session.leagueState?.franchiseLifecycleReceiptsBySeason?.[String(year)];
      if (session.leagueState?.transactionWindow !== 'season-end'
        || !session.schedule?.length || session.scheduleCursor !== session.schedule.length
        || closeout?.status !== 'regular-season-closed' || closeout.seasonStartYear !== year
        || !plainReceipt(closeout.completionReceipt)) {
        throw new Error('Close and verify this exact regular season before finalizing simulated awards.');
      }
      const worker = await ensureClient();
      const expectedRevision = session.revision;
      const result = await worker.finalizeSeasonAwards({
        expectedRevision,
        awardsSeed,
        awardsPolicy: null,
        userApproved: true,
      });
      const failure = commandFailure(result);
      if (failure) throw new Error(failure);
      let verifiedSession;
      try {
        verifiedSession = await validateStandaloneSeasonAwardsFinalization({
          result,
          currentSession: session,
          awardsSeed,
        });
      } catch (error) {
        try { worker.dispose?.(); } catch { /* The prior verified session remains visible. */ }
        if (state.client === worker) state.client = null;
        state.workerCapabilities = null;
        throw new Error(`Season-awards finalization returned an invalid receipt; the worker was closed and the prior view was preserved. ${error.message}`,
          { cause: error });
      }
      state.activeSession = verifiedSession;
      state.workerCapabilities = result.capabilities ?? state.workerCapabilities;
      state.lastSeasonAwardsFinalization = {
        sessionRevision: verifiedSession.revision,
        receiptSha256: result.receipt.receiptSha256,
      };
      state.saveStatus = `Simulated season awards recorded with a verified receipt · revision ${verifiedSession.revision}. Save or export this season-end checkpoint.`;
      setWorkerStatus(result.idempotentReplay ? 'Saved season-awards receipt reverified' : 'Simulated season awards finalized · receipt verified', 'ready');
      showMessage(`Simulated awards were recorded for the ${year} season at revision ${verifiedSession.revision}. They are development-scenario results, not official NBA awards or calibrated forecasts. Save or export the season-end checkpoint to keep this result.`, 'notice');
    } catch (error) {
      showFailure(error, 'Season-awards finalization could not be completed.', 'Season awards');
    } finally { setBusy(false); render(); }
  };

  // === Receipt-bound postseason and offseason lifecycle ===
  const preparePostseason = async postseasonSeed => {
    const state = ref.current;
    const session = state.activeSession;
    if (!session || state.busy) return;
    showMessage('');
    setBusy(true);
    try {
      if (state.workerCapabilities?.postseasonInputPreparation !== true) {
        throw new Error('The worker has not advertised postseason preparation for this session revision.');
      }
      if (!Number.isSafeInteger(postseasonSeed) || postseasonSeed < 0 || postseasonSeed > 0xffffffff) {
        throw new Error('Enter an explicit unsigned 32-bit postseason seed.');
      }
      const worker = await ensureClient();
      const result = await worker.preparePostseason({ expectedRevision: session.revision,
        userApproved: true, postseasonSeed, playInPolicy: 'auto' });
      const failure = commandFailure(result);
      if (failure) throw new Error(failure);
      try {
        const prepared = await validateStandalonePostseasonPreparation({ result, currentSession: session, postseasonSeed });
        state.lastPreparedPostseason = { ...prepared, sessionRevision: session.revision };
      } catch (error) {
        try { worker.dispose?.(); } catch { /* Preserve the prior verified session. */ }
        if (state.client === worker) state.client = null;
        state.workerCapabilities = null;
        throw new Error(`Postseason preparation returned an invalid review receipt; the worker was closed and the prior session was preserved. ${error.message}`, { cause: error });
      }
      state.workerCapabilities = result.capabilities ?? state.workerCapabilities;
      state.lastLifecycleAction = { kind: 'postseason-prepared', status: result.status,
        sessionRevision: session.revision, receipt: result.receipt };
      setWorkerStatus('Postseason prepared · review before commit', 'ready');
      showMessage(`The simulated postseason preview is ready for the ${session.leagueState.seasonStartYear} season. Review the champion and receipt, then explicitly commit it.`, 'notice');
    } catch (error) {
      showFailure(error, 'Postseason could not be prepared.', 'Postseason');
    } finally { setBusy(false); render(); }
  };

  const commitPostseason = async () => {
    const state = ref.current;
    const session = state.activeSession;
    const prepared = state.lastPreparedPostseason;
    if (!session || state.busy) return;
    showMessage('');
    setBusy(true);
    try {
      if (state.workerCapabilities?.postseason !== true || !prepared || prepared.sessionRevision !== session.revision) {
        throw new Error('Prepare the postseason again against the current revision before committing.');
      }
      const worker = await ensureClient();
      const result = await worker.commitPostseason({ expectedRevision: session.revision, userApproved: true });
      const failure = commandFailure(result);
      if (failure) throw new Error(failure);
      let verifiedSession;
      try {
        verifiedSession = await validateStandalonePostseasonCommit({ result, currentSession: session, prepared });
      } catch (error) {
        try { worker.dispose?.(); } catch { /* Preserve the prior verified session. */ }
        if (state.client === worker) state.client = null;
        state.workerCapabilities = null;
        throw new Error(`Postseason commit returned an invalid receipt; the worker was closed and the prior session was preserved. ${error.message}`, { cause: error });
      }
      replaceSession(result);
      state.activeSession = verifiedSession;
      state.lastPreparedPostseason = null;
      state.lastLifecycleAction = { kind: 'postseason-committed', status: result.status,
        sessionRevision: verifiedSession.revision, receipt: result.receipt };
      state.saveStatus = `Simulated postseason committed with a verified receipt · revision ${verifiedSession.revision}. Save or export this Franchise checkpoint.`;
      setWorkerStatus('Postseason receipt verified · championship saved', 'ready');
      showMessage(`${result.postseason.champion.teamCode} won the simulated ${session.leagueState.seasonStartYear} postseason. Receipt ${result.receipt.receiptSha256.slice(0, 16)}… Save or export the Franchise checkpoint.`, 'notice');
    } catch (error) {
      showFailure(error, 'Postseason could not be committed.', 'Postseason');
    } finally { setBusy(false); render(); }
  };

  const advanceNextSeason = async () => {
    const state = ref.current;
    const session = state.activeSession;
    if (!session || state.busy) return;
    showMessage('');
    setBusy(true);
    try {
      if (state.workerCapabilities?.seasonRollover !== true
        || session.leagueState?.transactionWindow !== 'season-end') {
        throw new Error('The worker or current season window does not allow next-season rollover.');
      }
      const worker = await ensureClient();
      const result = await worker.advanceNextSeason({ expectedRevision: session.revision, userApproved: true });
      const failure = commandFailure(result);
      if (failure) throw new Error(failure);
      let verifiedSession;
      try {
        verifiedSession = await validateStandaloneNextSeasonAdvance({ result, currentSession: session });
      } catch (error) {
        try { worker.dispose?.(); } catch { /* Preserve the prior verified session. */ }
        if (state.client === worker) state.client = null;
        state.workerCapabilities = null;
        throw new Error(`Next-season transition returned an invalid receipt; the worker was closed and the prior session was preserved. ${error.message}`, { cause: error });
      }
      replaceSession(result);
      state.activeSession = verifiedSession;
      state.lastPreparedPostseason = null;
      state.lastLifecycleAction = { kind: 'season-advanced', status: result.status,
        sessionRevision: verifiedSession.revision, receipt: result.receipt };
      state.saveStatus = `Advanced to ${verifiedSession.leagueState.seasonStartYear} preseason with a verified transition receipt. Save or export this Franchise checkpoint.`;
      setWorkerStatus(`${verifiedSession.leagueState.seasonStartYear} preseason ready · transition receipt verified`, 'ready');
      showMessage(`Franchise advanced one season to ${verifiedSession.leagueState.seasonStartYear} preseason. The generated-scenario source, schedule, and transition receipt were verified.`, 'notice');
    } catch (error) {
      showFailure(error, 'Next season could not be started.', 'Season transition');
    } finally { setBusy(false); render(); }
  };

  const advanceOffseasonWindow = async nextWindow => {
    const state = ref.current;
    const session = state.activeSession;
    if (!session || state.busy) return;
    showMessage('');
    setBusy(true);
    try {
      if (state.workerCapabilities?.offseasonWindowAdvance !== true
        || nextOffseasonWindow(session.leagueState?.transactionWindow) !== nextWindow) {
        throw new Error('The requested offseason window is not the single next step for this session.');
      }
      const worker = await ensureClient();
      const result = await worker.advanceOffseasonWindow({ expectedRevision: session.revision, nextWindow });
      const failure = commandFailure(result);
      if (failure) throw new Error(failure);
      let verifiedSession;
      try { verifiedSession = validateStandaloneOffseasonWindowAdvance({ result, currentSession: session, nextWindow }); }
      catch (error) {
        try { worker.dispose?.(); } catch { /* Preserve the prior verified session. */ }
        if (state.client === worker) state.client = null;
        state.workerCapabilities = null;
        throw new Error(`Offseason window transition was not receipt-aligned; the worker was closed and the prior session was preserved. ${error.message}`, { cause: error });
      }
      replaceSession(result);
      state.activeSession = verifiedSession;
      state.lastLifecycleAction = { kind: 'window-advanced', status: result.status,
        sessionRevision: verifiedSession.revision, fromWindow: session.leagueState.transactionWindow, window: nextWindow };
      state.saveStatus = `Advanced to the ${nextWindow.replaceAll('-', ' ')} window · revision ${verifiedSession.revision}. Save this Franchise checkpoint when ready.`;
      setWorkerStatus(`Offseason window advanced · ${nextWindow}`, 'ready');
      showMessage(`Franchise moved one transaction window forward to ${nextWindow.replaceAll('-', ' ')}.`, 'notice');
    } catch (error) {
      showFailure(error, 'Offseason window could not be advanced.', 'Offseason');
    } finally { setBusy(false); render(); }
  };

  const runOffseasonPhase = async () => {
    const state = ref.current;
    const session = state.activeSession;
    const window = session?.leagueState?.transactionWindow;
    if (!session || state.busy) return;
    showMessage('');
    setBusy(true);
    try {
      const capability = window === 'free-agency' ? state.workerCapabilities?.freeAgencyMarket
        : window === 'trade-window' ? state.workerCapabilities?.tradeWindow
          : window === 'draft' ? state.workerCapabilities?.draft : false;
      if (state.workerCapabilities?.offseasonPhaseRunner !== true || capability !== true) {
        throw new Error(`No ready phase executor is advertised for ${window ?? 'the current'} window.`);
      }
      if (session.pendingOffseasonApproval) throw new Error('Resolve the saved offseason proposal before running another phase.');
      const worker = await ensureClient();
      const result = await worker.runOffseasonPhase({ expectedRevision: session.revision,
        userApproved: true, window });
      const failure = commandFailure(result);
      if (failure) throw new Error(failure);
      let verifiedSession;
      try { verifiedSession = validateStandaloneOffseasonPhase({ result, currentSession: session, window }); }
      catch (error) {
        try { worker.dispose?.(); } catch { /* Preserve the prior verified session. */ }
        if (state.client === worker) state.client = null;
        state.workerCapabilities = null;
        throw new Error(`Offseason phase returned an invalid session or approval snapshot; the worker was closed and the prior session was preserved. ${error.message}`, { cause: error });
      }
      replaceSession(result);
      state.activeSession = verifiedSession;
      const phaseResult = result.result ?? {};
      state.lastLifecycleAction = { kind: 'phase-run', status: result.status, window,
        sessionRevision: verifiedSession.revision,
        missingInputs: Array.isArray(phaseResult.missingInputs) ? phaseResult.missingInputs : [],
        receipt: phaseResult.receipt ?? phaseResult.decisionReceipt ?? null,
        evaluation: phaseResult.evaluation ?? null };
      state.saveStatus = `Offseason phase ${result.status} · revision ${verifiedSession.revision}. Save this Franchise checkpoint when ready.`;
      const pending = verifiedSession.pendingOffseasonApproval;
      setWorkerStatus(pending ? 'Offseason proposal waiting for your decision' : `Offseason phase · ${result.status}`,
        pending ? 'review' : 'ready');
      showMessage(pending
        ? `The ${window.replaceAll('-', ' ')} phase produced a saved proposal that needs your approval. Review its exact terms below.`
        : Array.isArray(phaseResult.missingInputs) && phaseResult.missingInputs.length
          ? `The ${window.replaceAll('-', ' ')} phase could not run. Missing inputs: ${phaseResult.missingInputs.join(', ')}.`
          : `The ${window.replaceAll('-', ' ')} phase returned ${result.status}.`, 'notice');
    } catch (error) {
      showFailure(error, 'Offseason phase could not be run.', 'Offseason');
    } finally { setBusy(false); render(); }
  };

  const resolveOffseasonApproval = async decision => {
    const state = ref.current;
    const session = state.activeSession;
    const pending = session?.pendingOffseasonApproval;
    if (!session || state.busy) return;
    showMessage('');
    setBusy(true);
    try {
      if (state.workerCapabilities?.offseasonApprovalResolution !== true || !['approve', 'reject'].includes(decision)
        || !pending || pending.stateRevision !== session.leagueState?.revision) {
        throw new Error('There is no current revision-bound offseason proposal to approve or reject.');
      }
      const worker = await ensureClient();
      const result = await worker.resolveOffseasonApproval({ expectedRevision: session.revision,
        userApproved: true, decision });
      const failure = commandFailure(result);
      if (failure) throw new Error(failure);
      let verifiedSession;
      try {
        verifiedSession = await validateStandaloneOffseasonApproval({ result, currentSession: session, decision });
      } catch (error) {
        try { worker.dispose?.(); } catch { /* Preserve the prior verified session. */ }
        if (state.client === worker) state.client = null;
        state.workerCapabilities = null;
        throw new Error(`Offseason decision returned an invalid receipt; the worker was closed and the prior session was preserved. ${error.message}`, { cause: error });
      }
      replaceSession(result);
      state.activeSession = verifiedSession;
      state.lastLifecycleAction = { kind: 'approval-resolved', status: result.status,
        window: pending.window, sessionRevision: verifiedSession.revision,
        missingInputs: result.result?.evaluation?.missingInputs ?? [],
        receipt: result.result?.receipt ?? result.result?.decisionReceipt ?? null,
        evaluation: result.result?.evaluation ?? null };
      state.saveStatus = `Offseason proposal ${result.status} · revision ${verifiedSession.revision}. Save this Franchise checkpoint when ready.`;
      setWorkerStatus(`Offseason proposal ${result.status}`, result.status === 'committed' || result.status === 'rejected' ? 'ready' : 'review');
      showMessage(result.status === 'committed'
        ? 'The proposal was approved and committed with a verified roster-transition receipt.'
        : result.status === 'rejected' ? 'The proposal was rejected. The LeagueState and roster were not changed.'
          : `The worker returned ${result.status}; review the updated proposal and diagnostics below.`, 'notice');
    } catch (error) {
      showFailure(error, 'Offseason proposal decision could not be saved.', 'Offseason approval');
    } finally { setBusy(false); render(); }
  };

  // === Revision-bound roster-waiver evaluation and approval ===
  const evaluateWaiverTransaction = async canonicalName => {
    const state = ref.current;
    const session = state.activeSession;
    if (!session || state.busy) return;
    state.lastTransactionEvaluation = null;
    state.lastTransactionProposal = null;
    state.lastTransactionEvaluationRevision = null;
    state.lastTransactionSessionBinding = null;
    showMessage('');
    setBusy(true);
    try {
      const league = session.leagueState;
      const teamCode = state.activeTeamCode;
      const team = league.teams?.find(row => upper(row.teamCode) === teamCode);
      const player = league.players?.find(row => normalizeName(row.canonicalName ?? row.name) === normalizeName(canonicalName));
      if (state.workerCapabilities?.transactions !== true) throw new Error('The initialized worker does not support transaction evaluation.');
      if (!ROSTER_MOVE_WINDOWS.has(league.transactionWindow)) throw new Error(`Roster moves are unavailable during the ${league.transactionWindow ?? 'unknown'} transaction window.`);
      if (!team || !(team.rosterNames ?? []).some(name => normalizeName(name) === normalizeName(canonicalName))
        || !player || upper(player.teamCode) !== teamCode) throw new Error('Select a player with an exact current roster and player-state match for the user-controlled team.');
      const slug = normalizeName(canonicalName).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'player';
      const proposal = {
        proposalId: `waive-${league.seasonStartYear}-${teamCode}-${league.revision}-${slug}`,
        kind: 'roster-move',
        seasonStartYear: Number(league.seasonStartYear),
        transactionWindow: league.transactionWindow,
        actor: 'user',
        userControlledTeamCodes: [teamCode],
        legs: [{ assetType: 'player', canonicalName: player.canonicalName, fromTeamCode: teamCode, action: 'waive' }],
        expectedStateRevision: league.revision,
      };
      const worker = await ensureClient();
      const result = await worker.evaluateTransaction(proposal);
      const failure = commandFailure(result);
      if (failure) throw new Error(failure);
      const evaluation = validateStandaloneTransactionEvaluation({ result, currentSession: session, proposal });
      state.lastTransactionProposal = clone(proposal);
      state.lastTransactionEvaluation = clone(evaluation);
      state.lastTransactionEvaluationRevision = session.revision;
      state.lastTransactionSessionBinding = {
        sessionRevision: session.revision,
        leagueStateRevision: league.revision,
        seasonStartYear: league.seasonStartYear,
        transactionWindow: league.transactionWindow,
        sourceReceipt: clone(session.sourceReceipt),
        modelReceipt: clone(session.modelReceipt),
        schedule: clone(session.schedule),
        scheduleCursor: session.scheduleCursor,
      };
      const label = evaluation.legalityOutcome === 'confirmed-legal' ? 'confirmed legal'
        : evaluation.legalityOutcome === 'scenario-compliant' ? 'scenario-compliant' : 'provisional / unresolved';
      showMessage(`Waiver evaluation: ${label}. No roster or payroll state changed; review the worker's missing inputs and approval gate below.`, 'notice');
      setWorkerStatus(`Waiver proposal evaluated · ${evaluation.status}`, evaluation.status === 'confirmed-legal' ? 'ready' : 'review');
    } catch (error) {
      showFailure(error, 'Waiver proposal could not be evaluated.', 'Roster transaction');
    } finally { setBusy(false); render(); }
  };

  const approveWaiverTransaction = async allowProvisionalSandbox => {
    const state = ref.current;
    const session = state.activeSession;
    const proposal = state.lastTransactionProposal;
    const evaluation = state.lastTransactionEvaluation;
    if (!session || state.busy) return;
    showMessage('');
    setBusy(true);
    try {
      if (!proposal || !evaluation || state.lastTransactionEvaluationRevision !== session.revision
        || !transactionBindingMatches(state.lastTransactionSessionBinding, session)
        || proposal.expectedStateRevision !== session.leagueState.revision) {
        throw new Error('Re-evaluate the waiver against the current session revision before approval.');
      }
      if (state.workerCapabilities?.transactions !== true || !ROSTER_MOVE_WINDOWS.has(session.leagueState.transactionWindow)) {
        throw new Error('The current worker capability or transaction window no longer allows roster moves.');
      }
      const approvalBlocks = (evaluation.blockedReasons ?? []).filter(reason => !/user approval is required/i.test(String(reason)));
      const confirmedLegal = evaluation.status === 'confirmed-legal' && evaluation.legalityOutcome === 'confirmed-legal';
      const sandboxScenario = session.leagueState.mode === 'provisional-sandbox' && evaluation.status === 'provisional';
      if (evaluation.userApprovalRequired !== true || evaluation.approvalReceived === true || approvalBlocks.length) {
        throw new Error(`The transaction is not ready for approval. ${approvalBlocks.join(' ') || 'A fresh user approval is required.'}`);
      }
      if (!confirmedLegal && !sandboxScenario) {
        throw new Error('Only a confirmed-legal proposal or an explicitly approved Provisional Sandbox proposal can be committed.');
      }
      if (sandboxScenario && allowProvisionalSandbox !== true) {
        throw new Error('Explicitly enable Provisional Sandbox approval before committing a provisional move.');
      }
      const worker = await ensureClient();
      const expectedRevision = session.revision;
      const result = await worker.executeTransaction({
        proposal: clone(proposal),
        expectedRevision,
        userApproved: true,
        allowProvisionalSandbox: sandboxScenario && allowProvisionalSandbox === true,
      });
      const failure = commandFailure(result);
      if (failure) throw new Error(failure);
      let verifiedSession;
      try {
        verifiedSession = await validateStandaloneTransactionCommit({ result, currentSession: session, proposal });
      } catch (error) {
        try { worker.dispose?.(); } catch { /* Preserve the prior verified franchise view. */ }
        if (state.client === worker) state.client = null;
        state.workerCapabilities = null;
        throw new Error(`Transaction commit returned an invalid receipt; the worker was closed and the prior view was preserved. ${error.message}`, { cause: error });
      }
      const receipt = result.evaluation.rosterTransitionReceipt;
      state.activeSession = verifiedSession;
      state.workerCapabilities = result.capabilities ?? state.workerCapabilities;
      state.lastTransactionEvaluation = null;
      state.lastTransactionProposal = null;
      state.lastTransactionEvaluationRevision = null;
      state.lastTransactionSessionBinding = null;
      state.saveStatus = `Roster transaction committed with a verified receipt · revision ${verifiedSession.revision}. Save or export this franchise checkpoint.`;
      setWorkerStatus('Roster transaction committed · receipt verified', 'ready');
      showMessage(`The ${proposal.legs[0].canonicalName} waiver was approved and committed at LeagueState revision ${verifiedSession.leagueState.revision}. Receipt ${receipt.receiptSha256.slice(0, 16)}…`, 'notice');
    } catch (error) {
      showFailure(error, 'Waiver approval could not be completed.', 'Roster transaction');
    } finally { setBusy(false); render(); }
  };

  // === Portable export (exportCurrentSave) ===
  const exportCurrentSave = async () => {
    const state = ref.current;
    if (!state.activeSession) return null;
    const worker = await ensureClient();
    const result = await worker.exportSave();
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
    const result = await worker.importSave(saveText);
    const failure = commandFailure(result);
    if (failure) throw new Error(failure);
    if (!result?.session) throw new Error('Worker restore did not return a verified session snapshot.');
    const restoredTeam = (result.session.leagueState?.userControlledTeamCodes ?? [])[0];
    if (!restoredTeam) throw new Error('Restored session has no user-controlled team.');
    state.activeSession = result.session;
    state.workerCapabilities = result.capabilities ?? state.workerCapabilities;
    state.lastSeasonAwardsFinalization = null;
    state.lastPreparedPostseason = null;
    state.lastLifecycleAction = null;
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
        const result = await worker.restoreSession(loaded.session);
        const failure = commandFailure(result);
        if (failure) throw new Error(failure);
        if (!result?.session) throw new Error('Worker did not return the pinned IndexedDB checkpoint snapshot.');
        state.activeSession = result.session;
        state.workerCapabilities = result.capabilities ?? state.workerCapabilities;
        state.lastSeasonAwardsFinalization = null;
        state.lastPreparedPostseason = null;
        state.lastLifecycleAction = null;
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
      state.lastSeasonAwardsFinalization = null;
      state.lastPreparedPostseason = null;
      state.lastLifecycleAction = null;
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
      state.lastSeasonAwardsFinalization = null;
      state.lastPreparedPostseason = null;
      state.lastLifecycleAction = null;
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
    saveRotation, advanceGame, advanceUserGame, verifyCompletion, closeout: closeRegularSeason,
    finalizeAwards: finalizeSeasonAwards,
    preparePostseason, commitPostseason, advanceNextSeason,
    advanceOffseasonWindow, runOffseasonPhase, resolveOffseasonApproval,
    evaluateWaiverTransaction, approveWaiverTransaction,
    saveLocal, resumeLocal, exportSave, importSave,
  };
}
