import { useEffect, useState } from 'react';
import { loadNativeModule } from '@/components/native/nativeModules';
import { originalFetch } from '@/components/native/nativeTransport';

// Loads the verified Chemistry data through the same pipeline the native
// module uses — published package proof, verified player-season part, then
// the module's own dataset builders — and hands the datasets to React.
export default function useChemistryData(entry) {
  const [state, setState] = useState('idle');
  const [error, setError] = useState('');
  const [progress, setProgress] = useState('');
  const [data, setData] = useState(null);
  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    if (!entry?.packageId || !entry?.packageVersion) { setState('idle'); return undefined; }
    let live = true;
    setState('loading');
    setError('');
    setData(null);
    setProgress('');
    (async () => {
      try {
        const [projection, chem] = await Promise.all([
          loadNativeModule('swishiq-static-projection.js'),
          loadNativeModule('chemistry-lab.js'),
        ]);
        if (!live) return;
        const proof = await projection.loadSwishIqPublishedPackageProof({
          packageId: entry.packageId,
          packageVersion: entry.packageVersion,
          requiredCapabilities: ['swishiqStudio'],
          fetchImpl: originalFetch,
        });
        if (!live) return;
        const part = await projection.loadSwishIqPublicPart(proof, {
          artifactId: 'player-seasons', kind: 'player-seasons', capability: 'swishiqStudio', fetchImpl: originalFetch,
        });
        if (!live) return;
        const pair = chem.buildPairProfileDataset(proof, part);
        if (!live) return;
        setData({ pair, chem });
        setState('ready');
        // Observed lineups load in the background; pair view works without them.
        try {
          const scope = {
            kind: 'exact-season',
            seasonStartYear: pair.scope.seasonStartYear,
            seasonEndYear: pair.scope.seasonEndYear,
            phases: ['regular'],
          };
          const playersPart = await projection.loadSwishIqPublicPart(proof, {
            artifactId: 'players', kind: 'players', capability: 'swishiqStudio', fetchImpl: originalFetch,
          });
          if (!live) return;
          const allowed = new Set(proof.index?.capabilities?.chemistry?.artifactIds || []);
          const artifacts = (proof.index?.artifacts || [])
            .filter(artifact => artifact.kind === 'chemistry' && allowed.has(artifact.artifactId))
            .sort((left, right) => left.artifactId.localeCompare(right.artifactId, undefined, { numeric: true }));
          if (!artifacts.length) throw new Error('The selected season has no chemistry data.');
          const records = [];
          for (const artifact of artifacts) {
            if (!live) return;
            setProgress('Loading lineup results…');
            const chemistryPart = await projection.loadSwishIqPublicPart(proof, {
              artifactId: artifact.artifactId, kind: 'chemistry', capability: 'chemistry', fetchImpl: originalFetch,
            });
            records.push(...(chemistryPart.value?.records || []).filter(row => (
              row?.scope?.kind === 'exact-season'
              && Array.isArray(row.scope?.phases)
              && row.scope.phases.length === 1
              && row.scope.phases[0] === 'regular'
            )));
          }
          if (!live) return;
          const observed = await chem.buildObservedChemistryDatasetCooperatively(proof, {
            playerRecords: playersPart.value?.records || [],
            chemistryRecords: records,
            requestedScope: scope,
            onProgress: text => { if (live) setProgress(text); },
          });
          if (live && observed) setData(previous => ({ ...previous, observed }));
        } catch { /* Observed lineups stay unavailable; the pair view remains usable. */ }
      } catch (failure) {
        if (live) {
          setError(failure?.message || 'The verified chemistry data could not be loaded.');
          setState('error');
        }
      } finally {
        if (live) setProgress('');
      }
    })();
    return () => { live = false; };
  }, [entry?.packageId, entry?.packageVersion, retryToken]);

  return { state, error, progress, data, retry: () => setRetryToken(value => value + 1) };
}