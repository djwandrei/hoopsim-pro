const $ = selector => document.querySelector(selector);
const clone = value => structuredClone(value);
const PREFIX = 'djhc:season-lab-franchise-preview:v1:';
const GENERATED_SHOOTING_RATING_POLICY = 'generated-exposure-shrunk-snapshot-v1';
const VERIFIED_FIXTURE_NAME = 'real-v4-browser-fixture-20261008.json';
const VERIFIED_FIXTURE_RECEIPT_NAME = 'real-v4-browser-fixture-20261008.receipt.json';
const VERIFIED_FIXTURE_RECEIPT_SHA256 = '4ccfb7481621a5297b0648a44b80edbaa2a2035eece5eeb99a4648b8fab37729';
const COUNT_FIELDS = [
  ['MIN', ['minutes', 'minutesPlayed']], ['PTS', ['points', 'pts']], ['REB', ['rebounds', 'reb']],
  ['AST', ['assists', 'ast']], ['TOV', ['turnovers', 'tov']], ['STL', ['steals', 'stl']], ['BLK', ['blocks', 'blk']],
  ['FGM', ['fieldGoalsMade']], ['FGA', ['fieldGoalAttempts']],
  ['3PM', ['threePointersMade']], ['3PA', ['threePointAttempts']],
  ['FTM', ['freeThrowsMade']], ['FTA', ['freeThrowAttempts']],
  ['ORB', ['offensiveRebounds']], ['DRB', ['defensiveRebounds']], ['PF', ['personalFouls']],
];

let fixturePayload = null;
let fixtureName = '';
let client = null;
let workerCapabilities = null;
let activeSession = null;
let activeTeamCode = '';
let rotationDraft = [];
let draftSessionRef = null;
let draftTeamRef = '';
let lastGameOutput = null;
let lastSeasonCompletion = null;
let lastSeasonCompletionRevision = null;
let busy = false;
let v4Intake = null;
let v4Api = null;
let v4SnapshotBuilder = null;
let v4GameModelText = '';
let v4ProductionCandidateText = '';
let v4GameModelMeta = null;
let v4ProductionMeta = null;
let v4RosterChoices = new Map();
let v4ChoiceProvenance = new Map();
let v4SuggestionsByName = new Map();
let v4SuggestionSummary = null;
let v4OperationNotice = null;
let storageBackend = 'localstorage';
let franchiseBrowserStore = null;
let browserSaveCheckKey = '';
let browserSaveCheckPending = false;
let hasIndexedDbCheckpoint = false;

const refs = {
  fixtureFile: $('#fixture-file'), userTeam: $('#user-team'), initialize: $('#initialize'), verifiedFixture: $('#verified-fixture'), fixtureMeta: $('#fixture-meta'),
  v4Year: $('#v4-season'), v4Load: $('#v4-load'), v4Suggest: $('#v4-suggest'), v4UserTeam: $('#v4-user-team'), v4Initialize: $('#v4-initialize'),
  v4GenerateShootingRating: $('#v4-generate-shooting-rating'), v4GeneratedRatingReceipt: $('#v4-generated-rating-receipt'),
  v4IntakeStatus: $('#v4-intake-status'), v4Receipts: $('#v4-source-receipts'), v4ChoiceCount: $('#v4-choice-count'),
  v4RosterReview: $('#v4-roster-review'), v4AppliedSummary: $('#v4-applied-summary'),
  sourceName: $('#source-name'), sourceDetail: $('#source-detail'), modelName: $('#model-name'), modelDetail: $('#model-detail'),
  inputCount: $('#input-count'), inputDetail: $('#input-detail'), workerStatus: $('#worker-status'), workerStatusWrap: $('.topbar-status'),
  qualityPill: $('#quality-pill'), message: $('#message'), teamRole: $('#team-role'), teamOverview: $('#team-overview'),
  saveRotation: $('#save-rotation'), rotationValidation: $('#rotation-validation'), rosterWrap: $('#roster-wrap'),
  scheduleProgress: $('#schedule-progress'), nextGameCard: $('#next-game-card'), advanceGame: $('#advance-game'), advanceUserGame: $('#advance-user-game'),
  verifySeasonCompletion: $('#verify-season-completion'), completionHint: $('#completion-hint'),
  completionStatus: $('#completion-status'), completionReceipt: $('#completion-receipt'),
  revisionPill: $('#revision-pill'), stateMetrics: $('#state-metrics'), stateQuality: $('#state-quality'),
  teamRecords: $('#team-records'), historyList: $('#history-list'), boxScore: $('#box-score'),
  saveLocal: $('#save-local'), resumeLocal: $('#resume-local'), exportSave: $('#export-save'), saveFile: $('#save-file'),
  saveStatus: $('#save-status'), automationCopy: $('#automation-copy'),
};

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

function normalizeName(value) {
  return String(value ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('en-US').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
}

function formatMinutes(value) {
  if (!Number.isFinite(Number(value))) return '—';
  return Number(Number(value).toFixed(3)).toString();
}

function formatRotationInputDisplay(value) {
  const minutes = Number(value);
  return Number.isFinite(minutes) ? String(minutes) : '';
}

function humanBytes(value) {
  const bytes = Number(value) || 0;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

async function sha256Hex(bytes) {
  if (!globalThis.crypto?.subtle?.digest) throw new Error('Web Crypto SHA-256 is unavailable; verified inputs were not loaded.');
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes));
  return [...digest].map(value => value.toString(16).padStart(2, '0')).join('');
}

function readPayload(value) {
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

function leagueStateFor(payload) {
  return payload?.session?.leagueState ?? payload?.sessionInput?.leagueState ?? null;
}

function currentSource(payload = fixturePayload, session = activeSession) {
  return session?.sourceReceipt ?? payload?.session?.sourceReceipt ?? payload?.sessionInput?.sourceReceipt ?? null;
}

function currentModel(payload = fixturePayload, session = activeSession) {
  return session?.modelReceipt ?? payload?.session?.modelReceipt ?? payload?.sessionInput?.modelReceipt ?? null;
}

function setWorkerStatus(value, state = 'idle') {
  refs.workerStatus.textContent = value;
  refs.workerStatusWrap.dataset.state = state;
}

function showMessage(value, kind = 'error') {
  refs.message.hidden = !value;
  refs.message.dataset.kind = kind;
  refs.message.textContent = value || '';
}

function isStaleMessage(value) {
  return /stale|revision|already prepared against|out of date/i.test(String(value));
}

function showFailure(error, fallback = 'The worker action failed.', context = 'Worker') {
  const detail = error?.message || String(error || fallback);
  const stale = isStaleMessage(detail);
  showMessage(`${stale ? 'Stale action: ' : `${context} error: `}${detail} The current visible session and last saved checkpoint were kept.`, stale ? 'notice' : 'error');
  setWorkerStatus(stale ? 'Stale action rejected' : `${context} action failed`, 'error');
}

function setBusy(next) {
  busy = next;
  updateButtons();
  if (activeSession) renderTeam();
  if (next) setWorkerStatus('Worker is processing an action…', 'idle');
}

function sourceStateForFixture() {
  return leagueStateFor(fixturePayload);
}

function renderTeamChoices() {
  const state = sourceStateForFixture();
  let teams = Array.isArray(state?.teams) ? state.teams : [];
  if (fixturePayload?.session) {
    const authorized = (state?.userControlledTeamCodes ?? []).map(code => String(code).toUpperCase());
    if (authorized.length !== 1) teams = [];
    else teams = teams.filter(team => String(team.teamCode).toUpperCase() === authorized[0]);
  }
  const selected = activeSession
    ? [...(activeSession.leagueState?.userControlledTeamCodes ?? [])][0]
    : (state?.userControlledTeamCodes ?? [])[0];
  refs.userTeam.replaceChildren();
  if (!teams.length) {
    const message = fixturePayload?.session
      ? 'Saved session needs exactly one user team'
      : 'No teams found';
    refs.userTeam.add(new Option(message, ''));
    refs.userTeam.disabled = true;
    updateButtons();
    return;
  }
  for (const team of teams) {
    const code = String(team.teamCode ?? '').toUpperCase();
    if (!code) continue;
    const label = `${team.teamName ?? team.name ?? code} · ${code}`;
    refs.userTeam.add(new Option(label, code));
  }
  if (selected && [...refs.userTeam.options].some(option => option.value === selected)) refs.userTeam.value = selected;
  else if (refs.userTeam.options.length) refs.userTeam.selectedIndex = 0;
  refs.userTeam.disabled = Boolean(activeSession) || busy;
  updateButtons();
}

function renderPins(payload = fixturePayload, session = activeSession) {
  const source = currentSource(payload, session);
  const model = currentModel(payload, session);
  const state = session?.leagueState ?? leagueStateFor(payload);
  let modelText = null;
  try { modelText = JSON.parse(payload?.gameModelText ?? 'null'); } catch { modelText = null; }
  const packageName = source?.packageId ?? source?.sourceName ?? 'No package receipt';
  const season = source?.seasonStartYear ?? state?.seasonStartYear;
  refs.sourceName.textContent = packageName;
  refs.sourceDetail.textContent = source
    ? `Season ${season ?? '—'} · ${source.packageVersion ?? 'version not pinned'} · manifest ${String(source.packageManifestSha256 ?? 'missing').slice(0, 12)}${source.packageManifestSha256 ? '…' : ''}`
    : 'Package, season, and manifest pin are required.';
  refs.modelName.textContent = model?.modelId ?? modelText?.modelId ?? 'No model artifact';
  refs.modelDetail.textContent = model
    ? `${model.status ?? 'candidate status not supplied'} · ${session ? 'worker hash verified' : 'hash check pending'} · ${String(model.contentSha256 ?? 'missing').slice(0, 12)}${model.contentSha256 ? '…' : ''}`
    : modelText ? `${modelText.version ?? 'model artifact'} · worker will pin content hash at initialization`
      : 'A pinned game-model artifact is required.';
  const inputs = payload?.gameInputs && typeof payload.gameInputs === 'object' ? Object.keys(payload.gameInputs).length : 0;
  refs.inputCount.textContent = `${inputs} prepared game input${inputs === 1 ? '' : 's'}`;
  let candidateText = 'Production candidate text loaded; status not parsed.';
  try {
    const candidate = JSON.parse(payload?.productionCandidateText ?? 'null');
    if (candidate && typeof candidate === 'object') candidateText = `${candidate.modelId ?? candidate.id ?? 'Candidate'} · ${candidate.status ?? 'unverified'}`;
  } catch { candidateText = 'Production candidate text loaded; embedded metadata is not JSON.'; }
  refs.inputDetail.textContent = candidateText;
  const provisional = state?.stateQuality?.status !== 'reconciled' || model?.status !== 'validated';
  refs.qualityPill.textContent = provisional ? 'Provisional / generated' : 'Source reconciled';
  refs.qualityPill.className = `pill ${provisional ? 'pill--amber' : 'pill--green'}`;
}

function sessionForTeam(payload, teamCode) {
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

async function ensureClient() {
  if (client) return client;
  const module = await import('../franchise-worker-client-v1.mjs?rev=franchise-ui-readiness-v11');
  if (typeof module.createFranchiseWorkerClient !== 'function') throw new Error('Worker client does not export createFranchiseWorkerClient().');
  client = module.createFranchiseWorkerClient({
    workerUrl: new URL('../franchise-worker-v1.mjs?rev=franchise-ui-readiness-v11', import.meta.url),
  });
  return client;
}

function commandFailure(result) {
  if (!result || typeof result !== 'object') return 'Worker returned no action result.';
  if (result.error) return typeof result.error === 'string' ? result.error : result.error.message ?? JSON.stringify(result.error);
  if (['error', 'rejected', 'requires-review', 'stale', 'unavailable'].includes(String(result.status ?? '').toLowerCase())) {
    const details = result.violations ?? result.errors ?? result.validation?.violations ?? result.reason;
    return Array.isArray(details) ? details.join(' ') : (details || `Worker returned ${result.status}.`);
  }
  return null;
}

function clearSeasonCompletionReceipt() {
  lastSeasonCompletion = null;
  lastSeasonCompletionRevision = null;
}

function replaceSession(result, { gameResult = false } = {}) {
  const failure = commandFailure(result);
  if (failure) throw new Error(failure);
  if (!result.session || typeof result.session !== 'object') throw new Error('Worker action did not return a verified session snapshot.');
  clearSeasonCompletionReceipt();
  activeSession = result.session;
  if (gameResult) lastGameOutput = result.game ?? result.result ?? null;
  renderAll();
}

function makeBrowserKey(session = activeSession) {
  const source = currentSource(null, session);
  const model = currentModel(null, session);
  const year = session?.leagueState?.seasonStartYear;
  const team = activeTeamCode || (session?.leagueState?.userControlledTeamCodes ?? [])[0];
  if (!source?.packageManifestSha256 || !model?.contentSha256 || !Number.isInteger(year) || !team) return null;
  return `${PREFIX}${source.packageManifestSha256.toLowerCase()}:${model.contentSha256.toLowerCase()}:${year}:${encodeURIComponent(String(team).toUpperCase())}`;
}

function exportedSaveMatches(saveText, session = activeSession) {
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

function readSavedText(key) {
  try { return key ? localStorage.getItem(key) : null; }
  catch { return null; }
}

async function ensureV4Api() {
  if (!v4Api) v4Api = await import('../v4-franchise-intake-v1.mjs?rev=franchise-ui-readiness-v11');
  if (!v4SnapshotBuilder) {
    const snapshotModule = await import('../v4-snapshot-worker-payload-v1.mjs?rev=franchise-ui-readiness-v11');
    v4SnapshotBuilder = snapshotModule.buildV4SnapshotWorkerPayloadV1;
  }
  if (typeof v4Api.loadV4FranchiseIntakeV1 !== 'function'
    || typeof v4Api.loadLastObservedTeamScenarioSuggestionsV1 !== 'function'
    || typeof v4Api.applyV4FranchiseRosterChoicesV1 !== 'function'
    || typeof v4Api.createV4FranchiseLocalMirrorReleasePinV1 !== 'function'
    || typeof v4SnapshotBuilder !== 'function') {
    throw new Error('V4 intake or snapshot worker helper is missing a required browser export.');
  }
  return v4Api;
}

async function fetchJsonText(path, label) {
  const response = await fetch(path, { cache: 'no-store' });
  if (!response.ok) throw new Error(`${label} request failed with HTTP ${response.status}.`);
  const text = await response.text();
  let value;
  try { value = JSON.parse(text); }
  catch (error) { throw new Error(`${label} is not valid JSON: ${error.message}`); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be a JSON object.`);
  return { text, value };
}

function v4YearMatchesLoadedIntake() {
  return Boolean(v4Intake && Number(v4Intake.scenario?.seasonStartYear) === Number(refs.v4Year.value));
}

function currentV4OperationNotice() {
  if (!v4OperationNotice || Number(v4OperationNotice.seasonStartYear) !== Number(refs.v4Year.value)) return null;
  if (v4OperationNotice.operation === 'suggestions' && !v4YearMatchesLoadedIntake()) return null;
  return v4OperationNotice;
}

function v4IntakeReadyForStart() {
  if (!v4YearMatchesLoadedIntake() || !v4Intake?.leagueState || !refs.v4UserTeam.value) return false;
  if (v4Intake.status !== 'ready-for-user-scenario-setup' || (v4Intake.unresolvedRosterChoices ?? []).length) return false;
  if (v4Intake.scenario?.phase !== 'regular' || v4Intake.scenario?.forecast !== false) return false;
  if ((v4Intake.leagueState.teams ?? []).length !== 30 || (v4Intake.teamRates?.rows ?? []).length !== 30) return false;
  if (!v4GameModelText || !v4ProductionCandidateText) return false;
  return (v4Intake.leagueState.teams ?? []).some(team => String(team.teamCode).toUpperCase() === refs.v4UserTeam.value);
}

function updateV4Controls() {
  const loadedForSelectedYear = v4YearMatchesLoadedIntake();
  const canReview = loadedForSelectedYear && !activeSession;
  refs.v4Year.disabled = busy || Boolean(activeSession);
  refs.v4Load.disabled = busy || Boolean(activeSession);
  refs.v4UserTeam.disabled = busy || !canReview;
  refs.v4Suggest.disabled = busy || !canReview || !v4Intake?.unresolvedRosterChoices?.length || Boolean(v4Intake.suggestionsGenerated);
  refs.v4GenerateShootingRating.disabled = busy || Boolean(activeSession) || !loadedForSelectedYear;
  refs.v4Initialize.disabled = busy || Boolean(activeSession) || !v4IntakeReadyForStart();
}

function renderV4GeneratedRatingReceipt(receipt = null, profileReview = null) {
  if (!refs.v4GeneratedRatingReceipt) return;
  if (Array.isArray(profileReview)) {
    const missingShooting = profileReview.filter(row => (row.missingInputs ?? []).some(input => String(input).toLowerCase() === 'shootingrating'));
    if (!missingShooting.length) return;
    const names = missingShooting.map(row => row.canonicalName ?? row.name ?? 'Unnamed player');
    refs.v4GeneratedRatingReceipt.dataset.state = 'review';
    refs.v4GeneratedRatingReceipt.innerHTML = `<strong>Initialization held: ${missingShooting.length} player${missingShooting.length === 1 ? '' : 's'} lack a source shooting rating.</strong><small>Default behavior rejects these missing components. Enable the explicit ${escapeHtml(GENERATED_SHOOTING_RATING_POLICY)} scenario policy and retry. No source rating was changed.</small><ul>${names.map(name => `<li>${escapeHtml(name)}</li>`).join('')}</ul>`;
    return;
  }
  if (!receipt) {
    refs.v4GeneratedRatingReceipt.dataset.state = 'idle';
    refs.v4GeneratedRatingReceipt.textContent = 'No scenario initialized. Missing shooting ratings are rejected unless you explicitly enable the provisional policy.';
    return;
  }
  const rows = Array.isArray(receipt.rows) ? receipt.rows : [];
  const count = Number.isInteger(receipt.count) ? receipt.count : rows.length;
  if (count > 0) {
    refs.v4GeneratedRatingReceipt.dataset.state = 'generated';
    const renderedRows = rows.slice(0, 40).map(row => {
      const numericValue = Number(row.value);
      const valueText = Number.isFinite(numericValue) ? ` · scenario value ${numericValue.toFixed(1)}` : '';
      return `<li><strong>${escapeHtml(row.canonicalName ?? 'Unnamed player')}</strong>${valueText}<small>${escapeHtml(row.method ?? receipt.policy ?? 'Generated scenario method')}</small></li>`;
    }).join('');
    const moreRows = count > rows.length ? count - rows.length : count > 40 ? count - 40 : 0;
    refs.v4GeneratedRatingReceipt.innerHTML = `<strong>${count} provisional shooting rating${count === 1 ? '' : 's'} generated under ${escapeHtml(receipt.policy ?? GENERATED_SHOOTING_RATING_POLICY)}.</strong><ul>${renderedRows}${moreRows ? `<li>${moreRows} additional generated rating${moreRows === 1 ? '' : 's'} are recorded in this session receipt.</li>` : ''}</ul><small>These are uncalibrated scenario values, not observed source ratings or confidence intervals. Original source values are preserved: ${receipt.originalSourceValuesPreserved === true ? 'yes' : 'not confirmed'}.</small>`;
    return;
  }
  refs.v4GeneratedRatingReceipt.dataset.state = 'ready';
  refs.v4GeneratedRatingReceipt.textContent = `No provisional shooting ratings were generated under ${receipt.policy ?? 'reject'}; the source rating values were preserved.`;
}

function renderV4TeamChoices() {
  if (!refs.v4UserTeam) return;
  const selected = refs.v4UserTeam.value;
  const teams = v4Intake?.leagueState?.teams?.length
    ? v4Intake.leagueState.teams
    : (v4Intake?.teamRates?.rows ?? []);
  refs.v4UserTeam.replaceChildren();
  refs.v4UserTeam.add(new Option(teams.length ? 'Choose a team to control' : 'Load V4 source first', ''));
  for (const team of [...teams].sort((a, b) => String(a.teamCode).localeCompare(String(b.teamCode)))) {
    const code = String(team.teamCode ?? '').toUpperCase();
    if (!code) continue;
    const name = team.teamName ?? team.name ?? code;
    refs.v4UserTeam.add(new Option(`${name} · ${code}`, code));
  }
  if (selected && [...refs.v4UserTeam.options].some(option => option.value === selected)) refs.v4UserTeam.value = selected;
  else refs.v4UserTeam.value = '';
  refs.v4UserTeam.disabled = busy || Boolean(activeSession) || !v4YearMatchesLoadedIntake();
}

function receiptPartSummary(receipt) {
  const parts = Object.values(receipt?.parts ?? {});
  if (!parts.length) return receipt?.artifactId ? `${receipt.artifactId} · SHA ${String(receipt.sha256 ?? 'unavailable').slice(0, 12)}…` : 'Pinned artifact receipt';
  return parts.slice(0, 3).map(part => `${part.artifactId ?? 'part'} ${part.rows ?? '—'} rows · ${String(part.sha256 ?? 'missing').slice(0, 12)}…`).join(' · ');
}

function renderV4Receipts() {
  if (!v4Intake) {
    refs.v4Receipts.innerHTML = '';
    return;
  }
  const receipts = Object.entries(v4Intake.sourceReceipts ?? {}).filter(([, receipt]) => receipt && typeof receipt === 'object');
  refs.v4Receipts.innerHTML = receipts.map(([key, receipt]) => {
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
    const releaseHashes = receipt.registrySha256
      ? `<small title="Registry SHA-256 ${escapeHtml(receipt.registrySha256)}">Registry ${escapeHtml(receipt.registrySha256.slice(0, 16))}… · revision ${escapeHtml(String(receipt.registryRevisionSha256 ?? 'missing').slice(0, 16))}… · ${Number(receipt.packagePinCount ?? 0)} package pins</small>`
      : '';
    return `<article class="source-receipt"><strong>${escapeHtml(label)}</strong><span>${escapeHtml(packageLabel)}</span><small>${escapeHtml(scope)}</small><small>${escapeHtml(receiptPartSummary(receipt))}</small>${releaseHashes}<small title="${escapeHtml(manifest ?? '')}">Pin ${escapeHtml(String(manifest ?? 'not supplied').slice(0, 16))}${manifest ? '…' : ''}</small></article>`;
  }).join('');
}

function multiTeamV4Choices() {
  const groups = new Map();
  for (const row of v4Intake?.playerSeasonEvidence ?? []) {
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

function buildV4RosterChoiceReceipt() {
  const choices = multiTeamV4Choices().flatMap(group => {
    const teamCode = v4RosterChoices.get(group.key);
    if (!teamCode || !group.teams.includes(teamCode)) return [];
    const provenance = v4ChoiceProvenance.get(group.key) === 'generated'
      ? 'generated-last-observed-team-scenario-choice' : 'explicit-user-selection';
    const suggestion = v4SuggestionsByName.get(group.key);
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
    seasonStartYear: v4Intake?.scenario?.seasonStartYear ?? null,
    phase: 'regular',
    mode: 'retrospective-user-scenario',
    disclosure: 'Generated latest-team suggestions are scenario choices explicitly applied by the user; they are not roster or contract facts.',
    suggestionPolicy: v4Intake?.sourceReceipts?.playerGames?.useBoundary ?? null,
    playerGamesPartSha256: v4Intake?.sourceReceipts?.playerGames?.part?.sha256 ?? null,
    choices,
  };
}

function suggestionLabel(suggestion, provenance, selectedTeam) {
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

function renderV4RosterReview() {
  if (!v4Intake) {
    refs.v4ChoiceCount.textContent = 'No V4 source loaded';
    refs.v4RosterReview.innerHTML = '<div class="empty-state">Roster-choice review appears after V4 intake.</div>';
    refs.v4AppliedSummary.innerHTML = '';
    return;
  }
  const groups = multiTeamV4Choices();
  const unresolved = new Map((v4Intake.unresolvedRosterChoices ?? []).map(choice => [choice.normalizedPlayerNameKey, choice]));
  const generated = [], explicit = [], unresolvedNames = [];
  refs.v4ChoiceCount.textContent = `${groups.length} multi-team names · ${unresolved.size} unresolved`;
  refs.v4RosterReview.innerHTML = groups.map(group => {
    const choice = unresolved.get(group.key);
    const suggestion = v4SuggestionsByName.get(group.key) ?? choice?.suggestion ?? null;
    const selectedTeam = v4RosterChoices.get(group.key) ?? '';
    const provenance = v4ChoiceProvenance.get(group.key) ?? '';
    if (provenance === 'generated') generated.push({ name: group.rows[0]?.displayName ?? group.key, teamCode: selectedTeam });
    else if (provenance === 'explicit' && selectedTeam) explicit.push({ name: group.rows[0]?.displayName ?? group.key, teamCode: selectedTeam });
    if (!selectedTeam || !group.teams.includes(selectedTeam)) unresolvedNames.push(group.key);
    const rows = group.rows.map(row => {
      const identity = row.identityEvidence?.status ?? row.identityEvidence?.reason ?? 'identity evidence retained';
      const source = row.source ?? {};
      const evidence = `${row.teamCode} · ${row.phase ?? 'regular'} · ${row.games ?? '—'} GP · ${formatMinutes(row.minutes)} min · ${source.artifactId ?? 'V4'} / ${source.recordId ?? 'record id unavailable'} · identity ${identity}`;
      return `<li>${escapeHtml(evidence)}</li>`;
    }).join('');
    const options = group.teams.map(code => `<option value="${escapeHtml(code)}" ${selectedTeam === code ? 'selected' : ''}>${escapeHtml(code)}</option>`).join('');
    const label = suggestionLabel(suggestion, provenance, selectedTeam);
    const observed = suggestion?.latestGameLocalDate ? `Latest observed game: ${suggestion.latestGameLocalDate}.` : '';
    return `<article class="roster-choice-card"><div class="roster-choice-head"><div><h4>${escapeHtml(group.rows[0]?.displayName ?? group.key)}</h4><p>${escapeHtml(label)}${observed ? ` · ${escapeHtml(observed)}` : ''}</p></div><span class="pill ${provenance === 'generated' ? 'pill--amber' : selectedTeam ? 'pill--green' : 'pill--slate'}">${provenance === 'generated' ? 'Generated' : selectedTeam ? 'Chosen' : 'Needs choice'}</span></div><div class="roster-choice-controls"><label class="field-control"><span class="file-control-label">Exact regular-season team</span><select data-v4-choice="${escapeHtml(group.key)}" ${busy || Boolean(activeSession) ? 'disabled' : ''}><option value="">Choose a team</option>${options}</select></label><details><summary>Evidence rows (${group.rows.length})</summary><ul>${rows}</ul></details></div></article>`;
  }).join('') || '<div class="empty-state">No multi-team player names need a franchise choice in this exact season.</div>';

  const applied = [...generated, ...explicit];
  const summary = [`${groups.length - unresolvedNames.length} multi-team choices applied`, `${generated.length} generated scenario choices`, `${explicit.length} explicit manual choices`, `${unresolvedNames.length} held for review`];
  const appliedRows = applied.map(row => `<li>${escapeHtml(row.name)} · ${escapeHtml(row.teamCode)} · ${generated.some(item => item.name === row.name && item.teamCode === row.teamCode) ? 'generated scenario choice applied by user' : 'explicit user choice'}</li>`).join('');
  const suggestionNote = v4SuggestionSummary
    ? `<span>${v4SuggestionSummary.uniqueApplied} unique latest-team suggestions applied by explicit click · ${v4SuggestionSummary.tiedHeld} tied names held · ${v4SuggestionSummary.unknownHeld} unknown names held</span>`
    : '';
  refs.v4AppliedSummary.innerHTML = `<div><strong>${summary.map(escapeHtml).join(' · ')}</strong>${suggestionNote ? `<small>${suggestionNote}</small>` : ''}</div>${applied.length ? `<details><summary>Applied team choices and provenance</summary><ul>${appliedRows}</ul></details>` : ''}`;
}

function renderV4Intake() {
  if (!v4Intake) {
    const notice = currentV4OperationNotice();
    if (notice) {
      refs.v4IntakeStatus.dataset.state = notice.kind;
      refs.v4IntakeStatus.textContent = notice.message;
    } else {
      refs.v4IntakeStatus.dataset.state = 'idle';
      refs.v4IntakeStatus.textContent = `No verified V4 source is loaded for ${refs.v4Year.value}. Load the pinned regular-season source set.`;
    }
    renderV4TeamChoices();
    renderV4Receipts();
    renderV4RosterReview();
    updateV4Controls();
    return;
  }
  const scenario = v4Intake.scenario ?? {};
  const playerCount = Number(v4Intake.candidatePlayerCount ?? v4Intake.playerSeasonEvidence?.length ?? 0);
  const teamCount = v4Intake.teamRates?.rows?.length ?? 0;
  const scheduleCount = v4Intake.schedule?.games?.length ?? 0;
  const unresolvedCount = v4Intake.unresolvedRosterChoices?.length ?? 0;
  const model = v4GameModelMeta;
  const production = v4ProductionMeta;
  let status = v4Intake.status === 'ready-for-user-scenario-setup'
    ? activeSession?.sourceReceipt?.mode === 'retrospective-user-scenario'
      ? 'The 30-team regular-season retrospective scenario is initialized. Source choices are locked for this session.'
      : 'All exact-team choices are resolved. This is ready to start as a regular-season retrospective/user-created scenario.'
    : v4Intake.status === 'needs-explicit-roster-choice'
      ? `${unresolvedCount} multi-team names still need an exact franchise selection. Ties and unknown suggestions stay unresolved.`
      : `${v4Intake.status ?? 'V4 intake loaded'} · review the listed source issues before continuing.`;
  const forecastLabel = scenario.forecast === false ? 'Not a forecast' : 'Forecast boundary unavailable';
  const selectedYear = Number(refs.v4Year.value);
  const loadedYear = Number(scenario.seasonStartYear);
  const notice = currentV4OperationNotice();
  let statusState = v4Intake.status === 'ready-for-user-scenario-setup' ? 'ready' : 'review';
  if (notice) {
    status = `${notice.message} Currently loaded source: ${loadedYear} (${scenario.phase ?? 'phase unavailable'} phase).`;
    statusState = notice.kind;
  } else if (selectedYear !== loadedYear) {
    status = `Loaded V4 source is the ${loadedYear} regular season; the selected year is ${selectedYear}. Load the selected year before applying choices or starting.`;
    statusState = 'review';
  }
  refs.v4IntakeStatus.dataset.state = statusState;
  refs.v4IntakeStatus.innerHTML = `<strong>${escapeHtml(status)}</strong><div class="v4-intake-metrics"><span>${escapeHtml(String(scenario.seasonStartYear))}–${String(Number(scenario.seasonStartYear) + 1).slice(-2)} · ${escapeHtml(scenario.phase ?? 'phase unavailable')} phase</span><span>${teamCount} team rates · ${playerCount} player-team candidate rows · ${scheduleCount} scheduled games</span><span>${escapeHtml(forecastLabel)} · ${escapeHtml(scenario.gameInputReadiness ?? 'rotation readiness unavailable')}</span><span>Game model: ${escapeHtml(model?.modelId ?? model?.format ?? 'not loaded')} · ${escapeHtml(model?.status ?? model?.version ?? 'status not supplied')}</span><span>Production source: ${escapeHtml(production?.modelId ?? production?.candidateId ?? production?.format ?? 'not loaded')} · ${escapeHtml(production?.status ?? production?.version ?? 'status not supplied')}</span><span>Contracts / payroll: unknown · postseason / offseason: disabled</span></div>${(v4Intake.issues ?? []).length ? `<ul class="v4-issues">${v4Intake.issues.map(issue => `<li>${escapeHtml(issue.message ?? issue.code ?? 'V4 issue requires review')}</li>`).join('')}</ul>` : ''}`;
  renderV4TeamChoices();
  renderV4Receipts();
  renderV4RosterReview();
  updateV4Controls();
}

async function ensureFranchiseBrowserStore() {
  if (franchiseBrowserStore && !franchiseBrowserStore.closed) return franchiseBrowserStore;
  const module = await import('../../lib/franchise-browser-store-v1.mjs?rev=franchise-ui-readiness-v11');
  franchiseBrowserStore = await module.openFranchiseBrowserStore();
  return franchiseBrowserStore;
}

function indexedDbLoadOptions(session = activeSession) {
  return {
    sourceReceipt: currentSource(null, session),
    expectedModelReceipt: currentModel(null, session),
    userTeamCode: activeTeamCode || (session?.leagueState?.userControlledTeamCodes ?? [])[0],
  };
}

async function refreshIndexedDbCheckpointAvailability() {
  if (storageBackend !== 'indexeddb' || !activeSession) return;
  const key = makeBrowserKey();
  if (!key || key === browserSaveCheckKey || browserSaveCheckPending) return;
  browserSaveCheckKey = key;
  browserSaveCheckPending = true;
  hasIndexedDbCheckpoint = false;
  updateSaveControls();
  try {
    const store = await ensureFranchiseBrowserStore();
    await store.load(indexedDbLoadOptions());
    hasIndexedDbCheckpoint = true;
  } catch (error) {
    if (!/No franchise checkpoint exists/i.test(error?.message ?? '')) {
      refs.saveStatus.textContent = `IndexedDB resume check failed: ${error?.message ?? error}. Saving remains available.`;
    }
    hasIndexedDbCheckpoint = false;
  } finally {
    browserSaveCheckPending = false;
    updateSaveControls();
  }
}

function updateSaveControls() {
  const key = makeBrowserKey();
  refs.saveLocal.textContent = storageBackend === 'indexeddb' ? 'Save IndexedDB checkpoint' : 'Save in this browser';
  refs.resumeLocal.textContent = storageBackend === 'indexeddb' ? 'Resume IndexedDB checkpoint' : 'Resume browser save';
  refs.resumeLocal.disabled = busy || !activeSession || (storageBackend === 'indexeddb' ? !hasIndexedDbCheckpoint : !readSavedText(key));
  refs.saveLocal.disabled = busy || !activeSession;
  refs.exportSave.disabled = busy || !activeSession;
  const importDisabled = busy || !activeSession;
  refs.saveFile.disabled = importDisabled;
  const importLabel = refs.saveFile.labels?.[0] ?? $('.import-button[for="save-file"]');
  importLabel?.classList.toggle('button--disabled', importDisabled);
  importLabel?.setAttribute('aria-disabled', String(importDisabled));
  if (importLabel) importLabel.title = importDisabled ? 'Initialize a franchise session before importing a checkpoint.' : 'Import a matching portable franchise checkpoint.';
}

function updateButtons() {
  refs.initialize.disabled = busy || Boolean(activeSession) || !fixturePayload || !refs.userTeam.value;
  refs.userTeam.disabled = busy || Boolean(activeSession);
  refs.fixtureFile.disabled = busy || Boolean(activeSession);
  refs.verifiedFixture.disabled = busy || Boolean(activeSession);
  const next = activeSession?.schedule?.[activeSession.scheduleCursor] ?? null;
  const userCode = (activeSession?.leagueState?.userControlledTeamCodes ?? [])[0];
  const savedControls = activeSession?.leagueState?.teams?.find(team => String(team.teamCode).toUpperCase() === userCode)
    ?.franchiseControlsBySeason?.[String(activeSession?.leagueState?.seasonStartYear)] ?? null;
  const validRotation = rotationValidation().ready;
  const rotationSaved = savedControls && rotationMatchesSaved(savedControls);
  refs.saveRotation.disabled = busy || !activeSession || !validRotation || Boolean(rotationSaved);
  refs.advanceGame.disabled = busy || !activeSession || !next || !rotationSaved || !validRotation;
  refs.advanceUserGame.disabled = busy || !activeSession || !next || !rotationSaved || !validRotation;
  updateSeasonCompletionControls();
  updateSaveControls();
  updateV4Controls();
}

function updateSeasonCompletionControls() {
  const schedule = Array.isArray(activeSession?.schedule) ? activeSession.schedule : [];
  const cursor = Number(activeSession?.scheduleCursor);
  const hasSchedule = schedule.length > 0;
  const validCursor = Number.isInteger(cursor) && cursor >= 0 && cursor <= schedule.length;
  const exhausted = Boolean(activeSession) && hasSchedule && validCursor && cursor === schedule.length;
  refs.verifySeasonCompletion.disabled = busy || !exhausted || workerCapabilities?.seasonCompletion !== true;
  if (!activeSession) {
    refs.completionHint.textContent = 'Initialize a pinned season to inspect its scheduled games.';
    refs.verifySeasonCompletion.title = 'Initialize a pinned season before checking its completion.';
  } else if (!hasSchedule) {
    refs.completionHint.textContent = 'This session has no schedule to verify; completion is held for review.';
    refs.verifySeasonCompletion.title = 'A nonempty schedule is required.';
  } else if (!validCursor) {
    refs.completionHint.textContent = 'The schedule cursor is outside its valid range; inspect or restore the session before checking completion.';
    refs.verifySeasonCompletion.title = 'The session schedule cursor is invalid.';
  } else if (!exhausted) {
    const remaining = schedule.length - cursor;
    refs.completionHint.textContent = `${remaining} scheduled game${remaining === 1 ? '' : 's'} remain. Finish every scheduled game before verification is enabled.`;
    refs.verifySeasonCompletion.title = `Complete all ${schedule.length} scheduled games first.`;
  } else if (workerCapabilities?.seasonCompletion !== true) {
    refs.completionHint.textContent = 'The initialized worker does not advertise the versioned season-completion check.';
    refs.verifySeasonCompletion.title = 'Season completion verification is unavailable in this worker.';
  } else if (busy) {
    refs.completionHint.textContent = 'A worker action is in progress. Completion verification will be available when it finishes.';
    refs.verifySeasonCompletion.title = 'Wait for the current worker action to finish.';
  } else {
    refs.completionHint.textContent = `All ${schedule.length} schedule entries are exhausted. The worker will verify the completed-game ledger without changing session revision.`;
    refs.verifySeasonCompletion.title = 'Run the read-only versioned season-completion verification.';
  }

  const receiptIsCurrent = lastSeasonCompletion && lastSeasonCompletionRevision === activeSession?.revision;
  if (receiptIsCurrent) {
    refs.completionStatus.dataset.state = 'verified';
    refs.completionStatus.textContent = `Verified ${lastSeasonCompletion.status} for ${lastSeasonCompletion.seasonStartYear}; session revision ${lastSeasonCompletionRevision} is unchanged.`;
    refs.completionReceipt.textContent = JSON.stringify(lastSeasonCompletion, null, 2);
  } else {
    refs.completionStatus.dataset.state = 'idle';
    refs.completionStatus.textContent = exhausted ? 'Schedule cursor is exhausted; the ledger has not been verified yet.' : 'No completion receipt verified.';
    refs.completionReceipt.textContent = 'The exact worker receipt will appear here after verification.';
  }
}

function rosterRowsForTeam(team, state) {
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

function savedRotation(team, year) {
  return team?.franchiseControlsBySeason?.[String(year)] ?? null;
}

function splitSavedControls(control) {
  const active = new Set((control?.activeRotation ?? []).map(normalizeName));
  const starters = new Set((control?.starters ?? []).map(normalizeName));
  const minutes = new Map((control?.minuteAssignments ?? []).map(row => [normalizeName(row.canonicalName ?? row.playerName), Number(row.minutes)]));
  return { active, starters, minutes };
}

function defaultDraft(rows) {
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

function loadRotationDraft(team, state) {
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

function rotationValidation() {
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

function rotationMatchesSaved(control) {
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

function makeRotationControls() {
  const validation = rotationValidation();
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

function renderTeam() {
  const state = activeSession?.leagueState;
  const team = state?.teams?.find(row => String(row.teamCode).toUpperCase() === activeTeamCode);
  if (!team) {
    refs.teamOverview.innerHTML = '<p class="empty-state">Initialize a prepared scenario to inspect its roster and control the selected user team.</p>';
    refs.teamRole.textContent = 'No active team';
    refs.rosterWrap.innerHTML = '<div class="empty-state empty-state--table">Roster controls appear after initialization.</div>';
    refs.rotationValidation.textContent = 'Load a scenario to inspect rotation readiness.';
    refs.rotationValidation.dataset.state = 'idle';
    rotationDraft = [];
    draftSessionRef = activeSession;
    draftTeamRef = activeTeamCode;
    return;
  }
  refs.teamRole.textContent = 'User-controlled';
  refs.teamRole.className = 'pill pill--green';
  const stats = team.seasonStatsByYear?.[String(state.seasonStartYear)] ?? {};
  refs.teamOverview.className = 'team-overview team-overview--filled';
  refs.teamOverview.innerHTML = `<span class="team-chip"><strong>${escapeHtml(activeTeamCode)}</strong><span>${escapeHtml(team.teamName ?? team.name ?? 'Selected team')}</span></span><span class="team-chip team-chip--record">${Number(stats.wins ?? 0)}–${Number(stats.losses ?? 0)}<span>current record</span></span><span class="team-chip"><span>${(team.rosterNames ?? []).length} roster entries</span></span>`;
  if (draftSessionRef !== activeSession || draftTeamRef !== activeTeamCode) {
    rotationDraft = loadRotationDraft(team, state);
    draftSessionRef = activeSession;
    draftTeamRef = activeTeamCode;
  }
  const allRosterRows = rosterRowsForTeam(team, state);
  const draftByName = new Map(rotationDraft.map(row => [normalizeName(row.name), row]));
  if (!allRosterRows.length) {
    refs.rosterWrap.innerHTML = '<div class="rotation-empty">The selected team has no roster entries in this session.</div>';
  } else {
    const body = allRosterRows.map((row, index) => {
      const draft = draftByName.get(normalizeName(row.name));
      const excluded = row.excluded;
      const active = Boolean(draft?.active);
      const starter = Boolean(draft?.starter);
      const minuteValue = draft?.minutes ?? 0;
      const displayedMinutes = formatRotationInputDisplay(minuteValue);
      const availabilityLabel = row.availability === 'unknown' ? 'Availability not reported' : row.availability === 'available' ? 'Available' : row.availability === 'unavailable' ? 'Unavailable' : row.reason ?? 'Excluded';
      return `<tr data-player="${index}" data-name="${escapeHtml(row.name)}" data-unavailable="${Boolean(row.unavailable)}">
        <td class="player-name">${escapeHtml(row.name)}<span class="player-sub">${escapeHtml(availabilityLabel)}</span></td>
        <td><input data-field="active" type="checkbox" aria-label="Include ${escapeHtml(row.name)} in active rotation" ${active ? 'checked' : ''} ${excluded || row.unavailable || busy ? 'disabled' : ''}></td>
        <td><input data-field="starter" type="checkbox" aria-label="Start ${escapeHtml(row.name)}" ${starter ? 'checked' : ''} ${excluded || row.unavailable || busy ? 'disabled' : ''}></td>
        <td><input data-field="minutes" type="number" min="0" max="48" step="any" inputmode="decimal" value="${escapeHtml(displayedMinutes)}" aria-label="Minutes for ${escapeHtml(row.name)}" title="Full stored precision; regulation assignments must sum to 240 minutes." ${excluded || row.unavailable || busy ? 'disabled' : ''}></td>
      </tr>`;
    }).join('');
    refs.rosterWrap.innerHTML = `<table class="roster-table"><thead><tr><th scope="col">Player</th><th scope="col">Active</th><th scope="col">Starter</th><th scope="col">Minutes</th></tr></thead><tbody>${body}</tbody></table>`;
  }
  renderRotationValidation();
}

function renderRotationValidation() {
  const validation = rotationValidation();
  const control = activeSession?.leagueState?.teams?.find(team => String(team.teamCode).toUpperCase() === activeTeamCode)
    ?.franchiseControlsBySeason?.[String(activeSession?.leagueState?.seasonStartYear)];
  const saved = control && rotationMatchesSaved(control);
  const prefix = saved ? `Saved control revision ${control.revision ?? '—'}. `
    : control ? 'Valid edits are not saved. Save rotation before simulating. ' : 'Draft only; not saved. ';
  refs.rotationValidation.dataset.state = validation.ready && saved ? 'ready' : validation.ready ? 'dirty' : 'invalid';
  refs.rotationValidation.textContent = validation.ready
    ? `${prefix}${validation.active.length} active · five starters · ${formatMinutes(validation.total)}/240 minutes.`
    : `${prefix}${validation.messages.slice(0, 4).join(' ')}${validation.messages.length > 4 ? ` +${validation.messages.length - 4} more.` : ''}`;
}

function upcomingGame() {
  return activeSession?.schedule?.[activeSession.scheduleCursor] ?? null;
}

function renderGame() {
  if (!activeSession) {
    refs.scheduleProgress.textContent = 'No schedule loaded';
    refs.nextGameCard.innerHTML = '<p class="empty-state">The next scheduled matchup appears here after initialization.</p>';
    return;
  }
  const schedule = activeSession.schedule ?? [];
  const game = upcomingGame();
  const cursor = Number(activeSession.scheduleCursor ?? 0);
  refs.scheduleProgress.textContent = `${cursor} / ${schedule.length} games complete`;
  if (!game) {
    refs.nextGameCard.innerHTML = '<div><span class="pill pill--green">Regular-season schedule complete</span><div class="next-game-date">Season advancement is not available in this preview.</div></div>';
    return;
  }
  const available = Object.hasOwn(fixturePayload?.gameInputs ?? {}, game.gameId);
  refs.nextGameCard.innerHTML = `<div style="width:100%"><div class="matchup"><div class="matchup-side"><strong>${escapeHtml(game.awayTeamCode)}</strong><small>Away</small></div><span class="matchup-vs">AT</span><div class="matchup-side"><strong>${escapeHtml(game.homeTeamCode)}</strong><small>Home</small></div></div><div class="next-game-date">${escapeHtml(game.gameLocalDate)} · ${escapeHtml(game.gameId)} · ${available ? 'prepared game input ready' : 'prepared game input missing'}</div></div>`;
}

function gameDateMap(session = activeSession) {
  return new Map((session?.schedule ?? []).map(game => [game.gameId, game.gameLocalDate]));
}

function completedGames(session = activeSession) {
  const year = session?.leagueState?.seasonStartYear;
  return (session?.leagueState?.completedGames ?? []).filter(game => game.seasonStartYear === year);
}

function recordFor(teamCode, games) {
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

function renderState() {
  const session = activeSession;
  if (!session) {
    refs.revisionPill.textContent = 'Revision —';
    refs.stateMetrics.innerHTML = '<div class="metric"><span>Season</span><strong>—</strong></div><div class="metric"><span>Teams</span><strong>—</strong></div><div class="metric"><span>Games played</span><strong>—</strong></div><div class="metric"><span>Remaining</span><strong>—</strong></div>';
    refs.stateQuality.textContent = 'State receipt not loaded.';
    refs.teamRecords.replaceChildren();
    return;
  }
  const state = session.leagueState;
  const games = completedGames(session);
  const remaining = Math.max(0, (session.schedule?.length ?? 0) - Number(session.scheduleCursor ?? 0));
  refs.revisionPill.textContent = `Revision ${session.revision ?? '—'}`;
  refs.stateMetrics.innerHTML = `<div class="metric"><span>Season</span><strong>${Number(state.seasonStartYear)}–${String(Number(state.seasonStartYear) + 1).slice(-2)}</strong></div><div class="metric"><span>Teams</span><strong>${state.teams?.length ?? 0}</strong></div><div class="metric"><span>Games played</span><strong>${games.length}</strong></div><div class="metric"><span>Remaining</span><strong>${remaining}</strong></div>`;
  const quality = state.stateQuality ?? {};
  const reasons = Array.isArray(quality.reasons) ? quality.reasons : [];
  refs.stateQuality.textContent = `${quality.status ?? 'quality unspecified'}${reasons.length ? ` · ${reasons.join(' ')}` : ''}`;
  const rows = (state.teams ?? []).map(team => {
    const code = String(team.teamCode ?? '').toUpperCase();
    const saved = team.seasonStatsByYear?.[String(state.seasonStartYear)];
    const record = saved ? { wins: Number(saved.wins ?? 0), losses: Number(saved.losses ?? 0) } : recordFor(code, games);
    return { code, wins: record.wins, losses: record.losses, games: record.wins + record.losses };
  }).sort((a, b) => (b.wins - a.wins) || (a.losses - b.losses) || a.code.localeCompare(b.code));
  refs.teamRecords.innerHTML = rows.map((row, index) => `<div class="standing-row"><span class="standing-rank">${String(index + 1).padStart(2, '0')}</span><strong>${escapeHtml(row.code)}</strong><span class="standing-record">${row.wins}–${row.losses}</span></div>`).join('') || '<p class="empty-state">No team records.</p>';
}

function renderHistory() {
  if (!activeSession) {
    refs.historyList.innerHTML = '<li class="empty-state">Completed games and actions appear here.</li>';
    return;
  }
  const dates = gameDateMap();
  const games = completedGames().map(game => ({ kind: 'game', revision: null, game }));
  const actions = activeSession.actionHistory ?? [];
  const items = actions.map(action => {
    const game = games.find(row => row.game.gameId === action.gameId)?.game ?? null;
    return { kind: action.kind ?? 'action', revision: action.revision, gameId: action.gameId, action, game };
  }).slice(-8).reverse();
  if (!items.length && games.length) {
    for (const row of games.slice(-8).reverse()) items.push({ kind: 'game', gameId: row.game.gameId, game: row.game });
  }
  if (!items.length) {
    refs.historyList.innerHTML = '<li class="empty-state">No completed games or saved actions yet.</li>';
    return;
  }
  refs.historyList.innerHTML = items.map(item => {
    const gameId = item.gameId ?? item.game?.gameId ?? '—';
    const date = dates.get(gameId) ?? 'date unavailable';
    const detail = item.game
      ? `${item.game.awayTeamCode ?? item.game.awayTeam} at ${item.game.homeTeamCode ?? item.game.homeTeam} · ${date}`
      : `${item.action?.teamCode ?? item.action?.proposalId ?? 'Franchise action'} · ${date}`;
    const score = item.game ? `${item.game.awayScore}–${item.game.homeScore}` : item.kind.replaceAll('-', ' ');
    return `<li class="history-row"><div><strong>${escapeHtml(detail)}</strong><small>${escapeHtml(item.kind.replaceAll('-', ' '))}${item.revision ? ` · revision ${item.revision}` : ''}</small></div><span class="history-score">${escapeHtml(score)}</span></li>`;
  }).join('');
}

function statsForLog(row) {
  return row?.stats && typeof row.stats === 'object' ? row.stats : row ?? {};
}

function statValue(stats, aliases) {
  for (const key of aliases) if (stats?.[key] !== undefined && stats?.[key] !== null) return stats[key];
  return '—';
}

function displayBoxStat(label, stats, aliases) {
  const value = statValue(stats, aliases);
  const numeric = Number(value);
  return label === 'MIN' && value !== '—' && Number.isFinite(numeric) ? numeric.toFixed(1) : value;
}

function renderBoxScore() {
  const games = completedGames();
  const latest = games.at(-1);
  if (!latest) {
    refs.boxScore.innerHTML = '<p class="empty-state">No game has been completed in this session.</p>';
    return;
  }
  const rows = activeSession.leagueState.playerGameLogs ?? [];
  let logs = rows.filter(row => row.gameId === latest.gameId && row.seasonStartYear === latest.seasonStartYear);
  if (!logs.length) {
    const sample = lastGameOutput?.result?.simulations?.[0] ?? lastGameOutput?.simulations?.[0] ?? null;
    const home = Array.isArray(sample?.homeBox) ? sample.homeBox : [];
    const away = Array.isArray(sample?.awayBox) ? sample.awayBox : [];
    logs = [
      ...home.map(row => ({ ...row, teamCode: latest.homeTeamCode, canonicalName: row.canonicalName ?? row.name, stats: row })),
      ...away.map(row => ({ ...row, teamCode: latest.awayTeamCode, canonicalName: row.canonicalName ?? row.name, stats: row })),
    ];
  }
  const html = [latest.homeTeamCode, latest.awayTeamCode].map(code => {
    const teamRows = logs.filter(row => String(row.teamCode).toUpperCase() === String(code).toUpperCase());
    if (!teamRows.length) return `<div class="box-group-title">${escapeHtml(code)} · ${escapeHtml(String(code).toUpperCase() === String(latest.homeTeamCode).toUpperCase() ? latest.homeScore : latest.awayScore)} points</div><p class="empty-state" style="padding:10px">Player box rows are not present in this completed-game ledger.</p>`;
    const body = teamRows.map(row => {
      const stats = statsForLog(row);
      const playerName = row.canonicalName ?? row.name ?? stats.canonicalName ?? stats.name ?? 'Unknown player';
      return `<tr><td class="box-player">${escapeHtml(playerName)}</td>${COUNT_FIELDS.map(([label, aliases]) => `<td>${escapeHtml(displayBoxStat(label, stats, aliases))}</td>`).join('')}</tr>`;
    }).join('');
    const score = String(code).toUpperCase() === String(latest.homeTeamCode).toUpperCase() ? latest.homeScore : latest.awayScore;
    const teamLog = (activeSession.leagueState.teamGameLogs ?? []).find(row => row.gameId === latest.gameId &&
      row.seasonStartYear === latest.seasonStartYear && String(row.teamCode).toUpperCase() === String(code).toUpperCase());
    const totals = teamLog ? `<tfoot><tr><th scope="row">Team totals</th>${COUNT_FIELDS.map(([label, aliases]) =>
      `<td>${escapeHtml(displayBoxStat(label, statsForLog(teamLog), aliases))}</td>`).join('')}</tr></tfoot>` : '';
    return `<div class="box-group-title">${escapeHtml(code)} · ${escapeHtml(score)} points</div><table class="box-table"><thead><tr><th scope="col">Player</th>${COUNT_FIELDS.map(([label]) => `<th scope="col">${label}</th>`).join('')}</tr></thead><tbody>${body}</tbody>${totals}</table>`;
  }).join('');
  refs.boxScore.innerHTML = `<div class="history-score" style="padding:5px 10px 9px">${escapeHtml(latest.awayTeamCode)} ${escapeHtml(latest.awayScore)} · ${escapeHtml(latest.homeTeamCode)} ${escapeHtml(latest.homeScore)}</div>${html}`;
}

function renderAll() {
  if (activeSession?.sourceReceipt?.intakeVersion && activeSession.sourceReceipt.mode === 'retrospective-user-scenario') {
    renderV4GeneratedRatingReceipt(activeSession.sourceReceipt.generatedShootingRatings ?? null);
  }
  renderPins();
  renderTeamChoices();
  renderTeam();
  renderGame();
  renderState();
  renderHistory();
  renderBoxScore();
  updateButtons();
  void refreshIndexedDbCheckpointAvailability();
  if (activeSession && refs.message.hidden) setWorkerStatus('Scenario ready · local worker', 'ready');
}

async function initializeScenario(path = 'fixture') {
  const selectedTeam = path === 'v4' ? refs.v4UserTeam.value : refs.userTeam.value;
  if (path === 'v4' ? !v4IntakeReadyForStart() : (!fixturePayload || !selectedTeam)) return;
  showMessage('');
  if (path === 'v4') v4OperationNotice = null;
  setBusy(true);
  try {
    let prepared;
    if (path === 'v4') {
      await ensureV4Api();
      prepared = v4SnapshotBuilder({
        intake: v4Intake,
        userTeamCode: selectedTeam,
        gameModelText: v4GameModelText,
        productionCandidateText: v4ProductionCandidateText,
        seed: 1,
        missingShootingRatingPolicy: refs.v4GenerateShootingRating.checked ? GENERATED_SHOOTING_RATING_POLICY : 'reject',
      });
      if (!prepared?.sessionInput?.sourceReceipt || !Array.isArray(prepared.sessionInput.leagueState?.teams)
        || prepared.sessionInput.leagueState.teams.length !== 30) {
        throw new Error('The V4 snapshot helper did not return a pinned 30-team session input.');
      }
      prepared.sessionInput.sourceReceipt = {
        ...prepared.sessionInput.sourceReceipt,
        rosterChoiceReceipt: buildV4RosterChoiceReceipt(),
      };
    } else prepared = sessionForTeam(fixturePayload, selectedTeam);
    const worker = await ensureClient();
    const result = await worker.initialize(prepared);
    const failure = commandFailure(result);
    if (failure) throw new Error(failure);
    if (result?.status !== 'initialized' || !result.session) throw new Error('Worker initialization did not return an initialized session snapshot.');
    fixturePayload = prepared;
    fixtureName = path === 'v4' ? `V4 regular-season scenario · ${v4Intake.scenario.seasonStartYear}` : fixtureName;
    activeSession = result.session;
    workerCapabilities = result.capabilities ?? {};
    clearSeasonCompletionReceipt();
    activeTeamCode = String(selectedTeam).toUpperCase();
    storageBackend = path === 'v4' ? 'indexeddb' : 'localstorage';
    if (path === 'v4') {
      browserSaveCheckKey = '';
      hasIndexedDbCheckpoint = false;
      refs.fixtureMeta.innerHTML = `<span>${escapeHtml(fixtureName)}</span><span class="meta-muted">30-team exact V4 regular-season snapshot · retrospective scenario · IndexedDB saves</span>`;
      renderV4GeneratedRatingReceipt(activeSession.sourceReceipt?.generatedShootingRatings ?? null);
    }
    if (!(activeSession.leagueState.userControlledTeamCodes ?? []).map(code => String(code).toUpperCase()).includes(activeTeamCode)) {
      throw new Error('Initialized session does not mark the selected team as user-controlled.');
    }
    lastGameOutput = null;
    refs.saveStatus.textContent = path === 'v4'
      ? 'Thirty-team regular-season scenario initialized. Browser checkpoints use IndexedDB; portable export is available separately.'
      : 'Scenario initialized. Save a checkpoint to this browser or export a JSON file.';
    showMessage('');
    renderAll();
  } catch (error) {
    if (path === 'v4' && Array.isArray(error?.profileReview) && error.profileReview.length) {
      const names = error.profileReview.slice(0, 8).map(row => `${row.canonicalName ?? 'Unnamed player'}: ${(row.missingInputs ?? []).join(', ')}`).join(' · ');
      v4OperationNotice = { operation: 'initialize', kind: 'error', seasonStartYear: Number(refs.v4Year.value),
        message: `V4 player snapshot profile needs review. ${names}${error.profileReview.length > 8 ? ` · ${error.profileReview.length - 8} more rows` : ''}` };
      refs.v4IntakeStatus.dataset.state = 'error';
      refs.v4IntakeStatus.innerHTML = `<strong>V4 player snapshot profile needs review.</strong><small>${escapeHtml(names)}${error.profileReview.length > 8 ? ` · ${error.profileReview.length - 8} more rows` : ''}</small>`;
      renderV4GeneratedRatingReceipt(null, error.profileReview);
    }
    showFailure(error, 'Could not initialize this scenario.');
  } finally { setBusy(false); if (path === 'v4') renderV4Intake(); renderAll(); }
}

async function loadV4Season() {
  if (activeSession) {
    showMessage('This page already has an active franchise session. Export or save it, then reload the preview to start a different year.', 'notice');
    return;
  }
  showMessage('');
  const requestedYear = Number(refs.v4Year.value);
  const loadingMessage = `Loading pinned ${requestedYear}–${String(requestedYear + 1).slice(-2)} regular-season V4 sources and the exact model texts…`;
  v4OperationNotice = { operation: 'load', kind: 'loading', seasonStartYear: requestedYear, message: loadingMessage };
  refs.v4IntakeStatus.dataset.state = 'loading';
  refs.v4IntakeStatus.textContent = loadingMessage;
  setBusy(true);
  setWorkerStatus('Loading exact-season V4 sources…', 'idle');
  try {
    const api = await ensureV4Api();
    const seasonStartYear = Number(refs.v4Year.value);
    const releasePin = api.createV4FranchiseLocalMirrorReleasePinV1({ origin: location.origin });
    const baseUrl = new URL('/tools/swishiq-studio/', location.origin).href;
    const [model, production, intake] = await Promise.all([
      fetchJsonText('../../checkpoints/2026-10-06-v4-parametric-age-frozen/model.json', 'Game model'),
      fetchJsonText('../../models/shared-player-production-v1-candidate-20261007b.json', 'Player production candidate'),
      api.loadV4FranchiseIntakeV1({ seasonStartYear, phase: 'regular', releasePin, baseUrl }),
    ]);
    if (Number(intake.scenario?.seasonStartYear) !== seasonStartYear || intake.scenario?.phase !== 'regular') {
      throw new Error('V4 intake returned a different year or phase from the selected exact regular season.');
    }
    v4Intake = intake;
    v4OperationNotice = null;
    refs.v4GenerateShootingRating.checked = false;
    renderV4GeneratedRatingReceipt(null);
    v4GameModelText = model.text;
    v4ProductionCandidateText = production.text;
    v4GameModelMeta = model.value;
    v4ProductionMeta = production.value;
    v4RosterChoices = new Map();
    v4ChoiceProvenance = new Map();
    v4SuggestionsByName = new Map();
    v4SuggestionSummary = null;
    renderV4Intake();
    refs.v4IntakeStatus.dataset.state = intake.status === 'ready-for-user-scenario-setup' ? 'ready' : 'review';
    setWorkerStatus('V4 intake verified · worker not initialized', 'idle');
    showMessage('');
  } catch (error) {
    const loadedYear = Number(v4Intake?.scenario?.seasonStartYear);
    const retainedSource = Number.isFinite(loadedYear)
      ? ` The previously verified ${loadedYear} regular-season intake and its source receipts remain available.`
      : ' No verified prior V4 intake is available; retry source loading.';
    v4OperationNotice = { operation: 'load', kind: 'error', seasonStartYear: requestedYear,
      message: `V4 load for ${requestedYear} failed: ${error?.message ?? error}.${retainedSource}` };
    refs.v4IntakeStatus.dataset.state = 'error';
    refs.v4IntakeStatus.textContent = v4OperationNotice.message;
    showFailure(error, 'Exact-season V4 intake could not be loaded.', 'V4 intake');
  } finally { setBusy(false); renderV4Intake(); renderAll(); }
}

async function applyLatestTeamSuggestions() {
  if (!v4YearMatchesLoadedIntake() || !v4Intake?.unresolvedRosterChoices?.length || activeSession) return;
  showMessage('');
  const seasonStartYear = Number(v4Intake.scenario.seasonStartYear);
  const loadingMessage = 'Loading package-wide regular-season player-game observations. Unique team choices will be applied only because you pressed this button; tied and unknown rows will remain open.';
  v4OperationNotice = { operation: 'suggestions', kind: 'loading', seasonStartYear, message: loadingMessage };
  refs.v4IntakeStatus.dataset.state = 'loading';
  refs.v4IntakeStatus.textContent = loadingMessage;
  setBusy(true);
  try {
    const api = await ensureV4Api();
    const releasePin = api.createV4FranchiseLocalMirrorReleasePinV1({ origin: location.origin });
    const baseUrl = new URL('/tools/swishiq-studio/', location.origin).href;
    const suggestedIntake = await api.loadLastObservedTeamScenarioSuggestionsV1(v4Intake, { releasePin, baseUrl });
    const nextChoices = new Map(v4RosterChoices);
    const nextProvenance = new Map(v4ChoiceProvenance);
    const nextSuggestions = new Map(v4SuggestionsByName);
    let uniqueApplied = 0, tiedHeld = 0, unknownHeld = 0;
    for (const choice of suggestedIntake.unresolvedRosterChoices ?? []) {
      const key = choice.normalizedPlayerNameKey;
      const suggestion = choice.suggestion ?? null;
      nextSuggestions.set(key, suggestion);
      if (suggestion?.status === 'suggested-not-applied' && suggestion.teamCode && !nextChoices.has(key)) {
        nextChoices.set(key, String(suggestion.teamCode).toUpperCase());
        nextProvenance.set(key, 'generated');
        uniqueApplied += 1;
      } else if (String(suggestion?.status ?? '').includes('tied')) tiedHeld += 1;
      else if (!suggestion || suggestion.status !== 'suggested-not-applied') unknownHeld += 1;
    }
    v4Intake = api.applyV4FranchiseRosterChoicesV1(suggestedIntake, { rosterChoicesByName: nextChoices });
    v4RosterChoices = nextChoices;
    v4ChoiceProvenance = nextProvenance;
    v4SuggestionsByName = nextSuggestions;
    v4SuggestionSummary = { uniqueApplied, tiedHeld, unknownHeld };
    v4OperationNotice = null;
    renderV4Intake();
    refs.v4IntakeStatus.dataset.state = v4Intake.status === 'ready-for-user-scenario-setup' ? 'ready' : 'review';
    setWorkerStatus('V4 suggestions applied · worker not initialized', 'idle');
    showMessage(`${uniqueApplied} unique last-observed-team suggestions were applied as generated scenario choices by explicit click. ${tiedHeld} tied and ${unknownHeld} unknown names remain held for exact user review.`, 'notice');
  } catch (error) {
    v4OperationNotice = { operation: 'suggestions', kind: 'error', seasonStartYear,
      message: `Latest-team suggestions for ${seasonStartYear} failed: ${error?.message ?? error}. Existing exact-team choices and V4 source receipts were preserved; unresolved names still need manual choices.` };
    refs.v4IntakeStatus.dataset.state = 'error';
    refs.v4IntakeStatus.textContent = v4OperationNotice.message;
    showFailure(error, 'Latest-team suggestions could not be loaded.', 'V4 suggestions');
  } finally { setBusy(false); renderV4Intake(); renderAll(); }
}

function onV4RosterChoiceChange(event) {
  const select = event.target.closest('select[data-v4-choice]');
  if (!select || !v4Intake || activeSession) return;
  const key = select.dataset.v4Choice;
  if (!key) return;
  const nextChoices = new Map(v4RosterChoices);
  const nextProvenance = new Map(v4ChoiceProvenance);
  if (select.value) {
    nextChoices.set(key, select.value.toUpperCase());
    nextProvenance.set(key, 'explicit');
  } else {
    nextChoices.delete(key);
    nextProvenance.delete(key);
  }
  try {
    v4Intake = v4Api.applyV4FranchiseRosterChoicesV1(v4Intake, { rosterChoicesByName: nextChoices });
    v4OperationNotice = null;
    v4RosterChoices = nextChoices;
    v4ChoiceProvenance = nextProvenance;
    renderV4Intake();
    showMessage('Roster choice updated using retained exact-season player evidence. No V4 artifact refetch occurred.', 'notice');
  } catch (error) {
    showFailure(error, 'Roster choice was rejected.', 'V4 roster');
    renderV4Intake();
  }
}

function setDraftFromInput(rowElement, field, checkedOrValue, { rerenderRoster = true } = {}) {
  const roster = rowElement?.dataset.name;
  const draftRow = rotationDraft.find(row => normalizeName(row.name) === normalizeName(roster));
  if (!draftRow) return;
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
  if (rerenderRoster) {
    renderTeam();
  } else {
    // Keep the active numeric control's text untouched while reflecting any
    // dependent checkbox changes caused by its value.
    const activeInput = rowElement?.querySelector('input[data-field="active"]');
    const starterInput = rowElement?.querySelector('input[data-field="starter"]');
    if (activeInput) activeInput.checked = Boolean(draftRow.active);
    if (starterInput) starterInput.checked = Boolean(draftRow.starter);
    renderRotationValidation();
  }
  updateButtons();
}

async function saveRotation() {
  if (!activeSession) return;
  showMessage('');
  setBusy(true);
  try {
    const worker = await ensureClient();
    const result = await worker.command('rotation', {
      expectedRevision: activeSession.revision,
      teamCode: activeTeamCode,
      controls: makeRotationControls(),
    });
    const status = String(result?.status ?? '').toLowerCase();
    if (!['created', 'updated', 'ready', 'pass'].includes(status) && !result?.session) {
      throw new Error(commandFailure(result) ?? `Rotation was not saved (worker status: ${result?.status ?? 'unknown'}).`);
    }
    replaceSession(result);
    refs.saveStatus.textContent = 'Rotation saved with an action receipt. Save the franchise checkpoint separately when ready.';
  } catch (error) { showFailure(error, 'Rotation was not saved.'); }
  finally { setBusy(false); renderAll(); }
}

async function advanceGame() {
  if (!activeSession || !upcomingGame()) return;
  showMessage('');
  setBusy(true);
  try {
    const worker = await ensureClient();
    const result = await worker.command('next-game', { expectedRevision: activeSession.revision });
    if (result?.status === 'season-games-complete') {
      replaceSession(result);
      showMessage('The selected regular-season schedule is complete. A new season or postseason cannot be started in this preview.', 'notice');
      return;
    }
    if (result?.status !== 'game-completed') throw new Error(commandFailure(result) ?? `Next game did not complete (worker status: ${result?.status ?? 'unknown'}).`);
    replaceSession(result, { gameResult: true });
    refs.saveStatus.textContent = `Game completed at revision ${activeSession.revision}. The saved browser checkpoint is unchanged until you save it.`;
    showMessage('');
  } catch (error) { showFailure(error, 'The next game was not committed.'); }
  finally { setBusy(false); renderAll(); }
}

async function advanceToNextUserGame() {
  if (!activeSession || !upcomingGame()) return;
  showMessage('');
  setBusy(true);
  try {
    const worker = await ensureClient();
    const result = await worker.command('next-user-game', { expectedRevision: activeSession.revision });
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
    refs.saveStatus.textContent = `Advanced ${count} game${count === 1 ? '' : 's'} as one atomic checkpoint at revision ${activeSession.revision}. The browser checkpoint still reflects the last explicit save.`;
    showMessage(result.checkpointKind === 'remaining-league-schedule'
      ? `No later user-team game remained. Processed ${count} remaining league game${count === 1 ? '' : 's'}${dateRange}; final result: ${finalGame}.`
      : `Advanced ${count} scheduled game${count === 1 ? '' : 's'} through your next game${dateRange}; final result: ${finalGame}. All intervening results committed as one atomic checkpoint.`, 'notice');
  } catch (error) { showFailure(error, 'Games through the next user-team game were not committed.'); }
  finally { setBusy(false); renderAll(); }
}

async function verifySeasonCompletion() {
  const schedule = activeSession?.schedule;
  const revision = activeSession?.revision;
  if (!activeSession || !Array.isArray(schedule) || schedule.length === 0
    || activeSession.scheduleCursor !== schedule.length || !Number.isInteger(revision)) return;
  showMessage('');
  refs.completionStatus.dataset.state = 'checking';
  refs.completionStatus.textContent = 'Verifying the completed-game ledger…';
  const sessionBefore = JSON.stringify(activeSession);
  setBusy(true);
  try {
    if (workerCapabilities?.seasonCompletion !== true) throw new Error('The initialized worker does not support season completion verification.');
    const worker = await ensureClient();
    const result = await worker.command('verify-season-completion', { expectedRevision: revision });
    const failure = commandFailure(result);
    if (failure) throw new Error(failure);
    if (result?.status !== 'season-games-complete') {
      throw new Error(`Season completion verification did not complete (worker status: ${result?.status ?? 'unknown'}).`);
    }
    if (!result.session || JSON.stringify(result.session) !== sessionBefore) {
      try { worker.dispose?.(); } catch { /* The prior local snapshot remains authoritative for display. */ }
      if (client === worker) client = null;
      workerCapabilities = null;
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
      || receipt.scheduleComplete !== true || receipt.seasonStartYear !== activeSession.leagueState.seasonStartYear
      || expectedStatus === null || receipt.status !== expectedStatus || !scenarioMetadataValid
      || receipt.scheduledGameCount !== schedule.length || receipt.completedGameCount !== schedule.length
      || !/^[a-f0-9]{64}$/.test(receipt.canonicalScheduleSha256 ?? '')) {
      throw new Error('Worker returned an incomplete or unsupported season-completion receipt.');
    }
    lastSeasonCompletion = clone(receipt);
    lastSeasonCompletionRevision = revision;
    setWorkerStatus('Season completion verified · session unchanged', 'ready');
    showMessage(`The worker verified ${receipt.status} for ${receipt.seasonStartYear}. Session revision ${revision} and the saved checkpoint were not changed.`, 'notice');
  } catch (error) {
    refs.completionStatus.dataset.state = 'error';
    refs.completionStatus.textContent = `Verification failed: ${error?.message ?? error}`;
    showFailure(error, 'Season completion could not be verified.', 'Season completion');
  } finally { setBusy(false); renderAll(); }
}

async function exportCurrentSave() {
  if (!activeSession) return null;
  const worker = await ensureClient();
  const result = await worker.command('export', {});
  const failure = commandFailure(result);
  if (failure) throw new Error(failure);
  const saveText = result?.saveText;
  exportedSaveMatches(saveText);
  return saveText;
}

async function saveLocal() {
  if (!activeSession) return;
  showMessage('');
  setBusy(true);
  try {
    if (storageBackend === 'indexeddb') {
      const store = await ensureFranchiseBrowserStore();
      const result = await store.save(activeSession, { userTeamCode: activeTeamCode });
      if (result?.status !== 'checkpoint-saved') throw new Error(`IndexedDB did not confirm the checkpoint (status: ${result?.status ?? 'unknown'}).`);
      hasIndexedDbCheckpoint = true;
      browserSaveCheckKey = makeBrowserKey();
      refs.saveStatus.textContent = `IndexedDB checkpoint saved and verified · revision ${activeSession.revision} · ${humanBytes(result.bytes)} · ${result.previousCheckpointSaved ? 'previous checkpoint rotated' : 'no prior checkpoint rotated'}.`;
      showMessage('');
      return;
    }
    const key = makeBrowserKey();
    if (!key) throw new Error('This session lacks exact source, model, season, or user-team pins for a local save key.');
    const saveText = await exportCurrentSave();
    const pending = `${key}:pending`;
    const previous = localStorage.getItem(key);
    try {
      localStorage.setItem(pending, saveText);
      if (localStorage.getItem(pending) !== saveText) throw new Error('Staging checkpoint readback failed.');
      exportedSaveMatches(localStorage.getItem(pending));
      localStorage.setItem(key, saveText);
      if (localStorage.getItem(key) !== saveText) throw new Error('Browser checkpoint readback failed.');
      exportedSaveMatches(localStorage.getItem(key));
    } catch (error) {
      if (previous === null) localStorage.removeItem(key); else localStorage.setItem(key, previous);
      throw error;
    } finally { localStorage.removeItem(pending); }
    refs.saveStatus.textContent = `Browser checkpoint saved and read-back verified · revision ${activeSession.revision} · ${humanBytes(saveText.length)}.`;
    showMessage('');
  } catch (error) {
    refs.saveStatus.textContent = storageBackend === 'indexeddb'
      ? `IndexedDB checkpoint at revision ${activeSession.revision} was not written. The active session and any earlier checkpoint remain intact; Export JSON is available as a portable fallback.`
      : `Browser checkpoint at revision ${activeSession.revision} was not written. The active session and any earlier checkpoint remain intact; Export JSON is available as a portable fallback.`;
    showFailure(error, 'Browser checkpoint was not changed.');
  }
  finally { setBusy(false); renderAll(); }
}

async function restoreSaveText(saveText, label) {
  const candidate = JSON.parse(saveText);
  const candidateTeams = (candidate?.leagueState?.userControlledTeamCodes ?? []).map(code => String(code).toUpperCase());
  if (candidateTeams.length !== 1) throw new Error('A portable franchise save must contain exactly one user-controlled team.');
  const worker = await ensureClient();
  const result = await worker.command('restore', { saveText });
  const failure = commandFailure(result);
  if (failure) throw new Error(failure);
  if (!result?.session) throw new Error('Worker restore did not return a verified session snapshot.');
  const restoredTeam = (result.session.leagueState?.userControlledTeamCodes ?? [])[0];
  if (!restoredTeam) throw new Error('Restored session has no user-controlled team.');
  activeSession = result.session;
  clearSeasonCompletionReceipt();
  activeTeamCode = String(restoredTeam).toUpperCase();
  storageBackend = candidate?.sourceReceipt?.mode === 'retrospective-user-scenario' && candidate?.sourceReceipt?.intakeVersion
    ? 'indexeddb' : 'localstorage';
  browserSaveCheckKey = '';
  hasIndexedDbCheckpoint = false;
  lastGameOutput = null;
  refs.saveStatus.textContent = `${label} restored and verified · revision ${activeSession.revision}.`;
  showMessage('');
  renderAll();
}

async function resumeLocal() {
  if (!activeSession) return;
  showMessage('');
  setBusy(true);
  try {
    if (storageBackend === 'indexeddb') {
      const store = await ensureFranchiseBrowserStore();
      const loaded = await store.load(indexedDbLoadOptions());
      const worker = await ensureClient();
      const result = await worker.command('restore-session', { session: loaded.session });
      const failure = commandFailure(result);
      if (failure) throw new Error(failure);
      if (!result?.session) throw new Error('Worker did not return the pinned IndexedDB checkpoint snapshot.');
      activeSession = result.session;
      clearSeasonCompletionReceipt();
      activeTeamCode = String((result.session.leagueState?.userControlledTeamCodes ?? [])[0] ?? '').toUpperCase();
      lastGameOutput = null;
      hasIndexedDbCheckpoint = true;
      browserSaveCheckKey = makeBrowserKey();
      refs.saveStatus.textContent = `IndexedDB ${loaded.status.replaceAll('-', ' ')} · revision ${activeSession.revision}${loaded.checkpoint?.bytes ? ` · ${humanBytes(loaded.checkpoint.bytes)}` : ''}.`;
      showMessage('');
      renderAll();
    } else {
      const key = makeBrowserKey();
      const saveText = readSavedText(key);
      if (!saveText) throw new Error('No browser checkpoint exists for this exact source/model/season/team pin.');
      await restoreSaveText(saveText, 'Browser checkpoint');
    }
  } catch (error) { showFailure(error, 'Browser checkpoint could not be resumed.'); }
  finally { setBusy(false); renderAll(); }
}

function downloadSave(saveText) {
  const blob = new Blob([saveText], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `season-lab-franchise-${activeTeamCode.toLowerCase()}-${activeSession.leagueState.seasonStartYear}-r${activeSession.revision}.json`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

async function exportSave() {
  if (!activeSession) return;
  showMessage('');
  setBusy(true);
  try {
    const saveText = await exportCurrentSave();
    downloadSave(saveText);
    refs.saveStatus.textContent = `Portable checkpoint exported · revision ${activeSession.revision} · ${humanBytes(saveText.length)}.`;
  } catch (error) { showFailure(error, 'Save export failed.'); }
  finally { setBusy(false); renderAll(); }
}

async function importSave(file) {
  if (!activeSession || !file) return;
  showMessage('');
  setBusy(true);
  try {
    let saveText = await file.text();
    const parsed = JSON.parse(saveText);
    if (typeof parsed?.saveText === 'string') saveText = parsed.saveText;
    await restoreSaveText(saveText, 'Imported checkpoint');
    refs.saveStatus.textContent += ` · ${file.name}`;
  } catch (error) { showFailure(error, 'Imported checkpoint was rejected; current session and browser save were kept.'); }
  finally { setBusy(false); refs.saveFile.value = ''; renderAll(); }
}

async function loadFixture(file) {
  if (!file) return;
  if (activeSession) {
    refs.fixtureFile.value = '';
    showMessage('This page already has an active franchise session. Export or save it, then reload the preview to start another scenario.', 'notice');
    return;
  }
  showMessage('');
  try {
    const parsed = JSON.parse(await file.text());
    const payload = readPayload(parsed);
    const state = leagueStateFor(payload);
    if (!Array.isArray(state?.teams) || !state.teams.length) throw new Error('Fixture session state needs a non-empty teams array.');
    fixturePayload = payload;
    fixtureName = file.name;
    activeSession = null;
    workerCapabilities = null;
    clearSeasonCompletionReceipt();
    activeTeamCode = '';
    storageBackend = 'localstorage';
    browserSaveCheckKey = '';
    hasIndexedDbCheckpoint = false;
    rotationDraft = [];
    draftSessionRef = null;
    draftTeamRef = '';
    lastGameOutput = null;
    refs.fixtureMeta.innerHTML = `<span>${escapeHtml(file.name)}</span><span class="meta-muted">${humanBytes(file.size)} · parsed locally</span>`;
    renderPins(payload, null);
    renderTeamChoices();
    refs.teamOverview.innerHTML = '<p class="empty-state">Fixture parsed. Choose a user-controlled team, then initialize the worker session.</p>';
    refs.rosterWrap.innerHTML = '<div class="empty-state empty-state--table">Roster controls appear after initialization.</div>';
    refs.rotationValidation.textContent = 'Initialize the scenario to draft the selected team rotation.';
    refs.rotationValidation.dataset.state = 'idle';
    refs.saveStatus.textContent = 'No checkpoint loaded.';
    showMessage('');
    setWorkerStatus('Fixture parsed · worker not initialized', 'idle');
    updateButtons();
  } catch (error) {
    showFailure(error, 'Fixture file was not loaded.', 'Fixture');
  } finally { refs.fixtureFile.value = ''; }
}

async function loadVerifiedFixture() {
  if (activeSession) {
    showMessage('This page already has an active franchise session. Export or save it, then reload the preview to start another scenario.', 'notice');
    return;
  }
  showMessage('');
  refs.verifiedFixture.disabled = true;
  try {
    const receiptResponse = await fetch(`./${VERIFIED_FIXTURE_RECEIPT_NAME}`, { cache: 'no-store' });
    if (!receiptResponse.ok) throw new Error(`Fixture receipt request failed with HTTP ${receiptResponse.status}.`);
    const receiptBytes = new Uint8Array(await receiptResponse.arrayBuffer());
    const receiptDigest = await sha256Hex(receiptBytes);
    if (receiptDigest !== VERIFIED_FIXTURE_RECEIPT_SHA256) throw new Error('Fixture receipt SHA-256 does not match the reviewed UI trust anchor.');
    let receipt;
    try { receipt = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(receiptBytes)); }
    catch (error) { throw new Error(`Fixture receipt is invalid JSON: ${error.message}`); }
    if (receipt?.format !== 'djhc-season-lab-preview-fixture-receipt-v1' || receipt.version !== 1
      || receipt.fixtureFile !== VERIFIED_FIXTURE_NAME || !Number.isSafeInteger(receipt.byteLength) || receipt.byteLength < 1
      || !/^[a-f0-9]{64}$/.test(receipt.sha256 ?? '')) {
      throw new Error('Fixture receipt format, filename, byte length, or SHA-256 is invalid.');
    }
    const response = await fetch(`./${VERIFIED_FIXTURE_NAME}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Prepared fixture request failed with HTTP ${response.status}.`);
    const fixtureBytes = new Uint8Array(await response.arrayBuffer());
    if (fixtureBytes.byteLength !== receipt.byteLength) throw new Error(`Prepared fixture byte length mismatch (${fixtureBytes.byteLength} actual, ${receipt.byteLength} pinned).`);
    const fixtureDigest = await sha256Hex(fixtureBytes);
    if (fixtureDigest !== receipt.sha256) throw new Error('Prepared fixture SHA-256 does not match its independently pinned receipt.');
    let parsed;
    try { parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(fixtureBytes)); }
    catch (error) { throw new Error(`Prepared fixture is invalid UTF-8 JSON: ${error.message}`); }
    const payload = readPayload(parsed);
    const state = leagueStateFor(payload);
    if (!Array.isArray(state?.teams) || state.teams.length !== 2) {
      throw new Error('The prepared browser smoke fixture is expected to contain exactly two teams.');
    }
    fixturePayload = payload;
    fixtureName = VERIFIED_FIXTURE_NAME;
    activeSession = null;
    workerCapabilities = null;
    clearSeasonCompletionReceipt();
    activeTeamCode = '';
    storageBackend = 'localstorage';
    browserSaveCheckKey = '';
    hasIndexedDbCheckpoint = false;
    rotationDraft = [];
    draftSessionRef = null;
    draftTeamRef = '';
    lastGameOutput = null;
    refs.fixtureMeta.innerHTML = `<span>${escapeHtml(fixtureName)}</span><span class="meta-muted">${humanBytes(fixtureBytes.byteLength)} · SHA-256 ${receipt.sha256.slice(0, 16)}… · independently receipt-pinned · prepared V4 two-team browser smoke input · not full-league acceptance</span>`;
    renderPins(payload, null);
    renderTeamChoices();
    refs.teamOverview.innerHTML = '<p class="empty-state">Prepared V4 two-team fixture loaded locally. Choose its user-controlled team and initialize the worker.</p>';
    refs.rosterWrap.innerHTML = '<div class="empty-state empty-state--table">Roster controls appear after initialization.</div>';
    refs.rotationValidation.textContent = 'Initialize the scenario to draft the selected team rotation.';
    refs.rotationValidation.dataset.state = 'idle';
    refs.saveStatus.textContent = 'Two-team browser smoke input loaded. This is not full-league acceptance.';
    setWorkerStatus('Fixture parsed · worker not initialized', 'idle');
    updateButtons();
  } catch (error) {
    showFailure(error, 'Prepared fixture could not be loaded.', 'Fixture');
  } finally { refs.verifiedFixture.disabled = false; }
}

function onRosterChange(event) {
  const input = event.target.closest('input[data-field]');
  if (!input) return;
  const row = input.closest('tr[data-player]');
  setDraftFromInput(row, input.dataset.field, input.type === 'checkbox' ? input.checked : input.value,
    { rerenderRoster: input.dataset.field !== 'minutes' });
}

function onRosterInput(event) {
  const input = event.target.closest('input[data-field="minutes"]');
  if (!input) return;
  const row = input.closest('tr[data-player]');
  setDraftFromInput(row, 'minutes', input.value, { rerenderRoster: false });
}

refs.fixtureFile.addEventListener('change', event => loadFixture(event.target.files?.[0]));
refs.verifiedFixture.addEventListener('click', loadVerifiedFixture);
refs.initialize.addEventListener('click', () => initializeScenario('fixture'));
refs.v4Load.addEventListener('click', loadV4Season);
refs.v4Suggest.addEventListener('click', applyLatestTeamSuggestions);
refs.v4Initialize.addEventListener('click', () => initializeScenario('v4'));
refs.v4Year.addEventListener('change', () => {
  refs.v4UserTeam.value = '';
  refs.v4GenerateShootingRating.checked = false;
  v4OperationNotice = null;
  renderV4GeneratedRatingReceipt(null);
  renderV4Intake();
});
refs.v4UserTeam.addEventListener('change', updateButtons);
refs.v4RosterReview.addEventListener('change', onV4RosterChoiceChange);
refs.saveRotation.addEventListener('click', saveRotation);
refs.advanceGame.addEventListener('click', advanceGame);
refs.advanceUserGame.addEventListener('click', advanceToNextUserGame);
refs.verifySeasonCompletion.addEventListener('click', verifySeasonCompletion);
refs.saveLocal.addEventListener('click', saveLocal);
refs.resumeLocal.addEventListener('click', resumeLocal);
refs.exportSave.addEventListener('click', exportSave);
refs.saveFile.addEventListener('change', event => importSave(event.target.files?.[0]));
refs.rosterWrap.addEventListener('change', onRosterChange);
refs.rosterWrap.addEventListener('input', onRosterInput);
refs.userTeam.addEventListener('change', updateButtons);

window.addEventListener('beforeunload', () => {
  try { client?.dispose?.(); } catch { /* Best-effort worker shutdown. */ }
  try { franchiseBrowserStore?.close?.(); } catch { /* Best-effort IndexedDB shutdown. */ }
});

renderPins(null, null);
renderV4Intake();
renderTeamChoices();
renderState();
renderHistory();
renderBoxScore();
updateButtons();
