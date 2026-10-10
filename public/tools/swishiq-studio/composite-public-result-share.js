/*
 * Narrow public-share adapter for one completed Composite Forge recipe.
 * Only its fixed modeled-stat allowlist and the verified exact-season package
 * pin can cross the share boundary. Recipes, donor maps, identities, and seeds
 * remain local to the builder.
 */

import { projectPublicResultShareV1 } from './engine/public-result-share.js?v=20260929e&rev=game-points-v2-public-share-20260929e';
import { projectPublicResultShareV4 } from './engine/public-result-share-v4.js?v=20261001e&rev=daily-v4-rank-share-summary-v2';
import {
  createSignedPublicResultShareLink,
  isSignedPublicResultShareAvailable,
} from './engine/public-result-share-client.js?v=20261001f&rev=studio-runtime-shared-dependency-closure-v1';
import {
  COMPOSITE_FORGE_COMPONENTS,
  COMPOSITE_FORGE_MODEL_VERSION,
  COMPOSITE_FORGE_RECIPE_VERSION,
} from './engine/composite-forge.js?v=20261001d&rev=composite-forge-model-v21-swishiq-v3-recipe-v3';

const COMPOSITE_SHARE_METRICS = Object.freeze({
  points: 'pointsPerGame',
  assists: 'assistsPerGame',
  turnovers: 'turnoversPerGame',
  rebounds: 'reboundsPerGame',
  steals: 'stealsPerGame',
  blocks: 'blocksPerGame',
  involvementPer36: 'involvementPer36',
  fieldGoalPercentage: 'fieldGoalPercentage',
  threePointPercentage: 'threePointPercentage',
  threePointAttemptShare: 'threePointAttemptShare',
  freeThrowPercentage: 'freeThrowPercentage',
  trueShootingPercentage: 'trueShootingPercentage',
  effectiveFieldGoalPercentage: 'effectiveFieldGoalPercentage',
  minutesPerGame: 'minutesPerGame',
  games: 'games',
});

const HASH = /^[a-f0-9]{64}$/i;
const V4_SHARE_UNAVAILABLE_CODE = 'v4-composite-share-unavailable';

function shareFail(message) {
  throw new TypeError(`Composite Forge public share: ${message}`);
}

function typedV4ShareUnavailable(cause) {
  const error = new TypeError('V4 Composite sharing is unavailable because the exact release, model result, or approval proof did not validate.');
  error.name = 'V4CompositeShareUnavailableError';
  error.code = V4_SHARE_UNAVAILABLE_CODE;
  error.status = 'unavailable';
  error.cause = cause;
  return error;
}

function matchingVerifiedProof(result, proof) {
  const recipeRef = result?.recipe?.packageRef;
  const packageRef = proof?.package;
  const registry = proof?.registry;
  const scope = packageRef?.scope;
  const recipeScope = recipeRef?.scope;
  const seasonStartYear = scope?.seasonStartYears?.[0];
  const phase = result?.recipe?.phase || result?.phase;
  if (!recipeRef || !packageRef || !registry || !scope || !recipeScope
    || packageRef.status !== 'published'
    || scope.kind !== 'exact-season' || scope.seasonStartYears?.length !== 1
    || recipeScope.kind !== 'exact-season' || recipeScope.seasonStartYears?.length !== 1
    || !Number.isInteger(seasonStartYear) || seasonStartYear < 1946 || seasonStartYear > 2200
    || !['regular', 'in_season_tournament', 'play_in', 'playoffs'].includes(phase)
    || !scope.phases?.includes(phase) || !recipeScope.phases?.includes(phase)
    || packageRef.capabilities?.compositeRecipe?.status !== 'available'
    || proof.index?.capabilities?.compositeRecipe?.status !== 'available'
    || !HASH.test(String(registry.registryRevisionSha256 || ''))
    || !HASH.test(String(packageRef.packageManifestSha256 || ''))
    || !HASH.test(String(packageRef.sourceLockSha256 || ''))
    || !HASH.test(String(packageRef.projectionContentSha256 || ''))
    || recipeRef.registryVersion !== registry.registryVersion
    || recipeRef.registryRevisionSha256 !== registry.registryRevisionSha256) return false;

  return ['packageId', 'packageVersion', 'packageManifestSha256', 'sourceLockSha256',
    'projectionContentSha256', 'modelId', 'normalizer', 'metricsVersion']
    .every(key => recipeRef[key] === packageRef[key])
    && recipeRef.registryVersion === registry.registryVersion
    && recipeRef.registryRevisionSha256 === registry.registryRevisionSha256
    && recipeScope.kind === scope.kind
    && recipeScope.seasonStartYears[0] === seasonStartYear
    && recipeScope.seasonStartYears.length === 1
    && recipeScope.phases.includes(phase);
}

function aggregateMetrics(result) {
  const values = result?.syntheticStatistics?.values;
  if (!values || typeof values !== 'object' || Array.isArray(values)) return {};
  const metrics = {};
  for (const [outputKey, publicKey] of Object.entries(COMPOSITE_SHARE_METRICS)) {
    const value = values[outputKey]?.value;
    if (typeof value === 'number' && Number.isFinite(value)) metrics[publicKey] = value;
  }
  return metrics;
}

/**
 * Build a fresh public summary from a completed result and the exact proof
 * that supplied its recipe package. Never pass a saved recipe or raw receipt
 * to the public projector.
 */
export function buildCompositeForgePublicResultShareSummary({ result, verifiedProof } = {}) {
  const validation = result?.validation;
  if (result?.status !== 'complete' || result.modelVersion !== COMPOSITE_FORGE_MODEL_VERSION
    || result.recipe?.kind !== 'synthetic-player'
    || result.recipe?.version !== COMPOSITE_FORGE_RECIPE_VERSION
    || result.recipe?.modelVersion !== COMPOSITE_FORGE_MODEL_VERSION
    || validation?.status !== 'complete'
    || validation.outputReady !== true || validation.outputStatus !== 'ready'
    || validation.totalComponentCount !== COMPOSITE_FORGE_COMPONENTS.length
    || validation.selectedComponentCount !== validation.totalComponentCount
    || validation.missingComponents?.length || validation.missingSyntheticOutputs?.length) {
    shareFail('only one complete recipe with a ready full synthetic output can be shared.');
  }
  if (!matchingVerifiedProof(result, verifiedProof)) {
    shareFail('the result is not bound to one current verified exact-season Composite Forge package.');
  }

  const packageRef = verifiedProof.package;
  const seasonStartYear = packageRef.scope.seasonStartYears[0];
  const metrics = aggregateMetrics(result);
  if (!Object.keys(metrics).length) shareFail('the completed result has no approved public aggregate metrics.');

  return projectPublicResultShareV1({
    tool: 'swishiq-studio',
    scenarioKind: 'composite',
    packagePin: {
      packageId: packageRef.packageId,
      packageVersion: packageRef.packageVersion,
      modelId: packageRef.modelId,
      metricsVersion: packageRef.metricsVersion,
      packageManifestSha256: packageRef.packageManifestSha256,
      sourceLockSha256: packageRef.sourceLockSha256,
      registryVersion: verifiedProof.registry.registryVersion,
      registryRevisionSha256: verifiedProof.registry.registryRevisionSha256,
      projectionContentSha256: packageRef.projectionContentSha256,
      normalizer: packageRef.normalizer,
      scope: {
        kind: 'exact-season',
        seasonStartYear,
        seasonEndYear: seasonStartYear + 1,
        phase: result.recipe.phase || result.phase,
      },
    },
    result: {
      status: 'complete',
      nativeOutcome: { unit: 'combined-player-profile', metrics },
    },
  });
}

/** Build the V4-only share from one exact loader proof; never re-label a V3 pin. */
export function buildCompositeForgeV4PublicResultShareSummary({ result, verifiedCapabilities } = {}) {
  const validation = result?.validation;
  if (result?.status !== 'complete' || result.modelVersion !== COMPOSITE_FORGE_MODEL_VERSION
    || result.recipe?.kind !== 'synthetic-player'
    || result.recipe?.version !== COMPOSITE_FORGE_RECIPE_VERSION
    || result.recipe?.modelVersion !== COMPOSITE_FORGE_MODEL_VERSION
    || validation?.status !== 'complete' || validation.outputReady !== true || validation.outputStatus !== 'ready'
    || validation.totalComponentCount !== COMPOSITE_FORGE_COMPONENTS.length
    || validation.selectedComponentCount !== validation.totalComponentCount
    || validation.missingComponents?.length || validation.missingSyntheticOutputs?.length) {
    shareFail('only one complete recipe with a ready full synthetic output can be shared.');
  }
  if (!Array.isArray(verifiedCapabilities) || verifiedCapabilities.length !== 1
    || verifiedCapabilities[0]?.capabilityId !== 'compositeForgeInputs') {
    shareFail('one verified V4 Composite Forge capability is required.');
  }
  const proof = verifiedCapabilities[0];
  const packageRef = result.recipe?.packageRef;
  const phase = result.recipe.phase || result.phase;
  const year = proof.scope?.seasonStartYears?.[0];
  if (proof.status !== 'verified-data-access' || proof.useBoundary?.descriptiveDataAccess !== 'verified'
    || proof.useBoundary?.approvalClaimsMade !== false || proof.scope?.kind !== 'exact-season'
    || !Number.isSafeInteger(year) || proof.scope.seasonStartYears.length !== 1
    || packageRef?.packageId !== proof.package?.packageId
    || packageRef?.packageVersion !== proof.package?.packageVersion
    || packageRef?.packageManifestSha256 !== proof.package?.packageManifestSha256
    || packageRef?.sourceLockSha256 !== proof.package?.sourceLockSha256
    || packageRef?.projectionContentSha256 !== proof.package?.projectionContentSha256
    || packageRef?.scope?.kind !== 'exact-season'
    || Number(packageRef.scope.seasonStartYear ?? packageRef.scope.seasonStartYears?.[0]) !== year
    || !packageRef.scope.phases?.includes(phase)
    || !proof.scope.phases?.includes(phase)) {
    shareFail('the completed result does not match one current verified exact-season V4 package and phase.');
  }
  const metrics = aggregateMetrics(result);
  if (!Object.keys(metrics).length) shareFail('the completed result has no approved public aggregate metrics.');
  return projectPublicResultShareV4({
    tool: 'swishiq-studio',
    scenarioKind: 'composite',
    requiredCapabilityIds: ['compositeForgeInputs'],
    verifiedCapabilities,
    packagePin: { scope: { kind: 'exact-season', seasonStartYear: year, seasonEndYear: year + 1, phase } },
    result: { status: 'complete', nativeOutcome: { unit: 'combined-player-profile', metrics } },
  });
}

function preferredShareMethod(windowRef) {
  if (typeof windowRef?.navigator?.share === 'function') return 'native';
  if (typeof windowRef?.navigator?.clipboard?.writeText === 'function') return 'clipboard';
  return '';
}

/** Mount an accessible, fail-closed share action below a Composite result. */
export function renderCompositeForgePublicShareAction(documentRef, resultsRoot, result, verifiedProof, {
  windowRef = globalThis.window,
  sourceMode = 'v3',
} = {}) {
  if (!documentRef?.createElement || !resultsRoot?.append) return null;
  let summary = null;
  let v4UnavailableError = null;
  let eligible = true;
  const v4Required = sourceMode === 'canonical-v4-required'
    || verifiedProof?.format === 'djhc-swishiq-v4-studio-runtime-adapter-v2';
  try {
    summary = v4Required
      ? buildCompositeForgeV4PublicResultShareSummary({ result, verifiedCapabilities: verifiedProof ? [verifiedProof] : [] })
      : buildCompositeForgePublicResultShareSummary({ result, verifiedProof });
  } catch (cause) {
    eligible = false;
    if (v4Required) v4UnavailableError = typedV4ShareUnavailable(cause);
  }
  const v4Unavailable = Boolean(v4UnavailableError);

  const shareMethod = preferredShareMethod(windowRef);
  const available = Boolean(eligible && summary && shareMethod
    && isSignedPublicResultShareAvailable({ windowRef, shareMethod }));
  const section = documentRef.createElement('section');
  section.className = 'swishiq-advanced-notice swishiq-composite-public-share';
  section.dataset.compositePublicShare = 'true';
  section.dataset.resultShareStatus = eligible ? 'ready' : 'unavailable';
  if (v4Required) section.dataset.resultShareGeneration = 'v4';
  if (v4UnavailableError) section.dataset.resultShareErrorCode = v4UnavailableError.code;
  section.setAttribute('aria-labelledby', 'compositePublicShareTitle');
  const heading = documentRef.createElement('h4');
  heading.id = 'compositePublicShareTitle';
  heading.textContent = 'Share a completed Composite study';
  const explanation = documentRef.createElement('p');
  explanation.className = 'swishiq-advanced-muted';
  explanation.textContent = !eligible
    ? v4Required
      ? 'V4 sharing is unavailable until this exact-season result passes the V4 model-validation and production-approval gates. No V3 summary is used.'
      : 'Sharing is limited to a complete single-season recipe with a current verified package and approved aggregate output. Cross-season, pooled, partial, or caveated recipes are not eligible.'
    : available
      ? 'A signed link includes only the exact-season package pin, completion status, and approved aggregate fields from this anonymized synthetic line. It omits player identities, trait picks, donor maps, recipe, seed, and notes. These are modeled outputs, not observed player statistics or a calibrated forecast. The signature authenticates the submitted aggregates; the service checks approved fields and current registry/package pins and capability, but it does not rebuild the synthetic line or independently verify donor/source evidence.'
      : 'If secure sharing is configured, a link would include only the exact-season package pin, completion status, and approved aggregate fields from this anonymized synthetic line. It would omit player identities, trait picks, donor maps, recipe, seed, and notes. These are modeled outputs, not observed player statistics or a calibrated forecast.';
  const button = documentRef.createElement('button');
  button.type = 'button';
  button.className = available ? 'button' : 'button-secondary';
  button.textContent = available ? 'Share synthetic summary' : 'Secure sharing unavailable';
  button.disabled = !available;
  button.dataset.action = 'share-composite-result';
  const status = documentRef.createElement('p');
  status.className = 'swishiq-advanced-muted';
  status.id = 'compositePublicShareStatus';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  status.textContent = !eligible
    ? v4Unavailable
      ? `V4 result share unavailable: ${v4UnavailableError.message} No V3 result was shared.`
      : 'No public share link is available for this result.'
    : available
      ? 'No link is created until you activate Share synthetic summary. The signature does not independently verify the underlying donor evidence.'
      : shareMethod
        ? 'Secure sharing needs the reviewed public-key allowlist and configured share service. No link has been created.'
        : 'Secure sharing is unavailable in this browser. No link has been created.';
  button.setAttribute('aria-describedby', status.id);
  section.append(heading, explanation, button, status);
  resultsRoot.append(section);

  button.addEventListener('click', async () => {
    if (button.disabled || !summary || !available) return;
    button.disabled = true;
    try {
      const signedShare = await createSignedPublicResultShareLink(summary, {
        toolId: 'swishiq-studio',
        shareMethod,
        windowRef,
      });
      if (shareMethod === 'native') {
        await windowRef.navigator.share({
          title: 'Composite Forge · SwishIQ',
          text: 'An exact-season Composite Forge synthetic summary. Modeled outputs, not an observed player line or calibrated forecast.',
          url: signedShare.url,
        });
      } else {
        await windowRef.navigator.clipboard.writeText(signedShare.url);
      }
      signedShare.recordShared();
      status.textContent = shareMethod === 'native' ? 'Signed synthetic summary shared.' : 'Signed synthetic summary link copied.';
    } catch (error) {
      status.textContent = error?.name === 'AbortError'
        ? 'Sharing canceled. No completed share was recorded.'
        : 'Sharing failed. No public link was shared.';
    } finally {
      button.disabled = false;
    }
  });
  return section;
}
