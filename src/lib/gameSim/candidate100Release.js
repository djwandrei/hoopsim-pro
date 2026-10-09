// Candidate100 pregame relay: serves the site's owner-manual Candidate100
// release (release bundle + release decision + per-season pregame feature
// snapshots) to the Game Lab. Every byte is verified against the same SHA-256
// pins the site's canonical-v4 adapter enforces, so the studio only ever
// receives the reviewed release bytes.
import { SITE_ORIGIN as ORIGIN } from '../deployConfig.js';
import { verifiedJson } from '../site/verifiedAssets.js';
const RELEASE_DIR = '/tools/swishiq-studio/engine/candidate100-release-20261008';
const CACHE_BUST = '20261008c';
const BUNDLE_SHA256 = '0b03e7a5d9d4da1cbf562f5bc01d57ca621332339109c00a60a6080e24ce2a0a';
const BUNDLE_BYTE_LENGTH = 11368;
const CONFIGURATION_SHA256 = 'faee532c79a081448eb70f0625f6a8d05a3aebac5c3ce2165fd0d51a5cdf7a7b';
const MODEL_ID = 'game-lab-candidate100';

const releaseCache = new Map();

async function fetchVerified(descriptor, label) {
  const path = descriptor.path.startsWith('/') ? descriptor.path : `${RELEASE_DIR}/${descriptor.path}`;
  if (!path.startsWith(`${RELEASE_DIR}/`) || path.includes('..')) throw new Error('Invalid release asset path.');
  return verifiedJson(`${ORIGIN}${path}?v=${CACHE_BUST}`, descriptor, label);
}

export async function loadRelease(seasonStartYear) {
  const cacheKey = seasonStartYear;
  if (releaseCache.has(cacheKey)) return releaseCache.get(cacheKey);
  const task = (async () => {
    const bundle = await fetchVerified({ path: `${RELEASE_DIR}/bundle.json`, sha256: BUNDLE_SHA256, byteLength: BUNDLE_BYTE_LENGTH }, 'Candidate100 release bundle');
    if (bundle.format !== 'swishiq-selected-game-model-browser-bundle-v1' || bundle.modelId !== MODEL_ID || bundle.releaseStatus !== 'owner-manual-override-approved') {
      throw new Error('The Candidate100 release bundle is not the reviewed owner-manual release.');
    }
    if (bundle.configurationSha256 !== CONFIGURATION_SHA256) {
      throw new Error('The release configuration changed; the revision must be reviewed before use.');
    }
    const decision = await fetchVerified(bundle.releaseDecision, 'Candidate100 release decision');
    const gate = {
      modelVersion: bundle.modelVersion,
      configurationSha256: bundle.configurationSha256,
      releaseStatus: bundle.releaseStatus,
      predictiveReleaseStatus: decision.predictiveReleaseStatus,
      predictiveValidityStatus: decision.predictiveValidityStatus,
      selectedCandidate: decision.selectedCandidate,
      predictiveUseApproved: decision.predictiveUseApproved,
      approvalMethod: decision.approvalMethod,
      approvalDateLocal: decision.approvalDateLocal,
      supportedUse: decision.supportedUse,
      development: decision.development ? { passed: decision.development.passed, total: decision.development.total, empiricalGatePassed: decision.development.empiricalGatePassed } : null,
    };
    if (decision.modelVersion !== bundle.modelVersion || decision.configurationSha256 !== bundle.configurationSha256) {
      throw new Error('The release decision does not match the reviewed bundle.');
    }
    if (decision.selectedCandidate !== 100 || decision.predictiveUseApproved !== true
      || decision.approvalMethod !== 'explicit-owner-manual-override' || decision.releaseStatus !== 'owner-manual-override-approved') {
      throw new Error('The release decision does not approve Candidate100 for predictive use.');
    }
    if (decision.independentPredictiveValidityEstablished !== false || decision.empiricalValidationPassed !== false
      || decision.prospectiveValidityEstablished !== false) {
      throw new Error('The release decision validity claims changed; the revision must be reviewed before use.');
    }
    const snapshots = bundle.snapshots || [];
    const snapshot = snapshots.find(entry => entry.seasonStartYear === seasonStartYear);
    if (!snapshot) {
      const supported = snapshots.map(entry => `${entry.seasonStartYear}–${entry.seasonStartYear + 1}`).join(', ');
      const error = new Error(`Candidate100 pregame inputs are published for ${supported}.`);
      error.status = 404;
      throw error;
    }
    const [, features] = await Promise.all([
      fetchVerified(snapshot.checkpoint, `the ${seasonStartYear}–${seasonStartYear + 1} Candidate100 checkpoint`),
      fetchVerified(snapshot.features, `the ${seasonStartYear}–${seasonStartYear + 1} Candidate100 feature snapshot`),
    ]);
    if (features.containsTargetLabels !== false || features.featureRepresentation !== 'raw-before-head-policy'
      || features.modelVersion !== bundle.modelVersion || features.configurationSha256 !== bundle.configurationSha256) {
      throw new Error('The feature snapshot contract changed; the revision must be reviewed before use.');
    }
    if (!features.package || features.package.packageId !== snapshot.packageId || features.package.packageVersion !== snapshot.packageVersion) {
      throw new Error('The feature snapshot package identity does not match the release manifest.');
    }
    const rows = Array.isArray(features.rows) ? features.rows : [];
    const byRef = new Map(rows.map(row => [row.gameRef, row]));
    if (byRef.size !== rows.length) throw new Error('The feature snapshot repeats a game reference.');
    for (const row of rows) {
      if (row.seasonStartYear !== seasonStartYear) throw new Error('The feature snapshot mixes seasons.');
      if (row.featureObservedThrough >= row.gameDateLocal) throw new Error('A pregame target observed the game through or after its tip.');
      if (row.gameDateLocal <= snapshot.checkpoint.lastObservedDate) throw new Error('A pregame target predates the checkpoint.');
    }
    return {
      format: 'swishiq-studio-candidate100-source-v1',
      release: gate,
      snapshot: {
        seasonStartYear,
        packageId: snapshot.packageId,
        packageVersion: snapshot.packageVersion,
        targetMode: snapshot.targetMode,
        rowCount: rows.length,
        checkpoint: { sha256: snapshot.checkpoint.sha256, lastObservedDate: snapshot.checkpoint.lastObservedDate },
        featuresSha256: snapshot.features.sha256,
      },
      rows: rows.map(row => ({
        gameRef: row.gameRef,
        seasonStartYear: row.seasonStartYear,
        gameDateLocal: row.gameDateLocal,
        homeTeamRef: row.homeTeamRef,
        awayTeamRef: row.awayTeamRef,
        featureObservedThrough: row.featureObservedThrough,
        features: row.features,
      })),
    };
  })();
  releaseCache.set(cacheKey, task);
  task.catch(() => releaseCache.delete(cacheKey));
  return task;
}
