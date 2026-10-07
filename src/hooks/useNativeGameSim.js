import { useCallback, useState } from 'react';
import {
  nativeGameLabModules, nativeGameLabSource,
  mapNativeGameReport, mapNativeSeriesReport,
} from '@/lib/season/nativeGameEngine';

const SERIES_HISTORY_KEY = 'swishiq-game-lab-series';
const DEFAULT_SETTINGS = { possessions: 100, trials: 1000, attackWeight: 0.5 };
const clampNumber = (value, min, max, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
};

// Live behavior: the last played series survives a page reload within the
// browser session (sessionStorage), so a refresh doesn't discard it.
const readStoredSeries = () => {
  try {
    const raw = sessionStorage.getItem(SERIES_HISTORY_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
};
const storeSeries = value => {
  try { sessionStorage.setItem(SERIES_HISTORY_KEY, JSON.stringify(value)); } catch { /* storage unavailable */ }
};

// Game Lab driven by the site's release-pinned possession engine. The hook
// mirrors the local sim hook's surface so the matchup hub keeps working;
// results are mapped from the native Monte Carlo report.
export default function useNativeGameSim(initial = {}) {
  const [seed, setSeed] = useState(initial.seed || String(Math.floor(Math.random() * 9999) + 1));
  const [neutral, setNeutral] = useState(Boolean(initial.neutral));
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [game, setGame] = useState(null);
  const [series, setSeries] = useState(readStoredSeries);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');

  const run = useCallback(async (home, away, packageRef, format) => {
    if (running) return null;
    setRunning(true);
    setProgress(0);
    setError('');
    try {
      const modules = await nativeGameLabModules();
      const source = await nativeGameLabSource(packageRef);
      const first = source.payloadById.get(home.code) || source.payloadById.get(home.name);
      const second = source.payloadById.get(away.code) || source.payloadById.get(away.name);
      if (!first || !second) throw new Error('Choose two teams from the selected exact package.');
      const resolved = modules.resolveSimulationSeed(seed, 'game-lab');
      const report = await modules.simulateMatchup({
        a: first, b: second, season: source.seasonStartYear, seed: resolved.seed,
        possessions: Math.round(clampNumber(settings.possessions, 60, 140, 100)),
        trials: Math.round(clampNumber(settings.trials, 100, 5000, 1000)),
        attackWeight: clampNumber(settings.attackWeight, 0, 1, 0.5),
        format,
      }, { onProgress: setProgress });
      return report;
    } catch (e) {
      setError(e?.message || 'The native matchup could not run.');
      return null;
    } finally {
      setRunning(false);
      setProgress(0);
    }
  }, [seed, settings, running]);

  const runGame = useCallback(async (league, home, away, override = {}) => {
    if (!league || !home || !away) return;
    const report = await run(home, away, override.packageRef, 'game');
    if (!report) return;
    try {
      const result = mapNativeGameReport(report, home.code, away.code);
      setGame({ ...result, seed, neutral: override.neutral ?? neutral, stamp: Date.now() });
    } catch (e) {
      setError(e?.message || 'The simulated game could not be displayed.');
    }
  }, [run, seed, neutral]);

  const runSeries = useCallback(async (league, home, away, override = {}) => {
    if (!league || !home || !away) return;
    const report = await run(home, away, override.packageRef, 'best_of_7');
    if (!report) return;
    try {
      const result = mapNativeSeriesReport(report, home.code, away.code);
      storeSeries(result);
      setSeries(result);
    } catch (e) {
      setError(e?.message || 'The simulated series could not be displayed.');
    }
  }, [run]);

  const reset = useCallback(() => {
    setGame(null);
    setSeries(null);
    setError('');
    try { sessionStorage.removeItem(SERIES_HISTORY_KEY); } catch { /* ignore */ }
  }, []);

  return { seed, setSeed, neutral, setNeutral, settings, setSettings, game, series, runGame, runSeries, reset, running, progress, error };
}