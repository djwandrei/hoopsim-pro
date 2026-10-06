import {
  SWISHIQ_PUBLIC_REGISTRY_PATH,
  SWISHIQ_PUBLIC_REGISTRY_VERSION,
  SWISHIQ_PUBLIC_V3_METRICS_VERSIONS,
  loadSwishIqExactPackageProof,
  loadSwishIqPublishedPackageProof,
  loadSwishIqPublicPart,
  registryRevisionSha256,
} from '../swishiq-static-projection.js?v=20261001&rev=swishiq-v3-helper-typed-v4-cutover-gate-v1';
import {
  loadSwishIqPlayerMetadata,
  metadataForPlayer,
} from './player-metadata.js?v=20260927s&rev=player-metadata-source-v2';
import {
  loadSwishIqPublicPlayerContext,
  loadSwishIqPublicPlayerSeasonStats,
  mergePublicStatsIntoPlayerSeason,
  playerContextForPlayer,
  profileForPlayerContext,
  publicStatsForPlayerSeason,
} from './player-context.js?v=20261001e&rev=player-context-v4-source-gate-v1';
import {
  blueprintSeasonTypeLabel,
  createBlueprintSeasonTypeControl,
  createPlayerBlueprintTabs,
  PLAYER_BLUEPRINT_SEASON_PHASES,
  renderTrophyCase,
  renderPlayerContext,
} from './player-blueprint-components.js?v=20261001h&rev=player-blueprint-components-v14-cache-closure-v1';
import {
  approvedHeadshotFor,
  filterSelectorRecords,
  installSelectorSystem,
  normalizeSelectorText,
} from './selector-system.js?v=20260927s&rev=transparent-player-webp-v1';
import { palettes, paletteForTeam, themeFor } from '../basketball-palettes.js?v=20260925c-annotations3';
import { setCourtContextTeam } from '../basketball-theme.js?v=20260930f&rev=hero-retro-v7-stable-picker-mount-20260928l';
import {
  CANONICAL_V4_STUDIO_RUNTIME_RELEASE_PIN,
} from './engine/canonical-v4-studio-runtime-adapter.js?v=20261002e&rev=canonical-v4-studio-runtime-adapter-v4-dependency-cache-closure';
import { loadCanonicalV4PublicPackageProof } from './engine/canonical-v4-public-network-loader.js?v=20261002e&rev=canonical-v4-public-network-loader-v4-dependency-cache-closure';
import {
  listCanonicalV4PlayerBuilderExactChoices,
  loadCanonicalV4PlayerBuilderSeason,
} from './engine/canonical-v4-player-builder-adapter.js?v=20261002e&rev=v4-player-builder-exact-name-key-adapter-v4-dependency-cache-closure';
import { resolveCanonicalV4SiteConsumerSourcePolicy } from './engine/canonical-v4-site-consumer-policy.js?v=20261002e&rev=canonical-v4-site-consumer-policy-v2-dependency-cache-closure';

// Keep a public registry parameter for callers that inject a test registry or
// a cache-busted deployment URL. The default is the native static projection
// registry, resolved relative to its verifier module (not the Studio folder).
const SWISHIQ_STATIC_PROJECTION_MODULE_URL = new URL('../swishiq-static-projection.js', import.meta.url);
export const SWISHIQ_STUDIO_REGISTRY_URL = new URL(
  SWISHIQ_PUBLIC_REGISTRY_PATH,
  SWISHIQ_STATIC_PROJECTION_MODULE_URL,
).toString();
// Registry and package proof requests are public static reads, but a stalled
// request must not leave the Studio shell in its initial "Checking" state
// forever. Keep this deadline at the boot boundary so it covers both package
// proofs and the optional player metadata read.
export const SWISHIQ_STUDIO_BOOT_TIMEOUT_MS = 15_000;
const STUDIO_BOOT_TIMEOUT_MESSAGE = 'Studio took too long to load. Check your connection and try again.';
const STUDIO_PLAYER_ROSTER_TIMEOUT_MESSAGE = 'Player data is taking longer than expected. Use “Retry player data” to try again.';
const STUDIO_PLAYER_SEASONS_TIMEOUT_MESSAGE = 'Player season data is taking longer than expected. Use “Retry season data” to try again.';
const STUDIO_ROSTER_MEMBERSHIPS_TIMEOUT_MESSAGE = 'Team roster data is taking longer than expected. Use “Retry roster data” to try again.';
const STUDIO_PLAYER_METADATA_TIMEOUT_MESSAGE = 'Player details could not be loaded. Player snapshots remain available with initials.';

function studioBootTimeoutMs(value) {
  const timeout = Number(value);
  return Number.isFinite(timeout) && timeout > 0 ? timeout : SWISHIQ_STUDIO_BOOT_TIMEOUT_MS;
}

const PLAYER_REF = /^p_[a-f0-9]{32}$/;
const TEAM_CODE = /^[A-Z]{3}$/;
const POSITION_CODES = new Set(['G', 'F', 'C']);
const BLUEPRINT_CUSTOM_OPTION_LIMIT = 120;
const BLUEPRINT_ROSTER_PAGE_SIZE = 40;
export const BLUEPRINT_MAX_SELECTED_PLAYERS = 4;
const TEAM_LOGO_SLUGS = Object.freeze({
  atl: 'atlanta-hawks',
  bos: 'boston-celtics',
  bkn: 'brooklyn-nets',
  cha: 'charlotte-hornets',
  chi: 'chicago-bulls',
  cle: 'cleveland-cavaliers',
  dal: 'dallas-mavericks',
  den: 'denver-nuggets',
  det: 'detroit-pistons',
  gsw: 'golden-state-warriors',
  hou: 'houston-rockets',
  ind: 'indiana-pacers',
  lac: 'los-angeles-clippers',
  lal: 'los-angeles-lakers',
  mem: 'memphis-grizzlies',
  mia: 'miami-heat',
  mil: 'milwaukee-bucks',
  min: 'minnesota-timberwolves',
  nop: 'new-orleans-pelicans',
  nyk: 'new-york-knicks',
  okc: 'oklahoma-city-thunder',
  orl: 'orlando-magic',
  phi: 'philadelphia-76ers',
  phx: 'phoenix-suns',
  por: 'portland-trail-blazers',
  sac: 'sacramento-kings',
  sas: 'san-antonio-spurs',
  tor: 'toronto-raptors',
  uta: 'utah-jazz',
  was: 'washington-wizards',
});
// Supplemental opaque retro marks are preferred for the Studio treatment when
// one is available.  The standard current mark remains the fallback for the
// other teams and for any future team that is not represented in the folder.
const TEAM_RETRO_LOGO_SLUGS = Object.freeze({
  atl: 'atlanta-hawks',
  cha: 'charlotte-hornets',
  cle: 'cleveland-cavaliers',
  den: 'denver-nuggets',
  det: 'detroit-pistons',
  hou: 'houston-rockets',
  mem: 'memphis-grizzlies',
  min: 'minnesota-timberwolves',
  orl: 'orlando-magic',
  phx: 'phoenix-suns',
  sas: 'san-antonio-spurs',
  tor: 'toronto-raptors',
  uta: 'utah-jazz',
  was: 'washington-wizards',
});

function normalizedTeamId(teamId) {
  const supplied = String(teamId || '').trim().toLowerCase();
  if (!supplied) return '';
  const palette = paletteForTeam(supplied);
  return palette.id === 'djhc' && supplied !== 'djhc' ? '' : palette.id;
}

export function teamLogoUrl(teamId) {
  const id = normalizedTeamId(teamId);
  const retroSlug = TEAM_RETRO_LOGO_SLUGS[id];
  const currentSlug = TEAM_LOGO_SLUGS[id];
  if (retroSlug) return new URL(`../../assets/nba-logos/retro-opaque/${retroSlug}.png`, import.meta.url).toString();
  return currentSlug ? new URL(`../../assets/nba-logos/${currentSlug}.png`, import.meta.url).toString() : '';
}

function teamDisplayLabel(teamId) {
  const id = normalizedTeamId(teamId);
  if (!id) return String(teamId || '').trim() || 'All teams';
  const palette = paletteForTeam(id);
  return `${String(teamId).trim().toUpperCase()} · ${palette.team}`;
}
const BLUEPRINT_METRICS = Object.freeze([
  { key: 'pointsPerGame', label: 'PPG', title: 'Points', unit: 'per game', metricUnit: 'per-game', tier: 'hero' },
  { key: 'assistsPerGame', label: 'APG', title: 'Assists', unit: 'per game', metricUnit: 'per-game', tier: 'hero' },
  { key: 'reboundsPerGame', label: 'RPG', title: 'Rebounds', unit: 'per game', metricUnit: 'per-game', tier: 'hero' },
  { key: 'trueShootingPercentage', label: 'TS%', title: 'True shooting', unit: '%', metricUnit: 'fraction' },
  { key: 'fieldGoalPercentage', label: 'FG%', title: 'Field goal', unit: '%', metricUnit: 'fraction' },
  { key: 'threePointPercentage', label: '3P%', title: 'Three point', unit: '%', metricUnit: 'fraction' },
  { key: 'freeThrowPercentage', label: 'FT%', title: 'Free throw', unit: '%', metricUnit: 'fraction' },
  { key: 'stealsPerGame', label: 'STL', title: 'Steals', unit: 'per game', metricUnit: 'per-game' },
  { key: 'blocksPerGame', label: 'BLK', title: 'Blocks', unit: 'per game', metricUnit: 'per-game' },
  { key: 'turnoversPerGame', label: 'TOV', title: 'Turnovers', unit: 'per game', metricUnit: 'per-game' },
  { key: 'pointsPer36', label: 'PTS/36', title: 'Points per 36', unit: 'per 36 minutes', metricUnit: 'per-36-minutes' },
]);
const BLUEPRINT_SCOUT_ROUNDS = Object.freeze([
  { key: 'pointsPerGame', label: 'Scoring', unit: 'PPG' },
  { key: 'assistsPerGame', label: 'Playmaking', unit: 'APG' },
  { key: 'reboundsPerGame', label: 'Rebounding', unit: 'RPG' },
]);
const tabLabels = Object.freeze({
  blueprint: ['Player Blueprint', 'Review one player’s season.'],
  chemistry: ['Pair Profile', 'Compare two players’ full-season profiles.'],
  composite: ['Composite Forge', 'Build a player recipe from selected skills.'],
  game: ['Game Lab', 'Simulate matchups, series, and challenges with exact-season team data.'],
  season: ['Season Lab', 'Adjust rotations and strategy as the season unfolds.'],
  career: ['Career Lab', 'Review a player’s recorded career history.'],
  spin: ['Spin Room', 'Draw players from a seeded, position-based pool.'],
});
// Workbench modules are independent browser surfaces. Keep their model and
// data graphs out of the initial Studio load until the visitor opens one.
const WORKBENCH_MODULES = Object.freeze({
  chemistry: Object.freeze({
    path: './chemistry-lab.js?v=20261002i&rev=chemistry-lab-v24-v4-artifact-identities',
    exportName: 'startSwishIqChemistryLab',
    useRegistry: false,
  }),
  game: Object.freeze({
    path: './react-game-lab-bridge.js?v=20261005c&rev=react-studio-labs-bridge-v40-candidate10-game-lab',
    exportName: 'startSwishIqGameLab',
    useRegistry: true,
  }),
  season: Object.freeze({
    path: './react-season-lab-bridge.js?v=20261002g&rev=react-studio-labs-bridge-v37-season-observed-rate-output',
    exportName: 'startNativeSeasonLab',
    useRegistry: true,
  }),
  spin: Object.freeze({
    path: './spin-room-bridge.js?v=20261002g&rev=spin-room-v7-regular-scope-validation',
    exportName: 'startSwishIqSpinRoom',
    useRegistry: true,
  }),
  advanced: Object.freeze({
    path: './advanced-labs.js?v=20261002g&rev=advanced-labs-v39-v4-composite-observed-rows',
    exportName: 'startSwishIqAdvancedLabs',
    useRegistry: true,
  }),
});
const CAPABILITY_DISPLAY = Object.freeze([
  { key: 'swishiqStudio', label: 'Player Blueprint', description: 'Full-season player stats.', available: 'Ready' },
  { key: 'chemistry', label: 'Observed chemistry', description: 'Recorded exact-five and shared-floor results; descriptive only, not a causal estimate or forecast.', available: 'Ready' },
  { key: 'shotProfile', label: 'Shot profiles', description: 'Shot locations and shot-type mix with attempt coverage.', available: 'Ready' },
  { key: 'playType', label: 'Play-type context', description: 'Play-by-play situations on reconciled shots; full-possession action labels are unavailable.', available: 'Ready' },
  { key: 'compositeRecipe', label: 'Composite Forge', description: 'Selected skills and player examples.', available: 'Ready' },
  { key: 'challengePools', label: 'Daily games', description: 'Box-score challenges.', available: 'Ready' },
  { key: 'seasonSimulation', label: 'Season Lab', description: 'Choose season-specific team data within the tool.', unavailable: 'Select in Season Lab' },
  { key: 'careerHistory', label: 'Career Lab', description: 'Pooled 2017–26 history; forecasts unavailable.', available: 'History ready' },
]);
// The validated source covers nine exact seasons and one explicit regular-
// season career window.
const PUBLIC_SCOPE_LEDGER = Object.freeze({ exactTotal: 9, pooledTotal: 1 });

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function selectionKey(proof) {
  return [proof.package.packageId, proof.package.packageVersion, proof.request.phase].join('|');
}

function resolvedRegistryUrl(registryUrl) {
  return new URL(String(registryUrl || SWISHIQ_STUDIO_REGISTRY_URL), SWISHIQ_STATIC_PROJECTION_MODULE_URL).toString();
}

function registryResponse(value) {
  const source = JSON.stringify(value);
  return {
    ok: true,
    status: 200,
    text: async () => source,
  };
}

/**
 * Read the native registry once so its package IDs can be enumerated, then
 * delegate every package/index decision to the static projection proof APIs.
 * The manifest is used only for discovery; no package is trusted until the
 * verifier re-reads and hash-checks it. This also lets an empty registry fail
 * closed without probing invented seasons.
 */
async function readNativeRegistry({ registryUrl, fetchImpl }) {
  if (typeof fetchImpl !== 'function') throw new Error('This browser cannot load the native SwishIQ registry.');
  const url = resolvedRegistryUrl(registryUrl);
  let response;
  try {
    response = await fetchImpl(url, { cache: 'no-store' });
  } catch {
    throw new Error('The native SwishIQ registry could not be reached.');
  }
  if (!response?.ok) throw new Error('The native SwishIQ registry is not available for this selection yet.');
  let source;
  try {
    source = await response.text();
  } catch {
    throw new Error('The native SwishIQ registry could not be read safely.');
  }
  let registry;
  try {
    registry = JSON.parse(source);
  } catch {
    throw new Error('The native SwishIQ registry is not valid JSON.');
  }
  if (!isObject(registry)
    || registry.format !== 'djhc-swishiq-public-registry-v1'
    || registry.registryVersion !== SWISHIQ_PUBLIC_REGISTRY_VERSION
    || !Array.isArray(registry.packages)
    || typeof registry.registryRevisionSha256 !== 'string') {
    throw new Error('The native SwishIQ registry format is unsupported.');
  }
  if (await registryRevisionSha256(registry) !== registry.registryRevisionSha256) {
    throw new Error('The native SwishIQ registry hash did not verify.');
  }

  // The proof APIs fetch the registry themselves. Return a tiny cache wrapper
  // so the first manifest read is reused without weakening their verification
  // boundary or changing the caller-provided fetch implementation elsewhere.
  const cachedFetch = async (input, init) => {
    const candidate = new URL(String(input), SWISHIQ_STATIC_PROJECTION_MODULE_URL).toString();
    if (candidate === url) return registryResponse(registry);
    return fetchImpl(input, init);
  };
  return { registry, registryUrl: url, fetchImpl: cachedFetch };
}

function packageReference(entry, registry) {
  // Bind the package selection to the V3 reference contract used by the
  // published registry verifier. The model pins are validated before creating
  // this reference so a package cannot cross the V2/V3 boundary.
  if (entry?.modelId !== 'swishiq-v3'
    || entry?.normalizer !== 'swishiq-v3-canonical-normalizer'
    || !SWISHIQ_PUBLIC_V3_METRICS_VERSIONS.includes(entry?.metricsVersion)
    || !/^nba-swishiq-v3-\d{4}-\d{2}$/.test(String(entry?.packageId || ''))
    || !/^v3-\d{4}-\d{2}-[a-f0-9]{12}$/.test(String(entry?.packageVersion || ''))
    || !/^[a-f0-9]{64}$/.test(String(entry?.sourceLockSha256 || ''))) {
    throw new Error('Studio accepts only verified SwishIQ V3 package pins.');
  }
  return {
    format: 'djhc-swishiq-package-v3',
    packageId: entry.packageId,
    packageVersion: entry.packageVersion,
    packageManifestSha256: entry.packageManifestSha256,
    sourceLockSha256: entry.sourceLockSha256,
    registryVersion: registry.registryVersion,
    registryRevisionSha256: registry.registryRevisionSha256,
    projectionContentSha256: entry.projectionContentSha256,
    projectionIndexPath: entry.projectionIndexPath,
    modelId: entry.modelId,
    normalizer: entry.normalizer,
    metricsVersion: entry.metricsVersion,
    scope: entry.scope,
  };
}

/**
 * Return exact native season proofs plus the explicit pooled career proof.
 * Registry discovery never turns a pooled package into an exact selection and
 * never falls back to an alternate or pooled source.
 */
export async function loadSwishIqStudioPublishedPackages({
  fetchImpl = globalThis.fetch?.bind(globalThis),
  registryUrl = SWISHIQ_STUDIO_REGISTRY_URL,
} = {}) {
  const discovered = await readNativeRegistry({ registryUrl, fetchImpl });
  const exactEntries = discovered.registry.packages.filter(entry => (
    entry?.modelId === 'swishiq-v3'
    && entry?.scope?.kind === 'exact-season'
    && Array.isArray(entry.scope.phases)
    && entry.scope.phases.includes('regular')
  ));
  const pooledEntries = discovered.registry.packages.filter(entry => (
    entry?.modelId === 'swishiq-v3'
    && entry?.scope?.kind === 'pooled-window'
    && Array.isArray(entry.scope.phases)
    && entry.scope.phases.includes('regular')
    && entry.capabilities?.careerHistory?.status === 'available'
  ));
  if (discovered.registry.packages.length > 0 && exactEntries.length === 0 && pooledEntries.length === 0) {
    throw new Error('The native SwishIQ registry has no exact-season package for Studio.');
  }
  const exactProofs = await Promise.all(exactEntries.map(entry => loadSwishIqExactPackageProof({
    seasonEndYear: Number(entry.scope.seasonEndYear),
    seasonPhase: 'regular',
    requiredCapabilities: ['swishiqStudio'],
    packageRef: packageReference(entry, discovered.registry),
    registryUrl: discovered.registryUrl,
    fetchImpl: discovered.fetchImpl,
  })));
  let pooledCareer = null;
  if (pooledEntries.length > 1) {
    throw new Error('The native SwishIQ registry has more than one eligible pooled career package.');
  }
  if (pooledEntries.length === 1) {
    const entry = pooledEntries[0];
    pooledCareer = await loadSwishIqPublishedPackageProof({
      packageId: entry.packageId,
      packageVersion: entry.packageVersion,
      requiredCapabilities: ['careerHistory'],
      registryUrl: discovered.registryUrl,
      fetchImpl: discovered.fetchImpl,
    });
  }
  exactProofs.sort((left, right) => (
    Number(left?.request?.seasonEndYear || 0) - Number(right?.request?.seasonEndYear || 0)
    || String(left?.package?.packageVersion || '').localeCompare(String(right?.package?.packageVersion || ''))
  ));
  return Object.freeze({
    registry: Object.freeze({
      registryVersion: discovered.registry.registryVersion,
      registryRevisionSha256: discovered.registry.registryRevisionSha256,
    }),
    packages: Object.freeze(exactProofs),
    pooledCareer,
  });
}

const STUDIO_V4_CAPABILITY_ALIASES = Object.freeze({
  swishiqStudio: 'franchiseInputs',
  chemistry: 'chemistry',
  shotProfile: 'nbaStatsPlayerShotDashboardGeneral',
  playType: 'nbaStatsPlayerPlaytypeOffensiveIsolation',
  compositeRecipe: 'compositeForgeInputs',
  challengePools: 'challengePools',
  seasonSimulation: 'seasonLabInputs',
  careerHistory: 'careerHistory',
});

function v4CapabilityIsDescriptive(index, capabilityId) {
  const capability = index?.capabilityMap?.capabilities?.[capabilityId];
  return capability?.evidenceState === 'evidence'
    && capability?.executionReadiness?.descriptiveDataAccess === 'available';
}

function studioProofFromV4(proof, phase = 'regular') {
  const sourceCapabilities = proof?.index?.capabilityMap?.capabilities;
  if (!isObject(sourceCapabilities) || proof?.status !== 'verified') {
    throw new Error('The V4 package index did not verify for Studio.');
  }
  const capabilities = Object.fromEntries(Object.entries(STUDIO_V4_CAPABILITY_ALIASES).map(([studioKey, v4Key]) => [
    studioKey,
    Object.freeze({
      status: v4CapabilityIsDescriptive(proof.index, v4Key) ? 'available' : 'unavailable',
      sourceCapabilityId: v4Key,
    }),
  ]));
  return Object.freeze({
    ...proof,
    package: Object.freeze({ ...proof.package, capabilities: Object.freeze(capabilities) }),
    request: Object.freeze({
      seasonEndYear: Number(proof.package?.scope?.seasonEndYear
        || Math.max(...(proof.package?.scope?.seasonStartYears || [0])) + 1),
      phase,
    }),
    registry: Object.freeze({
      registryVersion: 'swishiq-v4-public-registry-v1',
      registryRevisionSha256: proof.registryRevisionSha256,
    }),
  });
}

function assertStudioV4PackagePin(proof, releasePin, expectedPackage) {
  const packagePin = releasePin.packagePins?.find(row => row?.packageId === proof?.package?.packageId);
  const expectedVersion = expectedPackage?.packageVersion;
  const pinnedFields = [
    'sourceLockSha256', 'sourceLockEmbeddedSha256', 'sourceLockFileSha256', 'sourceLockSchemaSha256',
  ];
  if (proof?.status !== 'verified'
    || proof.registryRevisionSha256 !== releasePin.registryRevisionSha256
    || proof.package?.packageId !== expectedPackage?.packageId
    || proof.package?.packageVersion !== expectedVersion
    || !packagePin
    || packagePin.indexSha256 !== proof.indexSha256
    || packagePin.capabilityMapSha256 !== proof.package.capabilityMapSha256
    || packagePin.sourceLockDigestKind !== proof.package.sourceLockDigestKind
    || pinnedFields.some(field => packagePin[field] !== proof.package[field])
    || packagePin.sourceLockFileByteLength !== proof.package.sourceLockFileByteLength) {
    throw new Error(`The verified V4 package ${expectedPackage?.packageId || ''} differs from the reviewed Studio release pin.`);
  }
}

/** Load only pinned V4 package indexes for Studio discovery; consumers verify their own required parts before rendering output. */
export async function loadCanonicalV4StudioPublishedPackages({
  releasePin = CANONICAL_V4_STUDIO_RUNTIME_RELEASE_PIN,
  fetchImpl = globalThis.fetch?.bind(globalThis),
  signal,
  baseUrl,
} = {}) {
  if (releasePin?.status !== 'reviewed' || typeof fetchImpl !== 'function') {
    throw new Error('A reviewed V4 Studio release and browser fetch are required.');
  }
  const expectedPackages = Array.isArray(releasePin.expectedIdentity?.packages)
    ? releasePin.expectedIdentity.packages : [];
  const exactExpected = expectedPackages.filter(row => row?.scope?.kind === 'exact-season'
    && Array.isArray(row.scope.seasonStartYears)
    && row.scope.seasonStartYears.length === 1
    && row.scope.phases?.includes('regular'));
  if (exactExpected.length !== PUBLIC_SCOPE_LEDGER.exactTotal) {
    throw new Error('The reviewed V4 release does not contain the complete exact-season Studio selection.');
  }
  const loadProof = async (expectedPackage, { pooled = false } = {}) => {
    const startYears = pooled
      ? [...Array.from({ length: 9 }, (_, index) => 2017 + index)]
      : [expectedPackage.scope.seasonStartYears[0]];
    const scope = { kind: pooled ? 'pooled-window' : 'exact-season', seasonStartYears: startYears, phases: ['regular'] };
    const proof = await loadCanonicalV4PublicPackageProof({
      registryUrl: releasePin.registryUrl,
      expectedRegistrySha256: releasePin.registrySha256,
      expectedIdentity: releasePin.expectedIdentity,
      scope,
      requiredCapabilities: [pooled ? 'careerHistory' : 'franchiseInputs'],
      acceptPooled: pooled,
      fetchImpl,
      signal,
      baseUrl,
    });
    assertStudioV4PackagePin(proof, releasePin, expectedPackage);
    return studioProofFromV4(proof);
  };
  const packages = await Promise.all(exactExpected
    .sort((left, right) => left.scope.seasonStartYears[0] - right.scope.seasonStartYears[0])
    .map(expectedPackage => loadProof(expectedPackage)));
  const pooledExpected = expectedPackages.find(row => row?.scope?.kind === 'pooled-window'
    && row.scope.seasonStartYears?.[0] === 2017
    && row.scope.seasonStartYears?.at(-1) === 2025
    && row.scope.phases?.includes('regular'));
  const pooledCareer = pooledExpected ? await loadProof(pooledExpected, { pooled: true }) : null;
  return Object.freeze({
    registry: Object.freeze({
      registryVersion: 'swishiq-v4-public-registry-v1',
      registryRevisionSha256: releasePin.registryRevisionSha256,
    }),
    packages: Object.freeze(packages),
    pooledCareer,
  });
}

function packageLabel(proof) {
  const start = Number(proof?.package?.scope?.seasonStartYear);
  const end = Number(proof?.package?.scope?.seasonEndYear);
  const season = Number.isInteger(start) && Number.isInteger(end)
    ? `${start}–${String(end).slice(-2)}`
    : 'Season';
  return proof?.request?.phase === 'regular' ? season : `${season} · ${proof.request.phase.replaceAll('_', ' ')}`;
}

function newestExactPackage(proofs) {
  return [...(Array.isArray(proofs) ? proofs : [])].sort((left, right) => (
    Number(right?.request?.seasonEndYear || 0) - Number(left?.request?.seasonEndYear || 0)
    || String(right?.package?.packageVersion || '').localeCompare(String(left?.package?.packageVersion || ''))
  ))[0] || null;
}

function capabilityStatus(proof, capability) {
  return proof?.package?.capabilities?.[capability]?.status === 'available' ? 'available' : 'unavailable';
}

async function fetchPublicPart(proof, artifactId, kind, fetchImpl, capability = 'swishiqStudio') {
  const part = await loadSwishIqPublicPart(proof, {
    artifactId,
    kind,
    capability,
    fetchImpl,
  });
  return part.value.records;
}

function hasBoundPublicArtifact(proof, capability, artifactId, kind) {
  const packageCapability = proof?.package?.capabilities?.[capability];
  const indexCapability = proof?.index?.capabilities?.[capability];
  const artifact = proof?.index?.artifacts?.find(item => item?.artifactId === artifactId);
  return packageCapability?.status === 'available'
    && indexCapability?.status === 'available'
    && Array.isArray(packageCapability.artifactIds)
    && packageCapability.artifactIds.includes(artifactId)
    && Array.isArray(indexCapability.artifactIds)
    && indexCapability.artifactIds.includes(artifactId)
    && artifact?.kind === kind;
}

function playerRows(records) {
  const rows = records.filter(row => isObject(row)
    && typeof row.displayName === 'string'
    && PLAYER_REF.test(row.playerRef)
    && Array.isArray(row.positions)
    && row.positions.length > 0
    && row.positions.every(position => POSITION_CODES.has(position)))
    .map(row => ({
      displayName: row.displayName.trim(),
      playerRef: row.playerRef,
      positions: [...new Set(row.positions)],
    }))
    .filter(row => row.displayName.length > 0)
    .sort((left, right) => left.displayName.localeCompare(right.displayName));
  const seen = new Set();
  return rows.filter(row => {
    if (seen.has(row.playerRef)) return false;
    seen.add(row.playerRef);
    return true;
  });
}

/** Keep selected package-bound player refs while a filter only hides rows. */
export function retainSelectedBlueprintPlayerRefs(selectedRefs, availablePlayers) {
  const selected = selectedRefs instanceof Set
    ? [...selectedRefs]
    : Array.isArray(selectedRefs) ? selectedRefs : [];
  const available = new Set((Array.isArray(availablePlayers) ? availablePlayers : [])
    .map(player => player?.playerRef)
    .filter(ref => PLAYER_REF.test(String(ref || ''))));
  return new Set(selected.filter(ref => available.has(ref)).slice(0, BLUEPRINT_MAX_SELECTED_PLAYERS));
}

/** Toggle one visual-picker choice without allowing the comparison past four players. */
export function toggleBlueprintPlayerSelection(selectedRefs, playerRef, availablePlayers) {
  const selected = retainSelectedBlueprintPlayerRefs(selectedRefs, availablePlayers);
  const available = new Set((Array.isArray(availablePlayers) ? availablePlayers : [])
    .map(player => player?.playerRef)
    .filter(ref => PLAYER_REF.test(String(ref || ''))));
  if (!available.has(playerRef)) return selected;
  if (selected.has(playerRef)) {
    selected.delete(playerRef);
    return selected;
  }
  if (selected.size < BLUEPRINT_MAX_SELECTED_PLAYERS) selected.add(playerRef);
  return selected;
}

/** Merge a native multi-select change without dropping filtered-out refs. */
export function mergeVisibleBlueprintPlayerSelection({
  selectedRefs,
  visibleRefs,
  nextVisibleRefs,
  availablePlayers,
} = {}) {
  const available = new Set((Array.isArray(availablePlayers) ? availablePlayers : [])
    .map(player => player?.playerRef)
    .filter(ref => PLAYER_REF.test(String(ref || ''))));
  const values = value => value instanceof Set ? [...value] : Array.isArray(value) ? value : [];
  const selected = values(selectedRefs).filter(ref => available.has(ref));
  const visible = new Set(values(visibleRefs).filter(ref => available.has(ref)));
  const next = new Set(values(nextVisibleRefs).filter(ref => available.has(ref)));
  // Keep filtered-out choices first, followed by surviving visible choices in
  // their original selection order. Newly selected visible players fill open slots.
  const retained = selected.filter(ref => !visible.has(ref));
  const retainedVisible = selected.filter(ref => visible.has(ref) && next.has(ref));
  const additions = [...next].filter(ref => !selected.includes(ref));
  return new Set([...retained, ...retainedVisible, ...additions].slice(0, BLUEPRINT_MAX_SELECTED_PLAYERS));
}

/** Keep the announced count aligned with active filters and retained selections. */
export function blueprintPlayerFilterStatusMessage(matchingCount, selectedCount = 0) {
  const matches = Math.max(0, Math.floor(Number(matchingCount) || 0));
  const selected = Math.max(0, Math.floor(Number(selectedCount) || 0));
  if (!matches) {
    if (!selected) return 'No players match the current filters.';
    const retained = `${selected} selected player${selected === 1 ? '' : 's'} ${selected === 1 ? 'remains' : 'remain'} in the comparison.`;
    return selected >= BLUEPRINT_MAX_SELECTED_PLAYERS
      ? `No players match the current filters. ${retained} The ${BLUEPRINT_MAX_SELECTED_PLAYERS}-player limit is reached; remove one before adding another.`
      : `No players match the current filters. ${retained}`;
  }
  const matchCopy = `${matches} matching player${matches === 1 ? '' : 's'}.`;
  if (selected >= BLUEPRINT_MAX_SELECTED_PLAYERS) {
    return `${matchCopy} ${BLUEPRINT_MAX_SELECTED_PLAYERS} of ${BLUEPRINT_MAX_SELECTED_PLAYERS} players selected. Limit reached; remove one before adding another.`;
  }
  if (selected) return `${matchCopy} ${selected} player${selected === 1 ? ' is' : 's are'} selected.`;
  return `${matchCopy} Choose one or more players to view recorded rates.`;
}

/** Build visible roster rows from exact memberships, or legacy observed season rows. */
export function buildBlueprintRosterRows({ players = [], seasons = [], memberships = null, seasonStartYear, teamCode = '' } = {}) {
  const year = Number(seasonStartYear);
  if (!Number.isInteger(year)) return [];
  const playerByRef = new Map((Array.isArray(players) ? players : [])
    .filter(player => isObject(player) && PLAYER_REF.test(String(player.playerRef || '')))
    .map(player => [player.playerRef, player]));
  const selectedTeam = String(teamCode || '').trim().toUpperCase();
  const usingMemberships = Array.isArray(memberships);
  const sourceRows = usingMemberships ? memberships : seasons;
  return (Array.isArray(sourceRows) ? sourceRows : [])
    .filter(row => isObject(row)
      && row.seasonStartYear === year
      && row.phase === 'regular'
      && PLAYER_REF.test(String(row.playerRef || ''))
      && TEAM_CODE.test(String(row.teamCode || ''))
      && (usingMemberships
        ? row.displayEligible === true
          && Array.isArray(row.positions)
          && row.positions.length > 0
          && row.positions.every(position => POSITION_CODES.has(position))
        : row.observed === true && Number.isFinite(row.games) && row.games > 0)
      && (!selectedTeam || row.teamCode === selectedTeam)
      && playerByRef.has(row.playerRef))
    .map(row => {
      const player = playerByRef.get(row.playerRef);
      return {
        player: usingMemberships ? { ...player, positions: [...row.positions] } : player,
        row,
      };
    })
    .sort((left, right) => left.player.displayName.localeCompare(right.player.displayName)
      || left.row.teamCode.localeCompare(right.row.teamCode));
}

/** Keep only exact-season, display-eligible roster identities from the verified membership artifact. */
export function blueprintRosterMembershipRows(records, seasonStartYear) {
  const year = Number(seasonStartYear);
  if (!Number.isInteger(year)) return [];
  const seen = new Set();
  return (Array.isArray(records) ? records : [])
    .filter(row => isObject(row)
      && PLAYER_REF.test(String(row.playerRef || ''))
      && typeof row.displayName === 'string'
      && row.displayName.trim().length > 0
      && row.seasonStartYear === year
      && row.phase === 'regular'
      && TEAM_CODE.test(String(row.teamCode || ''))
      && row.displayEligible === true
      && Array.isArray(row.positions)
      && row.positions.length > 0
      && row.positions.every(position => POSITION_CODES.has(position)))
    .map(row => ({ ...row, positions: [...new Set(row.positions)] }))
    .filter(row => {
      const key = String(row.rosterRef || `${row.playerRef}|${row.seasonStartYear}|${row.phase}|${row.teamCode}`);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((left, right) => left.displayName.localeCompare(right.displayName)
      || left.teamCode.localeCompare(right.teamCode)
      || left.playerRef.localeCompare(right.playerRef));
}

/** Apply a games-played threshold only from the matched public team-season row. */
export function filterBlueprintRowsByPublicGames(rows, records, minGames = 0) {
  const entries = Array.isArray(rows) ? rows : [];
  const minimumGames = Number(minGames);
  if (!Number.isFinite(minimumGames) || minimumGames <= 0) return entries.slice();
  if (!(records instanceof Map)) return [];
  return entries.filter(entry => {
    const games = blueprintRosterPublicStats(entry, records)?.totals?.gamesPlayed;
    return Number.isFinite(games) && games >= minimumGames;
  });
}

const BLUEPRINT_ROSTER_SORT_COLUMNS = Object.freeze([
  { key: 'player', label: 'Player', value: entry => entry?.player?.displayName || '', type: 'text' },
  { key: 'position', label: 'Pos', value: entry => (entry?.player?.positions || []).join('/'), type: 'text' },
  { key: 'team', label: 'Team', value: entry => entry?.row?.teamCode || '', type: 'text' },
  { key: 'games', label: 'GP', ariaLabel: 'games played', value: entry => Number.isFinite(entry?.publicStats?.totals?.gamesPlayed) ? entry.publicStats.totals.gamesPlayed : null, type: 'number' },
  { key: 'pointsPerGame', label: 'PPG', ariaLabel: 'points per game', value: entry => metricValue(entry?.publicStats, 'pointsPerGame', 'per-game'), type: 'number' },
  { key: 'minutesPerGame', label: 'MPG', ariaLabel: 'minutes per game', value: entry => metricValue(entry?.publicStats, 'minutesPerGame', 'minutes-per-game'), type: 'number' },
  { key: 'assistsPerGame', label: 'APG', ariaLabel: 'assists per game', value: entry => metricValue(entry?.publicStats, 'assistsPerGame', 'per-game'), type: 'number' },
  { key: 'reboundsPerGame', label: 'RPG', ariaLabel: 'rebounds per game', value: entry => metricValue(entry?.publicStats, 'reboundsPerGame', 'per-game'), type: 'number' },
]);

function defaultBlueprintRosterSortDirection(sortKey) {
  const column = BLUEPRINT_ROSTER_SORT_COLUMNS.find(item => item.key === sortKey);
  return column?.type === 'number' ? 'descending' : 'ascending';
}

/** Use only a matched, exact team-season public row for the visible rate fields. */
export function blueprintRosterPublicStats(entry, records) {
  const { player, row } = entry || {};
  if (!player?.displayName || !isObject(row) || !(records instanceof Map)) return null;
  const teamCode = String(row.teamCode || '').trim().toUpperCase();
  if (!TEAM_CODE.test(teamCode)) return null;
  const record = playerContextForPlayer(records, player.displayName);
  const stats = publicStatsForPlayerSeason(record, {
    seasonStartYear: row.seasonStartYear,
    teamCode,
  });
  if (!stats
    || stats.source?.coverage !== 'official-public-season'
    || !Array.isArray(stats.rows)
    || !stats.rows.length
    || stats.rows.some(sourceRow => sourceRow?.seasonStartYear !== row.seasonStartYear
      || sourceRow?.seasonPhase !== 'regular'
      || sourceRow?.isMultiTeamAggregate === true)) return null;
  return stats;
}

/** Distinguish a failed season shard from a loaded shard with no exact row. */
export function blueprintRosterRowSourceState(publicStats, records, recordsError = '') {
  if (!(records instanceof Map)) return recordsError ? 'source-unavailable' : 'loading';
  return publicStats ? 'matched' : 'exact-row-unavailable';
}

/** Overlay public box-score fields and discard native rates when an exact match is missing. */
export function blueprintPublicDisplayRow(entry, records, publicStats = blueprintRosterPublicStats(entry, records)) {
  const { row } = entry || {};
  if (!isObject(row) || !publicStats) {
    return { ...(isObject(row) ? row : {}), games: null, minutes: null, box: {}, metrics: {}, statsSource: null };
  }
  const { player } = entry;
  const record = playerContextForPlayer(records, player.displayName);
  const merged = mergePublicStatsIntoPlayerSeason({ ...row, box: {}, metrics: {} }, record);
  return {
    ...merged,
    games: publicStats.totals.gamesPlayed,
    minutes: Number.isFinite(publicStats.totals.minutesPlayed) ? publicStats.totals.minutesPlayed : null,
    metrics: publicStats.metrics,
    statsSource: publicStats.source,
  };
}

/** Keep a display-mode choice attached to one exact player/team/season row. */
export function blueprintStatModeScopeKey(player, row) {
  const playerRef = String(player?.playerRef || '').trim();
  const teamCode = String(row?.teamCode || '').trim().toUpperCase();
  const seasonStartYear = Number(row?.seasonStartYear);
  const phase = String(row?.phase || 'regular').trim();
  if (!playerRef || !teamCode || !Number.isInteger(seasonStartYear) || seasonStartYear < 1) return '';
  return JSON.stringify([playerRef, teamCode, seasonStartYear, phase]);
}

/** Sort roster display rows using their source values, leaving unavailable stats last. */
export function sortBlueprintRosterRows(rows, sortKey = 'player', direction = 'ascending') {
  const entries = Array.isArray(rows) ? rows : [];
  const column = BLUEPRINT_ROSTER_SORT_COLUMNS.find(item => item.key === sortKey);
  if (!column) return entries.slice();
  const multiplier = direction === 'descending' ? -1 : 1;
  return entries.map((entry, index) => ({ entry, index, value: column.value(entry) }))
    .sort((left, right) => {
      if (left.value === null && right.value !== null) return 1;
      if (right.value === null && left.value !== null) return -1;
      if (left.value === null && right.value === null) return left.index - right.index;
      const comparison = column.type === 'number'
        ? left.value - right.value
        : String(left.value).localeCompare(String(right.value), undefined, { numeric: true, sensitivity: 'base' });
      return comparison ? comparison * multiplier : left.index - right.index;
    })
    .map(item => item.entry);
}

/** Search Blueprint's name field against player names without treating initials as arbitrary substrings. */
export function matchesBlueprintNameQuery(playerName, query = '') {
  const queryTokens = normalizeSelectorText(query).split(' ').filter(Boolean);
  if (!queryTokens.length) return true;
  const nameTokens = normalizeSelectorText(playerName).split(' ').filter(Boolean);
  const compactName = nameTokens.join('');
  return queryTokens.every(token => token.length === 1
    ? nameTokens.some(nameToken => nameToken.startsWith(token))
    : nameTokens.some(nameToken => nameToken.includes(token)) || compactName.includes(token));
}

/** Keep a large team-season roster bounded for keyboard and screen-reader navigation. */
export function paginateBlueprintRosterRows(rows, pageIndex = 0, pageSize = BLUEPRINT_ROSTER_PAGE_SIZE) {
  const entries = Array.isArray(rows) ? rows : [];
  const requestedSize = Math.floor(Number(pageSize));
  const size = Number.isFinite(requestedSize) && requestedSize > 0 ? requestedSize : BLUEPRINT_ROSTER_PAGE_SIZE;
  const total = entries.length;
  const pageCount = Math.ceil(total / size);
  const requestedPage = Math.floor(Number(pageIndex));
  const safePage = Number.isFinite(requestedPage) ? Math.max(0, requestedPage) : 0;
  const page = pageCount ? Math.min(safePage, pageCount - 1) : 0;
  const startIndex = page * size;
  const endIndex = Math.min(total, startIndex + size);
  return {
    rows: entries.slice(startIndex, endIndex),
    page,
    pageCount,
    pageSize: size,
    startIndex,
    endIndex,
    total,
  };
}

export function createBlueprintStatsStatus(createElement, row) {
  const status = createElement('span', 'swishiq-blueprint__stats-source');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  status.textContent = row?.statsSource
    ? `Observed ${blueprintSeasonTypeLabel(row.phase).toLowerCase()} stats`
    : 'Stats unavailable';
  return status;
}

export function availableBlueprintSeasonTypes(records, players, seasonStartYear, teamCode = '') {
  const selectedRefs = (Array.isArray(players) ? players : [])
    .map(player => typeof player === 'string' ? player : String(player?.playerRef || ''))
    .filter(Boolean);
  if (!selectedRefs.length || !Array.isArray(records)) return [];
  const year = Number(seasonStartYear);
  const selectedTeam = String(teamCode || '').trim().toUpperCase();
  const phasesByPlayer = selectedRefs.map(playerRef => new Set(records.flatMap(row => (
    isObject(row)
    && row.playerRef === playerRef
    && row.seasonStartYear === year
    && row.observed === true
    && PLAYER_BLUEPRINT_SEASON_PHASES.some(phase => phase.key === row.phase)
    && TEAM_CODE.test(String(row.teamCode || '').toUpperCase())
    && (!selectedTeam || String(row.teamCode).toUpperCase() === selectedTeam)
    && Number.isFinite(row.games)
    && row.games > 0
      ? [row.phase]
      : []
  ))));
  return PLAYER_BLUEPRINT_SEASON_PHASES
    .filter(phase => phasesByPlayer.every(phases => phases.has(phase.key)))
    .map(phase => phase.key);
}

const BLUEPRINT_PACKAGE_METRIC_UNITS = Object.freeze({
  pointsPerGame: 'points-per-game',
  assistsPerGame: 'assists-per-game',
  reboundsPerGame: 'rebounds-per-game',
  trueShootingPercentage: 'rate',
  fieldGoalPercentage: 'rate',
  threePointPercentage: 'rate',
  freeThrowPercentage: 'rate',
  stealsPerGame: 'steals-per-game',
  blocksPerGame: 'blocks-per-game',
  turnoversPerGame: 'turnovers-per-game',
  pointsPer36: 'points-per-36-minutes',
});

/** Read non-regular rates only from the observed row in the selected exact package. */
export function blueprintObservedPhaseDisplayRow(entry, packageVersion) {
  const row = entry?.row;
  const version = String(packageVersion || '').trim();
  if (!isObject(row) || row.phase === 'regular' || row.observed !== true
    || !TEAM_CODE.test(String(row.teamCode || '').toUpperCase())
    || !Number.isFinite(row.games) || row.games <= 0 || !version) return null;
  const metrics = { ...(isObject(row.metrics) ? row.metrics : {}) };
  BLUEPRINT_METRICS.forEach(definition => {
    const metric = metrics[definition.key];
    if (!isObject(metric) || metric.status !== 'available') return;
    const expectedPackageUnit = BLUEPRINT_PACKAGE_METRIC_UNITS[definition.key];
    if (metric.unit === expectedPackageUnit || metric.unit === definition.metricUnit) {
      metrics[definition.key] = { ...metric, unit: definition.metricUnit };
    } else {
      metrics[definition.key] = { ...metric, status: 'unavailable', value: null };
    }
  });
  return {
    ...row,
    box: isObject(row.box) ? row.box : {},
    metrics,
    statsSource: { kind: 'exact-season-package', packageVersion: version, phase: row.phase },
  };
}

function seasonRows(records, playerRef, seasonStartYear, phase = 'regular') {
  return records.filter(row => isObject(row)
    && row.playerRef === playerRef
    && row.seasonStartYear === seasonStartYear
    && row.phase === phase
    && row.observed === true
    && TEAM_CODE.test(row.teamCode)
    && Number.isFinite(row.games)
    && row.games > 0)
    .sort((left, right) => right.games - left.games || left.teamCode.localeCompare(right.teamCode));
}

function metricValue(row, key, expectedUnit = 'per-game') {
  const metric = row?.metrics?.[key];
  return metric?.status === 'available'
    && metric.unit === expectedUnit
    && Number.isFinite(metric.value)
    ? metric.value
    : null;
}

export function blueprintScoutRound(entries, metricKey) {
  const choices = (Array.isArray(entries) ? entries : []).flatMap(({ player, row, displayRow }, index) => {
    const sourceRow = displayRow || row;
    const raw = sourceRow?.observed === true && sourceRow?.phase === 'regular'
      ? metricValue(sourceRow, metricKey, 'per-game')
      : null;
    if (raw === null) return [];
    return [{ index, player: player.displayName, team: sourceRow.teamCode, games: sourceRow.games,
      value: Number(raw.toFixed(1)) }];
  });
  if (choices.length < 2) return null;
  return { metricKey, choices, bestValue: Math.max(...choices.map(choice => choice.value)) };
}

export function scoreBlueprintScoutPick(run, round, choiceIndex) {
  if (!run || run.revealed || !round) return run;
  const choice = round.choices.find(item => item.index === choiceIndex);
  if (!choice) return run;
  return { ...run, choiceIndex, revealed: true,
    score: run.score + Number(choice.value === round.bestValue) };
}

function formatMetric(value) {
  if (!Number.isFinite(value)) return 'Unavailable';
  return Number(value.toFixed(1)).toString();
}

function formatBlueprintMetric(metric) {
  if (!metric || !Number.isFinite(metric.value)) return 'Unavailable';
  return metric.metricUnit === 'fraction'
    ? formatMetric(metric.value * 100)
    : formatMetric(metric.value);
}

function blueprintMetricUnit(metric) {
  return metric?.metricUnit === 'fraction' ? '%' : metric?.unit || '';
}

function formatBlueprintMetricWithUnit(metric) {
  const value = formatBlueprintMetric(metric);
  if (value === 'Unavailable') return value;
  const unit = blueprintMetricUnit(metric);
  return unit ? `${value}${metric?.metricUnit === 'fraction' ? '' : ' '}${unit}` : value;
}

function percentile(values, percentileRank = 0.9) {
  const ordered = values.filter(Number.isFinite).sort((left, right) => left - right);
  if (!ordered.length) return null;
  const rank = Math.max(0, Math.min(1, Number(percentileRank)));
  const index = (ordered.length - 1) * rank;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return ordered[lower];
  const weight = index - lower;
  return ordered[lower] + ((ordered[upper] - ordered[lower]) * weight);
}

function formatInteger(value) {
  return Number.isFinite(value) ? Math.round(value).toLocaleString('en-US') : 'Unavailable';
}

function formatSeasonLabel(seasonStartYear) {
  const year = Number(seasonStartYear);
  return Number.isInteger(year) ? `${year}–${String(year + 1).slice(-2)}` : 'Selected season';
}

function formatDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return 'Unavailable';
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime())
    ? 'Unavailable'
    : new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(date);
}

function formatHeight(value) {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (isObject(value) && typeof value.display === 'string' && value.display.trim()) return value.display.trim();
  return 'Unavailable';
}

function placeStudioBackToTopInMenu(documentRef) {
  const backToTop = documentRef.getElementById('backToTop');
  if (!backToTop || backToTop.closest('.site-nav')) return;

  const place = () => {
    const navList = documentRef.querySelector('.swishiq-studio-page .site-nav .primary-nav__list');
    if (!navList?.querySelector('[data-fan-tools-primary="true"]')) return false;
    if (backToTop.closest('.site-nav')) return true;

    const item = documentRef.createElement('li');
    item.className = 'primary-nav__item studio-back-to-top-item';
    backToTop.classList.add('primary-nav__link', 'studio-back-to-top');
    backToTop.setAttribute('aria-label', 'Back to top of SwishIQ Studio');
    backToTop.textContent = 'Back to top';
    item.append(backToTop);
    navList.append(item);

    const nav = backToTop.closest('.site-nav');
    const navToggle = documentRef.getElementById('navToggle');
    backToTop.addEventListener('click', () => {
      if (nav?.classList.contains('open')) navToggle?.click();
    });
    return true;
  };

  if (place()) return;
  const Observer = documentRef.defaultView?.MutationObserver || globalThis.MutationObserver;
  if (typeof Observer !== 'function' || !documentRef.body) return;
  const observer = new Observer(() => {
    if (place()) observer.disconnect();
  });
  observer.observe(documentRef.body, { childList: true, subtree: true });
  setTimeout(() => observer.disconnect(), 5000);
}

/** Start the DOM controller only in a browser. The loader remains testable in Node. */
export function startSwishIqStudio({
  documentRef = globalThis.document,
  registryUrl: suppliedRegistryUrl,
  fetchImpl: suppliedFetchImpl,
  bootTimeoutMs = SWISHIQ_STUDIO_BOOT_TIMEOUT_MS,
} = {}) {
  const registryUrl = suppliedRegistryUrl ?? SWISHIQ_STUDIO_REGISTRY_URL;
  const fetchImpl = suppliedFetchImpl ?? globalThis.fetch?.bind(globalThis);
  // An explicitly injected V3 URL/fetch remains available to isolated fixtures
  // and migration diagnostics. Normal browser startup always follows the
  // reviewed V4 release pin and never tries the gated V3 projection.
  const useReviewedV4Bootstrap = suppliedRegistryUrl === undefined
    && suppliedFetchImpl === undefined
    && CANONICAL_V4_STUDIO_RUNTIME_RELEASE_PIN.status === 'reviewed';
  if (!documentRef) return null;
  placeStudioBackToTopInMenu(documentRef);
  installSelectorSystem(documentRef);
  const byId = id => documentRef.getElementById(id);
  const select = byId('packageSelect');
  const registryStatus = byId('registryStatus');
  const packageNote = byId('packageNote');
  const scopeExactCount = byId('scopeExactCount');
  const scopeExactNote = byId('scopeExactNote');
  const scopePooledState = byId('scopePooledState');
  const workbenchLabel = byId('workbenchLabel');
  const workspaceTitle = byId('workspaceTitle');
  const workspace = byId('workspace');
  const workbenchDescription = byId('workbenchDescription');
  const workbenchState = byId('workbenchState');
  const retryRegistry = byId('retryRegistry');
  const capabilityState = byId('capabilityState');
  const capabilitySummary = byId('capabilitySummary');
  const capabilityList = byId('capabilityList');
  const workbenchPlaceholder = byId('workbenchPlaceholder');
  const placeholderKicker = byId('placeholderKicker');
  const placeholderTitle = byId('placeholderTitle');
  const placeholderCopy = byId('placeholderCopy');
  const placeholderList = byId('placeholderList');
  const blueprintPanel = byId('blueprintPanel');
  const blueprintState = byId('blueprintState');
  const blueprintSearch = byId('blueprintPlayerSearch');
  const blueprintTeamFilter = byId('blueprintTeamFilter');
  const blueprintPositionFilter = byId('blueprintPositionFilter');
  const blueprintCoverageFilter = byId('blueprintCoverageFilter');
  const blueprintSelect = byId('blueprintPlayerSelect');
  const blueprintPlayerPicker = byId('blueprintPlayerPicker');
  const blueprintPlayerPickerSummary = byId('blueprintPlayerPickerSummary');
  const blueprintPlayerMenu = byId('blueprintPlayerMenu');
  const blueprintStatus = byId('blueprintStatus');
  const blueprintSnapshots = byId('blueprintSnapshots');
  const blueprintDirectory = blueprintPanel?.querySelector('.swishiq-blueprint__directory');
  const blueprintSeasonControls = byId('blueprintSeasonControls');
  const blueprintRoster = byId('blueprintRoster');
  const tabs = [...documentRef.querySelectorAll('.swishiq-tabs button')];
  const studioPaletteRoot = byId('mainContent');
  const activeWorkbenchTab = () => tabs.find(item => item.getAttribute('aria-pressed') === 'true') || tabs[0] || null;
  const keepWorkbenchTabVisible = button => {
    const scroller = button?.closest?.('.swishiq-tabs__scroll');
    if (!scroller || typeof button.getBoundingClientRect !== 'function'
      || typeof scroller.getBoundingClientRect !== 'function') return;
    const scrollerBounds = scroller.getBoundingClientRect();
    const buttonBounds = button.getBoundingClientRect();
    const hiddenLeft = scrollerBounds.left - buttonBounds.left;
    const hiddenRight = buttonBounds.right - scrollerBounds.right;
    if (hiddenLeft > 1 || hiddenRight > 1) button.scrollIntoView?.({ block: 'nearest', inline: 'start' });
  };
  documentRef.defaultView?.addEventListener('resize', () => keepWorkbenchTabVisible(activeWorkbenchTab()));
  if (!select || !registryStatus || !packageNote || !workbenchLabel || !workspaceTitle || !workbenchDescription || !workbenchState) {
    return null;
  }

  let studio = { packages: [], pooledCareer: null };
  let selectedPackage = null;
  let unavailableMessage = '';
  let blueprint = { players: [], seasons: [], memberships: [] };
  let blueprintPlayerIndex = null;
  let playerMetadata = new Map();
  let playerMetadataPromise = null;
  let playerMetadataStatus = 'idle';
  let publicPlayerContext = null;
  let publicPlayerContextPromise = null;
  let publicPlayerContextError = '';
  const blueprintStatModes = new Map();
  const blueprintProfileTabs = new Map();
  let blueprintSeasonType = 'regular';
  let blueprintSeasonTypePackageKey = '';
  let blueprintSeasonTypeFocusRequested = false;
  let blueprintRosterStats = null;
  let blueprintRosterStatsPromise = null;
  let blueprintRosterStatsError = '';
  let blueprintRosterStatsYear = 0;
  const blueprintRosterStatsByYear = new Map();
  const blueprintRosterStatsPromisesByYear = new Map();
  let blueprintLoadToken = 0;
  let blueprintSeasonsPromise = null;
  let blueprintSeasonsProof = null;
  let blueprintSeasonsStatus = 'idle';
  let blueprintSeasonsError = '';
  const blueprintSeasonsByPackage = new Map();
  let blueprintMembershipsPromise = null;
  let blueprintMembershipsRequest = null;
  let blueprintMembershipsProof = null;
  let blueprintMembershipsStatus = 'idle';
  let blueprintMembershipsError = '';
  const blueprintMembershipsByPackage = new Map();
  let blueprintRequest = null;
  let blueprintV4RequestToken = 0;
  let blueprintV4View = null;
  let registryLoadToken = 0;
  let registryLoadController = null;
  const workbenchModulePromises = new Map();
  const workbenchControllers = new Map();
  // Retain the user's current player while a different exact season package
  // is loading. The select itself is intentionally rebuilt during that load,
  // so its DOM value alone cannot carry the selection across packages.
  let selectedBlueprintPlayerRefs = new Set();
  let blueprintProfilePlayerRef = '';
  let blueprintProfileFocusRequested = false;
  let blueprintRosterPage = 0;
  let blueprintRosterSort = { key: 'player', direction: 'ascending' };
  let blueprintCoverageSelection = '';
  let blueprintScoutRun = null;
  let studioPaletteSyncTimer = null;
  const appliedStudioPaletteProperties = new Set();

  function teamCodeFromLabel(value) {
    const text = String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
    if (!text) return '';
    const knownCode = paletteForTeam(text);
    if (knownCode.id !== 'djhc' || text === 'djhc') return knownCode.id;
    const namedTeam = palettes.slice(1).find(palette => text === palette.team.toLowerCase()
      || text.includes(palette.team.toLowerCase()));
    if (namedTeam) return namedTeam.id;
    const codeMatch = text.match(/(?:^|[^a-z0-9])(atl|bos|bkn|cha|chi|cle|dal|den|det|gsw|hou|ind|lac|lal|mem|mia|mil|min|nop|nyk|okc|orl|phi|phx|por|sac|sas|tor|uta|was)(?:$|[^a-z0-9])/);
    return codeMatch?.[1] || '';
  }

  function selectedBlueprintTeam() {
    const selectedSnapshot = blueprintSnapshots?.querySelector('.swishiq-blueprint__snapshot[data-team-code]');
    const profileTeam = teamCodeFromLabel(selectedSnapshot?.dataset?.teamCode);
    if (profileTeam) return profileTeam;
    const filteredTeam = teamCodeFromLabel(blueprintTeamFilter?.value);
    if (filteredTeam) return filteredTeam;
    const seasonStartYear = Number(selectedPackage?.package?.scope?.seasonStartYear || 0);
    const selectedRefs = blueprintProfilePlayerRef
      ? [blueprintProfilePlayerRef]
      : [...selectedBlueprintPlayerRefs];
    const selectedRows = (Array.isArray(blueprint.seasons) ? blueprint.seasons : []).filter(row => (
      selectedRefs.includes(row?.playerRef)
      && Number(row?.seasonStartYear) === seasonStartYear
      && String(row?.phase || '') === blueprintSeasonType
    ));
    const teams = [...new Set(selectedRows.map(row => teamCodeFromLabel(row?.teamCode)).filter(Boolean))];
    return teams.length === 1 ? teams[0] : '';
  }

  function selectedWorkbenchTeam(workbench) {
    const panelId = ({
      chemistry: 'chemistryLabPanel',
      composite: 'compositeLabPanel',
      game: 'gameLabPanel',
      season: 'seasonLabPanel',
      career: 'careerLabPanel',
      spin: 'spinRoomPanel',
    })[workbench];
    const panel = panelId ? byId(panelId) : null;
    if (!panel) return '';
    const controls = [...panel.querySelectorAll('select, [role="combobox"]')]
      .filter(control => {
        if (control.closest('[hidden], [aria-hidden="true"]')) return false;
        const getComputedStyle = documentRef.defaultView?.getComputedStyle;
        if (typeof getComputedStyle === 'function') {
          const style = getComputedStyle.call(documentRef.defaultView, control);
          if (style?.display === 'none' || style?.visibility === 'hidden') return false;
        }
        return true;
      })
      .map(control => {
        const labels = [
          control.getAttribute('aria-label'),
          control.id,
          control.name,
          control.closest('label')?.textContent,
          ...[...(control.labels || [])].map(label => label.textContent),
        ].filter(Boolean).join(' ').toLowerCase();
        const isTeamControl = /team|club|franchise|focus/.test(labels);
        const value = control.value;
        const optionLabel = control.selectedOptions?.[0]?.textContent
          || control.options?.[control.selectedIndex]?.textContent
          || '';
        const code = teamCodeFromLabel(value) || teamCodeFromLabel(optionLabel);
        const priority = /franchise/.test(labels) ? 0
          : /focus/.test(labels) ? 1
            : /team\s*a/.test(labels) ? 2
              : /team\s*b/.test(labels) ? 3
                : /team|club/.test(labels) ? 4 : 5;
        return { code, priority, isTeamControl };
      })
      .filter(control => control.isTeamControl && control.code)
      .sort((left, right) => left.priority - right.priority);
    if (controls.length) return controls[0].code;
    if (workbench === 'chemistry') {
      const selectedPlayerRow = panel.querySelector('.swishiq-chemistry-lab__roster-table input[data-player-season-id]:checked')?.closest('tr');
      const selectedPlayerTeam = teamCodeFromLabel(selectedPlayerRow?.querySelector('td:nth-child(2)')?.textContent);
      if (selectedPlayerTeam) return selectedPlayerTeam;
      const displayedLineupTeam = teamCodeFromLabel(panel.querySelector('.swishiq-chemistry-combination__heading h4')?.textContent?.split('·')[0]);
      if (displayedLineupTeam) return displayedLineupTeam;
    }
    const selectedCard = panel.querySelector('[data-team-code][aria-current="true"], [data-team-code][aria-selected="true"], [data-team-code][data-selected="true"]');
    return teamCodeFromLabel(selectedCard?.dataset?.teamCode);
  }

  function studioTeamHighlight(palette, mode) {
    const luminance = color => {
      const channels = String(color || '').slice(1).match(/../g)?.map(value => parseInt(value, 16) / 255) || [];
      const linear = channels.map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
      return linear[0] * .2126 + linear[1] * .7152 + linear[2] * .0722;
    };
    const colors = [palette.primary, palette.highlight];
    return colors.reduce((best, color) => mode === 'dark'
      ? luminance(color) > luminance(best) ? color : best
      : luminance(color) < luminance(best) ? color : best);
  }

  function setStudioTeamPalette(teamCode) {
    if (!studioPaletteRoot) return;
    const id = teamCodeFromLabel(teamCode);
    if (!id) {
      if (!studioPaletteRoot.dataset.studioTeamPalette) {
        if (documentRef.body?.dataset?.courtContextTeam) setCourtContextTeam('');
        return;
      }
      delete studioPaletteRoot.dataset.studioTeamPalette;
      delete studioPaletteRoot.dataset.studioTeamPaletteMode;
      appliedStudioPaletteProperties.forEach(name => studioPaletteRoot.style.removeProperty(name));
      appliedStudioPaletteProperties.clear();
      if (documentRef.body?.dataset?.courtContextTeam) setCourtContextTeam('');
      const manualPalette = paletteForTeam(documentRef.body?.dataset?.courtPalette || 'djhc');
      studioPaletteRoot.querySelectorAll('[data-court-palette-name]').forEach(node => { node.textContent = manualPalette.name; });
      studioPaletteRoot.querySelectorAll('[data-court-team-name]').forEach(node => { node.textContent = manualPalette.team; });
      studioPaletteRoot.querySelectorAll('[data-court-palette-summary]').forEach(node => {
        node.setAttribute('aria-label', `Choose team colors. Current palette: ${manualPalette.team}, ${manualPalette.name}`);
        node.title = `${manualPalette.team} · ${manualPalette.name}`;
      });
      return;
    }
    const palette = paletteForTeam(id);
    const mode = documentRef.body?.classList?.contains('dark-mode') ? 'dark' : 'light';
    if (String(documentRef.body?.dataset?.courtContextTeam || '').toLowerCase() !== palette.id) setCourtContextTeam(palette.id);
    if (studioPaletteRoot.dataset.studioTeamPalette !== palette.id
      || studioPaletteRoot.dataset.studioTeamPaletteMode !== mode) {
      const tokens = themeFor(palette, mode);
      const highlight = studioTeamHighlight(palette, mode);
      const secondaryTokens = themeFor({ ...palette, primary: palette.highlight, highlight: palette.highlight }, mode);
      const values = {
        '--court-canvas': tokens.canvas,
        '--court-surface': tokens.surface,
        '--court-raised': tokens.raised,
        '--court-text': tokens.text,
        '--court-muted': tokens.muted,
        '--court-border': tokens.border,
        '--court-accent': tokens.accent,
        '--court-on-accent': tokens.onAccent,
        '--court-focus': tokens.focus,
        '--court-positive': tokens.positive,
        '--court-warning': tokens.warning,
        '--court-error': tokens.error,
        '--court-team-primary': palette.primary,
        '--court-team-secondary': palette.highlight,
        '--court-team-highlight': highlight,
        '--court-team-trim': palette.trim,
        '--court-team-secondary-ink': secondaryTokens.accent,
        '--court-palette-primary': palette.primary,
        '--court-palette-highlight': palette.highlight,
        '--court-palette-trim': palette.trim,
        '--swishiq-canvas': tokens.canvas,
        '--swishiq-surface': tokens.surface,
        '--swishiq-raised': tokens.raised,
        '--swishiq-text': tokens.text,
        '--swishiq-muted': tokens.muted,
        '--swishiq-border': tokens.border,
        '--swishiq-kicker': highlight,
        '--swishiq-accent': tokens.accent,
        '--swishiq-team-primary': palette.primary,
        '--swishiq-team-secondary': palette.highlight,
        '--swishiq-team-highlight': highlight,
        '--swishiq-team-trim': palette.trim,
        '--swishiq-team-ink': secondaryTokens.accent,
        '--studio-accent': highlight,
        '--studio-accent-strong': secondaryTokens.accent,
        '--studio-surface': tokens.surface,
        '--studio-raised': tokens.raised,
        '--studio-text': tokens.text,
        '--studio-muted': tokens.muted,
        '--studio-border': tokens.border,
      };
      Object.entries(values).forEach(([name, value]) => {
        studioPaletteRoot.style.setProperty(name, value);
        appliedStudioPaletteProperties.add(name);
      });
      studioPaletteRoot.dataset.studioTeamPalette = palette.id;
      studioPaletteRoot.dataset.studioTeamPaletteMode = mode;
    }
    studioPaletteRoot.querySelectorAll('[data-court-palette-name]').forEach(node => { node.textContent = palette.name; });
    studioPaletteRoot.querySelectorAll('[data-court-team-name]').forEach(node => { node.textContent = palette.team; });
    studioPaletteRoot.querySelectorAll('[data-court-palette-summary]').forEach(node => {
      node.setAttribute('aria-label', `Active team palette: ${palette.team}`);
      node.title = `${palette.team} · ${palette.name}`;
    });
  }

  function syncStudioTeamPalette() {
    const workbench = activeWorkbenchTab()?.dataset?.workbench || 'blueprint';
    const teamCode = workbench === 'blueprint'
      ? selectedBlueprintTeam()
      : selectedWorkbenchTeam(workbench) || selectedBlueprintTeam();
    setStudioTeamPalette(teamCode);
  }

  function scheduleStudioPaletteSync() {
    if (studioPaletteSyncTimer !== null) clearTimeout(studioPaletteSyncTimer);
    studioPaletteSyncTimer = setTimeout(() => {
      studioPaletteSyncTimer = null;
      syncStudioTeamPalette();
    }, 0);
  }

  const PaletteTeamControlObserver = documentRef.defaultView?.MutationObserver || globalThis.MutationObserver;
  const paletteTeamControlSelector = 'select, [role="combobox"]';
  function isPaletteTeamControl(control) {
    if (!control?.matches?.(paletteTeamControlSelector)) return false;
    const labels = [
      control.getAttribute('aria-label'),
      control.id,
      control.name,
      control.closest('label')?.textContent,
      ...[...(control.labels || [])].map(label => label.textContent),
    ].filter(Boolean).join(' ').toLowerCase();
    return /team|club|franchise|focus/.test(labels);
  }

  function mutationContainsPaletteTeamControl(node) {
    const element = node?.nodeType === 1 ? node : node?.parentElement;
    if (!element) return false;
    const candidates = new Set();
    const ancestorControl = element.closest?.(paletteTeamControlSelector);
    if (ancestorControl) candidates.add(ancestorControl);
    if (element.matches?.(paletteTeamControlSelector)) candidates.add(element);
    element.querySelectorAll?.(paletteTeamControlSelector).forEach(control => candidates.add(control));
    const label = element.closest?.('label');
    label?.querySelectorAll?.(paletteTeamControlSelector).forEach(control => candidates.add(control));
    return [...candidates].some(isPaletteTeamControl);
  }

  if (typeof PaletteTeamControlObserver === 'function') {
    const paletteTeamControlObserver = new PaletteTeamControlObserver(records => {
      if (records.some(record => [record.target, ...record.addedNodes].some(mutationContainsPaletteTeamControl))) {
        scheduleStudioPaletteSync();
      }
    });
    ['chemistryLabPanel', 'gameLabPanel', 'seasonLabPanel', 'compositeLabPanel', 'careerLabPanel']
      .map(byId)
      .filter(Boolean)
      .forEach(panel => paletteTeamControlObserver.observe(panel, { childList: true, subtree: true }));
  }

  documentRef.addEventListener('change', event => {
    if (studioPaletteRoot?.contains(event.target)) scheduleStudioPaletteSync();
  }, true);
  documentRef.addEventListener('click', event => {
    if (studioPaletteRoot?.contains(event.target)) scheduleStudioPaletteSync();
  }, true);
  if (typeof MutationObserver === 'function' && documentRef.body) {
    const modeObserver = new MutationObserver(scheduleStudioPaletteSync);
    modeObserver.observe(documentRef.body, { attributes: true, attributeFilter: ['class', 'data-court-mode', 'data-court-palette'] });
  }

  function workbenchModuleKey(workbench) {
    return workbench === 'composite' || workbench === 'career' ? 'advanced' : workbench;
  }

  function ensureWorkbenchModule(workbench) {
    const key = workbenchModuleKey(workbench);
    const definition = WORKBENCH_MODULES[key];
    if (!definition) return Promise.resolve(null);
    if (workbenchControllers.has(key)) return Promise.resolve(workbenchControllers.get(key));
    if (workbenchModulePromises.has(key)) return workbenchModulePromises.get(key);
    const promise = import(definition.path)
      .then(module => {
        const start = module?.[definition.exportName];
        if (typeof start !== 'function') throw new Error(`The ${key} workbench module did not expose its browser start function.`);
        const controller = start({
          documentRef,
          fetchImpl,
          ...(definition.useRegistry ? { registryUrl } : {}),
        });
        if (!controller) throw new Error(`The ${key} workbench could not attach to the Studio shell.`);
        workbenchControllers.set(key, controller);
        scheduleStudioPaletteSync();
        return controller;
      })
      .catch(error => {
        workbenchModulePromises.delete(key);
        throw error;
      });
    workbenchModulePromises.set(key, promise);
    return promise;
  }

  function setState(element, label, state = '') {
    if (!element) return;
    element.textContent = label;
    const token = state || String(label || '').trim().toLowerCase().replace(/\s+/g, '-');
    if (token) element.dataset.state = token;
    else delete element.dataset.state;
    element.classList.toggle('swishiq-state--ready', token === 'available' || token === 'ready');
  }

  function setBlueprintState(label, ready = false) {
    setState(blueprintState, label, ready ? 'available' : String(label || '').trim().toLowerCase().replace(/\s+/g, '-'));
  }

  function setBlueprintStatus(message) {
    if (blueprintStatus) blueprintStatus.textContent = message;
  }

  function cancelBlueprintRequest() {
    blueprintRequest?.cancel();
    blueprintRequest = null;
    blueprintMembershipsRequest?.cancel();
    blueprintMembershipsRequest = null;
  }

  // Player roster and player-season requests begin after the registry boot
  // deadline has been cleared. Give those child requests the same bounded
  // fetch behavior so a stalled artifact cannot leave the panel busy forever.
  function beginBlueprintRequest(work, timeoutMessage) {
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const guardedFetch = controller && typeof fetchImpl === 'function'
      ? (input, init = {}) => fetchImpl(input, { ...init, signal: controller.signal })
      : fetchImpl;
    let timeoutId = null;
    const task = Promise.resolve().then(() => work(guardedFetch));
    const timeout = new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        controller?.abort();
        reject(new Error(timeoutMessage));
      }, studioBootTimeoutMs(bootTimeoutMs));
    });
    const promise = Promise.race([task, timeout]).finally(() => {
      if (timeoutId !== null) clearTimeout(timeoutId);
    });
    return {
      promise,
      cancel() { controller?.abort(); },
    };
  }

  // Headshots and profile details enrich an already verified snapshot. Keep
  // that optional read out of Studio boot, share one request between selected
  // players, and leave initials as the reliable fallback if the enrichment
  // is unavailable.
  function loadBlueprintPlayerMetadata() {
    if (playerMetadataStatus === 'ready' || playerMetadataStatus === 'failed') {
      return Promise.resolve(playerMetadata);
    }
    if (playerMetadataPromise) return playerMetadataPromise;
    playerMetadataStatus = 'loading';
    const request = beginBlueprintRequest(
      requestFetch => loadSwishIqPlayerMetadata({ fetchImpl: requestFetch }),
      STUDIO_PLAYER_METADATA_TIMEOUT_MESSAGE,
    );
    playerMetadataPromise = request.promise
      .then(records => {
        playerMetadata = records;
        playerMetadataStatus = 'ready';
        if (selectedBlueprintPlayerRefs.size || blueprintProfilePlayerRef) renderBlueprintPlayer();
        return records;
      })
      .catch(() => {
        playerMetadata = new Map();
        playerMetadataStatus = 'failed';
        return playerMetadata;
      })
      .finally(() => {
        playerMetadataPromise = null;
      });
    return playerMetadataPromise;
  }

  function setBlueprintPickerDisabled(disabled) {
    if (!blueprintPlayerPicker || !blueprintPlayerPickerSummary) return;
    blueprintPlayerPicker.classList.toggle('is-disabled', disabled);
    blueprintPlayerPickerSummary.setAttribute('aria-disabled', String(disabled));
    if (disabled) {
      blueprintPlayerPicker.open = false;
      blueprintPlayerPickerSummary.setAttribute('tabindex', '-1');
    } else {
      blueprintPlayerPickerSummary.removeAttribute('tabindex');
    }
  }

  function clearBlueprintSnapshots() {
    blueprintSnapshots?.replaceChildren();
  }

  function playerBuilderV4Metric(row, key) {
    const metric = row?.metrics?.[key];
    return Number.isFinite(metric?.value) ? metric.value : null;
  }

  function ensurePlayerBuilderV4View(choices) {
    if (!blueprintPanel) return null;
    if (!blueprintV4View) {
      const root = createElement('section', 'swishiq-blueprint__v4-evidence');
      root.setAttribute('aria-labelledby', 'blueprintV4Title');
      const title = createElement('h3');
      title.id = 'blueprintV4Title';
      title.textContent = 'Verified V4 exact-season player evidence';
      const note = createElement('p');
      note.textContent = 'Full-season rows are descriptive observations. Names are the public identity key; provider IDs are not consumed. These records are ineligible as same-season prediction inputs.';
      const controls = createElement('div', 'swishiq-blueprint__v4-controls');
      const seasonLabel = createElement('label');
      seasonLabel.textContent = 'Exact season';
      const season = createElement('select');
      season.setAttribute('aria-label', 'V4 Player Builder exact season');
      seasonLabel.append(season);
      const teamLabel = createElement('label');
      teamLabel.textContent = 'Team';
      const team = createElement('select');
      team.setAttribute('aria-label', 'Filter V4 Player Builder rows by team');
      teamLabel.append(team);
      const searchLabel = createElement('label');
      searchLabel.textContent = 'Player name';
      const search = createElement('input');
      search.type = 'search';
      search.autocomplete = 'off';
      search.setAttribute('aria-label', 'Search V4 Player Builder names');
      searchLabel.append(search);
      controls.append(seasonLabel, teamLabel, searchLabel);
      const status = createElement('p');
      status.setAttribute('role', 'status');
      status.setAttribute('aria-live', 'polite');
      const tableWrap = createElement('div', 'swishiq-blueprint__roster-table-wrap');
      const table = createElement('table', 'swishiq-blueprint__roster-table');
      const caption = createElement('caption');
      caption.textContent = 'Verified exact-season player observations';
      const head = createElement('thead');
      const headRow = createElement('tr');
      for (const label of ['Player name ID', 'Team', 'GP', 'PTS', 'REB', 'AST', 'MIN']) {
        const th = createElement('th');
        th.scope = 'col';
        th.textContent = label;
        headRow.append(th);
      }
      head.append(headRow);
      const body = createElement('tbody');
      table.append(caption, head, body);
      tableWrap.append(table);
      root.append(title, note, controls, status, tableWrap);
      blueprintPanel.insertBefore(root, blueprintDirectory || blueprintSnapshots || null);
      blueprintV4View = { root, season, team, search, status, body, choices, rows: [], generation: 0 };
      const renderRows = () => {
        const query = String(search.value || '').trim().toLocaleLowerCase();
        const selectedTeam = team.value;
        const rows = blueprintV4View.rows.filter(row => (!selectedTeam || row.teamCode === selectedTeam)
          && (!query || `${row.displayName} ${row.normalizedPlayerNameKey}`.toLocaleLowerCase().includes(query)));
        body.replaceChildren();
        const fragment = documentRef.createDocumentFragment();
        for (const row of rows.slice(0, 250)) {
          const tr = createElement('tr');
          const values = [row.displayName, row.teamCode, row.games, playerBuilderV4Metric(row, 'pointsPerGame'),
            playerBuilderV4Metric(row, 'reboundsPerGame'), playerBuilderV4Metric(row, 'assistsPerGame'), row.minutes];
          for (const value of values) {
            const td = createElement('td');
            td.textContent = value === null || value === undefined ? '—' : String(value);
            tr.append(td);
          }
          tr.dataset.playerNameKey = row.normalizedPlayerNameKey;
          tr.dataset.seasonStartYear = String(row.seasonStartYear);
          fragment.append(tr);
        }
        body.append(fragment);
        const suffix = rows.length > 250 ? ` Showing the first 250 of ${rows.length.toLocaleString()}.` : '';
        status.textContent = `${rows.length.toLocaleString()} exact regular-season player/team rows for ${blueprintV4View.season.value || 'the selected season'}. Descriptive only; no model was run.${suffix}`;
      };
      team.addEventListener('change', renderRows);
      search.addEventListener('input', renderRows);
      season.addEventListener('change', () => { void loadPlayerBuilderV4Season(Number(season.value)); });
      blueprintV4View.renderRows = renderRows;
    }
    blueprintV4View.choices = choices;
    blueprintV4View.season.replaceChildren(...choices.map(choice => createOption(choice.label, String(choice.seasonStartYear))));
    if (choices.length && !choices.some(choice => String(choice.seasonStartYear) === blueprintV4View.season.value)) {
      blueprintV4View.season.value = String(choices.at(-1).seasonStartYear);
    }
    return blueprintV4View;
  }

  async function loadPlayerBuilderV4Season(year) {
    const view = blueprintV4View;
    if (!view) return;
    const choice = view.choices.find(row => row.seasonStartYear === year);
    if (!choice) {
      view.status.textContent = 'The selected exact V4 season is not available in the reviewed release pin.';
      view.rows = [];
      view.team.replaceChildren(createOption('All teams', ''));
      view.body.replaceChildren();
      return;
    }
    const token = ++blueprintV4RequestToken;
    view.generation = token;
    view.status.textContent = `Verifying exact ${choice.label} player-season and roster evidence…`;
    view.root.setAttribute('aria-busy', 'true');
    view.season.disabled = true;
    view.team.disabled = true;
    view.search.disabled = true;
    try {
      const request = beginBlueprintRequest(requestFetch => loadCanonicalV4PlayerBuilderSeason({
        seasonStartYear: year,
        releasePin: CANONICAL_V4_STUDIO_RUNTIME_RELEASE_PIN,
        fetchImpl: requestFetch,
      }), STUDIO_PLAYER_SEASONS_TIMEOUT_MESSAGE);
      blueprintRequest = request;
      const result = await request.promise;
      if (token !== blueprintV4RequestToken) return;
      view.rows = result.rows;
      const teams = [...new Set(result.rows.map(row => row.teamCode))].sort();
      view.team.replaceChildren(createOption('All teams', ''), ...teams.map(code => createOption(teamDisplayLabel(code), code)));
      view.status.textContent = `${result.rowCount.toLocaleString()} exact regular-season observations verified from ${result.package.packageId} ${result.package.packageVersion}. Descriptive only; model execution and predictive eligibility remain off.`;
      view.renderRows();
    } catch (error) {
      if (token !== blueprintV4RequestToken) return;
      view.rows = [];
      view.body.replaceChildren();
      view.team.replaceChildren(createOption('All teams', ''));
      view.status.textContent = error?.message || 'The exact V4 Player Builder evidence could not be verified. No V3 data was substituted.';
    } finally {
      if (token === blueprintV4RequestToken) {
        view.root.removeAttribute('aria-busy');
        view.season.disabled = false;
        view.team.disabled = false;
        view.search.disabled = false;
      }
      if (blueprintRequest) blueprintRequest = null;
    }
  }

  function renderPlayerBuilderV4Mode(policy) {
    const view = ensurePlayerBuilderV4View(listCanonicalV4PlayerBuilderExactChoices(CANONICAL_V4_STUDIO_RUNTIME_RELEASE_PIN));
    if (!view) return;
    view.root.hidden = false;
    if (blueprintDirectory) blueprintDirectory.hidden = true;
    if (blueprintSnapshots) blueprintSnapshots.hidden = true;
    blueprintPanel?.querySelector('.swishiq-blueprint__season-picker')?.setAttribute('hidden', '');
    if (blueprintSeasonControls) blueprintSeasonControls.hidden = true;
    setBlueprintPickerDisabled(true);
    if (!policy.releaseReady || !view.choices.length) {
      view.status.textContent = `${policy.reason} Player Builder is V4-only after this selection; no V3 data is loaded.`;
      view.rows = [];
      view.body.replaceChildren();
      view.season.disabled = true;
      view.team.disabled = true;
      view.search.disabled = true;
      return;
    }
    view.season.disabled = false;
    view.team.disabled = false;
    view.search.disabled = false;
    void loadPlayerBuilderV4Season(Number(view.season.value));
  }

  function restorePlayerBuilderV3Mode() {
    if (blueprintV4View) blueprintV4View.root.hidden = true;
    if (blueprintDirectory) blueprintDirectory.hidden = false;
    blueprintPanel?.querySelector('.swishiq-blueprint__season-picker')?.removeAttribute('hidden');
    if (blueprintSeasonControls) blueprintSeasonControls.hidden = false;
  }

  function renderBlueprintFilters() {
    const membershipsReady = blueprintMembershipsStatus === 'ready';
    const membershipsUnavailable = blueprintMembershipsStatus === 'failed';
    const setFilterOptions = (control, options, fallbackLabel) => {
      if (!control) return;
      const previous = control.value;
      control.replaceChildren(createOption(fallbackLabel, ''), ...options.map(option => createOption(option.label, option.value)));
      if (options.some(option => option.value === previous)) control.value = previous;
      else control.value = '';
      control.disabled = options.length === 0;
    };
    const teamCodes = [...new Set((membershipsReady ? blueprint.memberships : []).map(row => row?.teamCode).filter(code => TEAM_CODE.test(String(code || ''))))]
      .sort()
      .map(value => ({ value, label: teamDisplayLabel(value) }));
    const positions = [...new Set((membershipsReady
      ? blueprint.memberships.flatMap(row => row.positions || [])
      : blueprint.players.flatMap(player => player.positions || [])))]
      .filter(position => POSITION_CODES.has(position))
      .sort()
      .map(value => ({ value, label: value === 'G' ? 'Guard (G)' : value === 'F' ? 'Forward (F)' : 'Center (C)' }));
    setFilterOptions(blueprintTeamFilter, teamCodes, membershipsReady
      ? 'All teams'
      : membershipsUnavailable ? 'Teams unavailable' : 'Loading teams…');
    setFilterOptions(blueprintPositionFilter, positions, 'All positions');
    if (blueprintCoverageFilter) {
      const previous = blueprintCoverageFilter.value || blueprintCoverageSelection;
      const seasonStartYear = Number(selectedPackage?.package?.scope?.seasonStartYear || 0);
      const publicStatsReady = membershipsReady
        && blueprintRosterStatsYear === seasonStartYear
        && blueprintRosterStats instanceof Map;
      const publicStatsUnavailable = blueprintRosterStatsYear === seasonStartYear && Boolean(blueprintRosterStatsError);
      const coverageLabel = !membershipsReady
        ? membershipsUnavailable ? 'Coverage unavailable' : 'Loading coverage…'
        : publicStatsReady ? 'Any coverage'
          : publicStatsUnavailable ? 'Coverage unavailable' : 'Loading stats…';
      blueprintCoverageFilter.replaceChildren(
        createOption(coverageLabel, ''),
        ...(publicStatsReady ? [
          createOption('10+ games', '10'),
          createOption('20+ games', '20'),
          createOption('40+ games', '40'),
        ] : []),
      );
      blueprintCoverageFilter.value = [...blueprintCoverageFilter.options].some(option => option.value === previous) ? previous : '';
      blueprintCoverageFilter.disabled = !membershipsReady || blueprint.memberships.length === 0 || !publicStatsReady;
    }
    refreshPaletteSelect(blueprintTeamFilter);
    refreshPaletteSelect(blueprintPositionFilter);
    refreshPaletteSelect(blueprintCoverageFilter);
  }

  /** Keep the native select keyboard-friendly while making a long published
   * player list quick to scan. Search only filters verified player rows; it
   * never creates or infers a player that is absent from the package. */
  function getBlueprintPlayerIndex() {
    const players = blueprint.players;
    const memberships = blueprint.memberships;
    if (blueprintPlayerIndex?.players === players && blueprintPlayerIndex.memberships === memberships) {
      return blueprintPlayerIndex;
    }

    blueprintPlayerIndex = {
      players,
      memberships,
      records: players.map(player => ({ ...player })),
    };
    return blueprintPlayerIndex;
  }

  function selectedBlueprintCoverage() {
    const seasonStartYear = Number(selectedPackage?.package?.scope?.seasonStartYear || 0);
    return blueprintMembershipsStatus === 'ready'
      && blueprintRosterStatsYear === seasonStartYear
      && blueprintRosterStats instanceof Map
      ? Number(blueprintCoverageFilter?.value || 0)
      : 0;
  }

  function currentBlueprintRowsFor(players, minGames = selectedBlueprintCoverage()) {
    const seasonStartYear = Number(selectedPackage?.package?.scope?.seasonStartYear || 0);
    if (blueprintMembershipsStatus !== 'ready') return [];
    const rows = buildBlueprintRosterRows({
        players,
        memberships: blueprint.memberships,
        seasonStartYear,
        teamCode: blueprintTeamFilter?.value || '',
      });
    return minGames > 0
      ? filterBlueprintRowsByPublicGames(rows, blueprintRosterStats, minGames)
      : rows;
  }

  function filteredBlueprintPlayers() {
    const query = String(blueprintSearch?.value || '').trim();
    const teamFilter = String(blueprintTeamFilter?.value || '').trim().toUpperCase();
    const positionFilter = String(blueprintPositionFilter?.value || '').trim().toUpperCase();
    const hasMembershipRows = blueprint.memberships.length > 0;
    const index = getBlueprintPlayerIndex();
    const matchingRefs = hasMembershipRows && (teamFilter || positionFilter)
      ? new Set(blueprint.memberships.filter(row => (
        (!teamFilter || row.teamCode === teamFilter)
        && (!positionFilter || row.positions?.includes(positionFilter))
      )).map(row => row.playerRef))
      : null;
    const players = filterSelectorRecords(index.records, { query: '' }).filter(player => (
      matchesBlueprintNameQuery(player.displayName, query)
      && (!hasMembershipRows || (!teamFilter && !positionFilter) || matchingRefs?.has(player.playerRef))
    ));
    const minGames = selectedBlueprintCoverage();
    if (!minGames || blueprintMembershipsStatus !== 'ready') return players;
    const coveredPlayerRefs = new Set(currentBlueprintRowsFor(players, minGames)
      .map(({ player }) => player.playerRef));
    return players.filter(player => coveredPlayerRefs.has(player.playerRef));
  }

  function currentBlueprintRosterRows(players = filteredBlueprintPlayers()) {
    return currentBlueprintRowsFor(players);
  }

  function setBlueprintRosterStatus(players = filteredBlueprintPlayers(), rows = currentBlueprintRosterRows(players), page = null) {
    if (!blueprint.players.length) {
      setBlueprintStatus(blueprintSeasonsStatus === 'failed'
        ? 'Player data could not be loaded.'
        : 'Loading players and exact-season rosters.');
      return;
    }
    if (!players.length) {
      setBlueprintStatus(selectedBlueprintPlayerRefs.size
        ? `${blueprintPlayerFilterStatusMessage(0, selectedBlueprintPlayerRefs.size)} Adjust the filters to find a profile.`
        : 'No players match these filters. Adjust the search or filters to continue.');
      return;
    }
    if (blueprintMembershipsStatus === 'failed') {
      setBlueprintStatus(`${players.length} matching player${players.length === 1 ? '' : 's'} remain available. Exact-season rosters could not be loaded.`);
      return;
    }
    if (blueprintMembershipsStatus !== 'ready') {
      setBlueprintStatus(`${blueprint.players.length} players ready. Exact team-season rosters are loading.`);
      return;
    }
    if (!(blueprintRosterStats instanceof Map) && !blueprintRosterStatsError) {
      setBlueprintStatus(`${blueprint.players.length} players and ${blueprint.memberships.length} exact-season roster rows ready. Stats are loading.`);
      return;
    }
    const profilePlayer = blueprint.players.find(player => player.playerRef === blueprintProfilePlayerRef);
    const comparisonCopy = selectedBlueprintPlayerRefs.size
      ? `${selectedBlueprintPlayerRefs.size} selected for comparison.`
      : 'Compare players below.';
    const action = profilePlayer
      ? `Viewing ${profilePlayer.displayName} profile. ${comparisonCopy}`
      : selectedBlueprintPlayerRefs.size
        ? comparisonCopy
        : 'Open a row for a player profile, or compare players below.';
    const range = page?.total
      ? ` Showing rows ${page.startIndex + 1}–${page.endIndex} of ${page.total}.`
      : '';
    setBlueprintStatus(`${players.length} matching player${players.length === 1 ? '' : 's'} · ${rows.length} exact team-season row${rows.length === 1 ? '' : 's'}.${range} ${action}`);
  }

  function renderBlueprintRoster({ focusPageControl = '', focusSortKey = '', scrollLeft = null } = {}) {
    if (!blueprintRoster) return;
    blueprintRoster.replaceChildren();
    const message = text => {
      const note = createElement('p', 'swishiq-blueprint__empty');
      note.textContent = text;
      blueprintRoster.append(note);
    };
    const loadingState = text => {
      message(text);
      const tableWrap = createElement('div', 'swishiq-blueprint__roster-table-wrap swishiq-blueprint__roster-table-wrap--loading');
      tableWrap.setAttribute('aria-hidden', 'true');
      const table = createElement('table', 'swishiq-blueprint__roster-table swishiq-blueprint__roster-table--loading');
      const caption = createElement('caption');
      caption.textContent = 'Roster loading';
      table.append(caption);
      const head = createElement('thead');
      const headRow = createElement('tr');
      BLUEPRINT_ROSTER_SORT_COLUMNS.forEach(({ label }) => {
        const cell = createElement('th');
        cell.scope = 'col';
        cell.textContent = label;
        headRow.append(cell);
      });
      head.append(headRow);
      table.append(head);
      const body = createElement('tbody');
      for (let rowIndex = 0; rowIndex < 12; rowIndex += 1) {
        const row = createElement('tr');
        const cell = createElement('td');
        cell.setAttribute('colspan', String(BLUEPRINT_ROSTER_SORT_COLUMNS.length));
        const line = createElement('span', 'swishiq-blueprint__roster-skeleton-line');
        line.setAttribute('aria-hidden', 'true');
        row.append(cell);
        cell.append(line);
        body.append(row);
      }
      table.append(body);
      tableWrap.append(table);
      blueprintRoster.append(tableWrap);
    };
    if (!blueprint.players.length) {
      const loading = blueprintSeasonsStatus !== 'failed';
      (loading ? loadingState : message)(loading
        ? 'Loading players and exact-season rosters…'
        : 'Player data could not be loaded.');
      if (blueprintSeasonsStatus === 'failed') {
        const retry = createElement('button', 'button-secondary swishiq-blueprint__retry');
        retry.type = 'button';
        retry.textContent = 'Retry player data';
        retry.addEventListener('click', () => { retry.disabled = true; void loadBlueprintFor(selectedPackage); });
        blueprintRoster.append(retry);
      }
      return;
    }
    if (blueprintMembershipsStatus === 'failed') {
      message('Exact-season roster data is unavailable.');
      const retry = createElement('button', 'button-secondary swishiq-blueprint__retry');
      retry.type = 'button';
      retry.textContent = 'Retry roster data';
      retry.addEventListener('click', () => { retry.disabled = true; void loadBlueprintMembershipsFor(selectedPackage); });
      blueprintRoster.append(retry);
      setBlueprintRosterStatus();
      return;
    }
    if (blueprintMembershipsStatus !== 'ready') {
      loadingState('Loading exact-season roster data…');
      setBlueprintRosterStatus();
      return;
    }

    if (!(blueprintRosterStats instanceof Map) && !blueprintRosterStatsError) {
      loadingState('Loading exact team-season stats…');
      setBlueprintRosterStatus();
      return;
    }

    const players = filteredBlueprintPlayers();
    const rows = currentBlueprintRosterRows(players);
    if (!rows.length) {
      message(players.length
        ? 'No exact regular-season rows match the current team and season filters.'
        : 'No players match these filters. Adjust the search or filters to continue.');
      setBlueprintRosterStatus(players, rows);
      return;
    }
    const displayRows = rows.map(entry => ({
      ...entry,
      publicStats: blueprintRosterPublicStats(entry, blueprintRosterStats),
    }));
    const sortedRows = sortBlueprintRosterRows(displayRows, blueprintRosterSort.key, blueprintRosterSort.direction);
    const page = paginateBlueprintRosterRows(sortedRows, blueprintRosterPage);
    blueprintRosterPage = page.page;

    const packageYear = Number(selectedPackage?.package?.scope?.seasonStartYear || 0);
    const tableWrap = createElement('div', 'swishiq-blueprint__roster-table-wrap');
    tableWrap.setAttribute('role', 'region');
    tableWrap.setAttribute('tabindex', '0');
    const rosterSeasonLabel = `${packageYear}–${String(packageYear + 1).slice(-2)}`;
    tableWrap.setAttribute('aria-label', `Player roster stats for ${rosterSeasonLabel}`);
    const table = createElement('table', 'swishiq-blueprint__roster-table');
    const caption = createElement('caption');
    caption.textContent = `${rosterSeasonLabel} regular-season player stats`;
    table.append(caption);
    const head = createElement('thead');
    const headRow = createElement('tr');
    BLUEPRINT_ROSTER_SORT_COLUMNS.forEach(({ key, label, ariaLabel = label }) => {
      const cell = createElement('th');
      cell.scope = 'col';
      const active = key === blueprintRosterSort.key;
      cell.setAttribute('aria-sort', active ? blueprintRosterSort.direction : 'none');
      const sortAction = createElement('button', 'swishiq-blueprint__sort-action');
      sortAction.type = 'button';
      sortAction.setAttribute('data-blueprint-sort-key', key);
      sortAction.setAttribute('aria-label', `Sort by ${ariaLabel}${active ? `, sorted ${blueprintRosterSort.direction}` : ''}`);
      const sortLabel = createElement('span');
      sortLabel.textContent = label;
      const indicator = createElement('span', 'swishiq-blueprint__sort-indicator');
      indicator.setAttribute('aria-hidden', 'true');
      indicator.textContent = active ? (blueprintRosterSort.direction === 'ascending' ? '▲' : '▼') : '';
      sortAction.append(sortLabel, indicator);
      sortAction.addEventListener('click', () => {
        const direction = key === blueprintRosterSort.key
          ? blueprintRosterSort.direction === 'ascending' ? 'descending' : 'ascending'
          : defaultBlueprintRosterSortDirection(key);
        const retainedScrollLeft = Number.isFinite(Number(tableWrap.scrollLeft)) ? Number(tableWrap.scrollLeft) : 0;
        blueprintRosterSort = { key, direction };
        blueprintRosterPage = 0;
        renderBlueprintRoster({ focusSortKey: key, scrollLeft: retainedScrollLeft });
      });
      cell.append(sortAction);
      headRow.append(cell);
    });
    head.append(headRow);
    table.append(head);
    const body = createElement('tbody');
    page.rows.forEach(({ player, row, publicStats }) => {
      const rowSourceState = blueprintRosterRowSourceState(publicStats, blueprintRosterStats, blueprintRosterStatsError);
      const tableRow = createElement('tr');
      if (blueprintProfilePlayerRef === player.playerRef) tableRow.setAttribute('aria-current', 'true');
      const name = createElement('th');
      name.scope = 'row';
      const action = createElement('button', 'swishiq-blueprint__profile-action');
      action.type = 'button';
      action.textContent = player.displayName;
      action.setAttribute('aria-label', `View ${player.displayName} profile for ${row.teamCode}`);
      const openProfile = () => {
        blueprintProfilePlayerRef = player.playerRef;
        blueprintProfileFocusRequested = true;
        blueprintRosterPage = 0;
        if (blueprintTeamFilter && blueprintTeamFilter.value !== row.teamCode) {
          blueprintTeamFilter.value = row.teamCode;
          refreshPaletteSelect(blueprintTeamFilter);
        }
        renderBlueprintOptions();
        renderBlueprintRoster();
        renderBlueprintPlayer();
        setBlueprintRosterStatus();
        const profile = blueprintSnapshots?.querySelector('.swishiq-blueprint__snapshot');
        profile?.focus?.({ preventScroll: true });
      };
      action.addEventListener('click', openProfile);
      name.append(action);
      const position = createElement('td');
      position.textContent = player.positions.join('/');
      const team = createElement('td');
      team.textContent = row.teamCode;
      const values = ['games', 'pointsPerGame', 'minutesPerGame', 'assistsPerGame', 'reboundsPerGame'].map(key => {
        const cell = createElement('td');
        const isGames = key === 'games';
        const metricUnit = key === 'minutesPerGame' ? 'minutes-per-game' : 'per-game';
        const value = isGames
          ? (Number.isFinite(publicStats?.totals?.gamesPlayed) ? publicStats.totals.gamesPlayed : null)
          : metricValue(publicStats, key, metricUnit);
        const metricLabel = ({ games: 'games played', minutesPerGame: 'minutes per game', pointsPerGame: 'points per game', assistsPerGame: 'assists per game', reboundsPerGame: 'rebounds per game' })[key];
        const displayValue = value === null
          ? rowSourceState === 'loading' ? 'Checking…' : '—'
          : isGames ? formatInteger(value) : formatMetric(value);
        cell.textContent = displayValue;
        cell.setAttribute('aria-label', value === null
          ? rowSourceState === 'loading'
            ? `${metricLabel} checking`
            : `${metricLabel} unavailable`
          : `${displayValue} ${metricLabel}`);
        return cell;
      });
      tableRow.addEventListener('click', event => {
        if (event.target?.closest?.('a, button, input, select, textarea')) return;
        openProfile();
      });
      tableRow.append(name, position, team, ...values);
      body.append(tableRow);
    });
    table.append(body);
    tableWrap.append(table);
    blueprintRoster.append(tableWrap);
    if (Number.isFinite(Number(scrollLeft))) tableWrap.scrollLeft = Number(scrollLeft);
    if (focusSortKey) {
      table.querySelector(`[data-blueprint-sort-key="${focusSortKey}"]`)?.focus?.({ preventScroll: true });
    }
    if (page.pageCount > 1) {
      const navigation = createElement('nav', 'swishiq-blueprint__roster-pagination');
      navigation.setAttribute('aria-label', 'Roster pages');
      const previous = createElement('button', 'swishiq-blueprint__page-action');
      previous.type = 'button';
      previous.textContent = 'Previous';
      previous.setAttribute('aria-label', 'Previous roster page');
      previous.disabled = page.page === 0;
      const summary = createElement('span', 'swishiq-blueprint__page-summary');
      summary.textContent = `Page ${page.page + 1} of ${page.pageCount} · rows ${page.startIndex + 1}–${page.endIndex} of ${page.total}`;
      const next = createElement('button', 'swishiq-blueprint__page-action');
      next.type = 'button';
      next.textContent = 'Next';
      next.setAttribute('aria-label', 'Next roster page');
      next.disabled = page.page >= page.pageCount - 1;
      previous.addEventListener('click', () => {
        blueprintRosterPage = Math.max(0, page.page - 1);
        renderBlueprintRoster({ focusPageControl: 'previous' });
      });
      next.addEventListener('click', () => {
        blueprintRosterPage = Math.min(page.pageCount - 1, page.page + 1);
        renderBlueprintRoster({ focusPageControl: 'next' });
      });
      navigation.append(previous, summary, next);
      blueprintRoster.append(navigation);
      if (focusPageControl) {
        const preferred = focusPageControl === 'previous' ? previous : next;
        const fallback = focusPageControl === 'previous' ? next : previous;
        (preferred.disabled ? fallback : preferred)?.focus?.({ preventScroll: true });
      }
    }
    setBlueprintRosterStatus(players, rows, page);
  }

  function renderBlueprintOptions() {
    if (!blueprintSelect) return;
    const query = String(blueprintSearch?.value || '').trim();
    const players = filteredBlueprintPlayers();
    // Filters narrow the visible options, but they must not erase a valid
    // multi-selection just because its row is temporarily hidden. This keeps
    // search/team/position/coverage filters useful while preserving the
    // selected package-bound player refs for comparison and keyboard users.
    selectedBlueprintPlayerRefs = retainSelectedBlueprintPlayerRefs(selectedBlueprintPlayerRefs, blueprint.players);
    blueprintSelect.replaceChildren(...players.map(player => {
      const option = createOption(`${player.displayName} · ${player.positions.join('/')}`, player.playerRef);
      option.selected = selectedBlueprintPlayerRefs.has(player.playerRef);
      return option;
    }));
    if (blueprintPlayerMenu) {
      blueprintPlayerMenu.replaceChildren();
      // Build the enhanced touch menu only while it is open. The native
      // multi-select remains populated for keyboard users, while initial
      // roster/filter renders avoid constructing 120 extra button trees.
      if (blueprintPlayerPicker?.open) {
        if (!players.length) {
          const empty = createElement('p', 'swishiq-player-picker__empty');
          empty.textContent = query ? 'No matching players' : 'No players available';
          blueprintPlayerMenu.append(empty);
        }
        const visibleMenuPlayers = players.slice(0, BLUEPRINT_CUSTOM_OPTION_LIMIT);
        visibleMenuPlayers.forEach(player => {
        const option = createElement('button', 'swishiq-player-picker__option');
        option.type = 'button';
        option.dataset.playerRef = player.playerRef;
        option.setAttribute('role', 'option');
        option.setAttribute('aria-label', `${player.displayName} · ${player.positions.join('/') || 'Player'}`);
        option.setAttribute('aria-selected', String(selectedBlueprintPlayerRefs.has(player.playerRef)));
        const initials = createElement('span', 'swishiq-player-picker__option-initials');
        initials.textContent = player.displayName.split(/\s+/).filter(Boolean).map(part => part[0]).join('').slice(0, 2).toUpperCase() || 'P';
        const copy = createElement('span', 'swishiq-player-picker__option-copy');
        const name = createElement('strong'); name.textContent = player.displayName;
        const meta = createElement('small'); meta.textContent = [player.teamCode, player.positions.join('/')].filter(Boolean).join(' · ') || 'Player';
        copy.append(name, meta);
        const check = createElement('span', 'swishiq-player-picker__option-check');
        check.setAttribute('aria-hidden', 'true');
        check.textContent = selectedBlueprintPlayerRefs.has(player.playerRef) ? '✓' : '';
        option.append(initials, copy, check);
        const togglePlayer = event => {
          event.preventDefault();
          event.stopPropagation();
          blueprintProfilePlayerRef = '';
          blueprintProfileFocusRequested = false;
          selectedBlueprintPlayerRefs = toggleBlueprintPlayerSelection(
            selectedBlueprintPlayerRefs,
            player.playerRef,
            blueprint.players,
          );
          renderBlueprintOptions();
          renderBlueprintPlayer();
          setBlueprintRosterStatus();
          // Rebuilding the visible menu is necessary to update every checked
          // state. Put focus back on the toggled option when it remains
          // visible so Enter/Space and touch users can continue in place.
          const nextOption = [...(blueprintPlayerMenu?.querySelectorAll('button[data-player-ref]') || [])]
            .find(candidate => candidate.dataset.playerRef === player.playerRef);
          nextOption?.focus({ preventScroll: true });
        };
        option.addEventListener('keydown', event => {
          if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
          const options = [...(blueprintPlayerMenu?.querySelectorAll('button[data-player-ref]') || [])];
          const currentIndex = options.indexOf(event.currentTarget);
          if (currentIndex < 0 || !options.length) return;
          const targetIndex = event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? options.length - 1
              : (currentIndex + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
          event.preventDefault();
          options[targetIndex]?.focus();
        });
        // Keep the disclosure open while each button toggles independently.
        // A single click path works for pointer and keyboard activation and
        // avoids re-rendering between pointerdown and click on long menus.
          option.addEventListener('click', togglePlayer);
          blueprintPlayerMenu.append(option);
        });
        if (players.length > visibleMenuPlayers.length) {
          const notice = createElement('p', 'swishiq-player-picker__empty');
          notice.textContent = query
            ? `Showing the first ${BLUEPRINT_CUSTOM_OPTION_LIMIT} matches. Refine your search to narrow the list.`
            : `Showing the first ${BLUEPRINT_CUSTOM_OPTION_LIMIT} players. Search to narrow the list.`;
          blueprintPlayerMenu.append(notice);
        }
      }
    }
    const count = selectedBlueprintPlayerRefs.size;
    if (blueprintPlayerPickerSummary) blueprintPlayerPickerSummary.textContent = count
      ? `${count} selected for comparison`
      : 'Compare players';
  }

  function createElement(tag, className = '') {
    const element = documentRef.createElement(tag);
    if (className) element.className = className;
    return element;
  }

  function createOption(label, value) {
    const option = createElement('option');
    option.value = value;
    option.textContent = label;
    return option;
  }

  // Keep the native select as the semantic source of truth, while presenting
  // the compact swatch/check menu used by the Team palette for the Studio's
  // high-frequency single-value filters. This also gives long season/team
  // lists a consistent, scannable surface without changing their values.
  const palettePickerDetails = new Set();
  const palettePickerApis = new Map();
  function setPickerSwatch(node, teamId, fallbackText) {
    if (!node) return;
    node.replaceChildren();
    delete node.dataset.expectedSrc;
    const logoUrl = teamLogoUrl(teamId);
    if (logoUrl) {
      const logo = createElement('img');
      logo.alt = '';
      logo.loading = 'lazy';
      node.dataset.expectedSrc = logoUrl;
      logo.decoding = 'async';
      logo.addEventListener('error', () => {
        if (node.dataset.expectedSrc !== logo.getAttribute('src')) return;
        node.textContent = fallbackText;
        node.classList.remove('has-logo');
        delete node.dataset.expectedSrc;
      });
      node.classList.add('has-logo');
      node.append(logo);
      // Establish ownership and the fallback listener before assigning src;
      // cached or test-provided image implementations may report failure
      // during the assignment itself.
      logo.src = logoUrl;
      return;
    }
    node.classList.remove('has-logo');
    node.textContent = fallbackText;
  }
  function mountPaletteSelect(control, labelId) {
    if (!control) return null;
    if (control.__swishIqPalettePicker) return control.__swishIqPalettePicker;
    const host = control.parentElement;
    if (!host) return null;
    const details = host.querySelector(`details.swishiq-filter-picker[data-for="${control.id}"]`)
      || createElement('details', 'swishiq-filter-picker');
    details.dataset.for = control.id;
    const summary = details.querySelector('.swishiq-filter-picker__summary')
      || createElement('summary', 'swishiq-filter-picker__summary');
    summary.setAttribute('aria-haspopup', 'listbox');
    if (!summary.hasAttribute('aria-expanded')) summary.setAttribute('aria-expanded', 'false');
    const identity = summary.querySelector('.swishiq-filter-picker__identity')
      || createElement('span', 'swishiq-filter-picker__identity');
    const swatch = identity.querySelector('.swishiq-filter-picker__swatch')
      || createElement('span', 'swishiq-filter-picker__swatch');
    swatch.setAttribute('aria-hidden', 'true');
    const copy = identity.querySelector('.swishiq-filter-picker__copy')
      || createElement('span', 'swishiq-filter-picker__copy');
    const value = copy.querySelector('.swishiq-filter-picker__value')
      || createElement('strong', 'swishiq-filter-picker__value');
    if (!copy.contains(value)) copy.append(value);
    if (!identity.contains(swatch)) identity.prepend(swatch);
    if (!identity.contains(copy)) identity.append(copy);
    const chevron = summary.querySelector('.swishiq-filter-picker__chevron')
      || createElement('span', 'swishiq-filter-picker__chevron');
    chevron.setAttribute('aria-hidden', 'true');
    chevron.textContent = '▾';
    if (!summary.contains(identity)) summary.prepend(identity);
    if (!summary.contains(chevron)) summary.append(chevron);
    const panel = details.querySelector('.swishiq-filter-picker__panel')
      || createElement('div', 'swishiq-filter-picker__panel');
    const options = panel.querySelector('.swishiq-filter-picker__options')
      || createElement('div', 'swishiq-filter-picker__options');
    options.setAttribute('role', 'listbox');
    options.setAttribute('aria-label', documentRef.getElementById(labelId)?.textContent || 'Options');
    if (!panel.contains(options)) panel.append(options);
    if (!details.contains(summary)) details.prepend(summary);
    if (!details.contains(panel)) details.append(panel);
    if (!details.isConnected) host.insertBefore(details, control);
    control.classList.add('swishiq-native-select');
    const refresh = () => {
      const selected = [...control.options].find(option => option.value === control.value)
        || control.options[0]
        || null;
      const label = documentRef.getElementById(labelId)?.textContent || 'Option';
      const selectedText = selected?.textContent?.trim() || 'Choose';
      value.textContent = selectedText;
      setPickerSwatch(
        swatch,
        control.id === 'blueprintTeamFilter' ? selected?.value : '',
        selected?.value ? String(selected.value).slice(0, 3).toUpperCase() : 'ALL',
      );
      summary.setAttribute('aria-label', `${label}: ${selectedText}`);
      summary.setAttribute('aria-expanded', String(details.open));
      summary.toggleAttribute('aria-disabled', control.disabled);
      details.classList.toggle('is-disabled', control.disabled);
      if (control.disabled) details.open = false;
      options.replaceChildren();
      [...control.options].forEach(option => {
        const row = createElement('button', 'swishiq-filter-picker__option');
        row.type = 'button';
        row.setAttribute('role', 'option');
        row.setAttribute('aria-label', option.textContent?.trim() || 'Option');
        row.setAttribute('aria-selected', String(option.value === control.value));
        row.disabled = Boolean(option.disabled || control.disabled);
        const optionSwatch = createElement('span', 'swishiq-filter-picker__option-swatch');
        optionSwatch.setAttribute('aria-hidden', 'true');
        setPickerSwatch(
          optionSwatch,
          control.id === 'blueprintTeamFilter' ? option.value : '',
          option.value ? String(option.value).slice(0, 3).toUpperCase() : 'ALL',
        );
        const optionCopy = createElement('span', 'swishiq-filter-picker__option-copy');
        optionCopy.textContent = option.textContent?.trim() || 'Option';
        const check = createElement('span', 'swishiq-filter-picker__option-check');
        check.setAttribute('aria-hidden', 'true');
        check.textContent = option.value === control.value ? '✓' : '';
        row.append(optionSwatch, optionCopy, check);
        const chooseOption = event => {
          event?.preventDefault?.();
          if (control.disabled) return;
          control.value = option.value;
          control.dispatchEvent(new Event('change', { bubbles: true }));
          details.open = false;
          summary.focus();
        };
        row.addEventListener('pointerdown', chooseOption);
        row.addEventListener('click', event => { if (event.detail === 0) chooseOption(event); });
        options.append(row);
      });
    };
    details.addEventListener('toggle', () => {
      summary.setAttribute('aria-expanded', String(details.open));
      if (details.open && !control.disabled) options.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
    });
    details.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        details.open = false;
        summary.focus();
      }
    });
    control.addEventListener('change', refresh);
    palettePickerDetails.add(details);
    const api = Object.freeze({ refresh, details, summary });
    control.__swishIqPalettePicker = api;
    palettePickerApis.set(control, api);
    refresh();
    return api;
  }
  const refreshPaletteSelect = control => palettePickerApis.get(control)?.refresh();
  documentRef.addEventListener('pointerdown', event => {
    palettePickerDetails.forEach(details => {
      if (details.open && !details.contains(event.target)) details.open = false;
    });
  });
  mountPaletteSelect(select, 'packageSelectLabel');
  const blueprintFilterGroup = documentRef.querySelector('.swishiq-blueprint__filters');
  if (blueprintFilterGroup) {
    blueprintFilterGroup.setAttribute('role', 'group');
    blueprintFilterGroup.setAttribute('aria-label', 'Player filters and search');
  }
  mountPaletteSelect(blueprintTeamFilter, 'blueprintTeamFilterLabel');
  mountPaletteSelect(blueprintPositionFilter, 'blueprintPositionFilterLabel');
  mountPaletteSelect(blueprintCoverageFilter, 'blueprintCoverageFilterLabel');

  // The shell's Team palette remains the visual source for the hero identity.
  // One decorative image uses the reviewed retro-opaque mark when available,
  // then the current mark for other teams. The shared pseudo layer is a
  // fallback only, never a second visible logo.
  const hero = documentRef.querySelector('.swishiq-hero');
  const heroTeamLogo = hero?.querySelector('[data-hero-team-logo]');
  if (hero && heroTeamLogo && heroTeamLogo.dataset.fallbackBound !== 'true') {
    heroTeamLogo.dataset.fallbackBound = 'true';
    heroTeamLogo.addEventListener('load', () => {
      if (!heroTeamLogo.dataset.expectedSrc || heroTeamLogo.getAttribute('src') !== heroTeamLogo.dataset.expectedSrc) return;
      heroTeamLogo.hidden = false;
      hero.dataset.heroLogoLoaded = 'true';
      delete hero.dataset.heroLogoPending;
      delete hero.dataset.teamLogoFailed;
    });
    heroTeamLogo.addEventListener('error', () => {
      if (!heroTeamLogo.dataset.expectedSrc || heroTeamLogo.getAttribute('src') !== heroTeamLogo.dataset.expectedSrc) return;
      heroTeamLogo.hidden = true;
      heroTeamLogo.removeAttribute('src');
      delete heroTeamLogo.dataset.expectedSrc;
      delete hero.dataset.heroLogoLoaded;
      delete hero.dataset.heroLogoPending;
      hero.dataset.teamLogoFailed = 'true';
    });
  }
  const syncHeroTeamLogo = () => {
    if (!hero || !heroTeamLogo) return;
    const teamId = normalizedTeamId(studioPaletteRoot?.dataset?.studioTeamPalette || documentRef.body?.dataset?.courtPalette);
    const logoUrl = teamLogoUrl(teamId);
    heroTeamLogo.hidden = true;
    heroTeamLogo.removeAttribute('src');
    delete heroTeamLogo.dataset.expectedSrc;
    delete hero.dataset.heroLogoLoaded;
    delete hero.dataset.heroLogoPending;
    if (logoUrl) {
      hero.dataset.teamLogo = teamId;
      hero.dataset.teamLogoName = paletteForTeam(teamId).team;
      delete hero.dataset.teamLogoFailed;
      hero.dataset.heroLogoPending = 'true';
      heroTeamLogo.dataset.expectedSrc = logoUrl;
      heroTeamLogo.hidden = false;
      heroTeamLogo.src = logoUrl;
    } else {
      delete hero.dataset.teamLogo;
      delete hero.dataset.teamLogoName;
      delete hero.dataset.teamLogoFailed;
    }
  };
  syncHeroTeamLogo();
  if (typeof MutationObserver === 'function' && documentRef.body) {
    const paletteObserver = new MutationObserver(syncHeroTeamLogo);
    paletteObserver.observe(documentRef.body, { attributes: true, attributeFilter: ['data-court-palette'] });
  }
  if (typeof MutationObserver === 'function' && studioPaletteRoot) {
    const contextPaletteObserver = new MutationObserver(syncHeroTeamLogo);
    contextPaletteObserver.observe(studioPaletteRoot, { attributes: true, attributeFilter: ['data-studio-team-palette'] });
  }

  function setCapabilityState(label, ready = false) {
    setState(capabilityState, label, ready ? 'available' : String(label || '').trim().toLowerCase().replace(/\s+/g, '-'));
  }

  function renderScopeSummary() {
    const covered = studio.packages.length;
    const pending = Math.max(0, PUBLIC_SCOPE_LEDGER.exactTotal - covered);
    if (scopeExactCount) scopeExactCount.textContent = `${covered} / ${PUBLIC_SCOPE_LEDGER.exactTotal} covered`;
    if (scopeExactNote) scopeExactNote.textContent = pending
      ? `${pending} exact season${pending === 1 ? '' : 's'} unavailable`
      : `All ${PUBLIC_SCOPE_LEDGER.exactTotal} exact seasons available`;
    if (scopePooledState) scopePooledState.textContent = studio.pooledCareer
      ? 'Career history ready'
      : (PUBLIC_SCOPE_LEDGER.pooledTotal ? 'Not public' : 'None');
  }

  function renderCapabilityList() {
    renderScopeSummary();
    if (!capabilityList) return;
    capabilityList.replaceChildren();
    if (!selectedPackage) {
      setCapabilityState('Unavailable', false);
      if (capabilitySummary) capabilitySummary.textContent = unavailableMessage || 'No season is available yet.';
      CAPABILITY_DISPLAY.forEach(definition => {
        const item = createElement('li', 'swishiq-capability-list__item');
        const usesSeparateNativeSource = definition.key === 'seasonSimulation';
        const careerAvailable = definition.key === 'careerHistory'
          && capabilityStatus(studio.pooledCareer, 'careerHistory') === 'available';
        item.dataset.status = usesSeparateNativeSource ? 'separate' : (careerAvailable ? 'available' : 'unavailable');
        const heading = createElement('div', 'swishiq-capability-list__heading');
        const label = createElement('strong');
        label.textContent = definition.label;
        const status = createElement('span', 'swishiq-capability-status');
        status.textContent = usesSeparateNativeSource
          ? 'Select in Season Lab'
          : (careerAvailable ? 'History available' : (definition.key === 'careerHistory' ? 'Unavailable' : 'Waiting for season'));
        heading.append(label, status);
        const copy = createElement('p');
        copy.textContent = definition.description;
        item.append(heading, copy);
        capabilityList.append(item);
      });
      return;
    }
    const packageName = packageLabel(selectedPackage);
    const availableCount = CAPABILITY_DISPLAY.filter(definition => definition.key !== 'seasonSimulation' && (
      definition.key === 'careerHistory'
        ? capabilityStatus(studio.pooledCareer, 'careerHistory') === 'available'
        : capabilityStatus(selectedPackage, definition.key) === 'available'
    )).length;
    setCapabilityState(`${availableCount} available`, availableCount > 0);
    if (capabilitySummary) capabilitySummary.textContent = `${packageName} · ${availableCount} tools available.`;
    CAPABILITY_DISPLAY.forEach(definition => {
      const usesSeparateNativeSource = definition.key === 'seasonSimulation';
      const available = !usesSeparateNativeSource && (definition.key === 'careerHistory'
        ? capabilityStatus(studio.pooledCareer, 'careerHistory') === 'available'
        : capabilityStatus(selectedPackage, definition.key) === 'available');
      const item = createElement('li', 'swishiq-capability-list__item');
      item.dataset.status = usesSeparateNativeSource ? 'separate' : (available ? 'available' : 'unavailable');
      const heading = createElement('div', 'swishiq-capability-list__heading');
      const label = createElement('strong');
      label.textContent = definition.label;
      const status = createElement('span', 'swishiq-capability-status');
      status.textContent = usesSeparateNativeSource
        ? 'Select in Season Lab'
        : (available ? (definition.available || 'Available') : (definition.unavailable || 'Not available'));
      heading.append(label, status);
      const copy = createElement('p');
      copy.textContent = definition.description;
      item.append(heading, copy);
      capabilityList.append(item);
    });
  }

  function renderPlaceholder({ label, title, copy, requirements = [], action = null } = {}) {
    if (!workbenchPlaceholder) return;
    workbenchPlaceholder.hidden = false;
    if (placeholderKicker) placeholderKicker.textContent = label || 'Workbench status';
    if (placeholderTitle) placeholderTitle.textContent = title || 'This tool is not ready';
    if (placeholderCopy) placeholderCopy.textContent = copy || 'Choose a season with the data this tool needs.';
    if (placeholderList) {
      placeholderList.replaceChildren();
      requirements.forEach(requirement => {
        const item = createElement('li');
        item.textContent = requirement;
        placeholderList.append(item);
      });
      if (action?.href && action?.label) {
        const item = createElement('li');
        const link = createElement('a');
        link.href = action.href;
        link.textContent = action.label;
        item.append(link);
        placeholderList.append(item);
      }
    }
  }

  function hidePlaceholder() {
    if (workbenchPlaceholder) workbenchPlaceholder.hidden = true;
  }

  function renderBlueprintEmpty(message) {
    if (!blueprintSnapshots) return;
    const restoreProfileFocus = blueprintProfileFocusRequested
      || Boolean(blueprintSnapshots.contains?.(documentRef.activeElement));
    blueprintSnapshots.hidden = false;
    clearBlueprintSnapshots();
    const empty = createElement('p', 'swishiq-blueprint__empty');
    empty.textContent = message;
    if (restoreProfileFocus) {
      empty.tabIndex = -1;
      empty.focus?.({ preventScroll: true });
    }
    blueprintSnapshots.append(empty);
  }

  function positionSeasonPercentileForBlueprintMetric(metric, seasonStartYear, positions) {
    const year = Number(seasonStartYear);
    const targetPositions = new Set((Array.isArray(positions) ? positions : [])
      .map(position => String(position || '').trim().toUpperCase())
      .filter(position => POSITION_CODES.has(position)));
    if (!Number.isInteger(year) || !targetPositions.size || !(blueprintRosterStats instanceof Map)) return null;
    const playerByRef = new Map(blueprint.players.map(player => [player.playerRef, player]));
    // A traded player can have more than one team row. Keep the exact public
    // team-season row with the largest game count so one player is counted once.
    const valuesByPlayer = new Map();
    blueprint.seasons.forEach(row => {
      if (!isObject(row)
        || row.seasonStartYear !== year
        || row.phase !== 'regular'
        || row.observed !== true
        || !PLAYER_REF.test(String(row.playerRef || ''))
        || !Array.isArray(row.positions)
        || !row.positions.some(position => targetPositions.has(String(position || '').trim().toUpperCase()))) return;
      const player = playerByRef.get(row.playerRef);
      const stats = blueprintRosterPublicStats({ player, row }, blueprintRosterStats);
      const value = metricValue(stats, metric.key, metric.metricUnit);
      if (!Number.isFinite(value)) return;
      const prior = valuesByPlayer.get(row.playerRef);
      const games = Number(stats.totals?.gamesPlayed || 0);
      if (!prior || games > prior.games) {
        valuesByPlayer.set(row.playerRef, { value, games });
      }
    });
    return percentile([...valuesByPlayer.values()].map(item => item.value), 0.9);
  }

  function ensurePublicPlayerContext() {
    if (publicPlayerContext instanceof Map) return Promise.resolve(publicPlayerContext);
    if (publicPlayerContextError) return Promise.resolve(null);
    if (!publicPlayerContextPromise) {
      publicPlayerContextPromise = loadSwishIqPublicPlayerContext({ fetchImpl })
        .then(records => {
          publicPlayerContext = records;
          return records;
        })
        .catch(error => {
          publicPlayerContextError = 'Player details are unavailable.';
          return null;
        })
        .finally(() => { publicPlayerContextPromise = null; });
    }
    return publicPlayerContextPromise;
  }

  async function loadSelectedPlayerContext(playerRef) {
    const records = await ensurePublicPlayerContext();
    if (selectedBlueprintPlayerRefs.has(playerRef) || blueprintProfilePlayerRef === playerRef) renderBlueprintPlayer();
    renderBlueprintRoster();
    return records;
  }

  function isBlueprintTableActive() {
    const active = tabs.find(item => item.getAttribute('aria-pressed') === 'true');
    return !active || active.dataset.workbench === 'blueprint';
  }

  function ensureBlueprintTableDataFor(proof = selectedPackage) {
    if (!proof || !isBlueprintTableActive() || capabilityStatus(proof, 'swishiqStudio') !== 'available') return;
    if (blueprintMembershipsStatus === 'idle') void loadBlueprintMembershipsFor(proof);
    const year = Number(proof?.package?.scope?.seasonStartYear || 0);
    const hasStats = blueprintRosterStatsByYear.has(year);
    const hasRequest = blueprintRosterStatsPromisesByYear.has(year);
    if (year >= 1900 && !hasStats && !hasRequest && !blueprintRosterStatsError) {
      void loadBlueprintRosterStats();
    }
  }

  async function loadBlueprintMembershipsFor(proof) {
    if (!proof || capabilityStatus(proof, 'swishiqStudio') !== 'available') return false;
    if (blueprintMembershipsStatus === 'ready' && blueprintMembershipsProof === proof) return true;
    const cacheKey = selectionKey(proof);
    const cachedMemberships = blueprintMembershipsByPackage.get(cacheKey);
    if (cachedMemberships) {
      blueprint.memberships = cachedMemberships;
      blueprintMembershipsProof = proof;
      blueprintMembershipsStatus = 'ready';
      blueprintMembershipsError = '';
      renderBlueprintFilters();
      renderBlueprintOptions();
      renderBlueprintRoster();
      setBlueprintRosterStatus();
      return true;
    }
    if (blueprintMembershipsPromise) return blueprintMembershipsPromise;
    if (!hasBoundPublicArtifact(proof, 'seasonSimulation', 'roster-memberships', 'roster-memberships')) {
      blueprintMembershipsStatus = 'failed';
      blueprintMembershipsError = 'Roster data is unavailable for this season.';
      renderBlueprintFilters();
      renderBlueprintOptions();
      renderBlueprintRoster();
      return false;
    }

    const token = blueprintLoadToken;
    const seasonStartYear = Number(proof?.package?.scope?.seasonStartYear || 0);
    blueprintMembershipsStatus = 'loading';
    blueprintMembershipsError = '';
    renderBlueprintFilters();
    renderBlueprintRoster();
    const request = beginBlueprintRequest(
      requestFetch => fetchPublicPart(proof, 'roster-memberships', 'roster-memberships', requestFetch, 'seasonSimulation'),
      STUDIO_ROSTER_MEMBERSHIPS_TIMEOUT_MESSAGE,
    );
    blueprintMembershipsRequest = request;
    blueprintMembershipsPromise = request.promise;
    blueprintRequest = request;
    try {
      const records = await request.promise;
      if (token !== blueprintLoadToken || selectedPackage !== proof) return false;
      const memberships = blueprintRosterMembershipRows(records, seasonStartYear);
      if (!memberships.length) throw new Error('Roster data is unavailable for this season.');
      blueprint.memberships = memberships;
      blueprintMembershipsByPackage.set(cacheKey, memberships);
      blueprintMembershipsProof = proof;
      blueprintMembershipsStatus = 'ready';
      blueprintMembershipsError = '';
      renderBlueprintFilters();
      renderBlueprintOptions();
      renderBlueprintRoster();
      setBlueprintRosterStatus();
      return true;
    } catch (error) {
      if (token !== blueprintLoadToken || selectedPackage !== proof) return false;
      blueprintMembershipsStatus = 'failed';
      blueprintMembershipsError = 'Roster data could not be loaded for this season.';
      renderBlueprintFilters();
      renderBlueprintOptions();
      renderBlueprintRoster();
      setBlueprintRosterStatus();
      return false;
    } finally {
      if (blueprintMembershipsPromise === request.promise) blueprintMembershipsPromise = null;
      if (blueprintMembershipsRequest === request) blueprintMembershipsRequest = null;
      if (blueprintRequest === request) blueprintRequest = null;
    }
  }

  function loadBlueprintRosterStats() {
    const seasonStartYear = Number(selectedPackage?.package?.scope?.seasonStartYear || 0);
    if (!Number.isInteger(seasonStartYear) || seasonStartYear < 1900 || !isBlueprintTableActive()) return Promise.resolve(null);
    if (blueprintRosterStatsYear !== seasonStartYear) {
      blueprintRosterStatsYear = seasonStartYear;
      blueprintRosterStats = blueprintRosterStatsByYear.get(seasonStartYear) || null;
      blueprintRosterStatsError = '';
      blueprintRosterStatsPromise = blueprintRosterStatsPromisesByYear.get(seasonStartYear) || null;
    }
    if (blueprintRosterStats instanceof Map) return Promise.resolve(blueprintRosterStats);
    if (blueprintRosterStatsError) return Promise.resolve(null);
    const existingPromise = blueprintRosterStatsPromisesByYear.get(seasonStartYear);
    if (existingPromise) {
      blueprintRosterStatsPromise = existingPromise;
      return existingPromise;
    }

    let requestPromise;
    requestPromise = loadSwishIqPublicPlayerSeasonStats({ seasonStartYear, fetchImpl })
      .then(records => {
        if (!(records instanceof Map)) throw new Error('Public season stats are unavailable.');
        blueprintRosterStatsByYear.set(seasonStartYear, records);
        return records;
      })
      .catch(error => {
        if (blueprintRosterStatsYear === seasonStartYear) {
          blueprintRosterStatsError = 'Player stats could not be loaded for this season.';
        }
        return null;
      })
      .finally(() => {
        if (blueprintRosterStatsPromisesByYear.get(seasonStartYear) === requestPromise) {
          blueprintRosterStatsPromisesByYear.delete(seasonStartYear);
        }
        if (blueprintRosterStatsYear === seasonStartYear) {
          blueprintRosterStats = blueprintRosterStatsByYear.get(seasonStartYear) || null;
          blueprintRosterStatsPromise = null;
          renderBlueprintFilters();
          renderBlueprintOptions();
          renderBlueprintRoster();
          if (selectedBlueprintPlayerRefs.size || blueprintProfilePlayerRef) renderBlueprintPlayer();
        }
      });
    blueprintRosterStatsPromisesByYear.set(seasonStartYear, requestPromise);
    blueprintRosterStatsPromise = requestPromise;
    renderBlueprintFilters();
    renderBlueprintRoster();
    return requestPromise;
  }

  function renderShotLocationChart(row) {
    const textNode = (tag, text, className = '') => {
      const node = createElement(tag, className);
      node.textContent = text;
      return node;
    };
    const sourceZones = Array.isArray(row?.shotZones)
      ? row.shotZones
      : Array.isArray(row?.shotProfile?.zones) ? row.shotProfile.zones
        : isObject(row?.shotProfile?.zones) ? Object.entries(row.shotProfile.zones).map(([label, zone]) => ({ ...zone, label }))
          : isObject(row?.shotZones) ? Object.entries(row.shotZones).map(([label, zone]) => ({ ...zone, label }))
            : [];
    const rawZones = sourceZones.map(zone => ({
      ...zone,
      x: zone?.x ?? zone?.cx ?? zone?.left,
      y: zone?.y ?? zone?.cy ?? zone?.top,
      attempts: zone?.attempts ?? zone?.attemptCount,
      makes: zone?.makes ?? zone?.made,
    }));
    const zones = rawZones.filter(zone => isObject(zone)
      && Number.isFinite(Number(zone.x))
      && Number.isFinite(Number(zone.y))
      && Number.isFinite(Number(zone.attempts))
      && Number(zone.attempts) > 0
      && Number(zone.x) >= 0 && Number(zone.x) <= 100
      && Number(zone.y) >= 0 && Number(zone.y) <= 100);
    const court = createElement('div', 'swishiq-shot-profile__court');
    court.dataset.shotLocationState = zones.length ? 'available' : 'unavailable';
    court.setAttribute('role', 'img');
    const shotProfile = row?.shotProfile;
    const locatedAttempts = Number(shotProfile?.locatedAttempts);
    const officialAttempts = Number(shotProfile?.officialAttempts);
    const locationCoverage = Number.isFinite(locatedAttempts) && Number.isFinite(officialAttempts) && officialAttempts > 0
      ? `${locatedAttempts} of ${officialAttempts} official field-goal attempts have calibrated locations.`
      : 'Official attempt totals are retained; no calibrated shot locations are available for this player-season.';
    court.setAttribute('aria-label', zones.length
      ? `Shot-location chart with zone attempts and make rates. ${locationCoverage}`
      : `Shot-location chart. ${locationCoverage}`);
    const svg = documentRef.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 100 94');
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    svg.setAttribute('aria-hidden', 'true');
    const draw = (tag, attrs, className = 'swishiq-shot-profile__court-line') => {
      const node = documentRef.createElementNS('http://www.w3.org/2000/svg', tag);
      Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, String(value)));
      node.setAttribute('class', className);
      svg.append(node);
    };
    draw('rect', { x: 3, y: 3, width: 94, height: 88 });
    draw('line', { x1: 44, y1: 8, x2: 56, y2: 8 });
    draw('circle', { cx: 50, cy: 12, r: 1.8 });
    draw('rect', { x: 34, y: 3, width: 32, height: 27 }, 'swishiq-shot-profile__court-paint');
    draw('circle', { cx: 50, cy: 30, r: 6 });
    draw('path', { d: 'M44 18 A6 6 0 0 1 56 18' });
    draw('line', { x1: 3, y1: 3, x2: 3, y2: 20 });
    draw('line', { x1: 97, y1: 3, x2: 97, y2: 20 });
    draw('path', { d: 'M3 20 A47 47 0 0 1 97 20' });
    draw('line', { x1: 3, y1: 91, x2: 97, y2: 91 });
    draw('path', { d: 'M40 91 A10 10 0 0 1 60 91' });
    court.append(svg);
    if (zones.length) {
      const maximum = Math.max(...zones.map(zone => Number(zone.attempts)), 1);
      zones.forEach(zone => {
        const bubble = createElement('span', 'swishiq-shot-profile__court-bubble');
        const attempts = Number(zone.attempts);
        const makes = Number(zone.makes);
        const rate = Number.isFinite(makes) && attempts > 0 ? makes / attempts : null;
        bubble.style.left = `${Number(zone.x)}%`;
        bubble.style.top = `${Number(zone.y)}%`;
        bubble.style.setProperty('--shot-zone-size', `${Math.max(2.8, Math.min(6, 2.8 + attempts / maximum * 3.2))}rem`);
        if (rate !== null) bubble.classList.add(rate >= .5 ? 'swishiq-shot-profile__court-bubble--made' : 'swishiq-shot-profile__court-bubble--miss');
        const label = typeof zone.label === 'string' && zone.label.trim() ? zone.label.trim() : 'Zone';
        bubble.setAttribute('aria-label', `${label}: ${attempts} attempts${Number.isFinite(makes) ? `, ${makes} makes` : ''}${rate === null ? '' : `, ${(rate * 100).toFixed(1)}% made`}`);
        bubble.append(
          textNode('strong', Number.isFinite(makes) ? `${(rate * 100).toFixed(0)}%` : `${attempts}`),
          textNode('small', label),
        );
        court.append(bubble);
      });
      const note = createElement('p', 'swishiq-shot-profile__court-note');
      note.textContent = `Calibrated shot-location zones; bubble size reflects attempts and color reflects make rate. ${locationCoverage} Unmatched, missing, and distance-outlier events are not plotted.`;
      court.append(note);
    } else {
      const unavailable = createElement('div', 'swishiq-shot-profile__court-unavailable');
      unavailable.append(
        textNode('span', 'Shot-location hot zones'),
        textNode('strong', 'No calibrated locations for this player-season'),
        textNode('p', `The court stays visible; official shooting totals remain below. ${locationCoverage} No locations are inferred.`),
      );
      court.append(unavailable);
      const note = createElement('p', 'swishiq-shot-profile__court-note');
      note.textContent = 'Only reconciled, distance-checked event coordinates are plotted; all official attempts remain in the coverage denominator.';
      court.append(note);
    }
    return court;
  }

  function renderShotProfile(row) {
    const box = row?.box;
    if (!box || !isObject(box)) {
      const unavailable = createElement('div', 'swishiq-shot-profile swishiq-shot-profile--unavailable');
      unavailable.append(createElement('strong', 'Shot profile'), createElement('p', 'Aggregate shooting totals are unavailable for this season row.'));
      return unavailable;
    }
    const attempts = [
      ['twoPointAttempts', '2PT attempts', 'twoPointMakes'],
      ['threePointAttempts', '3PT attempts', 'threePointersMade'],
      ['freeThrowAttempts', 'FT attempts', 'freeThrowsMade'],
    ].map(([key, label, makesKey]) => ({
      key, label, attempts: Number(box[key]), makes: Number(box[makesKey]),
    })).filter(item => Number.isFinite(item.attempts) && item.attempts > 0);
    if (!attempts.length) {
      const unavailable = createElement('div', 'swishiq-shot-profile swishiq-shot-profile--unavailable');
      unavailable.append(createElement('strong', 'Shot profile'), createElement('p', 'Aggregate shooting totals are unavailable for this season row.'));
      return unavailable;
    }
    const totalAttempts = attempts.reduce((sum, item) => sum + item.attempts, 0);
    const figure = createElement('figure', 'swishiq-shot-profile');
    const caption = createElement('figcaption');
    const title = createElement('strong'); title.textContent = 'Shooting mix';
    const profile = row?.shotProfile;
    const located = Number(profile?.locatedAttempts);
    const official = Number(profile?.officialAttempts);
    const coverageText = Number.isFinite(located) && Number.isFinite(official) && official > 0
      ? `${located} of ${official} official field-goal attempts have calibrated locations (${(located / official * 100).toFixed(1)}%).`
      : 'Location coverage is unavailable; official shooting totals are still shown.';
    const note = createElement('span'); note.textContent = `Official attempts, makes, and conversion by shot type. ${coverageText}`;
    caption.append(title, note); figure.append(caption);
    const lanes = createElement('div', 'swishiq-shot-profile__lanes');
    lanes.setAttribute('role', 'img');
    lanes.setAttribute('aria-label', attempts.map(item => `${item.label}: ${Number.isFinite(item.makes) ? item.makes : 'unavailable'} makes on ${item.attempts} attempts`).join('; '));
    attempts.forEach(item => {
      const rate = Number.isFinite(item.makes) && item.attempts > 0 ? (item.makes / item.attempts) * 100 : null;
      const lane = createElement('div', `swishiq-shot-profile__lane swishiq-shot-profile__lane--${item.key.replace('Attempts', '')}`);
      const laneHead = createElement('div', 'swishiq-shot-profile__lane-head');
      const label = createElement('strong', 'swishiq-shot-profile__lane-label');
      label.textContent = item.label.replace(' attempts', '');
      const value = createElement('span', 'swishiq-shot-profile__lane-score');
      value.textContent = `${Number.isFinite(item.makes) ? item.makes : '—'} / ${item.attempts}`;
      const rateValue = createElement('strong', 'swishiq-shot-profile__lane-rate');
      rateValue.textContent = rate === null ? '—' : `${rate.toFixed(1)}%`;
      laneHead.append(label, value, rateValue);
      const track = createElement('span', 'swishiq-shot-profile__lane-track');
      const fill = createElement('span', 'swishiq-shot-profile__lane-fill');
      fill.style.width = `${Math.max(0, Math.min(100, (item.attempts / totalAttempts) * 100))}%`;
      fill.setAttribute('aria-hidden', 'true');
      track.append(fill);
      const mix = createElement('span', 'swishiq-shot-profile__lane-mix');
      mix.textContent = `${((item.attempts / totalAttempts) * 100).toFixed(0)}% of attempts`;
      lane.append(laneHead, track, mix);
      lanes.append(lane);
    });
    figure.append(lanes);
    /* Keep the exact-value table available to readers who need the underlying row. */
    const details = createElement('details', 'swishiq-data-alternative');
    const summary = createElement('summary'); summary.textContent = 'Open shooting values';
    const table = createElement('table', 'swishiq-shot-profile__table');
    const tableCaption = createElement('caption'); tableCaption.textContent = 'Exact shooting mix'; table.append(tableCaption);
    const head = createElement('tr'); ['Type', 'Attempts', 'Makes', 'Make rate'].forEach(label => { const cell = createElement('th'); cell.scope = 'col'; cell.textContent = label; head.append(cell); });
    const thead = createElement('thead'); thead.append(head); table.append(thead);
    const tbody = createElement('tbody'); attempts.forEach(item => { const tr = createElement('tr'); [item.label.replace(' attempts',''), item.attempts, Number.isFinite(item.makes) ? item.makes : 'Unavailable', Number.isFinite(item.makes) ? `${((item.makes / item.attempts) * 100).toFixed(1)}%` : 'Unavailable'].forEach((value, index) => { const cell = createElement(index === 0 ? 'th' : 'td'); if (index === 0) cell.scope = 'row'; cell.textContent = String(value); tr.append(cell); }); tbody.append(tr); });
    table.append(tbody); details.append(summary, table);
    const eventShotTypes = Array.isArray(profile?.shotTypes) ? profile.shotTypes.filter(item => isObject(item)
      && typeof item.label === 'string' && Number.isFinite(Number(item.attempts)) && Number(item.attempts) > 0) : [];
    if (eventShotTypes.length) {
      const eventTable = createElement('table', 'swishiq-shot-profile__table');
      const eventCaption = createElement('caption'); eventCaption.textContent = 'Reconciled event shot types'; eventTable.append(eventCaption);
      const eventHead = createElement('tr');
      ['Shot type', 'Makes / attempts', 'FG%'].forEach(label => {
        const cell = createElement('th'); cell.scope = 'col'; cell.textContent = label; eventHead.append(cell);
      });
      const eventThead = createElement('thead'); eventThead.append(eventHead); eventTable.append(eventThead);
      const eventBody = createElement('tbody');
      eventShotTypes.forEach(item => {
        const tr = createElement('tr');
        const label = createElement('th'); label.scope = 'row'; label.textContent = item.label;
        const makes = Number(item.makes);
        const eventAttempts = Number(item.attempts);
        const count = createElement('td'); count.textContent = `${Number.isFinite(makes) ? makes : '—'} / ${eventAttempts}`;
        const rate = createElement('td');
        rate.textContent = Number.isFinite(Number(item.fieldGoalPercentage))
          ? `${(Number(item.fieldGoalPercentage) * 100).toFixed(1)}%` : 'Unavailable';
        tr.append(label, count, rate); eventBody.append(tr);
      });
      eventTable.append(eventBody); details.append(eventTable);
    }
    figure.append(details);
    return figure;
  }

  function renderPlayTypeProfile(row) {
    const profile = row?.playType;
    if (!isObject(profile)) return null;
    const section = createElement('section', 'swishiq-shot-profile');
    section.setAttribute('aria-label', 'Play-type context from game events');
    const heading = createElement('strong');
    heading.textContent = 'Play-type context';
    const note = createElement('p', 'swishiq-shot-profile__court-note');
    const classified = Number(profile.classifiedAttempts);
    const official = Number(profile.officialAttempts);
    const coverage = Number.isFinite(classified) && Number.isFinite(official) && official > 0
      ? `${classified} of ${official} official field-goal attempts carried a recognized context tag (${(classified / official * 100).toFixed(1)}%).`
      : 'No recognized context tags are available for this player-season; official totals remain unchanged.';
    note.textContent = `${coverage} Context tags can overlap and describe tagged field-goal events, not complete possessions or Synergy action calls.`;
    section.append(heading, note);
    const contexts = Array.isArray(profile.contexts) ? profile.contexts.filter(item => isObject(item)
      && typeof item.label === 'string' && Number.isFinite(Number(item.attempts)) && Number(item.attempts) > 0) : [];
    if (!contexts.length) return section;
    const table = createElement('table', 'swishiq-shot-profile__table');
    const caption = createElement('caption'); caption.textContent = 'Tagged play-by-play contexts'; table.append(caption);
    const head = createElement('tr');
    ['Context', 'Makes / attempts', 'FG%'].forEach(label => {
      const cell = createElement('th'); cell.scope = 'col'; cell.textContent = label; head.append(cell);
    });
    const thead = createElement('thead'); thead.append(head); table.append(thead);
    const tbody = createElement('tbody');
    contexts.forEach(item => {
      const tr = createElement('tr');
      const label = createElement('th'); label.scope = 'row'; label.textContent = item.label;
      const makes = Number(item.makes);
      const attemptsCount = Number(item.attempts);
      const count = createElement('td'); count.textContent = `${Number.isFinite(makes) ? makes : '—'} / ${attemptsCount}`;
      const rate = createElement('td');
      rate.textContent = Number.isFinite(Number(item.fieldGoalPercentage))
        ? `${(Number(item.fieldGoalPercentage) * 100).toFixed(1)}%` : 'Unavailable';
      tr.append(label, count, rate); tbody.append(tr);
    });
    table.append(tbody);
    section.append(table);
    return section;
  }

  function renderBlueprintSnapshot(row, player, { context = null, includeContext = false, contextAvailableElsewhere = false, contextError = '', contextStatus = 'loading', showHeroStats = true, displayRow: suppliedDisplayRow = null } = {}) {
    const displayRow = suppliedDisplayRow || row;
    const article = createElement('article', 'swishiq-blueprint__snapshot swishiq-blueprint__slab');
    article.dataset.sourcePackage = selectedPackage?.package?.packageVersion || '';
    article.dataset.statsSource = displayRow.statsSource?.kind || displayRow.statsSource?.provider || 'unavailable';
    article.dataset.teamCode = displayRow.teamCode || '';
    const teamMark = teamLogoUrl(displayRow.teamCode);
    if (teamMark) article.style.setProperty('--swishiq-blueprint-team-mark', `url("${teamMark}")`);
    article.tabIndex = -1;
    const metrics = BLUEPRINT_METRICS.map(definition => ({
      ...definition,
      value: metricValue(displayRow, definition.key, definition.metricUnit),
    })).filter(metric => metric.value !== null);

    const slabHead = createElement('div', 'swishiq-blueprint__slab-head');
    const leagueBadge = createElement('span', 'swishiq-blueprint__league-badge');
    leagueBadge.textContent = 'PLAYER PROFILE';
    slabHead.append(leagueBadge);
    article.append(slabHead);

    const identity = createElement('div', 'swishiq-blueprint__identity');
    const initials = player.displayName.split(/\s+/).filter(Boolean).map(part => part[0]).join('').slice(0, 2).toUpperCase();
    const avatar = createElement('span', 'swishiq-blueprint__avatar');
    avatar.setAttribute('aria-hidden', 'true');
    const metadata = metadataForPlayer(playerMetadata, player.displayName, displayRow.seasonStartYear);
    const fallback = createElement('span', 'swishiq-blueprint__avatar-fallback');
    fallback.textContent = initials || 'P';
    avatar.append(fallback);
    const headshotPath = approvedHeadshotFor(player, playerMetadata);
    if (headshotPath) {
      const image = createElement('img', 'swishiq-blueprint__avatar-image');
      image.alt = `${player.displayName} profile`;
      image.loading = 'lazy';
      image.decoding = 'async';
      image.addEventListener('error', () => {
        image.hidden = true;
        fallback.hidden = false;
      }, { once: true });
      fallback.hidden = true;
      avatar.append(image);
      // Bind the fallback before assigning src so cached or test-provided
      // image implementations cannot report a failure before the listener.
      image.src = headshotPath;
    }
    const identityCopy = createElement('div', 'swishiq-blueprint__identity-copy');
    const heading = createElement('h3');
    heading.textContent = player.displayName;
    if (player.displayName.length > 18) heading.classList.add('swishiq-blueprint__identity-name--long');
    const identityNote = createElement('p');
    const profile = profileForPlayerContext(context, displayRow.seasonStartYear) || metadata?.profile;
    const positions = Array.isArray(displayRow.positions) && displayRow.positions.length
      ? displayRow.positions.join('/')
      : Array.isArray(player.positions) ? player.positions.join('/') : '';
    const profileSeasonAge = profile?.ageBySeason?.[String(displayRow.seasonStartYear)];
    const exactAge = Number.isFinite(displayRow.age)
      ? displayRow.age
      : Number.isFinite(profileSeasonAge) ? profileSeasonAge : null;
    const profileBits = [teamDisplayLabel(displayRow.teamCode), positions, exactAge === null ? '' : `${exactAge} years old`].filter(Boolean);
    identityNote.textContent = profileBits.join(' · ');
    identityCopy.append(heading, identityNote);
    const physicalBits = [
      formatHeight(profile?.height) !== 'Unavailable' ? formatHeight(profile?.height) : '',
      Number.isFinite(profile?.weightPounds) ? `${profile.weightPounds} lb` : Number.isFinite(profile?.weight) ? `${profile.weight} lb` : '',
      profile?.jerseyNumber ? `#${profile.jerseyNumber}` : '',
    ].filter(Boolean);
    if (physicalBits.length) {
      const bio = createElement('p', 'swishiq-blueprint__bio');
      bio.textContent = `Player details · ${physicalBits.join(' · ')}`;
      identityCopy.append(bio);
    }
    identity.append(avatar, identityCopy);
    article.append(identity);

    const seasonLine = createElement('p', 'swishiq-blueprint__season-line');
    const seasonLabel = createElement('strong');
    const phaseLabel = blueprintSeasonTypeLabel(displayRow.phase);
    seasonLabel.textContent = `${formatSeasonLabel(displayRow.seasonStartYear)} · ${phaseLabel}`;
    const gamesText = createElement('span');
    gamesText.textContent = Number.isFinite(displayRow.games) ? `${formatInteger(displayRow.games)} GP` : 'GP unavailable';
    const statsStatus = createBlueprintStatsStatus(createElement, displayRow);
    seasonLine.append(seasonLabel, gamesText, statsStatus);

    const statCard = (metric, hero = false) => {
      const card = createElement('div', `swishiq-blueprint__stat${hero ? ' swishiq-blueprint__stat--hero' : ''}`);
      const label = createElement('span', 'swishiq-blueprint__stat-label');
      label.textContent = metric.label;
      label.title = metric.title || metric.label;
      const value = createElement('strong', 'swishiq-blueprint__stat-value');
      value.textContent = formatBlueprintMetric(metric);
      const unit = createElement('span', 'swishiq-blueprint__stat-unit');
      unit.textContent = blueprintMetricUnit(metric) || 'recorded';
      card.append(label, value, unit);
      return card;
    };
    const heroMetrics = metrics.filter(metric => metric.tier === 'hero');
    if (heroMetrics.length && showHeroStats) {
      const heroStats = createElement('div', 'swishiq-blueprint__hero-stats');
      const heroOrder = ['pointsPerGame', 'reboundsPerGame', 'assistsPerGame'];
      heroMetrics.sort((left, right) => heroOrder.indexOf(left.key) - heroOrder.indexOf(right.key))
        .forEach(metric => heroStats.append(statCard(metric, true)));
      article.append(heroStats);
    }

    const profileTabKey = JSON.stringify([
      selectionKey(selectedPackage), player.playerRef, displayRow.teamCode, displayRow.seasonStartYear, displayRow.phase,
    ]);
    const profileTabs = createPlayerBlueprintTabs({
      createElement,
      idPrefix: `blueprint-${player.playerRef}-${displayRow.teamCode}-${displayRow.seasonStartYear}-${displayRow.phase}`,
      initialTab: blueprintProfileTabs.get(profileTabKey) || 'profile',
      onChange: key => blueprintProfileTabs.set(profileTabKey, key),
    });
    const profilePanel = profileTabs.panels.profile;
    const statsPanel = profileTabs.panels.stats;
    const bioPanel = profileTabs.panels.bio;
    article.append(profileTabs.element);

    const trophyStatus = !includeContext && contextAvailableElsewhere
      ? 'elsewhere'
      : contextStatus;
    profilePanel.append(renderTrophyCase({
      createElement,
      context,
      formatSeasonLabel,
      status: trophyStatus,
    }));

    const seasonStats = createElement('section', 'swishiq-blueprint__season-stats');
    const statsHeading = createElement('div', 'swishiq-blueprint__season-stats-heading');
    const statsTitleGroup = createElement('div');
    const statsKicker = createElement('span', 'swishiq-kicker');
    statsKicker.textContent = 'TRADITIONAL STATS';
    const statsTitle = createElement('h4');
    statsTitle.textContent = 'Season stats';
    statsTitleGroup.append(statsKicker, statsTitle);
    statsHeading.append(statsTitleGroup);
    const statsMode = createElement('div', 'swishiq-blueprint__stat-mode');
    statsMode.setAttribute('role', 'group');
    statsMode.setAttribute('aria-label', 'Season stat display');
    const statsModeScopeKey = blueprintStatModeScopeKey(player, displayRow);
    const initialStatsMode = blueprintStatModes.get(statsModeScopeKey) === 'totals' ? 'totals' : 'perGame';
    const perGameButton = createElement('button', 'swishiq-blueprint__stat-mode-button');
    perGameButton.type = 'button';
    perGameButton.textContent = 'Per Game';
    perGameButton.setAttribute('aria-pressed', String(initialStatsMode === 'perGame'));
    const totalsButton = createElement('button', 'swishiq-blueprint__stat-mode-button');
    totalsButton.type = 'button';
    totalsButton.textContent = 'Totals';
    totalsButton.setAttribute('aria-pressed', String(initialStatsMode === 'totals'));
    statsMode.append(perGameButton, totalsButton);
    statsHeading.append(statsMode);
    seasonStats.append(statsHeading);

    const exactGames = Number.isFinite(displayRow.games) && displayRow.games > 0 ? displayRow.games : null;
    const exactBox = isObject(displayRow.box) ? displayRow.box : {};
    const boxValue = key => Number.isFinite(exactBox[key]) ? Number(exactBox[key]) : null;
    const perGameValue = value => Number.isFinite(value) && exactGames ? value / exactGames : null;
    const percentageValue = key => {
      const value = metricValue(displayRow, key, 'fraction');
      return Number.isFinite(value) ? value * 100 : null;
    };
    const seasonSplits = [
      { label: 'SEASON', key: 'season', total: null, perGame: null, type: 'text', text: formatSeasonLabel(displayRow.seasonStartYear) },
      { label: 'TEAM', key: 'team', total: null, perGame: null, type: 'text', text: displayRow.teamCode || '—' },
      { label: 'GP', key: 'games', total: exactGames, perGame: exactGames, type: 'integer' },
      { label: 'MIN', key: 'minutes', total: Number.isFinite(displayRow.minutes) ? displayRow.minutes : null, perGame: perGameValue(displayRow.minutes), type: 'decimal' },
      { label: 'PTS', key: 'points', total: boxValue('points'), perGame: perGameValue(boxValue('points')), type: 'count' },
      { label: 'FGM', key: 'fgm', total: boxValue('fieldGoalsMade'), perGame: perGameValue(boxValue('fieldGoalsMade')), type: 'count' },
      { label: 'FGA', key: 'fga', total: boxValue('fieldGoalAttempts'), perGame: perGameValue(boxValue('fieldGoalAttempts')), type: 'count' },
      { label: 'FG%', key: 'fgPercent', total: percentageValue('fieldGoalPercentage'), perGame: percentageValue('fieldGoalPercentage'), type: 'percent' },
      { label: '3PM', key: 'threePm', total: boxValue('threePointersMade'), perGame: perGameValue(boxValue('threePointersMade')), type: 'count' },
      { label: '3PA', key: 'threePa', total: boxValue('threePointAttempts'), perGame: perGameValue(boxValue('threePointAttempts')), type: 'count' },
      { label: '3P%', key: 'threePercent', total: percentageValue('threePointPercentage'), perGame: percentageValue('threePointPercentage'), type: 'percent' },
      { label: 'FTM', key: 'ftm', total: boxValue('freeThrowsMade'), perGame: perGameValue(boxValue('freeThrowsMade')), type: 'count' },
      { label: 'FTA', key: 'fta', total: boxValue('freeThrowAttempts'), perGame: perGameValue(boxValue('freeThrowAttempts')), type: 'count' },
      { label: 'FT%', key: 'ftPercent', total: percentageValue('freeThrowPercentage'), perGame: percentageValue('freeThrowPercentage'), type: 'percent' },
      { label: 'OREB', key: 'oreb', total: boxValue('offensiveRebounds'), perGame: perGameValue(boxValue('offensiveRebounds')), type: 'count' },
      { label: 'DREB', key: 'dreb', total: boxValue('defensiveRebounds'), perGame: perGameValue(boxValue('defensiveRebounds')), type: 'count' },
      { label: 'REB', key: 'rebounds', total: boxValue('rebounds'), perGame: perGameValue(boxValue('rebounds')), type: 'count' },
      { label: 'AST', key: 'assists', total: boxValue('assists'), perGame: perGameValue(boxValue('assists')), type: 'count' },
      { label: 'TOV', key: 'turnovers', total: boxValue('turnovers'), perGame: perGameValue(boxValue('turnovers')), type: 'count' },
      { label: 'STL', key: 'steals', total: boxValue('steals'), perGame: perGameValue(boxValue('steals')), type: 'count' },
      { label: 'BLK', key: 'blocks', total: boxValue('blocks'), perGame: perGameValue(boxValue('blocks')), type: 'count' },
    ];
    const statsTableWrap = createElement('div', 'swishiq-blueprint__season-stats-scroll');
    statsTableWrap.setAttribute('role', 'region');
    statsTableWrap.setAttribute('aria-label', `${displayRow.teamCode || 'Player'} ${formatSeasonLabel(displayRow.seasonStartYear)} ${phaseLabel.toLowerCase()} stats`);
    statsTableWrap.tabIndex = 0;
    const statsTable = createElement('table', 'swishiq-blueprint__season-stats-table');
    statsTable.dataset.mode = initialStatsMode;
    const statsCaption = createElement('caption');
    const baseStatsCaption = `${displayRow.teamCode || 'Player'} · ${formatSeasonLabel(displayRow.seasonStartYear)} ${phaseLabel.toLowerCase()}`;
    statsCaption.textContent = `${baseStatsCaption} · ${initialStatsMode === 'totals' ? 'Totals' : 'Per Game'}`;
    statsTable.append(statsCaption);
    const statsHead = createElement('thead');
    const statsHeadRow = createElement('tr');
    seasonSplits.forEach(split => {
      const cell = createElement('th');
      cell.scope = 'col';
      cell.textContent = split.label;
      statsHeadRow.append(cell);
    });
    statsHead.append(statsHeadRow);
    statsTable.append(statsHead);
    const statsBody = createElement('tbody');
    const statsRow = createElement('tr');
    seasonSplits.forEach(split => {
      const cell = createElement('td');
      let totalText = split.text || '—';
      let perGameText = totalText;
      if (split.type === 'integer') {
        totalText = Number.isFinite(split.total) ? formatInteger(split.total) : '—';
        perGameText = totalText;
      } else if (split.type === 'decimal') {
        totalText = Number.isFinite(split.total) ? formatMetric(split.total) : '—';
        perGameText = Number.isFinite(split.perGame) ? formatMetric(split.perGame) : '—';
      } else if (split.type === 'count') {
        totalText = Number.isFinite(split.total) ? formatInteger(split.total) : '—';
        perGameText = Number.isFinite(split.perGame) ? formatMetric(split.perGame) : '—';
      } else if (split.type === 'percent') {
        totalText = Number.isFinite(split.total) ? `${formatMetric(split.total)}%` : '—';
        perGameText = totalText;
      }
      cell.textContent = initialStatsMode === 'totals' ? totalText : perGameText;
      cell.dataset.total = totalText;
      cell.dataset.perGame = perGameText;
      cell.dataset.statKey = split.key;
      statsRow.append(cell);
    });
    statsBody.append(statsRow);
    statsTable.append(statsBody);
    statsTableWrap.append(statsTable);
    seasonStats.append(statsTableWrap);
    if (!displayRow.statsSource) {
      const unavailable = createElement('p', 'swishiq-blueprint__stats-unavailable');
      unavailable.textContent = 'Exact team-season stats are unavailable for this row.';
      seasonStats.append(unavailable);
      perGameButton.disabled = true;
      totalsButton.disabled = true;
    }
    const setStatsMode = mode => {
      if (statsModeScopeKey) blueprintStatModes.set(statsModeScopeKey, mode);
      statsTable.dataset.mode = mode;
      perGameButton.setAttribute('aria-pressed', String(mode === 'perGame'));
      totalsButton.setAttribute('aria-pressed', String(mode === 'totals'));
      statsCaption.textContent = `${baseStatsCaption} · ${mode === 'totals' ? 'Totals' : 'Per Game'}`;
      statsTable.querySelectorAll('[data-stat-key]').forEach(cell => {
        cell.textContent = mode === 'totals' ? cell.dataset.total : cell.dataset.perGame;
      });
    };
    perGameButton.addEventListener('click', () => setStatsMode('perGame'));
    totalsButton.addEventListener('click', () => setStatsMode('totals'));
    statsPanel.append(seasonLine, seasonStats);

    const supportingMetrics = metrics.filter(metric => metric.tier !== 'hero');
    if (supportingMetrics.length) {
      const statGrid = createElement('div', 'swishiq-blueprint__stat-grid');
      supportingMetrics.forEach(metric => statGrid.append(statCard(metric)));
      statsPanel.append(statGrid);
    }

    if (includeContext && publicPlayerContext instanceof Map) {
      bioPanel.append(renderPlayerContext({
        createElement,
        row: displayRow,
        player,
        context,
        formatDate,
        formatHeight,
        formatInteger,
        formatMetric,
        formatSeasonLabel,
      }));
    } else if (contextAvailableElsewhere) {
      const contextNote = createElement('p', 'swishiq-blueprint__context-status swishiq-advanced-muted');
      contextNote.textContent = 'Career bio and history appear on the first team row for this player.';
      bioPanel.append(contextNote);
    } else {
      const contextStatus = createElement('p', 'swishiq-blueprint__context-status swishiq-advanced-muted');
      contextStatus.setAttribute('role', 'status');
      contextStatus.textContent = contextError
        ? 'Player bio and career history are unavailable.'
        : 'Loading player bio and career history…';
      bioPanel.append(contextStatus);
    }

    const chartMetrics = metrics.filter(metric => metric.metricUnit !== 'fraction');
    if (chartMetrics.length) {
      const figure = createElement('figure', 'swishiq-blueprint__chart swishiq-courtboard');
      const caption = createElement('figcaption');
      const captionTitle = createElement('strong');
      captionTitle.textContent = 'Court board';
      const captionNote = createElement('span');
      const positionLabel = Array.isArray(displayRow.positions) && displayRow.positions.length
        ? displayRow.positions.join('/')
        : 'recorded position';
      captionNote.textContent = `Reference meters compare this ${positionLabel} season row with the 90th-percentile benchmark; the court is a visual guide, not a shot chart.`;
      caption.append(captionTitle, captionNote);
      figure.append(caption);

      const board = createElement('div', 'swishiq-courtboard__board');
      board.setAttribute('role', 'list');
      board.setAttribute('aria-label', chartMetrics.map(metric => {
        const benchmark = positionSeasonPercentileForBlueprintMetric(metric, displayRow.seasonStartYear, displayRow.positions);
        return `${metric.label} ${formatBlueprintMetricWithUnit(metric)}; ${positionLabel} position-season 90th percentile ${benchmark === null ? 'unavailable' : formatBlueprintMetricWithUnit({ ...metric, value: benchmark })}`;
      }).join('; '));
      const court = createElement('div', 'swishiq-courtboard__court');
      court.setAttribute('aria-hidden', 'true');
      court.append(createElement('span', 'swishiq-courtboard__hoop'), createElement('span', 'swishiq-courtboard__paint'));
      const tiles = createElement('div', 'swishiq-courtboard__tiles');
      chartMetrics.forEach(metric => {
        const tile = createElement('div', 'swishiq-courtboard__tile');
        tile.setAttribute('role', 'listitem');
        const benchmark = positionSeasonPercentileForBlueprintMetric(metric, displayRow.seasonStartYear, displayRow.positions);
        const meter = createElement('span', 'swishiq-courtboard__meter');
        const ratio = Number.isFinite(benchmark) && benchmark > 0
          ? Math.max(0, Math.min(100, (metric.value / benchmark) * 100))
          : 0;
        meter.style.setProperty('--courtboard-value', `${ratio}%`);
        meter.setAttribute('aria-hidden', 'true');
        const label = createElement('span', 'swishiq-courtboard__label');
        label.textContent = metric.label;
        const value = createElement('strong', 'swishiq-courtboard__value');
        value.textContent = formatBlueprintMetricWithUnit(metric);
        tile.setAttribute('aria-label', `${metric.label}: ${formatBlueprintMetricWithUnit(metric)}; position-season reference ${Number.isFinite(benchmark) ? formatBlueprintMetricWithUnit({ ...metric, value: benchmark }) : 'unavailable'}.`);
        tile.append(meter, label, value);
        tiles.append(tile);
      });
      board.append(court, tiles);
      figure.append(board);
      profilePanel.append(figure);
    }

    const shotProfile = renderShotProfile(displayRow);
    if (shotProfile) profilePanel.append(shotProfile);
    const playTypeProfile = renderPlayTypeProfile(displayRow);
    if (playTypeProfile) profilePanel.append(playTypeProfile);

    const analyticsSection = createElement('section', 'swishiq-blueprint__advanced-analytics');
    const analyticsHeading = createElement('div', 'swishiq-blueprint__advanced-analytics-heading');
    const analyticsKicker = createElement('span', 'swishiq-kicker');
    analyticsKicker.textContent = 'ADVANCED ANALYTICS';
    const analyticsTitle = createElement('h4');
    analyticsTitle.textContent = 'Advanced metric table';
    analyticsHeading.append(analyticsKicker, analyticsTitle);
    analyticsSection.setAttribute('aria-label', `${player.displayName} advanced analytics`);
    analyticsSection.append(analyticsHeading);
    const tableWrap = createElement('div', 'swishiq-blueprint__table-wrap');
    tableWrap.setAttribute('role', 'region');
    tableWrap.setAttribute('aria-label', `${player.displayName} advanced metrics for ${formatSeasonLabel(displayRow.seasonStartYear)}`);
    tableWrap.tabIndex = 0;
    const table = createElement('table', 'swishiq-blueprint__table');
    const captionElement = createElement('caption');
    captionElement.textContent = `${displayRow.teamCode || 'Player'} · ${formatSeasonLabel(displayRow.seasonStartYear)} ${phaseLabel.toLowerCase()} measures`;
    table.append(captionElement);
    const head = createElement('thead');
    const headRow = createElement('tr');
    ['Measure', 'Value', 'Unit'].forEach(text => {
      const cell = createElement('th');
      cell.scope = 'col';
      cell.textContent = text;
      headRow.append(cell);
    });
    head.append(headRow);
    table.append(head);
    const body = createElement('tbody');
    metrics.forEach(metric => {
      const rowElement = createElement('tr');
      const label = createElement('th');
      label.scope = 'row';
      label.textContent = metric.label;
      const value = createElement('td');
      value.textContent = formatBlueprintMetric(metric);
      const unit = createElement('td');
      unit.textContent = blueprintMetricUnit(metric);
      rowElement.append(label, value, unit);
      body.append(rowElement);
    });
    table.append(body);
    tableWrap.append(table);
    analyticsSection.append(tableWrap);
    profilePanel.append(analyticsSection);
    return article;
  }

  function renderBlueprintComparison(entries) {
    if (entries.length < 2) return null;
    const section = createElement('section', 'swishiq-blueprint__comparison');
    const heading = createElement('h4');
    heading.textContent = 'Exact-season comparison';
    heading.id = 'blueprintComparisonTitle';
    section.setAttribute('aria-labelledby', heading.id);
    section.append(heading);
    const tableWrap = createElement('div', 'swishiq-blueprint__comparison-table-wrap');
    const table = createElement('table', 'swishiq-blueprint__table');
    const caption = createElement('caption');
    caption.textContent = 'Exact-season values by player and team';
    table.append(caption);
    const head = createElement('thead');
    const headRow = createElement('tr');
    ['Player', 'Team', 'Games', 'PPG', 'APG', 'RPG', 'Status'].forEach(label => {
      const cell = createElement('th');
      cell.scope = 'col';
      cell.textContent = label;
      headRow.append(cell);
    });
    head.append(headRow);
    table.append(head);
    const body = createElement('tbody');
    entries.forEach(({ player, row, displayRow }) => {
      const line = createElement('tr');
      const playerCell = createElement('th');
      playerCell.scope = 'row';
      playerCell.textContent = player.displayName;
      const status = displayRow.statsSource ? 'Observed' : 'Unavailable';
      [playerCell, row.teamCode, displayRow.games, ...['pointsPerGame', 'assistsPerGame', 'reboundsPerGame'].map(key => {
        const value = metricValue(displayRow, key, 'per-game');
        return value === null ? 'Unavailable' : formatMetric(value);
      }), status].forEach((value, index) => {
        if (index === 0) line.append(value);
        else {
          const cell = createElement('td');
          cell.textContent = String(value ?? 'Unavailable');
          line.append(cell);
        }
      });
      body.append(line);
    });
    table.append(body);
    tableWrap.append(table);
    section.append(tableWrap);
    return section;
  }

  function renderBlueprintScoutGame(entries) {
    const rounds = BLUEPRINT_SCOUT_ROUNDS
      .map(spec => ({ ...spec, matchup: blueprintScoutRound(entries, spec.key) }))
      .filter(spec => spec.matchup);
    if (!rounds.length) return null;
    const signature = `${selectionKey(selectedPackage)}|${entries.map(({ player, row }) =>
      `${player.playerRef}:${row.teamCode}:${row.games}`).join('|')}`;
    if (blueprintScoutRun?.signature !== signature) {
      blueprintScoutRun = {
        signature, completed: [], selectedMetricKey: null, score: 0,
        choiceIndex: null, revealed: false, bestScore: 0, completedRuns: 0,
      };
    }
    const available = rounds.filter(spec => !blueprintScoutRun.completed.includes(spec.key));
    const spec = rounds.find(round => round.key === blueprintScoutRun.selectedMetricKey) || null;
    const section = createElement('section', 'swishiq-blueprint__scout');
    section.setAttribute('aria-label', 'Player scouting challenge');
    const header = createElement('div', 'swishiq-blueprint__scout-header');
    const titleGroup = createElement('div');
    const eyebrow = createElement('span', 'swishiq-kicker');
    eyebrow.textContent = 'SCOUT CHALLENGE';
    const title = createElement('h3');
    title.textContent = available.length ? spec
      ? `Who leads in ${spec.label.toLowerCase()}?`
      : 'Choose a scouting focus'
      : 'Scouting run complete';
    titleGroup.append(eyebrow, title);
    const progress = createElement('strong', 'swishiq-blueprint__scout-progress');
    progress.textContent = `${blueprintScoutRun.completed.length} of ${rounds.length} checked · ${blueprintScoutRun.score} correct${blueprintScoutRun.completedRuns ? ` · Best ${blueprintScoutRun.bestScore}` : ''}`;
    header.append(titleGroup, progress);
    section.append(header);
    if (!available.length) {
      const result = createElement('p');
      result.textContent = `${blueprintScoutRun.score} of ${rounds.length} correct. Best ${blueprintScoutRun.bestScore} of ${rounds.length} across ${blueprintScoutRun.completedRuns} completed ${blueprintScoutRun.completedRuns === 1 ? 'run' : 'runs'}.`;
      section.append(result);
      const replay = createElement('button', 'button swishiq-blueprint__scout-action');
      replay.type = 'button';
      replay.textContent = 'Scout these players again';
      replay.addEventListener('click', () => {
        blueprintScoutRun = { ...blueprintScoutRun,
          completed: [], selectedMetricKey: null, score: 0, choiceIndex: null,
          revealed: false, evidenceOpen: false };
        renderBlueprintPlayer();
        byId('blueprintScoutTitle')?.focus();
      });
      section.append(replay);
    } else if (!spec) {
      const prompt = createElement('p');
      prompt.textContent = 'Pick the next recorded rate to compare. Check every available focus to finish the run.';
      section.append(prompt);
      const focusChoices = createElement('div', 'swishiq-blueprint__scout-choices');
      available.forEach(option => {
        const button = createElement('button', 'swishiq-blueprint__scout-choice');
        button.type = 'button';
        button.textContent = option.label;
        button.addEventListener('click', () => {
          blueprintScoutRun.selectedMetricKey = option.key;
          blueprintScoutRun.choiceIndex = null;
          blueprintScoutRun.evidenceOpen = false;
          renderBlueprintPlayer();
          byId('blueprintScoutTitle')?.focus();
        });
        focusChoices.append(button);
      });
      section.append(focusChoices);
    } else {
      const prompt = createElement('p');
      prompt.textContent = `Choose the highest recorded ${spec.unit} from these exact team-season rows.`;
      section.append(prompt);
      if (!blueprintScoutRun.revealed) {
        const changeFocus = createElement('button', 'swishiq-blueprint__scout-change');
        changeFocus.type = 'button';
        changeFocus.textContent = 'Change focus';
        changeFocus.addEventListener('click', () => {
          blueprintScoutRun.selectedMetricKey = null;
          blueprintScoutRun.choiceIndex = null;
          renderBlueprintPlayer();
          byId('blueprintScoutTitle')?.focus();
        });
        section.append(changeFocus);
      }
      const choices = createElement('div', 'swishiq-blueprint__scout-choices');
      const choiceButtons = [];
      let revealButton = null;
      spec.matchup.choices.forEach(choice => {
        const button = createElement('button', 'swishiq-blueprint__scout-choice');
        button.type = 'button';
        button.disabled = blueprintScoutRun.revealed;
        button.setAttribute('aria-pressed', String(blueprintScoutRun.choiceIndex === choice.index));
        const mark = teamLogoUrl(choice.team);
        if (mark) {
          const image = createElement('img');
          image.src = mark;
          image.alt = '';
          image.width = 36;
          image.height = 36;
          image.loading = 'lazy';
          image.decoding = 'async';
          button.append(image);
        }
        const label = createElement('span');
        label.textContent = `${choice.player} · ${choice.team} · ${choice.games} games`;
        button.append(label);
        button.addEventListener('click', () => {
          blueprintScoutRun.choiceIndex = choice.index;
          choiceButtons.forEach(item => item.setAttribute('aria-pressed', String(item === button)));
          if (revealButton) revealButton.disabled = false;
        });
        choiceButtons.push(button);
        choices.append(button);
      });
      section.append(choices);
      if (!blueprintScoutRun.revealed) {
        revealButton = createElement('button', 'button swishiq-blueprint__scout-action');
        revealButton.type = 'button';
        revealButton.textContent = 'Lock pick and reveal';
        revealButton.disabled = blueprintScoutRun.choiceIndex === null;
        revealButton.addEventListener('click', () => {
          blueprintScoutRun = scoreBlueprintScoutPick(blueprintScoutRun, spec.matchup, blueprintScoutRun.choiceIndex);
          renderBlueprintPlayer();
          byId('blueprintScoutOutcome')?.focus();
        });
        section.append(revealButton);
      } else {
        const chosen = spec.matchup.choices.find(choice => choice.index === blueprintScoutRun.choiceIndex);
        const correct = chosen?.value === spec.matchup.bestValue;
        const outcome = createElement('div', 'swishiq-blueprint__scout-outcome');
        outcome.id = 'blueprintScoutOutcome';
        outcome.tabIndex = -1;
        outcome.setAttribute('role', 'status');
        outcome.textContent = correct
          ? `Correct pick. ${blueprintScoutRun.score} correct so far.`
          : `The top recorded rate was ${formatMetric(spec.matchup.bestValue)} ${spec.unit}. ${blueprintScoutRun.score} correct so far.`;
        const values = createElement('ol', 'swishiq-blueprint__scout-values');
        [...spec.matchup.choices].sort((left, right) => right.value - left.value).forEach(choice => {
          const item = createElement('li');
          item.textContent = `${choice.player} · ${choice.team}: ${formatMetric(choice.value)} ${spec.unit}`;
          values.append(item);
        });
        outcome.append(values);
        section.append(outcome);
        const next = createElement('button', 'button swishiq-blueprint__scout-action');
        next.type = 'button';
        next.textContent = available.length > 1 ? 'Choose next focus' : 'Finish scouting run';
        next.addEventListener('click', () => {
          const completed = [...blueprintScoutRun.completed, spec.key];
          const finished = completed.length === rounds.length;
          blueprintScoutRun = { ...blueprintScoutRun, completed,
            selectedMetricKey: null, choiceIndex: null, revealed: false,
            evidenceOpen: false,
            bestScore: finished ? Math.max(blueprintScoutRun.bestScore, blueprintScoutRun.score) : blueprintScoutRun.bestScore,
            completedRuns: blueprintScoutRun.completedRuns + Number(finished) };
          renderBlueprintPlayer();
          byId('blueprintScoutTitle')?.focus();
        });
        section.append(next);
      }
    }
    title.id = 'blueprintScoutTitle';
    title.tabIndex = -1;
    blueprintSnapshots.append(section);
    const evidence = createElement('details', 'swishiq-blueprint__scout-evidence');
    evidence.open = blueprintScoutRun.revealed || Boolean(blueprintScoutRun.evidenceOpen);
    const summary = createElement('summary');
    summary.textContent = 'Season snapshot values';
    evidence.append(summary);
    const runForEvidence = blueprintScoutRun;
    evidence.addEventListener('toggle', () => {
      if (blueprintScoutRun === runForEvidence) blueprintScoutRun.evidenceOpen = evidence.open;
    });
    blueprintSnapshots.append(evidence);
    return evidence;
  }

  function renderBlueprintContextState() {
    if (!blueprintSnapshots || (!publicPlayerContextPromise && !publicPlayerContextError)) return;
    const note = createElement('p', 'swishiq-blueprint__context-state swishiq-advanced-muted');
    note.setAttribute('role', 'status');
    note.setAttribute('aria-live', 'polite');
    note.textContent = publicPlayerContextError
      ? 'Player bio, career history, and awards are unavailable.'
      : 'Loading player bio, career history, and awards…';
    blueprintSnapshots.append(note);
  }

  function renderBlueprintPlayer() {
    if (!blueprintSelect || !blueprintSnapshots) return;
    blueprintSeasonControls?.replaceChildren();
    scheduleStudioPaletteSync();
    selectedBlueprintPlayerRefs = retainSelectedBlueprintPlayerRefs(selectedBlueprintPlayerRefs, blueprint.players);
    const selectedPlayers = blueprint.players
      .filter(item => blueprintProfilePlayerRef
        ? item.playerRef === blueprintProfilePlayerRef
        : selectedBlueprintPlayerRefs.has(item.playerRef))
      .slice(0, BLUEPRINT_MAX_SELECTED_PLAYERS);
    if (!selectedPlayers.length) {
      blueprintScoutRun = null;
      blueprintSnapshots.hidden = true;
      clearBlueprintSnapshots();
      if (blueprintSeasonsStatus === 'failed') {
        setBlueprintState('Unavailable', false);
        renderBlueprintSeasonsError(blueprintSeasonsError || 'The exact season snapshot is unavailable.', selectedPackage);
        return;
      }
      const rosterReady = blueprint.players.length > 0;
      setBlueprintState(rosterReady ? 'Ready' : blueprintSeasonsStatus === 'loading' ? 'Loading' : 'Ready', rosterReady);
      setBlueprintRosterStatus();
      return;
    }
    blueprintSnapshots.hidden = false;
    if (playerMetadataStatus === 'idle') void loadBlueprintPlayerMetadata();
    if (blueprintSeasonsStatus === 'idle') {
      setBlueprintState('Loading', false);
      setBlueprintStatus('Loading recorded rates for the selected player…');
      renderBlueprintEmpty('Loading the exact season snapshot…');
      void loadBlueprintSeasonsFor(selectedPackage);
      return;
    }
    if (blueprintSeasonsStatus === 'loading') {
      blueprintPanel?.setAttribute('aria-busy', 'true');
      setBlueprintState('Loading', false);
      setBlueprintStatus('Loading the exact selected-season rows and team filters…');
      renderBlueprintEmpty('Loading the exact season snapshot…');
      return;
    }
    if (blueprintSeasonsStatus === 'failed') {
      setBlueprintState('Unavailable', false);
      renderBlueprintSeasonsError(blueprintSeasonsError || 'The exact season snapshot is unavailable.', selectedPackage);
      return;
    }
    const seasonFilter = Number(selectedPackage?.package?.scope?.seasonStartYear || 0);
    if (blueprintRosterStatsYear !== seasonFilter
      || (!(blueprintRosterStats instanceof Map) && !blueprintRosterStatsError && !blueprintRosterStatsPromise)) {
      loadBlueprintRosterStats();
    }
    if (!(blueprintRosterStats instanceof Map) && !blueprintRosterStatsError) {
      setBlueprintState('Loading', false);
      setBlueprintStatus('Checking exact team-season stats for the selected players…');
      renderBlueprintEmpty('Checking exact team-season stats…');
      return;
    }
    const restoreSeasonTypeFocus = blueprintSeasonTypeFocusRequested;
    const restoreProfileFocus = blueprintProfileFocusRequested
      || (!restoreSeasonTypeFocus && Boolean(blueprintSnapshots.contains?.(documentRef.activeElement)));
    const teamFilter = String(blueprintTeamFilter?.value || '').trim().toUpperCase();
    clearBlueprintSnapshots();
    const currentPackageKey = selectionKey(selectedPackage);
    if (blueprintSeasonTypePackageKey !== currentPackageKey) {
      blueprintSeasonTypePackageKey = currentPackageKey;
      blueprintSeasonType = 'regular';
    }
    const seasonTypes = availableBlueprintSeasonTypes(blueprint.seasons, selectedPlayers, seasonFilter, teamFilter);
    const activeSeasonType = seasonTypes.includes(blueprintSeasonType)
      ? blueprintSeasonType
      : seasonTypes.includes('regular') ? 'regular' : seasonTypes[0] || 'regular';
    blueprintSeasonType = activeSeasonType;
    const seasonTypeControl = createBlueprintSeasonTypeControl({
      createElement,
      id: 'blueprint-season-type',
      phases: seasonTypes,
      value: activeSeasonType,
      onChange: phase => {
        if (!seasonTypes.includes(phase) || phase === blueprintSeasonType) return;
        blueprintSeasonType = phase;
        blueprintSeasonTypeFocusRequested = true;
        renderBlueprintPlayer();
      },
    });
    if (seasonTypes.length) (blueprintSeasonControls || blueprintSnapshots).append(seasonTypeControl.element);
    const contextReady = publicPlayerContext instanceof Map;
    let renderedRows = 0;
    let hasMetric = false;
    const entries = [];
    selectedPlayers.forEach(player => {
      const rows = seasonRows(blueprint.seasons, player.playerRef, seasonFilter, activeSeasonType)
        .filter(row => !teamFilter || row.teamCode === teamFilter);
      if (!rows.length) return;
      const context = contextReady ? playerContextForPlayer(publicPlayerContext, player.displayName) : null;
      rows.forEach((row, index) => {
        const entry = { player, row };
        const publicStats = blueprintRosterPublicStats(entry, blueprintRosterStats);
        const displayRow = row.phase === 'regular'
          ? blueprintPublicDisplayRow(entry, blueprintRosterStats, publicStats)
          : blueprintObservedPhaseDisplayRow(entry, selectedPackage?.package?.packageVersion);
        if (!displayRow) return;
        renderedRows += 1;
        hasMetric = hasMetric || BLUEPRINT_METRICS.some(metric => metricValue(displayRow, metric.key, metric.metricUnit) !== null);
        entry.displayRow = displayRow;
        entry.publicStats = publicStats;
        entry.context = context;
        entry.includeContext = contextReady && index === 0;
        entry.contextAvailableElsewhere = contextReady && index > 0;
        entries.push(entry);
      });
      if (!contextReady && !publicPlayerContextError) void loadSelectedPlayerContext(player.playerRef);
    });
    if (!renderedRows) {
      blueprintScoutRun = null;
      setBlueprintState('Unavailable', false);
      renderBlueprintEmpty(`This season has no recorded ${blueprintSeasonTypeLabel(activeSeasonType).toLowerCase()} row for the selected players.`);
      return;
    }
    const evidenceRoot = renderBlueprintScoutGame(entries) || blueprintSnapshots;
    const comparison = renderBlueprintComparison(entries);
    if (comparison) evidenceRoot.append(comparison);
    entries.forEach(entry => {
      const snapshot = renderBlueprintSnapshot(entry.row, entry.player, {
        context: entry.context,
        includeContext: entry.includeContext,
        contextAvailableElsewhere: entry.contextAvailableElsewhere,
        contextError: publicPlayerContextError,
        contextStatus: contextReady ? 'ready' : publicPlayerContextError ? 'unavailable' : 'loading',
        showHeroStats: !comparison,
        displayRow: entry.displayRow,
      });
      evidenceRoot.append(snapshot);
    });
    if (restoreSeasonTypeFocus) {
      blueprintSnapshots.querySelector('.swishiq-blueprint__season-type-select')?.focus?.({ preventScroll: true });
      blueprintSeasonTypeFocusRequested = false;
    }
    if (restoreProfileFocus) {
      const profile = blueprintSnapshots.querySelector('.swishiq-blueprint__snapshot');
      profile?.focus?.({ preventScroll: true });
      if (profile && blueprintProfilePlayerRef) {
        const requestedPlayerRef = blueprintProfilePlayerRef;
        const scheduleAfterLayout = documentRef?.defaultView?.requestAnimationFrame
          ? callback => documentRef.defaultView.requestAnimationFrame(callback)
          : callback => callback();
        scheduleAfterLayout(() => {
          if (blueprintProfilePlayerRef !== requestedPlayerRef) return;
          const currentProfile = blueprintSnapshots.querySelector('.swishiq-blueprint__snapshot');
          if (!currentProfile?.isConnected) return;
          currentProfile.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
        });
      }
      blueprintProfileFocusRequested = false;
    }
    renderBlueprintContextState();
    setBlueprintState(hasMetric ? 'Ready' : 'Unavailable', hasMetric);
  }

  function renderBlueprintLoading() {
    if (!blueprintPanel) return;
    blueprintPanel.setAttribute('aria-busy', 'true');
    setBlueprintPickerDisabled(true);
    setBlueprintState('Loading', false);
    setBlueprintStatus('Loading player list…');
    if (blueprintSelect) {
      blueprintSelect.disabled = true;
      blueprintSelect.replaceChildren(createOption('Loading players…', ''));
    }
    if (blueprintPlayerMenu) blueprintPlayerMenu.replaceChildren();
    if (blueprintPlayerPickerSummary) blueprintPlayerPickerSummary.textContent = 'Loading players…';
    [blueprintTeamFilter, blueprintPositionFilter, blueprintCoverageFilter].forEach(filter => {
      if (filter) { filter.disabled = true; filter.replaceChildren(createOption(filter === blueprintTeamFilter ? 'All teams' : filter === blueprintPositionFilter ? 'All positions' : 'Any coverage', '')); }
    });
    refreshPaletteSelect(blueprintTeamFilter);
    refreshPaletteSelect(blueprintPositionFilter);
    refreshPaletteSelect(blueprintCoverageFilter);
    if (blueprintSearch) {
      blueprintSearch.disabled = true;
      blueprintSearch.value = '';
    }
    blueprintSnapshots?.replaceChildren();
    if (blueprintSnapshots) blueprintSnapshots.hidden = true;
    renderBlueprintRoster();
  }

  function renderBlueprintError(message) {
    if (!blueprintPanel) return;
    blueprintPanel.removeAttribute('aria-busy');
    setBlueprintPickerDisabled(true);
    setBlueprintState('Failed', false);
    setBlueprintStatus('Player data could not be loaded.');
    if (blueprintSelect) {
      blueprintSelect.disabled = true;
      blueprintSelect.replaceChildren(createOption('Player data unavailable', ''));
    }
    if (blueprintPlayerMenu) blueprintPlayerMenu.replaceChildren();
    if (blueprintPlayerPickerSummary) blueprintPlayerPickerSummary.textContent = 'Player data unavailable';
    [blueprintTeamFilter, blueprintPositionFilter, blueprintCoverageFilter].forEach(filter => { if (filter) filter.disabled = true; });
    refreshPaletteSelect(blueprintTeamFilter);
    refreshPaletteSelect(blueprintPositionFilter);
    refreshPaletteSelect(blueprintCoverageFilter);
    if (blueprintSearch) {
      blueprintSearch.disabled = true;
      blueprintSearch.value = '';
    }
    blueprintSnapshots?.replaceChildren();
    if (blueprintSnapshots) blueprintSnapshots.hidden = true;
    renderBlueprintRoster();
  }

  function renderBlueprintSeasonsError(message, proof) {
    if (!blueprintPanel) return;
    blueprintPanel.removeAttribute('aria-busy');
    const hasSelectedProfile = Boolean(blueprintProfilePlayerRef || selectedBlueprintPlayerRefs.size);
    const playerListStillUsable = blueprint.players.length > 0;
    setBlueprintState(playerListStillUsable ? 'Ready' : 'Unavailable', playerListStillUsable);
    setBlueprintStatus(playerListStillUsable
      ? 'The roster table remains available, but this player-season snapshot could not be loaded.'
      : 'Season data could not be loaded.');
    if (hasSelectedProfile) {
      renderBlueprintEmpty('Player-season data could not be loaded.');
      const retry = createElement('button', 'button-secondary swishiq-blueprint__retry');
      retry.type = 'button';
      retry.textContent = 'Retry season data';
      retry.addEventListener('click', () => {
        retry.disabled = true;
        void loadBlueprintSeasonsFor(proof);
      });
      blueprintSnapshots.append(retry);
    } else if (blueprintSnapshots) {
      blueprintSnapshots.replaceChildren();
      blueprintSnapshots.hidden = true;
    }
  }

  function syncBlueprintVisibility(activeWorkbench) {
    if (!blueprintPanel) return;
    const isBlueprint = activeWorkbench === 'blueprint';
    blueprintPanel.hidden = !isBlueprint;
  }

  // Only start the large verified player-season artifact after a player is
  // explicitly selected. The roster table uses the exact membership artifact
  // and separately attributed public season-stats shard.
  async function loadBlueprintSeasonsFor(proof) {
    if (!proof || capabilityStatus(proof, 'swishiqStudio') !== 'available') return false;
    const cacheKey = selectionKey(proof);
    const cachedSeasons = blueprintSeasonsByPackage.get(cacheKey);
    if (cachedSeasons) {
      blueprint.seasons = cachedSeasons;
      blueprintSeasonsProof = proof;
      blueprintSeasonsStatus = 'ready';
      blueprintSeasonsError = '';
      blueprintPanel?.removeAttribute('aria-busy');
      renderBlueprintRoster();
      renderBlueprintPlayer();
      return true;
    }
    if (blueprintSeasonsStatus === 'ready' && blueprintSeasonsProof === proof) return true;
    if (blueprintSeasonsPromise) return blueprintSeasonsPromise;
    const token = blueprintLoadToken;
    blueprintSeasonsStatus = 'loading';
    blueprintSeasonsError = '';
    const hasSelection = selectedBlueprintPlayerRefs.size > 0;
    if (hasSelection) {
      blueprintPanel?.setAttribute('aria-busy', 'true');
      setBlueprintState('Loading', false);
      setBlueprintStatus('Loading the exact selected-season rows and team filters…');
      renderBlueprintEmpty('Loading the exact season snapshot…');
    } else {
      blueprintPanel?.removeAttribute('aria-busy');
      setBlueprintState(blueprint.players.length ? 'Ready' : 'Loading', blueprint.players.length > 0);
      blueprintSnapshots?.replaceChildren();
      if (blueprintSnapshots) blueprintSnapshots.hidden = true;
    }
    renderBlueprintRoster();
    const request = beginBlueprintRequest(
      requestFetch => fetchPublicPart(proof, 'player-seasons', 'player-seasons', requestFetch),
      STUDIO_PLAYER_SEASONS_TIMEOUT_MESSAGE,
    );
    blueprintRequest = request;
    blueprintSeasonsPromise = request.promise;
    try {
      const seasons = await request.promise;
      if (token !== blueprintLoadToken || selectedPackage !== proof) return false;
      blueprint.seasons = seasons;
      blueprintSeasonsByPackage.set(cacheKey, seasons);
      blueprintSeasonsProof = proof;
      blueprintSeasonsStatus = 'ready';
      blueprintSeasonsError = '';
      renderBlueprintFilters();
      renderBlueprintOptions();
      blueprintPanel?.removeAttribute('aria-busy');
      renderBlueprintRoster();
      renderBlueprintPlayer();
      return true;
    } catch (error) {
      if (token !== blueprintLoadToken || selectedPackage !== proof) return false;
      blueprintSeasonsStatus = 'failed';
      blueprintSeasonsError = 'Player season data could not be loaded.';
      renderBlueprintFilters();
      renderBlueprintOptions();
      renderBlueprintRoster();
      renderBlueprintPlayer();
      return false;
    } finally {
      if (blueprintSeasonsPromise === request.promise) blueprintSeasonsPromise = null;
      if (blueprintRequest === request) blueprintRequest = null;
    }
  }

  async function loadBlueprintFor(proof) {
    const sourcePolicy = resolveCanonicalV4SiteConsumerSourcePolicy({
      releasePin: CANONICAL_V4_STUDIO_RUNTIME_RELEASE_PIN,
      consumerId: 'studio-player-builder-and-bootstrap',
    });
    if (sourcePolicy.v4Required) {
      cancelBlueprintRequest();
      ++blueprintLoadToken;
      blueprint = { players: [], seasons: [], memberships: [] };
      blueprintSeasonsPromise = null;
      blueprintSeasonsStatus = 'idle';
      blueprintMembershipsPromise = null;
      blueprintMembershipsStatus = 'idle';
      selectedBlueprintPlayerRefs = new Set();
      blueprintProfilePlayerRef = '';
      clearBlueprintSnapshots();
      // The static shell starts this legacy panel as busy. V4 replaces its
      // roster body with an independently busy-tracked exact-season table, so
      // clear the shell-level state before the V4 request begins.
      blueprintPanel?.removeAttribute('aria-busy');
      setBlueprintState(sourcePolicy.releaseReady ? 'Ready' : 'Unavailable', Boolean(sourcePolicy.releaseReady));
      renderPlayerBuilderV4Mode(sourcePolicy);
      return;
    }
    restorePlayerBuilderV3Mode();
    cancelBlueprintRequest();
    const token = ++blueprintLoadToken;
    selectedBlueprintPlayerRefs = new Set();
    blueprintProfilePlayerRef = '';
    blueprintProfileFocusRequested = false;
    blueprintRosterPage = 0;
    const cachedSeasons = proof ? blueprintSeasonsByPackage.get(selectionKey(proof)) : null;
    const cachedMemberships = proof ? blueprintMembershipsByPackage.get(selectionKey(proof)) : null;
    blueprint = { players: [], seasons: cachedSeasons || [], memberships: cachedMemberships || [] };
    blueprintSeasonsPromise = null;
    blueprintSeasonsProof = cachedSeasons ? proof : null;
    blueprintSeasonsStatus = cachedSeasons ? 'ready' : 'idle';
    blueprintSeasonsError = '';
    blueprintMembershipsPromise = null;
    blueprintMembershipsProof = cachedMemberships ? proof : null;
    blueprintMembershipsStatus = cachedMemberships ? 'ready' : 'idle';
    blueprintMembershipsError = '';
    const seasonStartYear = Number(proof?.package?.scope?.seasonStartYear || 0);
    blueprintRosterStatsYear = seasonStartYear;
    blueprintRosterStats = blueprintRosterStatsByYear.get(seasonStartYear) || null;
    blueprintRosterStatsError = '';
    blueprintRosterStatsPromise = blueprintRosterStatsPromisesByYear.get(seasonStartYear) || null;
    if (!blueprintPanel || !proof || capabilityStatus(proof, 'swishiqStudio') !== 'available') {
      if (blueprintPanel) {
        blueprintPanel.removeAttribute('aria-busy');
        blueprintPanel.hidden = true;
      }
      setBlueprintPickerDisabled(true);
      if (blueprintPlayerMenu) blueprintPlayerMenu.replaceChildren();
      if (blueprintPlayerPickerSummary) blueprintPlayerPickerSummary.textContent = 'Player data unavailable';
      renderBlueprintRoster();
      return;
    }
    renderBlueprintLoading();
    const request = beginBlueprintRequest(
      requestFetch => fetchPublicPart(proof, 'players', 'players', requestFetch),
      STUDIO_PLAYER_ROSTER_TIMEOUT_MESSAGE,
    );
    blueprintRequest = request;
    try {
      const players = await request.promise;
      if (token !== blueprintLoadToken || selectedPackage !== proof) return;
      blueprint.players = playerRows(players);
      if (!blueprint.players.length) throw new Error('No player rows are available for this season.');
      renderBlueprintFilters();
      renderBlueprintOptions();
      if (blueprintSelect) blueprintSelect.disabled = false;
      if (blueprintSearch) blueprintSearch.disabled = false;
      setBlueprintPickerDisabled(false);
      setBlueprintState('Ready', true);
      renderBlueprintRoster();
      ensureBlueprintTableDataFor(proof);
    } catch (error) {
      if (token !== blueprintLoadToken || selectedPackage !== proof) return;
      blueprintSeasonsStatus = 'failed';
      blueprintSeasonsError = 'Player data is unavailable for this season.';
      renderBlueprintError(blueprintSeasonsError);
    } finally {
      if (blueprintRequest === request) blueprintRequest = null;
      if (token === blueprintLoadToken && !blueprintSeasonsPromise) blueprintPanel?.removeAttribute('aria-busy');
    }
  }

  function renderWorkbench() {
    const active = tabs.find(item => item.getAttribute('aria-pressed') === 'true') || tabs[0];
    const workbench = active?.dataset.workbench || 'blueprint';
    scheduleStudioPaletteSync();
    const capability = active?.dataset.capability || 'swishiqStudio';
    const browserCapability = active?.dataset.browserCapability || capability;
    const [label, description] = tabLabels[workbench] || tabLabels.blueprint;
    const usesPooledCareer = workbench === 'career';
    const usesSeparateNativeSeasonSource = workbench === 'season';
    if (usesSeparateNativeSeasonSource) {
      const nativeState = byId('seasonLabSourceState')?.dataset.state || '';
      workbenchLabel.textContent = label;
      workbenchLabel?.removeAttribute('aria-hidden');
      workbenchState?.removeAttribute('aria-hidden');
      workbenchDescription?.removeAttribute('aria-hidden');
      if (workspace) {
        workspace.removeAttribute('aria-labelledby');
        workspace.setAttribute('aria-label', label);
      }
      if (!nativeState || nativeState === 'checking') {
        workbenchDescription.textContent = description;
        workspaceTitle.textContent = 'Season Lab';
        setState(workbenchState, 'Loading team data', 'loading');
      }
      if (workspace) workspace.dataset.ready = 'false';
      hidePlaceholder();
      syncBlueprintVisibility(workbench);
      return;
    }
    const capabilityProof = usesPooledCareer ? studio.pooledCareer : selectedPackage;
    const capabilityAvailable = capabilityStatus(capabilityProof, browserCapability) === 'available';
    const registryFailed = !selectedPackage && !usesPooledCareer && Boolean(unavailableMessage);
    // Each advanced panel owns its data fetch and renders only after the
    // selected package proof exposes its capability. The shell still needs to
    // present those panels as real browser surfaces instead of leaving the
    // misleading “view pending” placeholder in front of them.
    const browserReady = ['blueprint', 'chemistry', 'composite', 'game', 'season', 'career', 'spin'].includes(workbench) && capabilityAvailable;
    if (workspace) workspace.dataset.ready = String(browserReady);
    if (workspace) {
      if (browserReady) {
        workspace.removeAttribute('aria-labelledby');
        workspace.setAttribute('aria-label', label);
      } else {
        workspace.setAttribute('aria-labelledby', 'workspaceTitle');
        workspace.removeAttribute('aria-label');
      }
    }
    workspaceTitle?.toggleAttribute('aria-hidden', browserReady);
    workbenchLabel?.toggleAttribute('aria-hidden', browserReady);
    workbenchState?.toggleAttribute('aria-hidden', browserReady);
    workbenchDescription?.toggleAttribute('aria-hidden', browserReady);
    workbenchLabel.textContent = label;
    if (!selectedPackage && !usesPooledCareer) {
      workbenchDescription.textContent = `${description} Pick a season.`;
      workspaceTitle.textContent = registryFailed ? 'Season data unavailable' : 'Pick a season';
      setState(workbenchState, registryFailed ? 'Failed' : 'Unavailable', registryFailed ? 'failed' : 'unavailable');
      renderPlaceholder({
        label: registryFailed ? 'Failed' : 'Unavailable',
        title: registryFailed ? 'Season data could not be loaded' : 'No season is available',
        copy: registryFailed
          ? 'Season data could not be loaded. Use Retry season data to try again.'
          : 'Choose an available season to continue.',
        requirements: ['Season data'],
      });
    } else if (browserReady) {
      const sourcePackage = usesPooledCareer ? studio.pooledCareer : selectedPackage;
      workbenchDescription.textContent = usesPooledCareer
        ? `${description} Using the pooled 2017–26 history.`
        : `${description} Using the selected season.`;
      workspaceTitle.textContent = 'Ready to explore';
      setState(workbenchState, 'Available', 'available');
      hidePlaceholder();
    } else if (capabilityAvailable) {
      workbenchDescription.textContent = `${description} The data is ready; the page is still being connected.`;
      workspaceTitle.textContent = 'Connection in progress';
      setState(workbenchState, 'Data needed', 'data-needed');
      renderPlaceholder({
        label: 'Data needed',
        title: `${label} is not connected yet`,
        copy: 'The data is ready, but this browser view still needs its final connection.',
        requirements: ['Browser view', 'Public-safe renderer'],
      });
    } else {
      workbenchDescription.textContent = `${description} More data is needed for this view.`;
      workspaceTitle.textContent = 'More data needed';
      setState(workbenchState, 'Data needed', 'data-needed');
      const requirements = workbench === 'season'
        ? ['Team ratings and player ratings', 'Rosters and rotations', 'Schedule and simulation settings']
        : workbench === 'game'
        ? ['Challenge board', 'Player ratings', 'Game evaluator']
        : workbench === 'chemistry'
          ? ['Player comparison results', 'Team-season player stats']
          : ['Season player stats'];
      renderPlaceholder({
        label: 'Data needed',
        title: `${label} is not ready for ${usesPooledCareer ? 'the pooled 2017–26 window' : packageLabel(selectedPackage)}`,
        copy: workbench === 'season'
          ? 'Season Lab opens when this season has the simulation inputs it needs.'
          : workbench === 'career'
          ? 'The pooled 2017–26 recorded-history capability is unavailable. Forecasts remain unavailable in this public release.'
          : workbench === 'game'
          ? 'Game Lab opens when this season has a board and evaluator.'
          : 'This season does not include the data this view needs. No substitute result is shown.',
        requirements,
      });
    }
    syncBlueprintVisibility(workbench);
    if (workbench === 'blueprint' && blueprint.players.length) ensureBlueprintTableDataFor(selectedPackage);
  }

  function activateWorkbenchModule(workbench) {
    if (workbench === 'blueprint') return;
    const moduleKey = workbenchModuleKey(workbench);
    const usesPooledCareer = workbench === 'career';
    const activeTab = tabs.find(item => item.getAttribute('aria-pressed') === 'true');
    const capability = activeTab?.dataset.browserCapability || activeTab?.dataset.capability || 'swishiqStudio';
    const capabilityProof = usesPooledCareer ? studio.pooledCareer : selectedPackage;
    const needsSeparateSeasonSource = workbench === 'season';
    if (!needsSeparateSeasonSource && capabilityStatus(capabilityProof, capability) !== 'available') return;
    // A loaded workbench owns its later click/change listeners. Only the first
    // tab click needs an explicit activation after the dynamic import resolves;
    // calling it again here would start a second fetch on every return visit.
    if (workbenchControllers.has(moduleKey) || workbenchModulePromises.has(moduleKey)) return;
    const [label] = tabLabels[workbench] || tabLabels.blueprint;
    setState(workbenchState, 'Loading', 'loading');
    if (workspaceTitle) workspaceTitle.textContent = `${label} loading`;
    if (workbenchDescription) workbenchDescription.textContent = `Preparing the ${label} workbench…`;
    void ensureWorkbenchModule(workbench)
      .then(controller => {
        if (controller?.activate) return controller.activate();
        return controller?.reload?.();
      })
      .then(() => {
        const activeWorkbench = tabs.find(item => item.getAttribute('aria-pressed') === 'true')?.dataset.workbench || '';
        if (activeWorkbench === workbench) renderWorkbench();
      })
      .catch(error => {
        const activeWorkbench = tabs.find(item => item.getAttribute('aria-pressed') === 'true')?.dataset.workbench || '';
        if (activeWorkbench !== workbench) return;
        setState(workbenchState, 'Unavailable', 'unavailable');
        if (workspaceTitle) workspaceTitle.textContent = `${label} unavailable`;
        if (workbenchDescription) workbenchDescription.textContent = 'This workbench could not be loaded. Select it again to retry.';
        renderPlaceholder({
          label: 'Workbench unavailable',
          title: `${label} could not be loaded`,
          copy: 'Select this workbench again to retry.',
          requirements: [],
        });
      });
  }

  function renderPackage() {
    if (!studio.packages.length) {
      selectedPackage = null;
    select.disabled = true;
    select.replaceChildren(createOption('No season yet', ''));
      refreshPaletteSelect(select);
      registryStatus.textContent = '';
      packageNote.textContent = '';
      if (retryRegistry) retryRegistry.hidden = false;
      renderCapabilityList();
      void loadBlueprintFor(null);
      renderWorkbench();
      return;
    }
    if (retryRegistry) retryRegistry.hidden = true;
    select.disabled = false;
    select.replaceChildren(...studio.packages.map(proof => createOption(packageLabel(proof), selectionKey(proof))));
    // Start on the newest published exact season. Older seasons remain
    // explicitly selectable; they must never become the implicit default just
    // because the registry is sorted chronologically for display.
    selectedPackage = newestExactPackage(studio.packages);
    select.value = selectionKey(selectedPackage);
    refreshPaletteSelect(select);
    registryStatus.textContent = '';
    packageNote.textContent = '';
    renderCapabilityList();
    void loadBlueprintFor(selectedPackage);
    renderWorkbench();
  }

  async function load() {
    const token = ++registryLoadToken;
    registryLoadController?.abort();
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    registryLoadController = controller;
    const guardedFetch = controller && typeof fetchImpl === 'function'
      ? (input, init = {}) => fetchImpl(input, { ...init, signal: controller.signal })
      : fetchImpl;
    unavailableMessage = '';
    if (retryRegistry) retryRegistry.hidden = true;
    registryStatus.textContent = '';
    packageNote.textContent = '';
    setCapabilityState('Checking', false);
    if (capabilitySummary) capabilitySummary.textContent = 'Loading exact seasons…';
    if (capabilityList) {
      capabilityList.replaceChildren();
      const loading = createElement('li', 'swishiq-capability-list__item');
      loading.dataset.status = 'loading';
      loading.textContent = 'Loading available tools…';
      capabilityList.append(loading);
    }
    let timeoutId = null;
    try {
      const boot = (async () => {
        const nextStudio = useReviewedV4Bootstrap
          ? await loadCanonicalV4StudioPublishedPackages({
            releasePin: CANONICAL_V4_STUDIO_RUNTIME_RELEASE_PIN,
            fetchImpl: guardedFetch,
            signal: controller?.signal,
            baseUrl: documentRef.defaultView?.location?.href,
          })
          : await loadSwishIqStudioPublishedPackages({ registryUrl, fetchImpl: guardedFetch });
        return { nextStudio };
      })();
      const next = await Promise.race([
        boot,
        new Promise((_, reject) => {
          timeoutId = setTimeout(() => {
            controller?.abort();
            reject(new Error(STUDIO_BOOT_TIMEOUT_MESSAGE));
          }, studioBootTimeoutMs(bootTimeoutMs));
        }),
      ]);
      if (token !== registryLoadToken) return;
      const { nextStudio } = next;
      if (token !== registryLoadToken) return;
      studio = nextStudio;
    } catch (error) {
      if (token !== registryLoadToken) return;
      studio = { packages: [], pooledCareer: null };
        unavailableMessage = 'Season data could not be loaded.';
      playerMetadata = new Map();
    } finally {
      if (timeoutId !== null) clearTimeout(timeoutId);
      if (registryLoadController === controller) registryLoadController = null;
    }
    renderPackage();
  }

  tabs.forEach(button => button.addEventListener('click', () => {
    tabs.forEach(item => item.setAttribute('aria-pressed', String(item === button)));
    renderWorkbench();
    activateWorkbenchModule(button.dataset.workbench || '');
    keepWorkbenchTabVisible(button);
  }));
  retryRegistry?.addEventListener('click', () => {
    void load();
  });
  blueprintPlayerPicker?.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      blueprintPlayerPicker.open = false;
      blueprintPlayerPickerSummary?.focus();
    }
  });
  blueprintPlayerPicker?.addEventListener('toggle', () => {
    if (blueprintPlayerPicker.open && blueprint.players.length) renderBlueprintOptions();
  });
  documentRef.addEventListener('pointerdown', event => {
    if (blueprintPlayerPicker?.open && !blueprintPlayerPicker.contains(event.target)) blueprintPlayerPicker.open = false;
  });
  select.addEventListener('change', event => {
    selectedPackage = studio.packages.find(proof => selectionKey(proof) === event.target.value) || null;
    if (selectedPackage) {
      registryStatus.textContent = '';
      packageNote.textContent = '';
    }
    renderCapabilityList();
    void loadBlueprintFor(selectedPackage);
    renderWorkbench();
  });
  blueprintSelect?.addEventListener('change', () => {
    blueprintProfilePlayerRef = '';
    blueprintProfileFocusRequested = false;
    const visibleRefs = [...blueprintSelect.options].map(option => option.value).filter(Boolean);
    const nextVisibleRefs = [...blueprintSelect.selectedOptions].map(option => option.value).filter(Boolean);
    selectedBlueprintPlayerRefs = mergeVisibleBlueprintPlayerSelection({
      selectedRefs: selectedBlueprintPlayerRefs,
      visibleRefs,
      nextVisibleRefs,
      availablePlayers: blueprint.players,
    });
    renderBlueprintOptions();
    renderBlueprintPlayer();
    setBlueprintRosterStatus();
  });
  [blueprintTeamFilter, blueprintPositionFilter, blueprintCoverageFilter].forEach(filter => filter?.addEventListener('change', () => {
    blueprintRosterPage = 0;
    if (filter === blueprintCoverageFilter) blueprintCoverageSelection = blueprintCoverageFilter?.value || '';
    renderBlueprintOptions();
    renderBlueprintRoster();
    // A team change narrows the open player profile to that exact team row.
    if (filter === blueprintTeamFilter) renderBlueprintPlayer();
    setBlueprintRosterStatus();
  }));
  blueprintSearch?.addEventListener('input', () => {
    blueprintRosterPage = 0;
    renderBlueprintOptions();
    renderBlueprintRoster();
    setBlueprintRosterStatus();
  });
  void load();
  return Object.freeze({ reload: load });
}

if (typeof document !== 'undefined') startSwishIqStudio();
