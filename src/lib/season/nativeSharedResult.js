// Native shared-result viewer: the site's /tools/shared-result/ renderer,
// ported to a pure structured-data module. The envelope parsing, summary
// formatting and package-pin proof checks are ported verbatim from the
// reviewed renderer; the security-critical pieces (signature verification,
// trusted-key allowlist, V4 projection) run the site's own release-pinned
// modules through the verified source relay — identical verdicts, no DOM.
import { loadNativeModule } from '@/components/native/nativeModules';
import { originalFetch } from '@/components/native/nativeTransport';

const V2_MODULE = 'engine/public-result-share-v2.js?v=20261001e&rev=daily-v4-rank-share-summary-v2';
const V4_MODULE = 'engine/public-result-share-v4.js?v=20261001e&rev=daily-v4-rank-share-summary-v2';
const RUNTIME_ADAPTER = 'engine/canonical-v4-studio-runtime-adapter.js?v=20261002e&rev=canonical-v4-studio-runtime-adapter-v4-dependency-cache-closure';
const STATIC_PROJECTION = 'studio-runtime/modules/swishiq-static-projection.js?v=20261010a&rev=swishiq-v3-helper-studio-runtime-v1';
const TRUSTED_KEYS = 'studio-runtime/modules/public-keys.js?v=20261010a&rev=phase9-empty-public-key-allowlist-v2-20260928a';

let modulesPromise = null;
function sharedResultModules() {
  if (!modulesPromise) {
    modulesPromise = Promise.all([
      loadNativeModule(V2_MODULE),
      loadNativeModule(V4_MODULE),
      loadNativeModule(RUNTIME_ADAPTER),
      loadNativeModule(STATIC_PROJECTION),
      loadNativeModule(TRUSTED_KEYS),
    ]).then(([v2, v4, adapter, projection, keys]) => ({ v2, v4, adapter, projection, keys }));
    modulesPromise.catch(() => { modulesPromise = null; });
  }
  return modulesPromise;
}

const MAX_LOCATION_CHARS = 16_384 * 3 + 1_024;

const METRIC_LABELS = Object.freeze({
  points: 'Points',
  rebounds: 'Rebounds',
  assists: 'Assists',
  steals: 'Steals',
  blocks: 'Blocks',
  turnovers: 'Turnovers',
  games: 'Games',
  minutes: 'Minutes',
  pointsPerGame: 'Points per game',
  reboundsPerGame: 'Rebounds per game',
  assistsPerGame: 'Assists per game',
  stealsPerGame: 'Steals per game',
  blocksPerGame: 'Blocks per game',
  turnoversPerGame: 'Turnovers per game',
  minutesPerGame: 'Minutes per game',
  fieldGoalPercentage: 'Field-goal percentage',
  threePointPercentage: 'Three-point percentage',
  freeThrowPercentage: 'Free-throw percentage',
  trueShootingPercentage: 'True-shooting percentage',
  effectiveFieldGoalPercentage: 'Effective field-goal percentage',
  threePointAttemptShare: 'Three-point attempt share',
  involvementPer36: 'Involvement per 36 minutes',
});
const TOOL_LABELS = Object.freeze({
  'lineup-lab': 'Lineup Lab',
  'fix-the-five': 'Fix the Five',
  'draft-night': 'Draft Night',
  'swishiq-studio': 'SwishIQ Studio',
  'nba-analytics-explorer': 'NBA Analytics Explorer',
  'exact-lineup-studies': 'Exact Lineup Studies',
  'pair-fit-lab': 'Pair Fit Lab',
  'position-lens': 'Position Lens',
});
const SCENARIO_LABELS = Object.freeze({
  lineup: 'Lineup study',
  rotation: 'Rotation study',
  'fix-the-five': 'Fix the Five result',
  'fix-the-five-run': 'Fix the Five run',
  'draft-night': 'Draft Night result',
  game: 'Game simulation',
  season: 'Season simulation',
  composite: 'Composite study',
  career: 'Career study',
});
const STATUS_LABELS = Object.freeze({
  complete: 'Complete',
  cancelled: 'Cancelled',
  'invalid-input': 'Incomplete input',
  infeasible: 'No feasible result',
  unavailable: 'Unavailable',
});
const UNIT_LABELS = Object.freeze({
  'assigned-minutes-estimate': 'Assigned minutes estimate',
  'combined-player-profile': 'Combined profile metrics',
  points: 'Points',
  'points-per-100-possessions': 'Points per 100 possessions',
  'per-game': 'Per game',
  'per-36-minutes': 'Per 36 minutes',
  fraction: 'Fraction',
  percent: 'Percent',
});
const PHASE_LABELS = Object.freeze({
  regular: 'Regular season',
  in_season_tournament: 'In-season tournament',
  play_in: 'Play-in',
  playoffs: 'Playoffs',
});
const TOOL_SCENARIO_DISCLOSURES = Object.freeze({
  'lineup-lab:lineup': 'Lineup Lab: only aggregate solver fields are shown; player and roster selections are omitted.',
  'lineup-lab:rotation': 'Lineup Lab: only the aggregate assigned-minutes estimate is shown; player selections are omitted.',
  'exact-lineup-studies:lineup': 'Exact Lineup Studies: only aggregate solver fields are shown; lineup identities are omitted.',
  'pair-fit-lab:lineup': 'Pair Fit Lab: only aggregate fit fields are shown; player-pair identities are omitted.',
  'fix-the-five:fix-the-five': 'Fix the Five: aggregate board results only; player picks are omitted.',
  'fix-the-five:fix-the-five-run': 'Fix the Five: the five-round Game Points total only; player choices and per-round details are omitted.',
  'draft-night:draft-night': 'Draft Night: aggregate board results only; player picks are omitted.',
  'swishiq-studio:game': 'Game Lab: this is a conditional simulation, not a forecast or odds. Matchup selections and settings are omitted.',
  'swishiq-studio:season': 'Season Lab: this share contains completion status only; no rates or simulation probabilities are included.',
  'swishiq-studio:composite': 'Composite Forge: synthetic modeled output, not observed player statistics or a calibrated forecast.',
  'swishiq-studio:career': 'Career study: the displayed fields are supplied by the share creator.',
  'nba-analytics-explorer:career': 'Career study: the displayed fields are supplied by the share creator.',
  'nba-analytics-explorer:composite': 'NBA Analytics Explorer: aggregate fields only; supporting inputs are not included.',
  'position-lens:composite': 'Position Lens: aggregate profile fields only; player identities and comparison selections are omitted.',
});
const SIGNATURE_DISCLOSURE = 'The outcome values were supplied by the share creator and were not recalculated.';

export function sharedResultStatusMessage(reason) {
  switch (reason) {
    case 'missing-envelope': return 'This link does not contain a usable share. Nothing is displayed.';
    case 'envelope-too-large': return 'This share is too large to display. Details are hidden.';
    case 'missing-key-allowlist': return 'This shared result is unavailable right now. Details are hidden.';
    case 'unknown-key-id':
    case 'invalid-public-key': return 'This shared result is unavailable. Details are hidden.';
    case 'expired': return 'This share has expired. Details are hidden.';
    case 'stale-package-pin': return 'This share is out of date. Details are hidden.';
    case 'package-proof-unavailable': return 'This shared result is unavailable right now. Details are hidden.';
    case 'malformed-envelope':
    case 'ambiguous-envelope':
    case 'invalid-envelope-shape': return 'This share link is incomplete or invalid. Details are hidden.';
    default: return 'This shared result is unavailable. Details are hidden.';
  }
}

function isPlainRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

// Deterministic JSON: sorted keys, so structural equality is string equality.
function canonicalize(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(',')}}`;
}

function parseJsonText(text) {
  if (typeof text !== 'string' || !text.trim()) return { ok: false, reason: 'malformed-envelope' };
  let source = text.trim();
  if (!source.startsWith('{')) {
    if (!/^[A-Za-z0-9_-]+$/.test(source) || source.length % 4 === 1) return { ok: false, reason: 'malformed-envelope' };
    try {
      const padded = source.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - source.length % 4) % 4);
      const binary = atob(padded);
      const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
      source = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
      return { ok: false, reason: 'malformed-envelope' };
    }
  }
  if (new TextEncoder().encode(source).byteLength > 16_384) return { ok: false, reason: 'envelope-too-large' };
  try {
    const envelope = JSON.parse(source);
    if (!isPlainRecord(envelope)) return { ok: false, reason: 'malformed-envelope' };
    return { ok: true, envelope };
  } catch {
    return { ok: false, reason: 'malformed-envelope' };
  }
}

function collectNamedValues(params, values) {
  for (const key of ['envelope', 'share']) {
    for (const value of params.getAll(key)) values.push(value);
  }
}

function parsePublicResultShareLocation({ search = '', hash = '' } = {}) {
  if (search.length + hash.length > MAX_LOCATION_CHARS) return { ok: false, reason: 'envelope-too-large' };
  const values = [];
  try {
    collectNamedValues(new URLSearchParams(search), values);
    const fragment = hash.startsWith('#') ? hash.slice(1) : hash;
    if (fragment) {
      const fragmentParams = new URLSearchParams(fragment);
      const named = [];
      collectNamedValues(fragmentParams, named);
      if (named.length) values.push(...named);
      else values.push(decodeURIComponent(fragment));
    }
  } catch {
    return { ok: false, reason: 'malformed-envelope' };
  }
  if (!values.length) return { ok: false, reason: 'missing-envelope' };
  if (values.length !== 1) return { ok: false, reason: 'ambiguous-envelope' };
  if (values[0].length > MAX_LOCATION_CHARS) return { ok: false, reason: 'envelope-too-large' };
  return parseJsonText(values[0]);
}

export function publicResultPackagePinMatchesProof(packagePin, proof) {
  if (!isPlainRecord(packagePin) || !isPlainRecord(proof)
    || !isPlainRecord(proof.registry) || !isPlainRecord(proof.package)) return false;
  if (Object.hasOwn(packagePin, 'sourceManifestSetSha256')) return false;
  const current = proof.package;
  const currentScope = current.scope;
  const scope = packagePin.scope;
  if (!isPlainRecord(scope) || !isPlainRecord(currentScope)) return false;
  for (const key of [
    'packageId', 'packageVersion', 'packageManifestSha256', 'sourceLockSha256',
    'modelId', 'metricsVersion',
  ]) {
    if (packagePin[key] !== current[key]) return false;
  }
  if (packagePin.registryVersion !== proof.registry.registryVersion
    || packagePin.registryRevisionSha256 !== proof.registry.registryRevisionSha256) return false;
  if (packagePin.normalizer !== undefined && packagePin.normalizer !== current.normalizer) return false;
  if (packagePin.projectionContentSha256 !== undefined
    && packagePin.projectionContentSha256 !== current.projectionContentSha256) return false;
  return scope.kind === 'exact-season'
    && currentScope.kind === 'exact-season'
    && scope.seasonStartYear === currentScope.seasonStartYear
    && scope.seasonEndYear === currentScope.seasonEndYear
    && currentScope.seasonStartYears?.length === 1
    && currentScope.seasonStartYears[0] === scope.seasonStartYear
    && Array.isArray(currentScope.phases)
    && currentScope.phases.includes(scope.phase);
}

function numberText(value) {
  if (value === null) return 'Unavailable';
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 }).format(value);
}

export function publicResultShareSummary(payload, v4Format) {
  if (!isPlainRecord(payload) || !isPlainRecord(payload.packagePin) || !isPlainRecord(payload.result)) return null;
  const pin = payload.packagePin;
  const toolLabel = TOOL_LABELS[payload.tool];
  const phaseLabel = PHASE_LABELS[pin.scope?.phase];
  const scenarioLabel = SCENARIO_LABELS[payload.scenarioKind];
  const seasonStart = pin.scope?.seasonStartYear;
  const seasonEnd = pin.scope?.seasonEndYear;
  if (!toolLabel || !phaseLabel || !scenarioLabel
    || !Number.isInteger(seasonStart) || !Number.isInteger(seasonEnd)
    || seasonEnd !== seasonStart + 1) return null;

  const facts = [{ label: 'Result', value: STATUS_LABELS[payload.result.status] || 'Submitted result' }];
  const native = payload.result.nativeOutcome;
  if (isPlainRecord(native) && isPlainRecord(native.metrics)) {
    const unit = UNIT_LABELS[native.unit];
    if (unit) facts.push({ label: 'Metric unit', value: unit });
    for (const key of Object.keys(native.metrics).sort()) {
      if (Object.hasOwn(METRIC_LABELS, key)) facts.push({ label: METRIC_LABELS[key], value: numberText(native.metrics[key]) });
    }
  }
  const decision = payload.result.decision;
  if (isPlainRecord(decision) && Number.isInteger(decision.rank) && Number.isInteger(decision.optionCount)) {
    const isV4DailySourceRank = payload.format === v4Format && ['draft-night', 'fix-the-five'].includes(payload.tool);
    facts.push({
      label: isV4DailySourceRank ? 'Descriptive source-impact rank' : 'Aggregate rank',
      value: `${decision.rank} of ${decision.optionCount} options`,
    });
  }
  const gamePoints = payload.result.gamePoints;
  if (isPlainRecord(gamePoints) && Number.isInteger(gamePoints.total) && Number.isInteger(gamePoints.max)) {
    facts.push({ label: 'Game points', value: `${gamePoints.total} of ${gamePoints.max}` });
  }
  if (payload.scenarioKind === 'fix-the-five-run') {
    const run = payload.result.runSummary;
    if (payload.format === v4Format) {
      const rankCounts = run?.rankCounts;
      const expectedMeanRank = Array.isArray(rankCounts) && rankCounts.length === 3
        ? (rankCounts[0] + 2 * rankCounts[1] + 3 * rankCounts[2]) / 5
        : NaN;
      if (payload.result.status !== 'complete'
        || Object.hasOwn(payload.result, 'nativeOutcome')
        || Object.hasOwn(payload.result, 'decision')
        || Object.hasOwn(payload.result, 'gamePoints')
        || !isPlainRecord(run) || Object.keys(run).length !== 5
        || run.format !== 'swishiq-fix-the-five-v4-run-summary-v1'
        || run.roundsCompleted !== 5 || run.roundsTotal !== 5
        || !Array.isArray(rankCounts) || rankCounts.length !== 3
        || rankCounts.some(count => !Number.isSafeInteger(count) || count < 0)
        || rankCounts.reduce((sum, count) => sum + count, 0) !== 5
        || !Number.isFinite(run.meanRank) || run.meanRank < 1 || run.meanRank > 3
        || Math.abs(run.meanRank - expectedMeanRank) > 1e-9) return null;
      facts.push({ label: 'Challenges completed', value: `${run.roundsCompleted} of ${run.roundsTotal}` });
      facts.push({
        label: 'Descriptive source-impact ranks',
        value: `rank 1: ${rankCounts[0]}, rank 2: ${rankCounts[1]}, rank 3: ${rankCounts[2]}`,
      });
      facts.push({ label: 'Mean descriptive rank', value: numberText(run.meanRank) });
    } else {
      if (payload.result.status !== 'complete'
        || Object.hasOwn(payload.result, 'nativeOutcome')
        || Object.hasOwn(payload.result, 'decision')
        || Object.hasOwn(payload.result, 'gamePoints')
        || !isPlainRecord(run) || run.format !== 'swishiq-fix-the-five-run-v1'
        || run.roundsCompleted !== 5 || run.roundsTotal !== 5
        || !isPlainRecord(run.gamePoints) || !Number.isInteger(run.gamePoints.total)
        || !['swishiq-game-points-v1', 'swishiq-game-points-v2'].includes(run.gamePoints.ruleVersion)
        || !Number.isInteger(run.gamePoints.max) || run.gamePoints.total < 0
        || run.gamePoints.total > run.gamePoints.max
        || (run.gamePoints.ruleVersion === 'swishiq-game-points-v1'
          ? run.gamePoints.max < 20 || run.gamePoints.max > 25
          : run.gamePoints.max !== 50)) return null;
      facts.push({ label: 'Challenges completed', value: `${run.roundsCompleted} of ${run.roundsTotal}` });
      facts.push({ label: 'Game points', value: `${run.gamePoints.total} of ${run.gamePoints.max}` });
    }
  } else if (Object.hasOwn(payload.result, 'runSummary')) {
    return null;
  }
  return Object.freeze({
    title: `${toolLabel} · ${scenarioLabel}`,
    scope: `${seasonStart}–${String(seasonEnd).slice(-2)} · ${phaseLabel}`,
    disclosure: payload.format === v4Format && ['draft-night', 'fix-the-five'].includes(payload.tool)
      ? `${SIGNATURE_DISCLOSURE} ${payload.tool === 'fix-the-five' && payload.scenarioKind === 'fix-the-five-run' ? 'Fix the Five V4 run' : `${toolLabel} V4`}: descriptive exact-season source-impact ranks only; not Game Points, not a proven team split, and not a game-outcome prediction.`
      : `${SIGNATURE_DISCLOSURE} ${TOOL_SCENARIO_DISCLOSURES[`${payload.tool}:${payload.scenarioKind}`] || 'Only aggregate fields are shown.'}`,
    facts: Object.freeze(facts.map(fact => Object.freeze(fact))),
  });
}

// Verify and summarize the share in the current URL: same verdict chain as
// the site's renderer — envelope parse, trusted-key signature verification,
// then the package-pin proof check against the published registry.
export async function renderNativeSharedResult({ search = '', hash = '', now = Date.now() } = {}) {
  let modules;
  try {
    modules = await sharedResultModules();
  } catch {
    return { state: 'package-proof-unavailable' };
  }
  const parsed = parsePublicResultShareLocation({ search, hash });
  if (!parsed.ok) return { state: parsed.reason };

  let keyAllowlist;
  try {
    keyAllowlist = await modules.keys.importPublicResultShareTrustedKeys({});
  } catch {
    return { state: 'missing-key-allowlist' };
  }
  if (!isPlainRecord(keyAllowlist) || Object.keys(keyAllowlist).length === 0) {
    return { state: 'missing-key-allowlist' };
  }

  const verified = await modules.v2.verifyPublicResultShareEnvelopeV2(parsed.envelope, {
    trustedPublicKeys: keyAllowlist,
    cryptoImpl: globalThis.crypto,
    now,
  });
  if (!verified?.ok) return { state: verified?.reason || 'invalid-envelope' };

  if (verified.payload.format === modules.v4.PUBLIC_RESULT_SHARE_V4_FORMAT) {
    try {
      const scope = verified.payload.packagePin.scope;
      if (scope.kind !== 'exact-season' || !Number.isSafeInteger(scope.seasonStartYear)
        || scope.seasonEndYear !== scope.seasonStartYear + 1
        || !Array.isArray(verified.payload.capabilityIds) || !verified.payload.capabilityIds.length) {
        return { state: 'stale-package-pin' };
      }
      const verifiedCapabilities = await Promise.all(verified.payload.capabilityIds.map(capabilityId =>
        modules.adapter.loadCanonicalV4StudioCapabilityData({
          releasePin: modules.adapter.CANONICAL_V4_STUDIO_RUNTIME_RELEASE_PIN,
          scope: { kind: 'exact-season', seasonStartYears: [scope.seasonStartYear], phases: [scope.phase] },
          capabilityId,
          acceptPooled: false,
          fetchImpl: originalFetch,
        })));
      const currentPayload = modules.v4.projectPublicResultShareV4({
        tool: verified.payload.tool,
        scenarioKind: verified.payload.scenarioKind,
        requiredCapabilityIds: verified.payload.capabilityIds,
        verifiedCapabilities,
        packagePin: { scope },
        result: verified.payload.result,
        ...(verified.payload.board ? { board: verified.payload.board } : {}),
      });
      if (canonicalize(currentPayload) !== canonicalize(verified.payload)) {
        return { state: 'stale-package-pin' };
      }
    } catch {
      return { state: 'package-proof-unavailable' };
    }
  } else {
    let packageProof;
    try {
      packageProof = await modules.projection.loadSwishIqExactPackageProof({
        seasonEndYear: verified.payload.packagePin.scope.seasonEndYear,
        seasonPhase: verified.payload.packagePin.scope.phase,
        requiredCapabilities: [],
        registryUrl: modules.projection.SWISHIQ_PUBLIC_REGISTRY_PATH,
        fetchImpl: originalFetch,
      });
    } catch {
      return { state: 'package-proof-unavailable' };
    }
    if (!publicResultPackagePinMatchesProof(verified.payload.packagePin, packageProof)) {
      return { state: 'stale-package-pin' };
    }
  }

  const summary = publicResultShareSummary(verified.payload, modules.v4.PUBLIC_RESULT_SHARE_V4_FORMAT);
  if (!summary) return { state: 'invalid-payload' };
  return { state: 'verified', summary };
}