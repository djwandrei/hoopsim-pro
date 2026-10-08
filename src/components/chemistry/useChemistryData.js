import { useCallback, useEffect, useRef, useState } from 'react';
import useViewRefresh from '@/components/mobile/useViewRefresh';
import { loadNativeModule } from '@/components/native/nativeModules';
import { originalFetch } from '@/components/native/nativeTransport';

// Loads the verified Chemistry data through the site's current canonical V4
// pipeline: the reviewed release pin, adapter-verified exact-season capability
// boundaries, then the module's own V4 dataset builders — handed to React.
export default function useChemistryData(entry) {
  const [state, setState] = useState('idle');
  const [error, setError] = useState('');
  const [progress, setProgress] = useState('');
  const [data, setData] = useState(null);
  const [retryToken, setRetryToken] = useState(0);

  const generation = useRef(0);
  const loadData = useCallback(async (fresh = false) => {
    if (!entry?.packageId || !entry?.packageVersion) { setState('idle'); return; }
    const token = ++generation.current;
    const live = () => generation.current === token;
    setState('loading');
    setError('');
    if (!fresh) setData(null);
    setProgress('');
      try {
        const [adapter, pinModule, chem] = await Promise.all([
          loadNativeModule('engine/canonical-v4-studio-runtime-adapter.js'),
          loadNativeModule('engine/canonical-v4-studio-runtime-release-pin.js?v=20261002b&rev=canonical-v4-release-pin-v4-site-12ad90dc8710'),
          loadNativeModule('chemistry-lab.js'),
        ]);
        if (!live()) return;
        const releasePin = pinModule.CANONICAL_V4_STUDIO_RUNTIME_RELEASE_PIN;
        const seasonStartYear = Number(entry.scope?.seasonStartYear);
        if (!Number.isInteger(seasonStartYear)) throw new Error('The selected season is not an exact V4 season.');
        const exact = (capabilityId, additionalArtifactIds = []) => adapter.loadCanonicalV4StudioCapabilityData({
          releasePin,
          scope: { kind: 'exact-season', seasonStartYears: [seasonStartYear], phases: ['regular'] },
          capabilityId,
          additionalArtifactIds,
          fetchImpl: originalFetch,
        });
        // Start every capability download together — each is an independent
        // relay round-trip, and the pair view only needs the first one back.
        const pairPromise = exact('franchiseInputs', ['player-seasons']);
        const chemistryPromise = exact('chemistry').catch(() => null);
        const lineupPromise = exact('lineupEvidence').catch(() => null);
        const pairBoundary = await pairPromise;
        if (!live()) return;
        const pair = chem.buildCanonicalV4PairProfileDataset(pairBoundary);
        if (!live()) return;
        setData({ pair, chem });
        setState('ready');
        // Observed lineups load in the background; the pair view works without them.
        try {
          const [chemistryData, lineupData] = await Promise.all([chemistryPromise, lineupPromise]);
          if (!live() || !chemistryData || !lineupData) return;
          const playerRecords = (pairBoundary.parts?.['player-seasons']?.records || []).map(row => row.values);
          const observed = await chem.buildCanonicalV4ObservedChemistryDatasetCooperatively(
            chemistryData,
            lineupData,
            playerRecords,
            { kind: 'exact-season', seasonStartYear, seasonEndYear: seasonStartYear + 1, phases: ['regular'] },
            { shouldContinue: live, onProgress: text => { if (live()) setProgress(text); } },
          );
          if (live() && observed) setData(previous => ({ ...previous, observed }));
        } catch { /* Observed lineups stay unavailable; the pair view remains usable. */ }
      } catch (failure) {
        if (live()) {
          setError(failure?.message || 'The verified chemistry data could not be loaded.');
          setState('error');
        }
      } finally {
        if (live()) setProgress('');
      }
  }, [entry?.packageId, entry?.packageVersion]);
  useEffect(() => {
    loadData();
    return () => { generation.current += 1; };
  }, [loadData, retryToken]);
  useViewRefresh(() => loadData(true));

  return { state, error, progress, data, retry: () => setRetryToken(value => value + 1) };
}