import { loadSwishIqPublicPart } from './studio-runtime/modules/swishiq-static-projection.js?v=20261001&rev=swishiq-v3-helper-studio-runtime-v1';
import {
  CANONICAL_V4_STUDIO_RUNTIME_RELEASE_PIN,
  loadCanonicalV4StudioExactSeasonData,
} from './engine/canonical-v4-studio-runtime-adapter.js?v=20261002e&rev=canonical-v4-studio-runtime-adapter-v4-dependency-cache-closure';
import {
  assertVerifiedExactLineupEvidenceProof,
  buildCanonicalV4ObservedChemistryDatasetCooperatively,
  buildObservedChemistryDatasetCooperatively,
} from './chemistry-lab.js?v=20261002i&rev=chemistry-lab-v24-v4-artifact-identities';
import { filterObservedChemistryRows, indexObservedChemistryRows } from './chemistry-lab.js?v=20261002i&rev=chemistry-lab-v24-v4-artifact-identities';

const PAGE_SIZE = 4;
let observedDataset = null;
let observedIndexes = null;

function chemistryArtifacts(proof) {
  const allowed = new Set(proof?.index?.capabilities?.chemistry?.artifactIds || []);
  return [...(proof?.index?.artifacts || [])]
    .filter(artifact => artifact.kind === 'chemistry' && allowed.has(artifact.artifactId))
    .sort((left, right) => left.artifactId.localeCompare(right.artifactId, undefined, { numeric: true }));
}

self.addEventListener('message', async event => {
  if (event.data?.type === 'query-observed-chemistry') {
    if (!observedDataset || !observedIndexes) return;
    const { requestId, filters, offset } = event.data;
    const rows = filterObservedChemistryRows(observedDataset.rows, filters, observedIndexes);
    const requestedOffset = Math.max(0, Number(offset) || 0);
    const pageStart = Math.min(requestedOffset, Math.max(0, rows.length - 1));
    self.postMessage({
      type: 'query-result',
      requestId,
      count: rows.length,
      offset: pageStart,
      rows: rows.slice(pageStart, pageStart + PAGE_SIZE),
    });
    return;
  }
  if (event.data?.type === 'load-observed-chemistry-v4') {
    const { seasonStartYear, requestedScope, playerRecords } = event.data;
    try {
      if (CANONICAL_V4_STUDIO_RUNTIME_RELEASE_PIN.status !== 'reviewed') {
        throw new Error('The reviewed V4 runtime release pin is unavailable.');
      }
      self.postMessage({ type: 'progress', message: 'Loading verified V4 lineup evidence…' });
      const chemistryData = await loadCanonicalV4StudioExactSeasonData({
        seasonStartYear,
        phases: ['regular'],
        capabilityId: 'chemistry',
      });
      const lineupData = await loadCanonicalV4StudioExactSeasonData({
        seasonStartYear,
        phases: ['regular'],
        capabilityId: 'lineupEvidence',
      });
      const dataset = await buildCanonicalV4ObservedChemistryDatasetCooperatively(
        chemistryData,
        lineupData,
        Array.isArray(playerRecords) ? playerRecords : [],
        requestedScope,
        { onProgress: message => self.postMessage({ type: 'progress', message }) },
      );
      if (!dataset) {
        self.postMessage({ type: 'cancelled' });
        return;
      }
      observedDataset = dataset;
      observedIndexes = indexObservedChemistryRows(dataset.rows);
      self.postMessage({
        type: 'ready',
        metadata: {
          package: dataset.package,
          scope: dataset.scope,
          requestedScope: dataset.requestedScope,
          artifactCount: dataset.artifactCount,
          sourceGeneration: 'V4',
          teams: [...observedIndexes.rowsByTeam.keys()].sort(),
          players: [...dataset.playerByRef.values()]
            .filter(player => player?.playerRef && player?.displayName)
            .map(player => ({ playerRef: player.playerRef, displayName: player.displayName })),
          allPlayerRefs: [...observedIndexes.allPlayerRefs],
          playerRefsByTeam: [...observedIndexes.playerRefsByTeam.entries()]
            .map(([team, playerRefs]) => [team, [...playerRefs]]),
        },
      });
    } catch (error) {
      self.postMessage({
        type: 'error',
        message: error instanceof Error ? error.message : 'V4 Chemistry data could not be loaded.',
      });
    }
    return;
  }
  if (event.data?.type !== 'load-observed-chemistry') return;
  const { proof, requestedScope } = event.data;
  try {
    assertVerifiedExactLineupEvidenceProof(proof);
    const playersPart = await loadSwishIqPublicPart(proof, {
      artifactId: 'players', kind: 'players', capability: 'swishiqStudio',
    });
    const artifacts = chemistryArtifacts(proof);
    if (!artifacts.length) throw new Error('The selected season has no chemistry data.');
    const records = [];
    for (let index = 0; index < artifacts.length; index += 1) {
      const artifact = artifacts[index];
      self.postMessage({ type: 'progress', message: 'Loading lineup results…' });
      const part = await loadSwishIqPublicPart(proof, {
        artifactId: artifact.artifactId,
        kind: 'chemistry',
        capability: 'chemistry',
      });
      records.push(...part.value.records.filter(row => row && typeof row === 'object'
        && row.scope?.kind === 'exact-season'
        && Array.isArray(row.scope?.phases)
        && row.scope.phases.length === 1
        && row.scope.phases[0] === 'regular'));
    }
    const dataset = await buildObservedChemistryDatasetCooperatively(proof, {
      playerRecords: playersPart.value.records,
      chemistryRecords: records,
      requestedScope,
      onProgress: message => self.postMessage({ type: 'progress', message }),
    });
    if (!dataset) {
      self.postMessage({ type: 'cancelled' });
      return;
    }
    observedDataset = dataset;
    observedIndexes = indexObservedChemistryRows(dataset.rows);
    self.postMessage({
      type: 'ready',
      metadata: {
        package: dataset.package,
        scope: dataset.scope,
        requestedScope: dataset.requestedScope,
        artifactCount: dataset.artifactCount,
        teams: [...observedIndexes.rowsByTeam.keys()].sort(),
        players: [...dataset.playerByRef.values()]
          .filter(player => player?.playerRef && player?.displayName)
          .map(player => ({ playerRef: player.playerRef, displayName: player.displayName })),
        allPlayerRefs: [...observedIndexes.allPlayerRefs],
        playerRefsByTeam: [...observedIndexes.playerRefsByTeam.entries()]
          .map(([team, playerRefs]) => [team, [...playerRefs]]),
      },
    });
  } catch (error) {
    self.postMessage({
      type: 'error',
      message: error instanceof Error ? error.message : 'Chemistry data could not be loaded.',
    });
  }
});
