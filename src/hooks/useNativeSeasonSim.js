import { useCallback, useState } from 'react';
import { runNativeSeason } from '@/lib/season/nativeSeasonEngine';

// Season replay driven by the site's release-pinned native engine. The hook
// mirrors the local sim hook's surface so the replay console and every hub
// tab keep working; results are mapped from the native report.
export default function useNativeSeasonSim() {
  const [setup, setSetup] = useState({ repeats: 10, blend: '0.5', playoffs: true, seed: '', horizon: 'full', scheduleSource: 'actual', series: '7' });
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState(null);

  const run = useCallback(async (league, scheduleRows, year) => {
    if (!league || !year) return;
    setRunning(true);
    setProgress(0);
    try {
      const mapped = await runNativeSeason({
        year,
        repeats: setup.repeats,
        seed: setup.seed.trim(),
        blend: Number(setup.blend) || 0.5,
        playoffs: setup.playoffs,
        seriesLength: Number(setup.series) || 7,
        horizon: setup.horizon,
        scheduleSource: setup.scheduleSource,
        scheduleRows: scheduleRows || [],
        league,
        onProgress: setProgress,
      });
      setResult(mapped);
    } finally {
      setRunning(false);
    }
  }, [setup]);

  const reset = useCallback(() => {
    setResult(null);
    setProgress(0);
  }, []);

  return { setup, setSetup, running, progress, result, run, reset };
}