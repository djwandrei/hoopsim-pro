import {
  DEFAULT_MAX_EXACT_COMBINATIONS,
  DEFAULT_FAMILY_PRESETS,
  OBJECTIVE_FAMILY_DEFINITIONS,
  LINEUP_INPUT_STABILITY_METRICS,
  assessHistoricalPositionMinuteEvidence,
  deriveHistoricalPositionMinuteRequirements,
  skillFamiliesFromMetricWeights,
  weightsFromSkillFamilies,
} from "./optimizer-config.js?v=20261002c&rev=lineup-input-stability-config-v1";
import {
  datasetToCsv,
  normalizeDataset,
  parsePlayerCsv,
  validateDataset,
} from "./player-data.js?v=20261002c";
import {
  fetchSupabaseNbaTeamDataset,
  listSupabaseNbaSeasons,
  listSupabaseNbaTeams,
  nbaSeasonLabel,
} from "./supabase-nba-data.js?v=20261002c";
import {
  loadSwishIqStaticLineupCoverage,
  loadSwishIqStaticLineupProjection,
  publicSwishIqImpactAvailability,
} from "./swishiq-static-projection.js?v=20261010a&rev=studio-lineup-projection-wrapper-v1";
import {
  ALL_GAMES_COMPANION_RUNTIME_RELEASE_PIN,
  ALL_GAMES_LOCAL_PACKAGE_PIN,
  ALL_GAMES_PACKAGE_SOURCE_KIND,
  ALL_GAMES_PACKAGE_TEAM_NAMES,
  loadAllGamesCompanionCoverage,
  loadAllGamesTeamDataset,
} from "./all-games-public-package.js?v=20261008n&rev=all-games-all-team-evidence-v2";
import { CANONICAL_V4_STUDIO_RUNTIME_RELEASE_PIN } from "../../engine/canonical-v4-studio-runtime-adapter.js?v=20261002e&rev=canonical-v4-studio-runtime-adapter-v4-dependency-cache-closure";
import {
  CANONICAL_V4_PLAYER_NAME_KEY_VERSION,
  normalizeCanonicalV4PlayerNameKey,
} from "../../engine/canonical-v4-player-name-identity.js?v=20261001d&rev=canonical-v4-player-name-identity-v1";
import { canonicalV4LineupModelExecutionAvailability } from "../../engine/canonical-v4-lineup-model-gate.js?v=20261008n&rev=historical-optimizer-gate-6a0e4d0ed273a71e";
import {
  CANONICAL_V4_IMPACT_LINEUP_EVIDENCE_FORMAT,
  canonicalV4ImpactLineupAvailability,
  loadCanonicalV4ImpactForLineupDataset,
} from "../../engine/canonical-v4-impact-lineup-adapter.js?v=20261010a&rev=native-v4-impact-lineup-wiring-v1";
import {
  SWISHIQ_V3_PACKAGE_DEFAULT_SEASON_END_YEAR,
  SWISHIQ_V3_PACKAGE_PHASES,
  SWISHIQ_V3_PACKAGE_SEASON_END_YEARS,
  SWISHIQ_V3_PACKAGE_SOURCE_KIND,
  SWISHIQ_V3_TEAM_NAMES,
  loadSwishIqV3TeamDataset,
  bindSwishIqV3ImpactEvidence,
} from "./native-swishiq-package.js?v=20261001a&rev=exact-public-v3-retired-import-source-v3-v4-pin-closure-v1";
import {
  derivePlayerRateViews,
  explainOptimizationSelection,
  explainLineupRoleChange,
} from "./fan-analytics.js?v=20261002c";
import {
  buildOpponentGamePlan,
} from "./opponent-gameplan.js?v=20261002c";
import {
  decodeScenarioQuery,
  encodeScenarioQuery,
} from "./scenario-url.js?v=20261002c&rev=lineup-scenario-url-retired-import-unavailable-v1-20260930a";
import { pruneLineupLabDatasetCache } from "./lineup-cache.js?v=20261002c";
import { WORKFLOW_FIELDS, readWorkflowDraft, validateWorkflow } from "./workflow-state.js?v=20261002c&rev=lineup-workflow-state-phase10-component-reliability-v1-20260928j";
import {
  resolveSwishIQObjectiveWeights,
  SWISHIQ_IMPACT_OBJECTIVE_VERSION,
  swishIQFamilyContributionBreakdown,
} from "./swishiq-impact.js?v=20261010a&rev=native-v4-impact-mean-only-v1";
import { createWorkflowView } from "./workflow-view.js?v=20261002c&rev=lineup-workflow-view-phase12-annotation-polish-v1";
import {
  loadSwishIqPlayerMetadata,
  normalizePlayerName,
} from "../../player-metadata.js?v=20261002c&rev=local-media-v1";
import { teamLogoAssetUrl } from "../modules/team-assets.js?v=20261002c&rev=local-media-v1";
import {
  attachResultPassport,
  createLineupScenarioEnvelope,
  hashCanonical,
  resultPassportEvidenceContext,
  resultPassportFromOptimizerResult,
} from "../modules/result-passport.js?v=20261008n&rev=lineup-effective-configuration-v2";
import {
  buildLineupLabPublicResultSummary,
  buildVerifiedLineupLabV4PublicResultSummary,
} from "./public-result-share-adapter.js?v=20261001f&rev=lineup-v4-verified-share-gate-v1";
import {
  createSignedPublicResultShareLink,
  isSignedPublicResultShareAvailable,
} from "../../engine/public-result-share-client.js?v=20261001f&rev=studio-runtime-shared-dependency-closure-v1";
import { renderResultContext } from "../modules/result-visuals.js?v=20261001g&rev=browser-native-result-visuals-v2";
import { renderRoleCoverageVisual } from "../modules/result-visuals.js?v=20261001g&rev=browser-native-result-visuals-v2";
import { createConditionalLineupPanel } from "./conditional-lineup-panel.js?v=20261008n&rev=conditional-lineup-projection-v1";

const ALL_GAMES_SOURCE_VALUE = "all-games-package";
const LEGACY_NATIVE_SOURCE_VALUE = "native-package";
const IMPORTED_SOURCE_VALUE = "imported";
const RETIRED_IMPORTED_SOURCE_MESSAGE = "Imported stats before 2017–18 are unavailable. Choose NBA stats or import a CSV.";

let allGamesCompanionCoveragePromise = null;
function loadReviewedAllGamesCoverage() {
  if (!allGamesCompanionCoveragePromise) {
    allGamesCompanionCoveragePromise = loadAllGamesCompanionCoverage({
      releasePin: ALL_GAMES_COMPANION_RUNTIME_RELEASE_PIN,
      canonicalReleasePin: CANONICAL_V4_STUDIO_RUNTIME_RELEASE_PIN,
    }).catch((error) => {
      allGamesCompanionCoveragePromise = null;
      throw error;
    });
  }
  return allGamesCompanionCoveragePromise;
}

function isAllGamesSourceValue(value) {
  return value === ALL_GAMES_SOURCE_VALUE || value === LEGACY_NATIVE_SOURCE_VALUE;
}

function canonicalSourceValue(value) {
  return isAllGamesSourceKind(value) ? ALL_GAMES_SOURCE_VALUE : IMPORTED_SOURCE_VALUE;
}

function isAllGamesSourceKind(value) {
  return value === SWISHIQ_V3_PACKAGE_SOURCE_KIND
    || value === "swishiq-native-package"
    || isAllGamesSourceValue(value);
}

function canonicalSourceKind(value) {
  return isAllGamesSourceKind(value) ? SWISHIQ_V3_PACKAGE_SOURCE_KIND : IMPORTED_SOURCE_VALUE;
}

// Keep every Lineup Lab dependency on the same reviewed release revision. The
// storefront service worker caches by full request URL, so versioned module
// requests prevent a newly deployed app shell from pairing with an old solver,
// dataset adapter, worker, or course-fixture response.
const FIXTURE_URL = "./fixtures/timberwolves-2021-22.json?v=20261002c";
const OPTIMIZER_WORKER_URL = new URL("./optimizer-worker.js?v=20261010a&rev=native-v4-impact-mean-only-v1", import.meta.url);
// Five-player lineup mode keeps its bounded-search watchdog. Rotation mode is
// intentionally different: it has no candidate-count cutoff and therefore no
// elapsed-time cutoff. That work stays in a background Worker until it finishes
// or the visitor changes the scenario, which calls cancelOptimization().
const LINEUP_OPTIMIZER_WORKER_TIMEOUT_MS = 45_000;
// This is a consent threshold, not a solver cap. Rotation mode always retains
// its exact candidate contract after the visitor explicitly chooses to start.
const ROTATION_SEARCH_CONFIRMATION_CANDIDATE_THRESHOLD = 1_000_000;
const WATCHLIST_KEY = "djhc-lineup-lab-watchlist-v1";
const WATCHLIST_SNAPSHOTS_KEY = "djhc-lineup-lab-watchlist-snapshots-v2";
const WATCHLIST_SNAPSHOT_FIELDS = Object.freeze([
  "id",
  "name",
  "team",
  "positions",
  "age",
  "games",
  "starts",
  "minutes",
  "fgPct",
  "threePct",
  "efgPct",
  "ftPct",
  "rebounds",
  "assists",
  "steals",
  "blocks",
  "turnovers",
  "points",
]);
// Bump this when the normalized live payload changes materially. In this
// release, cached team stints can be missing newly imported media and the
// reconstructed team-average/rotation summary. A new prefix makes the browser
// rebuild that source context immediately instead of waiting for the old
// 24-hour entry to expire.
// Re-fetch older snapshots that predate the read-only season-evidence reader.
const NBA_CACHE_PREFIX = "djhc-lineup-lab-bref-supabase-v7";
const NBA_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const NBA_CACHE_MAX_ENTRIES = 24;
import { setCourtContextTeam } from "../../../basketball-theme.js?v=20260930f&rev=palette-lazy-v2-shared-cache-20260930f";

const DEFAULT_TEAM_CODE = "MIN";
const DEFAULT_SEASON_PHASE = "regular";
// The optimizer is deterministic, but exact-package Result Passports still
// need an explicit seed pin so a saved replay can prove it used the same
// execution contract. Keep this stable across shared links; package identity,
// scope, rules, and objective version provide the other replay pins.
const LINEUP_LAB_REPLAY_SEED = "lineup-lab-replay-v1";
// Lineup Lab deliberately does not use team-stint workload as a rotation
// constraint. Keep the literal in one place so an old shared link or a stale
// browser control cannot silently reactivate the legacy guardrail.
const LINEUP_LAB_ROTATION_MINUTE_PLAN = "openWhatIf";
const UI_TO_ENGINE_PRESET = Object.freeze({
  balanced: "balanced",
  defense: "defense",
  offense: "scoring",
  shooting: "shooting",
  playmaking: "playmaking",
  rebounding: "rebounding",
});
const PRESET_LABELS = Object.freeze({
  balanced: "Balanced",
  defense: "Defense",
  offense: "Offense",
  shooting: "Space the Floor",
  playmaking: "Move the Ball",
  rebounding: "Own the Glass",
  custom: "Custom Mix",
});
const METRIC_LABELS = Object.freeze({
  points: "Scoring",
  freeThrowAttemptRate: "Free-throw pressure (FTA/FGA)",
  efgPct: "Effective FG%",
  threePct: "Three-point %",
  rebounds: "Rebounding",
  assists: "Playmaking",
  steals: "Steals",
  blocks: "Blocks",
  ballSecurity: "Turnovers (lower is better)",
  offensiveImpact: "Offensive impact (OBPM)",
  defensiveImpact: "Defensive impact (DBPM)",
});
const FAMILY_LABELS = Object.freeze(Object.fromEntries(
  Object.entries(OBJECTIVE_FAMILY_DEFINITIONS).map(([family, definition]) => [
    family,
    definition.label,
  ]),
));
const COMPARE_METRICS = Object.freeze([
  ["points", "Points", false],
  ["rebounds", "Rebounds", false],
  ["assists", "Assists", false],
  ["steals", "Steals", false],
  ["blocks", "Blocks", false],
  ["efgPct", "eFG%", false],
  ["threePct", "3P%", false],
  ["turnovers", "Turnovers — lower is better", true],
]);
// Display preferences are deliberately separate from the optimizer's exact
// inputs. A fan can inspect the same selected group in several rate views
// without silently changing which group the solver selected.
const ANALYTICS_VIEW_DETAILS = Object.freeze({
  perGame: Object.freeze({
    label: "Per game",
    shortLabel: "per game",
    rateKey: "perGame",
    note: "Per-game production from the player's games with the selected team.",
  }),
  per36: Object.freeze({
    label: "Per 36 minutes",
    shortLabel: "per 36",
    rateKey: "per36",
    note: "Counting stats normalized to 36 historical minutes; shooting percentages stay unchanged.",
  }),
  per100Estimated: Object.freeze({
    label: "Per 100 estimated possessions",
    shortLabel: "per 100 estimated possessions",
    rateKey: "per100",
    note: "Uses an estimated minute-share possession denominator from team totals, not reported on-court possessions.",
  }),
  eraRelative: Object.freeze({
    label: "Same-season relative rate (per 36)",
    shortLabel: "vs same-season base",
    rateKey: "eraRelative",
    note: "Shows how far the selected rate is above or below the supplied same-season baseline; 0% means it matches the baseline.",
  }),
});
const CHART_COLORS = ["#1f2fa3", "#e51e2b", "#08775b", "#b06c00"];
const CARD_SEARCH_PATH = "/basketball-cards.html";
const ROTATION_POSITION_PROFILES = Object.freeze({
  traditional: Object.freeze({ G: 96, F: 96, C: 48 }),
  small: Object.freeze({ G: 120, F: 96, C: 24 }),
  big: Object.freeze({ G: 72, F: 120, C: 48 }),
});
const ROTATION_MINUTE_PLAN_LABELS = Object.freeze({
  historicalAware: "Recorded-minutes guardrail",
  openWhatIf: "Game-plan optimization",
});
const PROJECTION_RISK_LABELS = Object.freeze({
  reliable: "More cautious estimates",
  balanced: "Balanced projection",
  upside: "More upside",
});
const ROLE_BALANCE_LABELS = Object.freeze({
  off: "Explanation only",
  recommended: "Recommended",
  emphasized: "Emphasized",
});
const TRUSTED_MEDIA_HOSTS = new Set([
  "www.basketball-reference.com",
  "cdn.ssref.net",
  "iili.io",
]);
const TRUSTED_SOURCE_HOSTS = new Set(["www.basketball-reference.com"]);

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

function syncChoiceButtonGroup(select) {
  if (!(select instanceof HTMLSelectElement)) return;
  $$(`[data-choice-select="${select.id}"]`).forEach((button) => {
    const selected = button.dataset.choiceValue === select.value;
    button.classList.toggle("is-selected", selected);
    button.setAttribute("aria-pressed", String(selected));
  });
}

function bindChoiceButtonGroups() {
  const selects = [elements.mode, $("#modelModeInput")].filter((select) => select instanceof HTMLSelectElement);
  selects.forEach((select) => {
    syncChoiceButtonGroup(select);
    select.addEventListener("change", () => syncChoiceButtonGroup(select));
  });
  $$('[data-choice-select]').forEach((button) => {
    button.addEventListener("click", () => {
      const select = document.getElementById(button.dataset.choiceSelect);
      const value = button.dataset.choiceValue;
      if (!(select instanceof HTMLSelectElement) || !value || select.value === value) return;
      if (![...select.options].some((option) => option.value === value)) return;
      select.value = value;
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
  });
}

const elements = {
  form: $("#optimizerForm"),
  simpleMode: $("#simpleModeButton"),
  detailedMode: $("#detailedModeButton"),
  playersStepNumber: $("#playersStepNumber"),
  runStepNumber: $("#runStepNumber"),
  simpleModelSummaryCopy: $("#simpleModelSummaryCopy"),
  simpleModelSummaryNote: $("#simpleModelSummaryNote"),
  playerTableBody: $("#playerTableBody"),
  playerPoolDetails: $("#playerPoolDetails"),
  usageScenarioControls: $("#usageScenarioControls"),
  usageScenarioList: $("#usageScenarioList"),
  playerSearch: $("#playerSearchInput"),
  poolSummary: $("#poolSummary"),
  activeSelectionTray: $("#activeSelectionTray"),
  mode: $("#modeInput"),
  size: $("#sizeInput"),
  sizeField: $("#sizeField"),
  alternatives: $("#alternativesInput"),
  projectionRiskSettings: $("#projectionRiskSettings"),
  rotationSettings: $("#rotationSettings"),
  minGuards: $("#minGuardsInput"),
  minForwards: $("#minForwardsInput"),
  minCenters: $("#minCentersInput"),
  minGames: $("#minGamesInput"),
  minMinutes: $("#minMinutesInput"),
  sampleFilterHelp: $("#sampleFilterHelp"),
  minPoints: $("#minPointsInput"),
  minRebounds: $("#minReboundsInput"),
  minAssists: $("#minAssistsInput"),
  minSteals: $("#minStealsInput"),
  minBlocks: $("#minBlocksInput"),
  maxTurnovers: $("#maxTurnoversInput"),
  rotationMin: $("#rotationMinInput"),
  rotationMax: $("#rotationMaxInput"),
  rotationMinutePlan: $("#rotationMinutePlanInput"),
  rotationFlexibility: $("#rotationFlexibilityInput"),
  rotationFlexibilityField: $("#rotationFlexibilityField"),
  rotationAllocationStyle: $("#rotationAllocationStyleInput"),
  rotationAllocationStyleField: $("#rotationAllocationStyleField"),
  rotationAllocationStyleHelp: $("#rotationAllocationStyleHelp"),
  rotationRateStability: $("#rotationRateStabilityInput"),
  rotationRateStabilityField: $("#rotationRateStabilityField"),
  rotationRateStabilityHelp: $("#rotationRateStabilityHelp"),
  rotationPositionProfile: $("#rotationPositionProfileInput"),
  projectionRiskLabel: $("#projectionRiskLabel"),
  projectionRisk: $("#projectionRiskInput"),
  projectionRiskHelp: $("#projectionRiskHelp"),
  roleBalance: $("#roleBalanceInput"),
  positionFlexibility: $("#positionFlexibilityInput"),
  rotationMinutePlanHelp: $("#rotationMinutePlanHelp"),
  results: $("#results"),
  resultContent: $("#resultContent"),
  resultsHeading: $("#resultsHeading"),
  resultSummary: $("#resultSummary"),
  resultActions: $("#results .results__actions"),
  emptyResult: $("#emptyResult"),
  emptyResultHeading: $("#emptyResult h2"),
  emptyResultCopy: $("#emptyResult p"),
  compareContent: $("#compareContent"),
  watchlistContent: $("#watchlistContent"),
  compareCount: $("#compareCount"),
  watchlistCount: $("#watchlistCount"),
  datasetStrip: $("#datasetStrip"),
  datasetName: $("#datasetName"),
  datasetSeason: $("#datasetSeason"),
  datasetTeam: $("#datasetTeam"),
  datasetCount: $("#datasetCount"),
  teamLogo: $("#datasetTeamLogo"),
  teamLogoFallback: $("#datasetTeamLogoFallback"),
  datasetMedia: $("#datasetMedia"),
  liveDataPanel: $("#liveDataPanel"),
  dataSource: $("#dataSourceInput"),
  liveTeam: $("#nbaTeamInput"),
  liveSeason: $("#nbaSeasonInput"),
  liveSeasonPhase: $("#nbaSeasonPhaseInput"),
  loadLiveData: $("#loadLiveDataButton"),
  liveDataStatus: $("#liveDataStatus"),
  importCsv: $("#importCsvButton"),
  resetDataset: $("#resetDatasetButton"),
  csvFile: $("#csvFileInput"),
  optimize: $("#optimizeButton"),
  cancelOptimize: $("#cancelOptimizeButton"),
  mobileOptimize: $("#mobileOptimizeButton"),
  mobileCancelOptimize: $("#mobileCancelOptimizeButton"),
  mobileSolveBar: $(".mobile-solve-bar"),
  mobileSolveLabel: $("#mobileSolveLabel"),
  resetScenario: $("#resetScenarioButton"),
  copyResult: $("#copyResultButton"),
  downloadResult: $("#downloadResultButton"),
  exportDataset: $("#exportDatasetButton"),
  downloadTemplate: $("#downloadTemplateButton"),
  downloadWatchlist: $("#downloadWatchlistButton"),
  solverStatus: $("#solverStatus"),
  optimizationProgress: $("#optimizationProgress"),
  searchScope: $("#searchScope"),
  searchScopeValue: $("#searchScopeValue"),
  resultFreshness: $("#resultFreshness"),
  runModeSummary: $("#runModeSummary"),
  runPresetSummary: $("#runPresetSummary"),
  runMinuteModelRow: $("#runMinuteModelRow"),
  runMinuteModelSummary: $("#runMinuteModelSummary"),
  runLockedSummary: $("#runLockedSummary"),
  runExcludedSummary: $("#runExcludedSummary"),
  toast: $("#toast"),
  watchlistTab: $("#watchlistTab"),
  opponentTeam: $("#opponentTeamInput"),
  loadOpponent: $("#loadOpponentButton"),
  opponentSwishIQ: $("#opponentSwishIQ"),
  opponentSwishIQStatus: $("#opponentSwishIQStatus"),
  opponentSwishIQSummary: $("#opponentSwishIQSummary"),
  weightsPanel: $("#weightsPanel"),
  weightValidation: $("#weightValidation"),
  weightShareSummary: $("#weightShareSummary"),
  analyticsPanel: $("#analyticsPanel"),
  analyticsView: $("#analyticsViewInput"),
  swishiqEvidenceModeField: $("#swishiqEvidenceModeField"),
  swishiqEvidenceMode: $("#swishiqEvidenceModeInput"),
  swishiqEvidenceModeHelp: $("#swishiqEvidenceModeHelp"),
  rotationScoringBasis: $("#rotationScoringBasisInput"),
  rotationScoringBasisField: $("#rotationScoringBasisField"),
  productionRulesLegend: $("#productionRulesLegend"),
  productionRulesHelp: $("#productionRulesHelp"),
  productionRules: $("#productionRules"),
  positionCoverageHelp: $("#positionCoverageHelp"),
  rotationMinutesHelp: $("#rotationMinutesHelp"),
  shareResult: $("#shareResultButton"),
  shareResultHelp: $("#shareResultHelp"),
  shareResultDisclosure: $("#shareResultDisclosure"),
  shareScenario: $("#shareScenarioButton"),
  printReport: $("#printReportButton"),
};

const decodedInitialScenario = decodeScenarioQuery(window.location.search);
let draftStorage;
try { draftStorage = window.localStorage; } catch { /* Storage can be unavailable in private browsing. */ }
const initialWorkflowDraft = decodedInitialScenario.scenario ? null : readWorkflowDraft(draftStorage);
let workflowView = null;

const state = {
  swishiqEvidence: null,
  swishIqPackage: null,
  swishIqProjectionStatus: "idle",
  dataset: null,
  datasetKind: null,
  dataSource: ALL_GAMES_SOURCE_VALUE,
  liveControlsGeneration: 0,
  lineupPhaseCoverageGeneration: 0,
  swishIqSeasonLineupCoverage: null,
  allGamesCompanionCoverage: null,
  // Team lists are fetched for the visible season/phase. A slow response
  // must not overwrite a newer selector request with an older roster.
  liveTeamOptionsGeneration: 0,
  experienceMode: decodedInitialScenario.scenario?.experience === "simple" ? "simple" : "detailed",
  // Simple mode deliberately replaces hidden advanced settings with a known,
  // safe baseline. Keep one in-memory snapshot so returning to Detailed does
  // not silently discard a visitor's custom work; it is never persisted or
  // shared because it is only a temporary view-switch convenience.
  detailedSettingsSnapshot: null,
  activePreset: "balanced",
  // Six visible skill families are the authoring layer. `weights` remains the
  // exact eight-metric solver contract and is regenerated whenever a family
  // control changes. Keeping both makes legacy shared links backward-compatible
  // without forcing fans to understand every box-score coefficient.
  familyWeights: { ...DEFAULT_FAMILY_PRESETS.balanced },
  weights: {},
  lockedIds: new Set(),
  excludedIds: new Set(),
  offensiveResponsibilities: {},
  compareIds: new Set(),
  watchlistIds: loadWatchlist(),
  watchlistSnapshots: loadWatchlistSnapshots(),
  playerSort: { key: "name", direction: "asc" },
  lastResult: null,
  lastResultFamilyWeights: null,
  lastOptimizerRequest: null,
  toastTimer: null,
  liveDataLoading: false,
  liveTeamOptions: [],
  loadedLiveSelection: null,
  opponentDataset: null,
  opponentStrategy: null,
  opponentWeightUndo: null,
  opponentLoading: false,
  playerMediaStatus: new Map(),
  teamLogoStatus: "unavailable",
  scenarioVersion: 0,
  optimizationWorker: null,
  optimizationReject: null,
  optimizationRunId: 0,
  activeOptimizationToken: null,
  searchScopeCanRun: false,
  rotationCandidateEstimate: null,
  recommendedMinGames: 20,
  preserveSharedMinGamesOnNextLoad: false,
  analyticsView: decodedInitialScenario.scenario?.analyticsView || "perGame",
  pendingScenario: decodedInitialScenario.scenario,
  pendingScenarioWarnings: decodedInitialScenario.warnings,
  replacementAnalyses: new Map(),
  replacementRunToken: null,
  replacementPlayerId: null,
  datasetLoadGeneration: 0,
};

function compactWatchlistPlayer(player, fallbackId = "") {
  if (!player || typeof player !== "object") return null;
  const id = String(player.id || fallbackId).trim();
  const name = String(player.name || "").trim();
  if (!id || !name) return null;

  const snapshot = {};
  for (const field of WATCHLIST_SNAPSHOT_FIELDS) {
    if (Object.hasOwn(player, field)) snapshot[field] = player[field];
  }
  snapshot.id = id;
  snapshot.name = name;
  snapshot.positions = Array.isArray(player.positions)
    ? [...new Set(player.positions.map(String).filter(Boolean))]
    : [];
  snapshot.headshotUrl = safeExternalImageUrl(player.headshotUrl);
  const context = player.watchlistContext;
  if (context && typeof context === "object" && !Array.isArray(context)) {
    snapshot.watchlistContext = {
      team: String(context.team || ""),
      season: String(context.season || ""),
      sourceLabel: String(context.sourceLabel || ""),
      savedAt: String(context.savedAt || ""),
    };
  }
  return snapshot;
}

function loadWatchlist() {
  try {
    const saved = JSON.parse(localStorage.getItem(WATCHLIST_KEY) || "[]");
    return new Set(Array.isArray(saved) ? saved.map(String) : []);
  } catch {
    return new Set();
  }
}

function loadWatchlistSnapshots() {
  try {
    const saved = JSON.parse(localStorage.getItem(WATCHLIST_SNAPSHOTS_KEY) || "{}");
    if (!saved || typeof saved !== "object" || Array.isArray(saved)) return new Map();
    return new Map(
      Object.entries(saved)
        .map(([id, player]) => [String(id), compactWatchlistPlayer(player, id)])
        .filter(([, player]) => Boolean(player)),
    );
  } catch {
    return new Map();
  }
}

function saveWatchlist() {
  try {
    localStorage.setItem(WATCHLIST_KEY, JSON.stringify([...state.watchlistIds].sort()));
    localStorage.setItem(
      WATCHLIST_SNAPSHOTS_KEY,
      JSON.stringify(Object.fromEntries([...state.watchlistSnapshots].sort(([left], [right]) => left.localeCompare(right)))),
    );
  } catch {
    showToast("The watchlist works for this visit, but this browser blocked local saving.");
  }
}

function rememberWatchlistPlayer(playerId) {
  const player = currentPlayer(playerId);
  if (!player || state.watchlistSnapshots.has(playerId)) return;
  const source = state.dataset?.source || {};
  const snapshot = compactWatchlistPlayer({
    ...player,
    watchlistContext: {
      team: player.team,
      season: source.season || "Custom season",
      sourceLabel: source.label || "Imported player pool",
      savedAt: new Date().toISOString(),
    },
  });
  if (snapshot) state.watchlistSnapshots.set(playerId, snapshot);
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("is-visible");
  window.clearTimeout(state.toastTimer);
  state.toastTimer = window.setTimeout(() => {
    elements.toast.classList.remove("is-visible");
  }, 3600);
}

function numberFromInput(input, fallback = 0) {
  const value = Number(input.value);
  return Number.isFinite(value) ? value : fallback;
}

function optionalNumber(input) {
  if (input.value.trim() === "") return undefined;
  const value = Number(input.value);
  return Number.isFinite(value) ? value : undefined;
}

// `Number(null)` and `Number("")` both equal zero. Benchmark evidence uses
// null to mean unavailable, so a bare Number.isFinite(Number(value)) would
// falsely render an evidence-free source as an index of 0 instead of saying
// that the benchmark cannot be calculated.
function hasFiniteNumber(value) {
  return value !== null
    && value !== undefined
    && value !== ""
    && Number.isFinite(Number(value));
}

function formatNumber(value, digits = 1) {
  // Unknown production is not measured zero. This same formatter feeds score
  // cards, alternative tables, and printed reports, so preserve that distinction
  // after the constraint layer deliberately returns null for an unsupported stat.
  if (!hasFiniteNumber(value)) return "—";
  const number = Number(value);
  if (!Number.isFinite(number)) return "-";
  return number.toFixed(digits).replace(/\.0$/, "");
}

/**
 * Format a whole-number rank with the correct English ordinal suffix. Percentile
 * copy appears in several different result views, so keeping this small helper
 * close to the other display formatters prevents labels such as "93th".
 */
function formatOrdinal(value) {
  const number = Math.round(Number(value));
  if (!Number.isFinite(number)) return "-";
  const lastTwoDigits = Math.abs(number) % 100;
  const lastDigit = Math.abs(number) % 10;
  const suffix = lastTwoDigits >= 11 && lastTwoDigits <= 13
    ? "th"
    : lastDigit === 1 ? "st" : lastDigit === 2 ? "nd" : lastDigit === 3 ? "rd" : "th";
  return `${number}${suffix}`;
}

function formatPercent(value) {
  const number = Number(value);
  return Number.isFinite(number) ? `${(number * 100).toFixed(1)}%` : "-";
}

function analyticsViewDetail(view = state.analyticsView) {
  return ANALYTICS_VIEW_DETAILS[view] || ANALYTICS_VIEW_DETAILS.perGame;
}

function analyticsRateViews(player) {
  // The pure fan-analysis module intentionally reads the optional analytics
  // envelope itself. That means CSV/course-demo players continue to work: the
  // per-game and per-36 views remain available while the richer views simply
  // say that their source context is unavailable.
  return derivePlayerRateViews(player);
}

function analyticsValue(player, metric, view = state.analyticsView) {
  const views = analyticsRateViews(player);
  if (view === "eraRelative") {
    return views.eraRelative?.values?.[metric]?.percentOfBaseline ?? null;
  }
  const rateKey = analyticsViewDetail(view).rateKey;
  return views[rateKey]?.values?.[metric] ?? null;
}

function analyticsMetricText(metric, value, view = state.analyticsView) {
  if (!Number.isFinite(Number(value))) return "–";
  if (view === "eraRelative") {
    const difference = Number(value) - 100;
    if (Math.abs(difference) < 0.05) return "At baseline";
    return `${difference > 0 ? "+" : "−"}${formatNumber(Math.abs(difference), 1)}% vs baseline`;
  }
  return metric.endsWith("Pct") ? formatPercent(value) : formatNumber(value);
}

function analyticsMetricShortLabel(metric, view = state.analyticsView) {
  const suffix = view === "perGame"
    ? ""
    : view === "per36"
      ? "/36"
      : view === "per100Estimated"
        ? "/100"
        : " vs base";
  const base = ({ points: "PTS", rebounds: "REB", assists: "AST", steals: "STL", blocks: "BLK", turnovers: "TOV" })[metric]
    || (METRIC_LABELS[metric] || titleCase(metric));
  return `${base}${suffix}`;
}

function formatSignedDifference(value, { percentagePoints = false } = {}) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "-";
  const display = percentagePoints ? number * 100 : number;
  const roundedMagnitude = Number(Math.abs(display).toFixed(1));
  const prefix = roundedMagnitude === 0 ? "±" : display > 0 ? "+" : "−";
  return `${prefix}${roundedMagnitude.toFixed(1)}${percentagePoints ? " pp" : ""}`;
}

function titleCase(value) {
  return String(value)
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^./, (character) => character.toUpperCase());
}

function createCardSearchLink(player) {
  // An internal search link is safer than attempting to fuzzy-match a player
  // directly to catalog records. It preserves the collector's intent while the
  // catalog remains the authority for whether cards are actually in stock.
  const link = document.createElement("a");
  link.className = "text-button card-search-link";
  link.href = `${CARD_SEARCH_PATH}?search=${encodeURIComponent(player?.name || "")}`;
  link.target = "_blank";
  link.rel = "noopener";
  link.textContent = "Find Cards";
  link.setAttribute("aria-label", `Find cards matching ${player?.name || "this player"} in the storefront (opens in a new tab)`);
  return link;
}

function safeExternalImageUrl(value) {
  // Media URLs are supplied by the verified database view. Restricting remote
  // values to the known Basketball Reference hosts prevents an imported value
  // from introducing mixed content, a scriptable URL, or an unrelated tracking
  // image into a shopper-facing image element. Public local assets are preferred
  // for mobile reliability and are limited to the two approved media folders.
  try {
    const raw = String(value ?? "").trim();
    const url = new URL(raw, import.meta.url);
    const localOrigin = new URL(import.meta.url).origin;
    if (url.origin === localOrigin && /^\/assets\/(?:player-headshots|nba-logos)\//i.test(url.pathname)) {
      return url.href;
    }
    return url.protocol === "https:" && TRUSTED_MEDIA_HOSTS.has(url.hostname)
      ? url.href
      : "";
  } catch {
    return "";
  }
}

function safeExternalSourceUrl(value) {
  try {
    const url = new URL(String(value ?? "").trim());
    return url.protocol === "https:" && TRUSTED_SOURCE_HOSTS.has(url.hostname)
      ? url.href
      : "";
  } catch {
    return "";
  }
}

function liveCacheKey(team, season, seasonPhase) {
  return `${NBA_CACHE_PREFIX}:${season}:${seasonPhase}:${team}`;
}

function pruneLiveDatasetCache(preserveKey = "") {
  return pruneLineupLabDatasetCache(localStorage, {
    activePrefix: `${NBA_CACHE_PREFIX}:`,
    maxEntries: NBA_CACHE_MAX_ENTRIES,
    preserveKey,
  });
}

function beginDatasetLoadIntent() {
  state.datasetLoadGeneration += 1;
  return state.datasetLoadGeneration;
}

function datasetLoadIsCurrent(generation) {
  return generation === state.datasetLoadGeneration;
}

function invalidateDatasetLoad() {
  const generation = beginDatasetLoadIntent();
  // A selector/model change can happen while an exact package or projection
  // request is in flight. Release the visible loading lock so the next
  // explicit load can start; stale responses remain blocked by the generation.
  if (state.liveDataLoading) setLiveDataLoading(false);
  return generation;
}

function beginNonLiveDatasetLoad() {
  const generation = invalidateDatasetLoad();
  state.liveTeamOptionsGeneration += 1;
  // A demo or CSV load can supersede an in-flight native Impact request. Its
  // stale completion is intentionally ignored, so clear the loading state here
  // and refresh the preflight instead of leaving the workflow disabled.
  if (state.swishIqProjectionStatus === "loading") {
    state.swishIqProjectionStatus = "idle";
    if ($("#modelModeInput")?.value === "swishiq-impact") {
      syncSwishIqAvailabilityStatus();
      updateRunSummary();
      workflowView?.refresh();
    }
  }
  return generation;
}

function setLiveDataStatus(message, tone = "") {
  elements.liveDataStatus.textContent = message;
  if (tone) elements.liveDataStatus.dataset.tone = tone;
  else delete elements.liveDataStatus.dataset.tone;
}

function normalizeRetiredImportedSource({ clearSelections = false } = {}) {
  if (elements.dataSource?.value !== IMPORTED_SOURCE_VALUE) return false;
  elements.dataSource.value = ALL_GAMES_SOURCE_VALUE;
  state.dataSource = ALL_GAMES_SOURCE_VALUE;
  if (clearSelections) {
    elements.liveTeam.replaceChildren();
    elements.liveSeason.replaceChildren();
    state.liveTeamOptions = [];
  }
  return true;
}

function setSolverStatus(message, tone = "") {
  elements.solverStatus.textContent = message;
  if (tone) elements.solverStatus.dataset.tone = tone;
  else delete elements.solverStatus.dataset.tone;
}

function motionBehavior() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    ? "auto"
    : "smooth";
}

function chooseCount(total, selected) {
  if (selected < 0 || selected > total) return 0;
  const smaller = Math.min(selected, total - selected);
  let result = 1;
  for (let index = 1; index <= smaller; index += 1) {
    result = (result * (total - smaller + index)) / index;
  }
  return Math.round(result);
}

function setSearchScope(text, tone, canRun) {
  state.searchScopeCanRun = canRun;
  elements.searchScopeValue.textContent = text;
  elements.searchScope.dataset.tone = tone;
  // The fixed mobile bar replaces the desktop run card at narrow widths. Its
  // title preserves the full structural explanation even when the short plan
  // label is hidden to make room for the solve button.
  elements.mobileSolveLabel.title = text;
  elements.mobileOptimize.title = canRun ? "Run the optimizer" : text;
  if (state.activeOptimizationToken === null) setOptimizeButtons();
  if (!canRun && state.activeOptimizationToken === null && !state.lastResult) {
    setSolverStatus("Not ready to solve", "warning");
  }
}

function hasPositiveObjectiveWeight() {
  return Object.values(state.weights).some((weight) => Number(weight) > 0);
}

let localPlayerMetadataPromise;

function loadLocalPlayerMetadata() {
  if (!localPlayerMetadataPromise) {
    localPlayerMetadataPromise = loadSwishIqPlayerMetadata().catch(() => new Map());
  }
  return localPlayerMetadataPromise;
}

function syncWeightValidation() {
  // Historical priorities are not part of the primary SwishIQ objective. An
  // all-zero, hidden Historical panel must not veto a valid SwishIQ request.
  const valid = $("#modelModeInput").value === "swishiq-impact" || hasPositiveObjectiveWeight();
  const wasInvalid = elements.weightsPanel.dataset.validation === "error";
  elements.weightsPanel.dataset.validation = valid ? "valid" : "error";
  elements.weightValidation.hidden = valid;
  // Opening the panel only on the transition to an invalid state makes the
  // corrective control visible without repeatedly fighting a user's choice to
  // collapse the disclosure.
  if (!valid && !wasInvalid) elements.weightsPanel.open = true;
  return valid;
}

function updateSearchScope() {
  // This intentionally mirrors the optimizer's cheap structural checks in the
  // form. It gives a collector an immediate explanation and avoids starting a
  // worker just to rediscover an impossible roster size or minute total.
  state.rotationCandidateEstimate = null;
  const validationInputs = [elements.size, elements.rotationMin, elements.rotationMax];
  validationInputs.forEach((input) => input.setCustomValidity(""));

  if (!state.dataset) {
    setSearchScope("Loading team-season data…", "neutral", false);
    return;
  }

  if (state.dataset?.source?.sourceMode === "canonical-v4-required"
    && state.dataset?.source?.modelExecutionAllowed === false) {
    setSearchScope("Verified V4 All Games rows are descriptive only. Lineup optimization is unavailable until exact V4 lineup inputs and a model-specific predictive-validation receipt are configured.", "warning", false);
    return;
  }

  const publicAvailability = $("#modelModeInput").value === "swishiq-impact"
    ? swishIqAvailabilityForSelection()
    : null;
  if ($("#modelModeInput").value === "swishiq-impact" && (!state.swishiqEvidence || !state.swishIqPackage || !publicAvailability?.available || !canOptimizeCurrentDataset())) {
    const message = state.swishIqProjectionStatus === "loading"
      ? "Loading SwishIQ Impact for this team-season…"
      : "SwishIQ Impact is unavailable for this team-season. Choose another season or switch to Historical. No other season is substituted.";
    setSearchScope(message, "warning", false);
    return;
  }

  if (!syncWeightValidation()) {
    setSearchScope("Set at least one strategy weight above zero before optimizing.", "error", false);
    return;
  }

  if ($("#modelModeInput").value === "swishiq-impact") {
    try { resolveSwishIQObjectiveWeights(swishiqWeightsFromControls(), $("#swishiqObjectiveInput").value); }
    catch (error) { setSearchScope(error.message, "error", false); return; }
  }

  const structuralInputs = [
    elements.size,
    elements.minGuards,
    elements.minForwards,
    elements.minCenters,
    elements.minGames,
    elements.minMinutes,
    elements.rotationMin,
    elements.rotationMax,
  ];
  const invalidInput = structuralInputs.find((input) => !input.closest("[hidden]") && !input.validity.valid);
  if (invalidInput) {
    setSearchScope("Check the highlighted scenario value before optimizing.", "error", false);
    return;
  }

  const size = numberFromInput(elements.size, 0);
  const positionSlots = [elements.minGuards, elements.minForwards, elements.minCenters]
    .reduce((total, input) => total + numberFromInput(input, 0), 0);
  if (positionSlots > size) {
    const message = `Position slots require ${positionSlots} players, more than this ${size}-player group allows.`;
    elements.size.setCustomValidity(message);
    setSearchScope(message, "error", false);
    return;
  }

  if (elements.mode.value === "rotation") {
    const minimum = numberFromInput(elements.rotationMin, 0);
    const maximum = numberFromInput(elements.rotationMax, 0);
    if (minimum > maximum) {
      const message = "Rotation maximum minutes must be at least the minimum.";
      elements.rotationMax.setCustomValidity(message);
      setSearchScope(message, "error", false);
      return;
    }
    if (minimum * size > 240 || maximum * size < 240) {
      const message = `A ${size}-player rotation with ${minimum}–${maximum} minutes per player cannot total exactly 240.`;
      elements.rotationMax.setCustomValidity(message);
      setSearchScope(message, "error", false);
      return;
    }
  }

  const eligiblePlayers = state.dataset.players.filter(isPlayerEligible);
  const eligibleById = new Map(eligiblePlayers.map((player) => [player.id, player]));
  const lockedIds = [...state.lockedIds];
  const invalidLocked = lockedIds.find((id) => state.excludedIds.has(id) || !eligibleById.has(id));
  if (invalidLocked) {
    setSearchScope("A locked player is excluded or below the current sample filters.", "error", false);
    return;
  }
  if (lockedIds.length > size) {
    setSearchScope(`${lockedIds.length} locked players cannot fit in a ${size}-player group.`, "error", false);
    return;
  }

  const availablePlayers = eligiblePlayers.filter(
    (player) => !state.excludedIds.has(player.id) && !state.lockedIds.has(player.id),
  );
  const slotsToChoose = size - lockedIds.length;
  if (availablePlayers.length < slotsToChoose) {
    setSearchScope(`Only ${availablePlayers.length} eligible unlocked players remain for ${slotsToChoose} open spots.`, "error", false);
    return;
  }

  const estimatedCombinations = chooseCount(availablePlayers.length, slotsToChoose);
  const groupLabel = estimatedCombinations === 1 ? "possible group" : "possible groups";
  if (elements.mode.value === "rotation") {
    state.rotationCandidateEstimate = estimatedCombinations;
    const confirmationNote = estimatedCombinations >= ROTATION_SEARCH_CONFIRMATION_CANDIDATE_THRESHOLD
      ? " A confirmation is required before this unusually large search starts."
      : "";
    setSearchScope(
      `${estimatedCombinations.toLocaleString()} ${groupLabel} · no candidate-count cap; every group will be checked in the background. Larger pools can take longer.${confirmationNote}`,
      "success",
      true,
    );
    return;
  }
  if (estimatedCombinations > DEFAULT_MAX_EXACT_COMBINATIONS) {
    setSearchScope(
      `${estimatedCombinations.toLocaleString()} ${groupLabel} exceed the ${DEFAULT_MAX_EXACT_COMBINATIONS.toLocaleString()} browser-safe lineup limit. Narrow the eligible roster.`,
      "warning",
      false,
    );
    return;
  }
  setSearchScope(`${estimatedCombinations.toLocaleString()} ${groupLabel} · every group will be checked.`, "success", true);
}

function setOptimizeButtons({ disabled = false, label } = {}) {
  // Once a visitor changes the live selector, the data table still represents
  // the previously loaded team-season. Never let an exact search silently run
  // against that old pool while the controls describe a new one.
  const datasetMatchesSelection = canOptimizeCurrentDataset();
  for (const button of [elements.optimize, elements.mobileOptimize]) {
    button.disabled = disabled || !state.searchScopeCanRun || !datasetMatchesSelection;
    if (label) button.textContent = label;
  }
}

function setOptimizationCancellationAvailable(available) {
  for (const button of [elements.cancelOptimize, elements.mobileCancelOptimize]) {
    button.hidden = !available;
    button.disabled = !available;
  }
  if (!available) {
    elements.optimizationProgress.hidden = true;
    elements.optimizationProgress.textContent = "";
  }
}

function setOptimizationProgress(message = "") {
  elements.optimizationProgress.textContent = message;
  elements.optimizationProgress.hidden = !message;
}

function confirmLargeRotationSearch() {
  if (elements.mode.value !== "rotation") return true;
  const estimatedCombinations = Number(state.rotationCandidateEstimate);
  if (
    !Number.isFinite(estimatedCombinations)
    || estimatedCombinations < ROTATION_SEARCH_CONFIRMATION_CANDIDATE_THRESHOLD
  ) {
    return true;
  }
  const confirmed = window.confirm(
    `This rotation search will evaluate ${estimatedCombinations.toLocaleString()} candidate groups. It can take a while, and you can cancel it after it starts. Continue?`,
  );
  if (!confirmed) {
    setSolverStatus("Large rotation search was not started", "warning");
    showToast("Large rotation search cancelled before it started. Your settings were kept.");
  }
  return confirmed;
}

function cancelCurrentOptimization() {
  if (state.activeOptimizationToken === null) return;
  cancelOptimization("Optimization cancelled by you.");
  setOptimizeButtons({ disabled: false, label: solveActionLabel({ update: Boolean(state.lastResult) }) });
  setSolverStatus("Search cancelled", "warning");
  showToast("Search cancelled. Your settings were kept.");
}

function formatRotationSearchProgress(progress = {}) {
  const estimated = Number(progress.estimatedCombinations);
  const total = Number.isFinite(estimated) && estimated > 0
    ? Math.trunc(estimated)
    : Number(state.rotationCandidateEstimate) || 0;
  const evaluated = Math.max(0, Math.trunc(Number(progress.combinationsEvaluated) || 0));
  const feasible = Math.max(0, Math.trunc(Number(progress.feasibleCombinations) || 0));
  const checked = total > 0 ? Math.min(evaluated, total) : evaluated;
  const plural = (count, singular) => `${count.toLocaleString()} ${singular}${count === 1 ? "" : "s"}`;

  if (progress.phase === "proving-constraints") {
    const contenders = Math.max(0, Math.trunc(Number(progress.unresolvedCandidates) || 0));
    return `Checking minute limits for up to ${plural(contenders, "group")}; ${plural(feasible, "eligible group")} so far. You can cancel.`;
  }
  if (progress.phase === "complete") {
    return `Finalizing the rotation result from ${plural(feasible, "eligible group")}.`;
  }
  const percent = total > 0 ? ` (${Math.floor((checked / total) * 100)}%)` : "";
  return `Checked ${checked.toLocaleString()} of ${plural(total, "candidate group")}${percent}; ${plural(feasible, "eligible group")} so far. Search is still running — you can cancel.`;
}

function selectionFromControls() {
  return {
    team: elements.liveTeam.value,
    season: Number(elements.liveSeason.value),
    seasonPhase: elements.liveSeasonPhase.value,
    source: canonicalSourceKind(elements.dataSource?.value),
  };
}

function liveDatasetMatchesControls() {
  return Boolean(
    state.loadedLiveSelection
    && liveSelectionMatches(state.loadedLiveSelection, selectionFromControls()),
  );
}

function isCanonicalV4NativeImpactLoaded() {
  return state.swishiqEvidence?.format === CANONICAL_V4_IMPACT_LINEUP_EVIDENCE_FORMAT
    && state.swishIqPackage?.kind === "canonical-v4-impact-native-companion";
}

function swishIqDatasetSourceMatchesEvidence() {
  return isCanonicalV4NativeImpactLoaded()
    ? state.dataset?.source?.kind === ALL_GAMES_PACKAGE_SOURCE_KIND
    : state.dataset?.source?.kind === SWISHIQ_V3_PACKAGE_SOURCE_KIND;
}

function swishIqAvailabilityForSelection(selection = selectionFromControls()) {
  if (isCanonicalV4NativeImpactLoaded()) {
    return canonicalV4ImpactLineupAvailability({
      selection,
      dataset: state.dataset,
      evidence: state.swishiqEvidence,
      package: state.swishIqPackage,
    });
  }
  return publicSwishIqImpactAvailability({
    package: state.swishIqPackage,
    dataset: state.dataset,
    evidence: state.swishiqEvidence,
  }, selection);
}

function swishIqImpactRosterCoverage() {
  const players = state.dataset?.players;
  const impactPlayers = state.swishiqEvidence?.players;
  if (!Array.isArray(players) || !impactPlayers || typeof impactPlayers !== "object") return null;
  const supportedPlayerIds = new Set(players
    .filter((player) => Object.hasOwn(impactPlayers, player.id))
    .map((player) => player.id));
  return {
    boxScorePlayerCount: players.length,
    supportedPlayerCount: supportedPlayerIds.size,
    unresolvedPlayerIds: players.filter((player) => !supportedPlayerIds.has(player.id)).map((player) => player.id),
  };
}

function syncSwishIqAvailabilityStatus() {
  if ($("#modelModeInput").value !== "swishiq-impact") return;
  const status = $("#swishiqEvidenceStatus");
  if (!status) return;
  const selection = selectionFromControls();
  const availability = swishIqAvailabilityForSelection();
  status.hidden = false;
  const rosterCoverage = state.swishIqProjectionStatus === "ready" && availability.available
    ? swishIqImpactRosterCoverage()
    : null;
  const coverageDisclosure = rosterCoverage
    ? rosterCoverage.unresolvedPlayerIds.length
      ? ` Impact data are available for ${rosterCoverage.supportedPlayerCount} of ${rosterCoverage.boxScorePlayerCount} players. The remaining players keep their box-score stats, but no Impact values are inferred for them.`
      : ` Impact data are available for all ${rosterCoverage.boxScorePlayerCount} players.`
    : "";
  status.textContent = state.swishIqProjectionStatus === "loading"
    ? "Loading SwishIQ Impact for the selected team-season…"
    : state.swishIqProjectionStatus === "ready" && availability.available
      ? isCanonicalV4NativeImpactLoaded()
        ? `Native V4 Impact is available for the ${nbaSeasonLabel(selection.season)} regular-season roster. It uses mean-only historical conditional-lineup estimates; player uncertainty and counterfactual optimizer validation are not claimed.${coverageDisclosure}`
        : `SwishIQ Impact is available for the ${nbaSeasonLabel(selection.season)} ${selection.seasonPhase.replaceAll("_", " ")} roster.${coverageDisclosure}`
      : !selection.team || !selection.season || !selection.seasonPhase
        ? "Choose a team, season, and phase to use SwishIQ Impact."
        : "SwishIQ Impact is unavailable for this team-season. Choose another season or switch to Historical. No other season is substituted.";
}

function canOptimizeCurrentDataset() {
  if (state.dataset?.source?.sourceMode === "canonical-v4-required"
    || state.dataset?.source?.modelExecutionAllowed === false) return false;
  // CSV and course-project data do not have a live selector source, so they
  // remain perfectly valid local optimizer inputs. A loaded historical roster
  // must always match the visible team, season, and phase controls.
  if ($("#modelModeInput").value === "swishiq-impact") {
    const publicAvailability = swishIqAvailabilityForSelection();
    return Boolean(
      state.swishIqProjectionStatus === "ready"
      && state.swishiqEvidence
      && state.swishIqPackage
      && swishIqDatasetSourceMatchesEvidence()
      && publicAvailability.available
      && liveDatasetMatchesControls(),
    );
  }
  return !state.loadedLiveSelection || liveDatasetMatchesControls();
}

function canShareCurrentScenario() {
  // A URL can reproduce only a fresh exact result based on a concrete,
  // source-backed team-season. This prevents a CSV/demo result—or a result
  // from a previously selected team—from being mislabeled as a shareable
  // scenario.
  return Boolean(
    state.lastResult?.ok
    && elements.resultFreshness.hidden
    && state.loadedLiveSelection
    && liveDatasetMatchesControls(),
  );
}

function syncShareScenarioAvailability() {
  const available = canShareCurrentScenario();
  elements.shareScenario.disabled = !available;
  elements.shareScenario.title = available
    ? "Copy a link that reloads this team-season and reruns the search"
    : state.loadedLiveSelection && !liveDatasetMatchesControls()
      ? "Load the selected team-season and run a fresh result before sharing"
    : "Share links require a current team-season result";
  syncPublicResultShareAvailability();
}

function currentPublicResultShareSummary() {
  if (!canShareCurrentScenario()) return null;
  if (isCanonicalV4LineupSourceSelected()) {
    const error = new Error("A selected V4 source cannot be shared through the V3 result summary.");
    error.code = "v4-lineup-v3-share-fallback-blocked";
    throw error;
  }
  const scenario = resultScenarioFor(buildOptimizerConfig(), optimizerPlayersForCurrentScenario());
  return buildLineupLabPublicResultSummary({
    result: state.lastResult,
    source: state.dataset?.source,
    scenario,
  });
}

function isCanonicalV4LineupSourceSelected() {
  return CANONICAL_V4_STUDIO_RUNTIME_RELEASE_PIN?.status !== "unconfigured"
    || state.dataset?.source?.sourceMode === "canonical-v4-required";
}

async function currentVerifiedPublicResultShareSummary() {
  if (!isCanonicalV4LineupSourceSelected()) return currentPublicResultShareSummary();
  if (!canShareCurrentScenario()) {
    const error = new Error("A completed V4 Lineup Lab result is unavailable; descriptive rows do not enable model sharing.");
    error.code = "v4-lineup-model-result-unavailable";
    throw error;
  }
  const scenario = resultScenarioFor(buildOptimizerConfig(), optimizerPlayersForCurrentScenario());
  return buildVerifiedLineupLabV4PublicResultSummary({
    result: state.lastResult,
    source: state.dataset?.source,
    scenario,
    releasePin: CANONICAL_V4_STUDIO_RUNTIME_RELEASE_PIN,
  });
}

function selectedPublicShareMethod() {
  if (typeof navigator.share === "function") return "native";
  if (typeof navigator.clipboard?.writeText === "function") return "clipboard";
  return "";
}

function syncPublicResultShareAvailability() {
  if (isCanonicalV4LineupSourceSelected()) {
    elements.shareResult.disabled = true;
    elements.shareResult.title = "V4 sharing requires a validated and approved V4 model result.";
    elements.shareResultHelp.textContent = "Historical lineup optimization is available for verified season stats. Publishing a validated V4 model result requires a separate approval.";
    elements.shareResultHelp.hidden = false;
    elements.shareResultDisclosure.textContent = "V4 result sharing is unavailable until exact V4 inputs, model validation, and production approval are verified. No V3 result or link will be used after V4 selection.";
    return;
  }
  let summary = null;
  try {
    summary = currentPublicResultShareSummary();
  } catch {
    // A completed-but-unproven Result Passport is intentionally not shareable.
  }
  const method = selectedPublicShareMethod();
  const shareReady = Boolean(summary && method && isSignedPublicResultShareAvailable({
    windowRef: window,
    shareMethod: method,
  }));
  elements.shareResult.disabled = !shareReady;
  if (!summary) {
    elements.shareResult.title = "Run a complete team-season search before sharing.";
    elements.shareResultHelp.textContent = "A complete search for the selected team-season is required before sharing.";
    elements.shareResultHelp.hidden = !state.lastResult?.ok;
    elements.shareResultDisclosure.textContent = "Result sharing is unavailable for this setup. No link has been created.";
    return;
  }
  if (!method) {
    elements.shareResult.title = "This browser has no supported share or clipboard action.";
    elements.shareResultHelp.textContent = "This browser cannot open a share sheet or copy a link.";
    elements.shareResultHelp.hidden = false;
    elements.shareResultDisclosure.textContent = "This browser cannot share or copy a link. No link has been created.";
    return;
  }
  if (!shareReady) {
    elements.shareResult.title = "Result sharing is unavailable right now.";
    elements.shareResultHelp.textContent = "The result summary is ready, but it cannot be shared right now. No link has been created.";
    elements.shareResultHelp.hidden = false;
    elements.shareResultDisclosure.textContent = "Only aggregate fields are included in shared summaries. Player and roster selections are omitted. A shared summary does not rerun the model or independently check the result. No link has been created.";
    return;
  }
  elements.shareResult.title = "Share a summary with aggregate result details.";
  elements.shareResultDisclosure.textContent = "Only aggregate fields are included. Player and roster selections are omitted. The summary does not rerun the model or independently check the result.";
  elements.shareResultHelp.hidden = true;
}

function setInputValueIfPresent(input, value) {
  if (value === undefined || value === null || value === "") return;
  input.value = String(value);
}

function applySharedScenarioControls(scenario) {
  if (!scenario) return;

  // A shared link is an input snapshot, not a result. Apply only values the
  // codec already validated, then let the normal form and exact-scope checks
  // perform the final structural validation against the loaded player pool.
  if (isAllGamesSourceValue(scenario.source) && elements.dataSource) {
    elements.dataSource.value = ALL_GAMES_SOURCE_VALUE;
    state.dataSource = ALL_GAMES_SOURCE_VALUE;
  } else if (scenario.source === IMPORTED_SOURCE_VALUE && elements.dataSource) {
    state.pendingScenarioWarnings.push(RETIRED_IMPORTED_SOURCE_MESSAGE);
    elements.dataSource.value = ALL_GAMES_SOURCE_VALUE;
    state.dataSource = ALL_GAMES_SOURCE_VALUE;
  }
  if (["simple", "detailed"].includes(scenario.experience)) {
    setExperienceMode(scenario.experience, { applyDefaults: false });
  }
  const mode = scenario.mode === "rotation" ? "rotation" : "lineup";
  elements.mode.value = mode;
  setMode(mode);

  const requestedSize = Number(scenario.size);
  if (Number.isInteger(requestedSize)) {
    if (mode === "lineup" && requestedSize !== 5) {
      state.pendingScenarioWarnings.push("A five-player lineup always uses five players, so the shared lineup size was reset to 5.");
      elements.size.value = "5";
    } else if (mode === "rotation" && requestedSize >= 8 && requestedSize <= 12) {
      elements.size.value = String(requestedSize);
    } else if (mode === "rotation") {
      state.pendingScenarioWarnings.push("The shared rotation size was outside Lineup Lab's 8–12 player range and was reset to 9.");
      elements.size.value = "9";
    }
  }

  setInputValueIfPresent(elements.alternatives, scenario.alternatives);
  const sharedMinGamesIsExplicit = Object.prototype.hasOwnProperty.call(scenario, "minGames");
  setInputValueIfPresent(elements.minGames, scenario.minGames);
  // The playoff loader normally replaces the untouched 20-game regular-season
  // default with 3. A share link that explicitly says 20 is not untouched, so
  // preserve it through the first matching dataset load.
  state.preserveSharedMinGamesOnNextLoad = sharedMinGamesIsExplicit;
  setInputValueIfPresent(elements.minMinutes, scenario.minMinutes);
  setInputValueIfPresent(elements.rotationMin, scenario.rotationMin);
  setInputValueIfPresent(elements.rotationMax, scenario.rotationMax);
  // Production thresholds were retired from the fan workflow. Clear values
  // from older drafts or shared links so they cannot reactivate that path.
  [elements.minPoints, elements.minRebounds, elements.minAssists, elements.minSteals,
    elements.minBlocks, elements.maxTurnovers].forEach(input => { if (input) input.value = ""; });

  const positions = scenario.positionMinimums || {};
  setInputValueIfPresent(elements.minGuards, positions.G);
  setInputValueIfPresent(elements.minForwards, positions.F);
  setInputValueIfPresent(elements.minCenters, positions.C);

  if (["historical", "swishiq-impact"].includes(scenario.modelMode)) {
    // The V3 player-season part supplies the Historical roster. SwishIQ Impact
    // is a separate exact-season proof and never replaces those official totals.
    $("#modelModeInput").value = scenario.modelMode;
  }
  if (scenario.swishiqEvidenceMode === "exact") elements.swishiqEvidenceMode.value = "exact";
  if (["balanced", "offense", "defense", "custom"].includes(scenario.swishiqObjective)) $("#swishiqObjectiveInput").value = scenario.swishiqObjective;
  if (scenario.swishiqObjectiveWeights) {
    $("#swishiqObjectiveInput").value = "custom";
    setInputValueIfPresent($("#swishiqOffenseWeightInput"), scenario.swishiqObjectiveWeights.offense);
    setInputValueIfPresent($("#swishiqDefenseWeightInput"), scenario.swishiqObjectiveWeights.defense);
  }
  syncModelChoice();
  // Legacy production values are intentionally ignored.

  const requestedPreset = scenario.preset;
  const sharedWeights = scenario.weights && typeof scenario.weights === "object"
    ? scenario.weights
    : {};
  if (requestedPreset && requestedPreset !== "custom") {
    applyPreset(requestedPreset, { invalidate: false });
  }
  if (requestedPreset === "custom" || Object.keys(sharedWeights).length > 0) {
    // The query stores non-zero weights only. Start from zeros so a custom
    // share link cannot inherit a stray slider value from a browser session.
    state.weights = Object.fromEntries(Object.keys(METRIC_LABELS).map((metric) => [metric, 0]));
    for (const [metric, value] of Object.entries(sharedWeights)) {
      if (Object.prototype.hasOwnProperty.call(state.weights, metric)) state.weights[metric] = Number(value);
    }
    state.familyWeights = skillFamiliesFromMetricWeights(state.weights);
    state.activePreset = requestedPreset && requestedPreset !== "custom" ? requestedPreset : "custom";
  }
  renderPresetState();
  renderWeightControls();

  if (ANALYTICS_VIEW_DETAILS[scenario.analyticsView]) {
    state.analyticsView = scenario.analyticsView;
  }
  elements.analyticsView.value = state.analyticsView;
  if (["per36", "perGame"].includes(scenario.rotationScoreBasis)) {
    elements.rotationScoringBasis.value = scenario.rotationScoreBasis;
  }
  if (scenario.rotationMinutePlan === "historicalAware") {
    state.pendingScenarioWarnings.push(
      "This older link requested a recorded-workload rule. Lineup Lab now treats past team usage as context only, so the rotation was restored in game-plan mode.",
    );
  }
  elements.rotationMinutePlan.value = LINEUP_LAB_ROTATION_MINUTE_PLAN;
  if (["preserveWorkload", "strategyFirst"].includes(scenario.rotationHistoricalAllocationStyle)) {
    elements.rotationAllocationStyle.value = scenario.rotationHistoricalAllocationStyle;
  }
  setInputValueIfPresent(elements.rotationFlexibility, scenario.rotationMinuteFlexibility);
  if (["sampleAdjusted", "raw"].includes(scenario.rotationRateStability)) {
    elements.rotationRateStability.value = scenario.rotationRateStability;
  }
  if (["reliable", "balanced", "upside"].includes(scenario.projectionRisk)) {
    elements.projectionRisk.value = scenario.projectionRisk;
  }
  if (["off", "recommended", "emphasized"].includes(scenario.roleBalance)) {
    elements.roleBalance.value = scenario.roleBalance;
  }
  if (scenario.rotationScoreBasis === "perGame" && scenario.rotationRateStability === "sampleAdjusted") {
    state.pendingScenarioWarnings.push("Per-game rotation scoring uses per-game rates, so sample adjustment was disabled.");
  }
  if (["automatic", "traditional", "small", "big"].includes(scenario.rotationPositionProfile)) {
    elements.rotationPositionProfile.value = scenario.rotationPositionProfile;
  } else if (scenario.rotationPositionMinuteRequirements) {
    elements.rotationPositionProfile.value = rotationPositionProfileForRequirements(
      scenario.rotationPositionMinuteRequirements,
    );
  }
  if (["recommended", "open", "seasonOnly"].includes(scenario.positionFlexibility)) {
    elements.positionFlexibility.value = scenario.positionFlexibility;
  }
  syncRotationModelControls();
  syncRotationRoleCopy(mode === "rotation");
  updateRunSummary();
}

function applyPendingScenarioPlayerSelections(dataset) {
  const scenario = state.pendingScenario;
  if (!scenario) return;

  const availableIds = new Set(dataset.players.map((player) => player.id));
  state.offensiveResponsibilities = Object.fromEntries(Object.entries(scenario.offensiveResponsibilities || {})
    .filter(([id]) => availableIds.has(id)));
  const requestedLocks = Array.isArray(scenario.lockedIds) ? scenario.lockedIds : [];
  const requestedExclusions = Array.isArray(scenario.excludedIds) ? scenario.excludedIds : [];
  const ignoredLocks = requestedLocks.filter((id) => !availableIds.has(id));
  const ignoredExclusions = requestedExclusions.filter((id) => !availableIds.has(id));

  state.lockedIds = new Set(requestedLocks.filter((id) => availableIds.has(id)));
  // A lock wins over an exclusion because a player cannot be required and
  // forbidden in the same exact request. The UI exposes that same mutual
  // exclusion behavior when a visitor clicks its checkboxes.
  state.excludedIds = new Set(
    requestedExclusions.filter((id) => availableIds.has(id) && !state.lockedIds.has(id)),
  );
  if (ignoredLocks.length) {
    state.pendingScenarioWarnings.push(`${ignoredLocks.length} locked player${ignoredLocks.length === 1 ? " was" : "s were"} not in this team-season and could not be applied.`);
  }
  if (ignoredExclusions.length) {
    state.pendingScenarioWarnings.push(`${ignoredExclusions.length} excluded player${ignoredExclusions.length === 1 ? " was" : "s were"} not in this team-season and could not be applied.`);
  }
  state.pendingScenario = null;
}

function sharedScenarioFromControls() {
  // Serialize the same live selection that produced the visible result—not a
  // newly chosen but still-unloaded roster. The caller guards this too, so a
  // programmatic invocation cannot create a misleading link.
  if (!liveDatasetMatchesControls()) return null;
  const loadedSelection = state.loadedLiveSelection;
  return {
    experience: state.experienceMode,
    modelMode: $("#modelModeInput").value,
    swishiqEvidenceMode: $("#modelModeInput").value === "swishiq-impact" ? "exact" : "historical",
    swishiqObjective: $("#modelModeInput").value === "swishiq-impact" ? $("#swishiqObjectiveInput").value : "balanced",
    swishiqObjectiveWeights: swishiqWeightsFromControls(),
    team: loadedSelection.team,
    season: Number(loadedSelection.season),
    phase: loadedSelection.seasonPhase,
    source: canonicalSourceValue(loadedSelection.source),
    mode: elements.mode.value,
    size: numberFromInput(elements.size, 5),
    alternatives: numberFromInput(elements.alternatives, 5),
    preset: state.activePreset,
    weights: state.weights,
    minGames: numberFromInput(elements.minGames, 0),
    minMinutes: numberFromInput(elements.minMinutes, 0),
    positionMinimums: {
      G: numberFromInput(elements.minGuards, 0),
      F: numberFromInput(elements.minForwards, 0),
      C: numberFromInput(elements.minCenters, 0),
    },
    rotationMin: numberFromInput(elements.rotationMin, 8),
    rotationMax: numberFromInput(elements.rotationMax, 40),
    analyticsView: state.analyticsView,
    rotationScoreBasis: elements.rotationScoringBasis.value,
    rotationMinutePlan: elements.rotationMinutePlan.value,
    rotationHistoricalAllocationStyle: elements.rotationAllocationStyle.value,
    rotationMinuteFlexibility: numberFromInput(elements.rotationFlexibility, 8),
    rotationRateStability: elements.rotationRateStability.value,
    projectionRisk: elements.projectionRisk.value,
    roleBalance: elements.roleBalance.value,
    rotationPositionProfile: elements.rotationPositionProfile.value,
    rotationPositionMinuteRequirements: selectedRotationPositionRequirements(),
    positionFlexibility: elements.positionFlexibility.value,
    lockedIds: [...state.lockedIds].sort(),
    excludedIds: [...state.excludedIds].sort(),
    offensiveResponsibilities: state.experienceMode === "detailed" ? { ...state.offensiveResponsibilities } : {},
  };
}

async function copyScenarioLink() {
  if (!canShareCurrentScenario()) {
    showToast("Load the selected team-season and run a fresh result before sharing it.");
    return;
  }
  try {
    const scenario = sharedScenarioFromControls();
    if (!scenario) throw new Error("The displayed result no longer matches the selected team-season.");
    const query = encodeScenarioQuery(scenario);
    const link = new URL(window.location.href);
    link.search = query;
    link.hash = "workspace";
    const text = link.href;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const input = document.createElement("textarea");
      input.value = text;
      input.style.position = "fixed";
      input.style.opacity = "0";
      document.body.append(input);
      input.select();
      document.execCommand("copy");
      input.remove();
    }
    // Keeping the current URL in sync makes a copied link auditable in the
    // address bar without storing or sharing any result/cache payload.
    window.history.replaceState({}, "", `${link.pathname}${link.search}${link.hash}`);
    showToast("Share link copied. It reloads the team-season and reruns the search in your browser.");
  } catch (error) {
    showToast("This scenario could not be shared. Reload the selected team-season and try again.");
  }
}

async function shareVerifiedResult() {
  let summary;
  try {
    summary = await currentVerifiedPublicResultShareSummary();
  } catch (error) {
    if (isCanonicalV4LineupSourceSelected()) {
      showToast(error?.message || "V4 result sharing is unavailable. No V3 result was used.");
      return;
    }
    summary = null;
  }
  if (!summary) {
    showToast("Run a complete search for the selected team-season before sharing.");
    return;
  }
  const shareMethod = selectedPublicShareMethod();
  if (!shareMethod || !isSignedPublicResultShareAvailable({ windowRef: window, shareMethod })) {
    showToast("Result sharing is unavailable right now. No link has been created.");
    return;
  }
  try {
    const share = await createSignedPublicResultShareLink(summary, {
      toolId: "lineup-lab",
      shareMethod,
    });
    if (shareMethod === "native") {
      await navigator.share({ title: "Lineup Lab result summary", url: share.url });
    } else {
      try {
        await navigator.clipboard.writeText(share.url);
      } catch {
        const input = document.createElement("textarea");
        input.value = share.url;
        input.style.position = "fixed";
        input.style.opacity = "0";
        document.body.append(input);
        input.select();
        const copied = document.execCommand("copy");
        input.remove();
        if (!copied) throw new Error("The link could not be copied.");
      }
    }
    share.recordShared();
    showToast(shareMethod === "native" ? "Summary ready to share." : "Summary link copied.");
  } catch (error) {
    if (error?.name === "AbortError") return;
    showToast("The result summary could not be shared. Try again.");
  }
}

function printSwishIQReport() {
  if (!state.lastResult?.ok || !elements.resultFreshness.hidden) return;
  window.print();
}

function flushPendingScenarioWarnings() {
  const warnings = [...new Set(state.pendingScenarioWarnings.filter(Boolean))];
  state.pendingScenarioWarnings = [];
  if (warnings.length === 0) return;
  const message = warnings.length === 1
    ? warnings[0]
    : `${warnings[0]} (+${warnings.length - 1} more shared-link note${warnings.length === 2 ? "" : "s"}.)`;
  showToast(message);
}

function sharedScenarioSelection(scenario) {
  if (!scenario || !scenario.team || !Number.isInteger(Number(scenario.season))) return null;
  if (!['regular', 'in_season_tournament', 'play_in', 'playoffs'].includes(scenario.phase)) return null;
  // Older links omitted the source while Lineup Lab defaulted to the exact
  // package. The retired imported source is never restored, even if a caller
  // passes an older decoded scenario object directly.
  const source = SWISHIQ_V3_PACKAGE_SOURCE_KIND;
  if (!SWISHIQ_V3_PACKAGE_PHASES.includes(scenario.phase)) return null;
  return {
    team: scenario.team,
    season: Number(scenario.season),
    seasonPhase: scenario.phase,
    source,
  };
}

async function replaySharedScenarioAfterLoad(scenario) {
  if (!scenario) return;
  const requestedSelection = sharedScenarioSelection(scenario);
  if (!requestedSelection) {
    state.pendingScenarioWarnings.push("The shared setup did not include a team and season, so the search was not rerun.");
    return;
  }
  if (!liveSelectionMatches(state.loadedLiveSelection, requestedSelection) || !liveDatasetMatchesControls()) {
    state.pendingScenarioWarnings.push("The shared team-season could not be loaded, so the search was not rerun.");
    return;
  }

  // All input controls, locks, and exclusions have already passed through the
  // normal validation path in setDataset. Reuse the same exact submit handler
  // rather than creating a second share-only solver path.
  await runOptimizer();
}

function liveSelectionMatches(left, right) {
  return Boolean(left && right)
    && left.team === right.team
    && Number(left.season) === Number(right.season)
    && left.seasonPhase === right.seasonPhase
    && (!left.source || !right.source || canonicalSourceKind(left.source) === canonicalSourceKind(right.source));
}

function finishPendingReplacement(message) {
  const playerId = state.replacementPlayerId;
  state.replacementRunToken = null;
  state.replacementPlayerId = null;
  if (playerId) {
    replaceReplacementOutput(playerId, {
      ok: false,
      message,
    });
  }
}

function markResultStaleForDatasetSelection() {
  if (!state.lastResult || !elements.resultFreshness.hidden) return;

  // Changing the selector is a data-input change, even before the visitor
  // presses Load selected roster. Mark the old result stale immediately so it
  // cannot be copied, printed, shared, or accidentally treated as a result
  // for the newly visible team-season choice.
  state.scenarioVersion += 1;
  state.lastOptimizerRequest = null;
  state.replacementAnalyses.clear();
  const hasPendingReplacement = state.replacementRunToken !== null;
  if (hasPendingReplacement || state.optimizationWorker || state.activeOptimizationToken !== null) {
    cancelOptimization("Optimization cancelled because the selected team-season changed.");
  }
  if (hasPendingReplacement) {
    finishPendingReplacement("The selected team-season changed. Load it and run a new result before testing replacements.");
  }
  elements.results.classList.add("is-stale");
  elements.resultFreshness.hidden = false;
  elements.resultFreshness.textContent = "The selected team-season changed. Load its data and run the optimizer again before using this result.";
  elements.copyResult.disabled = true;
  elements.downloadResult.disabled = true;
  elements.shareResult.disabled = true;
  elements.shareResultHelp.hidden = true;
  elements.shareScenario.disabled = true;
  elements.printReport.disabled = true;
  setMobileResultCurrent(false);
  setSolverStatus("Load team-season data to update result", "warning");
}

function updateLiveSelectionState({ preserveStatus = false } = {}) {
  if (state.liveDataLoading || !elements.liveTeam.value || !elements.liveSeason.value) return;
  const selection = selectionFromControls();
  const matches = liveSelectionMatches(state.loadedLiveSelection, selection);
  elements.liveDataPanel.dataset.selectionState = matches ? "loaded" : "pending";
  elements.datasetStrip.classList.toggle("has-pending-selection", Boolean(state.dataset && !matches));
  elements.loadLiveData.textContent = matches ? "Reload team-season data" : "Load team-season";
  if (!preserveStatus && !matches) {
    markResultStaleForDatasetSelection();
    setLiveDataStatus(
      `Selection changed. Load ${selectedLiveTeamName()} ${nbaSeasonLabel(selection.season)} ${selectedLivePhaseLabel()} data to replace the current team-season.`,
      "warning",
    );
    setOptimizeButtons({ label: "Load team-season" });
  } else if (!preserveStatus && matches) {
    setLiveDataStatus(
      `The selected team-season matches ${selectedLiveTeamName()} ${nbaSeasonLabel(selection.season)} ${selectedLivePhaseLabel()} stats.`,
      "success",
    );
    const needsUpdate = !elements.resultFreshness.hidden;
    setOptimizeButtons({ label: solveActionLabel({ update: needsUpdate }) });
  }
  syncShareScenarioAvailability();
}

function setLiveDataLoading(loading, loadingLabel = "Loading stats...") {
  state.liveDataLoading = loading;
  elements.liveDataPanel.setAttribute("aria-busy", String(loading));
  elements.liveTeam.disabled = loading;
  elements.liveSeason.disabled = loading;
  const phaseRequired = isAllGamesSourceValue(elements.dataSource?.value || ALL_GAMES_SOURCE_VALUE);
  const hasPhase = Boolean(elements.liveSeasonPhase.value);
  elements.liveSeasonPhase.disabled = loading || (phaseRequired && !hasPhase);
  elements.loadLiveData.disabled = loading || (phaseRequired && !hasPhase);
  if (loading) {
    elements.loadLiveData.textContent = loadingLabel;
    elements.opponentTeam.disabled = true;
    elements.loadOpponent.disabled = true;
  } else {
    if (!elements.liveTeam.value || !elements.liveSeason.value) elements.loadLiveData.textContent = "Retry historical data";
    updateLiveSelectionState({ preserveStatus: true });
    populateOpponentTeamOptions({ preferredTeam: state.opponentDataset?.source?.team });
  }
  workflowView?.refresh();
}

function selectedLiveTeam() {
  return state.liveTeamOptions.find((team) => team.team_code === elements.liveTeam.value) || null;
}

function selectedLiveTeamName() {
  return selectedLiveTeam()?.team_name || elements.liveTeam.value || "selected team";
}

function selectedLivePhaseLabel() {
  return {
    regular: "regular season",
    in_season_tournament: "in-season tournament",
    play_in: "play-in",
    playoffs: "playoffs",
  }[elements.liveSeasonPhase.value] || "selected phase";
}

function normalizeCachedLiveDataset(rawDataset) {
  const dataset = normalizeDataset(rawDataset, { strict: true, warnOnGeneratedId: false });
  const headshots = new Map(
    (rawDataset?.players || []).map((player) => [String(player?.id || ""), safeExternalImageUrl(player?.headshotUrl)]),
  );
  // Canonical normalization intentionally strips unknown metadata. Reattach
  // only the serializable analytics envelope that this page wrote to its own
  // 24-hour cache so cached historical rosters keep their rate/context report.
  const analytics = new Map(
    (rawDataset?.players || [])
      .filter((player) => player?.analytics && typeof player.analytics === "object" && !Array.isArray(player.analytics))
      .map((player) => [String(player.id || ""), player.analytics]),
  );
  dataset.players = dataset.players.map((player) => ({
    ...player,
    headshotUrl: headshots.get(player.id) || "",
    analytics: analytics.get(player.id) || null,
  }));
  return dataset;
}

function v3PackageSourceSelected() {
  return isAllGamesSourceValue(elements.dataSource?.value);
}

function setLivePhaseOptions(source = elements.dataSource?.value || ALL_GAMES_SOURCE_VALUE, {
  phases = null,
  preferredPhase = null,
} = {}) {
  const isV3 = isAllGamesSourceValue(source) || source === IMPORTED_SOURCE_VALUE;
  const availablePhases = isV3
    ? (Array.isArray(phases) ? SWISHIQ_V3_PACKAGE_PHASES.filter((phase) => phases.includes(phase)) : null)
    : ["regular", "playoffs"];
  const labels = {
    regular: "Regular season",
    in_season_tournament: "In-season tournament",
    play_in: "Play-in",
    playoffs: "Playoffs",
  };
  const previous = preferredPhase || elements.liveSeasonPhase.value;
  const fragment = document.createDocumentFragment();
  if (availablePhases === null || availablePhases.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.disabled = true;
    option.textContent = availablePhases === null
      ? "Loading available phases…"
      : "Complete player stats unavailable for this team and season";
    fragment.append(option);
  } else {
    for (const phase of availablePhases) {
      const option = document.createElement("option");
      option.value = phase;
      option.textContent = labels[phase] || phase;
      fragment.append(option);
    }
  }
  elements.liveSeasonPhase.replaceChildren(fragment);
  elements.liveSeasonPhase.value = availablePhases?.includes(previous)
    ? previous
    : availablePhases?.includes("regular")
      ? "regular"
      : availablePhases?.[0] || "";
  const hasPhase = Boolean(elements.liveSeasonPhase.value);
  elements.liveSeasonPhase.disabled = state.liveDataLoading || !hasPhase;
  elements.loadLiveData.disabled = state.liveDataLoading || (isV3 && !hasPhase);
  return hasPhase;
}

function setV3PhaseOptionsForSelectedTeam(preferredPhase = elements.liveSeasonPhase.value) {
  const coverage = state.swishIqSeasonLineupCoverage;
  const season = Number(elements.liveSeason.value);
  if (CANONICAL_V4_STUDIO_RUNTIME_RELEASE_PIN?.status !== "unconfigured"
    && state.allGamesCompanionCoverage) {
    const phases = Object.entries(state.allGamesCompanionCoverage.teamCodesBySeasonEndYear?.[season] || {})
      .filter(([, teamCodes]) => Array.isArray(teamCodes) && teamCodes.includes(elements.liveTeam.value))
      .map(([phase]) => phase);
    return setLivePhaseOptions(elements.dataSource?.value || ALL_GAMES_SOURCE_VALUE, { phases, preferredPhase });
  }
  if (!coverage || Number(coverage.seasonEndYear) !== season) {
    return setLivePhaseOptions(elements.dataSource?.value || ALL_GAMES_SOURCE_VALUE, { phases: null, preferredPhase });
  }
  const phases = Object.entries(coverage.teamPhaseCounts?.[elements.liveTeam.value] || {})
    .filter(([, count]) => Number(count) >= 5)
    .map(([phase]) => phase);
  return setLivePhaseOptions(elements.dataSource?.value || ALL_GAMES_SOURCE_VALUE, { phases, preferredPhase });
}

async function refreshV3LineupPhaseCoverage({ preferredPhase = elements.liveSeasonPhase.value } = {}) {
  const source = elements.dataSource?.value || ALL_GAMES_SOURCE_VALUE;
  if (!isAllGamesSourceValue(source)) return true;
  const requestGeneration = ++state.lineupPhaseCoverageGeneration;
  const seasonEndYear = Number(elements.liveSeason.value);
  state.swishIqSeasonLineupCoverage = null;
  setLivePhaseOptions(source, { phases: null, preferredPhase });
  if (CANONICAL_V4_STUDIO_RUNTIME_RELEASE_PIN?.status !== "unconfigured") {
    try {
      const coverage = state.allGamesCompanionCoverage || await loadReviewedAllGamesCoverage();
      if (requestGeneration !== state.lineupPhaseCoverageGeneration
        || source !== (elements.dataSource?.value || ALL_GAMES_SOURCE_VALUE)
        || seasonEndYear !== Number(elements.liveSeason.value)) return false;
      state.allGamesCompanionCoverage = coverage;
      const teamCode = elements.liveTeam.value;
      const phasesByTeam = coverage.teamCodesBySeasonEndYear?.[seasonEndYear] || {};
      const counts = Object.fromEntries(Object.entries(phasesByTeam)
        .filter(([, teamCodes]) => Array.isArray(teamCodes) && teamCodes.includes(teamCode))
        .map(([phase]) => [phase, 1]));
      state.swishIqSeasonLineupCoverage = { seasonEndYear, teamPhaseCounts: { [teamCode]: counts } };
      return setLivePhaseOptions(source, { phases: Object.keys(counts), preferredPhase });
    } catch (error) {
      if (requestGeneration !== state.lineupPhaseCoverageGeneration
        || source !== (elements.dataSource?.value || ALL_GAMES_SOURCE_VALUE)
        || seasonEndYear !== Number(elements.liveSeason.value)) return false;
      setLivePhaseOptions(source, { phases: [], preferredPhase });
      setLiveDataStatus(`Pinned All Games phase coverage is unavailable. No V3 coverage was queried. ${error instanceof Error ? error.message : ""}`.trim(), "error");
      return false;
    }
  }
  setLiveDataStatus(`Loading available phases for ${nbaSeasonLabel(seasonEndYear)}…`);
  try {
    const coverage = await loadSwishIqStaticLineupCoverage({ seasonEndYear });
    if (requestGeneration !== state.lineupPhaseCoverageGeneration
      || source !== (elements.dataSource?.value || ALL_GAMES_SOURCE_VALUE)
      || seasonEndYear !== Number(elements.liveSeason.value)) return false;
    state.swishIqSeasonLineupCoverage = coverage;
    const hasPhase = setV3PhaseOptionsForSelectedTeam(preferredPhase);
    if (!hasPhase) {
      setLiveDataStatus(
        `Complete player stats are unavailable for ${selectedLiveTeamName()} ${nbaSeasonLabel(seasonEndYear)}. Choose another team or season.`,
        "warning",
      );
    }
    return hasPhase;
  } catch (error) {
    if (requestGeneration !== state.lineupPhaseCoverageGeneration
      || source !== (elements.dataSource?.value || ALL_GAMES_SOURCE_VALUE)
      || seasonEndYear !== Number(elements.liveSeason.value)) return false;
    setLiveDataStatus("Lineup data for this phase are unavailable right now. Try another phase or season.", "warning");
    return false;
  }
}

function v3PackageSeasonOptions() {
  return SWISHIQ_V3_PACKAGE_SEASON_END_YEARS.map((seasonEndYear) => ({
    season_end_year: seasonEndYear,
    season_label: nbaSeasonLabel(seasonEndYear),
  }));
}

function populateSeasonOptions(seasons, { source = ALL_GAMES_SOURCE_VALUE } = {}) {
  const previousSeason = Number(elements.liveSeason.value);
  const sortedSeasons = [...seasons].sort(
    (left, right) => Number(right.season_end_year) - Number(left.season_end_year),
  );
  const seasonFragment = document.createDocumentFragment();
  for (const season of sortedSeasons) {
    const option = document.createElement("option");
    option.value = String(season.season_end_year);
    option.textContent = season.season_label || nbaSeasonLabel(season.season_end_year);
    seasonFragment.append(option);
  }
  elements.liveSeason.replaceChildren(seasonFragment);

  const v3Default = isAllGamesSourceValue(source) ? SWISHIQ_V3_PACKAGE_DEFAULT_SEASON_END_YEAR : null;
  const preferredSeason = v3Default && sortedSeasons.some(
    (season) => Number(season.season_end_year) === v3Default
  ) && (!Number.isInteger(previousSeason) || !SWISHIQ_V3_PACKAGE_SEASON_END_YEARS.includes(previousSeason) || previousSeason > v3Default)
    ? v3Default
    : sortedSeasons.some(
    (season) => Number(season.season_end_year) === previousSeason,
  )
    ? previousSeason
    : Number(sortedSeasons[0]?.season_end_year);
  if (preferredSeason) elements.liveSeason.value = String(preferredSeason);
}

async function populateLiveTeamOptions({
  preferredTeam = DEFAULT_TEAM_CODE,
  force = false,
  source = null,
  requestGeneration = null,
  requestSelection = null,
} = {}) {
  const season = Number(elements.liveSeason.value);
  const seasonPhase = elements.liveSeasonPhase.value;
  const selectedSource = source || (elements.dataSource?.value || ALL_GAMES_SOURCE_VALUE);
  const requestIsCurrent = () => (
    requestGeneration === null
    || (
      requestGeneration === state.liveTeamOptionsGeneration
      && selectedSource === (elements.dataSource?.value || ALL_GAMES_SOURCE_VALUE)
      && (!requestSelection
        || (Number(requestSelection.season) === Number(elements.liveSeason.value)
          && requestSelection.seasonPhase === elements.liveSeasonPhase.value))
    )
  );
  if (!requestIsCurrent()) return false;
  if (!isAllGamesSourceValue(selectedSource)) {
    normalizeRetiredImportedSource({ clearSelections: true });
    setLiveDataStatus(RETIRED_IMPORTED_SOURCE_MESSAGE, "warning");
    return false;
  }
  if (isAllGamesSourceValue(selectedSource)) {
    // Before cutover, keep the established V3 selector. After cutover, team
    // choices come from the pinned exact-season package or reviewed companion.
    let teams;
    if (CANONICAL_V4_STUDIO_RUNTIME_RELEASE_PIN?.status !== "unconfigured") {
      const coverage = state.allGamesCompanionCoverage || await loadReviewedAllGamesCoverage();
      if (!requestIsCurrent()) return false;
      state.allGamesCompanionCoverage = coverage;
      const teamCodes = coverage.teamCodesBySeasonEndYear?.[season]?.[seasonPhase];
      if (!Array.isArray(teamCodes)) {
        throw new Error(`The pinned All Games package has no exact ${seasonPhase} coverage for ${season}.`);
      }
      teams = teamCodes.map(team_code => ({
        team_code,
        team_name: ALL_GAMES_PACKAGE_TEAM_NAMES[team_code] || team_code,
      }));
    } else {
      teams = Object.entries(SWISHIQ_V3_TEAM_NAMES)
        .map(([team_code, team_name]) => ({ team_code, team_name }));
    }
    teams.sort((left, right) => left.team_name.localeCompare(right.team_name));
    if (!teams.length) {
      throw new Error(`No team stats are available for ${selectedLivePhaseLabel()} in ${nbaSeasonLabel(season)}.`);
    }
    const selectedCode = elements.liveTeam.value;
    state.liveTeamOptions = teams;
    const fragment = document.createDocumentFragment();
    for (const team of teams) {
      const option = document.createElement("option");
      option.value = team.team_code;
      option.textContent = `${team.team_name} (${team.team_code})`;
      fragment.append(option);
    }
    elements.liveTeam.replaceChildren(fragment);
    const preferredCode = [selectedCode, preferredTeam, DEFAULT_TEAM_CODE]
      .find((code) => teams.some((team) => team.team_code === code));
    elements.liveTeam.value = preferredCode || teams[0].team_code;
    setCourtContextTeam(elements.liveTeam.value);
    return true;
  }
  const teams = await listSupabaseNbaTeams({ seasonEndYear: season, seasonPhase, force });
  if (!requestIsCurrent()) return false;
  if (!Array.isArray(teams) || teams.length === 0) {
    throw new Error(`No teams with ${selectedLivePhaseLabel()} stats were found for ${nbaSeasonLabel(season)}.`);
  }
  const selectedCode = elements.liveTeam.value;
  state.liveTeamOptions = teams;
  const seasonFragment = document.createDocumentFragment();
  for (const team of teams) {
    const option = document.createElement("option");
    option.value = team.team_code;
    option.textContent = `${team.team_name} (${team.team_code})`;
    seasonFragment.append(option);
  }
  elements.liveTeam.replaceChildren(seasonFragment);
  const preferredCode = [selectedCode, preferredTeam]
    .find((code) => teams.some((team) => team.team_code === code));
  elements.liveTeam.value = preferredCode || teams[0].team_code;
  setCourtContextTeam(elements.liveTeam.value);
  return true;
}

function teamNameForCode(teamCode) {
  return state.liveTeamOptions.find((team) => team.team_code === teamCode)?.team_name || teamCode;
}

function setOpponentSwishIQStatus(message, tone = "") {
  elements.opponentSwishIQStatus.textContent = message;
  if (tone) elements.opponentSwishIQStatus.dataset.tone = tone;
  else delete elements.opponentSwishIQStatus.dataset.tone;
}

function loadedPoolMatchesCurrentSeasonPhase() {
  const selected = selectionFromControls();
  return Boolean(state.loadedLiveSelection)
    && Number(state.loadedLiveSelection.season) === Number(selected.season)
    && state.loadedLiveSelection.seasonPhase === selected.seasonPhase;
}

function populateOpponentTeamOptions({ preferredTeam = "" } = {}) {
  const priorValue = elements.opponentTeam.value;
  const ownTeam = loadedPoolMatchesCurrentSeasonPhase()
    ? state.loadedLiveSelection.team
    : elements.liveTeam.value;
  const opponents = state.liveTeamOptions.filter((team) => team.team_code !== ownTeam);
  const fragment = document.createDocumentFragment();
  for (const team of opponents) {
    const option = document.createElement("option");
    option.value = team.team_code;
    option.textContent = `${team.team_name} (${team.team_code})`;
    fragment.append(option);
  }
  elements.opponentTeam.replaceChildren(fragment);
  const selectedCode = [priorValue, preferredTeam, opponents[0]?.team_code]
    .find((code) => code && opponents.some((team) => team.team_code === code));
  if (selectedCode) elements.opponentTeam.value = selectedCode;

  const canSwishIQ = opponents.length > 0 && liveSelectionMatches(state.loadedLiveSelection, selectionFromControls());
  elements.opponentTeam.disabled = state.liveDataLoading || state.opponentLoading || !canSwishIQ;
  elements.loadOpponent.disabled = state.liveDataLoading || state.opponentLoading || !canSwishIQ;
  if (!canSwishIQ && !state.opponentLoading) {
    setOpponentSwishIQStatus("Apply the team, season, and phase above before building an opponent game plan.");
  }
}

async function refreshLiveTeamOptions() {
  if (normalizeRetiredImportedSource({ clearSelections: true })) {
    setLiveDataStatus(RETIRED_IMPORTED_SOURCE_MESSAGE, "warning");
    await populateLiveDataControls();
    setLiveDataStatus(RETIRED_IMPORTED_SOURCE_MESSAGE, "warning");
    return;
  }
  const requestGeneration = ++state.liveTeamOptionsGeneration;
  const requestSelection = {
    season: Number(elements.liveSeason.value),
    seasonPhase: elements.liveSeasonPhase.value,
  };
  const source = elements.dataSource?.value || ALL_GAMES_SOURCE_VALUE;
  // Season and phase are coupled: a playoff dropdown must contain only teams
  // that actually recorded a playoff player pool, not every regular-season
  // franchise from that year.
  setLiveDataLoading(true, "Loading teams...");
  setLiveDataStatus(
    `Loading ${selectedLivePhaseLabel()} teams from ${nbaSeasonLabel(elements.liveSeason.value)}...`,
  );
  try {
    // A visitor's explicit season/phase change is a new data request. Bypass
    // the tab-level promise cache so a previously slow or stale team query
    // cannot keep the selector in an old loading state.
    const applied = await populateLiveTeamOptions({
      force: true,
      source,
      requestGeneration,
      requestSelection,
    });
    if (!applied) {
      // A selector changed while the request was in flight. Start one request
      // for the current controls; the older finally block cannot clear its
      // loading state because its generation is no longer current.
      if (requestGeneration === state.liveTeamOptionsGeneration
        && source === (elements.dataSource?.value || ALL_GAMES_SOURCE_VALUE)) {
        await refreshLiveTeamOptions();
      }
      return;
    }
    setLiveDataStatus(
      `Ready to load ${selectedLiveTeamName()} ${nbaSeasonLabel(elements.liveSeason.value)} ${selectedLivePhaseLabel()} stats.`,
    );
  } catch (error) {
    setLiveDataStatus("Team stats could not be loaded. Try again or choose another season.", "error");
    showToast("Team stats could not be loaded. Try again or choose another season.");
  } finally {
    if (requestGeneration === state.liveTeamOptionsGeneration) setLiveDataLoading(false);
  }
}

async function populateLiveDataControls({ sharedScenario = null, preferredPhase: preferredPhaseOverride = null } = {}) {
  const controlsGeneration = ++state.liveControlsGeneration;
  const retiredImportedWasRequested = normalizeRetiredImportedSource({ clearSelections: true });
  const source = elements.dataSource?.value || ALL_GAMES_SOURCE_VALUE;
  const preferredPhase = sharedScenario?.phase
    || preferredPhaseOverride
    || (retiredImportedWasRequested ? DEFAULT_SEASON_PHASE : elements.liveSeasonPhase.value || DEFAULT_SEASON_PHASE);
  if (retiredImportedWasRequested) state.pendingScenarioWarnings.push(RETIRED_IMPORTED_SOURCE_MESSAGE);
  state.lineupPhaseCoverageGeneration += 1;
  state.swishIqSeasonLineupCoverage = null;
  state.allGamesCompanionCoverage = null;
  if (elements.dataSource) {
    const v3Option = elements.dataSource.querySelector('[value="all-games-package"]');
    if (v3Option) v3Option.textContent = "NBA stats (2017–26)";
  }
  setLiveDataLoading(true, "Loading seasons...");
  setLiveDataStatus(isAllGamesSourceValue(source)
    ? "Loading NBA seasons (2017–18 through 2025–26)…"
    : "Loading older NBA seasons (before 2017–18)…");
  try {
    setLivePhaseOptions(source, {
      phases: isAllGamesSourceValue(source) ? null : undefined,
      preferredPhase,
    });
    const v4AllGamesRequired = isAllGamesSourceValue(source)
      && CANONICAL_V4_STUDIO_RUNTIME_RELEASE_PIN?.status !== "unconfigured";
    let companionCoverage = null;
    if (v4AllGamesRequired) {
      try {
        companionCoverage = await loadReviewedAllGamesCoverage();
      } catch (error) {
        setLivePhaseOptions(source, { phases: [], preferredPhase });
        setLiveDataStatus(`Pinned All Games coverage is unavailable. No V3 package was loaded. ${error instanceof Error ? error.message : ""}`.trim(), "error");
        return;
      }
      if (controlsGeneration !== state.liveControlsGeneration
        || source !== (elements.dataSource?.value || ALL_GAMES_SOURCE_VALUE)) return;
      state.allGamesCompanionCoverage = companionCoverage;
    }
    const seasons = isAllGamesSourceValue(source)
      ? v4AllGamesRequired
        ? companionCoverage.seasons.map(season => ({
          season_end_year: season.seasonEndYear,
          season_label: season.season_label,
        }))
        : v3PackageSeasonOptions()
      : (await listSupabaseNbaSeasons()).filter(
        (season) => Number(season.season_end_year) < SWISHIQ_V3_PACKAGE_SEASON_END_YEARS[0],
      );
    if (controlsGeneration !== state.liveControlsGeneration || source !== (elements.dataSource?.value || ALL_GAMES_SOURCE_VALUE)) return;
    if (!Array.isArray(seasons) || seasons.length === 0) {
      throw new Error(isAllGamesSourceValue(source)
        ? "NBA seasons are unavailable right now. Try again later."
        : "No stats before 2017–18 are available right now.");
    }
    populateSeasonOptions(seasons, { source });
    if (
      Number.isInteger(Number(sharedScenario?.season))
      && [...elements.liveSeason.options].some((option) => Number(option.value) === Number(sharedScenario.season))
    ) {
      elements.liveSeason.value = String(sharedScenario.season);
    } else if (sharedScenario?.season) {
      state.pendingScenarioWarnings.push(
        `${nbaSeasonLabel(sharedScenario.season)} is not available here, so the newest available season was selected.`,
      );
    }
    if (v4AllGamesRequired) {
      // Choose a covered phase before querying teams. The loading placeholder
      // has an empty value and is not a valid exact-season coverage key.
      const phases = companionCoverage.phasesBySeasonEndYear?.[Number(elements.liveSeason.value)] || [];
      if (!setLivePhaseOptions(source, { phases, preferredPhase })) {
        throw new Error(`No phases are available for ${nbaSeasonLabel(elements.liveSeason.value)}.`);
      }
    }
    if (!isAllGamesSourceValue(source) && ["regular", "playoffs"].includes(sharedScenario?.phase)
      && [...elements.liveSeasonPhase.options].some((option) => option.value === sharedScenario.phase)) {
      elements.liveSeasonPhase.value = sharedScenario.phase;
    }
    const requestGeneration = ++state.liveTeamOptionsGeneration;
    const requestSelection = {
      season: Number(elements.liveSeason.value),
      seasonPhase: elements.liveSeasonPhase.value,
    };
    const applied = await populateLiveTeamOptions({
      preferredTeam: sharedScenario?.team || DEFAULT_TEAM_CODE,
      source,
      requestGeneration,
      requestSelection,
    });
    if (!applied) return;
    if (controlsGeneration !== state.liveControlsGeneration || source !== (elements.dataSource?.value || ALL_GAMES_SOURCE_VALUE)) return;
    if (isAllGamesSourceValue(source)) {
      const hasSupportedPhase = await refreshV3LineupPhaseCoverage({ preferredPhase });
      if (controlsGeneration !== state.liveControlsGeneration || source !== (elements.dataSource?.value || ALL_GAMES_SOURCE_VALUE)) return;
      if (sharedScenario?.phase && elements.liveSeasonPhase.value !== sharedScenario.phase) {
        state.pendingScenarioWarnings.push(
          `${sharedScenario.phase.replaceAll("_", " ")} stats are unavailable for ${selectedLiveTeamName()} ${nbaSeasonLabel(elements.liveSeason.value)}; ${elements.liveSeasonPhase.value || "no phase"} was selected instead.`,
        );
      }
      if (!hasSupportedPhase) return;
    }
    if (sharedScenario?.team && elements.liveTeam.value !== sharedScenario.team) {
      state.pendingScenarioWarnings.push(
        `${sharedScenario.team} was not available for that season and phase, so ${elements.liveTeam.value} was selected instead.`,
      );
    }
    setLiveDataStatus(`Ready to load ${selectedLiveTeamName()} ${nbaSeasonLabel(elements.liveSeason.value)} ${selectedLivePhaseLabel()} stats.`);
  } finally {
    if (controlsGeneration === state.liveControlsGeneration) setLiveDataLoading(false);
  }
}

function readCachedLiveDataset(team, season, seasonPhase) {
  const key = liveCacheKey(team, season, seasonPhase);
  try {
    const entry = JSON.parse(localStorage.getItem(key) || "null");
    if (!entry || !Number.isFinite(entry.cachedAt)) {
      localStorage.removeItem(key);
      return null;
    }
    const dataset = normalizeCachedLiveDataset(entry.dataset);
    if (
      dataset.source?.team !== team
      || dataset.source?.season !== nbaSeasonLabel(season)
      || dataset.source?.seasonPhase !== seasonPhase
    ) {
      localStorage.removeItem(key);
      return null;
    }
    pruneLiveDatasetCache(key);
    return {
      dataset,
      fresh: Date.now() - entry.cachedAt <= NBA_CACHE_MAX_AGE_MS,
    };
  } catch {
    try {
      localStorage.removeItem(key);
    } catch {
      // Storage may be unavailable; a network request can still load the data.
    }
    return null;
  }
}

function cacheLiveDataset(team, season, seasonPhase, dataset) {
  const key = liveCacheKey(team, season, seasonPhase);
  try {
    localStorage.setItem(
      key,
      JSON.stringify({ cachedAt: Date.now(), dataset }),
    );
    pruneLiveDatasetCache(key);
  } catch {
    // Caching is an optional request-saving optimization.
  }
}

function allowLineupSourceBoundary(sourceMode = "pre-cutover") {
  const gate = canonicalV4LineupModelExecutionAvailability({ sourceMode });
  if (gate.available) return true;
  state.swishiqEvidence = null;
  state.swishIqPackage = null;
  state.swishIqProjectionStatus = "unavailable";
  const evidenceStatus = $("#swishiqEvidenceStatus");
  if (evidenceStatus) evidenceStatus.textContent = gate.reason;
  setLiveDataStatus(gate.reason, "error");
  return false;
}

async function loadLiveDataset({ force = false, intentGeneration = null } = {}) {
  if (!allowLineupSourceBoundary()) return;
  if (!v3PackageSourceSelected()) {
    normalizeRetiredImportedSource({ clearSelections: true });
    setLiveDataStatus(RETIRED_IMPORTED_SOURCE_MESSAGE, "warning");
    return;
  }
  if (state.liveDataLoading) return;
  const loadGeneration = intentGeneration ?? beginDatasetLoadIntent();
  if (!datasetLoadIsCurrent(loadGeneration)) return;
  const team = elements.liveTeam.value;
  const season = Number(elements.liveSeason.value);
  const seasonPhase = elements.liveSeasonPhase.value;
  const teamName = selectedLiveTeamName();
  const cached = force ? null : readCachedLiveDataset(team, season, seasonPhase);
  if (cached?.fresh) {
    if (!datasetLoadIsCurrent(loadGeneration)) return;
    setDataset(cached.dataset, {
      liveSelection: { team, season, seasonPhase, source: "imported" },
      notice: "",
    });
    setLiveDataStatus("Team-season data is ready.", "success");
    return;
  }

  setLiveDataLoading(true);
  setLiveDataStatus(`Loading ${teamName} ${nbaSeasonLabel(season)} ${selectedLivePhaseLabel()} stats…`);
  try {
    const dataset = await fetchSupabaseNbaTeamDataset({ team, season, seasonPhase, force });
    if (!datasetLoadIsCurrent(loadGeneration)) return;
    cacheLiveDataset(team, season, seasonPhase, dataset);
    setDataset(dataset, {
      liveSelection: { team, season, seasonPhase, source: "imported" },
      notice: force ? `${dataset.players.length} ${teamName} players loaded for this team-season.` : "",
    });
    setLiveDataStatus(
      `Loaded ${dataset.players.length} players who appeared for ${teamName}; their team-only totals were converted to per-game stats.`,
      "success",
    );
  } catch (error) {
    if (!datasetLoadIsCurrent(loadGeneration)) return;
    const stale = cached || readCachedLiveDataset(team, season, seasonPhase);
    if (stale) {
      setDataset(stale.dataset, {
        liveSelection: { team, season, seasonPhase, source: "imported" },
        notice: force ? `Live refresh unavailable; using the most recently available ${teamName} stats.` : "",
      });
      setLiveDataStatus(`Team-season stats could not be refreshed. The most recently available data are ready.`, "warning");
      return;
    }
    setLiveDataStatus("Team-season stats could not be loaded. The demo and CSV options remain available.", "error");
    throw error;
  } finally {
    if (datasetLoadIsCurrent(loadGeneration)) setLiveDataLoading(false);
  }
}

/**
 * Enrich a solver dataset with confirmed presentation media when its source
 * intentionally omits provider identity fields. The V3 exact-season
 * projection and the separate exact Impact proof remain the source of truth for
 * every stat and player ID; this helper adds only approved headshot/logo URLs
 * for rendering.
 * If the optional media read is unavailable, the existing initials and team
 * code fallbacks remain intact and the exact dataset still loads.
 */
async function hydrateDatasetMedia(dataset, { team, season, seasonPhase, teamName = "" } = {}) {
  if (!dataset || !Array.isArray(dataset.players)) return dataset;
  const teamCode = String(team || dataset.source?.team || "").trim().toUpperCase();
  const seasonEndYear = Number(season ?? dataset.source?.seasonEndYear);
  const phase = String(seasonPhase || dataset.source?.seasonPhase || "regular").trim().toLowerCase();
  const hasMissingHeadshots = dataset.players.some((player) => !safeExternalImageUrl(player?.headshotUrl));
  const hasMissingLogo = !safeExternalImageUrl(dataset.source?.teamLogoUrl);
  const hasHeadshotsWithoutCutoutWebp = dataset.players.some((player) => {
    const value = safeExternalImageUrl(player?.headshotUrl);
    if (!value) return false;
    try {
      const pathname = new URL(value).pathname;
      return !/^\/assets\/player-headshots\/nba-no-background\/[^/]+\.webp$/i.test(pathname);
    } catch {
      return true;
    }
  });
  const hasRemoteLogo = Boolean(
    safeExternalImageUrl(dataset.source?.teamLogoUrl)
      && !/^https?:\/\/[^/]+\/assets\/(?:player-headshots|nba-logos)\//i.test(dataset.source.teamLogoUrl),
  );
  if (!teamCode || !Number.isInteger(seasonEndYear)
    || !["regular", "playoffs", "in_season_tournament", "play_in"].includes(phase)
    || (!hasMissingHeadshots && !hasMissingLogo && !hasHeadshotsWithoutCutoutWebp && !hasRemoteLogo)) {
    return dataset;
  }

  try {
    const localMetadata = await loadLocalPlayerMetadata().catch(() => new Map());
    const currentSource = dataset.source || {};
    const source = {
      ...currentSource,
      ...(currentSource.teamName || teamName
        ? { teamName: currentSource.teamName || teamName }
        : {}),
    };
    const existingLogo = safeExternalImageUrl(currentSource.teamLogoUrl);
    const localLogo = safeExternalImageUrl(teamLogoAssetUrl(teamCode));
    if (localLogo) source.teamLogoUrl = localLogo;
    else if (existingLogo) source.teamLogoUrl = existingLogo;

    const players = dataset.players.map((player) => {
      const localHeadshot = safeExternalImageUrl(localMetadata.get(normalizePlayerName(player?.name))?.headshotPath);
      const existingHeadshot = safeExternalImageUrl(player?.headshotUrl);
      if (localHeadshot) return { ...player, headshotUrl: localHeadshot };
      if (existingHeadshot) return player;
      return player;
    });
    return { ...dataset, source, players };
  } catch {
    // Media is presentation-only. Never block an exact package or projection
    // because an optional image request failed.
    return dataset;
  }
}

async function loadV3PackageDataset({ intentGeneration = null, includeImpact = false } = {}) {
  if (CANONICAL_V4_STUDIO_RUNTIME_RELEASE_PIN?.status !== "unconfigured") {
    if (!isAllGamesSourceValue(elements.dataSource?.value || ALL_GAMES_SOURCE_VALUE)) {
      allowLineupSourceBoundary("v3");
      return;
    }
    if (state.liveDataLoading) return;
    const loadGeneration = intentGeneration ?? beginDatasetLoadIntent();
    if (!datasetLoadIsCurrent(loadGeneration)) return;
    const selection = selectionFromControls();
    const teamName = selectedLiveTeamName();
    setLiveDataLoading(true, "Loading the pinned All Games package…");
    setLiveDataStatus(`Loading exact All Games rows for ${teamName} ${nbaSeasonLabel(selection.season)} ${selectedLivePhaseLabel()}…`);
    try {
      const coverage = state.allGamesCompanionCoverage || await loadReviewedAllGamesCoverage();
      const coveredTeams = coverage.teamCodesBySeasonEndYear?.[Number(selection.season)]?.[selection.seasonPhase];
      if (!Array.isArray(coveredTeams) || !coveredTeams.includes(selection.team)) {
        throw new Error("The pinned All Games package does not cover this exact team-season-phase request.");
      }
      const loaded = await loadAllGamesTeamDataset({
        seasonEndYear: Number(selection.season),
        team: selection.team,
        seasonPhase: selection.seasonPhase,
      });
      if (!datasetLoadIsCurrent(loadGeneration)) return;
      const source = loaded?.dataset?.source;
      const scope = source?.scope;
      const localPackagePin = coverage.evidence?.localPackage;
      const loadedLocalPackagePin = loaded?.package?.localPackagePin;
      const localPinVerified = coverage.sourceMode === "local-pinned-descriptive-package"
        && localPackagePin?.format === ALL_GAMES_LOCAL_PACKAGE_PIN.format
        && localPackagePin?.artifactSha256 === ALL_GAMES_LOCAL_PACKAGE_PIN.artifactSha256
        && localPackagePin?.artifactByteLength === ALL_GAMES_LOCAL_PACKAGE_PIN.artifactByteLength
        && localPackagePin?.contentHash === ALL_GAMES_LOCAL_PACKAGE_PIN.contentHash
        && loadedLocalPackagePin?.artifactSha256 === localPackagePin.artifactSha256
        && loadedLocalPackagePin?.contentHash === localPackagePin.contentHash
        && loaded?.package?.packageId === localPackagePin.packageId
        && loaded?.package?.packageVersion === localPackagePin.packageVersion;
      const verifiedCompanion = coverage.evidence?.companionRelease;
      const loadedCompanion = loaded?.package?.companionRelease;
      const reviewedCompanionVerified = Boolean(verifiedCompanion?.entry
        && loadedCompanion
        && loadedCompanion.status === "reviewed"
        && loadedCompanion.releaseId === coverage.evidence?.canonicalRelease?.releaseId
        && loadedCompanion.releaseId === verifiedCompanion.releaseId
        && loadedCompanion.reviewReceiptSha256 === verifiedCompanion.reviewReceiptSha256
        && loadedCompanion.authorizationReferenceSha256 === verifiedCompanion.authorizationReferenceSha256
        && loadedCompanion.registrySha256 === verifiedCompanion.registrySha256
        && loadedCompanion.registryRevisionSha256 === verifiedCompanion.registryRevisionSha256
        && loadedCompanion.indexSha256 === verifiedCompanion.entry.indexSha256
        && loadedCompanion.artifactSha256 === verifiedCompanion.entry.artifactSha256);
      if (loaded?.sourceKind !== ALL_GAMES_PACKAGE_SOURCE_KIND
        || loaded?.coverage?.matchingRows !== loaded?.coverage?.usableRows
        || loaded?.coverage?.skippedRows !== 0
        || scope?.kind !== "exact-season"
        || scope?.teamCode !== selection.team
        || scope?.seasonStartYear !== Number(selection.season) - 1
        || scope?.seasonEndYear !== Number(selection.season)
        || scope?.phases?.length !== 1
        || scope.phases[0] !== selection.seasonPhase
        || (!localPinVerified && !reviewedCompanionVerified)) {
        throw new Error("The All Games dataset did not verify the requested exact team-season-phase rows and source pin.");
      }
      const identityKeys = new Set();
      const players = loaded.dataset.players.map(player => {
        const normalizedPlayerNameKey = normalizeCanonicalV4PlayerNameKey(player?.name);
        if (!normalizedPlayerNameKey) throw new Error("A V4 All Games row has no canonical player name key.");
        const scopedKey = `${normalizedPlayerNameKey}|${scope.seasonStartYear}|${selection.team}|${selection.seasonPhase}`;
        if (identityKeys.has(scopedKey)) throw new Error(`V4 All Games has an ambiguous duplicate name/team/season/phase row for ${player.name}.`);
        identityKeys.add(scopedKey);
        return {
          ...player,
          id: scopedKey,
          playerRef: `ll-${hashCanonical({ nameSeasonTeamPhase: scopedKey })}`,
          normalizedPlayerNameKey,
          identityScope: Object.freeze({
            seasonStartYear: scope.seasonStartYear,
            teamCode: selection.team,
            phase: selection.seasonPhase,
          }),
        };
      });
      const packageRef = Object.freeze({
        ...loaded.package,
        packageScope: loaded.package.scope,
        scope: Object.freeze(scope),
        ...(coverage.evidence?.canonicalRelease ? { canonicalRelease: coverage.evidence.canonicalRelease } : {}),
        ...(loadedCompanion ? { companionRelease: loadedCompanion } : {}),
      });
      const historicalGate = localPinVerified
        ? canonicalV4LineupModelExecutionAvailability({ sourceMode: "canonical-v4-required" })
        : null;
      const historicalOptimizerAvailable = Boolean(localPinVerified && historicalGate?.available);
      const dataset = {
        ...loaded.dataset,
        players,
        source: {
          ...source,
          sourceMode: historicalOptimizerAvailable
            ? "owner-authorized-historical-optimizer"
            : "canonical-v4-required",
          consumerId: localPinVerified
            ? "lineup-lab-local-all-games-historical-optimizer"
            : "custom-all-games-package-boundary",
          nameIdentity: Object.freeze({
            keyVersion: CANONICAL_V4_PLAYER_NAME_KEY_VERSION,
            providerIdsUsed: false,
            scope: "normalizedPlayerNameKey+seasonStartYear+teamCode+phase",
          }),
          packageRef,
          modelExecutionAllowed: historicalOptimizerAvailable,
          predictiveValidationStatus: "not-claimed-historical-optimizer-only",
          dataBoundary: localPinVerified
            ? "byte-pinned-exact-public-season-statistics"
            : "verified-companion-data-descriptive-only",
        },
      };
      // The All Games package remains the exact roster/stat source. Native V4
      // Impact is a separately pinned companion and is only bound after this
      // exact team-season roster has passed its own source checks.
      let nativeImpact = null;
      let nativeImpactError = null;
      if (includeImpact) {
        state.swishIqProjectionStatus = "loading";
        if (!historicalOptimizerAvailable) {
          nativeImpactError = new Error("The selected V4 roster is descriptive only, so its native Impact companion cannot be used for optimizer execution.");
        } else if (selection.seasonPhase !== "regular") {
          nativeImpactError = new Error("Native V4 Impact is published only for the selected exact regular season. No other phase or season is substituted.");
        } else {
          try {
            nativeImpact = await loadCanonicalV4ImpactForLineupDataset({
              dataset,
              seasonStartYear: Number(selection.season) - 1,
              teamCode: selection.team,
              phase: selection.seasonPhase,
            });
          } catch (impactError) {
            nativeImpactError = impactError instanceof Error
              ? impactError
              : new Error("The native V4 Impact companion could not be verified.");
          }
        }
        if (!datasetLoadIsCurrent(loadGeneration)) return;
      }
      const nativeImpactReady = Boolean(nativeImpact?.status === "available"
        && nativeImpact?.evidence && nativeImpact?.package);
      setDataset(dataset, {
        liveSelection: { ...selection, source: ALL_GAMES_SOURCE_VALUE },
        datasetKind: nativeImpactReady
          ? "canonical-v4-native-impact"
          : localPinVerified ? "all-games-local-historical" : "all-games-v4-descriptive",
        swishIqEvidence: nativeImpactReady ? nativeImpact.evidence : null,
        swishIqPackage: nativeImpactReady ? nativeImpact.package : null,
        notice: nativeImpactReady
          ? `${players.length} exact-season All Games rows loaded with verified native V4 Impact mean estimates for this regular-season roster.`
          : localPinVerified
          ? `${players.length} exact-season All Games rows loaded from the byte-pinned local package. DJHC historical lineup optimization is available; this is not a forecast or native V4 Impact result.`
          : `${players.length} exact V4 All Games rows loaded. The player key is name plus exact season, team, and phase. Model output remains disabled.`,
      });
      state.swishIqProjectionStatus = nativeImpactReady ? "ready" : "unavailable";
      if (nativeImpactReady) {
        syncModelChoice();
        syncSwishIqAvailabilityStatus();
        setLiveDataStatus(
          `The pinned All Games roster and native V4 Impact mean estimates are ready for ${teamName} ${nbaSeasonLabel(selection.season)} regular season. The objective is historical conditional-lineup evidence, not a game forecast or counterfactual validation.`,
          "success",
        );
      } else if (includeImpact) {
        const detail = nativeImpactError?.message || "The native V4 Impact companion did not provide any usable exact-roster estimates.";
        $("#swishiqEvidenceStatus").textContent = `Native V4 Impact is unavailable for this team-season. ${detail} No other season is substituted.`;
        setLiveDataStatus(`All Games rows are loaded, but Native V4 Impact is unavailable. ${detail}`, "warning");
      } else {
        setLiveDataStatus(localPinVerified
          ? `The pinned All Games data is ready for ${teamName} ${nbaSeasonLabel(selection.season)} ${selectedLivePhaseLabel()}. DJHC historical lineup optimization is ${historicalOptimizerAvailable ? "available" : "unavailable"}; SwishIQ Impact is available only after its exact native companion is requested.`
          : `Verified V4 All Games data is ready for ${teamName} ${nbaSeasonLabel(selection.season)} ${selectedLivePhaseLabel()}. Lineup optimization and Impact are disabled until their V4 inputs and execution gate are available.`,
        historicalOptimizerAvailable ? "success" : "warning");
      }
    } catch (error) {
      if (!datasetLoadIsCurrent(loadGeneration)) return;
      state.swishiqEvidence = null;
      state.swishIqPackage = null;
      state.swishIqProjectionStatus = "unavailable";
      setLiveDataStatus(`All Games dataset unavailable. No V3 package was loaded. ${error instanceof Error ? error.message : ""}`.trim(), "error");
    } finally {
      if (datasetLoadIsCurrent(loadGeneration)) {
        setLiveDataLoading(false);
        if (includeImpact) {
          // setDataset() refreshes the guided workflow before this loader can
          // mark the companion ready. Recompute the preflight after the final
          // status so a successful Impact load does not leave a stale
          // "Loading SwishIQ Impact" gate on the review step.
          syncSwishIqAvailabilityStatus();
          updateRunSummary();
          workflowView?.refresh();
        }
      }
    }
    return;
  }
  if (!allowLineupSourceBoundary("v3")) return;
  if (state.liveDataLoading) return;
  const loadGeneration = intentGeneration ?? beginDatasetLoadIntent();
  if (!datasetLoadIsCurrent(loadGeneration)) return;
  const selection = selectionFromControls();
  const teamName = selectedLiveTeamName();
  setLiveDataLoading(true, "Loading NBA player stats...");
  setLiveDataStatus(`Loading ${teamName} player stats for ${nbaSeasonLabel(selection.season)} ${selectedLivePhaseLabel()}…`);
  try {
    const loaded = await loadSwishIqV3TeamDataset({
      seasonEndYear: selection.season,
      team: selection.team,
      seasonPhase: selection.seasonPhase,
    });
    const dataset = await hydrateDatasetMedia(loaded.dataset, {
      team: selection.team,
      season: selection.season,
      seasonPhase: selection.seasonPhase,
      teamName,
    });
    if (!datasetLoadIsCurrent(loadGeneration)) return;
    if (!includeImpact) {
      setDataset(dataset, {
        liveSelection: { ...selection, source: SWISHIQ_V3_PACKAGE_SOURCE_KIND },
        datasetKind: SWISHIQ_V3_PACKAGE_SOURCE_KIND,
        notice: `${dataset.players.length} players loaded for this team-season.`,
      });
      setLiveDataStatus(
        `Loaded ${dataset.players.length} ${teamName} player rows. No lineup impact estimate was added.`,
        "success",
      );
      return;
    }

    try {
      const projection = await loadSwishIqStaticLineupProjection({
        seasonEndYear: selection.season,
        team: selection.team,
        seasonPhase: selection.seasonPhase,
      });
      const publicAvailability = publicSwishIqImpactAvailability(projection, selection);
      if (!publicAvailability.available) throw new Error(publicAvailability.reason);
      const impactEvidence = bindSwishIqV3ImpactEvidence(dataset, projection);
      if (!datasetLoadIsCurrent(loadGeneration)) return;
      setDataset(dataset, {
        liveSelection: { ...selection, source: SWISHIQ_V3_PACKAGE_SOURCE_KIND },
        datasetKind: "swishiq-impact",
        swishIqEvidence: impactEvidence,
        swishIqPackage: projection.package,
        notice: `${dataset.players.length} players loaded; impact estimates are available for this team-season.`,
      });
      state.swishIqProjectionStatus = "ready";
      renderPlayerTable();
      syncSwishIqAvailabilityStatus();
      setLiveDataStatus("NBA player stats and SwishIQ Impact estimates are available for this team-season.", "success");
    } catch (impactError) {
      if (!datasetLoadIsCurrent(loadGeneration)) return;
      // Keep every verified official box row available. The Impact mode stays
      // disabled because no exact lineup/holdout capability may be inferred.
      setDataset(dataset, {
        liveSelection: { ...selection, source: SWISHIQ_V3_PACKAGE_SOURCE_KIND },
        datasetKind: SWISHIQ_V3_PACKAGE_SOURCE_KIND,
        notice: `${dataset.players.length} player-season rows loaded; impact estimates are unavailable for this team-season.`,
      });
      state.swishIqProjectionStatus = "unavailable";
      $("#swishiqEvidenceStatus").textContent = "SwishIQ Impact is unavailable for this team-season. Box-score stats remain loaded; no other season is substituted.";
      setLiveDataStatus("NBA player stats are loaded. SwishIQ Impact is unavailable for this team-season; no other season is substituted.", "warning");
    }
  } catch (error) {
    if (!datasetLoadIsCurrent(loadGeneration)) return;
    setLiveDataStatus("NBA player stats could not be loaded. Try again or choose another season.", "warning");
    throw error;
  } finally {
    if (datasetLoadIsCurrent(loadGeneration)) setLiveDataLoading(false);
  }
}

/**
 * Compatibility wrapper for existing model-selection call sites. Box rows
 * load first from player-seasons; optional exact impact proof can only enrich
 * those same opaque V3 roster refs.
 */
async function loadSelectedSwishIqProjection({ intentGeneration = null } = {}) {
  return loadV3PackageDataset({ intentGeneration, includeImpact: true });
}

async function loadSelectedModelDataset({ force = false, intentGeneration = null } = {}) {
  const v4AllGamesSelected = CANONICAL_V4_STUDIO_RUNTIME_RELEASE_PIN?.status !== "unconfigured"
    && isAllGamesSourceValue(elements.dataSource?.value || ALL_GAMES_SOURCE_VALUE);
  if (!v4AllGamesSelected && !allowLineupSourceBoundary(v3PackageSourceSelected() ? "v3" : "pre-cutover")) return;
  if (normalizeRetiredImportedSource({ clearSelections: true })) {
    invalidateDatasetLoad();
    state.liveControlsGeneration += 1;
    state.liveTeamOptionsGeneration += 1;
    state.lineupPhaseCoverageGeneration += 1;
    markResultStaleForDatasetSelection();
    state.swishiqEvidence = null;
    state.swishIqPackage = null;
    state.swishIqProjectionStatus = "idle";
    await populateLiveDataControls();
    setLiveDataStatus(RETIRED_IMPORTED_SOURCE_MESSAGE, "warning");
    return;
  }
  if (!elements.liveTeam.value || !elements.liveSeason.value) await populateLiveDataControls();
  if (v4AllGamesSelected) {
    return loadV3PackageDataset({
      intentGeneration,
      includeImpact: $("#modelModeInput").value === "swishiq-impact",
    });
  }
  if (v3PackageSourceSelected()) {
    state.swishiqEvidence = null;
    state.swishIqPackage = null;
    state.swishIqProjectionStatus = "idle";
    return loadV3PackageDataset({ intentGeneration, includeImpact: $("#modelModeInput").value === "swishiq-impact" });
  }
  if ($("#modelModeInput").value === "swishiq-impact") {
    state.swishIqProjectionStatus = "unavailable";
    state.swishiqEvidence = null;
    state.swishIqPackage = null;
    const detail = "SwishIQ Impact is unavailable for this team-season. No other season was substituted.";
    $("#swishiqEvidenceStatus").textContent = detail;
    setLiveDataStatus(detail, "warning");
    return;
  }
  state.swishiqEvidence = null;
  state.swishIqPackage = null;
  state.swishIqProjectionStatus = "idle";
  return loadLiveDataset({ force, intentGeneration });
}

function setOpponentLoading(loading) {
  state.opponentLoading = loading;
  elements.opponentSwishIQ.setAttribute("aria-busy", String(loading));
  elements.opponentTeam.disabled = loading;
  elements.loadOpponent.disabled = loading;
  elements.loadOpponent.textContent = loading ? "Building game plan..." : "Build game plan";
  if (!loading) populateOpponentTeamOptions({ preferredTeam: state.opponentDataset?.source?.team });
}

function clearOpponentSwishIQ(message = "Choose an opponent to build a historical game plan.") {
  state.opponentDataset = null;
  state.opponentStrategy = null;
  state.opponentWeightUndo = null;
  elements.opponentSwishIQSummary.hidden = true;
  elements.opponentSwishIQSummary.replaceChildren();
  setOpponentSwishIQStatus(message);
}

function objectiveWeightsMatch(left, right) {
  return Object.keys(METRIC_LABELS).every((metric) => Number(left?.[metric] || 0) === Number(right?.[metric] || 0));
}

function renderCounterWeightPreview(strategy) {
  const wrap = document.createElement("div");
  wrap.className = "counter-weight-preview table-wrap detailed-only";
  wrap.tabIndex = 0;
  wrap.setAttribute("aria-label", "Current and suggested skill-priority comparison");
  const table = document.createElement("table");
  table.className = "counter-weight-table";
  const caption = document.createElement("caption");
  caption.textContent = "Weight preview";
  const head = document.createElement("thead");
  const headRow = document.createElement("tr");
  for (const heading of ["Priority", "Current focus", "Suggested focus", "Change"]) {
    const cell = document.createElement("th");
    cell.scope = "col";
    cell.textContent = heading;
    headRow.append(cell);
  }
  head.append(headRow);
  const body = document.createElement("tbody");
  const currentShares = normalizedFamilyShares(state.familyWeights);
  const suggestedShares = normalizedFamilyShares(strategy.familyWeights);
  for (const [family, label] of Object.entries(FAMILY_LABELS)) {
    const current = currentShares.get(family) || 0;
    const suggested = suggestedShares.get(family) || 0;
    const row = document.createElement("tr");
    createCell(row, label);
    createCell(row, `${current}%`);
    createCell(row, `${suggested}%`);
    createCell(row, `${formatSignedDifference(suggested - current)} points`);
    body.append(row);
  }
  table.append(caption, head, body);
  wrap.append(table);
  return wrap;
}

/**
 * Render one short, evidence-first game-plan column. The model returns plain
 * data rather than DOM so it can be unit tested independently of the page;
 * this helper is the only browser-specific presentation layer for it.
 */
function renderOpponentPlanPriorities({ heading, description, priorities = [] }) {
  const section = document.createElement("section");
  section.className = "opponent-plan__column";
  const title = document.createElement("h5");
  title.textContent = heading;
  const note = document.createElement("p");
  note.textContent = description;
  const list = document.createElement("ul");
  for (const planPriority of priorities) {
    const item = document.createElement("li");
    const label = document.createElement("strong");
    label.textContent = planPriority.label;
    const evidence = document.createElement("span");
    evidence.textContent = planPriority.evidence;
    item.append(label, evidence);
    list.append(item);
  }
  section.append(title, note, list);
  return section;
}

/** Show a compact factual contributor list without inventing player matchups. */
function renderOpponentThreats(threats = []) {
  if (!Array.isArray(threats) || threats.length === 0) return null;
  const section = document.createElement("section");
  section.className = "opponent-plan__threats detailed-only";
  const heading = document.createElement("h5");
  heading.textContent = "Historical contributors to know";
  const note = document.createElement("p");
  note.textContent = "These are shares of the selected team's recorded totals, not live matchup assignments.";
  const list = document.createElement("ul");
  for (const threat of threats.slice(0, 4)) {
    const item = document.createElement("li");
    const label = document.createElement("strong");
    label.textContent = `${threat.label}: ${threat.playerName}`;
    const evidence = document.createElement("span");
    evidence.textContent = threat.description;
    item.append(label, evidence);
    list.append(item);
  }
  section.append(heading, note, list);
  return section;
}

function createOpponentTeamMark(source) {
  const mark = document.createElement("span");
  mark.className = "opponent-swishiq__logo";
  mark.setAttribute("aria-hidden", "true");
  mark.textContent = source.team || "NBA";
  const logoUrl = safeExternalImageUrl(source.teamLogoUrl);
  if (!logoUrl) return mark;

  const image = document.createElement("img");
  image.className = "opponent-swishiq__logo-image";
  image.alt = "";
  image.width = 58;
  image.height = 58;
  image.loading = "eager";
  image.decoding = "async";
  image.addEventListener("load", () => image.classList.add("is-loaded"), { once: true });
  image.addEventListener("error", () => image.remove(), { once: true });
  image.src = logoUrl;
  mark.append(image);
  return mark;
}

function renderOpponentSwishIQ() {
  const source = state.opponentDataset?.source || {};
  const averages = source.teamAverages;
  const rotation = Array.isArray(source.rotation) ? source.rotation : [];
  if (!averages || rotation.length === 0) {
    throw new Error("This saved team-season does not include the totals needed for a historical game plan yet.");
  }

  // The pure model creates a new recommendation from a balanced, visible
  // baseline every time. It never reads a historical player's workload as a
  // target and it does not mutate the current scenario until Apply is clicked.
  const strategy = buildOpponentGamePlan({
    ownDataset: state.dataset,
    opponentDataset: state.opponentDataset,
    baselineFamilyWeights: DEFAULT_FAMILY_PRESETS.balanced,
  });
  state.opponentStrategy = strategy;

  const fragment = document.createDocumentFragment();
  const teamHeader = document.createElement("div");
  teamHeader.className = "opponent-swishiq__team detailed-only";
  teamHeader.append(createOpponentTeamMark(source));
  const teamCopy = document.createElement("div");
  const teamTitle = document.createElement("h4");
  teamTitle.textContent = `${source.teamName || teamNameForCode(source.team)} ${source.season}`;
  const teamNote = document.createElement("p");
  const phase = source.seasonPhase === "playoffs" ? "playoffs" : "regular season";
  const gameCount = source.teamGames !== null
    && source.teamGames !== undefined
    && Number.isFinite(Number(source.teamGames))
    && Number(source.teamGames) > 0
    ? `${source.teamGames}-game`
    : "Sample size unavailable";
  teamNote.textContent = `${gameCount} historical sample for the ${phase}. Team totals include only games recorded for this team, so a traded player's other-team production is not mixed in.`;
  teamCopy.append(teamTitle, teamNote);
  teamHeader.append(teamCopy);
  fragment.append(teamHeader);

  const stats = document.createElement("dl");
  stats.className = "opponent-swishiq__stats detailed-only";
  const ownAverages = state.dataset?.source?.teamAverages || {};
  const deltaNote = document.createElement("p");
  deltaNote.className = "opponent-swishiq__delta-note detailed-only";
  deltaNote.textContent = `The comparison below is per game. The game plan uses ${strategy.comparison.rateBasisLabel} when both teams have the needed totals; positive turnover differences remain worse.`;
  const statRows = [
    ["points", "PTS", false],
    ["rebounds", "REB", false],
    ["assists", "AST", false],
    ["steals", "STL", false],
    ["blocks", "BLK", false],
    ["turnovers", "TOV", false],
    ["efgPct", "eFG%", true],
    ["threePct", "3P%", true],
  ];
  for (const [metric, label, percentage] of statRows) {
    const ownValue = Number(ownAverages[metric]);
    const opponentValue = Number(averages[metric]);
    const item = document.createElement("div");
    const term = document.createElement("dt");
    term.textContent = label;
    const detail = document.createElement("dd");
    // "Current minus opponent" is used consistently for every stat. Turnover
    // deltas remain literal (and are explicitly labeled lower-is-better) so the
    // display never quietly flips a sourced number to make it look favorable.
    for (const [valueLabel, value] of [
      ["Current", percentage ? formatPercent(ownValue) : formatNumber(ownValue)],
      ["Opponent", percentage ? formatPercent(opponentValue) : formatNumber(opponentValue)],
      ["Δ current−opp.", formatSignedDifference(ownValue - opponentValue, { percentagePoints: percentage })],
    ]) {
      const valueWrap = document.createElement("span");
      const small = document.createElement("small");
      small.textContent = valueLabel;
      const strong = document.createElement("strong");
      strong.textContent = value;
      valueWrap.append(small, strong);
      detail.append(valueWrap);
    }
    if (metric === "turnovers") term.append(document.createTextNode(" · lower is better"));
    item.append(term, detail);
    stats.append(item);
  }
  fragment.append(deltaNote, stats);

  const rotationSection = document.createElement("section");
  rotationSection.className = "opponent-swishiq__section detailed-only";
  const rotationHeading = document.createElement("h4");
  rotationHeading.textContent = "Who played most for this team";
  const rotationNote = document.createElement("p");
  rotationNote.textContent = "The nine largest shares of the selected historical team's minutes. This is not a live depth chart, injury report, or a minute setting for your lineup.";
  const rotationGrid = document.createElement("div");
  rotationGrid.className = "opponent-swishiq__rotation";
  for (const player of rotation) {
    const item = document.createElement("article");
    item.className = "opponent-player";
    item.append(createPlayerAvatar(player, "opponent-player__avatar"));
    const copy = document.createElement("div");
    const name = document.createElement("strong");
    name.textContent = player.name;
    const context = document.createElement("small");
    const positions = Array.isArray(player.positions) ? player.positions.join("/") : String(player.positions || "-");
    context.textContent = `${positions} · ${formatNumber(player.minutesPerTeamGame)} minutes per team game`;
    copy.append(name, context);
    item.append(copy);
    rotationGrid.append(item);
  }
  rotationSection.append(rotationHeading, rotationNote, rotationGrid);
  fragment.append(rotationSection);

  const counter = document.createElement("section");
  counter.className = "opponent-swishiq__counter opponent-swishiq__section";
  const counterHeading = document.createElement("h4");
  counterHeading.textContent = "Recommended game-plan priorities";
  const counterNote = document.createElement("p");
  counterNote.textContent = "This preview starts from a balanced plan and uses the displayed historical team totals. Previewing it changes nothing; Apply updates only the six visible priorities and can be undone here.";
  const priorities = document.createElement("div");
  priorities.className = "opponent-plan__priorities";
  priorities.append(
    renderOpponentPlanPriorities({
      heading: "Defend their strengths",
      description: "What the historical opponent profile asks your lineup to handle.",
      priorities: strategy.defendTheirStrengths,
    }),
    renderOpponentPlanPriorities({
      heading: "Protect your offense",
      description: "A cautious response to their steals-and-blocks signal, not a claim about their overall defense.",
      priorities: strategy.protectYourOffense,
    }),
  );
  const threats = renderOpponentThreats(strategy.threats);
  const caveats = document.createElement("p");
  caveats.className = "opponent-plan__caveat detailed-only";
  caveats.textContent = strategy.caveats.join(" ");
  const applyButton = document.createElement("button");
  applyButton.className = "button button--quiet";
  applyButton.type = "button";
  const suggestionAlreadyApplied = objectiveWeightsMatch(state.weights, strategy.weights);
  applyButton.textContent = suggestionAlreadyApplied ? "Game-plan priorities applied" : "Apply game-plan priorities";
  applyButton.disabled = suggestionAlreadyApplied;
  applyButton.addEventListener("click", () => {
    // Keep one deliberate undo boundary. A later manual slider or preset edit
    // clears this snapshot because reverting through unrelated user changes
    // would be surprising.
    state.opponentWeightUndo = {
      weights: { ...state.weights },
      familyWeights: { ...state.familyWeights },
      activePreset: state.activePreset,
    };
    state.familyWeights = { ...strategy.familyWeights };
    state.weights = { ...strategy.weights };
    state.activePreset = "custom";
    renderPresetState();
    renderWeightControls();
    updateRunSummary();
    markScenarioChanged();
    renderOpponentSwishIQ();
    showToast(`Historical game-plan priorities applied for ${source.teamName || source.team}.`);
  });
  const actions = document.createElement("div");
  actions.className = "opponent-swishiq__actions";
  actions.append(applyButton);
  if (state.opponentWeightUndo) {
    const undoButton = document.createElement("button");
    undoButton.className = "text-button";
    undoButton.type = "button";
    undoButton.textContent = "Undo game-plan priorities";
    undoButton.addEventListener("click", () => {
      const prior = state.opponentWeightUndo;
      if (!prior) return;
      state.weights = { ...prior.weights };
      state.familyWeights = { ...prior.familyWeights };
      state.activePreset = prior.activePreset;
      state.opponentWeightUndo = null;
      renderPresetState();
      renderWeightControls();
      updateRunSummary();
      markScenarioChanged();
      renderOpponentSwishIQ();
      showToast("Previous lineup priorities restored.");
    });
    actions.append(undoButton);
  }
  counter.append(
    counterHeading,
    counterNote,
    priorities,
    ...(threats ? [threats] : []),
    caveats,
    renderCounterWeightPreview(strategy),
    actions,
  );
  fragment.append(counter);

  elements.opponentSwishIQSummary.replaceChildren(fragment);
  elements.opponentSwishIQSummary.hidden = false;
  // The optional section starts collapsed so it does not slow the main build,
  // but reveal the completed evidence when a visitor explicitly asked for it.
  elements.opponentSwishIQ.open = true;
  setOpponentSwishIQStatus(
    `${source.teamName || source.team} ${source.season} game plan ready. Review the historical stats and optional priority preview below.`,
    "success",
  );
}

async function loadOpponentSwishIQ() {
  if (!v3PackageSourceSelected()) {
    normalizeRetiredImportedSource({ clearSelections: true });
    clearOpponentSwishIQ(RETIRED_IMPORTED_SOURCE_MESSAGE);
    await populateLiveDataControls();
    setLiveDataStatus(RETIRED_IMPORTED_SOURCE_MESSAGE, "warning");
    return;
  }
  if (state.opponentLoading || state.liveDataLoading) return;
  const selection = selectionFromControls();
  if (!liveSelectionMatches(state.loadedLiveSelection, selection)) {
    clearOpponentSwishIQ("Apply the selected team-season above before building an opponent game plan.");
    return;
  }
  const team = elements.opponentTeam.value;
  if (!team || team === selection.team) {
    setOpponentSwishIQStatus("Choose a different team from the same season and phase.", "error");
    return;
  }

  const teamName = teamNameForCode(team);
  let staleResponseMessage = "";
  setOpponentLoading(true);
  setOpponentSwishIQStatus(`Loading ${teamName} ${nbaSeasonLabel(selection.season)} historical profile...`);
  try {
    const v3Source = v3PackageSourceSelected();
    const cached = v3Source ? null : readCachedLiveDataset(team, selection.season, selection.seasonPhase);
    const dataset = v3Source
      ? (await loadSwishIqV3TeamDataset({
        team,
        seasonEndYear: selection.season,
        seasonPhase: selection.seasonPhase,
      })).dataset
      : cached?.fresh
        ? cached.dataset
        : await fetchSupabaseNbaTeamDataset({
          team,
          season: selection.season,
          seasonPhase: selection.seasonPhase,
        });
    if (!v3Source && !cached?.fresh) cacheLiveDataset(team, selection.season, selection.seasonPhase, dataset);

    // The primary team, season, phase, or opponent can change while Supabase is
    // responding. Accept the result only when it still belongs to both the
    // loaded player pool and the controls that launched this request; otherwise
    // an older swishiq could be displayed (and its weights applied) to a newer
    // scenario.
    const currentSelection = selectionFromControls();
    const requestStillMatches = liveSelectionMatches(currentSelection, selection)
      && liveSelectionMatches(state.loadedLiveSelection, selection)
      && elements.opponentTeam.value === team;
    if (!requestStillMatches) {
      state.opponentDataset = null;
      state.opponentStrategy = null;
      state.opponentWeightUndo = null;
      elements.opponentSwishIQSummary.hidden = true;
      elements.opponentSwishIQSummary.replaceChildren();
      staleResponseMessage = "The team, season, phase, or opponent changed while the profile was loading. Load the selected team-season, then build the game plan again.";
      return;
    }

    state.opponentDataset = dataset;
    renderOpponentSwishIQ();
  } catch (error) {
    state.opponentDataset = null;
    state.opponentStrategy = null;
    state.opponentWeightUndo = null;
    elements.opponentSwishIQSummary.hidden = true;
    setOpponentSwishIQStatus("Opponent stats could not be loaded. Try again or choose another team.", "error");
  } finally {
    setOpponentLoading(false);
    // setOpponentLoading repopulates the opponent control and may publish its
    // generic pending-selection hint. Restore the more useful race explanation
    // after that housekeeping finishes.
    if (staleResponseMessage) setOpponentSwishIQStatus(staleResponseMessage, "warning");
  }
}

function teamValues() {
  return [...new Set((state.dataset?.players || []).map((player) => player.team).filter(Boolean))];
}

function currentPlayer(id) {
  return state.dataset?.players.find((player) => player.id === id) || null;
}

/**
 * Apply the visitor's position-flexibility assumption without mutating the
 * imported Basketball Reference row.
 *
 * The source records listed positions, not possession-level position minutes.
 * The default therefore separates two kinds of evidence:
 *   1. positions listed for this team-season can cover a full role;
 *   2. extra positions verified on the player's career profile can help, but
 *      are capped at 24 rotation role-minutes as a conservative assumption.
 *
 * "Open" removes that assumption, while "Strict" ignores career-only roles.
 * CSV/demo players without structured evidence retain their supplied positions
 * in every policy because the app cannot safely infer a narrower list.
 */
function playersForPositionPolicy(players, policy, mode) {
  const normalizedPolicy = ["recommended", "open", "seasonOnly"].includes(policy)
    ? policy
    : "recommended";
  return players.map((player) => {
    const listed = Array.isArray(player?.positionEvidence?.seasonListed)
      ? player.positionEvidence.seasonListed.filter((position) => ["G", "F", "C"].includes(position))
      : [];
    const verified = Array.isArray(player.positions)
      ? player.positions.filter((position) => ["G", "F", "C"].includes(position))
      : [];
    if (listed.length === 0) {
      return { ...player, positions: [...verified], positionMinuteCaps: {} };
    }
    if (normalizedPolicy === "seasonOnly") {
      return { ...player, positions: [...new Set(listed)], positionMinuteCaps: {} };
    }
    if (normalizedPolicy === "open" || mode !== "rotation") {
      return { ...player, positions: [...new Set(verified)], positionMinuteCaps: {} };
    }

    const listedSet = new Set(listed);
    const positionMinuteCaps = {};
    for (const position of verified) {
      if (!listedSet.has(position)) positionMinuteCaps[position] = 24;
    }
    return {
      ...player,
      positions: [...new Set(verified)],
      positionMinuteCaps,
    };
  });
}

function optimizerPlayersForCurrentScenario() {
  return playersForPositionPolicy(
    state.dataset?.players || [],
    elements.positionFlexibility.value,
    elements.mode.value,
  );
}

function applyPreset(uiPreset, { announce = false, invalidate = true } = {}) {
  const enginePreset = UI_TO_ENGINE_PRESET[uiPreset] || "balanced";
  const familyPreset = DEFAULT_FAMILY_PRESETS[enginePreset] || DEFAULT_FAMILY_PRESETS.balanced;
  state.activePreset = uiPreset;
  state.familyWeights = { ...familyPreset };
  state.weights = weightsFromSkillFamilies(state.familyWeights);
  renderPresetState();
  renderWeightControls();
  updateRunSummary();
  if (invalidate) markScenarioChanged();
  if (invalidate && state.opponentDataset) {
    state.opponentWeightUndo = null;
    renderOpponentSwishIQ();
  }
  if (announce) showToast(`${PRESET_LABELS[uiPreset]} strategy loaded.`);
}

function renderPresetState() {
  $("#priorityMixLabel").textContent = `(${PRESET_LABELS[state.activePreset] || "Custom Mix"})`;
  $$("[data-preset]").forEach((button) => {
    const selected = button.dataset.preset === state.activePreset;
    // Keep a selected specialized preset visible when changing detail level.
    // Simplifying the page must not silently change the objective it solves.
    const specialized = !["balanced", "offense", "defense"].includes(button.dataset.preset);
    button.classList.toggle("detailed-only", specialized && !selected);
    button.classList.toggle("is-active", selected);
    button.setAttribute("aria-pressed", String(selected));
  });
}

function renderWeightControls() {
  const sharesByFamily = normalizedFamilyShares(state.familyWeights);
  $$('[data-family]').forEach((input) => {
    input.value = String(state.familyWeights[input.dataset.family] ?? 0);
    const output = input.parentElement.querySelector("output");
    const share = sharesByFamily.get(input.dataset.family) || 0;
    output.textContent = `${share}%`;
    input.setAttribute("aria-valuetext", `${share} percent of the current game-plan focus`);
  });
  renderWeightShareSummary();
}

/**
 * Return whole-number shares that add to exactly 100 using deterministic
 * largest-remainder rounding. The sliders remain independent raw controls; the
 * displayed percentages describe the proportional objective the solver sees.
 */
function normalizedFamilyShares(familyWeights) {
  const entries = Object.entries(familyWeights)
    .map(([family, value]) => ({ family, value: Math.max(0, Number(value) || 0) }))
    .filter((item) => item.value > 0);
  const total = entries.reduce((sum, item) => sum + item.value, 0);
  if (!(total > 0)) return new Map();
  const values = entries.map((item) => ({
    ...item,
    exactShare: (item.value / total) * 100,
    share: Math.floor((item.value / total) * 100),
  }));
  let remaining = 100 - values.reduce((sum, item) => sum + item.share, 0);
  values
    .slice()
    .sort((left, right) =>
      (right.exactShare - right.share) - (left.exactShare - left.share)
      || left.family.localeCompare(right.family))
    .slice(0, remaining)
    .forEach((winner) => {
      const row = values.find((item) => item.family === winner.family);
      row.share += 1;
      remaining -= 1;
    });
  return new Map(values.map(({ family, share }) => [family, share]));
}

/**
 * Translate raw slider values into the proportions the solver actually uses.
 * This prevents the controls from looking like a hidden scoring scale:
 * 20 / 10 / 0 and 2 / 1 / 0 are intentionally the same strategy.
 */
function renderWeightShareSummary() {
  const sharesByFamily = normalizedFamilyShares(state.familyWeights);
  if (sharesByFamily.size === 0) {
    elements.weightShareSummary.textContent = "Choose at least one priority above zero.";
    return;
  }
  const shares = [...sharesByFamily.entries()]
    .map(([family, share]) => ({
      label: FAMILY_LABELS[family] || titleCase(family),
      share,
    }))
    .sort((left, right) => right.share - left.share || left.label.localeCompare(right.label));
  elements.weightShareSummary.textContent = `Current focus: ${shares.map(({ label, share }) => `${label} ${share}%`).join(" · ")}.`;
}

function selectedRotationPositionRequirements() {
  if (elements.rotationPositionProfile.value === "automatic") {
    return deriveHistoricalPositionMinuteRequirements(
      state.dataset?.players || [],
      appearanceMinuteAnchorsForPositionMix(),
    );
  }
  const selected = ROTATION_POSITION_PROFILES[elements.rotationPositionProfile.value]
    || ROTATION_POSITION_PROFILES.traditional;
  return { ...selected };
}

function selectedRotationPositionRanges() {
  if (elements.rotationPositionProfile.value !== "automatic") return null;
  return assessHistoricalPositionMinuteEvidence(
    state.dataset?.players || [],
    appearanceMinuteAnchorsForPositionMix(),
  ).ranges;
}

/**
 * Estimate the roster's sensible position mix from minutes per appearance,
 * never from games played or total minutes accumulated with this team. A
 * traded player averaging 34 minutes therefore contributes the same role
 * evidence whether this team row contains five games or fifty. Automatic
 * targets are role-mix centers; exact stint evidence is unavailable, so the
 * optimizer allocates any feasible 240-minute split inside the displayed
 * ranges.
 */
function appearanceMinuteAnchorsForPositionMix() {
  return Object.fromEntries((state.dataset?.players || [])
    .map((player) => [player.id, Number(player.minutes)])
    .filter(([, minutes]) => Number.isFinite(minutes) && minutes > 0));
}

/**
 * Build regulation-game workload anchors for the optional *display-only*
 * comparison beneath a Detailed result. Live rows carry aggregate player/team
 * minutes; older snapshots reconstruct the same historical share. These values
 * are no longer passed into Lineup Lab's optimizer, position target, or minute
 * allocator. Keeping the calculation here prevents reporting code from being
 * mistaken for a model input later.
 */
function historicalMinuteAnchorsForCurrentDataset() {
  const players = state.dataset?.players || [];
  const sourceTeamGames = Number(state.dataset?.source?.teamGames);
  const fallbackTeamGames = Math.max(...players.map((player) => Number(player.games) || 0), 0);
  const teamGames = sourceTeamGames > 0 ? sourceTeamGames : fallbackTeamGames;
  const anchors = {};
  for (const player of players) {
    const direct = Number(player.analytics?.historicalMinutesPerTeamGame);
    const totalMinutes = Number(player.analytics?.totals?.minutes);
    const teamTotalMinutes = Number(player.analytics?.teamTotalMinutes);
    const derivedFromTeamTotals = totalMinutes > 0 && teamTotalMinutes > 0
      ? (240 * totalMinutes) / teamTotalMinutes
      : null;
    const reconstructed = teamGames > 0
      ? ((Number(player.games) || 0) * (Number(player.minutes) || 0)) / teamGames
      : null;
    const anchor = direct > 0
      ? direct
      : derivedFromTeamTotals > 0
        ? derivedFromTeamTotals
        : reconstructed;
    if (Number.isFinite(anchor) && anchor > 0) anchors[player.id] = anchor;
  }
  return anchors;
}

/**
 * Give fans a useful confidence check before they run an exact search. This is
 * intentionally a source-coverage preview, not a claim that every eventual
 * selected player will be available or that a historical rotation is optimal.
 */
function syncSimpleModelSummaryCopy() {
  const players = state.dataset?.players || [];
  if (players.length === 0) {
    elements.simpleModelSummaryCopy.textContent = "Choose a team and season to see the available sample and rotation settings.";
    elements.simpleModelSummaryNote.textContent = "Simple mode explains data gaps instead of filling them with guessed values.";
    return;
  }
  const seasonEvidenceCount = players.filter((player) => (
    player.analytics?.seasonEvidence?.scope === "season-wide"
    && player.analytics?.seasonTotals
  )).length;
  if ($("#modelModeInput").value === "swishiq-impact") {
    elements.simpleModelSummaryCopy.textContent = isCanonicalV4NativeImpactLoaded()
      ? "Native V4 Impact compares mean offense and defense coefficients for the exact historical regular-season roster. Position rules and hard minute limits still apply."
      : "SwishIQ Impact ranks player-impact estimates for your offense, defense, or balanced objective. Position rules and hard minute limits still apply.";
    elements.simpleModelSummaryNote.textContent = isCanonicalV4NativeImpactLoaded()
      ? "The evidence supports historical conditional scoring for observed paired lineups. It does not estimate player uncertainty, predict a coaching rotation, validate hypothetical lineups, or forecast a game."
      : "Complete player data for the selected team-season are required. This is an impact estimate, not a game forecast or predicted coaching rotation.";
    return;
  }
  if (elements.mode.value !== "rotation") {
    elements.simpleModelSummaryCopy.textContent = "The optimizer compares five equal player profiles using sample-adjusted per-36 rates where matching counts and baselines are available. Shooting accuracy and attempt frequency are considered separately. The visible sample filters decide who is eligible.";
    elements.simpleModelSummaryNote.textContent = "Recommended sample and position rules are already active. Open Detailed only to change them.";
  } else {
    elements.simpleModelSummaryCopy.textContent = "The optimizer follows your game plan and hard minute limits. Historical rates are adjusted when samples are limited; workload changes are applied only by the selected projection. There is no preferred 18–32 minute range.";
    elements.simpleModelSummaryNote.textContent = seasonEvidenceCount > 0
      ? "Counts across teams inform rate confidence, not minute limits. Missing metrics are not filled with guessed counts; some samples may be incomplete."
      : "Better-supported rates can justify larger roles. The model uses matching team counts when available; missing metrics receive a baseline-only prior, not a guessed sample."
  }
}

function rotationPositionProfileForRequirements(requirements) {
  if (!requirements || typeof requirements !== "object") return "automatic";
  const namedProfile = Object.entries(ROTATION_POSITION_PROFILES).find(([, profile]) => (
    profile.G === Number(requirements.G)
    && profile.F === Number(requirements.F)
    && profile.C === Number(requirements.C)
  ))?.[0];
  if (namedProfile) return namedProfile;
  const automatic = deriveHistoricalPositionMinuteRequirements(
    state.dataset?.players || [],
    appearanceMinuteAnchorsForPositionMix(),
  );
  if (["G", "F", "C"].every((position) => automatic[position] === Number(requirements[position]))) {
    return "automatic";
  }
  return "automatic";
}

function syncRotationModelControls() {
  // The legacy core can still reproduce old experiments, but this product no
  // longer exposes or sends the team-stint workload guardrail. Force the
  // reviewed product rule even if a stale DOM value or shared URL says otherwise.
  elements.rotationMinutePlan.value = LINEUP_LAB_ROTATION_MINUTE_PLAN;
  // Retain these elements only for backward-compatible snapshots and URL
  // decoding. They are permanently hidden and disabled in the product UI.
  elements.rotationFlexibilityField.hidden = true;
  elements.rotationAllocationStyleField.hidden = true;
  elements.rotationFlexibility.disabled = true;
  elements.rotationFlexibilityField.classList.add("is-disabled");
  elements.rotationFlexibilityField.title = "Past team usage is display context only";
  elements.rotationAllocationStyle.disabled = true;
  elements.rotationAllocationStyleField.classList.add("is-disabled");
  elements.rotationAllocationStyleField.title = "Game-plan optimization always uses the user objective inside the hard player limits";
  elements.rotationMinutePlanHelp.replaceChildren(
    Object.assign(document.createElement("strong"), {
      textContent: "Game-plan optimization: ",
    }),
    document.createTextNode(
      "past team games and total minutes do not restrict the plan. The optimizer assigns players inside your hard limits according to the game plan, while it adjusts low-opportunity rates conservatively.",
    ),
  );
  elements.rotationAllocationStyleHelp.replaceChildren(
    Object.assign(document.createElement("strong"), {
      textContent: "Past usage is context only: ",
    }),
    document.createTextNode("The length of a player's stay with a team never sets their minute target or cap. Matching all-team season totals can inform the estimated rate and its sample size."),
  );

  const usesPer36Rates = elements.rotationScoringBasis.value === "per36";
  if (!usesPer36Rates) {
    if (elements.rotationRateStability.value !== "raw") {
      elements.rotationRateStability.dataset.per36Value = elements.rotationRateStability.value;
    }
    elements.rotationRateStability.value = "raw";
  } else if (elements.rotationRateStability.dataset.per36Value) {
    elements.rotationRateStability.value = elements.rotationRateStability.dataset.per36Value;
    delete elements.rotationRateStability.dataset.per36Value;
  }
  elements.rotationRateStability.disabled = !usesPer36Rates;
  elements.rotationRateStabilityField.classList.toggle("is-disabled", !usesPer36Rates);
  elements.rotationRateStabilityField.title = usesPer36Rates
    ? "Choose how limited samples affect per-36 rates"
    : "Per-game comparison uses raw rates, so sample adjustment does not apply";
  elements.rotationRateStabilityHelp.textContent = usesPer36Rates
    ? "Accuracy and shooting frequency receive separate uncertainty reserves. These adjustments are not calibrated player confidence intervals. More minutes do not imply star-level usage or a fixed target range."
    : "Per-game comparison uses recorded per-game lines. Limited-sample adjustment is available only with per-36 comparison.";
  syncModelChoice();
  syncSimpleModelSummaryCopy();
}

function rotationModelSummary() {
  return "Conservative rates · exact 240-minute plan";
}

function syncRotationRoleCopy(isRotation = elements.mode.value === "rotation") {
  const roleMinutes = selectedRotationPositionRequirements();
  const automatic = elements.rotationPositionProfile.value === "automatic";
  const softRanges = automatic ? selectedRotationPositionRanges() : null;
  const positionPolicy = elements.positionFlexibility.value;
  const policyCopy = positionPolicy === "seasonOnly"
    ? "Strict uses only the position listed for this team-season."
    : positionPolicy === "open"
      ? "Open lets any listed career position cover an unrestricted role."
      : isRotation
        ? "Realistic leaves season-listed roles unrestricted and caps each career-only secondary role at 24 rotation minutes."
        : "Realistic allows listed career positions; each player can still fill only one required lineup slot.";
  const softRangeCopy = softRanges
    ? `Allowed automatic ranges are G ${softRanges.G.min}–${softRanges.G.max}, F ${softRanges.F.min}–${softRanges.F.max}, and C ${softRanges.C.min}–${softRanges.C.max} minutes around the listed-position estimate.`
    : `The selected manual mix is exactly G ${roleMinutes.G}, F ${roleMinutes.F}, and C ${roleMinutes.C} minutes.`;
  elements.positionCoverageHelp.textContent = isRotation
    ? `Multi-position players may cover any listed position, but only one court role at a time. ${automatic ? `Season-listed positions and minutes per appearance suggest a center of G ${roleMinutes.G}, F ${roleMinutes.F}, and C ${roleMinutes.C} minutes; these are soft ranges, not observed assignments. ${softRangeCopy}` : softRangeCopy} ${policyCopy}`
    : `Multi-position players may cover any listed position, but only one court role at a time. ${policyCopy} For example, a PF-C may fill a forward or center requirement, never both slots at once.`;
  elements.rotationMinutesHelp.textContent = automatic
    ? `The 240-minute plan assigns one court role per minute within the automatic soft ranges. The estimated center is G ${roleMinutes.G}, F ${roleMinutes.F}, and C ${roleMinutes.C}; season labels do not reveal exact historical stints.`
    : `The 240-minute plan covers exactly ${roleMinutes.G} guard, ${roleMinutes.F} forward, and ${roleMinutes.C} center minutes.`;
  elements.rotationPositionProfile.title = automatic
    ? "Soft ranges around an estimate from season-listed positions and minutes per appearance. Exact position stints are unavailable."
    : "A manual advanced position-minute experiment";
  syncSampleFilterHelp();
}

function setMobileResultCurrent(current) {
  elements.mobileSolveBar.classList.toggle("is-result-current", current);
  if (current) {
    elements.mobileSolveLabel.textContent = "Result up to date ✓";
    return;
  }
  // The success state becomes an inline confirmation on narrow screens rather
  // than a persistent overlay, so it cannot cover player cards while someone
  // reads their result. Restore the actionable scenario label as soon as an
  // input changes so mobile users and assistive technology never hear stale
  // success feedback.
  elements.mobileSolveLabel.textContent = elements.mode.value === "rotation"
    ? `${numberFromInput(elements.size, 9)}-player rotation · all 240 team minutes`
    : "Starting five";
}

function updateRunSummary() {
  const modeLabel = elements.mode.value === "rotation"
    ? `${numberFromInput(elements.size, 9)}-player rotation · all 240 team minutes`
    : "Starting five";
  elements.runModeSummary.textContent = modeLabel;
  if (!elements.mobileSolveBar.classList.contains("is-result-current")) {
    elements.mobileSolveLabel.textContent = modeLabel;
  }
  elements.runPresetSummary.textContent = $("#modelModeInput").value === "swishiq-impact"
    ? `SwishIQ Impact · ${swishiqPrioritySummary()}`
    : PRESET_LABELS[state.activePreset] || "Custom mix";
  const isRotation = elements.mode.value === "rotation";
  elements.runMinuteModelRow.hidden = !isRotation;
  elements.runMinuteModelSummary.textContent = rotationModelSummary();
  elements.runLockedSummary.textContent = String(state.lockedIds.size);
  elements.runExcludedSummary.textContent = String(state.excludedIds.size);
  updateSearchScope();
}

function cancelOptimization(message = "Optimization cancelled because the scenario changed.") {
  // A solve has two stages: one animation-frame yield and then a Worker task.
  // Advancing the token invalidates both stages, including the brief interval
  // before a Worker instance exists, so an older solve can never repaint a
  // newer scenario or re-enable its controls out of order.
  const nextToken = state.optimizationRunId += 1;
  state.optimizationWorker?.terminate();
  state.optimizationWorker = null;
  const reject = state.optimizationReject;
  state.optimizationReject = null;
  state.activeOptimizationToken = null;
  elements.form.removeAttribute("aria-busy");
  setOptimizationCancellationAvailable(false);
  workflowView?.cancelled();
  if (reject) {
    const error = new Error(message);
    error.name = "AbortError";
    reject(error);
  }
  return nextToken;
}

function clearRenderedResult({ heading = "Your result will appear here", copy = "Pick a strategy, set any must-have rules, and run the optimizer. You will get a best group, alternatives, and a constraint check." } = {}) {
  state.lastResult = null;
  state.lastResultFamilyWeights = null;
  state.lastOptimizerRequest = null;
  setMobileResultCurrent(false);
  elements.results.classList.remove("is-stale");
  elements.resultFreshness.hidden = true;
  elements.resultFreshness.textContent = "";
  elements.results.hidden = true;
  elements.emptyResult.hidden = false;
  elements.emptyResultHeading.textContent = heading;
  elements.emptyResultCopy.textContent = copy;
  elements.copyResult.disabled = true;
  elements.downloadResult.disabled = true;
  elements.shareResult.disabled = true;
  elements.shareResultHelp.hidden = true;
  elements.shareScenario.disabled = true;
  elements.printReport.disabled = true;
}

function markScenarioChanged() {
  state.scenarioVersion += 1;
  state.lastOptimizerRequest = null;
  setMobileResultCurrent(false);
  state.replacementAnalyses.clear();
  if (state.optimizationWorker || state.activeOptimizationToken !== null || state.replacementRunToken !== null) cancelOptimization();
  if (state.replacementRunToken !== null) {
    finishPendingReplacement("The scenario changed. Run the optimizer again before testing replacements.");
  }
  if (state.lastResult) {
    elements.results.classList.add("is-stale");
    elements.resultFreshness.hidden = false;
    elements.resultFreshness.textContent = "Settings changed after this result was calculated. Run the optimizer again before copying or downloading it.";
    elements.copyResult.disabled = true;
    elements.downloadResult.disabled = true;
    elements.shareResult.disabled = true;
    elements.shareResultHelp.hidden = true;
    elements.shareScenario.disabled = true;
    elements.printReport.disabled = true;
    setSolverStatus("Settings changed - update the result", "warning");
  } else {
    setSolverStatus(state.searchScopeCanRun ? "Ready with your latest settings" : "Not ready to solve",
      state.searchScopeCanRun ? undefined : "warning");
  }
  setOptimizeButtons({ label: solveActionLabel({ update: Boolean(state.lastResult) }) });
  updateSearchScope();
  workflowView?.changed();
}

function setMode(mode, { preserveSize = false } = {}) {
  syncChoiceButtonGroup(elements.mode);
  const isRotation = mode === "rotation";
  // Usage scenarios have no effect on a five-player profile without minutes.
  // Hide and disable them there; retained values return with rotation mode.
  $$(".player-usage-scenario").forEach(label => {
    label.hidden = !isRotation;
    label.querySelector("input").disabled = !isRotation || state.experienceMode !== "detailed";
  });
  elements.usageScenarioControls.hidden = !isRotation || state.experienceMode !== "detailed";
  elements.rotationSettings.hidden = !isRotation;
  syncProjectionRiskControl();
  elements.rotationScoringBasisField.hidden = !isRotation;
  elements.sizeField.hidden = !isRotation;
  syncRotationModelControls();
  const productionQualifier = document.createElement("span");
  productionQualifier.textContent = "(optional requirements)";
  elements.productionRulesLegend.replaceChildren(
    document.createTextNode(isRotation ? "Conservative production limits " : "Combined player profiles "),
    productionQualifier,
  );
  elements.productionRulesHelp.textContent = isRotation
    ? "These rules evaluate sample-adjusted production at each player's assigned minutes—the same workload model used in the result. Reliable and Balanced include a downside reserve; these are planning totals, not guarantees. Your objective still chooses minutes within your limits."
    : "In lineup mode, these rules add each selected player's historical per-game line. They describe the five-player profile; they do not forecast one team box score.";
  syncRotationRoleCopy(isRotation);
  elements.size.min = isRotation ? "8" : "5";
  elements.size.max = isRotation ? "12" : "5";
  if (!preserveSize) elements.size.value = isRotation ? "9" : "5";
  if (isRotation) {
    elements.minGuards.value = "3";
    elements.minForwards.value = "3";
    elements.minCenters.value = "2";
  } else {
    elements.minGuards.value = "2";
    elements.minForwards.value = "2";
    elements.minCenters.value = "1";
  }
  updateRunSummary();
}

function recommendedMinimumGames(seasonPhase, mode = "lineup") {
  // A rotation's conservative role/volume projection already handles limited
  // evidence. Applying a hidden team-stint games floor on top would exclude a
  // traded player solely because fewer appearances came with this team—the
  // exact behavior the product now forbids. Starting-five mode keeps a modest,
  // visible sample filter because it has no minute/role projection layer.
  if (mode === "rotation") return 0;
  // Keep the lineup-only default phase-aware so a short postseason is not
  // treated like an 82-game regular season.
  return seasonPhase === "playoffs" ? 3 : 20;
}

function recommendedMinimumMinutes(mode, seasonPhase) {
  // A regular-season rotation should be built from players who held a genuine
  // repeatable role. Postseason samples are shorter and benches tighten, so the
  // floor is intentionally lower there. Detailed mode still exposes the exact
  // field for historical edge cases and deliberate experiments.
  if (seasonPhase === "playoffs") return mode === "rotation" ? 4 : 3;
  return mode === "rotation" ? 8 : 6;
}

/**
 * Explain the sample filters in the context of the active build type.
 *
 * Games and source MPG decide who is eligible for the player pool; they never
 * become minute assignments. Rotation mode deliberately recommends zero games
 * with the selected team because a midseason trade should not suppress or
 * remove a player's role. Its conservative per-36 projection handles limited
 * opportunity separately, while the MPG floor screens out extremely small
 * appearances. Starting-five mode retains a visible phase-aware games floor.
 */
function syncSampleFilterHelp(seasonPhase = null) {
  if (!elements.sampleFilterHelp) return;
  const phase = seasonPhase
    || state.loadedLiveSelection?.seasonPhase
    || elements.liveSeasonPhase?.value
    || DEFAULT_SEASON_PHASE;
  const phaseLabel = phase === "playoffs" ? "playoffs" : "regular season";
  const mode = elements.mode.value;
  const games = recommendedMinimumGames(phase, mode);
  const minutes = recommendedMinimumMinutes(mode, phase);
  const recommendedGameRequirement = games > 0
    ? `${games} game${games === 1 ? "" : "s"} with this team`
    : "no games-with-this-team minimum";
  const recommendedRule = `Recommended ${phaseLabel} default: ${recommendedGameRequirement} and ${minutes} minutes per appearance.`;
  elements.sampleFilterHelp.textContent = `These eligibility filters shape the player pool. ${recommendedRule}`;
}

function solveActionLabel({ busy = false, update = false } = {}) {
  if (busy) return "Building…";
  const noun = elements.mode.value === "rotation" ? "rotation" : "lineup";
  return update ? `Rebuild ${noun}` : `Build ${noun}`;
}

function captureDetailedSettings() {
  const fields = [
    "alternatives",
    "minGames",
    "minMinutes",
    "minGuards",
    "minForwards",
    "minCenters",
    "rotationMin",
    "rotationMax",
    "rotationMinutePlan",
    "rotationAllocationStyle",
    "rotationFlexibility",
    "rotationRateStability",
    "rotationScoringBasis",
    "rotationPositionProfile",
    "positionFlexibility",
    "projectionRisk",
    "roleBalance",
  ];
  return {
    fields: Object.fromEntries(fields.map((name) => [name, elements[name].value])),
    activePreset: state.activePreset,
    familyWeights: { ...state.familyWeights },
    weights: { ...state.weights },
    analyticsView: state.analyticsView,
    simplePresetAtEntry: null,
  };
}

function restoreDetailedSettings() {
  const snapshot = state.detailedSettingsSnapshot;
  if (!snapshot) return false;
  for (const [name, value] of Object.entries(snapshot.fields || {})) {
    const input = elements[name];
    if (input && value !== undefined) input.value = value;
  }

  // Priorities are now editable in BOTH views and never changed on entry to
  // Simple. Keep their current values: restoring an old "custom" snapshot here
  // would erase changes made in Simple when both snapshots share that label.
  // The snapshot still restores hidden rules and the detailed display choice.
  state.analyticsView = snapshot.analyticsView;
  elements.analyticsView.value = state.analyticsView;
  state.detailedSettingsSnapshot = null;
  renderPresetState();
  renderWeightControls();
  syncRotationModelControls();
  syncRotationRoleCopy();
  updateRunSummary();
  renderPlayerTable();
  return true;
}

function applySimpleModelDefaults({ invalidate = false } = {}) {
  const phase = state.loadedLiveSelection?.seasonPhase
    || elements.liveSeasonPhase.value
    || DEFAULT_SEASON_PHASE;
  const isRotation = elements.mode.value === "rotation";

  // Simple mode is a complete, opinionated model—not a CSS mask over unknown
  // advanced settings. Reset every hidden input that can change selection so a
  // visitor never receives a result controlled by an invisible experiment.
  elements.alternatives.value = "3";
  const recommendedGames = recommendedMinimumGames(phase, elements.mode.value);
  elements.minGames.value = String(recommendedGames);
  state.recommendedMinGames = recommendedGames;
  elements.minMinutes.value = String(recommendedMinimumMinutes(elements.mode.value, phase));
  // A rotation already has the stronger exact G/F/C minute-flow proof. Hidden
  // 3/3/2 roster-count minimums could reject a group that covers every one of
  // those role minutes (especially on a thin historical roster), so Simple
  // mode does not stack a redundant invisible composition rule on top.
  elements.minGuards.value = isRotation ? "0" : "2";
  elements.minForwards.value = isRotation ? "0" : "2";
  elements.minCenters.value = isRotation ? "0" : "1";
  for (const input of [
    elements.minPoints,
    elements.minRebounds,
    elements.minAssists,
    elements.minSteals,
    elements.minBlocks,
    elements.maxTurnovers,
  ]) input.value = "";
  elements.rotationMin.value = "8";
  elements.rotationMax.value = "40";
  // Team-stint workload is display-only throughout the product. Reapply the
  // invariant here so returning from Detailed cannot resurrect an old saved
  // setting that changes rotation feasibility.
  elements.rotationMinutePlan.value = LINEUP_LAB_ROTATION_MINUTE_PLAN;
  elements.rotationAllocationStyle.value = "strategyFirst";
  elements.rotationFlexibility.value = "8";
  elements.rotationRateStability.value = "sampleAdjusted";
  elements.rotationScoringBasis.value = "per36";
  elements.rotationPositionProfile.value = "automatic";
  elements.positionFlexibility.value = "recommended";
  elements.projectionRisk.value = "balanced";
  elements.roleBalance.value = "recommended";
  state.analyticsView = "perGame";
  elements.analyticsView.value = "perGame";
  // Simple collapses optional explanations and resets hidden hard-rule
  // defaults, but its visible game-plan controls retain the same objective.
  // In particular, a shared custom mix must not turn into Balanced on load.
  renderPresetState();
  $$('details.detailed-only[open]').forEach((details) => details.removeAttribute("open"));
  syncRotationModelControls();
  syncRotationRoleCopy(isRotation);
  updateRunSummary();
  renderPlayerTable();
  if (invalidate) markScenarioChanged();
}

function setExperienceMode(
  mode,
  { applyDefaults = true, invalidate = false, announce = false } = {},
) {
  const nextMode = mode === "detailed" ? "detailed" : "simple";
  const priorMode = state.experienceMode;
  const movingFromDetailedToSimple = nextMode === "simple" && priorMode === "detailed" && applyDefaults;
  const savedDetailedSettings = movingFromDetailedToSimple;
  if (movingFromDetailedToSimple) state.detailedSettingsSnapshot = captureDetailedSettings();
  state.experienceMode = nextMode;
  const detailed = nextMode === "detailed";
  elements.usageScenarioControls.hidden = !detailed || elements.mode.value !== "rotation";
  document.body.dataset.experienceMode = nextMode;
  elements.simpleMode.classList.toggle("is-active", !detailed);
  elements.detailedMode.classList.toggle("is-active", detailed);
  elements.simpleMode.setAttribute("aria-pressed", String(!detailed));
  elements.detailedMode.setAttribute("aria-pressed", String(detailed));
  // Data selection is now the visible first step for both modes. Detailed
  // exposes an extra advanced-rules card, so retain a truthful numbered path:
  // Simple = data, game plan, player choices, build; Detailed adds rules
  // between the game plan and player choices. These labels are presentation
  // only—they never affect the solver's inputs, feasibility, or ranking.
  const playerStep = detailed ? "4" : "3";
  const buildStep = detailed ? "5" : "4";
  elements.playersStepNumber.textContent = playerStep;
  elements.runStepNumber.textContent = buildStep;
  if (elements.productionRules) elements.productionRules.hidden = !detailed;
  if (elements.playerEligibilityFilters && elements.playerPoolDetails) {
    if (!elements.playerPoolDetails.contains(elements.playerEligibilityFilters)) {
      const search = elements.playerPoolDetails.querySelector(".search-field");
      elements.playerPoolDetails.insertBefore(
        elements.playerEligibilityFilters,
        search || elements.playerPoolDetails.firstElementChild?.nextElementSibling || null,
      );
    }
  }
  elements.playersStepNumber.setAttribute("aria-label", `Step ${playerStep}`);
  elements.runStepNumber.setAttribute("aria-label", `Step ${buildStep}`);

  let restoredDetailedSettings = false;
  if (!detailed) {
    if ($('[data-view="optimizer"]')?.hidden) switchView("optimizer");
    if (applyDefaults) {
      applySimpleModelDefaults({ invalidate });
      if (state.detailedSettingsSnapshot) {
        state.detailedSettingsSnapshot.simplePresetAtEntry = state.activePreset;
      }
    }
  } else if (priorMode === "simple") {
    restoredDetailedSettings = restoreDetailedSettings();
    if (restoredDetailedSettings) markScenarioChanged();
  }
  if (announce) {
    showToast(restoredDetailedSettings
      ? "Detailed view restored your prior advanced settings. Rebuild the result to apply them."
      : detailed
        ? "Detailed view opened. Every model control and report is available."
        : savedDetailedSettings
          ? "Simple view opened with recommended defaults. Your prior detailed settings are saved until you return."
          : "Simple view uses recommended defaults and keeps the essential controls in focus.");
  }
  $$(".player-usage-scenario input").forEach(input => {
    input.disabled = !detailed || elements.mode.value !== "rotation";
  });
  workflowView?.refresh();
}

function applyLoadedPhaseEligibilityDefault(seasonPhase) {
  const nextDefault = recommendedMinimumGames(seasonPhase, elements.mode.value);
  const preserveSharedValue = state.preserveSharedMinGamesOnNextLoad;
  state.preserveSharedMinGamesOnNextLoad = false;
  if (!preserveSharedValue && numberFromInput(elements.minGames, state.recommendedMinGames) === state.recommendedMinGames) {
    elements.minGames.value = String(nextDefault);
  }
  state.recommendedMinGames = nextDefault;
  syncSampleFilterHelp(seasonPhase);
}

function isPlayerEligible(player) {
  return player.games >= numberFromInput(elements.minGames, 0)
    && player.minutes >= numberFromInput(elements.minMinutes, 0);
}

function createCell(row, text, className = "", label = "") {
  const cell = document.createElement("td");
  if (className) cell.className = className;
  if (label) cell.dataset.label = label;
  cell.textContent = text;
  row.append(cell);
  return cell;
}

function initialsForDisplay(value, fallback = "NBA") {
  const initials = String(value ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
  return initials || fallback;
}

function updateDatasetMediaSummary() {
  const source = state.dataset?.source || {};
  const headshotPlayers = state.dataset?.players.filter((player) => safeExternalImageUrl(player.headshotUrl)) || [];
  const failedHeadshots = headshotPlayers.filter((player) => state.playerMediaStatus.get(player.id) === "failed").length;
  const usableHeadshots = Math.max(0, headshotPlayers.length - failedHeadshots);
  const hasLogoUrl = Boolean(safeExternalImageUrl(source.teamLogoUrl));
  const usableLogo = hasLogoUrl && state.teamLogoStatus !== "failed";
  const mediaParts = [];
  if (usableHeadshots) mediaParts.push(`${usableHeadshots} player headshot${usableHeadshots === 1 ? "" : "s"}`);
  if (usableLogo) mediaParts.push("team logo");

  if (mediaParts.length === 0) {
    elements.datasetMedia.textContent = "Player initials and the team mark are shown; no player photos or team logo are available for this group.";
    return;
  }
  const availability = `${mediaParts.join(" and ")} available.`;
  const fallbacks = [];
  if (failedHeadshots) {
    fallbacks.push(`initials substituted for ${failedHeadshots} headshot${failedHeadshots === 1 ? "" : "s"} that could not load`);
  }
  if (hasLogoUrl && !usableLogo) fallbacks.push("team mark substituted for the logo that could not load");
  elements.datasetMedia.textContent = fallbacks.length
    ? `${availability} ${fallbacks.join("; ")}.`
    : `${availability} Initials stay in place until each remote image loads.`;
}

function recordPlayerMediaStatus(player, imageUrl, status) {
  // Lazy images from an old team can finish after the player pool changes.
  // Accept a result only when both the player ID and confirmed URL still match
  // the current dataset, preventing stale events from changing the new summary.
  const current = currentPlayer(String(player?.id || ""));
  if (!current || safeExternalImageUrl(current.headshotUrl) !== imageUrl) return;
  if (status === "failed" && state.playerMediaStatus.get(current.id) === "loaded") return;
  state.playerMediaStatus.set(current.id, status);
  updateDatasetMediaSummary();
}

function createPlayerAvatar(player, className = "player-avatar") {
  // Every player gets a stable visual footprint. A confirmed headshot overlays
  // the initials when it loads; a network failure simply leaves the useful
  // initials fallback in place instead of showing a broken-image icon.
  const visual = document.createElement("span");
  visual.className = className;
  visual.setAttribute("aria-hidden", "true");

  const fallback = document.createElement("span");
  fallback.className = `${className}__fallback`;
  fallback.textContent = initialsForDisplay(player?.name);
  visual.append(fallback);

  const imageUrl = safeExternalImageUrl(player?.headshotUrl);
  if (!imageUrl) return visual;

  const image = document.createElement("img");
  image.className = `${className}__image`;
  image.alt = "";
  image.width = 80;
  image.height = 80;
  image.loading = "eager";
  image.decoding = "async";
  image.addEventListener("load", () => {
    image.classList.add("is-loaded");
    recordPlayerMediaStatus(player, imageUrl, "loaded");
  }, { once: true });
  image.addEventListener("error", () => {
    recordPlayerMediaStatus(player, imageUrl, "failed");
    image.remove();
  }, { once: true });
  image.src = imageUrl;
  visual.append(image);
  return visual;
}

function createTableCheckbox(player, action, label, checked, disabled = false) {
  // The visible checkbox stays compact, while its label provides a full 44px
  // pointer/touch target. Keeping data-action on the input preserves delegated
  // change handling and keyboard behavior.
  const target = document.createElement("label");
  target.className = "table-check-target";
  const input = document.createElement("input");
  input.type = "checkbox";
  input.className = "table-check";
  input.dataset.action = action;
  input.dataset.playerId = player.id;
  input.checked = checked;
  input.disabled = disabled;
  input.setAttribute("aria-label", `${label} ${player.name}`);
  target.append(input);
  return target;
}

/**
 * Keep the active hard rules and convenience selections visible above a long
 * roster table. This is deliberately a summary of state—not another way to
 * select a player—so a fan can undo a choice without hunting through 20-plus
 * mobile cards or horizontal desktop columns.
 */
function renderActiveSelectionTray() {
  if (!state.dataset) return;
  const entries = [];
  const selectionTypes = [
    ["lock", state.lockedIds, "Must include"],
    ["exclude", state.excludedIds, "Do not use"],
    ["compare", state.compareIds, "Compare"],
    ["watch", state.watchlistIds, "Watch"],
  ];
  for (const [action, ids, label] of selectionTypes) {
    for (const id of ids) {
      const player = currentPlayer(id);
      if (!player) continue;
      entries.push({ action, id, label, player });
    }
  }

  elements.activeSelectionTray.replaceChildren();
  elements.activeSelectionTray.hidden = entries.length === 0;
  if (entries.length === 0) return;
  const heading = document.createElement("strong");
  heading.textContent = "Active choices";
  elements.activeSelectionTray.append(heading);
  for (const entry of entries) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `selection-chip selection-chip--${entry.action}`;
    button.dataset.selectionAction = entry.action;
    button.dataset.playerId = entry.id;
    button.textContent = `${entry.label}: ${entry.player.name} ×`;
    button.setAttribute("aria-label", `Remove ${entry.player.name} from ${entry.label.toLowerCase()}`);
    elements.activeSelectionTray.append(button);
  }
}

function handleActiveSelectionRemoval(event) {
  const button = event.target.closest("[data-selection-action][data-player-id]");
  if (!button) return;
  const { selectionAction: action, playerId } = button.dataset;
  if (action === "lock") {
    state.lockedIds.delete(playerId);
    markScenarioChanged();
  } else if (action === "exclude") {
    state.excludedIds.delete(playerId);
    markScenarioChanged();
  } else if (action === "compare") {
    state.compareIds.delete(playerId);
    renderCompare();
  } else if (action === "watch") {
    state.watchlistIds.delete(playerId);
    state.watchlistSnapshots.delete(playerId);
    saveWatchlist();
    renderWatchlist();
  } else {
    return;
  }
  renderPlayerTable();
}

function restorePlayerControlFocus(focusTarget) {
  if (!focusTarget) return;
  const control = [...elements.playerTableBody.querySelectorAll("[data-action][data-player-id]"), ...elements.usageScenarioList.querySelectorAll("[data-action][data-player-id]")]
    .find((candidate) => (
      candidate.dataset.action === focusTarget.action
      && candidate.dataset.playerId === focusTarget.playerId
    ));
  control?.focus({ preventScroll: true });
}

const PLAYER_SORT_DEFAULTS = Object.freeze({
  name: "asc",
  positions: "asc",
  minutes: "desc",
  points: "desc",
  rebounds: "desc",
  assists: "desc",
});

function comparePlayerValues(left, right, key, direction) {
  const descending = direction === "desc";
  const leftValue = key === "positions" ? (left.positions || []).join("/") : left[key];
  const rightValue = key === "positions" ? (right.positions || []).join("/") : right[key];
  const leftNumber = Number(leftValue);
  const rightNumber = Number(rightValue);
  const leftIsNumeric = Number.isFinite(leftNumber);
  const rightIsNumeric = Number.isFinite(rightNumber);
  if (leftIsNumeric && rightIsNumeric) return descending ? rightNumber - leftNumber : leftNumber - rightNumber;
  const textComparison = String(leftValue ?? "").localeCompare(String(rightValue ?? ""), undefined, { numeric: true, sensitivity: "base" });
  return descending ? -textComparison : textComparison;
}

function sortPlayers(players) {
  const { key, direction } = state.playerSort;
  return [...players].sort((left, right) => {
    const primary = comparePlayerValues(left, right, key, direction);
    if (primary !== 0) return primary;
    return comparePlayerValues(left, right, "name", "asc");
  });
}

function syncPlayerSortHeaders() {
  document.querySelectorAll("[data-player-sort]").forEach((button) => {
    const key = button.dataset.playerSort;
    const active = key === state.playerSort.key;
    const direction = active ? state.playerSort.direction : "none";
    const directionLabel = direction === "asc" ? "ascending" : direction === "desc" ? "descending" : "unsorted";
    const header = button.closest("th");
    if (header) header.setAttribute("aria-sort", direction === "none" ? "none" : (direction === "asc" ? "ascending" : "descending"));
    button.dataset.sortDirection = direction;
    button.setAttribute("aria-pressed", String(active));
    button.setAttribute("aria-label", `${button.textContent.trim()}${active ? `, sorted ${directionLabel}` : ", sort"}`);
  });
}

function renderPlayerTable({ focusTarget = null } = {}) {
  elements.usageScenarioList.replaceChildren();
  if (!state.dataset) return;
  const query = elements.playerSearch.value.trim().toLocaleLowerCase();
  const players = sortPlayers(state.dataset.players.filter((player) => (
    !query || `${player.name} ${player.team} ${player.positions.join(" ")}`.toLocaleLowerCase().includes(query)
  )));
  const fragment = document.createDocumentFragment();

  for (const player of players) {
    const row = document.createElement("tr");
    const eligible = isPlayerEligible(player);
    const showImpactCoverage = $("#modelModeInput").value === "swishiq-impact"
      && state.swishIqProjectionStatus === "ready"
      && Boolean(state.swishiqEvidence?.players);
    const impactSupported = showImpactCoverage && Object.hasOwn(state.swishiqEvidence.players, player.id);
    const nativeImpactUnsupported = isCanonicalV4NativeImpactLoaded()
      ? state.swishiqEvidence?.unsupported?.find((entry) => entry?.playerId === player.id) || null
      : null;
    row.classList.toggle("is-ineligible", !eligible);
    row.classList.toggle("is-locked", state.lockedIds.has(player.id));
    row.classList.toggle("is-excluded", state.excludedIds.has(player.id));
    row.classList.toggle("is-impact-unresolved", showImpactCoverage && !impactSupported);

    const nameCell = document.createElement("td");
    nameCell.dataset.label = "Player";
    const nameWrap = document.createElement("span");
    nameWrap.className = "player-name";
    const name = document.createElement("strong");
    name.textContent = player.name;
    const sample = document.createElement("small");
    sample.textContent = `${player.games} games${eligible ? "" : " - below current filter"}`;
    nameWrap.append(name, sample);
    if (showImpactCoverage) {
      const impactCoverage = document.createElement("small");
      impactCoverage.className = "player-impact-evidence";
      impactCoverage.textContent = impactSupported
        ? "Impact estimates available"
        : nativeImpactUnsupported?.code === "ambiguous-name-match"
          ? "Impact unavailable · exact name match is ambiguous"
          : nativeImpactUnsupported
            ? "Impact unavailable · no eligible exact-season estimate"
            : "Impact unavailable · box-score stats only";
      nameWrap.append(impactCoverage);
    }
    const identity = document.createElement("span");
    identity.className = "player-name__identity";
    const avatar = createPlayerAvatar(player);
    if (avatar) identity.append(avatar);
    identity.append(nameWrap);
    nameCell.append(identity);
    // Optional per-player scenario, separate from minutes. Blank means retain
    // observed usage. Keep it in Detailed mode; Simple never applies a hidden
    // override. No browser field is interpreted as a learned causal effect.
    const usageLabel = document.createElement("label");
    usageLabel.className = "player-usage-scenario detailed-only";
    usageLabel.hidden = elements.mode.value !== "rotation";
    usageLabel.textContent = `${player.name} · usage (%)`;
    const usageInput = document.createElement("input");
    usageInput.type = "number";
    usageInput.min = "0";
    usageInput.max = "100";
    usageInput.step = "0.1";
    usageInput.placeholder = "Observed";
    usageInput.value = Object.hasOwn(state.offensiveResponsibilities, player.id)
      ? String(Math.round(state.offensiveResponsibilities[player.id] * 1000) / 10) : "";
    usageInput.dataset.action = "usage";
    usageInput.dataset.playerId = player.id;
    usageInput.setAttribute("aria-label", `${player.name}: offensive usage scenario percent`);
    usageInput.setAttribute("aria-describedby", "usageScenarioHelp");
    usageInput.disabled = elements.mode.value !== "rotation" || state.experienceMode !== "detailed";
    usageLabel.append(usageInput);
    row.append(nameCell);
    elements.usageScenarioList.append(usageLabel);

    createCell(row, player.positions.join("/"), "", "Position");
    createCell(row, formatNumber(player.minutes), "", "MPG");
    createCell(row, formatNumber(player.points), "", "PTS");
    createCell(row, formatNumber(player.rebounds), "", "REB");
    createCell(row, formatNumber(player.assists), "", "AST");
    createCell(row, formatNumber(player.steals), "detailed-only-column", "STL");
    createCell(row, formatNumber(player.blocks), "detailed-only-column", "BLK");
    createCell(row, formatNumber(player.turnovers), "detailed-only-column", "TOV");

    const lockCell = createCell(row, "", "", "Lock");
    lockCell.append(createTableCheckbox(
      player,
      "lock",
      "Lock",
      state.lockedIds.has(player.id),
      state.excludedIds.has(player.id),
    ));
    const excludeCell = createCell(row, "", "", "Exclude");
    excludeCell.append(createTableCheckbox(
      player,
      "exclude",
      "Exclude",
      state.excludedIds.has(player.id),
      state.lockedIds.has(player.id),
    ));
    const compareCell = createCell(row, "", "detailed-only-column", "Compare");
    compareCell.append(createTableCheckbox(
      player,
      "compare",
      "Compare",
      state.compareIds.has(player.id),
      state.compareIds.size >= 4 && !state.compareIds.has(player.id),
    ));
    const watchCell = createCell(row, "", "detailed-only-column", "Save");
    const watchButton = document.createElement("button");
    watchButton.type = "button";
    watchButton.className = "watch-toggle";
    watchButton.classList.toggle("is-active", state.watchlistIds.has(player.id));
    watchButton.dataset.action = "watch";
    watchButton.dataset.playerId = player.id;
    watchButton.setAttribute("aria-pressed", String(state.watchlistIds.has(player.id)));
    watchButton.setAttribute(
      "aria-label",
      `${state.watchlistIds.has(player.id) ? "Remove" : "Add"} ${player.name} ${state.watchlistIds.has(player.id) ? "from" : "to"} watchlist`,
    );
    watchButton.textContent = state.watchlistIds.has(player.id) ? "★" : "☆";
    watchCell.append(watchButton);
    fragment.append(row);
  }

  elements.playerTableBody.replaceChildren(fragment);
  if (players.length === 0) {
    const row = document.createElement("tr");
    createCell(row, "No players match that search.", "loading-cell").colSpan = 13;
    elements.playerTableBody.append(row);
  }
  renderActiveSelectionTray();
  renderPoolSummary(players.length);
  updateRunSummary();
  syncPlayerSortHeaders();
  elements.compareCount.textContent = String(state.compareIds.size);
  elements.watchlistCount.textContent = String(state.watchlistIds.size);
  restorePlayerControlFocus(focusTarget);
}

function renderPoolSummary(visiblePlayers = state.dataset?.players.length || 0) {
  if (!state.dataset) return;
  const eligible = state.dataset.players.filter(isPlayerEligible);
  elements.poolSummary.replaceChildren();
  const parts = [
    `${eligible.length} of ${state.dataset.players.length} meet the player-pool floor`,
    `${state.lockedIds.size} must include`,
    `${state.excludedIds.size} do not use`,
    `${visiblePlayers} player${visiblePlayers === 1 ? "" : "s"} shown`,
  ];
  for (const part of parts) {
    const span = document.createElement("span");
    span.textContent = part;
    elements.poolSummary.append(span);
  }
}

function setDataset(dataset, {
  clearScenario = true,
  liveSelection = null,
  notice = "",
  datasetKind = "csv",
  swishIqEvidence = null,
  swishIqPackage = null,
} = {}) {
  // SwishIQ evidence is attached only after its exact V3 projection or native
  // V4 companion is verified against this roster. Every other source starts
  // without Impact evidence so stale browser state cannot leak into a new solve.
  state.swishiqEvidence = swishIqEvidence;
  state.swishIqPackage = swishIqPackage;
  if (!swishIqPackage) state.swishIqProjectionStatus = "idle";
  const validation = validateDataset(dataset);
  if (!validation.valid) {
    const detail = validation.errors.slice(0, 2).map((error) => error.message).join(" ");
    throw new Error(detail || "The player dataset is invalid.");
  }
  if (liveSelection?.seasonPhase) applyLoadedPhaseEligibilityDefault(liveSelection.seasonPhase);
  cancelOptimization("Optimization cancelled because the player pool changed.");
  if (state.replacementRunToken !== null) {
    finishPendingReplacement("The player pool changed. Run a new result before testing replacements.");
  }
  state.scenarioVersion += 1;
  state.dataset = dataset;
  state.datasetKind = datasetKind !== "csv"
    ? datasetKind
    : liveSelection
      ? (isAllGamesSourceKind(liveSelection.source) ? SWISHIQ_V3_PACKAGE_SOURCE_KIND : "live")
      : "csv";
  state.loadedLiveSelection = liveSelection;
  if (liveSelection?.source) state.dataSource = canonicalSourceValue(liveSelection.source);
  // The loaded team is page context only. Palette selection belongs exclusively
  // to the visitor's manual fan-suite palette picker.
  setCourtContextTeam(liveSelection?.team || "");
  state.playerMediaStatus.clear();
  state.teamLogoStatus = "unavailable";
  clearOpponentSwishIQ(liveSelection
    ? "Choose another team from this season and phase to build a historical game plan."
    : "Load an NBA team-season above before building an opponent game plan.");
  if (clearScenario) {
    state.lockedIds.clear();
    state.excludedIds.clear();
    state.offensiveResponsibilities = {};
    state.compareIds.clear();
    elements.playerSearch.value = "";
    clearRenderedResult();
  }
  applyPendingScenarioPlayerSelections(dataset);
  if (state.experienceMode === "simple") applySimpleModelDefaults({ invalidate: false });
  const availableIds = new Set(dataset.players.map((player) => player.id));
  state.compareIds = new Set([...state.compareIds].filter((id) => availableIds.has(id)));
  let migratedWatchlistSnapshot = false;
  for (const player of dataset.players) {
    if (state.watchlistIds.has(player.id) && !state.watchlistSnapshots.has(player.id)) {
      rememberWatchlistPlayer(player.id);
      migratedWatchlistSnapshot = true;
    }
  }
  if (migratedWatchlistSnapshot) saveWatchlist();
  renderDatasetMeta();
  renderPlayerTable();
  renderCompare();
  renderWatchlist();
  updateLiveSelectionState({ preserveStatus: true });
  populateOpponentTeamOptions();
  setSolverStatus(state.searchScopeCanRun ? "Ready to solve" : "Not ready to solve",
    state.searchScopeCanRun ? undefined : "warning");
  setOptimizeButtons({ label: solveActionLabel() });
  if (notice) showToast(notice);
  workflowView?.refresh();
}

function renderDatasetMeta() {
  const source = state.dataset?.source || {};
  const teams = teamValues();
  const teamCode = teams.length === 1 ? teams[0] : "NBA";
  elements.datasetName.textContent = state.datasetKind === "csv"
    ? "Imported CSV"
    : state.datasetKind === "demo"
      ? "Course demo"
      : "NBA stats";
  elements.datasetSeason.textContent = source.season || "Custom";
  elements.datasetTeam.textContent = teams.length === 1 ? teams[0] : `${teams.length} teams`;
  elements.datasetCount.textContent = String(state.dataset?.players.length || 0);
  const teamLogoUrl = safeExternalImageUrl(source.teamLogoUrl);
  elements.teamLogo.onload = null;
  elements.teamLogo.onerror = null;
  elements.teamLogo.classList.remove("is-loaded");
  const showLogoFallback = () => {
    state.teamLogoStatus = teamLogoUrl ? "failed" : "unavailable";
    elements.teamLogo.classList.remove("is-loaded");
    elements.teamLogo.hidden = true;
    elements.teamLogo.removeAttribute("src");
    elements.teamLogo.alt = "";
    elements.teamLogoFallback.textContent = teamCode;
    elements.teamLogoFallback.hidden = false;
    updateDatasetMediaSummary();
  };

  // A historical logo is useful context, but it is never required for the
  // optimizer. Preserve the team-code mark if a remote image expires or is
  // blocked so choosing a season never creates a broken visual control.
  if (teamLogoUrl) {
    state.teamLogoStatus = "pending";
    elements.teamLogo.classList.remove("is-loaded");
    elements.teamLogo.onload = () => {
      // Ignore a late response belonging to a player pool that has since been
      // replaced, just as the player-headshot status tracker does.
      if (safeExternalImageUrl(state.dataset?.source?.teamLogoUrl) !== teamLogoUrl) return;
      state.teamLogoStatus = "loaded";
      elements.teamLogo.classList.add("is-loaded");
      elements.teamLogoFallback.hidden = true;
      updateDatasetMediaSummary();
    };
    elements.teamLogo.onerror = () => {
      if (safeExternalImageUrl(state.dataset?.source?.teamLogoUrl) === teamLogoUrl) showLogoFallback();
    };
    elements.teamLogo.alt = `${source.teamName || source.team || teamCode} logo`;
    elements.teamLogo.hidden = false;
    elements.teamLogo.loading = "eager";
    elements.teamLogoFallback.textContent = teamCode;
    elements.teamLogoFallback.hidden = false;
    elements.teamLogo.src = teamLogoUrl;
    updateDatasetMediaSummary();
  } else {
    showLogoFallback();
  }
}

async function loadFixture({ notice = "" } = {}) {
  const loadGeneration = beginNonLiveDatasetLoad();
  try {
    const response = await fetch(FIXTURE_URL, { cache: "no-store" });
    if (!datasetLoadIsCurrent(loadGeneration)) return;
    if (!response.ok) throw new Error(`Demo data could not be loaded (${response.status}).`);
    const rawDataset = await response.json();
    if (!datasetLoadIsCurrent(loadGeneration)) return;
    const dataset = normalizeDataset(rawDataset, { strict: true, warnOnGeneratedId: false });
    setDataset(dataset, { notice, datasetKind: "demo" });
  } catch (error) {
    if (!datasetLoadIsCurrent(loadGeneration)) return;
    throw error;
  }
}

function handlePlayerControl(event) {
  const control = event.target.closest("[data-action][data-player-id]");
  if (!control) return;
  const { action, playerId } = control.dataset;
  if (action === "usage") {
    if (control.disabled || !["input", "change"].includes(event.type)) return;
    // Capture edits on input, not just blur/change. A user can press Build or
    // use a number stepper before blur commits in every browser. Invalid edits
    // invalidate the old result but never replace the last valid scenario.
    if (!control.checkValidity()) {
      markScenarioChanged();
      if (event.type === "change") control.reportValidity();
      return;
    }
    if (control.value.trim() === "") delete state.offensiveResponsibilities[playerId];
    else state.offensiveResponsibilities[playerId] = Number(control.value) / 100;
    markScenarioChanged();
    return;
  }
  if ((action === "watch" && event.type !== "click") || (action !== "watch" && event.type !== "change")) return;
  if (action === "watch") {
    if (state.watchlistIds.has(playerId)) {
      state.watchlistIds.delete(playerId);
      state.watchlistSnapshots.delete(playerId);
    } else {
      state.watchlistIds.add(playerId);
      rememberWatchlistPlayer(playerId);
    }
    saveWatchlist();
    renderPlayerTable({ focusTarget: { action, playerId } });
    renderWatchlist();
    return;
  }
  const checked = control.checked;
  if (action === "lock") {
    if (checked) {
      state.lockedIds.add(playerId);
      state.excludedIds.delete(playerId);
    } else state.lockedIds.delete(playerId);
    markScenarioChanged();
  }
  if (action === "exclude") {
    if (checked) {
      state.excludedIds.add(playerId);
      state.lockedIds.delete(playerId);
    } else state.excludedIds.delete(playerId);
    markScenarioChanged();
  }
  if (action === "compare") {
    if (checked && state.compareIds.size >= 4) {
      control.checked = false;
      showToast("Choose up to four players for a readable comparison.");
      return;
    }
    if (checked) state.compareIds.add(playerId);
    else state.compareIds.delete(playerId);
    renderCompare();
  }
  renderPlayerTable({ focusTarget: { action, playerId } });
}

function buildOptimizerConfig() {
  const swishIq = $("#modelModeInput").value === "swishiq-impact";
  const selectedSwishIqPackage = swishIq ? state.swishIqPackage : null;
  const nativeV4Impact = swishIq && isCanonicalV4NativeImpactLoaded();
  const exactPackageLoaded = swishIq || Boolean(
    state.dataset?.source?.kind === SWISHIQ_V3_PACKAGE_SOURCE_KIND
      && state.dataset?.source?.packageId
      && state.dataset?.source?.packageVersion
      && state.dataset?.source?.projectionContentSha256,
  );
  const config = {
    modelMode: $("#modelModeInput").value,
    modelId: swishIq
      ? nativeV4Impact
        ? selectedSwishIqPackage?.impactModelId || null
        : "swishiq-v3"
      : null,
    seed: exactPackageLoaded ? LINEUP_LAB_REPLAY_SEED : undefined,
    // Pin the public Result Passport to the same objective transform used by
    // the worker. Without this, a SwishIQ solve was replayed with the generic
    // lineup-objective-v1 metadata even though allocation used Impact v6.
    objectiveVersion: swishIq ? SWISHIQ_IMPACT_OBJECTIVE_VERSION : undefined,
    swishiqObjective: swishIq ? $("#swishiqObjectiveInput").value : "balanced",
    swishiqObjectiveWeights: swishiqWeightsFromControls(),
    ...(swishIq ? { projectionRisk: nativeV4Impact ? "balanced" : elements.projectionRisk.value } : {}),
    swishiqEvidence: state.swishiqEvidence,
    sourceScope: state.loadedLiveSelection ? {
      seasonEndYear: Number(state.loadedLiveSelection.season),
      team: state.loadedLiveSelection.team,
      seasonPhase: state.loadedLiveSelection.seasonPhase,
      ...(swishIq ? {
        evidenceScope: "exact-season",
        evidenceWindowStartYear: Number(state.loadedLiveSelection.season) - 1,
        evidenceWindowEndYear: Number(state.loadedLiveSelection.season),
        evidenceWindowYears: [Number(state.loadedLiveSelection.season) - 1],
        ...(nativeV4Impact && selectedSwishIqPackage ? {
          packageId: selectedSwishIqPackage.packageId,
          packageVersion: selectedSwishIqPackage.packageVersion,
          impactReleaseId: selectedSwishIqPackage.impactReleaseId,
          impactManifestSha256: selectedSwishIqPackage.impactManifestSha256,
          impactSeasonArtifactSha256: selectedSwishIqPackage.impactSeasonArtifactSha256,
          sourceLockSha256: selectedSwishIqPackage.sourceLockSha256,
          packageManifestSha256: selectedSwishIqPackage.packageManifestSha256,
          modelId: selectedSwishIqPackage.impactModelId,
          modelVersion: selectedSwishIqPackage.impactModelVersion,
          impactModelSha256: selectedSwishIqPackage.modelSha256,
          impactModelVariantSha256: selectedSwishIqPackage.modelVariantSha256,
          impactCrosswalkSha256: selectedSwishIqPackage.crosswalkSha256,
          normalizer: selectedSwishIqPackage.normalizer,
          impactUse: "mean-only",
          impactUncertaintyStatus: "not-estimated",
        } : selectedSwishIqPackage ? {
          packageId: selectedSwishIqPackage.packageId,
          packageVersion: selectedSwishIqPackage.packageVersion,
          packageManifestSha256: selectedSwishIqPackage.packageManifestSha256,
          sourceLockSha256: selectedSwishIqPackage.sourceLockSha256,
          format: state.dataset?.source?.format,
          modelId: selectedSwishIqPackage.modelId,
          normalizer: selectedSwishIqPackage.normalizer,
          metricsVersion: selectedSwishIqPackage.metricsVersion,
          registryVersion: selectedSwishIqPackage.registryVersion,
          registryRevisionSha256: selectedSwishIqPackage.registryRevisionSha256,
          projectionContentSha256: selectedSwishIqPackage.projectionContentSha256,
        } : {}),
      } : {}),
    } : null,
    mode: elements.mode.value,
    size: numberFromInput(elements.size, elements.mode.value === "rotation" ? 9 : 5),
    alternatives: numberFromInput(elements.alternatives, 5),
    weights: { ...state.weights },
    familyWeights: { ...state.familyWeights },
    roleBalance: elements.roleBalance.value,
    lockedIds: [...state.lockedIds],
    excludedIds: [...state.excludedIds],
    minGames: numberFromInput(elements.minGames, 0),
    minMinutes: numberFromInput(elements.minMinutes, 0),
    positionMinimums: {
      G: numberFromInput(elements.minGuards, 0),
      F: numberFromInput(elements.minForwards, 0),
      C: numberFromInput(elements.minCenters, 0),
    },
  };
  if (config.mode === "rotation") {
    config.rotationOptions = {
      minMinutes: numberFromInput(elements.rotationMin, 8),
      maxMinutes: numberFromInput(elements.rotationMax, 40),
      // The exact allocator receives a rate-normalized priority rather than
      // raw per-game output by default. Projections still use source per-minute
      // production, so this changes only who earns time—not the unit math.
      scoringBasis: elements.rotationScoringBasis.value,
      // Team-stint games and total minutes are intentionally absent from this
      // payload. The exact allocator receives only the user's hard limits,
      // role requirements, and evidence-adjusted game-plan objective.
      minutePlan: LINEUP_LAB_ROTATION_MINUTE_PLAN,
      historicalAllocationStyle: elements.rotationAllocationStyle.value,
      minuteFlexibility: numberFromInput(elements.rotationFlexibility, 8),
      rateStability: elements.rotationRateStability.value,
      projectionRisk: nativeV4Impact ? "balanced" : elements.projectionRisk.value,
      offensiveResponsibilities: state.experienceMode === "detailed" ? { ...state.offensiveResponsibilities } : {},
      roleBalance: elements.roleBalance.value,
      // Possession-level SwishIQ evidence remains a separately versioned input.
      // The buyer-safe public adapter checks the approved package, manifest,
      // scope, and coverage before it can affect the solve.
      modelMode: $("#modelModeInput").value,
      positionMinuteRequirements: selectedRotationPositionRequirements(),
      ...(selectedRotationPositionRanges()
        ? { positionMinuteRanges: selectedRotationPositionRanges() }
        : {}),
    };
  }
  return config;
}

/**
 * Build the public scenario envelope used by the Result Passport. Keep the
 * envelope deliberately narrow: provider IDs and raw package paths never
 * enter the browser-facing result object.
 */
function resultScenarioFor(config, players) {
  const source = state.dataset?.source || {};
  const selected = state.loadedLiveSelection || {};
  const seasonEndYear = Number(source.seasonEndYear || selected.season);
  const demoTeams = teamValues();
  const demoScope = state.datasetKind === "demo" && typeof source.season === "string" && source.season.trim()
    ? {
      kind: "course-demo",
      ...(demoTeams.length === 1 ? { team: demoTeams[0] } : {}),
      season: source.season.trim(),
    }
    : undefined;
  // Historical V3 datasets carry the exact public artifact on the
  // dataset source, while SwishIQ Impact carries its approved projection
  // pins in config.sourceScope. Prefer the model pin when present, otherwise
  // retain the loaded exact package instead of reducing replay to selectors.
  const packageSource = config.sourceScope?.packageId || config.sourceScope?.packageVersion
    ? config.sourceScope
    : source;
  // Result Passport replay pins store scope in the Scenario Envelope's
  // schedule. The Impact loader already proved this exact-season boundary in
  // sourceScope.evidenceScope; preserve it here instead of leaving an exact
  // package passport without the scope required for fail-closed reloads.
  const packageScope = config.sourceScope?.evidenceScope
    || config.sourceScope?.scope
    || source.scope
    || source.packageScope
    || undefined;
  const sourceScope = {
    ...(source.team || selected.team || demoScope?.team ? { team: source.team || selected.team || demoScope.team } : {}),
    ...(Number.isInteger(seasonEndYear) ? { seasonEndYear } : {}),
    ...(demoScope ? { season: demoScope.season, scope: demoScope } : {}),
    seasonPhase: source.seasonPhase || selected.seasonPhase || "regular",
    ...(source.label || source.teamName || selected.team ? { label: source.label || source.teamName || selected.team } : {}),
    ...(packageSource.packageId && packageSource.packageVersion ? {
      ...(packageScope ? { scope: packageScope } : {}),
      packageId: packageSource.packageId,
      packageVersion: packageSource.packageVersion,
      packageContentSha256: packageSource.packageContentSha256,
      packageManifestSha256: packageSource.packageManifestSha256,
      sourceLockSha256: packageSource.sourceLockSha256,
      registryVersion: packageSource.registryVersion,
      registryRevisionSha256: packageSource.registryRevisionSha256,
      projectionContentSha256: packageSource.projectionContentSha256,
      format: packageSource.format,
      modelId: packageSource.modelId,
    } : {}),
  };
  const playerList = Array.isArray(players) ? players : [];
  const playerRefs = playerList.map((player) => typeof player?.playerRef === "string" ? player.playerRef.trim() : "");
  if (!playerRefs.length || playerRefs.some((playerRef) => !playerRef)) {
    throw new Error("Result Passport requires stable player references.");
  }
  const refById = new Map(playerList.map(player => [player.id, player.playerRef]));
  const publicIds = ids => (ids || []).map(id => refById.get(id) || id);
  return createLineupScenarioEnvelope({
    config: {
      ...config,
      lockedIds: publicIds(config.lockedIds),
      excludedIds: publicIds(config.excludedIds),
    },
    source: sourceScope,
    // SwishIQ runs retain only its stable public player reference in saved
    // scenario/result metadata. The local roster reference remains useful for
    // checkbox state and exact enumeration, but it is not the package identity.
    playerIds: playerRefs,
  });
}

/**
 * Attach a validated public Result Passport without allowing a malformed
 * presentation contract to make an otherwise valid optimizer result fail.
 */
function withResultPassport(result, config, players) {
  try {
    const scenario = resultScenarioFor(config, players);
    // Keep the complete prose in solver diagnostics. Passport model identity
    // carries versioned layer keys; its short metadata fields cannot accept
    // the longer separation explanation from the detailed report.
    const identity = result?.diagnostics?.modelIdentity;
    const passportResult = identity ? {
      ...result,
      diagnostics: {
        ...result.diagnostics,
        modelIdentity: {
          constraintLayer: identity.constraintLayer,
          evidenceLayer: identity.evidenceLayer,
          swishiqImpactLayer: identity.swishiqImpactLayer,
        },
      },
    } : result;
    const passport = resultPassportFromOptimizerResult(passportResult, { scenario });
    return attachResultPassport(result, passport);
  } catch (error) {
    // Passport metadata is additive. Preserve the exact solver result and
    // surface a diagnostic for the detailed report rather than failing open
    // or inventing a fallback score.
    return {
      ...result,
      diagnostics: {
        ...(result?.diagnostics || {}),
        resultPassport: { status: "unavailable", reason: "Result metadata could not be packaged safely." },
      },
    };
  }
}

function assignedPosition(lineup, playerId) {
  // A rotation covers positions minute by minute, so it does not use the
  // one-player-per-slot assignment returned for a five-player lineup. Read the
  // exact G/F/C minute flow instead of labelling every rotation player "UTIL".
  // Multiple labels are intentional: G/F means this exact plan actually used
  // the player in both role families, not merely that his career profile lists
  // both as possibilities.
  const rotationRoleMinutes = lineup.rotation?.positionMinutes?.byPlayer?.[playerId];
  if (rotationRoleMinutes && typeof rotationRoleMinutes === "object") {
    const activeRoles = ["G", "F", "C"].filter(
      (position) => Number(rotationRoleMinutes[position]) > 0,
    );
    if (activeRoles.length > 0) return activeRoles.join("/");
  }
  for (const [position, ids] of Object.entries(lineup.positionAssignment || {})) {
    if (ids.includes(playerId)) return position;
  }
  return "UTIL";
}

function renderScoreCard(label, value, primary = false) {
  const card = document.createElement("div");
  card.className = `score-card${primary ? " score-card--primary" : ""}`;
  const labelNode = document.createElement("span");
  labelNode.textContent = label;
  const valueNode = document.createElement("strong");
  valueNode.textContent = value;
  card.append(labelNode, valueNode);
  return card;
}

function decisionCountIsComplete(decision) {
  return decision?.proof?.countComplete === true;
}

function decisionQualityLabel(decision) {
  const countComplete = decisionCountIsComplete(decision);
  if (decision?.quality === "best-legal-choice" && countComplete) return "Best legal choice";
  if (decision?.quality === "best-legal-choice" || decision?.quality === "best-found") {
    return countComplete ? "Best found" : "Best found among returned groups";
  }
  return "Not ranked";
}

function decisionRankLabel(decision) {
  if (!decision) return "Ranking unavailable";
  if (!decisionCountIsComplete(decision)) return "Returned groups only; full count unavailable";
  if (decision.rank && decision.optionCount) return `#${decision.rank} of ${decision.optionCount}`;
  if (decision.rank) return `Rank ${decision.rank}; complete count unavailable in this result`;
  return "Rank unavailable";
}

function decisionRankSummary(decision, subject = "This group") {
  if (!decision) return "Decision quality is unavailable for this result.";
  if (!decisionCountIsComplete(decision)) {
    return decision.rank
      ? `${subject} is included among the returned groups; the full legal-group count is unavailable.`
      : "Only returned groups are ranked; the full legal-group count is unavailable.";
  }
  if (decision.rank && decision.optionCount) {
    return `${subject} is ranked ${decision.rank} of ${decision.optionCount} legal groups.`;
  }
  if (decision.rank) return `${subject} has a returned rank; the complete legal-choice count is unavailable in this result.`;
  return "No legal-choice ranking was returned.";
}

/**
 * Explain decision quality in plain language. Rank and legal-choice counts
 * describe only the requested search; the source statline remains the
 * basketball output. No pool percentile or universal score is displayed.
 */
function renderBenchmarkExplainer(result, { compact = false } = {}) {
  const decision = result?.resultPassport?.decision;
  if (!decision) return null;

  const root = document.createElement(compact ? "details" : "section");
  root.className = `benchmark-explainer${compact ? " benchmark-explainer--compact" : ""}`;
  const content = document.createElement("div");
  content.className = "benchmark-explainer__content";

  if (compact) {
    const summary = document.createElement("summary");
    summary.textContent = "How decision quality is determined";
    root.append(summary);
  } else {
    const heading = document.createElement("h3");
    heading.textContent = "How to read decision quality";
    content.append(heading);
  }

  const intro = document.createElement("p");
  intro.className = "benchmark-explainer__intro";
  intro.textContent = decisionCountIsComplete(decision)
    ? "Decision quality tells you where this eligible group landed in the search. It does not rate the players outside this scenario."
    : "Decision quality covers only groups returned by this search. It does not rate the players outside this scenario.";

  const steps = document.createElement("ol");
  steps.className = "benchmark-explainer__steps";
  for (const step of [
    "Only groups that meet every displayed hard rule are eligible.",
    "Eligible groups are ranked using your selected objective and minute plan.",
    "The result summary shows rank and search coverage separately from the team-season statline.",
  ]) {
    const item = document.createElement("li");
    item.textContent = step;
    steps.append(item);
  }

  const reading = document.createElement("p");
  reading.className = "benchmark-explainer__reading";
  reading.textContent = decisionRankSummary(decision);
  content.append(intro, steps, reading);
  root.append(content);
  return root;
}

function playerInsightFor(explanation, playerId) {
  return explanation?.selectedPlayers?.find((item) => item.playerId === playerId) || null;
}

function renderPlayerSeasonContext(player, insight) {
  const context = document.createElement("p");
  context.className = "lineup-player__context";
  const source = player.analytics?.source || state.dataset?.source || {};
  const sample = insight?.sample || analyticsRateViews(player).sample || {};
  const phase = source.phase === "playoffs" || source.seasonPhase === "playoffs"
    ? "Playoffs"
    : "Regular season";
  const basicParts = [
    source.season || state.dataset?.source?.season,
    source.team || player.team,
    phase,
  ].filter(Boolean);
  const teamLabel = source.team || player.team || "this team";
  const detailedParts = [
    ...basicParts,
    Number.isFinite(Number(sample.games))
      ? `${formatNumber(sample.games, 0)} games for ${teamLabel}`
      : "",
    Number.isFinite(Number(sample.totalMinutes))
      ? `${formatNumber(sample.totalMinutes, 0)} total minutes for ${teamLabel}`
      : "",
  ].filter(Boolean);
  if (player.analytics?.postseasonAvailable === true) detailedParts.push("Playoff stats available");

  // Simple mode needs only enough context to identify the season/team row.
  // Detailed mode exposes the full evidence envelope in plain language. Both
  // live in the same card so switching modes never requires re-running the
  // optimizer or reconstructing its result.
  const simple = document.createElement("span");
  simple.className = "simple-only";
  simple.textContent = basicParts.join(" · ");
  const detailed = document.createElement("span");
  detailed.className = "detailed-only";
  detailed.textContent = detailedParts.join(" · ");
  context.append(simple, detailed);
  return context;
}

function renderRoleTags(roles = []) {
  const tags = document.createElement("div");
  tags.className = "role-tags";
  if (!Array.isArray(roles) || roles.length === 0) {
    const tag = document.createElement("span");
    tag.className = "role-tag role-tag--neutral";
    tag.textContent = "Role signal not established";
    tag.title = "The current comparison pool did not establish a statistical role signal for this player.";
    tags.append(tag);
    return tags;
  }
  roles.slice(0, 3).forEach((role) => {
    const tag = document.createElement("span");
    tag.className = "role-tag";
    const provisional = role.confidence === "small-sample";
    // Keep short-stint labels useful while making their uncertainty obvious at
    // the exact place a fan first sees them—not only in a later method note.
    tag.textContent = provisional
      ? `Limited sample · ${role.shortLabel || role.label}`
      : role.shortLabel || role.label;
    tag.title = `${role.label}${provisional ? " (limited sample; not counted toward role coverage)" : ""}: ${role.evidence?.[0] || "statistical role signal"}`;
    tags.append(tag);
  });
  return tags;
}

function renderExactObjectiveReasons(player, result, insight) {
  const details = document.createElement("details");
  details.className = "why-selected";
  const summary = document.createElement("summary");
  summary.textContent = "Why the model selected this player";
  details.append(summary);

  if (result?.diagnostics?.objectiveReference?.mode === "swishiq-impact") {
    const model = result.best.modelAdjustments?.swishiqImpact;
    const row = model?.playerImpactContributionsById?.[player.id];
    const weights = model?.additiveImpactPer100?.objectiveWeights;
    const explanation = document.createElement("p");
    explanation.textContent = "SwishIQ Impact selects the feasible group with the highest user-weighted offense/defense impact. The card's points, rebounds, shooting percentages, and descriptive roles are context, not hidden scoring priorities. A player's individual rank alone does not explain the whole constrained solution.";
    details.append(explanation);
    if (row && weights) {
      const impact = document.createElement("p");
      impact.textContent = `Player impact coefficients per 100 possessions: offense ${formatImpactDifference(row.offenseCoefficient)}; defense ${formatImpactDifference(row.defenseCoefficient)} (positive = points prevented). Your objective uses ${formatNumber(weights.offense * 100, 0)}% offense and ${formatNumber(weights.defense * 100, 0)}% defense.`;
      const contribution = document.createElement("p");
      contribution.textContent = result.best.rotation
        ? `At ${formatNumber(row.minutes, 0)} assigned minutes, this player's additive contribution to your weighted objective is ${formatImpactDifference(row.preferenceWeighted)}. Minutes divided by 48 approximates on-court exposure; it is not a forecast of how efficiency changes with usage.`
        : `This player's additive contribution to your equal-minutes weighted objective is ${formatImpactDifference(row.preferenceWeighted)}.`;
      details.append(impact, contribution);
    }
    const next = document.createElement("p");
    next.textContent = "Use the replacement comparison to see the O/D tradeoff and every minute change under the same rules. These additive estimates do not establish chemistry or predict a game's outcome.";
    details.append(next);
    return details;
  }

  const rotationBasis = result?.diagnostics?.rotationScoringBasis;
  const rateStability = result?.diagnostics?.objectiveRateEvidence || result?.diagnostics?.rotationRateStabilityEvidence;
  const minutePlan = result?.best?.rotation?.minutePlan;
  const historicalGuidance = result?.best?.rotation?.historicalGuidance;
  const minutePlanExplanation = minutePlan === "historicalAware"
    ? historicalGuidance?.applied
      ? historicalGuidance?.allocationStyleApplied === "preserveWorkload"
        ? `Your game-plan fit selected this roster. The optional recorded-workload rule keeps the plan close to observed usage inside its capacity window${historicalGuidance.status === "expanded-for-role-coverage" ? ", including the expanded position coverage" : ""}.`
        : `${historicalGuidance.allocationStyleReason || "Minutes shift toward the best-fitting profiles inside the displayed recorded-minutes capacity caps."}`
      : "The optional past-minutes guardrail could not be applied, so minutes use the hard limits you set. Recorded workload counts were unavailable."
    : "Game-plan minutes optimize inside the hard limits you set. Observed samples can inform estimated rates, but do not impose a minute target or cap.";
  const assignedRoleScoring = result?.best?.rotation?.diagnostics?.roleConditionedScoring;
  const workloadSaturation = assignedRoleScoring?.workloadSaturation;
  const confidenceReserveCopy = rateStability?.uncertaintyAdjustedPlayerMetricCount > 0
    ? " A separate downside reserve reflects actual matched sample size; past team games never set a minute target."
    : "";
  const roleProjectionCopy = assignedRoleScoring?.applied
    ? `Rates are stabilized toward the same-season NBA baseline.${confidenceReserveCopy} Expanded workloads use the selected rate projection. No automatic taper starts at a roster-average minute target. `
    : rateStability?.roleAdjustedPlayerMetricCount > 0
      ? "Limited-role rates are adjusted toward the same-season NBA baseline for the projected workload. "
      : rateStability?.applied
        ? `Smaller opportunity samples are stabilized toward the same-season NBA baseline.${confidenceReserveCopy} `
        : "";
  // Keep the new responsibility prior visible at the decision point. This
  // count is player-metric comparisons, not a hidden score or an additional
  // minute rule: it tells a fan exactly when disclosed season-wide or
  // independently certified SwishIQ workload evidence tempered an advantage
  // outside an observed offensive role.
  const responsibilityPriorCopy = assignedRoleScoring?.responsibilityPriorPlayerMetricCount > 0
    ? ` ${formatNumber(assignedRoleScoring.responsibilityPriorPlayerMetricCount, 0)} offensive player-metric comparison${assignedRoleScoring.responsibilityPriorPlayerMetricCount === 1 ? " uses" : "s use"} a conservative larger-role adjustment based on season-wide responsibility. It does not set a minute target or represent a learned usage effect. `
    : "";
  const basis = document.createElement("p");
  basis.textContent = rotationBasis === "per36"
    ? `${roleProjectionCopy}${responsibilityPriorCopy}Counting stats are ranked per 36 minutes. ${minutePlanExplanation} The contribution below reflects the proposed minutes.`
    : rotationBasis === "perGame"
      ? "This rotation uses the raw per-game comparison; the contribution below also reflects the proposed minutes."
      : `This lineup compares equal player profiles on a per-36 basis. ${rateStability?.applied ? "Supported metrics use sample-adjusted contributions, not pool percentiles. Shooting frequency is assessed separately from accuracy." : "Matching sample counts are unavailable, so the comparison uses raw rates."} Production totals below remain sums of the players' recorded per-game lines, not a team forecast.`;
  details.append(basis);

  // Keep team membership and rate evidence distinct where a fan asks "why?".
  // This is available imported exposure, not a claim that every metric used
  // it or that the original provider's complete season has been reconciled.
  const seasonTotals = player.analytics?.seasonTotals;
  const seasonEvidence = player.analytics?.seasonEvidence;
  if (rotationBasis === "per36" && rateStability?.applied
      && seasonEvidence?.scope === "season-wide" && seasonTotals?.games > 0) {
    const sample = document.createElement("p");
    const teamCount = seasonEvidence.teamStintCount;
    const teamCopy = teamCount > 0
      ? ` across ${formatNumber(teamCount, 0)} team${teamCount === 1 ? "" : "s"}`
      : " across teams";
    sample.textContent = `Available season sample: ${formatNumber(seasonTotals.games, 0)} games and ${formatNumber(seasonTotals.minutes, 0)} minutes${teamCopy}. Each metric needs matching counts. Missing observations can use that player's own season baseline as a prior. Metrics without matching baselines are excluded from the objective; sample sizes are never guessed. The card's visible stats still describe the selected team.`;
    details.append(sample);
  }

  const contribution = result?.best?.playerContributions?.[player.id];
  const entries = Object.entries(contribution?.metrics || {})
    .filter(([, item]) => Number(item?.scoreContribution) > 0)
    .sort((left, right) => Number(right[1].scoreContribution) - Number(left[1].scoreContribution));
  const list = document.createElement("ul");
  if (entries.length) {
    entries.slice(0, 3).forEach(([metric, item]) => {
      const row = document.createElement("li");
      const percentile = Number(item.percentile);
      const evidenceScore = rateStability?.applied && [...(rateStability.stabilizedMetrics || []), ...(rateStability.partiallyStabilizedMetrics || [])].includes(metric);
      const percentileContext = item.assignedRoleAdjusted ? "percentile after the extra-minute adjustment" : "percentile in this search";
      row.textContent = evidenceScore
        ? `${resultMetricLabel(metric)}: ${formatPercent(percentile)} normalized contribution${item.assignedRoleAdjusted ? " at assigned workload" : ""}. This is not a win probability.`
        : `${resultMetricLabel(metric)}: ${formatOrdinal(percentile * 100)} ${percentileContext}.`;
      list.append(row);
    });
  } else {
    // The explanation layer remains useful if a future compatible optimizer
    // does not return player-level contributions. It is visibly labelled as a
    // pool-relative profile, not back-filled as an exact solver explanation.
    (insight?.whySelected || []).slice(0, 3).forEach((reason) => {
      const row = document.createElement("li");
      row.textContent = reason;
      list.append(row);
    });
  }
  details.append(list);
  return details;
}

function replacementResultElements(playerId) {
  return [...elements.resultContent.querySelectorAll("[data-replacement-result]")]
    .filter((element) => element.dataset.replacementResult === playerId);
}

/**
 * Compare COMPLETE feasible solutions, including every player's reallocated
 * minutes and any group-level objective term. A one-player coefficient delta
 * misses those effects. The selection-only exclusion keeps the scoring pool
 * fixed; the versioned reference is checked before comparing unrounded values.
 * A better feasible restricted solution contradicts an original exact optimum:
 * surface that inconsistency, never explain it away with box-score tradeoffs.
 */
function replacementObjectiveComparison(originalResult, replacementResult) {
  const reference = originalResult?.diagnostics?.objectiveReference;
  const originalBest = originalResult?.best;
  const replacementBest = replacementResult?.best;
  const replacementReference = replacementResult?.diagnostics?.objectiveReference;
  if (reference?.version !== "counterfactual-objective-v2"
    || !originalBest || !replacementBest
    || JSON.stringify(reference) !== JSON.stringify(replacementReference)
    || !hasFiniteNumber(originalBest.objectiveValue)
    || !hasFiniteNumber(replacementBest.objectiveValue)) {
    return {
      available: false,
      reason: "A comparable result is unavailable. Run the current setup again before comparing objectives.",
    };
  }

  const isRotation = Boolean(originalBest.rotation);
  const delta = Number(replacementBest.objectiveValue) - Number(originalBest.objectiveValue);
  const originalImpact = originalBest.modelAdjustments?.swishiqImpact?.additiveImpactPer100;
  const replacementImpact = replacementBest.modelAdjustments?.swishiqImpact?.additiveImpactPer100;
  const impactDeltas = Object.fromEntries(["offense", "defense", "net", "preferenceWeighted"].map(key => [
    key, hasFiniteNumber(originalImpact?.[key]) && hasFiniteNumber(replacementImpact?.[key])
      ? Number(replacementImpact[key]) - Number(originalImpact[key]) : null,
  ]));
  const names = new Map([...originalBest.players, ...replacementBest.players].map(player => [player.id, player.name]));
  const minuteChanges = isRotation ? [...names].flatMap(([id, name]) => {
    // Zero is appropriate only for an absent roster member, not missing data
    // for a selected player. Do not invent a schedule if the solver omitted it.
    const before = originalBest.players.some(player => player.id === id) ? originalBest.rotation.byId?.[id] : 0;
    const after = replacementBest.players.some(player => player.id === id) ? replacementBest.rotation?.byId?.[id] : 0;
    return hasFiniteNumber(before) && hasFiniteNumber(after) && Number(before) !== Number(after)
      ? [{ id, name, before: Number(before), after: Number(after) }] : [];
  }) : [];
  return {
    available: true,
    mode: reference.mode || "historical",
    isRotation,
    basis: reference.basis || "fixed-original-pool",
    objectiveUnit: reference.objectiveMetadata?.unit || "weighted-box-score-fit-index-0-to-100",
    objectiveUnitLabel: reference.objectiveMetadata?.unitLabel || "weighted box-score fit-index point",
    poolSize: Number(reference.poolSize) || null,
    objectiveDelta: delta,
    // Same numerical tolerance as the exact enumerator. Presentation rounding
    // is never used to decide whether a replacement is better or tied.
    consistencyIssue: delta > 1e-12,
    tied: Math.abs(delta) <= 1e-12,
    impactDeltas,
    swishiqWeights: originalImpact?.objectiveWeights || null,
    minuteChanges,
  };
}

// Box-score cards round to tenths, but that can hide the very O/D tradeoff
// explaining a replacement. Preserve small nonzero impact differences here.
function formatImpactDifference(value) {
  if (!hasFiniteNumber(value)) return "Unavailable";
  const number = Number(value);
  if (Math.abs(number) <= 1e-12) return "0";
  return `${number > 0 ? "+" : "-"}${Math.abs(number) >= .01 ? Math.abs(number).toFixed(2) : Math.abs(number).toExponential(2)}`;
}

function swishiqResultObjectiveExplanation(result) {
  // Explain the frozen result's preferences, never the currently edited form.
  // A stale result must not acquire a new explanation when its controls change.
  const weights = result.diagnostics?.swishiqImpactModel?.objectiveWeights;
  if (!weights || ![weights.offense, weights.defense].every(value => typeof value === "number" && Number.isFinite(value))) {
    return "The saved result does not contain a complete offense/defense weight breakdown.";
  }
  const percent = value => (value * 100).toLocaleString(undefined, { maximumSignificantDigits: 4 });
  return `Objective = ${percent(weights.offense)}% × offense impact + ${percent(weights.defense)}% × defense impact. Higher is preferred. Zero weight removes that side from ranking, not from your hard rules. The coefficients themselves are unchanged.`;
}

function replacementAnalysisMarkup(playerId, analysis) {
  const output = document.createElement("div");
  output.className = "exact-replacement__result";
  output.dataset.replacementResult = playerId;
  // Do not imply that a replacement is infeasible before the visitor asks the
  // exact solver to test one. The empty node gives the delegated handler a
  // stable place to render its result without layout-jumping the player card.
  if (analysis === undefined) {
    output.hidden = true;
    return output;
  }
  if (!analysis?.ok) {
    output.dataset.status = "unavailable";
    output.textContent = analysis?.message || "No feasible replacement was found under the current rules.";
    return output;
  }
  const deltas = analysis.deltas || {};
  const deltaLabel = key => hasFiniteNumber(deltas[key]) ? formatSignedDifference(deltas[key]) : "Unavailable";
  const deltaParts = [
    `PTS ${deltaLabel("points")}`,
    `REB ${deltaLabel("rebounds")}`,
    `AST ${deltaLabel("assists")}`,
    `STL ${deltaLabel("steals")}`,
    `BLK ${deltaLabel("blocks")}`,
    `TOV ${deltaLabel("turnovers")}`,
  ];
  const removedName = currentPlayer(playerId)?.name || "the selected player";
  const title = document.createElement("strong");
  title.textContent = `${removedName} out → ${analysis.replacementName} in`;
  const production = document.createElement("p");
  production.textContent = `Whole-lineup production change: ${deltaParts.join(" · ")}.`;
  output.append(title, production);
  const objective = analysis.objectiveComparison;
  const objectiveNote = document.createElement("p");
  objectiveNote.className = "exact-replacement__objective";
  if (objective?.available) {
    const delta = objective.objectiveDelta;
    const magnitude = Math.abs(delta) >= .0001 ? formatNumber(Math.abs(delta), 4) : Math.abs(delta).toExponential(2);
    const objectiveLabel = objective.mode === "swishiq-impact"
      ? "the SwishIQ Impact offense/defense objective"
      : "your selected game-plan objective";
    if (objective.consistencyIssue) {
      output.dataset.status = "consistency-warning";
      objectiveNote.textContent = `Solver consistency warning: this feasible replacement improves ${objectiveLabel} by ${magnitude} ${objective.objectiveUnitLabel}. The original result should not be treated as a confirmed optimum. This needs investigation, not a tradeoff explanation.`;
    } else {
      objectiveNote.textContent = objective.tied
        ? `Objective consequence: the two complete solutions tie on ${objectiveLabel}. The optimizer does not use extra box-score production as a hidden tie-breaker.`
        : `Objective consequence: the replacement lowers ${objectiveLabel} by ${magnitude} ${objective.objectiveUnitLabel}. This includes the entire lineup and all minute changes. Higher box-score totals do not necessarily improve your selected objective.`;
    }
    if (Object.values(objective.impactDeltas).every(hasFiniteNumber)) {
      const impact = document.createElement("p");
      const label = key => formatImpactDifference(objective.impactDeltas[key]);
      impact.textContent = `SwishIQ Impact change per 100 possessions: offense ${label("offense")} · defense ${label("defense")} · net ${label("net")} · your weighted O/D objective ${label("preferenceWeighted")}. Positive defense means more points prevented. These are additive player-impact estimates, not a predicted game score.`;
      output.append(impact);
    }
    if (objective.minuteChanges.length) {
      const minutes = document.createElement("p");
      minutes.textContent = `All minute changes: ${objective.minuteChanges.map(row => `${row.name} ${row.before} → ${row.after}`).join("; ")}. Unlisted players keep the same minutes.`;
      output.append(minutes);
    }
  } else {
    objectiveNote.textContent = `Objective consequence: ${objective?.reason || "The common original-pool objective comparison was unavailable."} The production line above is descriptive and does not by itself prove a better replacement.`;
  }
  output.append(objectiveNote);
  const method = document.createElement("details"), methodTitle = document.createElement("summary"), methodCopy = document.createElement("p");
  methodTitle.textContent = "What this comparison means";
  methodCopy.textContent = "This finds the best feasible one-player replacement while preserving every other selected player and current rule. In a rotation, all selected players' minutes may be reallocated. The comparison pool stays fixed, and unrounded solver objectives are compared only when both results use the same objective. The bounded display fit is separate from the solver objective; neither is a prediction of team points or wins. Role labels and production totals alone cannot explain a SwishIQ Impact decision.";
  method.append(methodTitle, methodCopy);
  const roles = analysis.roleChanges;
  if (roles?.available) {
    const label = status => ({ covered: "covered", thin: "thin", gap: "no clear signal", unassessed: "not assessed" })[status];
    const changes = roles.changes.length ? roles.changes.map(role => `${role.label}: ${label(role.before)} → ${label(role.after)}`).join("; ") : "No role-coverage category changed; the two players are not necessarily equivalent.";
    const change = document.createElement("p"), remaining = document.createElement("p"), note = document.createElement("p");
    change.textContent = `Role check: ${changes}`;
    remaining.textContent = `Descriptive role gaps: ${roles.remaining.join(", ") || "none flagged; this does not mean the replacement has no objective cost"}.`;
    note.textContent = `${roles.unassessed.length ? `Not assessed: ${roles.unassessed.join(", ")}. ` : ""}${roles.note}`;
    output.append(change, remaining); method.append(note);
  }
  const unchanged = document.createElement("p");
  unchanged.textContent = "What-if only: your original selection has not been replaced.";
  output.append(unchanged, method);
  return output;
}

function renderExactReplacementPanel(player, result, insight) {
  const wrap = document.createElement("div");
  wrap.className = "exact-replacement";
  const cached = state.replacementAnalyses.get(`${state.scenarioVersion}:${player.id}`);
  const nearest = insight?.replacements?.byRemovedPlayerId?.[player.id];
  if (nearest) {
    const nearby = document.createElement("p");
    nearby.textContent = `Closest displayed alternative: ${nearest.summary} It may change more than one player.`;
    wrap.append(nearby);
  }
  const button = document.createElement("button");
  button.type = "button";
  button.className = "button button--quiet";
  button.dataset.action = "exact-replacement";
  button.dataset.playerId = player.id;
  button.textContent = "Test a replacement";
  if (state.lockedIds.has(player.id)) {
    button.disabled = true;
    const unavailable = replacementAnalysisMarkup(player.id, {
      ok: false,
      message: "This player is locked by the current scenario. Unlock them to test a replacement.",
    });
    wrap.append(button, unavailable);
    return wrap;
  }
  wrap.append(button, replacementAnalysisMarkup(player.id, cached));
  return wrap;
}

function renderLineupPlayer(player, lineup, index, { result, insight } = {}) {
  const card = document.createElement("article");
  card.className = "lineup-player";
  const top = document.createElement("div");
  top.className = "lineup-player__top";
  const position = document.createElement("span");
  position.className = "position-pill";
  position.textContent = assignedPosition(lineup, player.id);
  const positionEvidence = player.positionEvidence;
  const assignedRoleMinutes = lineup.rotation?.positionMinutes?.byPlayer?.[player.id];
  const assignedRoleDetail = roleMinuteSummary(assignedRoleMinutes);
  const positionTitleParts = assignedRoleDetail
    ? [`Assigned role minutes: ${assignedRoleDetail}.`]
    : [`Assigned position: ${position.textContent}.`];
  if (positionEvidence?.usesCareerProfile) {
    const seasonRoles = Array.isArray(positionEvidence.seasonListed) && positionEvidence.seasonListed.length
      ? positionEvidence.seasonListed.join("/")
      : "not supplied";
    const eligibleRoles = Array.isArray(positionEvidence.eligible) && positionEvidence.eligible.length
      ? positionEvidence.eligible.join("/")
      : player.positions.join("/");
    positionTitleParts.push(`Eligible ${eligibleRoles}; season listing ${seasonRoles}; career positions are available for this scenario.`);
  }
  position.title = positionTitleParts.join(" ");
  const rank = document.createElement("span");
  rank.className = "lineup-player__rank";
  rank.textContent = String(index + 1).padStart(2, "0");
  top.append(position);
  if (lineup.rotation) {
    const minutes = document.createElement("strong");
    minutes.className = "lineup-player__minutes";
    minutes.textContent = `${Number(lineup.rotation.byId?.[player.id] || 0)} min`;
    top.append(minutes);
  }
  top.append(rank);
  const avatar = createPlayerAvatar(player, "lineup-player__portrait");
  const name = document.createElement("h3");
  name.textContent = player.name;
  const stats = document.createElement("dl");
  for (const metric of ["points", "rebounds", "assists"]) {
    const label = analyticsMetricShortLabel(metric);
    const value = analyticsValue(player, metric);

    const wrap = document.createElement("div");
    const dt = document.createElement("dt");
    dt.textContent = label;
    const dd = document.createElement("dd");
    dd.textContent = analyticsMetricText(metric, value);
    wrap.append(dt, dd);
    stats.append(wrap);
  }
  // Simple mode keeps each card to the facts needed to scan a recommendation.
  // The audit trail, role proxies, replacement experiment, and inventory link
  // remain intact in Detailed view without turning the default answer into a
  // wall of secondary controls.
  const roleTags = renderRoleTags(insight?.roles);
  roleTags.classList.add("detailed-only");
  const exactReasons = renderExactObjectiveReasons(player, result, insight);
  exactReasons.classList.add("detailed-only");
  const replacementPanel = renderExactReplacementPanel(player, result, insight);
  replacementPanel.classList.add("detailed-only");
  const cardSearch = createCardSearchLink(player);
  cardSearch.classList.add("detailed-only");
  card.append(top);
  if (avatar) card.append(avatar);
  card.append(
    name,
    renderPlayerSeasonContext(player, insight),
    stats,
    roleTags,
    exactReasons,
    replacementPanel,
    cardSearch,
  );
  return card;
}

function renderContributionList(breakdown) {
  const list = document.createElement("ul");
  list.className = "contribution-list";
  const entries = Object.entries(breakdown || {}).sort(
    (left, right) => right[1].scoreContribution - left[1].scoreContribution,
  );
  for (const [metric, detail] of entries) {
    if (detail.weight <= 0) continue;
    const item = document.createElement("li");
    item.className = "metric-bar metric-bar--tile";
    item.setAttribute("aria-label", `${resultMetricLabel(metric)}: ${Math.round(detail.averagePercentile * 100)} percentile`);
    const label = document.createElement("span");
    label.textContent = resultMetricLabel(metric);
    const track = document.createElement("span");
    track.className = "metric-bar__track";
    const fill = document.createElement("span");
    fill.className = "metric-bar__fill";
    fill.style.width = `${Math.max(2, Math.min(100, detail.averagePercentile * 100))}%`;
    track.append(fill);
    const value = document.createElement("strong");
    value.textContent = `${Math.round(detail.averagePercentile * 100)}`;
    item.append(label, track, value);
    list.append(item);
  }
  return list;
}

function renderFamilyContributionList(breakdown) {
  const list = document.createElement("ul");
  list.className = "family-contribution-list";
  const entries = Object.entries(breakdown || {})
    .filter(([, detail]) => Number(detail?.scoreContribution) > 0)
    .sort((left, right) => Number(right[1].scoreContribution) - Number(left[1].scoreContribution));
  for (const [family, detail] of entries) {
    const item = document.createElement("li");
    const label = document.createElement("span");
    label.textContent = detail.label || FAMILY_LABELS[family] || titleCase(family);
    const value = document.createElement("strong");
    value.textContent = formatNumber(detail.scoreContribution);
    item.append(label, value);
    list.append(item);
  }
  return list;
}

function auditRow(labelText, valueText, passed = true) {
  const row = document.createElement("li");
  const label = document.createElement("span");
  label.textContent = labelText;
  const value = document.createElement("strong");
  value.className = passed ? "pass" : "fail";
  value.textContent = valueText;
  row.append(label, value);
  return row;
}

function constraintGrainLabel(grain) {
  return ({
    "selected-player-sum": "selected-player sum",
    "projected-selected-player-sum": "projected selected-player sum",
    "selected-player-count": "selected-player count",
    "selected-player-minute-total": "selected-player minute total",
  })[grain] || grain || "grain unavailable";
}

function renderAudit(audit) {
  const list = document.createElement("ul");
  list.className = "audit-list";
  list.append(auditRow(
    "Roster size",
    `${audit.exactSize.actual} / ${audit.exactSize.required}`,
    audit.exactSize.passed,
  ));
  const requiredPositions = Object.entries(audit.positionMinimums.required)
    .filter(([, count]) => count > 0)
    .map(([position, count]) => `${position} ${count}`)
    .join(", ") || "None";
  const positionSlack = Object.entries(audit.positionMinimums.slackByPosition || {})
    .filter(([position]) => Number(audit.positionMinimums.required[position]) > 0)
    .map(([position, slack]) => `${position} +${slack}`)
    .join(", ");
  list.append(auditRow(
    "Position slots · selected-player count",
    `${requiredPositions}${positionSlack ? ` · surplus ${positionSlack}` : ""}`,
    audit.positionMinimums.passed,
  ));
  if (audit.lockedPlayers.requiredIds.length > 0) {
    list.append(auditRow(
      "Locked players",
      `${audit.lockedPlayers.includedIds.length} / ${audit.lockedPlayers.requiredIds.length}`,
      audit.lockedPlayers.passed,
    ));
  }
  for (const [stat, check] of Object.entries(audit.statMinimums.checks || {})) {
    const slack = hasFiniteNumber(check.slack) ? formatNumber(check.slack, 2) : "unavailable";
    list.append(auditRow(
      `${titleCase(stat)} ${audit.rotationMinutes ? "projected minimum" : "profile minimum"} · ${constraintGrainLabel(check.grain)}`,
      `${formatNumber(check.actual)} / ${formatNumber(check.required)} · slack ${slack}`,
      check.passed,
    ));
  }
  if (audit.maxTurnovers.maximum !== null) {
    const slack = hasFiniteNumber(audit.maxTurnovers.slack) ? formatNumber(audit.maxTurnovers.slack, 2) : "unavailable";
    list.append(auditRow(
      `${audit.rotationMinutes ? "Projected turnover ceiling" : "Profile turnover ceiling"} · ${constraintGrainLabel(audit.maxTurnovers.grain)}`,
      `${formatNumber(audit.maxTurnovers.actual)} / ${formatNumber(audit.maxTurnovers.maximum)} · slack ${slack}`,
      audit.maxTurnovers.passed,
    ));
  }
  if (audit.rotationMinutes) {
    list.append(auditRow(
      "Player-minutes",
      `${audit.rotationMinutes.actual} / ${audit.rotationMinutes.required}`,
      audit.rotationMinutes.passed,
    ));
  }
  if (audit.rotationPositionMinutes) {
    const actual = audit.rotationPositionMinutes.actual;
    const ranges = audit.rotationPositionMinutes.ranges;
    const target = audit.rotationPositionMinutes.target;
    const roleSummary = ranges
      ? ["G", "F", "C"].map((position) => (
        `${position} ${actual[position]} · target ${target?.[position] ?? "—"} · allowed ${ranges[position].min}–${ranges[position].max}`
      )).join("; ")
      : ["G", "F", "C"].map((position) => (
        `${position} ${actual[position]}/${audit.rotationPositionMinutes.required[position]}`
      )).join(" · ");
    list.append(auditRow(
      ranges ? "On-court role minutes · soft-range allocation" : "On-court role minutes · assigned court-role minutes",
      roleSummary,
      audit.rotationPositionMinutes.passed,
    ));
  }
  const constrainedChecks = [
    ...Object.values(audit.statMinimums.checks || {}),
    audit.maxTurnovers,
  ].filter(check => check && (check.required !== undefined || check.maximum !== null));
  if (constrainedChecks.length > 0) {
    const note = document.createElement("li");
    note.className = "audit-list__note";
    note.textContent = "Objective cost to relax a bound: not computed.";
    list.append(note);
  }
  return list;
}

function roleMinuteSummary(roleMinutes) {
  return Object.entries(roleMinutes || {})
    .filter(([, minutes]) => Number(minutes) > 0)
    .map(([role, minutes]) => `${role} ${minutes}`)
    .join(" · ");
}

function resultEvidenceItem(label, value, detail) {
  const item = document.createElement("div");
  const labelNode = document.createElement("span");
  labelNode.textContent = label;
  const valueNode = document.createElement("strong");
  valueNode.textContent = value;
  const detailNode = document.createElement("small");
  detailNode.textContent = detail;
  item.append(labelNode, valueNode, detailNode);
  return item;
}

function renderResultEvidence(result) {
  const source = state.dataset?.source || {};
  const strip = document.createElement("section");
  strip.className = "result-evidence";
  strip.setAttribute("aria-label", "Result scope and limitations");
  const phase = source.seasonPhase === "playoffs" ? "Playoffs" : "Regular season";
  const swishiq = result.diagnostics?.swishiqImpactModel;
  strip.append(resultEvidenceItem(
    "Model selected",
    swishiq?.applied ? `SwishIQ Impact · ${swishiq.objective || "balanced"}` : "Historical · skill-priority fit",
    swishiq?.applied
      ? "Uses SwishIQ Impact player estimates with your offense and defense priorities. Historical stats provide context and hard constraints."
      : "Historical player stats and your skill priorities determined the result. SwishIQ Impact did not contribute.",
  ));
  const impact = result.best?.modelAdjustments?.swishiqImpact?.additiveImpactPer100;
  if (swishiq?.applied && impact) {
    strip.append(resultEvidenceItem(
      "SwishIQ Impact / 100 possessions",
      `Offense ${formatNumber(impact.offense, 2)} · Defense ${formatNumber(impact.defense, 2)} · Net ${formatNumber(impact.net, 2)}`,
      "Positive defense means points prevented. This sums player effects at estimated minute shares; it is not a game prediction. Result rank is reported separately.",
    ));
    if (impact.riskAdjusted && result.best?.modelAdjustments?.swishiqImpact?.riskProfile === "reliable") {
      strip.append(resultEvidenceItem(
        "Reliable Impact treatment",
        `Risk-adjusted offense ${formatNumber(impact.riskAdjusted.offense, 2)} · defense ${formatNumber(impact.riskAdjusted.defense, 2)} · net ${formatNumber(impact.riskAdjusted.net, 2)}`,
        "This readout shows the exposure-aware reserve used for the Reliable objective. It is a planning sensitivity, not a calibrated game forecast.",
      ));
    }
  }
  const constraintProjection = result.diagnostics?.productionConstraintProjection;
  if (constraintProjection) strip.append(resultEvidenceItem(
    "Production constraint totals", "Conservative bounds — not a forecast", "Limits use the same estimated production curve at each player's assigned minutes. Risk reserves are planning assumptions, not calibrated forecasts.",
  ));
  strip.append(resultEvidenceItem(
    "Stats",
    `${source.teamName || source.team || "Selected team"} · ${source.season || "Season unavailable"}`,
    `${phase} player stats recorded for this team.`,
  ));

  if (result.best?.rotation) {
    strip.append(resultEvidenceItem(
      "Minute plan",
      "Game-plan allocation",
      "Team games never set a minute target or cap. Observed game counts and minutes affect rate confidence, so larger samples can change the best allocation under your game plan and hard limits.",
    ));
  } else {
    strip.append(resultEvidenceItem(
      "Historical scope",
      "Selected team row",
      "Games and starts describe the team sample; they do not act as a player-quality score or minute target.",
    ));
  }

  const rateEvidence = result.diagnostics?.objectiveRateEvidence || result.diagnostics?.rotationRateStabilityEvidence;
  const assignedRoleScoring = result.best?.rotation?.diagnostics?.roleConditionedScoring;
  if (rateEvidence?.applied) {
    const roleProjectionDetail = rateEvidence.roleAdjustedPlayerMetricCount > 0
      ? ` ${rateEvidence.roleAdjustedPlayers} player${rateEvidence.roleAdjustedPlayers === 1 ? " also had" : "s also had"} at least one rate adjusted for the projected workload.`
      : "";
    const assignedRoleDetail = assignedRoleScoring?.applied
      ? ` ${formatNumber(assignedRoleScoring.expandedMinutes, 0)} planned minute${Number(assignedRoleScoring.expandedMinutes) === 1 ? "" : "s"} extend beyond observed roles. Uncertain advantages receive a sample adjustment. No roster-size-based penalty or automatic target minute range is applied.`
      : "";
    const responsibilityPriorDetail = assignedRoleScoring?.responsibilityPriorPlayerMetricCount > 0
      ? ` ${formatNumber(assignedRoleScoring.responsibilityPriorPlayerMetricCount, 0)} offensive player-metric comparison${assignedRoleScoring.responsibilityPriorPlayerMetricCount === 1 ? " used" : "s used"} the season-wide responsibility prior. The adjustment is a conservative sensitivity for an expanded role, not a restriction on assigned minutes.`
      : "";
    const seasonEvidenceDetail = rateEvidence.seasonWideEvidencePlayers > 0
      ? ` Matching season counts across teams informed at least one metric for ${rateEvidence.seasonWideEvidencePlayers} of ${rateEvidence.eligiblePlayers} eligible players. Other metrics require matching team counts or use a baseline-only prior. No sample size is guessed from games or MPG.`
      : " Matching all-team season counts were unavailable for this pool. Metrics require matching team counts or use a baseline-only prior; no sample size is guessed from games or MPG.";
    strip.append(resultEvidenceItem(
      "Rate projection",
      assignedRoleScoring?.applied
        ? "Sample-adjusted rates + workload assumptions"
        : rateEvidence.roleAdjustedPlayerMetricCount > 0
          ? "Sample-adjusted + role adjusted"
          : "Sample-adjusted rates",
      `${rateEvidence.adjustedPlayers} of ${rateEvidence.eligiblePlayers} eligible players had at least one rate stabilized.${seasonEvidenceDetail} An adjustable uncertainty reserve discounts less-supported rates. These adjustments are not calibrated player confidence intervals. Team games do not set a minute target or cap.${roleProjectionDetail}${assignedRoleDetail}${responsibilityPriorDetail}`,
    ));
  } else if (result.best?.rotation) {
    strip.append(resultEvidenceItem(
      "Rate projection",
      "Observed rates",
      "There are not enough matching stats to adjust rates for this group.",
    ));
  } else {
    strip.append(resultEvidenceItem(
      "Scoring layer",
      "Pool-relative player profiles",
      "Equal-player lineup fit; no proposed rotation minutes.",
    ));
  }
  const modelAdjustments = result.best?.modelAdjustments;
  if (modelAdjustments?.roleFit && !result.best?.rotation) {
    const roleFit = modelAdjustments.roleFit;
    const appliedBonus = roleFit.objectiveTreatment === "explicit-preference-bonus";
    strip.append(resultEvidenceItem(
      "Role coverage treatment",
      appliedBonus
        ? `Explicit preference bonus · ${formatNumber(roleFit.objectiveDelta, 3)} fit-index points`
        : "Explanation only · no objective bonus",
      appliedBonus
        ? "The exact role-fit delta is included in the selected preference objective; it is not calibrated to team points or wins."
        : "Role evidence describes roster coverage. It did not change the objective or lineup ranking.",
    ));
  }
  if (result.best?.rotation) {
    const usage = modelAdjustments?.usageDemand;
    const assumedUsage = Number(usage?.projectedUsageShare);
    const deficit = Number(usage?.deficitShare);
    const excess = Number(usage?.excessShare);
    const usageBasis = usage?.scenarioPlayerIds?.length ? "your usage scenarios and remaining observed rates" : "the observed usage rates";
    strip.append(resultEvidenceItem(
      "Offensive responsibility check",
      usage?.available
        ? deficit > 1e-9
          ? "Unassigned responsibility"
          : excess > 1e-9 ? "Roles overlap" : "Roles balance"
        : "Incomplete — no value guessed",
      usage?.available
        ? deficit > 1e-9
          ? `At the assigned minutes, ${usageBasis} cover ${formatNumber(assumedUsage * 100, 0)}% of team responsibility. Someone would need a larger role. The model has not automatically assigned that extra usage or claimed a learned efficiency change; this check adds no score penalty.`
          : `At the assigned minutes, ${usageBasis} total ${formatNumber(assumedUsage * 100, 0)}% of team responsibility.${excess > 1e-9 ? " Some roles would need to shrink when these players share the court." : " This summarizes usage shares, not offensive quality."} No group-level score adjustment is applied.`
        : `${usage?.missingPlayerIds?.length || 0} selected player${usage?.missingPlayerIds?.length === 1 ? " lacks" : "s lack"} both measured usage and an explicit scenario. Missing usage was not treated as zero, and no group-level score adjustment was applied.`,
    ));

    const roleFit = modelAdjustments?.roleFit;
    const strongestRoles = (roleFit?.strengths || []).slice(0, 2).map((entry) => entry.label);
    const thinnestRoles = (roleFit?.needs || []).slice(0, 2).map((entry) => entry.label);
    const riskKey = modelAdjustments?.projectionRisk || result.diagnostics?.projectionRisk || "balanced";
    const balanceKey = roleFit?.balance || result.diagnostics?.roleBalance || "off";
    const roleDetail = roleFit?.applied
      ? `A deliberately small soft preference rewards complementary skills after the direct game-plan priorities. Strongest signals: ${strongestRoles.join(" and ") || "not available"}. Thinnest signals: ${thinnestRoles.join(" and ") || "not available"}. No role became a hard requirement.`
      : "Role coverage was explained but did not change ranking. Position eligibility and every hard rule still applied normally.";
    strip.append(resultEvidenceItem(
      "Projection policy",
      `${PROJECTION_RISK_LABELS[riskKey] || "Balanced projection"} · ${ROLE_BALANCE_LABELS[balanceKey] || "Explanation only"} role balance`,
      roleDetail,
    ));
  }
  const objectiveEvidence = result.diagnostics?.objectiveMetricEvidence;
  const requestedImpact = ["offensiveImpact", "defensiveImpact"]
    .filter((metric) => Number(result.weights?.[metric]) > 0);
  const disabledImpact = (objectiveEvidence?.disabledRequestedMetrics || [])
    .filter((metric) => metric === "offensiveImpact" || metric === "defensiveImpact");
  strip.append(resultEvidenceItem(
    "Impact cross-check",
    requestedImpact.length === 0
      ? "Not requested"
      : disabledImpact.length > 0
        ? "Incomplete — safely omitted"
        : "OBPM/DBPM available",
    requestedImpact.length === 0
      ? "This custom strategy used only its selected standard box-score inputs."
      : disabledImpact.length > 0
        ? "The incomplete impact signal was disabled for every eligible player and its small weight was redistributed across the remaining priorities."
        : "Player-season OBPM/DBPM supplied a modest individual offense/defense check; the result still follows your visible priorities.",
  ));
  const modelIdentity = result.diagnostics?.modelIdentity;
  const swishiqModel = result.diagnostics?.swishiqImpactModel;
  strip.append(resultEvidenceItem(
    "SwishIQ Impact model",
    modelIdentity?.swishiqImpactLayer === "separate-not-active"
      ? "Separate layer · not active"
      : swishiqModel?.applied
        ? "Possession impact estimate active"
        : "Unavailable",
    swishiqModel?.applied
      ? "OBPM/DBPM are individual box-score estimates, not lineup chemistry. Possession-based impact is a separate estimate."
      : "Impact estimates are unavailable for this team-season. No other season was substituted.",
  ));
  return strip;
}

function renderResultRankingContext(result) {
  const wrap = document.createElement("div");
  wrap.className = "result-ranking-context";
  const best = result.best;
  const next = result.alternatives?.[1];
  const coreIds = best.playerIds.filter((id) => (
    result.alternatives.every((alternative) => alternative.playerIds.includes(id))
  ));
  const decision = result.resultPassport?.decision;
  const countComplete = decisionCountIsComplete(decision);
  const diagnosticCount = Number(result.diagnostics?.feasibleCombinations);
  const optionCount = Number(decision?.optionCount);
  const feasibleCount = Number.isFinite(optionCount) && optionCount > 0
    ? optionCount
    : Number.isFinite(diagnosticCount) && diagnosticCount > 0
      ? diagnosticCount
      : null;
  const objectiveGap = next && hasFiniteNumber(best.objectiveValue) && hasFiniteNumber(next.objectiveValue)
    ? Number(best.objectiveValue) - Number(next.objectiveValue)
    : null;
  const unitLabel = result.objectiveMetadata?.unitLabel || "objective units";
  const gapText = objectiveGap === null
    ? "Difference unavailable"
    : `${formatNumber(objectiveGap, result.objectiveMetadata?.unit === "weighted-player-impact-coefficient-per-100-possessions" ? 3 : 2)} ${unitLabel}`;
  const entries = countComplete
    ? [
      ["Rank", decision?.rank && feasibleCount
        ? `#${decision.rank} of ${feasibleCount.toLocaleString()} eligible groups`
        : "All eligible groups were searched; a rank is unavailable."],
      ["Best-to-next objective gap", next ? gapText : "No second feasible result returned"],
      ["Stable core", `${coreIds.length} of ${best.playerIds.length} players appear in every displayed result`],
    ]
    : [
      ["Search coverage", "Only returned groups are ranked; the full eligible-group count is unavailable."],
      ["Best-to-next objective gap", next ? gapText : "No additional feasible group was returned"],
      ["Stable core", "The returned groups share selected players; a complete overlap count is unavailable."],
    ];
  for (const [label, value] of entries) {
    const item = document.createElement("div");
    const term = document.createElement("span");
    term.textContent = label;
    const detail = document.createElement("strong");
    detail.textContent = value;
    item.append(term, detail);
    wrap.append(item);
  }
  return wrap;
}

function objectiveScenarioConfigs(baseConfig) {
  if (baseConfig?.modelMode === "swishiq-impact") {
    const withImpactObjective = (id, label, weights, projectionRisk = baseConfig.projectionRisk) => {
      const config = {
        ...baseConfig,
        swishiqObjective: "custom",
        swishiqObjectiveWeights: { ...weights },
        projectionRisk,
      };
      if (config.rotationOptions) {
        config.rotationOptions = { ...config.rotationOptions, projectionRisk };
      }
      return { id, label, config };
    };
    return [
      withImpactObjective("impact-offense", "Offense-only Impact", { offense: 1, defense: 0 }),
      withImpactObjective("impact-defense", "Defense-only Impact", { offense: 0, defense: 1 }),
      withImpactObjective("impact-reliable", "Reliable balanced Impact", { offense: 0.5, defense: 0.5 }, "reliable"),
    ];
  }

  const makeFamilyScenario = (id, label, familyWeights) => ({
    id,
    label,
    config: {
      ...baseConfig,
      familyWeights: { ...familyWeights },
      weights: weightsFromSkillFamilies(familyWeights),
      ...(baseConfig.rotationOptions ? { rotationOptions: { ...baseConfig.rotationOptions } } : {}),
    },
  });
  const scenarios = [
    makeFamilyScenario("skill-offense-led", "Offense-led skill priorities", {
      freeThrowPressure: 0,
      scoring: 40,
      spacing: 20,
      creation: 20,
      rebounding: 6,
      perimeterDefense: 7,
      interiorDefense: 7,
    }),
    makeFamilyScenario("skill-defense-led", "Defense-led skill priorities", {
      freeThrowPressure: 0,
      scoring: 6,
      spacing: 5,
      creation: 9,
      rebounding: 26,
      perimeterDefense: 27,
      interiorDefense: 27,
    }),
  ];
  const roleBalance = baseConfig.rotationOptions?.roleBalance ?? baseConfig.roleBalance ?? "off";
  const comparisonRoleBalance = roleBalance === "emphasized" ? "off" : "emphasized";
  const comparisonRoleLabel = comparisonRoleBalance === "off"
    ? "Role coverage explanation only"
    : "Role-coverage preference";
  const roleConfig = {
    ...baseConfig,
    roleBalance: comparisonRoleBalance,
    ...(baseConfig.rotationOptions
      ? { rotationOptions: { ...baseConfig.rotationOptions, roleBalance: comparisonRoleBalance } }
      : {}),
  };
  scenarios.push({ id: `role-balance-${comparisonRoleBalance}`, label: comparisonRoleLabel, config: roleConfig });

  // When a visitor adds production bounds, give them an independently solved
  // alternative that deliberately prioritizes headroom against those same
  // bounds. It remains a preference objective: every original hard rule is
  // still enforced, and this score is not projected points, wins, or a
  // calibrated value estimate. Prefer only supplied rule dimensions; never
  // invent a team-only rebound or turnover residual to make the scenario run.
  if (baseConfig.modelMode !== "swishiq-impact") {
    const marginWeights = Object.fromEntries(Object.keys(baseConfig.weights || {}).map(metric => [metric, 0]));
    let hasMarginMetric = false;
    for (const [stat, rawMinimum] of Object.entries(baseConfig.statMinimums || {})) {
      const minimum = Number(rawMinimum);
      if (!Number.isFinite(minimum) || minimum <= 0) continue;
      if (!Object.hasOwn(marginWeights, stat)) continue;
      marginWeights[stat] = 1;
      hasMarginMetric = true;
    }
    const turnoverCap = Number(baseConfig.maxTurnovers);
    if (baseConfig.maxTurnovers !== null && baseConfig.maxTurnovers !== undefined
      && Number.isFinite(turnoverCap) && Object.hasOwn(marginWeights, "ballSecurity")) {
      marginWeights.ballSecurity = 1;
      hasMarginMetric = true;
    }
    if (hasMarginMetric) {
      const constraintMarginConfig = {
        ...baseConfig,
        preset: null,
        familyWeights: null,
        weights: marginWeights,
        roleBalance: "off",
        ...(baseConfig.rotationOptions
          ? { rotationOptions: { ...baseConfig.rotationOptions, roleBalance: "off" } }
          : {}),
      };
      scenarios.push({
        id: "production-constraint-margin",
        label: "Production-constraint margin",
        config: constraintMarginConfig,
      });
    }
  }
  if (baseConfig.mode === "rotation" && baseConfig.rotationOptions?.projectionRisk !== "reliable") {
    const rotationOptions = { ...baseConfig.rotationOptions, projectionRisk: "reliable" };
    scenarios.push({
      id: "reliable-rate-projection",
      label: "Reliable rate projection",
      config: { ...baseConfig, projectionRisk: "reliable", rotationOptions },
    });
  }
  return scenarios;
}

function renderObjectiveScenarioTable(baseline, scenarios) {
  const baselineIds = baseline.best.playerIds.map((id) => String(id));
  const baselineSet = new Set(baselineIds);
  const section = document.createElement("section");
  section.className = "objective-scenario-results";
  section.setAttribute("aria-label", "Objective scenario comparison results");
  const note = document.createElement("p");
  note.className = "audit-list__note";
  note.textContent = "Each row is an independent solve with the same source roster and hard constraints. Objective values use each scenario's own units and are not comparable across rows. The constraint-margin alternative prioritizes only metrics with active rules; displayed slack stays in each rule's native units and is not a clearance probability.";
  const wrap = document.createElement("div");
  wrap.className = "table-wrap";
  const table = document.createElement("table");
  table.className = "alternatives-table";
  const caption = document.createElement("caption");
  caption.textContent = "Current result and independently optimized preference scenarios";
  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");
  for (const heading of ["Objective scenario", "Selected players", "Current-group overlap", "Membership distance", "Players changed", "Hard-rule margin", "Scenario objective"]) {
    const cell = document.createElement("th");
    cell.scope = "col";
    cell.textContent = heading;
    headerRow.append(cell);
  }
  thead.append(headerRow);
  const tbody = document.createElement("tbody");
  const rows = [{ label: "Current objective", result: baseline }, ...scenarios.map((scenario) => ({
    label: scenario.label,
    result: scenario.result,
  }))];
  for (const { label, result } of rows) {
    const row = document.createElement("tr");
    const scenarioCell = document.createElement("th");
    scenarioCell.scope = "row";
    scenarioCell.textContent = label;
    row.append(scenarioCell);
    const best = result?.best;
    const selectedCell = document.createElement("td");
    selectedCell.textContent = best?.players?.map((player) => player.name).join(", ")
      || result?.reasons?.[0]
      || "No feasible group returned";
    row.append(selectedCell);
    const overlapCell = document.createElement("td");
    const selectedIds = (best?.playerIds || []).map((id) => String(id));
    const selectedSet = new Set(selectedIds);
    const shared = selectedIds.filter((id) => baselineSet.has(id)).length;
    overlapCell.textContent = best
      ? `${shared} of ${baselineIds.length} current players retained`
      : "Unavailable";
    row.append(overlapCell);
    const addedPlayers = (best?.players || []).filter((player) => !baselineSet.has(String(player.id)));
    const removedPlayers = baseline.best.players.filter((player) => !selectedSet.has(String(player.id)));
    const membershipDistance = document.createElement("td");
    membershipDistance.textContent = best
      ? `${addedPlayers.length + removedPlayers.length} player changes (${addedPlayers.length} in, ${removedPlayers.length} out)`
      : "Unavailable";
    row.append(membershipDistance);
    const membershipChanges = document.createElement("td");
    if (!best) membershipChanges.textContent = "Unavailable";
    else if (!addedPlayers.length && !removedPlayers.length) membershipChanges.textContent = "No player changes";
    else {
      const changes = [];
      if (addedPlayers.length) changes.push(`In: ${addedPlayers.map((player) => player.name).join(", ")}`);
      if (removedPlayers.length) changes.push(`Out: ${removedPlayers.map((player) => player.name).join(", ")}`);
      membershipChanges.textContent = changes.join(" · ");
    }
    row.append(membershipChanges);
    const marginCell = document.createElement("td");
    const audit = best?.constraintAudit;
    const marginParts = [];
    for (const [stat, check] of Object.entries(audit?.statMinimums?.checks || {})) {
      if (!hasFiniteNumber(check.slack)) continue;
      marginParts.push(`${stat.toUpperCase()} +${formatNumber(check.slack, 2)}`);
    }
    if (audit?.maxTurnovers?.maximum !== null
      && audit?.maxTurnovers?.maximum !== undefined
      && hasFiniteNumber(audit.maxTurnovers.slack)) {
      marginParts.push(`TOV headroom ${formatNumber(audit.maxTurnovers.slack, 2)}`);
    }
    marginCell.textContent = best
      ? marginParts.length ? marginParts.join(" · ") : "No production bounds"
      : "Unavailable";
    row.append(marginCell);
    const objectiveCell = document.createElement("td");
    const objectiveValue = Number(best?.objectiveValue);
    const metadata = result?.objectiveMetadata || {};
    objectiveCell.textContent = Number.isFinite(objectiveValue)
      ? `${formatNumber(objectiveValue, metadata.unit === "weighted-player-impact-coefficient-per-100-possessions" ? 3 : 2)} ${metadata.unitLabel || "objective units"}`
      : "Unavailable";
    row.append(objectiveCell);
    tbody.append(row);
  }
  table.append(caption, thead, tbody);
  wrap.append(table);
  section.append(note, wrap);
  return section;
}

async function runObjectiveScenarioComparison(button, status, output, baseline, request, scenarios) {
  if (state.activeOptimizationToken !== null || state.optimizationWorker) return;
  if (state.lastResult !== baseline || state.lastOptimizerRequest !== request
    || request.scenarioVersion !== state.scenarioVersion
    || elements.results.classList.contains("is-stale")) {
    status.textContent = "Settings changed after this result. Run the optimizer again before comparing objectives.";
    return;
  }
  const jobToken = state.optimizationRunId;
  const scenarioVersion = state.scenarioVersion;
  button.disabled = true;
  button.textContent = "Comparing objectives…";
  status.textContent = "Running separate exact solves with the same roster and rules…";
  output.replaceChildren();
  state.activeOptimizationToken = jobToken;
  elements.form.setAttribute("aria-busy", "true");
  setOptimizeButtons({ disabled: true, label: "Comparing objectives…" });
  setOptimizationCancellationAvailable(true);
  setSolverStatus("Comparing explicit objective scenarios…", "working");
  try {
    const response = await runOptimization(request.players, request.config, jobToken, {
      scenarioConfigs: scenarios,
      onProgress: (progress) => {
        if (jobToken !== state.optimizationRunId || scenarioVersion !== state.scenarioVersion) return;
        if (progress?.scenarioLabel) setSolverStatus(`Comparing ${progress.scenarioLabel}…`, "working");
      },
    });
    if (jobToken !== state.optimizationRunId || scenarioVersion !== state.scenarioVersion
      || state.lastResult !== baseline) return;
    const scenarioResults = response?.kind === "objective-scenario-comparison" ? response.scenarios : null;
    if (!Array.isArray(scenarioResults) || scenarioResults.length !== scenarios.length) {
      throw new Error("The scenario worker returned an incomplete comparison.");
    }
    const failed = scenarioResults.filter((scenario) => !scenario.ok);
    output.replaceChildren(renderObjectiveScenarioTable(baseline, scenarioResults));
    status.textContent = failed.length
      ? `${scenarioResults.length - failed.length} of ${scenarioResults.length} objective scenarios returned a feasible result; unavailable rows show their reason.`
      : `Completed ${scenarioResults.length} independent objective scenarios.`;
    setSolverStatus("Objective scenario comparison ready", failed.length ? "warning" : "success");
  } catch (error) {
    if (error?.name === "AbortError") {
      const requestStillCurrent = state.lastResult === baseline
        && state.lastOptimizerRequest === request
        && request.scenarioVersion === state.scenarioVersion
        && !elements.results.classList.contains("is-stale");
      status.textContent = requestStillCurrent
        ? "Scenario comparison was cancelled before all solves completed."
        : "Scenario comparison cancelled because the settings changed.";
    } else {
      status.textContent = error instanceof Error ? error.message : "The objective scenarios could not be compared.";
    }
    setSolverStatus("Objective scenario comparison stopped", "warning");
  } finally {
    const requestStillCurrent = state.lastResult === baseline
      && state.lastOptimizerRequest === request
      && request.scenarioVersion === state.scenarioVersion
      && !elements.results.classList.contains("is-stale");
    button.disabled = !requestStillCurrent;
    button.textContent = "Compare objective scenarios";
    if (jobToken === state.optimizationRunId && state.activeOptimizationToken === jobToken) {
      state.activeOptimizationToken = null;
      elements.form.removeAttribute("aria-busy");
      setOptimizationCancellationAvailable(false);
      setOptimizeButtons();
    }
  }
}

function renderObjectiveScenarioControl(result) {
  const request = state.lastOptimizerRequest;
  if (!result.ok || !result.best || !request || request.scenarioVersion !== state.scenarioVersion) return null;
  const scenarios = objectiveScenarioConfigs(request.config);
  const section = document.createElement("section");
  section.className = "result-card objective-scenario-card";
  const heading = document.createElement("h3");
  heading.textContent = "Compare objective scenarios";
  const description = document.createElement("p");
  description.textContent = request.config.modelMode === "swishiq-impact"
    ? "Run separate offense-only, defense-only, and reliable balanced Impact solves. Each keeps this exact team-season and every hard rule."
    : "Run separate offense-led and defense-led game-plan solves, plus a reliable rate-projection case for rotations. Each keeps this exact team-season and every hard rule.";
  const button = document.createElement("button");
  button.type = "button";
  button.className = "button button--secondary";
  button.textContent = "Compare objective scenarios";
  const status = document.createElement("p");
  status.setAttribute("role", "status");
  const output = document.createElement("div");
  button.addEventListener("click", () => {
    void runObjectiveScenarioComparison(button, status, output, result, request, scenarios);
  });
  section.append(heading, description, button, status, output);
  return section;
}

function inputStabilityOptions(result, request) {
  const modelMode = request.config.modelMode || "historical";
  const availableMetrics = new Set(result.diagnostics?.objectiveMetricEvidence?.availableMetrics || []);
  const historicalOptions = modelMode === "swishiq-impact" ? [] : Object.entries(LINEUP_INPUT_STABILITY_METRICS)
    .filter(([metric, spec]) => spec.kind === "historical"
      && availableMetrics.has(metric)
      && Number(result.effectiveWeights?.[metric]) > 0)
    .map(([metric, spec]) => ({ metric, ...spec }));
  const impactOptions = modelMode === "historical" || result.diagnostics?.swishiqImpactModel?.applied !== true
    ? []
    : Object.entries(LINEUP_INPUT_STABILITY_METRICS)
      .filter(([, spec]) => spec.kind === "swishiq-impact")
      .map(([metric, spec]) => ({ metric, ...spec }));
  return [...historicalOptions, ...impactOptions];
}

function formatStabilityInputValue(value, metric) {
  const spec = LINEUP_INPUT_STABILITY_METRICS[metric];
  if (!Number.isFinite(Number(value)) || !spec) return "Unavailable";
  const displayValue = Number(value) / spec.inputScale;
  const digits = spec.inputScale < 1 ? 2 : metric.startsWith("swishiq") ? 3 : 2;
  return `${formatNumber(displayValue, digits)}${spec.inputScale < 1 ? "%" : ""}`;
}

function inputStabilitySupportText(support, metric) {
  const spec = LINEUP_INPUT_STABILITY_METRICS[metric];
  if (spec?.kind === "swishiq-impact") {
    const parts = [];
    if (Number.isFinite(support?.reliability)) parts.push(`component reliability ${formatNumber(support.reliability * 100, 1)}%`);
    if (Number.isFinite(support?.pairedPossessions)) parts.push(`${formatNumber(support.pairedPossessions, 0)} paired possessions`);
    if (Number.isFinite(support?.effectivePairedPossessions)) parts.push(`${formatNumber(support.effectivePairedPossessions, 0)} effective component possessions`);
    if (support?.uncertaintySource) parts.push(`${support.uncertaintySource} uncertainty evidence`);
    return parts.length ? parts.join(" · ") : "Impact reliability and possession support were unavailable.";
  }
  const parts = [];
  if (Number.isFinite(support?.sample)) {
    parts.push(`${formatNumber(support.sample, 0)} ${support.denominator || "matched sample units"}`);
    if (support.sampleScope && support.sampleScope !== "unavailable") parts.push(support.sampleScope);
  }
  if (Number.isFinite(support?.reliability)) parts.push(`sample/prior support ${formatNumber(support.reliability * 100, 1)}%`);
  if (Number.isFinite(support?.verifiedGames)) parts.push(`${formatNumber(support.verifiedGames, 0)} verified games`);
  if (Number.isFinite(support?.sourceGames)) parts.push(`${formatNumber(support.sourceGames, 0)} source games`);
  if (Number.isFinite(support?.sourceMinutes)) parts.push(`${formatNumber(support.sourceMinutes, 0)} source minutes`);
  return parts.length ? parts.join(" · ") : "No paired sample or reliability support was available.";
}

function renderInputStabilityReport(report) {
  const section = document.createElement("section");
  section.className = "result-card input-stability-report";
  const heading = document.createElement("h4");
  heading.textContent = report.ok ? "Input stability results" : "Input stability unavailable";
  section.append(heading);
  if (!report.ok) {
    const reason = document.createElement("p");
    reason.textContent = report.reason || "The configured sensitivity cases could not be completed.";
    section.append(reason);
    return section;
  }

  const note = document.createElement("p");
  note.textContent = `${report.interpretation} The same objective, roster, and hard rules were used in every run; no objective scores are compared.`;
  const scaleLine = document.createElement("p");
  scaleLine.textContent = `Caller-configured scale: ±${formatNumber(report.scale.amount, 3)} ${report.scale.unit}. This scale is uncalibrated.`;
  const baselineLine = document.createElement("p");
  baselineLine.textContent = `Baseline five: ${report.baseline.players.map(player => player.name).join(", ")}.`;
  const membershipHeading = document.createElement("h5");
  membershipHeading.textContent = "Membership across the enumerated runs";
  const membershipNote = document.createElement("p");
  membershipNote.textContent = `Each player-specific increase and decrease is one controlled case. Counts use ${report.membershipRunCount} completed runs including the baseline; they are scenario coverage, not probabilities.`;

  const membershipTable = document.createElement("table");
  membershipTable.className = "result-table input-stability-membership";
  const membershipCaption = document.createElement("caption");
  membershipCaption.textContent = "Baseline membership and finite-case selection counts";
  const membershipHead = document.createElement("thead");
  const membershipHeadRow = document.createElement("tr");
  for (const title of ["Player", "Baseline", "Selected in completed runs"]) {
    const cell = document.createElement("th");
    cell.scope = "col";
    cell.textContent = title;
    membershipHeadRow.append(cell);
  }
  membershipHead.append(membershipHeadRow);
  const membershipBody = document.createElement("tbody");
  for (const rowData of report.membershipCounts) {
    const row = document.createElement("tr");
    const nameCell = document.createElement("th");
    nameCell.scope = "row";
    nameCell.textContent = rowData.playerName;
    const baselineCell = document.createElement("td");
    baselineCell.textContent = rowData.baselineSelected ? "Selected" : "Not selected";
    const frequencyCell = document.createElement("td");
    frequencyCell.textContent = `${rowData.selectedCases} of ${rowData.totalRuns}`;
    row.append(nameCell, baselineCell, frequencyCell);
    membershipBody.append(row);
  }
  membershipTable.append(membershipCaption, membershipHead, membershipBody);

  const cases = document.createElement("details");
  cases.className = "input-stability-cases";
  const casesSummary = document.createElement("summary");
  casesSummary.textContent = `Show the ${report.caseCount} controlled +/- cases`;
  const caseTable = document.createElement("table");
  caseTable.className = "result-table input-stability-case-table";
  const caseCaption = document.createElement("caption");
  caseCaption.textContent = "Each row changes one player's single observed objective input";
  const caseHead = document.createElement("thead");
  const caseHeadRow = document.createElement("tr");
  for (const title of ["Perturbed input", "Existing support", "Baseline overlap", "Membership change"]) {
    const cell = document.createElement("th");
    cell.scope = "col";
    cell.textContent = title;
    caseHeadRow.append(cell);
  }
  caseHead.append(caseHeadRow);
  const caseBody = document.createElement("tbody");
  for (const rowData of report.cases) {
    const row = document.createElement("tr");
    const inputCell = document.createElement("th");
    inputCell.scope = "row";
    const changed = rowData.changedInput;
    inputCell.textContent = `${changed.playerName} · ${changed.metricLabel} ${changed.direction === "plus" ? "+" : "−"}${formatNumber(changed.amount, 3)} ${changed.unit}: ${formatStabilityInputValue(changed.before, changed.metric)} → ${formatStabilityInputValue(changed.after, changed.metric)}`;
    const supportCell = document.createElement("td");
    supportCell.textContent = inputStabilitySupportText(changed.support, changed.metric);
    const overlapCell = document.createElement("td");
    overlapCell.textContent = rowData.ok
      ? `${rowData.overlapCount} of ${rowData.overlapTotal} baseline players retained`
      : "No completed solve";
    const membersCell = document.createElement("td");
    if (!rowData.ok) membersCell.textContent = rowData.reason || "Unavailable";
    else if (!rowData.incoming.length && !rowData.outgoing.length) membersCell.textContent = "No membership change";
    else {
      const changes = [];
      if (rowData.incoming.length) changes.push(`In: ${rowData.incoming.map(player => player.name).join(", ")}`);
      if (rowData.outgoing.length) changes.push(`Out: ${rowData.outgoing.map(player => player.name).join(", ")}`);
      membersCell.textContent = changes.join(" · ");
    }
    row.append(inputCell, supportCell, overlapCell, membersCell);
    caseBody.append(row);
  }
  caseTable.append(caseCaption, caseHead, caseBody);
  cases.append(casesSummary, caseTable);
  section.append(note, scaleLine, baselineLine, membershipHeading, membershipNote, membershipTable, cases);
  return section;
}

async function runInputStability(button, status, output, baseline, request, input) {
  if (state.activeOptimizationToken !== null || state.optimizationWorker) return;
  if (state.lastResult !== baseline || state.lastOptimizerRequest !== request
    || request.scenarioVersion !== state.scenarioVersion
    || elements.results.classList.contains("is-stale")) {
    status.textContent = "Settings changed after this result. Run the optimizer again before checking input stability.";
    return;
  }
  const jobToken = state.optimizationRunId;
  const scenarioVersion = state.scenarioVersion;
  button.disabled = true;
  button.textContent = "Running input stability…";
  status.textContent = "Running the same exact objective with one-player input changes; hard rules stay fixed…";
  output.replaceChildren();
  state.activeOptimizationToken = jobToken;
  elements.form.setAttribute("aria-busy", "true");
  setOptimizeButtons({ disabled: true, label: "Running input stability…" });
  setOptimizationCancellationAvailable(true);
  setSolverStatus("Checking controlled input perturbations…", "working");
  try {
    const response = await runOptimization(request.players, request.config, jobToken, {
      inputStability: {
        metric: input.metric,
        amount: input.amount,
        unit: input.unit,
        estimatedScenarioCount: Math.max(1, (request.players.length * 2) + 1),
      },
      onProgress: (progress) => {
        if (jobToken !== state.optimizationRunId || scenarioVersion !== state.scenarioVersion) return;
        if (progress?.phase === "input-stability") {
          status.textContent = `Checking input case ${progress.checkedCases} of ${progress.totalCases}: ${progress.caseLabel || "player input"}…`;
          setSolverStatus(`Input stability ${progress.checkedCases}/${progress.totalCases}`, "working");
        }
      },
    });
    if (jobToken !== state.optimizationRunId || scenarioVersion !== state.scenarioVersion
      || state.lastResult !== baseline) return;
    if (!response || typeof response !== "object") throw new Error("The optimizer returned no input-stability report.");
    output.replaceChildren(renderInputStabilityReport(response));
    status.textContent = response.ok
      ? `Completed ${response.successfulCaseCount} of ${response.caseCount} controlled input cases.`
      : response.reason || "Input-stability cases were unavailable.";
    setSolverStatus(response.ok ? "Input stability report ready" : "Input stability unavailable", response.ok ? "success" : "warning");
  } catch (error) {
    if (error?.name === "AbortError") {
      const requestStillCurrent = state.lastResult === baseline
        && state.lastOptimizerRequest === request
        && request.scenarioVersion === state.scenarioVersion
        && !elements.results.classList.contains("is-stale");
      status.textContent = requestStillCurrent
        ? "Input-stability analysis was cancelled before all cases completed."
        : "Input-stability analysis was cancelled because the settings changed.";
    } else {
      status.textContent = error instanceof Error ? error.message : "Input stability could not be calculated.";
    }
    setSolverStatus("Input stability stopped", "warning");
  } finally {
    const requestStillCurrent = state.lastResult === baseline
      && state.lastOptimizerRequest === request
      && request.scenarioVersion === state.scenarioVersion
      && !elements.results.classList.contains("is-stale");
    button.disabled = !requestStillCurrent;
    button.textContent = "Run input stability";
    if (jobToken === state.optimizationRunId && state.activeOptimizationToken === jobToken) {
      state.activeOptimizationToken = null;
      elements.form.removeAttribute("aria-busy");
      setOptimizationCancellationAvailable(false);
      setOptimizeButtons();
    }
  }
}

function renderInputStabilityControl(result) {
  const request = state.lastOptimizerRequest;
  if (result.mode !== "lineup" || !result.ok || !result.best || !request
    || request.scenarioVersion !== state.scenarioVersion) return null;
  const options = inputStabilityOptions(result, request);
  const section = document.createElement("section");
  section.className = "result-card input-stability-control";
  const heading = document.createElement("h3");
  heading.textContent = "Check lineup stability";
  const description = document.createElement("p");
  description.textContent = "Choose one objective input and an explicit +/- scale. The report perturbs one eligible player's value at a time, reruns the same exact objective and hard rules, and shows finite-case membership counts. The scale is caller-configured and uncalibrated; counts are not probabilities.";
  const controls = document.createElement("div");
  controls.className = "field-row field-row--three";
  const metricLabel = document.createElement("label");
  metricLabel.className = "field";
  const metricTitle = document.createElement("span");
  metricTitle.textContent = "Objective input";
  const metricSelect = document.createElement("select");
  metricSelect.setAttribute("aria-label", "Objective input to perturb");
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Choose an active input";
  metricSelect.append(placeholder);
  for (const option of options) {
    const entry = document.createElement("option");
    entry.value = option.metric;
    entry.textContent = `${option.label} (${option.unitLabel})`;
    metricSelect.append(entry);
  }
  metricLabel.append(metricTitle, metricSelect);
  const amountLabel = document.createElement("label");
  amountLabel.className = "field";
  const amountTitle = document.createElement("span");
  amountTitle.textContent = "Perturbation size";
  const amountInput = document.createElement("input");
  amountInput.type = "number";
  amountInput.min = "0";
  amountInput.step = "any";
  amountInput.inputMode = "decimal";
  amountInput.setAttribute("aria-label", "Caller-configured perturbation size");
  amountLabel.append(amountTitle, amountInput);
  const unitLabel = document.createElement("label");
  unitLabel.className = "field";
  const unitTitle = document.createElement("span");
  unitTitle.textContent = "Scale unit";
  const unitSelect = document.createElement("select");
  unitSelect.setAttribute("aria-label", "Perturbation unit");
  const unitPlaceholder = document.createElement("option");
  unitPlaceholder.value = "";
  unitPlaceholder.textContent = "Choose an input first";
  unitSelect.append(unitPlaceholder);
  unitSelect.disabled = true;
  unitLabel.append(unitTitle, unitSelect);
  const refreshUnitOptions = () => {
    const spec = LINEUP_INPUT_STABILITY_METRICS[metricSelect.value];
    unitSelect.replaceChildren();
    if (!spec) {
      const empty = document.createElement("option");
      empty.value = "";
      empty.textContent = "Choose an input first";
      unitSelect.append(empty);
      unitSelect.disabled = true;
      return;
    }
    const unit = document.createElement("option");
    unit.value = spec.unitLabel;
    unit.textContent = spec.unitLabel;
    unitSelect.append(unit);
    unitSelect.disabled = false;
  };
  metricSelect.addEventListener("change", refreshUnitOptions);
  controls.append(metricLabel, amountLabel, unitLabel);
  const note = document.createElement("p");
  note.textContent = "Available reliability and sample-support fields are shown with each changed input. Hard stat/position constraints and source box-score totals remain unchanged in every case.";
  const button = document.createElement("button");
  button.type = "button";
  button.className = "button button--secondary";
  button.textContent = "Run input stability";
  button.disabled = options.length === 0;
  const status = document.createElement("p");
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  const output = document.createElement("div");
  button.addEventListener("click", () => {
    const selectedMetric = metricSelect.value;
    const spec = LINEUP_INPUT_STABILITY_METRICS[selectedMetric];
    const amount = Number(amountInput.value);
    if (!spec || !(Number.isFinite(amount) && amount > 0) || unitSelect.value !== spec.unitLabel) {
      status.textContent = "Choose an active input and enter a positive perturbation size in the displayed unit.";
      return;
    }
    void runInputStability(button, status, output, result, request, {
      metric: selectedMetric,
      amount,
      unit: spec.unitLabel,
    });
  });
  section.append(heading, description, controls, note, button, status, output);
  return section;
}

function renderRotationMinutes(rotation) {
  const card = document.createElement("section");
  card.className = "result-card rotation-plan";
  const headingRow = document.createElement("div");
  headingRow.className = "rotation-plan__heading";
  const heading = document.createElement("h3");
  heading.textContent = "Your 240-minute plan";
  const planChip = document.createElement("span");
  planChip.className = "model-status-chip";
  const guidance = rotation.historicalGuidance || {};
  planChip.textContent = rotation.minutePlan === "historicalAware" && guidance.applied
    ? guidance.allocationStyleApplied === "preserveWorkload"
      ? "Recorded-minutes guardrail"
      : "Game-plan-first plan"
    : rotation.minutePlan === "openWhatIf"
      ? "Game-plan allocation"
      : ROTATION_MINUTE_PLAN_LABELS[rotation.minutePlan] || "Exact minute plan";
  headingRow.append(heading, planChip);
  const note = document.createElement("p");
  note.className = "rotation-plan-note";
  const required = rotation.positionMinutes?.required || { G: 96, F: 96, C: 48 };
  if (guidance.applied) {
    const requestedFlexibility = guidance.minuteFlexibility ?? 8;
    const appliedFlexibility = guidance.flexibilityUsed ?? requestedFlexibility;
    const expandedForRoles = appliedFlexibility > requestedFlexibility;
    // Role-minute feasibility can require a modest, deterministic widening of
    // the requested observed-workload window. Surface that exception here instead of
    // letting the result appear to have ignored the selected control.
    const roleCoverageNote = expandedForRoles
      ? ` You requested a ±${requestedFlexibility}-minute recorded-minutes window; position requirements widened it to ±${appliedFlexibility} minutes so the group could cover ${required.G} guard, ${required.F} forward, and ${required.C} center minutes.`
      : ` The plan assigns ${required.G} guard, ${required.F} forward, and ${required.C} center minutes.`;
    note.textContent = guidance.allocationStyleApplied === "preserveWorkload"
      ? `Your game plan selected this roster; the optional recorded-minutes mode then kept its minute plan close to past usage inside the displayed caps and hard limits.${roleCoverageNote}`
      : `Minutes favor the player profiles that best fit your strategy inside the recorded-minutes caps.${roleCoverageNote}`;
  } else if (rotation.minutePlan === "openWhatIf") {
    const workload = rotation.diagnostics?.roleConditionedScoring?.workloadSaturation;
    const workloadCopy = workload?.applied
      ? ` Extra minutes above ${formatNumber(workload.startsAfterMinutes, 1)} per player gradually add less marginal fit, preventing small rating gaps from automatically forcing min/max roles.`
      : "";
    note.textContent = `This allocation maximizes your game-plan fit inside your hard player limits.${workloadCopy} It does not try to recreate the team's past rotation. Role split: ${required.G} guard, ${required.F} forward, and ${required.C} center minutes.`;
  } else {
    note.textContent = `Recorded workload counts were unavailable, so the plan used your hard player limits. The plan assigns ${required.G} guard, ${required.F} forward, and ${required.C} center minutes.`;
  }
  const list = document.createElement("ul");
  list.className = "minutes-list";
  const sorted = [...rotation.allocations].sort((left, right) => right.minutes - left.minutes);
  for (const allocation of sorted) {
    const player = currentPlayer(allocation.id);
    const row = document.createElement("li");
    const playerLabel = document.createElement("span");
    playerLabel.className = "minutes-list__player";
    const name = document.createElement("strong");
    name.textContent = player?.name || allocation.id;
    const roles = document.createElement("small");
    const anchor = Number(guidance.anchorsById?.[allocation.id]);
    const target = Number(guidance.targetsById?.[allocation.id]);
    const workloadParts = [roleMinuteSummary(allocation.roleMinutes) || "Utility minutes"];
    if (Number.isFinite(anchor)) workloadParts.push(`recorded ${formatNumber(anchor)} team-game min`);
    if (Number.isFinite(target)) workloadParts.push(`recorded-minutes target ${formatNumber(target, 0)}`);
    workloadParts.push(`allowed ${allocation.minimum}–${allocation.maximum}`);
    roles.textContent = workloadParts.join(" · ");
    playerLabel.append(name, roles);
    const track = document.createElement("span");
    track.className = "metric-bar__track";
    const fill = document.createElement("span");
    fill.className = "metric-bar__fill";
    fill.style.width = `${(allocation.minutes / 48) * 100}%`;
    track.append(fill);
    const minutes = document.createElement("strong");
    const targetDifference = Number.isFinite(target)
      ? allocation.minutes - target
      : null;
    const difference = targetDifference === 0
      ? " (on target)"
      : Number.isFinite(targetDifference)
        ? ` (${formatSignedDifference(targetDifference)} vs target)`
        : Number.isFinite(anchor)
          ? ` (${formatSignedDifference(allocation.minutes - anchor)} vs recorded)`
          : "";
    minutes.textContent = `${allocation.minutes} min${difference}`;
    row.append(playerLabel, track, minutes);
    list.append(row);
  }
  card.append(headingRow, note, list);
  return card;
}

/**
 * Show the final simultaneity proof without pretending the decomposed minute
 * order is a coaching substitution plan. Aggregate G/F/C totals can otherwise
 * look valid even when the same player would need to occupy two roles at once;
 * the exact unit planner rules that out for every regulation minute.
 */
function renderRotationUnitProof(best) {
  const plan = best?.unitPlan;
  const section = document.createElement("section");
  section.className = "result-card rotation-unit-proof";
  const headingRow = document.createElement("div");
  headingRow.className = "rotation-plan__heading";
  const heading = document.createElement("h3");
  heading.textContent = "Can these minutes exist on the court?";
  const status = document.createElement("span");
  status.className = `model-status-chip${plan?.ok ? "" : " model-status-chip--warning"}`;
  status.textContent = plan?.ok ? "240-minute plan ready" : "Plan unavailable";
  headingRow.append(heading, status);

  const intro = document.createElement("p");
  intro.className = "rotation-plan-note";
  if (!plan?.ok) {
    intro.textContent = "The assigned minutes could not be arranged into five distinct players for every regulation minute. Try another group or adjust the role limits.";
    section.append(headingRow, intro);
    return section;
  }
  intro.textContent = "Yes. Five distinct players are assigned for every regulation minute while preserving each player's total minutes and the guard/forward/center minute split. The examples below show a possible minute-by-minute arrangement, not a recommendation for starters, closers, or substitution timing.";
  const sharing = plan.sharingOptimization;
  if (sharing?.applied) intro.textContent += ` Offensive responsibility was also spread across the units through ${sharing.exchanges} improvement${sharing.exchanges === 1 ? "" : "s"}. ${sharing.optimality === "relaxed-bound-attained" ? "The balancing target was reached." : "The schedule was improved locally and may not be the best possible balance."} It did not change player minutes or the SwishIQ Impact result.`;

  const checks = document.createElement("ul");
  checks.className = "unit-proof-checks";
  [
    "48 one-minute frames",
    "5 distinct players in every frame",
    "Player minutes match the optimizer",
    "Court-role minutes match the selected mix",
  ].forEach((label) => {
    const item = document.createElement("li");
    item.textContent = label;
    checks.append(item);
  });

  const examples = document.createElement("div");
  examples.className = "unit-proof-examples";
  const exampleFrames = [plan.frames?.[0], plan.frames?.[23], plan.frames?.[47]].filter(Boolean);
  for (const frame of exampleFrames) {
    const card = document.createElement("div");
    card.className = "unit-proof-frame";
    const label = document.createElement("strong");
    label.textContent = `Example minute ${frame.minute}`;
    const roleList = document.createElement("dl");
    for (const role of ["G", "F", "C"]) {
      const ids = Array.isArray(frame.roles?.[role]) ? frame.roles[role] : [];
      if (ids.length === 0) continue;
      const row = document.createElement("div");
      const term = document.createElement("dt");
      term.textContent = role;
      const detail = document.createElement("dd");
      detail.textContent = ids.map((id) => (
        best.players.find((player) => String(player.id) === String(id))?.name || id
      )).join(", ");
      row.append(term, detail);
      roleList.append(row);
    }
    card.append(label, roleList);
    examples.append(card);
  }
  section.append(headingRow, intro, checks, examples);
  return section;
}

function renderHistoricalWorkloadBenchmark(result) {
  const best = result.best;
  if (!best?.rotation) return null;
  // This is deliberately an optional, collapsed reality check. Earlier builds
  // compared the proposal with total minutes divided by estimated *team* games,
  // then called that value "recorded minutes." That was technically auditable
  // but easy to mistake for player MPG—and it made a four-game stint look like
  // a 0.4-minute role. Compare with the familiar Basketball Reference MPG field
  // instead: average minutes in games the player actually appeared. MPG remains
  // descriptive here and is never sent back into the exact allocation.
  const recordedMpgById = Object.fromEntries(
    best.players
      .map((player) => [player.id, Number(player.minutes)])
      .filter(([, minutes]) => Number.isFinite(minutes) && minutes >= 0),
  );
  const card = document.createElement("details");
  card.className = "result-card historical-benchmark";
  const heading = document.createElement("summary");
  heading.textContent = "Compare with recorded MPG (optional)";
  const note = document.createElement("p");
  if (Object.keys(recordedMpgById).length === 0) {
    note.textContent = "Recorded minutes per game are unavailable for this group. The result above still follows the displayed hard limits.";
    card.append(heading, note);
    return card;
  }
  note.textContent = "Recorded MPG is the player's average in games he appeared for this team. It is context only: it did not cap, target, or otherwise change the optimized minutes.";

  // A mathematically legal plan can still be a large departure from the
  // player's observed per-appearance role. Flag large departures before the
  // table so fans do not mistake an aggressive game-plan result for a likely
  // coaching rotation. This warning is descriptive and cannot affect ranking.
  const workloadStretches = best.rotation.allocations.filter((allocation) => {
    const recorded = Number(recordedMpgById[allocation.id]);
    return Number.isFinite(recorded) && Math.abs(allocation.minutes - recorded) >= 12;
  });
  const stretchNote = document.createElement("p");
  stretchNote.className = "workload-stretch-note";
  stretchNote.hidden = workloadStretches.length === 0;
  stretchNote.textContent = workloadStretches.length > 0
    ? `Reality check: ${workloadStretches.length} selected player${workloadStretches.length === 1 ? " is" : "s are"} at least 12 minutes from recorded MPG. Treat this as a game-plan result, not a likely real-world rotation.`
    : "";

  const wrap = document.createElement("div");
  wrap.className = "table-wrap historical-benchmark__table";
  wrap.tabIndex = 0;
  wrap.setAttribute("aria-label", "Recorded minutes per game and proposed rotation minutes");
  const table = document.createElement("table");
  const head = document.createElement("thead");
  const headRow = document.createElement("tr");
  for (const label of ["Player", "Recorded MPG", "Proposed", "Difference"]) {
    const cell = document.createElement("th");
    cell.scope = "col";
    cell.textContent = label;
    headRow.append(cell);
  }
  head.append(headRow);
  const body = document.createElement("tbody");
  [...best.rotation.allocations]
    .sort((left, right) => right.minutes - left.minutes)
    .forEach((allocation) => {
      const player = currentPlayer(allocation.id);
      const recorded = Number(recordedMpgById[allocation.id]);
      const row = document.createElement("tr");
      createCell(row, player?.name || allocation.name || allocation.id);
      createCell(row, Number.isFinite(recorded) ? formatNumber(recorded) : "Unavailable");
      createCell(row, `${allocation.minutes} min`);
      createCell(row, Number.isFinite(recorded) ? formatSignedDifference(allocation.minutes - recorded) : "—");
      body.append(row);
    });
  table.append(head, body);
  wrap.append(table);
  card.append(heading, note, stretchNote, wrap);
  return card;
}

function summarizeAlternativeTradeoff(lineup, best) {
  if (lineup.rank === 1) return "Baseline";
  const metrics = [
    ["points", "PTS", false],
    ["rebounds", "REB", false],
    ["assists", "AST", false],
    ["steals", "STL", false],
    ["blocks", "BLK", false],
    ["turnovers", "TOV", true],
  ];
  // Turnovers are the only lower-is-better production column. Convert every
  // raw delta to a common benefit direction to identify the clearest gain and
  // sacrifice, while displaying the original signed stat change to the user.
  const comparable = metrics.filter(([metric]) => hasFiniteNumber(lineup.totals[metric]) && hasFiniteNumber(best.totals[metric]));
  const changes = comparable.map(([metric, label, lowerIsBetter]) => {
    const delta = Number(lineup.totals[metric]) - Number(best.totals[metric]);
    return { label, delta, benefit: lowerIsBetter ? -delta : delta };
  }).filter((change) => Number.isFinite(change.delta) && Math.abs(change.delta) >= 0.05);
  const gain = changes.filter((change) => change.benefit > 0)
    .sort((left, right) => right.benefit - left.benefit)[0];
  const cost = changes.filter((change) => change.benefit < 0)
    .sort((left, right) => left.benefit - right.benefit)[0];
  const parts = [];
  if (gain) parts.push(`Gain ${formatSignedDifference(gain.delta)} ${gain.label}`);
  if (cost) parts.push(`Cost ${formatSignedDifference(cost.delta)} ${cost.label}`);
  const summary = parts.join(" · ") || (comparable.length ? "Similar available production" : "Production comparison unavailable");
  return comparable.length < metrics.length ? `${summary} · some stats unavailable` : summary;
}

function renderAlternatives(alternatives, best, countComplete) {
  const section = document.createElement("section");
  section.className = "alternatives-section";
  const heading = document.createElement("h3");
  heading.textContent = "Other returned groups under the same rules";
  const note = document.createElement("p");
    note.textContent = `${best.rotation ? "Production columns use each group's conservative 240-minute projection." : "Production columns add the selected players' per-game profiles."} ${countComplete ? "All eligible groups in this search are ranked." : "Only returned groups are ranked; the full count is unavailable."} The selected group's team-season statline appears in the result summary above.`;
  const wrap = document.createElement("div");
  wrap.className = "alternatives-wrap table-wrap";
  wrap.tabIndex = 0;
  wrap.setAttribute("aria-label", countComplete ? "Ranked eligible lineup alternatives" : "Returned lineup groups; full search count unavailable");
  const table = document.createElement("table");
  table.className = "alternatives-table";
  const caption = document.createElement("caption");
  caption.className = "sr-only";
  caption.textContent = countComplete ? "Ranked eligible lineup alternatives" : "Returned lineup groups; full search count unavailable";
  const head = document.createElement("thead");
  const headRow = document.createElement("tr");
  const headings = countComplete
    ? ["Rank", "Players", "Changes from #1", "Main tradeoff", "PTS", "REB", "AST", "TOV"]
    : ["Group status", "Players", "Changes from recommended group", "Main tradeoff", "PTS", "REB", "AST", "TOV"];
  for (const heading of headings) {
    const cell = document.createElement("th");
    cell.scope = "col";
    cell.textContent = heading;
    headRow.append(cell);
  }
  head.append(headRow);
  const body = document.createElement("tbody");
  const bestIds = new Set(best.players.map((player) => player.id));
  for (const lineup of alternatives) {
    const lineupIds = new Set(lineup.players.map((player) => player.id));
    const added = lineup.players.filter((player) => !bestIds.has(player.id)).map((player) => player.name);
    const removed = best.players.filter((player) => !lineupIds.has(player.id)).map((player) => player.name);
    const changes = lineup.rank === 1
      ? "Recommended group"
      : `In: ${added.join(", ") || "none"}; Out: ${removed.join(", ") || "none"}`;
    const row = document.createElement("tr");
    createCell(row, countComplete ? `#${lineup.rank}` : lineup.rank === 1 ? "Recommended" : "Alternative");
    createCell(row, lineup.players.map((player) => player.name).join(", "));
    createCell(row, changes);
    createCell(row, summarizeAlternativeTradeoff(lineup, best));
    createCell(row, formatNumber(lineup.totals.points));
    createCell(row, formatNumber(lineup.totals.rebounds));
    createCell(row, formatNumber(lineup.totals.assists));
    createCell(row, formatNumber(lineup.totals.turnovers));
    body.append(row);
  }
  table.append(caption, head, body);
  wrap.append(table);
  section.append(heading, note, wrap);
  return section;
}

function analyticsAverage(players, metric, { rotation = null } = {}) {
  let weightedTotal = 0;
  let weightTotal = 0;
  for (const player of players) {
    const value = Number(analyticsValue(player, metric));
    if (!Number.isFinite(value)) continue;
    const weight = rotation ? Number(rotation.byId?.[player.id] || 0) : 1;
    if (!(weight > 0)) continue;
    weightedTotal += value * weight;
    weightTotal += weight;
  }
  return weightTotal > 0 ? weightedTotal / weightTotal : null;
}

function renderAnalyticsComparisonChart(best, pool) {
  const section = document.createElement("section");
  section.className = "fan-report__chart";
  const heading = document.createElement("h4");
  heading.textContent = "Selected group vs eligible pool";
  const note = document.createElement("p");
  const view = analyticsViewDetail();
  note.textContent = `${best.rotation ? "Selected values are minute-weighted by the exact 240-minute plan" : "Selected values are averaged across the five selected players"}; pool values are unweighted across ${pool.length} player${pool.length === 1 ? "" : "s"} available in this search. ${view.note}`;
  section.append(heading, note);

  const chart = document.createElement("div");
  chart.className = "analytics-chart";
  let rendered = 0;
  for (const [metric, label, lowerIsBetter] of COMPARE_METRICS) {
    const selected = analyticsAverage(best.players, metric, { rotation: best.rotation });
    const poolAverage = analyticsAverage(pool, metric);
    if (!Number.isFinite(selected) || !Number.isFinite(poolAverage)) continue;
    const maximum = Math.max(Math.abs(selected), Math.abs(poolAverage), 0.01);
    const row = document.createElement("div");
    row.className = "analytics-chart__row";
    const name = document.createElement("strong");
    name.textContent = label;
    const track = document.createElement("span");
    track.className = "analytics-chart__track";
    const bar = document.createElement("span");
    bar.className = "analytics-chart__bar";
    if (lowerIsBetter && selected > poolAverage) bar.classList.add("analytics-chart__bar--warning");
    bar.style.setProperty("--bar-width", `${Math.max(2, (Math.abs(selected) / maximum) * 100)}%`);
    bar.setAttribute("role", "img");
    bar.setAttribute("aria-label", `${label}: selected group ${analyticsMetricText(metric, selected)}, eligible-pool average ${analyticsMetricText(metric, poolAverage)}.`);
    track.append(bar);
    const values = document.createElement("span");
    values.textContent = `${analyticsMetricText(metric, selected)} / ${analyticsMetricText(metric, poolAverage)}`;
    row.append(name, track, values);
    chart.append(row);
    rendered += 1;
  }
  if (rendered === 0) {
    const unavailable = document.createElement("p");
    unavailable.textContent = "This view is not available for these stats. Per game and per 36 remain available for compatible player rows.";
    section.append(unavailable);
  } else {
    section.append(chart);
  }
  return section;
}

function renderInsightList(headingText, entries, { warning = false, emptyText } = {}) {
  const section = document.createElement("section");
  const heading = document.createElement("h4");
  heading.textContent = headingText;
  const list = document.createElement("ul");
  list.className = `insight-list${warning ? " insight-list--warning" : ""}`;
  if (entries.length === 0) {
    const item = document.createElement("li");
    item.textContent = emptyText;
    list.append(item);
  } else {
    entries.slice(0, 4).forEach((entry) => {
      const item = document.createElement("li");
      item.textContent = entry.message;
      list.append(item);
    });
  }
  section.append(heading, list);
  return section;
}

function lineupDnaProfile(roleCoverage = {}) {
  const coverage = Array.isArray(roleCoverage.coverage) ? roleCoverage.coverage : [];
  const count = (status) => coverage.filter((role) => role.status === status).length;
  const primaryStrength = (roleCoverage.strengths || [])[0] || null;
  const pressurePoint = coverage.find((role) => role.status === "gap")
    || coverage.find((role) => role.status === "thin")
    || null;
  return {
    primaryStrength,
    pressurePoint,
    counts: {
      covered: count("covered"),
      thin: count("thin"),
      gap: count("gap"),
      unassessed: count("unassessed"),
    },
  };
}

function lineupDnaSourceContext(result) {
  const swishiqPrimary = Boolean(result?.best?.modelAdjustments?.swishiqImpact?.additiveImpactPer100);
  return swishiqPrimary
    ? {
      label: "Role context",
      explanation: "Lineup DNA describes roles and gaps for the group chosen under SwishIQ Impact.",
    }
    : {
      label: "Role context",
      explanation: "Lineup DNA describes roles and gaps for the group chosen under your game plan.",
    };
}

function renderLineupDnaCoverageCounts(roleCoverage) {
  const { counts } = lineupDnaProfile(roleCoverage);
  const list = document.createElement("dl");
  list.className = "lineup-dna__counts";
  for (const [label, value, tone] of [
    ["Covered", counts.covered, "covered"],
    ["Thin", counts.thin, "thin"],
    ["No clear signal", counts.gap, "gap"],
    ["Not assessed", counts.unassessed, "unassessed"],
  ]) {
    const item = document.createElement("div");
    item.dataset.status = tone;
    const term = document.createElement("dt");
    term.textContent = label;
    const description = document.createElement("dd");
    description.textContent = String(value);
    item.append(term, description);
    list.append(item);
  }
  return list;
}

function preferredLineupDnaSwapPlayer(result, explanation) {
  const unlocked = (result?.best?.players || []).filter((player) => !state.lockedIds.has(player.id));
  return unlocked.find((player) => explanation?.replacements?.byRemovedPlayerId?.[player.id])
    || unlocked[0]
    || null;
}

function renderLineupDnaSwapTool(result, explanation) {
  const section = document.createElement("section");
  section.className = "lineup-dna__swap";
  const heading = document.createElement("h4");
  heading.textContent = "Test one change";
  const intro = document.createElement("p");
  intro.textContent = "Choose one selected player to remove. The optimizer keeps every other selected player and current rule, then finds the best valid replacement.";
  section.append(heading, intro);
  const goal = document.createElement("p");
  goal.className = "lineup-dna__swap-note";
  const pressurePoint = lineupDnaProfile(explanation?.roleCoverage).pressurePoint;
  goal.textContent = `Decision brief: keep your current ${result?.best?.modelAdjustments?.swishiqImpact?.additiveImpactPer100 ? `SwishIQ Impact ${result.diagnostics?.swishiqImpactModel?.objective || "balanced"} objective` : "game-plan objective"} and every hard rule. ${pressurePoint ? `Inspect whether the change affects ${pressurePoint.label.toLowerCase()}.` : "Check what you give up when changing one player."} Compare the production differences and remaining role concerns below; this test does not apply the swap.`;
  section.append(goal);

  const availablePlayers = (result?.best?.players || []).filter((player) => !state.lockedIds.has(player.id));
  const preferred = preferredLineupDnaSwapPlayer(result, explanation);
  if (!preferred || availablePlayers.length === 0) {
    const unavailable = document.createElement("p");
    unavailable.className = "lineup-dna__swap-note";
    unavailable.textContent = "Every selected player is locked. Unlock one in the player choices to test a one-player change.";
    section.append(unavailable);
    return section;
  }

  const controls = document.createElement("div");
  controls.className = "lineup-dna__swap-controls";
  const label = document.createElement("label");
  label.className = "field";
  label.htmlFor = "lineupDnaSwapPlayer";
  const labelText = document.createElement("span");
  labelText.textContent = "Player to replace";
  const select = document.createElement("select");
  select.id = "lineupDnaSwapPlayer";
  select.dataset.action = "lineup-dna-replacement-choice";
  availablePlayers.forEach((player) => {
    const option = document.createElement("option");
    option.value = player.id;
    option.textContent = player.name;
    option.selected = player.id === preferred.id;
    select.append(option);
  });
  label.append(labelText, select);

  const button = document.createElement("button");
  button.type = "button";
  button.className = "button";
  button.dataset.action = "lineup-dna-replacement";
  button.dataset.playerId = preferred.id;
  button.dataset.idleLabel = "Find the best valid replacement";
  button.textContent = button.dataset.idleLabel;
  controls.append(label, button);

  const cached = state.replacementAnalyses.get(`${state.scenarioVersion}:${preferred.id}`);
  const output = replacementAnalysisMarkup(preferred.id, cached);
  output.dataset.lineupDnaReplacementOutput = "";
  section.append(controls, output);
  return section;
}

function syncLineupDnaReplacementChoice(select) {
  const section = select.closest(".lineup-dna__swap");
  const button = section?.querySelector('[data-action="lineup-dna-replacement"]');
  const existing = section?.querySelector("[data-lineup-dna-replacement-output]");
  const playerId = select.value;
  if (!section || !button || !existing || !playerId) return;
  button.dataset.playerId = playerId;
  const cached = state.replacementAnalyses.get(`${state.scenarioVersion}:${playerId}`);
  const output = replacementAnalysisMarkup(playerId, cached);
  output.dataset.lineupDnaReplacementOutput = "";
  existing.replaceWith(output);
}

function renderLineupDnaMethod(result, explanation) {
  const sourceContext = lineupDnaSourceContext(result);
  const steps = document.createElement("ol");
  steps.className = "lineup-dna__method";
  for (const [title, copy] of [
    ["Selected group", sourceContext.explanation],
    ["Role translation", `Coverage compares the selected group with ${explanation.roleCoverage.referencePlayerCount} players available in this search. Limited-sample labels stay visible but do not count as covered by default.`],
    ["One-change test", "The replacement tool keeps every other selected player and current rule, then finds the best valid replacement."],
  ]) {
    const item = document.createElement("li");
    const strong = document.createElement("strong");
    strong.textContent = title;
    const body = document.createElement("span");
    body.textContent = copy;
    item.append(strong, body);
    steps.append(item);
  }
  return steps;
}

function renderRoleCoverageSummary(roleCoverage) {
  const section = document.createElement("section");
  section.className = "fan-report__roles";
  const heading = document.createElement("h4");
  heading.textContent = "Which basketball jobs are covered?";
  const note = document.createElement("p");
  note.textContent = `Each row translates box-score stats into a familiar lineup job compared with the ${roleCoverage.comparisonLabel} (${roleCoverage.referencePlayerCount} players). These are report signals—not hard position rules, model certainties, or requirements that every group must fill.`;
  const list = document.createElement("div");
  list.className = "role-coverage-list";
  const statusLabels = {
    covered: "Covered",
    thin: "Thin",
    gap: "No clear signal",
    unassessed: "Not assessed",
  };
  for (const role of roleCoverage.coverage || []) {
    const row = document.createElement("article");
    row.className = "role-coverage-row";
    row.dataset.status = role.status;
    const title = document.createElement("div");
    title.className = "role-coverage-row__title";
    const label = document.createElement("strong");
    label.textContent = role.label;
    const status = document.createElement("span");
    status.className = "role-coverage-status";
    status.textContent = statusLabels[role.status] || "Context only";
    title.append(label, status);

    const detail = document.createElement("p");
    const confirmedNames = (role.players || []).map((player) => player.playerName);
    const provisionalNames = (role.provisionalPlayers || []).map((player) => player.playerName);
    if (role.status === "covered") {
      detail.textContent = `Supported by ${confirmedNames.join(", ")}.`;
    } else if (role.status === "thin") {
      detail.textContent = `Only ${confirmedNames.join(", ")} shows a strong signal; the report target is ${role.target}.`;
    } else if (role.status === "unassessed") {
      detail.textContent = "Not enough stats are available to assess this role.";
    } else if (provisionalNames.length > 0) {
      detail.textContent = `Limited-sample signal: ${provisionalNames.join(", ")}.`;
    } else {
      detail.textContent = "No selected player reached this report's statistical signal in the current comparison pool.";
    }
    row.append(title, detail);
    list.append(row);
  }
  section.append(heading, note, list);
  return section;
}

function renderLineupDnaReport(result, explanation) {
  if (!explanation?.available || !explanation.roleCoverage) return null;
  const best = result.best;
  const report = document.createElement("section");
  report.className = "fan-report lineup-dna-report";
  report.setAttribute("aria-labelledby", "lineupDnaEvidenceHeading");

  const header = document.createElement("div");
  header.className = "fan-report__header";
  const headerText = document.createElement("div");
  const eyebrow = document.createElement("p");
  eyebrow.className = "eyebrow print-only";
  // The report explains a user-defined game plan using historical statistics. It does
  // not claim to reproduce a real NBA depth chart, so lead with the useful concept.
  eyebrow.textContent = "Lineup DNA report";
  const heading = document.createElement("h3");
  heading.id = "lineupDnaEvidenceHeading";
  heading.tabIndex = -1;
  heading.textContent = "Lineup DNA details";
  const intro = document.createElement("p");
  intro.textContent = "See how this group's roles fit together, where coverage is thin, and which stats inform each label.";
  headerText.append(eyebrow, heading, intro);
  header.append(headerText);
  report.append(header, renderLineupDnaMethod(result, explanation));

  const grid = document.createElement("div");
  grid.className = "fan-report__grid";
  grid.append(
    renderInsightList(
      "What this group does well",
      explanation.roleCoverage.strengths || [],
      { emptyText: "No role signal cleared its configured coverage target in this comparison pool." },
    ),
    renderInsightList(
      "Potential weak spots",
      explanation.roleCoverage.deficiencies || [],
      {
        warning: true,
        emptyText: "No thin or missing role signal was identified by this box-score model.",
      },
    ),
  );
  report.append(
    grid,
    renderAnalyticsComparisonChart(best, comparisonPool()),
  );
  return report;
}

function resultMetricLabel(metric) {
  if (metric === "historicalReadiness") return "Recorded role signals";
  if (metric === "efgPct" && state.experienceMode === "simple") return "Shooting efficiency (eFG%)";
  return METRIC_LABELS[metric] || titleCase(metric);
}

function simpleRoleConcern(entry) {
  // Detailed mode retains the complete, statistical role labels. Simple mode
  // translates the first gap into a basketball question a visitor can act on.
  const concernByRole = {
    primaryCreator: "this group does not have a clear lead playmaker based on assists and turnovers.",
    secondaryCreator: "this group has limited secondary playmaking support.",
    leadScorer: "this group lacks a clear high-volume scorer in this player pool.",
    movementShooter: "this group lacks a clear high-volume 3-point shooting option in this player pool.",
    perimeterShooter: "this group has limited 3-point shooting accuracy in this player pool.",
    connector: "this group has limited low-turnover passing support.",
    rimProtector: "this group has limited shot-blocking stats.",
    switchDefender: "this group has limited multi-position steals-and-blocks activity.",
    rebounder: "this group has limited rebounding strength.",
    disruptor: "this group has limited combined steals-and-blocks activity.",
  };
  return concernByRole[entry?.roleId]
    || "one part of this group has limited box-score support.";
}

function renderSimpleResultOverview(result, fanExplanation) {
  const best = result.best;
  const swishiqImpact = Boolean(best.modelAdjustments?.swishiqImpact?.additiveImpactPer100);
  const decision = result.resultPassport?.decision;
  const panel = document.createElement("section");
  panel.className = "simple-result-overview lineup-dna-summary";
  panel.setAttribute("aria-labelledby", "lineupDnaHeading");
  const benchmark = document.createElement("div");
  benchmark.className = "simple-benchmark";
  if (decision) {
    benchmark.append(
      renderScoreCard("Decision quality", decisionQualityLabel(decision), true),
      renderScoreCard(decisionCountIsComplete(decision) ? "Legal rank" : "Search coverage", decisionRankLabel(decision)),
      renderScoreCard("Rules", "All passed"),
    );
    const benchmarkHelp = document.createElement("p");
    benchmarkHelp.className = "simple-benchmark__help";
    benchmarkHelp.textContent = `${swishiqImpact ? "SwishIQ player-impact estimates are included because that model is selected. " : ""}${decisionCountIsComplete(decision) ? "The rank compares eligible groups in this search." : "Only returned groups are ranked; the full legal-group count is unavailable."} The team-season statline is not a universal player rating.`;
    benchmark.append(benchmarkHelp, renderBenchmarkExplainer(result, { compact: true }));
  } else {
    const unavailable = document.createElement("p");
    unavailable.className = "simple-benchmark__help";
    unavailable.textContent = "Decision quality is unavailable for this result. The lineup still passed every selected rule.";
    benchmark.append(unavailable);
  }
  const objectiveMetadata = result.objectiveMetadata || {};
  const objectiveValue = Number(best.objectiveValue);
  const objectiveText = Number.isFinite(objectiveValue)
    ? formatNumber(objectiveValue, objectiveMetadata.unit === "weighted-player-impact-coefficient-per-100-possessions" ? 3 : 2)
    : "Unavailable";
  benchmark.append(
    renderScoreCard("Solver objective", objectiveText, true),
    renderScoreCard("Bounded display fit", `${formatNumber(best.displayScore ?? best.score, 1)} / 100`),
  );
  const objectiveHelp = document.createElement("p");
  objectiveHelp.className = "simple-benchmark__help";
  objectiveHelp.textContent = `${objectiveMetadata.unitLabel || "Preference-score units"}. This is a user-preference objective, not calibrated expected points or wins. The bounded display fit is presentation-only and does not clip or reorder the solver objective.`;
  benchmark.append(objectiveHelp);

  const strongest = Object.entries(best.contributionBreakdown || {})
    .filter(([metric, detail]) => metric !== "historicalReadiness" && Number(detail.scoreContribution) > 0)
    .sort((left, right) => Number(right[1].scoreContribution) - Number(left[1].scoreContribution))
    .slice(0, 3)
    .map(([metric]) => resultMetricLabel(metric));
  const roleCoverage = fanExplanation?.roleCoverage || { coverage: [], strengths: [], deficiencies: [] };
  const { primaryStrength, pressurePoint } = lineupDnaProfile(roleCoverage);
  const sourceContext = lineupDnaSourceContext(result);
  const header = document.createElement("div");
  header.className = "lineup-dna__header";
  const headerText = document.createElement("div");
  const eyebrow = document.createElement("p");
  eyebrow.className = "eyebrow";
  eyebrow.textContent = "Lineup identity";
  const heading = document.createElement("h3");
  heading.id = "lineupDnaHeading";
  heading.textContent = "Lineup DNA";
  const intro = document.createElement("p");
  intro.textContent = "A quick read on this group's signature strengths, pressure points, and role coverage—drawn from the same result, never a second ranking.";
  headerText.append(eyebrow, heading, intro);
  const sourceLabel = document.createElement("span");
  sourceLabel.className = "lineup-dna__source";
  sourceLabel.textContent = sourceContext.label;
  header.append(headerText, sourceLabel);

  // Lineup DNA translates evidence already produced by the exact result. It
  // never calculates a second score or changes the selected group.
  const insights = document.createElement("div");
  insights.className = "simple-result-insights";
  insights.setAttribute("aria-label", "Lineup DNA takeaways");
  const addInsight = (title, copy, tone = "") => {
    const card = document.createElement("article");
    card.className = `simple-result-insight${tone ? ` simple-result-insight--${tone}` : ""}`;
    const heading = document.createElement("h3");
    heading.textContent = title;
    const body = document.createElement("p");
    body.textContent = copy;
    card.append(heading, body);
    insights.append(card);
  };

  addInsight(
    "Why it won",
    decisionCountIsComplete(decision)
      ? best.rotation
        ? "It is the highest-ranked eligible rotation after every displayed rule, with all 240 minutes assigned inside your hard player limits."
        : "It is the highest-ranked eligible starting five after every displayed rule was checked."
      : best.rotation
        ? "It is the strongest eligible rotation among the groups returned by the bounded search, with all 240 minutes assigned inside your hard player limits."
        : "It is the strongest eligible starting five among the groups returned by the bounded search.",
  );
  addInsight(
    "Signature strength",
    primaryStrength?.message
      || (swishiqImpact
      ? `It maximizes the SwishIQ Impact ${result.diagnostics?.swishiqImpactModel?.objective || "balanced"} objective under your requirements. Box-score skill labels describe the result; they did not choose it.`
      : strongest.length
      ? `Its strongest game-plan contributions are ${strongest.join(", ")}.`
      : "It is the strongest available fit for the priorities you selected."),
    "strength",
  );
  addInsight(
    "Pressure point",
    pressurePoint
      ? simpleRoleConcern(pressurePoint)
      : "The descriptive role screen did not flag a major coverage gap for this group.",
    "concern",
  );

  const requestedImpact = ["offensiveImpact", "defensiveImpact"]
    .filter((metric) => Number(result.weights?.[metric]) > 0);
  const disabledImpact = (result.diagnostics?.objectiveMetricEvidence?.disabledRequestedMetrics || [])
    .filter((metric) => metric === "offensiveImpact" || metric === "defensiveImpact");
  const modelNote = document.createElement("p");
  modelNote.className = "simple-result-model-note";
  if (swishiqImpact) {
    modelNote.textContent = decisionCountIsComplete(decision)
      ? "Model note: SwishIQ Impact is the primary objective. Historical skill weights, OBPM/DBPM cross-checks, and heuristic role bonuses did not change this ranking. The current impact coefficients do not model causal fatigue, matchups, or five-player chemistry."
      : "Model note: SwishIQ Impact is the primary objective. Historical skill weights, OBPM/DBPM cross-checks, and heuristic role bonuses did not change the selected group among those returned. The current impact coefficients do not model causal fatigue, matchups, or five-player chemistry.";
  } else if (requestedImpact.length > 0) {
    modelNote.textContent = disabledImpact.length > 0
      ? "Model note: OBPM/DBPM was incomplete for this pool, so that cross-check was omitted for everyone instead of being guessed."
      : decisionCountIsComplete(decision)
        ? "Model note: complete OBPM/DBPM supplied a small offense/defense cross-check; your visible game-plan priorities still drove the ranking."
        : "Model note: complete OBPM/DBPM supplied a small offense/defense cross-check; your visible game-plan priorities drove the selected group among those returned.";
  } else if (best.rotation) {
    modelNote.textContent = "Model note: observed samples inform estimated production. Your hard limits and game plan determine assigned minutes; time spent with one team is not a minute target or cap.";
  } else {
    modelNote.textContent = "Model note: this is an optimizer result under your displayed rules, not a win forecast or real-world depth chart.";
  }
  panel.append(
    benchmark,
    header,
    renderLineupDnaCoverageCounts(roleCoverage),
    insights,
    renderLineupDnaSwapTool(result, fanExplanation),
    modelNote,
  );

  const detailsButton = document.createElement("button");
  detailsButton.type = "button";
  detailsButton.className = "button button--quiet simple-result-details simple-only";
  detailsButton.dataset.action = "show-detailed";
  detailsButton.dataset.target = "lineupDnaEvidenceHeading";
  detailsButton.textContent = "Open full Lineup DNA details";
  panel.append(detailsButton);
  return panel;
}

/**
 * Render the shared Result Passport before the longer evidence report. It is
 * intentionally composed from three separate readings:
 *
 *   source outcome  = the statline and its real unit;
 *   decision quality = how this legal choice ranked in this exact search;
 *   game points      = optional game reward (daily games only).
 *
 * Keeping these cards separate prevents an internal optimizer objective from
 * being presented as a universal player or lineup rating.
 */
function renderResultPassport(result) {
  const passport = result?.resultPassport;
  if (!passport) return null;
  const root = document.createElement("section");
  root.className = "result-passport";
  root.setAttribute("aria-labelledby", "resultPassportHeading");

  const header = document.createElement("div");
  header.className = "result-passport__header";
  const eyebrow = document.createElement("p");
  eyebrow.className = "eyebrow";
  eyebrow.textContent = "Result summary";
  const heading = document.createElement("h3");
  heading.id = "resultPassportHeading";
  heading.textContent = "What this result means";
  const intro = document.createElement("p");
  intro.textContent = "The statline shows team-season production. Decision quality describes this search. Game points are a separate reward when a game uses them.";
  header.append(eyebrow, heading, intro);
  root.append(header);

  const grid = document.createElement("div");
  grid.className = "result-passport__grid";

  const native = document.createElement("article");
  native.className = "result-passport__card result-passport__card--native";
  const nativeHeading = document.createElement("h4");
  nativeHeading.textContent = "Basketball outcome";
  native.append(nativeHeading);
  const outcome = passport.nativeOutcome;
  if (outcome?.metrics && Object.keys(outcome.metrics).length > 0) {
    const metrics = document.createElement("dl");
    metrics.className = "result-passport__metrics";
    const labels = { points: "PTS", rebounds: "REB", assists: "AST", steals: "STL", blocks: "BLK", turnovers: "TOV" };
    for (const [key, value] of Object.entries(outcome.metrics)) {
      const metric = document.createElement("div");
      metric.className = "result-passport__metric";
      const term = document.createElement("dt");
      term.textContent = labels[key] || titleCase(key);
      const definition = document.createElement("dd");
      definition.textContent = hasFiniteNumber(value) ? formatNumber(value) : "—";
      metric.append(term, definition);
      metrics.append(metric);
    }
    native.append(metrics);
    const unit = document.createElement("p");
    unit.className = "result-passport__note";
    unit.textContent = `Team-season statline. Unit: ${outcome.unit.replaceAll("-", " ")}.`;
    native.append(unit);
  } else {
    const unavailable = document.createElement("p");
    unavailable.textContent = "Team-season production totals are unavailable for this run.";
    native.append(unavailable);
  }
  grid.append(native);

  const decision = document.createElement("article");
  decision.className = "result-passport__card result-passport__card--decision";
  const decisionHeading = document.createElement("h4");
  decisionHeading.textContent = "Decision quality";
  decision.append(decisionHeading);
  const quality = document.createElement("strong");
  const decisionData = passport.decision;
  const countComplete = decisionData?.proof?.countComplete === true;
  quality.textContent = countComplete && decisionData?.quality === "best-legal-choice"
    ? "Best legal choice"
    : decisionData?.quality === "best-found" || decisionData?.quality === "best-legal-choice"
      ? "Best found so far"
      : "Not ranked";
  decision.append(quality);
  const decisionCopy = document.createElement("p");
  if (countComplete && decisionData?.rank && decisionData?.optionCount) {
    decisionCopy.textContent = `Rank ${decisionData.rank} of ${decisionData.optionCount} legal groups. ${decisionData.choicesBeaten || 0} choices were behind it.`;
  } else if (decisionData?.rank) {
      decisionCopy.textContent = countComplete
      ? "A rank was returned, but the full eligible-group count is unavailable."
      : "This rank covers returned groups only; the full eligible-group count is unavailable.";
  } else {
    decisionCopy.textContent = countComplete
      ? "No eligible-group rank was returned."
      : "No eligible-group rank was returned; search coverage is limited to returned groups.";
  }
  decision.append(decisionCopy);
  grid.append(decision);

  if (passport.gamePoints) {
    const game = document.createElement("article");
    game.className = "result-passport__card result-passport__card--game";
    const gameHeading = document.createElement("h4");
    gameHeading.textContent = "Game points";
    game.append(gameHeading);
    const gameTotal = document.createElement("strong");
    gameTotal.textContent = `${passport.gamePoints.total}/${passport.gamePoints.max}`;
    game.append(gameTotal);
    const gameCopy = document.createElement("p");
    gameCopy.textContent = "Points reward the disclosed game rules; they are not a basketball performance metric.";
    game.append(gameCopy);
    grid.append(game);
  }
  root.append(grid);

  const replay = passport.replay || {};
  const evidenceContext = resultPassportEvidenceContext(passport);
  const demoScope = replay.scope?.kind === "course-demo" ? replay.scope : null;
  const selected = state.loadedLiveSelection || {};
  root.append(renderResultContext(document, {
    scope: selected.team && selected.season
      ? `${selected.team} · ${nbaSeasonLabel(selected.season)}`
      : demoScope?.team && demoScope?.season
        ? `Course demo · ${demoScope.team} · ${demoScope.season}`
      : replay.scope?.kind || "Result scope unavailable",
    phase: selected.seasonPhase || replay.phase || "Phase unavailable",
    denominator: evidenceContext.denominator,
    coverage: evidenceContext.coverage,
    evidence: evidenceContext.evidenceLabel,
    reliability: "Metric reliability unavailable",
    uncertainty: evidenceContext.uncertainty === "Unavailable"
      ? "Calibrated result uncertainty unavailable; read the bounded model notes below."
      : evidenceContext.uncertainty,
  }));

  const proof = document.createElement("p");
  proof.className = "result-passport__proof";
  const status = passport.status === "complete" ? "Complete" : titleCase(passport.status);
  const exact = decisionData?.proof?.countComplete === true
    ? "All eligible groups are included in this rank."
    : "This rank covers returned groups only; the full eligible-group count is unavailable.";
  proof.textContent = `${status}. ${exact}`;
  root.append(proof);
  return root;
}

/** Keep automatic coverage exclusions visible in BOTH reading modes and print.
 * Do not change state.excludedIds: each rerun must retry newly available data.
 * Use textContent for provider/user names, never interpolate names into HTML.
 */
function renderDataEligibilityNotice(result) {
  const coverage = result.diagnostics?.dataEligibility;
  if (!coverage?.excludedPlayers?.length) return null;
  const notice = document.createElement("section");
  notice.className = "result-card data-eligibility-notice";
  notice.setAttribute("aria-label", "Players left out because of missing data");
  const heading = document.createElement("h3");
  heading.textContent = `${coverage.excludedPlayers.length} player${coverage.excludedPlayers.length === 1 ? "" : "s"} automatically left out`;
  const explanation = document.createElement("p");
  explanation.textContent = result.ok
    ? `Built using ${coverage.eligibleCount} eligible players. The players below lacked data required by this model or your rules. This does not mean they are worse players. Your roster size, position rules, minute limits, and locks were kept.`
    : `With the required stats available, ${coverage.eligibleCount} players remain eligible. Your roster size, position rules, minute limits, and locks were not relaxed.`;
  const list = document.createElement("ul");
  for (const player of coverage.excludedPlayers) {
    const item = document.createElement("li");
    item.textContent = `${player.name}: Required stats for this model or selected rule are unavailable.`;
    list.append(item);
  }
  const note = document.createElement("p");
  note.textContent = "These exclusions apply only to this run. A later run can include a player if the required stats are available; saved player choices stay unchanged.";
  notice.append(heading, explanation, list, note);
  return notice;
}

function renderSuccess(result) {
  const best = result.best;
  // Explain the same candidate universe the solver actually searched. A data-
  // rejected player must not appear as a supposedly available replacement.
  const rejectedIds = new Set((result.diagnostics?.eligibilityRejected || []).map(player => player.id));
  const comparisonPlayers = comparisonPool().filter(player => !rejectedIds.has(player.id));
  // Selection remains entirely inside optimizer-core. This pure explanation
  // call translates the returned exact choice into readable strengths, sample
  // context, and tradeoffs; it cannot alter feasibility, minutes, or ranking.
  const fanExplanation = explainOptimizationSelection(result, {
    candidatePool: comparisonPlayers,
    referencePlayers: comparisonPlayers,
    weights: state.weights,
    comparisonLabel: "players available in this search",
  });
  const feasibleCount = Number(result.diagnostics.feasibleCombinations || 0);
  const possibleCount = Number(result.combinationsEvaluated || 0);
  const decision = result.resultPassport?.decision;
  const countIsComplete = decisionCountIsComplete(decision);
  // Keep the headline plain: this is the highest-scoring fit inside this exact
  // search, not a prediction of wins or an assertion about a real team's depth
  // chart. When the exact upper bound proves that an unresolved group cannot
  // enter the requested top results, say so directly instead of making the
  // smaller confirmed-feasible count sound like a candidate-search cutoff.
  const exactSearchHeadline = countIsComplete
    ? `Recommended #1 of ${feasibleCount.toLocaleString()} group${feasibleCount === 1 ? "" : "s"} that met every rule after checking all ${possibleCount.toLocaleString()} possible group${possibleCount === 1 ? "" : "s"}.`
    : "Recommended group among those returned; the full eligible-group count is unavailable.";
  // The visible result cards immediately below this header already show the
  // legal rank and decision-quality label. Keep the header focused on the
  // exact-search scope; copied summaries retain the detailed rank line.
  elements.resultSummary.textContent = exactSearchHeadline;

  const fragment = document.createDocumentFragment();
  const dataNotice = renderDataEligibilityNotice(result);
  if (dataNotice) fragment.append(dataNotice);
  const lineup = document.createElement("div");
  lineup.className = "lineup-grid";
  best.players.forEach((player, index) => lineup.append(renderLineupPlayer(player, best, index, {
    result,
    insight: playerInsightFor(fanExplanation, player.id),
  })));
  // In Simple view, answer the visitor's main question before asking them to
  // inspect five individual stat cards. The lineup itself remains immediately
  // below this overview, and Detailed mode still adds the complete audit trail
  // after it. No result data or ranking changes—only the reading order does.
  fragment.append(renderSimpleResultOverview(result, fanExplanation), lineup);
  const passport = renderResultPassport(result);
  if (passport) fragment.append(passport);
  fragment.append(createConditionalLineupPanel({
    document, result, selection: { ...state.loadedLiveSelection },
    teamNames: ALL_GAMES_PACKAGE_TEAM_NAMES, loadOpponent: loadAllGamesTeamDataset,
    isCurrent: () => state.lastResult === result && elements.resultFreshness.hidden,
  }));

  // Detailed view is deliberately progressive: even advanced users see the
  // actual players first, then choose when to open score math, rule proofs,
  // alternative tables, and descriptive skill signals.
  const fullAnalysis = document.createElement("details");
  fullAnalysis.className = "full-analysis detailed-only";
  const fullSummary = document.createElement("summary");
  fullSummary.textContent = "Open detailed analysis";
  const benchmarkExplainer = renderBenchmarkExplainer(result);
  const objectiveScenarioControl = renderObjectiveScenarioControl(result);
  const inputStabilityControl = renderInputStabilityControl(result);
  const scoreboard = document.createElement("div");
  scoreboard.className = "result-scoreboard";
  const productionPrefix = result.diagnostics?.productionConstraintProjection ? "Bounded" : best.rotation ? "Projected" : "Combined";
  const decisionForDetails = decision;
  if (decisionForDetails) {
    scoreboard.append(
      renderScoreCard("Decision quality", decisionQualityLabel(decisionForDetails), true),
      renderScoreCard(decisionCountIsComplete(decisionForDetails) ? "Legal rank" : "Search coverage", decisionRankLabel(decisionForDetails)),
      renderScoreCard("Rules", "All passed"),
    );
  }
  scoreboard.append(
    renderScoreCard(`${productionPrefix} PTS`, formatNumber(best.totals.points)),
    renderScoreCard(`${productionPrefix} REB`, formatNumber(best.totals.rebounds)),
    renderScoreCard(`${productionPrefix} AST`, formatNumber(best.totals.assists)),
  );

  const detailGrid = document.createElement("div");
  detailGrid.className = "result-detail-grid";
  const contributionCard = document.createElement("section");
  contributionCard.className = "result-card";
  const contributionHeading = document.createElement("h3");
  contributionHeading.textContent = "Strongest statistical advantages";
  contributionCard.append(contributionHeading, renderContributionList(best.contributionBreakdown));
  const familyContributions = renderFamilyContributionList(best.familyContributionBreakdown);
  if (familyContributions.childElementCount > 0) {
    const familyHeading = document.createElement("h3");
    familyHeading.textContent = "Priority family contributions";
    const familyNote = document.createElement("p");
    const familyAudit = best.familyContributionReconciliation;
    familyNote.textContent = familyAudit
      ? `Shared metrics are divided across configured families; direct metric weights with no family mapping are shown separately. Family subtotal ${formatNumber(familyAudit.familyContributionTotal, 3)} vs metric subtotal ${formatNumber(familyAudit.metricContributionTotal, 3)} (residual ${formatNumber(familyAudit.residual, 6)}). SwishIQ-minute and group-level adjustments are separate.`
      : "Shared metrics are divided across configured families; direct metric weights with no family mapping are shown separately. SwishIQ-minute and group-level adjustments are separate.";
    contributionCard.append(familyHeading, familyNote, familyContributions);
  }
  const auditCard = document.createElement("section");
  auditCard.className = "result-card";
  const auditHeading = document.createElement("h3");
  auditHeading.textContent = "Rules check";
  auditCard.append(auditHeading, renderAudit(best.constraintAudit));
  detailGrid.append(contributionCard, auditCard);

  fullAnalysis.append(fullSummary);
  if (benchmarkExplainer) fullAnalysis.append(benchmarkExplainer);
  fullAnalysis.append(
    scoreboard,
    renderResultEvidence(result),
    renderResultRankingContext(result),
    detailGrid,
  );
  if (objectiveScenarioControl) fullAnalysis.append(objectiveScenarioControl);
  if (inputStabilityControl) fullAnalysis.append(inputStabilityControl);
  if (best.rotation) {
    fullAnalysis.append(renderRotationMinutes(best.rotation), renderRotationUnitProof(best));
    const historicalBenchmark = renderHistoricalWorkloadBenchmark(result);
    if (historicalBenchmark) fullAnalysis.append(historicalBenchmark);
  }
  if (result.alternatives.length > 1) fullAnalysis.append(renderAlternatives(result.alternatives, best, countIsComplete));
  const lineupDnaReport = renderLineupDnaReport(result, fanExplanation);
  if (lineupDnaReport) fullAnalysis.append(lineupDnaReport);
  fragment.append(fullAnalysis);
  elements.resultContent.replaceChildren(fragment);
  setMobileResultCurrent(true);
}

function renderFailure(result) {
  // A failed rerun replaces any prior successful solve. Clear the compact
  // mobile success state before presenting the recovery guidance.
  setMobileResultCurrent(false);
  const category = result.diagnostics?.category;
  if (category === "data" || category === "swishiq-unavailable") {
    elements.resultsHeading.textContent = "Check the selected data";
    elements.resultSummary.textContent = "The selected model cannot run for this team-season right now. No other season was substituted.";
  } else if (category === "performance") {
    elements.resultsHeading.textContent = "Search stopped safely";
    elements.resultSummary.textContent = "The search stopped before a result was ready. Your settings are still available to review.";
  } else if (category === "worker-unavailable") {
    elements.resultsHeading.textContent = "Search unavailable";
    elements.resultSummary.textContent = "This browser could not start the search.";
  } else if (category === "worker-error") {
    elements.resultsHeading.textContent = "Search issue";
    elements.resultSummary.textContent = "The browser could not finish the search.";
  } else if (category === "validation") {
    elements.resultsHeading.textContent = "Review the scenario settings";
    elements.resultSummary.textContent = "One or more settings need attention before the optimizer can run.";
  } else {
    elements.resultsHeading.textContent = result.mode === "rotation" ? "No feasible rotation" : "No feasible lineup";
    elements.resultSummary.textContent = "The current requirements do not leave a feasible group.";
  }
  const card = document.createElement("div");
  card.className = "error-card";
  const heading = document.createElement("h3");
  heading.textContent = category === "data" || category === "swishiq-unavailable"
    ? "Choose another team-season or model"
    : category === "performance"
    ? "Review the run"
    : category === "worker-unavailable"
      ? "Use a current browser"
      : category === "worker-error"
        ? "Refresh and try again"
      : "Try loosening one rule";
  const list = document.createElement("ul");
  const reasons = category === "data" || category === "swishiq-unavailable"
    ? ["The selected stats or impact estimates are unavailable. Choose another team-season or switch to Historical."]
    : category === "performance"
      ? ["This run ended before a result was available. You can change the setup or try again."]
      : category === "worker-unavailable"
        ? ["Use a current browser or refresh the page, then try again."]
        : category === "worker-error"
          ? ["The search could not finish. Refresh the page and try again."]
          : category === "historical-workload"
            ? ["Recorded workload stats do not support this minute plan. Adjust the workload guardrail or use game-plan allocation."]
            : category === "minute-plan-bounds"
              ? ["Your player limits cannot reach 240 minutes. Adjust roster size or minimum or maximum minutes."]
              : (result.reasons || ["No feasible group was found."]);
  for (const reason of reasons) {
    const item = document.createElement("li");
    item.textContent = reason;
    list.append(item);
  }
  card.append(heading, list);
  const dataNotice = renderDataEligibilityNotice(result);
  elements.resultContent.replaceChildren(...(dataNotice ? [dataNotice, card] : [card]));
}

function workerUnavailableError() {
  const error = new Error("This browser could not start the lineup search. Use a current browser and try again.");
  error.name = "WorkerUnavailableError";
  return error;
}

function workerExecutionError(message) {
  const error = new Error(message);
  error.name = "WorkerExecutionError";
  return error;
}

function runOptimization(players, config, jobToken, {
  onProgress = null,
  scenarioConfigs = null,
  inputStability = null,
} = {}) {
  if (jobToken !== state.optimizationRunId) {
    const error = new Error("Optimization cancelled because the scenario changed.");
    error.name = "AbortError";
    return Promise.reject(error);
  }
  if (typeof window.Worker !== "function") {
    return Promise.reject(workerUnavailableError());
  }
  const requestId = `${Date.now()}-${jobToken}`;
  return new Promise((resolve, reject) => {
    let worker;
    try {
      worker = new Worker(OPTIMIZER_WORKER_URL, { type: "module", name: "djhc-lineup-optimizer" });
    } catch {
      reject(workerUnavailableError());
      return;
    }
    if (jobToken !== state.optimizationRunId) {
      worker.terminate();
      const error = new Error("Optimization cancelled because the scenario changed.");
      error.name = "AbortError";
      reject(error);
      return;
    }
    state.optimizationWorker = worker;
    let settled = false;
    let rejectCurrent = null;
    const timeout = config.mode === "rotation"
      ? null
      : window.setTimeout(() => {
        const error = new Error("The lineup search took too long. Narrow the player pool and try again.");
        error.name = "TimeoutError";
        rejectCurrent?.(error);
      }, LINEUP_OPTIMIZER_WORKER_TIMEOUT_MS * Math.max(
        1,
        scenarioConfigs?.length || 1,
        Number(inputStability?.estimatedScenarioCount) || 1,
      ));
    // Keep every Worker exit path in one cleanup function. A thrown postMessage,
    // timeout, error event, or normal result must all terminate the Worker and
    // clear the matching timeout/reject handles before the next solve begins.
    // Rotation has no timer, so null is a deliberate and testable state.
    const cleanup = () => {
      if (timeout !== null) window.clearTimeout(timeout);
      worker.terminate();
      if (state.optimizationWorker === worker) state.optimizationWorker = null;
      if (state.optimizationReject === rejectCurrent) state.optimizationReject = null;
    };
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback(value);
    };
    rejectCurrent = (error) => finish(reject, error);
    state.optimizationReject = rejectCurrent;
    worker.addEventListener("message", (messageEvent) => {
      const message = messageEvent.data;
      if (message?.requestId !== requestId) return;
      if (message.type === "progress") {
        // Progress never controls the solve. Ignore a stale or malformed update
        // rather than allowing display telemetry to disturb exact search work.
        if (typeof onProgress === "function" && jobToken === state.optimizationRunId) {
          try {
            onProgress(message.progress);
          } catch {
            // A progress-rendering issue must not reject a correct worker task.
          }
        }
        return;
      }
      if (message.error) {
        finish(reject, workerExecutionError(String(message.error)));
        return;
      }
      finish(resolve, message.result);
    });
    worker.addEventListener("error", (errorEvent) => {
      errorEvent.preventDefault();
      finish(reject, workerExecutionError("The background optimizer could not start. Refresh the page and try again."));
    });
    worker.addEventListener("messageerror", () => {
      finish(reject, workerExecutionError("The background optimizer returned an unreadable result. Refresh the page and try again."));
    });
    try {
      worker.postMessage({ requestId, players, config, scenarioConfigs, inputStability });
    } catch {
      finish(reject, workerExecutionError("The background optimizer could not receive this request. Refresh the page and try again."));
    }
  });
}

async function runOptimizer(event) {
  event?.preventDefault();
  if (state.activeOptimizationToken !== null) return;
  if (workflowView && !workflowView.beforeSubmit(event)) return;
  if (!state.dataset) return;
  if (!canOptimizeCurrentDataset()) {
    setLiveDataStatus("Load the selected team-season before running the search.", "warning");
    showToast("Load the selected team-season before optimizing it.");
    return;
  }
  updateSearchScope();
  if (!state.searchScopeCanRun) return;
  if (!workflowView && !elements.form.reportValidity()) return;
  if (!confirmLargeRotationSearch()) return;
  if (state.replacementRunToken !== null) {
    // The main exact search owns the same worker as a one-player test. Close
    // the visible pending state before aborting it so a new solve cannot leave
    // an old card indefinitely saying that it is still checking.
    finishPendingReplacement("A new exact result is being calculated, so this replacement test was cancelled.");
  }
  const jobToken = cancelOptimization("A newer optimization replaced the previous request.");
  const scenarioVersion = state.scenarioVersion;
  const familyWeightsForRun = { ...state.familyWeights };
  state.activeOptimizationToken = jobToken;
  state.lastOptimizerRequest = null;
  elements.results.classList.remove("is-stale");
  elements.resultFreshness.hidden = true;
  elements.resultFreshness.textContent = "";
  setOptimizeButtons({ disabled: true, label: solveActionLabel({ busy: true }) });
  const runningRotation = elements.mode.value === "rotation";
  setOptimizationCancellationAvailable(true);
  if (runningRotation) {
    setOptimizationProgress(
      `Preparing rotation search: 0 of ${(Number(state.rotationCandidateEstimate) || 0).toLocaleString()} candidate groups checked.`,
    );
  }
  elements.form.setAttribute("aria-busy", "true");
  workflowView?.start();
  setSolverStatus(
    runningRotation ? "Searching rotation groups. You can cancel at any time." : "Searching eligible groups…",
    "working",
  );
  // Yield once so the "Solving" state can paint, then re-check both identities.
  // A fast user edit in that frame cancels the request before any expensive
  // combination enumeration is sent to the Worker.
  await new Promise((resolve) => window.requestAnimationFrame(resolve));
  try {
    if (jobToken !== state.optimizationRunId || scenarioVersion !== state.scenarioVersion) return;
    // SwishIQ Impact is loaded before the solve from one pinned static exact
    // projection. Never refetch legacy evidence, call an authenticated service,
    // or substitute a pooled/historical package during this solve.
    if ($("#modelModeInput").value === "swishiq-impact") {
      const selection = state.loadedLiveSelection;
      const publicAvailability = swishIqAvailabilityForSelection(selection || undefined);
      if (!selection || !state.swishiqEvidence || !state.swishIqPackage || !publicAvailability.available) {
        throw new Error(publicAvailability.reason || "SwishIQ Impact is unavailable for this team-season. No other season was used.");
      }
      $("#swishiqEvidenceStatus").textContent = "SwishIQ Impact is available for the selected team-season.";
    }
    const optimizerConfig = buildOptimizerConfig();
    const optimizerPlayers = optimizerPlayersForCurrentScenario();
    const result = await runOptimization(
      optimizerPlayers,
      optimizerConfig,
      jobToken,
      {
        onProgress: optimizerConfig.mode === "rotation"
          ? (progress) => {
            if (jobToken !== state.optimizationRunId || scenarioVersion !== state.scenarioVersion) return;
            setOptimizationProgress(formatRotationSearchProgress(progress));
          }
          : null,
      },
    );
    if (jobToken !== state.optimizationRunId || scenarioVersion !== state.scenarioVersion) return;
    const packagedResult = withResultPassport(result, optimizerConfig, optimizerPlayers);
    state.lastResult = packagedResult;
    state.lastResultFamilyWeights = packagedResult.ok ? familyWeightsForRun : null;
    state.lastOptimizerRequest = packagedResult.ok
      ? { players: optimizerPlayers, config: optimizerConfig, scenarioVersion }
      : null;
    elements.results.classList.remove("is-stale");
    elements.resultFreshness.hidden = true;
    // Results should read like a recommendation to the visitor—not a generic
    // system status. Keep the familiar basketball nouns while making the
    // personal, game-plan-specific outcome clear at the top of the report.
    elements.resultsHeading.textContent = packagedResult.mode === "rotation"
      ? "Your recommended rotation"
      : "Your recommended lineup";
    if (packagedResult.ok) renderSuccess(packagedResult);
    else renderFailure(packagedResult);
    elements.resultActions.hidden = !packagedResult.ok;
    elements.emptyResult.hidden = true;
    elements.results.hidden = false;
    elements.copyResult.disabled = !packagedResult.ok;
    elements.downloadResult.disabled = !packagedResult.ok;
    syncShareScenarioAvailability();
    elements.printReport.disabled = !packagedResult.ok;
    setSolverStatus(packagedResult.ok ? "Result ready" : "Scenario needs attention", packagedResult.ok ? "success" : "warning");
    workflowView?.finish();
    elements.resultsHeading.focus({ preventScroll: true });
    elements.results.scrollIntoView({ behavior: motionBehavior(), block: "start" });
  } catch (error) {
    if (error?.name === "AbortError") return;
    if (jobToken !== state.optimizationRunId || scenarioVersion !== state.scenarioVersion) return;
    const detail = error instanceof Error ? error.message : "The optimizer could not run.";
    const swishiqAccessFailure = $("#modelModeInput").value === "swishiq-impact"
      && !swishIqAvailabilityForSelection(state.loadedLiveSelection || undefined).available;
    if (swishiqAccessFailure) $("#swishiqEvidenceStatus").textContent = "SwishIQ Impact is unavailable for this team-season. Choose another season or switch to Historical. No other season is used.";
    const failure = {
      mode: elements.mode.value,
      reasons: [detail],
      diagnostics: {
        category: swishiqAccessFailure ? "swishiq-unavailable" : error?.name === "TimeoutError"
          ? "performance"
          : error?.name === "WorkerUnavailableError"
            ? "worker-unavailable"
            : error?.name === "WorkerExecutionError"
              ? "worker-error"
            : "validation",
      },
    };
    state.lastResult = failure;
    state.lastResultFamilyWeights = null;
    renderFailure(failure);
    elements.resultActions.hidden = true;
    elements.emptyResult.hidden = true;
    elements.results.hidden = false;
    elements.copyResult.disabled = true;
    elements.downloadResult.disabled = true;
    elements.shareResult.disabled = true;
    elements.shareResultHelp.hidden = true;
    elements.shareScenario.disabled = true;
    elements.printReport.disabled = true;
    setSolverStatus("Scenario needs attention", "warning");
    showToast(detail);
    workflowView?.finish();
  } finally {
    if (jobToken !== state.optimizationRunId || scenarioVersion !== state.scenarioVersion) return;
    state.activeOptimizationToken = null;
    elements.form.removeAttribute("aria-busy");
    setOptimizationCancellationAvailable(false);
    setOptimizeButtons({ disabled: false });
    const needsUpdate = !elements.resultFreshness.hidden;
    setOptimizeButtons({ label: solveActionLabel({ update: needsUpdate }) });
  }
}

function replaceReplacementOutput(playerId, analysis) {
  replacementResultElements(playerId).forEach((existing) => {
    const output = replacementAnalysisMarkup(playerId, analysis);
    if (existing.hasAttribute("data-lineup-dna-replacement-output")) {
      output.dataset.lineupDnaReplacementOutput = "";
    }
    existing.replaceWith(output);
  });
}

function restoreReplacementButtons() {
  elements.resultContent.querySelectorAll('[data-action="exact-replacement"], [data-action="lineup-dna-replacement"]').forEach((button) => {
    const player = currentPlayer(button.dataset.playerId);
    button.disabled = !player || state.lockedIds.has(button.dataset.playerId);
    button.textContent = button.dataset.idleLabel || "Test a replacement";
  });
  elements.resultContent.querySelectorAll('[data-action="lineup-dna-replacement-choice"]').forEach((select) => {
    select.disabled = false;
  });
}

function setReplacementButtonsBusy(activePlayerId) {
  // Each counterfactual uses the same exact-search worker. Keeping one
  // request in flight makes cancellation deterministic and prevents another
  // card from being left at a misleading "Checking…" state.
  elements.resultContent.querySelectorAll('[data-action="exact-replacement"], [data-action="lineup-dna-replacement"]').forEach((button) => {
    button.disabled = true;
    button.textContent = button.dataset.playerId === activePlayerId
      ? "Testing a replacement…"
      : "Replacement test running…";
  });
  elements.resultContent.querySelectorAll('[data-action="lineup-dna-replacement-choice"]').forEach((select) => {
    select.disabled = true;
  });
}

async function runExactReplacement(playerId) {
  const originalResult = state.lastResult;
  const originalBest = originalResult?.best;
  const player = currentPlayer(playerId);
  if (!originalResult?.ok || !originalBest || !player || !elements.resultFreshness.hidden) return;
  if (state.replacementRunToken !== null) return;
  if (state.lockedIds.has(playerId)) {
    replaceReplacementOutput(playerId, {
      ok: false,
      message: "This player is locked by the current scenario. Unlock them to test a replacement.",
    });
    return;
  }

  const cacheKey = `${state.scenarioVersion}:${playerId}`;
  if (state.replacementAnalyses.has(cacheKey)) {
    replaceReplacementOutput(playerId, state.replacementAnalyses.get(cacheKey));
    return;
  }

  const originalIds = new Set(originalBest.players.map((item) => item.id));
  const preservedIds = originalBest.players
    .map((item) => item.id)
    .filter((id) => id !== playerId);
  const replacementConfig = buildOptimizerConfig();
  // Locking the other returned IDs and excluding the tested player turns a
  // broad top-N search into an auditable one-player counterfactual. It keeps
  // every current eligibility, position, production, and minute rule intact.
  replacementConfig.lockedIds = [...new Set([
    ...replacementConfig.lockedIds.filter((id) => id !== playerId),
    ...preservedIds,
  ])];
  // Remove selection eligibility, not the row's contribution to normalization.
  // Ordinary exclusions intentionally define a new scenario/pool; this private
  // counterfactual gate retains the ORIGINAL metric/SwishIQ/role reference.
  replacementConfig.selectionOnlyExcludedIds = [...new Set([
    ...(replacementConfig.selectionOnlyExcludedIds || []),
    playerId,
  ])].filter((id) => !replacementConfig.lockedIds.includes(id));
  replacementConfig.alternatives = 1;

  const scenarioVersion = state.scenarioVersion;
  const jobToken = cancelOptimization("The replacement test started.");
  state.replacementRunToken = jobToken;
  state.replacementPlayerId = playerId;
  setReplacementButtonsBusy(playerId);
  replacementResultElements(playerId).forEach((pending) => {
    pending.hidden = false;
    delete pending.dataset.status;
    pending.textContent = "Checking eligible one-player replacements against your current rules…";
  });

  try {
    const replacementResult = await runOptimization(
      optimizerPlayersForCurrentScenario(),
      replacementConfig,
      jobToken,
    );
    if (
      jobToken !== state.optimizationRunId
      || state.replacementRunToken !== jobToken
      || scenarioVersion !== state.scenarioVersion
      || state.lastResult !== originalResult
    ) return;
    let analysis;
    if (!replacementResult.ok || !replacementResult.best) {
      analysis = {
        ok: false,
        message: replacementResult.diagnostics?.category === "infeasible"
          ? "No feasible one-player replacement meets every current rule."
          : "The replacement search could not establish a result. Review the stats and current rules, then try again.",
      };
    } else {
      const replacement = replacementResult.best.players.find((item) => !originalIds.has(item.id));
      if (!replacement) {
        analysis = {
          ok: false,
          message: "The solver did not return a distinct replacement under the current rules.",
        };
      } else {
        const deltas = Object.fromEntries(
          ["points", "rebounds", "assists", "steals", "blocks", "turnovers"].map((metric) => [
            metric,
            hasFiniteNumber(replacementResult.best.totals?.[metric]) && hasFiniteNumber(originalBest.totals?.[metric])
              ? Number(replacementResult.best.totals[metric]) - Number(originalBest.totals[metric]) : null,
          ]),
        );
        analysis = {
          ok: true,
          replacementId: replacement.id,
          replacementName: replacement.name,
          deltas,
          objectiveComparison: replacementObjectiveComparison(originalResult, replacementResult),
          roleChanges: explainLineupRoleChange(originalBest.players, replacementResult.best.players, {
            referencePlayers: comparisonPool().filter(row => !(originalResult.diagnostics?.dataEligibility?.excludedPlayers || []).some(excluded => excluded.id === row.id)),
            comparisonLabel: "players with usable data in the original search",
          }),
        };
      }
    }
    state.replacementAnalyses.set(cacheKey, analysis);
    replaceReplacementOutput(playerId, analysis);
  } catch (error) {
    if (error?.name === "AbortError") return;
    if (
      jobToken !== state.optimizationRunId
      || state.replacementRunToken !== jobToken
      || scenarioVersion !== state.scenarioVersion
      || state.lastResult !== originalResult
    ) return;
    const analysis = {
      ok: false,
      message: "The replacement test could not run. Review the selected stats and current rules, then try again.",
    };
    state.replacementAnalyses.set(cacheKey, analysis);
    replaceReplacementOutput(playerId, analysis);
  } finally {
    if (jobToken !== state.optimizationRunId || state.replacementRunToken !== jobToken) return;
    state.replacementRunToken = null;
    state.replacementPlayerId = null;
    restoreReplacementButtons();
  }
}

function comparisonPool() {
  // These are the same two pool gates applied before exact combinations are
  // enumerated. Locks affect membership in a lineup, not the population used
  // to interpret a player's percentile.
  return state.dataset.players.filter(
    (player) => isPlayerEligible(player) && !state.excludedIds.has(player.id),
  );
}

function percentileForPoolValue(value, poolValues, lowerIsBetter = false) {
  const values = poolValues
    .map(Number)
    .filter(Number.isFinite)
    .sort((left, right) => left - right);
  if (values.length === 0 || !Number.isFinite(Number(value))) return null;
  if (values.length <= 1) return 100;
  const numericValue = Number(value);
  const lower = values.filter((candidate) => candidate < numericValue).length;
  const equal = values.filter((candidate) => candidate === numericValue).length;
  const rawPercentile = ((lower + Math.max(0, equal - 1) / 2) / (values.length - 1)) * 100;
  // A selected comparison can remain on screen after exclusion. Clamp that
  // out-of-pool reference value instead of letting it produce a bar above 100.
  const percentile = Math.max(0, Math.min(100, rawPercentile));
  return lowerIsBetter ? 100 - percentile : percentile;
}

function renderCompare() {
  if (!state.dataset) return;
  const selected = [...state.compareIds].map(currentPlayer).filter(Boolean).slice(0, 4);
  const pool = comparisonPool();
  const view = analyticsViewDetail();
  elements.compareContent.replaceChildren();
  if (selected.length < 2) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    const heading = document.createElement("h3");
    heading.textContent = selected.length === 1 ? "Choose one more player" : "Choose two to four players";
    const copy = document.createElement("p");
    copy.textContent = `Use the Compare checkboxes in the player table. The current comparison contains ${pool.length} player${pool.length === 1 ? "" : "s"} available in this search.`;
    empty.append(heading, copy);
    elements.compareContent.append(empty);
    return;
  }

  const poolNote = document.createElement("p");
  poolNote.className = "compare-pool-note";
  poolNote.textContent = `${pool.length} player${pool.length === 1 ? "" : "s"} meet the current sample filters and are not excluded. Values use ${view.label.toLowerCase()}. Percentiles below use exactly that pool; a compared player can remain visible after being excluded. ${view.note}`;

  const legend = document.createElement("div");
  legend.className = "compare-legend";
  selected.forEach((player, index) => {
    const item = document.createElement("span");
    const dot = document.createElement("i");
    dot.style.background = CHART_COLORS[index];
    const avatar = createPlayerAvatar(player, "compare-legend__avatar");
    item.append(dot, avatar, document.createTextNode(player.name));
    legend.append(item);
  });
  const scroll = document.createElement("div");
  scroll.className = "table-wrap";
  scroll.tabIndex = 0;
  scroll.setAttribute("aria-label", `Percentile comparison across ${pool.length} players available in this search`);
  const bars = document.createElement("div");
  bars.className = "compare-bars";
  bars.style.padding = "1rem";
  for (const [metric, labelText, lowerIsBetter] of COMPARE_METRICS) {
    const poolValues = pool.map((item) => analyticsValue(item, metric));
    const row = document.createElement("div");
    row.className = "compare-row";
    const label = document.createElement("strong");
    label.textContent = labelText;
    const rowBars = document.createElement("div");
    rowBars.className = "compare-row__bars";
    selected.forEach((player, index) => {
      const rawValue = analyticsValue(player, metric);
      const percentile = percentileForPoolValue(rawValue, poolValues, lowerIsBetter);
      const valueText = analyticsMetricText(metric, rawValue);
      const line = document.createElement("div");
      line.className = "compare-player-line";
      const track = document.createElement("span");
      track.className = "compare-player-track";
      const bar = document.createElement("div");
      bar.className = "compare-player-bar";
      bar.style.width = `${percentile === null ? 0 : Math.max(2, percentile)}%`;
      bar.style.background = CHART_COLORS[index];
      bar.setAttribute("role", "progressbar");
      bar.setAttribute("aria-valuemin", "0");
      bar.setAttribute("aria-valuemax", "100");
      bar.setAttribute("aria-valuenow", String(Math.round(percentile || 0)));
      bar.setAttribute("aria-label", `${player.name}: ${labelText}`);
      bar.setAttribute("aria-valuetext", percentile === null
        ? `${player.name}, ${labelText}: unavailable in the selected ${view.shortLabel} view.`
        : `${player.name}, ${labelText}: ${valueText}; ${formatOrdinal(percentile)} percentile among ${pool.length} players available in this search`);
      const value = document.createElement("span");
      value.className = "compare-player-value";
      value.textContent = valueText;
      value.setAttribute("aria-hidden", "true");
      track.append(bar);
      line.append(track, value);
      rowBars.append(line);
    });
    row.append(label, rowBars);
    bars.append(row);
  }
  scroll.append(bars);
  elements.compareContent.append(poolNote, legend, scroll);
}

function renderWatchlist() {
  if (!state.dataset) return;
  const players = [...state.watchlistIds]
    .map((id) => state.watchlistSnapshots.get(id) || currentPlayer(id))
    .filter(Boolean)
    .sort((left, right) => left.name.localeCompare(right.name));
  elements.watchlistContent.replaceChildren();
  elements.downloadWatchlist.disabled = players.length === 0;
  elements.watchlistCount.textContent = String(state.watchlistIds.size);
  const unresolvedCount = Math.max(0, state.watchlistIds.size - players.length);
  if (players.length === 0) {
    const empty = document.createElement("div");
    empty.className = "panel empty-state";
    const heading = document.createElement("h3");
    heading.textContent = unresolvedCount ? "A saved player is waiting for its original pool" : "Your watchlist is empty";
    const copy = document.createElement("p");
    copy.textContent = unresolvedCount
      ? "This entry was saved before cross-season snapshots were added. Load the team-season where you starred that player once to restore its card."
      : "Select the star beside a player to keep a private shortlist across team-season searches on this device.";
    empty.append(heading, copy);
    elements.watchlistContent.append(empty);
    return;
  }
  for (const player of players) {
    const card = document.createElement("article");
    card.className = "watch-card";
    const headingWrap = document.createElement("div");
    headingWrap.className = "watch-card__heading";
    const identity = document.createElement("div");
    identity.className = "watch-card__identity";
    const avatar = createPlayerAvatar(player, "watch-card__avatar");
    const text = document.createElement("div");
    const heading = document.createElement("h3");
    heading.textContent = player.name;
    const meta = document.createElement("p");
    const context = player.watchlistContext || {};
    const metaParts = [
      context.season || state.dataset.source?.season || "Custom",
      context.team || player.team,
      Array.isArray(player.positions) ? player.positions.join("/") : String(player.positions || "Position unavailable"),
    ];
    // Older imports and source pages do not always provide age. Omitting that
    // fragment is clearer than rendering "age undefined" on a saved card.
    if (Number.isFinite(Number(player.age)) && Number(player.age) > 0) {
      metaParts.push(`Age ${formatNumber(player.age)}`);
    }
    meta.textContent = metaParts.filter(Boolean).join(" · ");
    text.append(heading, meta);
    if (avatar) identity.append(avatar);
    identity.append(text);
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "watch-toggle is-active";
    remove.dataset.action = "watch";
    remove.dataset.playerId = player.id;
    remove.setAttribute("aria-label", `Remove ${player.name} from watchlist`);
    remove.textContent = "★";
    headingWrap.append(identity, remove);
    const stats = document.createElement("div");
    stats.className = "watch-card__stats";
    for (const [label, value] of [
      ["PTS", player.points],
      ["REB", player.rebounds],
      ["AST", player.assists],
      ["3P", formatPercent(player.threePct)],
    ]) {
      const block = document.createElement("div");
      const statLabel = document.createElement("span");
      statLabel.textContent = label;
      const statValue = document.createElement("strong");
      statValue.textContent = typeof value === "number" ? formatNumber(value) : value;
      block.append(statLabel, statValue);
      stats.append(block);
    }
    card.append(headingWrap, stats, createCardSearchLink(player));
    elements.watchlistContent.append(card);
  }
  if (unresolvedCount) {
    const note = document.createElement("p");
    note.className = "watchlist-migration-note";
    note.textContent = unresolvedCount === 1
      ? "1 older saved entry is waiting for its original team-season to be loaded once."
      : `${unresolvedCount} older saved entries are waiting for their original team-seasons to be loaded once.`;
    elements.watchlistContent.append(note);
  }
}

function switchView(viewName, { scroll = false } = {}) {
  let activeView = null;
  $$('[data-view]').forEach((view) => {
    const selected = view.dataset.view === viewName;
    view.hidden = !selected;
    if (selected) activeView = view;
  });
  $$(".tool-nav [role='tab']").forEach((button) => {
    const selected = button.dataset.viewTarget === viewName;
    button.classList.toggle("is-active", selected);
    button.setAttribute("aria-selected", String(selected));
    button.tabIndex = selected ? 0 : -1;
  });
  if (viewName === "compare") renderCompare();
  if (viewName === "watchlist") renderWatchlist();
  if (scroll) {
    $("#workspace").scrollIntoView({ behavior: motionBehavior(), block: "start" });
    activeView?.focus({ preventScroll: true });
  }
}

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function downloadText(filename, text, type = "text/csv;charset=utf-8") {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function resultSummaryText() {
  const result = state.lastResult;
  // Result actions are disabled when inputs change, but retain this guard for
  // keyboard/programmatic calls during an async roster-selector refresh.
  if (!result?.ok || !elements.resultFreshness.hidden) return "";
  const best = result.best;
  const swishiqImpact = best.modelAdjustments?.swishiqImpact?.additiveImpactPer100;
  const decision = result.resultPassport?.decision;
  const lines = [
    `DJ's Lineup Lab - ${elements.mode.value === "rotation" ? "Recommended rotation and minutes plan" : "Recommended lineup"}`,
    swishiqImpact ? `Model: SwishIQ Impact ${result.diagnostics.swishiqImpactModel.objective}` : `Strategy: ${PRESET_LABELS[state.activePreset] || "Custom mix"}`,
    ...(swishiqImpact ? [swishiqResultObjectiveExplanation(result)] : []),
    `Decision quality: ${decisionRankSummary(decision, "The recommended group")}`,
    `Players: ${best.players.map((player) => player.name).join(", ")}`,
    `${result.diagnostics?.productionConstraintProjection ? "Conservative constraint bounds (not expected totals)" : best.rotation ? "Minute-weighted projection" : "Combined player profiles"}: ${formatNumber(best.totals.points)} PTS, ${formatNumber(best.totals.rebounds)} REB, ${formatNumber(best.totals.assists)} AST, ${formatNumber(best.totals.turnovers)} TOV`,
  ];
  if (best.rotation) {
    lines.push(`Minutes: ${best.rotation.allocations.map((item) => `${currentPlayer(item.id)?.name || item.id} ${item.minutes}`).join(", ")}`);
  }
  const dataExcluded = result.diagnostics?.dataEligibility?.excludedPlayers || [];
  if (dataExcluded.length) lines.push(`Automatically left out (required stats unavailable, not a player-quality judgment): ${dataExcluded.map(player => `${player.name} — required stats for this model or rule were unavailable`).join("; ")}. Exclusions apply only to this run; hard rules were preserved.`);
  lines.push("Historical-stat exploration only; not a prediction or betting recommendation.");
  return lines.join("\n");
}

async function copyResult() {
  const text = resultSummaryText();
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const input = document.createElement("textarea");
    input.value = text;
    input.style.position = "fixed";
    input.style.opacity = "0";
    document.body.append(input);
    input.select();
    document.execCommand("copy");
    input.remove();
  }
  showToast("Result summary copied.");
}

function downloadResult() {
  const best = state.lastResult?.best;
  if (!best || !elements.resultFreshness.hidden) return;
  const minutesById = best.rotation?.byId || {};
  const rows = [
    ["Player", "Team", "Eligible Positions", "Roster Slot", "Minutes", "Guard Minutes", "Forward Minutes", "Center Minutes", "PTS", "REB", "AST", "STL", "BLK", "TOV", "eFG%", "3P%"],
    ...best.players.map((player) => {
      const roleMinutes = best.rotation?.positionMinutes?.byPlayer?.[player.id] || {};
      return [
        player.name,
        player.team,
        player.positions.join("/"),
        assignedPosition(best, player.id),
        minutesById[player.id] ?? "",
        roleMinutes.G ?? "",
        roleMinutes.F ?? "",
        roleMinutes.C ?? "",
        player.points,
        player.rebounds,
        player.assists,
        player.steals,
        player.blocks,
        player.turnovers,
        player.efgPct,
        player.threePct,
      ];
    }),
  ];
  downloadText("djhc-optimized-lineup.csv", rows.map((row) => row.map(csvEscape).join(",")).join("\r\n"));
  showToast("Lineup CSV downloaded.");
}

function exportDataset() {
  if (!state.dataset) return;
  downloadText("djhc-lineup-player-data.csv", datasetToCsv(state.dataset));
  showToast("Current player data exported.");
}

function downloadTemplate() {
  const template = {
    schemaVersion: 1,
    source: { label: "CSV template", season: "YYYY-YY" },
    players: [state.dataset.players[0]],
  };
  downloadText("djhc-lineup-import-template.csv", datasetToCsv(template));
  showToast("CSV template downloaded.");
}

function downloadWatchlist() {
  const players = [...state.watchlistIds]
    .map((id) => state.watchlistSnapshots.get(id) || currentPlayer(id))
    .filter(Boolean);
  if (players.length === 0) return;
  downloadText(
    "djhc-player-watchlist.csv",
    datasetToCsv({
      schemaVersion: 1,
      source: {
        label: "DJHC saved player watchlist",
        season: "Multiple team-seasons",
        snapshotDate: new Date().toISOString().slice(0, 10),
      },
      players,
    }),
  );
  showToast("Watchlist CSV downloaded.");
}

async function importCsvFile(file) {
  const loadGeneration = beginNonLiveDatasetLoad();
  let text;
  try {
    text = await file.text();
  } catch (error) {
    if (!datasetLoadIsCurrent(loadGeneration)) return;
    throw error;
  }
  if (!datasetLoadIsCurrent(loadGeneration)) return;
  const defaultTeam = teamValues()[0] || undefined;
  const dataset = parsePlayerCsv(text, {
    defaultTeam,
    source: {
      label: file.name,
      season: "Imported",
      snapshotDate: new Date().toISOString().slice(0, 10),
      note: "User-imported CSV; values are historical, not live.",
    },
  });
  if (dataset.diagnostics.errors.length > 0) {
    const details = dataset.diagnostics.errors.slice(0, 3).map((item) => item.message).join(" ");
    throw new Error(details || "The CSV does not contain usable player stats.");
  }
  if (!datasetLoadIsCurrent(loadGeneration)) return;
  const warningCount = dataset.diagnostics.warnings.length;
  setDataset(dataset, {
    notice: `${dataset.players.length} players imported${warningCount ? ` with ${warningCount} warning${warningCount === 1 ? "" : "s"}` : ""}.`,
  });
  setLiveDataStatus("Using an imported CSV. Choose a team and season above to return to live data.");
}

function resetScenario() {
  const hasPendingReplacement = state.replacementRunToken !== null;
  cancelOptimization("Optimization cancelled because the scenario was reset.");
  if (hasPendingReplacement) {
    finishPendingReplacement("The scenario was reset. Run a new result before testing replacements.");
  }
  state.scenarioVersion += 1;
  // Reset is an intentional fresh start, so it also discards any temporary
  // Detailed-view snapshot that otherwise exists only to survive one view switch.
  state.detailedSettingsSnapshot = null;
  state.swishiqEvidence = null;
  state.swishIqPackage = null;
  state.swishIqProjectionStatus = "idle";
  $("#modelModeInput").value = "historical";
  $("#swishiqObjectiveInput").value = "balanced";
  $("#swishiqOffenseWeightInput").value = "1";
  $("#swishiqDefenseWeightInput").value = "1";
  elements.mode.value = "lineup";
  setMode("lineup");
  syncModelChoice();
  elements.alternatives.value = "5";
  const loadedPhase = state.loadedLiveSelection?.seasonPhase || DEFAULT_SEASON_PHASE;
  state.recommendedMinGames = recommendedMinimumGames(loadedPhase, "lineup");
  elements.minGames.value = String(state.recommendedMinGames);
  elements.minMinutes.value = "6";
  elements.minPoints.value = "";
  elements.minRebounds.value = "";
  elements.minAssists.value = "";
  elements.minSteals.value = "";
  elements.minBlocks.value = "";
  elements.maxTurnovers.value = "";
  elements.rotationMin.value = "8";
  elements.rotationMax.value = "40";
  elements.rotationMinutePlan.value = "openWhatIf";
  elements.rotationAllocationStyle.value = "strategyFirst";
  elements.rotationFlexibility.value = "8";
  elements.rotationRateStability.value = "sampleAdjusted";
  elements.rotationPositionProfile.value = "automatic";
  elements.projectionRisk.value = "balanced";
  elements.roleBalance.value = "recommended";
  state.analyticsView = "perGame";
  elements.analyticsView.value = state.analyticsView;
  elements.rotationScoringBasis.value = "per36";
  syncRotationModelControls();
  state.lockedIds.clear();
  state.excludedIds.clear();
  state.offensiveResponsibilities = {};
  state.opponentWeightUndo = null;
  applyPreset("balanced", { invalidate: false });
  if (state.experienceMode === "simple") applySimpleModelDefaults({ invalidate: false });
  clearRenderedResult();
  updateSearchScope();
  setSolverStatus(state.searchScopeCanRun ? "Ready to solve" : "Not ready to solve",
    state.searchScopeCanRun ? undefined : "warning");
  setOptimizeButtons({ label: solveActionLabel() });
  renderPlayerTable();
  if (state.opponentDataset) renderOpponentSwishIQ();
  showToast("Scenario reset. Your comparison and watchlist were kept.");
}

function bindEvents() {
  bindChoiceButtonGroups();
  $$("[data-view-target]").forEach((button) => {
    button.addEventListener("click", () => switchView(button.dataset.viewTarget, { scroll: !button.closest(".tool-nav") }));
  });
  $$("[data-preset]").forEach((button) => {
    button.addEventListener("click", () => applyPreset(button.dataset.preset, { announce: true }));
  });
  $$('[data-family]').forEach((input) => {
    input.addEventListener("input", () => {
      state.familyWeights[input.dataset.family] = Number(input.value);
      // The solver never receives an opaque family score. Convert the six
      // readable controls back to the same eight auditable metric weights used
      // by presets, shared links, contribution details, and exact search.
      state.weights = weightsFromSkillFamilies(state.familyWeights);
      state.activePreset = "custom";
      state.opponentWeightUndo = null;
      renderPresetState();
      renderWeightControls();
      updateRunSummary();
      markScenarioChanged();
    });
    input.addEventListener("change", () => {
      // Rebuild the comparison once the drag is complete so its Current column
      // stays accurate without repeatedly reloading avatars on every slider tick.
      if (state.opponentDataset) renderOpponentSwishIQ();
    });
  });
  elements.mode.addEventListener("change", () => {
    setMode(elements.mode.value);
    if (state.experienceMode === "simple") applySimpleModelDefaults({ invalidate: false });
    markScenarioChanged();
  });
  elements.analyticsView.addEventListener("change", () => {
    state.analyticsView = ANALYTICS_VIEW_DETAILS[elements.analyticsView.value]
      ? elements.analyticsView.value
      : "perGame";
    // Rate display is deliberately presentation-only. Keep the exact result
    // fresh and redraw the facts/cards instead of forcing a needless re-solve.
    renderCompare();
    if (state.lastResult?.ok && elements.resultFreshness.hidden) renderSuccess(state.lastResult);
  });
  elements.rotationScoringBasis.addEventListener("change", () => {
    syncRotationModelControls();
    markScenarioChanged();
  });
  elements.rotationMinutePlan.addEventListener("change", () => {
    syncRotationModelControls();
    updateRunSummary();
    markScenarioChanged();
  });
  elements.rotationAllocationStyle.addEventListener("change", () => {
    syncRotationModelControls();
    updateRunSummary();
    markScenarioChanged();
  });
  elements.rotationFlexibility.addEventListener("change", () => {
    updateRunSummary();
    markScenarioChanged();
  });
  elements.rotationRateStability.addEventListener("change", markScenarioChanged);
  elements.projectionRisk.addEventListener("change", markScenarioChanged);
  elements.roleBalance.addEventListener("change", markScenarioChanged);
  elements.rotationPositionProfile.addEventListener("change", () => {
    syncRotationRoleCopy();
    updateRunSummary();
    markScenarioChanged();
  });
  elements.positionFlexibility.addEventListener("change", () => {
    syncRotationRoleCopy();
    updateRunSummary();
    markScenarioChanged();
  });
  elements.form.addEventListener("submit", runOptimizer);
  elements.cancelOptimize.addEventListener("click", cancelCurrentOptimization);
  elements.mobileCancelOptimize.addEventListener("click", cancelCurrentOptimization);
  syncModelChoice();
  $("#modelModeInput").addEventListener("change", async () => {
    invalidateDatasetLoad();
    state.swishiqEvidence = null;
    state.swishIqPackage = null;
    state.swishIqProjectionStatus = "idle";
    syncModelChoice();
    updateRunSummary();
    markScenarioChanged();
    try {
      await loadSelectedModelDataset({ force: false });
    } catch (error) {
      setLiveDataStatus("The selected team-season could not be loaded. Try again or choose another season.", "warning");
      showToast("The selected team-season could not be loaded. Try again or choose another season.");
    }
  });
  elements.swishiqEvidenceMode.addEventListener("change", async () => {
    invalidateDatasetLoad();
    state.swishiqEvidence = null;
    state.swishIqPackage = null;
    state.swishIqProjectionStatus = "idle";
    syncModelChoice();
    updateRunSummary();
    markScenarioChanged();
    if ($("#modelModeInput").value === "swishiq-impact") await loadSelectedSwishIqProjection();
  });
  $("#swishiqObjectiveInput").addEventListener("change", () => {
    syncSwishIQPriorityControls();
    updateRunSummary();
    markScenarioChanged();
  });
  for (const id of ["swishiqOffenseWeightInput", "swishiqDefenseWeightInput"]) {
    $("#" + id).addEventListener("input", () => {
      syncSwishIQPriorityControls();
      updateRunSummary();
      markScenarioChanged();
    });
  }
  bindRemainingEvents();
}

/**
 * Preserve the user's raw proportions (including decimals and zero), then let
 * the SAME resolver used by the Worker normalize them. Empty inputs become
 * NaN rather than Number("") === 0: clearing a field is not an offense-only
 * or defense-only instruction. Presets ignore dormant custom values entirely.
 * These controls stay active in both Simple and Detailed views.
 */
function swishiqWeightsFromControls() {
  if ($("#modelModeInput").value !== "swishiq-impact" || $("#swishiqObjectiveInput").value !== "custom") return undefined;
  return { offense: $("#swishiqOffenseWeightInput").valueAsNumber,
    defense: $("#swishiqDefenseWeightInput").valueAsNumber };
}

function swishiqPrioritySummary() {
  try {
    const weights = resolveSwishIQObjectiveWeights(swishiqWeightsFromControls(), $("#swishiqObjectiveInput").value);
    const percentage = value => (100 * value).toLocaleString(undefined, { maximumSignificantDigits: 4 });
    return `${percentage(weights.offense)}% offense / ${percentage(weights.defense)}% defense`;
  } catch { return "Set valid offense/defense priorities"; }
}

function syncSwishIQPriorityControls() {
  const swishiq = $("#modelModeInput").value === "swishiq-impact";
  const custom = swishiq && $("#swishiqObjectiveInput").value === "custom";
  $("#swishiqCustomWeights").hidden = !custom;
  $("#swishiqPrioritySummary").hidden = !swishiq;
  for (const id of ["swishiqOffenseWeightInput", "swishiqDefenseWeightInput"]) $("#" + id).disabled = !custom;
  $("#swishiqPrioritySummary").textContent = `Current objective: ${swishiqPrioritySummary()}. These are preference shares, not predicted scoring shares or minute targets. Hard requirements still apply when a side has zero weight.`;
}

function syncProjectionRiskControl() {
  const swishiq = $("#modelModeInput").value === "swishiq-impact";
  const nativeV4MeanOnly = swishiq && isCanonicalV4NativeImpactLoaded();
  const isRotation = elements.mode.value === "rotation";
  const visible = swishiq || isRotation;
  elements.projectionRiskSettings.hidden = !visible;
  elements.projectionRisk.disabled = !visible || nativeV4MeanOnly;
  if (nativeV4MeanOnly) {
    // Native V4 has exposure metadata but no estimated player uncertainty. Do
    // not relabel exposure as a reserve or upside interval.
    elements.projectionRisk.value = "balanced";
    elements.projectionRiskLabel.textContent = "Impact treatment";
    elements.projectionRisk.options[0].textContent = "Unavailable — no estimated uncertainty";
    elements.projectionRisk.options[1].textContent = "Mean impact — required";
    elements.projectionRisk.options[2].textContent = "Unavailable — no estimated uncertainty";
    elements.projectionRiskHelp.textContent = "Native V4 Impact supplies mean-only historical conditional-lineup estimates. It has no player uncertainty estimate, so reserve and upside treatments are unavailable. This does not validate hypothetical lineups or game outcomes.";
  } else if (swishiq) {
    elements.projectionRiskLabel.textContent = "Impact uncertainty treatment";
    elements.projectionRisk.options[0].textContent = "Reliable impact — uncertainty reserve";
    elements.projectionRisk.options[1].textContent = "Mean impact — no reserve";
    elements.projectionRisk.options[2].textContent = "Upside — optimistic uncertainty allowance";
    elements.projectionRiskHelp.textContent = "Balanced uses the impact estimate. Reliable subtracts a larger uncertainty reserve; Upside adds an optimistic allowance. These settings test sensitivity to player and lineup coverage; they are not calibrated intervals. Eligibility and hard minute limits stay fixed.";
  } else {
    elements.projectionRiskLabel.textContent = "Planning reserve";
    elements.projectionRisk.options[0].textContent = "More cautious estimates";
    elements.projectionRisk.options[1].textContent = "Balanced projection — recommended";
    elements.projectionRisk.options[2].textContent = "Expected rates — no extra downside reserve";
    elements.projectionRiskHelp.textContent = "Every planning reserve uses the same estimated rates. Reliable applies a larger downside reserve, Balanced a smaller one, and Upside none. Neither eligibility nor hard minute limits change.";
  }
}

function syncModelChoice() {
    syncChoiceButtonGroup($("#modelModeInput"));
    const swishiq = $("#modelModeInput").value === "swishiq-impact";
    const v3Package = v3PackageSourceSelected();
    syncProjectionRiskControl();
    syncSwishIQPriorityControls();
    $("#swishiqObjectiveField").hidden = !swishiq;
    elements.swishiqEvidenceModeField.hidden = !swishiq;
    elements.swishiqEvidenceModeHelp.hidden = !swishiq;
    $("#swishiqEvidenceStatus").hidden = !swishiq;
    $("#modelModeHelp").textContent = swishiq
      ? isCanonicalV4NativeImpactLoaded()
        ? "Native V4 Impact uses verified, exact-season mean estimates for historical conditional scoring with observed paired lineups. It does not use pooled seasons, manufacture player uncertainty, validate hypothetical-lineup rankings, or forecast games. Players without usable Impact evidence are excluded from the Impact solve rather than treated as average."
        : "SwishIQ Impact estimates player impact for the selected team-season when complete player data are available. It does not use pooled seasons. Players without impact values keep their box-score stats, but are not treated as average. Skill-priority presets are unavailable because they do not change the SwishIQ offense/defense objective."
      : v3Package
        ? "Historical uses NBA player-season stats. Box-score totals remain available without impact estimates. Advanced impact estimates require complete data for the selected team-season."
        : "Historical optimizes your skill priorities using NBA stats. Starting five and full rotation use sample-adjusted scoring; rotation also assigns minutes. Shooting frequency and accuracy are considered separately. The model never targets a fixed minute range.";
    elements.roleBalance.disabled = swishiq || elements.mode.value === "rotation";
    // Skill-priority presets are a historical objective, not a second hidden
    // score mixed into primary SwishIQ Impact. Keep their scope unambiguous.
    $("#presetGrid").hidden = swishiq;
    // This opponent assistant changes historical skill weights. Hiding it in
    // SwishIQ avoids presenting adjustments that cannot affect the O/D objective.
    $("#opponentSwishIQ").hidden = swishiq;
    if (swishiq) {
      elements.simpleModelSummaryCopy.textContent = "SwishIQ Impact ranks player-impact estimates using your offense/defense priorities, including custom mixes. Position rules and hard minute limits still apply. Historical production remains context and constraints, not a second objective.";
      elements.simpleModelSummaryNote.textContent = "Complete data for the selected team-season are required. This is an additive player-impact estimate, not a game forecast or predicted coaching rotation.";
    }
    const weightsPanel = document.querySelector(".weights-panel");
    if (weightsPanel) weightsPanel.hidden = swishiq;
  }

function bindRemainingEvents() {
  elements.simpleMode.addEventListener("click", () => {
    setExperienceMode("simple", { applyDefaults: true, invalidate: true, announce: true });
  });
  elements.detailedMode.addEventListener("click", () => {
    setExperienceMode("detailed", { applyDefaults: false, announce: true });
  });
  elements.playerTableBody.addEventListener("change", handlePlayerControl);
  elements.playerTableBody.addEventListener("input", handlePlayerControl);
  elements.playerTableBody.addEventListener("click", handlePlayerControl);
  elements.usageScenarioList.addEventListener("change", handlePlayerControl);
  elements.usageScenarioList.addEventListener("input", handlePlayerControl);
  document.querySelectorAll("[data-player-sort]").forEach((button) => {
    button.addEventListener("click", () => {
      const key = button.dataset.playerSort;
      if (!key) return;
      if (state.playerSort.key === key) {
        state.playerSort.direction = state.playerSort.direction === "asc" ? "desc" : "asc";
      } else {
        state.playerSort = {
          key,
          direction: PLAYER_SORT_DEFAULTS[key] || "asc",
        };
      }
      renderPlayerTable();
    });
  });
  elements.activeSelectionTray.addEventListener("click", handleActiveSelectionRemoval);
  elements.resultContent.addEventListener("change", (event) => {
    const select = event.target.closest('[data-action="lineup-dna-replacement-choice"]');
    if (select) syncLineupDnaReplacementChoice(select);
  });
  elements.resultContent.addEventListener("click", (event) => {
    const detailedButton = event.target.closest('[data-action="show-detailed"]');
    if (detailedButton) {
      const analysis = elements.resultContent.querySelector(".full-analysis");
      if (analysis) {
        // Open the report calculated from the current Simple assumptions in
        // place. Switching the entire page to Detailed would restore a prior
        // advanced-settings snapshot and immediately mark this exact result as
        // stale—the opposite of what someone asking "why?" expects.
        analysis.classList.add("is-simple-open");
        analysis.open = true;
        detailedButton.hidden = true;
        const requestedTarget = detailedButton.dataset.target
          ? document.getElementById(detailedButton.dataset.target)
          : null;
        (requestedTarget || analysis).scrollIntoView({ behavior: motionBehavior(), block: "start" });
        showToast("Full result details opened. Your model settings did not change.");
        requestAnimationFrame(() => (requestedTarget || analysis.querySelector("summary"))?.focus({ preventScroll: true }));
      }
      return;
    }
    const button = event.target.closest('[data-action="exact-replacement"], [data-action="lineup-dna-replacement"]');
    if (!button || button.disabled) return;
    runExactReplacement(button.dataset.playerId).catch(() => {
      showToast("The replacement test could not run. Review the selected stats and current rules, then try again.");
    });
  });
  elements.watchlistContent.addEventListener("click", (event) => {
    const button = event.target.closest('[data-action="watch"]');
    if (!button) return;
    const shouldRestoreFocus = document.activeElement === button;
    const id = button.dataset.playerId;
    state.watchlistIds.delete(id);
    state.watchlistSnapshots.delete(id);
    saveWatchlist();
    renderWatchlist();
    renderPlayerTable();
    if (shouldRestoreFocus) {
      const nextControl = elements.watchlistContent.querySelector('[data-action="watch"]');
      (nextControl || elements.watchlistTab).focus({ preventScroll: true });
    }
  });
  elements.playerSearch.addEventListener("input", () => renderPlayerTable());
  [elements.minGames, elements.minMinutes].forEach((input) => input.addEventListener("input", () => {
    // Keep the explanation factual when Detailed mode preserves a custom value
    // or a visitor edits either field. Recommended defaults remain visible as
    // guidance, but are never described as though they were already active.
    syncSampleFilterHelp();
    renderPlayerTable();
    markScenarioChanged();
  }));
  [
    elements.size,
    elements.alternatives,
    elements.minGuards,
    elements.minForwards,
    elements.minCenters,
  ].forEach((input) => input.addEventListener("input", () => {
    updateRunSummary();
    markScenarioChanged();
  }));
  [
    elements.minPoints,
    elements.minRebounds,
    elements.minAssists,
    elements.minSteals,
    elements.minBlocks,
    elements.maxTurnovers,
    elements.rotationMin,
    elements.rotationMax,
  ].forEach((input) => input.addEventListener("input", markScenarioChanged));
  elements.resetScenario.addEventListener("click", resetScenario);
  elements.copyResult.addEventListener("click", copyResult);
  elements.shareResult.addEventListener("click", shareVerifiedResult);
  elements.shareScenario.addEventListener("click", copyScenarioLink);
  elements.downloadResult.addEventListener("click", downloadResult);
  elements.printReport.addEventListener("click", printSwishIQReport);
  elements.loadLiveData.addEventListener("click", async () => {
    try {
      if (!elements.liveTeam.value || !elements.liveSeason.value) await populateLiveDataControls();
      await loadSelectedModelDataset({ force: true });
    } catch (error) {
      showToast("Team stats could not be loaded. Try again or choose another season.");
      setLiveDataStatus("The selected team-season could not be loaded. Try again, or choose another stats option.", "warning");
    }
  });
  elements.dataSource?.addEventListener("change", async () => {
    const retiredImportedWasRequested = elements.dataSource.value === IMPORTED_SOURCE_VALUE;
    const preferredPhase = retiredImportedWasRequested
      ? DEFAULT_SEASON_PHASE
      : elements.liveSeasonPhase.value || DEFAULT_SEASON_PHASE;
    if (retiredImportedWasRequested) normalizeRetiredImportedSource({ clearSelections: true });
    state.dataSource = elements.dataSource.value;
    invalidateDatasetLoad();
    // Incrementing the generation lets a rapid source switch invalidate an
    // older source request before its response can repopulate the controls.
    state.liveControlsGeneration += 1;
    state.liveTeamOptionsGeneration += 1;
    state.lineupPhaseCoverageGeneration += 1;
    state.swishIqSeasonLineupCoverage = null;
    markResultStaleForDatasetSelection();
    state.swishiqEvidence = null;
    state.swishIqPackage = null;
    state.swishIqProjectionStatus = "idle";
    if (!v3PackageSourceSelected() && $("#modelModeInput").value === "swishiq-impact") {
      $("#modelModeInput").value = "historical";
      syncModelChoice();
    }
    setLivePhaseOptions(state.dataSource, {
      phases: v3PackageSourceSelected() ? null : undefined,
      preferredPhase,
    });
    try {
      await populateLiveDataControls({ preferredPhase });
      if (retiredImportedWasRequested) {
        setLiveDataStatus(RETIRED_IMPORTED_SOURCE_MESSAGE, "warning");
        showToast(RETIRED_IMPORTED_SOURCE_MESSAGE);
      } else {
        setLiveDataStatus("NBA team and season choices are ready. Player stats and impact estimates load when selected.");
      }
    } catch (error) {
      setLiveDataStatus("Team and season choices are unavailable right now. Try again.", "error");
      showToast("Team and season choices are unavailable right now. Try again.");
    }
  });
  const handleSeasonOrPhaseChange = async (event) => {
    const seasonChanged = event?.currentTarget === elements.liveSeason;
    invalidateDatasetLoad();
    // The selector value changes synchronously, while the team list refreshes
    // asynchronously. Stale the old result before the network request so it
    // cannot be copied, downloaded, printed, or shared in that short window.
    markResultStaleForDatasetSelection();
    state.swishiqEvidence = null;
    state.swishIqPackage = null;
    state.swishIqProjectionStatus = "idle";
    syncSwishIqAvailabilityStatus();
    updateRunSummary();
    clearOpponentSwishIQ("Apply the updated team-season before building an opponent game plan.");
    if (seasonChanged && v3PackageSourceSelected()) {
      const hasSupportedPhase = await refreshV3LineupPhaseCoverage();
      if (!hasSupportedPhase) return;
    }
    await refreshLiveTeamOptions();
  };
  elements.liveSeason.addEventListener("change", handleSeasonOrPhaseChange);
  elements.liveSeasonPhase.addEventListener("change", handleSeasonOrPhaseChange);
  elements.liveTeam.addEventListener("change", () => {
    invalidateDatasetLoad();
    setCourtContextTeam(elements.liveTeam.value);
    if (v3PackageSourceSelected() && !setV3PhaseOptionsForSelectedTeam()) {
      setLiveDataStatus(
        `Complete player stats are unavailable for ${selectedLiveTeamName()} ${nbaSeasonLabel(elements.liveSeason.value)}. Choose another team or season.`,
        "warning",
      );
    }
    state.swishiqEvidence = null;
    state.swishIqPackage = null;
    state.swishIqProjectionStatus = "idle";
    syncSwishIqAvailabilityStatus();
    updateLiveSelectionState();
    updateRunSummary();
    clearOpponentSwishIQ("Apply this team as the player pool before building an opponent game plan.");
    populateOpponentTeamOptions();
  });
  elements.loadOpponent.addEventListener("click", loadOpponentSwishIQ);
  elements.opponentTeam.addEventListener("change", () => {
    if (state.opponentDataset?.source?.team !== elements.opponentTeam.value) {
      state.opponentDataset = null;
      state.opponentStrategy = null;
      state.opponentWeightUndo = null;
      elements.opponentSwishIQSummary.hidden = true;
      elements.opponentSwishIQSummary.replaceChildren();
      setOpponentSwishIQStatus(`Build a game plan for ${teamNameForCode(elements.opponentTeam.value)} to view historical strengths and priorities.`);
    }
  });
  elements.importCsv.addEventListener("click", () => elements.csvFile.click());
  elements.csvFile.addEventListener("change", async () => {
    const [file] = elements.csvFile.files;
    if (!file) return;
    try {
      await importCsvFile(file);
    } catch (error) {
      showToast(error instanceof Error ? `Couldn't import this CSV: ${error.message}` : "This CSV could not be imported.");
    } finally {
      elements.csvFile.value = "";
    }
  });
  elements.resetDataset.addEventListener("click", () => {
    loadFixture({ notice: "The original course-project snapshot was restored." })
      .then(() => setLiveDataStatus("Using the course-project demo. Load a team above to return to NBA stats."))
      .catch((error) => showToast(error.message));
  });
  elements.exportDataset.addEventListener("click", exportDataset);
  elements.downloadTemplate.addEventListener("click", downloadTemplate);
  elements.downloadWatchlist.addEventListener("click", downloadWatchlist);

  const tabs = $$(".tool-nav [role='tab']");
  $(".tool-nav").addEventListener("keydown", (event) => {
    const currentIndex = tabs.indexOf(event.target.closest("[role='tab']"));
    if (currentIndex < 0) return;
    let nextIndex = null;
    if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % tabs.length;
    if (event.key === "ArrowLeft") nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = tabs.length - 1;
    if (nextIndex === null) return;
    event.preventDefault();
    tabs[nextIndex].focus();
    switchView(tabs[nextIndex].dataset.viewTarget);
  });
}

function captureWorkflowForm() {
  const snapshot = state.detailedSettingsSnapshot;
  const snapshotFields = snapshot ? Object.fromEntries(Object.entries(snapshot.fields).map(([key, value]) => [elements[key]?.id, value]).filter(([key]) => key)) : null;
  return {
    source: state.loadedLiveSelection
      ? { kind: "live", source: state.loadedLiveSelection.source || "imported", team: state.loadedLiveSelection.team, season: Number(state.loadedLiveSelection.season), phase: state.loadedLiveSelection.seasonPhase }
      : { kind: state.datasetKind },
    fields: Object.fromEntries(Object.values(WORKFLOW_FIELDS).flat().map(id => [id, document.getElementById(id).value])),
    experienceMode: state.experienceMode, activePreset: state.activePreset,
    familyWeights: { ...state.familyWeights }, weights: { ...state.weights }, analyticsView: state.analyticsView,
    lockedIds: [...state.lockedIds], excludedIds: [...state.excludedIds],
    offensiveResponsibilities: { ...state.offensiveResponsibilities },
    detailedSettings: snapshot ? { ...snapshot, fields: snapshotFields } : null,
  };
}

function restoreWorkflowForm(draft) {
  const saved = draft?.form;
  if (!saved) return false;
  const source = saved.source;
  const matches = source.kind === "demo"
    ? state.datasetKind === "demo"
    : liveSelectionMatches(state.loadedLiveSelection, { team: source.team, season: source.season, seasonPhase: source.phase, source: source.source });
  if (!matches) { showToast("The saved roster could not be loaded. Your draft was not applied to a different team."); return false; }
  setExperienceMode(saved.experienceMode, { applyDefaults: false });
  elements.mode.value = saved.fields.modeInput === "rotation" ? "rotation" : "lineup";
  setMode(elements.mode.value);
  for (const [id, value] of Object.entries(saved.fields)) {
    const input = document.getElementById(id);
    if (!input || (input.tagName === "SELECT" && ![...input.options].some(option => option.value === value))) continue;
    input.value = value;
  }
  // Drafts created before production thresholds were retired may still carry
  // those field IDs. They remain in the DOM only for backward-compatible
  // module references and must never affect a restored run.
  [elements.minPoints, elements.minRebounds, elements.minAssists, elements.minSteals,
    elements.minBlocks, elements.maxTurnovers].forEach(input => { if (input) input.value = ""; });
  state.familyWeights = { ...state.familyWeights, ...saved.familyWeights };
  state.weights = { ...saved.weights };
  state.activePreset = saved.activePreset;
  state.analyticsView = saved.analyticsView;
  const ids = new Set(state.dataset.players.map(player => player.id));
  state.lockedIds = new Set(saved.lockedIds.filter(id => ids.has(id)));
  state.excludedIds = new Set(saved.excludedIds.filter(id => ids.has(id) && !state.lockedIds.has(id)));
  state.offensiveResponsibilities = Object.fromEntries(Object.entries(saved.offensiveResponsibilities).filter(([id]) => ids.has(id)));
  if (saved.detailedSettings) {
    const byId = Object.fromEntries(Object.entries(elements).filter(([, node]) => node?.id).map(([key, node]) => [node.id, key]));
    state.detailedSettingsSnapshot = { ...saved.detailedSettings, fields: Object.fromEntries(Object.entries(saved.detailedSettings.fields).map(([id, value]) => [byId[id], value]).filter(([key]) => key)) };
  }
  // The draft contains the model choice, not its proof. Initialization has
  // already loaded a fresh exact projection for that choice. Keep it only while
  // the ready proof still matches this exact loaded V3 team-season-phase.
  const freshExactImpactProofAvailable = Boolean(
    state.swishIqProjectionStatus === "ready"
    && state.swishiqEvidence
    && state.swishIqPackage
    && swishIqDatasetSourceMatchesEvidence()
    && liveDatasetMatchesControls()
    && swishIqAvailabilityForSelection().available,
  );
  if (!freshExactImpactProofAvailable) {
    state.swishiqEvidence = null;
    state.swishIqPackage = null;
    if (state.swishIqProjectionStatus === "ready") state.swishIqProjectionStatus = "unavailable";
  }
  syncModelChoice(); syncRotationModelControls(); syncRotationRoleCopy();
  renderPresetState(); renderWeightControls(); renderPlayerTable(); updateRunSummary();
  showToast("Your saved game plan is back. Review it before building.");
  return true;
}

function workflowValidation() {
  updateSearchScope();
  const invalidFields = [];
  for (const [step, ids] of Object.entries(WORKFLOW_FIELDS)) for (const id of ids) {
    const input = document.getElementById(id);
    if (!input || input.disabled || (elements.mode.value !== "rotation" && input.closest("#rotationSettings"))) continue;
    if (state.experienceMode === "simple" && input.closest(".detailed-only")) continue;
    const optional = ["minPointsInput", "minReboundsInput", "minAssistsInput", "minStealsInput", "minBlocksInput", "maxTurnoversInput"].includes(id);
    const validity = input.validity;
    if (validity.badInput || validity.rangeOverflow || validity.rangeUnderflow || validity.stepMismatch || (!optional && input.type === "number" && input.value === "")) {
      const label = input.closest("label")?.querySelector("span")?.textContent || "This value";
      invalidFields.push({ step, id, message: `${label}: enter a valid ${input.step === "1" ? "whole " : ""}number${input.min !== "" ? ` from ${input.min}` : ""}${input.max !== "" ? ` to ${input.max}` : ""}.` });
    }
  }
  const errors = validateWorkflow({
    // Roster identity and model capability are separate conditions. An exact
    // roster can match the visible selectors while SwishIQ proof is loading or
    // unavailable; its dedicated error below should describe that blocker.
    datasetReady: Boolean(state.dataset),
    datasetMatches: !state.loadedLiveSelection || liveDatasetMatchesControls(),
    loading: state.liveDataLoading,
    config: buildOptimizerConfig(), players: state.dataset ? optimizerPlayersForCurrentScenario() : [], invalidFields,
    detailed: state.experienceMode === "detailed",
  });
  const publicAvailability = $("#modelModeInput").value === "swishiq-impact"
    ? swishIqAvailabilityForSelection()
    : null;
  if ($("#modelModeInput").value === "swishiq-impact"
    && (!state.loadedLiveSelection || !state.swishiqEvidence || !state.swishIqPackage
      || !swishIqDatasetSourceMatchesEvidence() || !publicAvailability?.available)) {
    errors.push({
      step: "plan",
      field: "modelModeInput",
      message: publicAvailability?.reason
        || "SwishIQ Impact requires complete data for this team-season. No demo, historical, or pooled substitute is used.",
    });
  }
  if (!errors.length && !state.searchScopeCanRun) errors.push({ step: "rules", field: "minGamesInput", message: elements.searchScopeValue.textContent });
  return errors;
}

async function initialize() {
  workflowView = createWorkflowView({ state, form: elements.form, capture: captureWorkflowForm, validate: workflowValidation, reset: resetScenario, storage: draftStorage, draft: initialWorkflowDraft });
  const initialLoadGeneration = beginDatasetLoadIntent();
  pruneLiveDatasetCache();
  bindEvents();
  applyPreset("balanced", { invalidate: false });
  setMode("lineup", { preserveSize: true });
  setExperienceMode(state.experienceMode, { applyDefaults: false });
  const sharedScenario = state.pendingScenario;
  const draftSource = initialWorkflowDraft?.form.source;
  const shouldLoadInitialDataset = Boolean(sharedScenario || draftSource);
  const initialSelection = sharedScenario || (draftSource?.kind === "live" ? { team: draftSource.team, season: draftSource.season, phase: draftSource.phase } : null);
  if (isAllGamesSourceKind(draftSource?.source) && elements.dataSource) {
    elements.dataSource.value = ALL_GAMES_SOURCE_VALUE;
    state.dataSource = ALL_GAMES_SOURCE_VALUE;
  }
  applySharedScenarioControls(sharedScenario);
  if (state.experienceMode === "simple") applySimpleModelDefaults({ invalidate: false });
  // Local drafts contain no trusted evidence. Preselect their model before
  // loading so the exact package loader fetches fresh proof for a saved Impact
  // plan. An explicit shared scenario takes precedence over the local draft.
  const savedModelMode = initialWorkflowDraft?.form?.fields?.modelModeInput;
  if (!sharedScenario && savedModelMode === "swishiq-impact"
    && [...$("#modelModeInput").options].some(option => option.value === savedModelMode)) {
    $("#modelModeInput").value = savedModelMode;
  }
  try {
    await populateLiveDataControls({ sharedScenario: initialSelection });
    if (!datasetLoadIsCurrent(initialLoadGeneration)) return;
    if (draftSource?.kind === "demo") await loadFixture();
    else if (shouldLoadInitialDataset) {
      await loadSelectedModelDataset({ intentGeneration: initialLoadGeneration });
      if (!datasetLoadIsCurrent(initialLoadGeneration)) return;
    } else {
      showEmptyDatasetState();
    }
    workflowView.ready(sharedScenario ? false : restoreWorkflowForm(initialWorkflowDraft));
    await replaySharedScenarioAfterLoad(sharedScenario);
  } catch (error) {
    if (!datasetLoadIsCurrent(initialLoadGeneration)) return;
    const detail = error instanceof Error ? error.message : "Player data could not be loaded.";
    showEmptyDatasetState({
      tableMessage: `Player data could not be loaded. ${detail}`,
      statusMessage: detail,
      tone: "error",
    });
    workflowView.ready(sharedScenario ? false : restoreWorkflowForm(initialWorkflowDraft));
    showToast(detail);
  } finally {
    if (!state.workflow.ready) workflowView.ready();
    flushPendingScenarioWarnings();
  }
}

function showEmptyDatasetState({
  tableMessage = "Load a team and season to see player stats.",
  statusMessage = "Ready. Load a team and season to see the roster and stats.",
  tone = "",
} = {}) {
  elements.datasetName.textContent = "No team loaded";
  elements.datasetSeason.textContent = "-";
  elements.datasetTeam.textContent = "-";
  elements.datasetCount.textContent = "0";
  elements.datasetMedia.hidden = true;
  elements.teamLogo.hidden = true;
  elements.teamLogo.removeAttribute("src");
  elements.teamLogoFallback.textContent = "NBA";
  elements.teamLogoFallback.hidden = false;

  elements.playerTableBody.replaceChildren();
  const row = document.createElement("tr");
  createCell(row, tableMessage, "loading-cell").colSpan = 13;
  elements.playerTableBody.append(row);
  elements.poolSummary.textContent = "Load a team and season to see the player pool.";
  setSearchScope("Load a team and season to see eligible groups.", "", false);
  setSolverStatus("Load player data before building a lineup.");
  setLiveDataStatus(statusMessage, tone);
  populateOpponentTeamOptions();
  setOptimizeButtons({ disabled: true });
}

initialize();
