import { useCallback, useState } from 'react';
import { alignGamesToSchedule, runNativeSeason } from '@/lib/season/nativeSeasonEngine';
import { isV4RequiredError, V4_POLICY_NOTICE } from '@/lib/season/v4Policy';
import { buildGeneratedSchedule, runRepeat } from '@/lib/season/simEngine';

// The published V4 gate currently exposes descriptive season inputs without
// enabling the site's native executor. Keep the workbench usable with the
// reviewed local season model while labeling the result as modeled output.
function localSeasonReplay({ league, scheduleRows, setup, onProgress }) {
  const actual = Array.isArray(scheduleRows) ? scheduleRows : [];
  const hasSeed = String(setup.seed ?? '').trim() !== '' && Number.isFinite(Number(setup.seed));
  const seed = hasSeed ? Number(setup.seed) >>> 0 : Math.floor(Math.random() * 2 ** 32);
  const useActual = setup.scheduleSource === 'actual' && actual.length > 0;
  const source = useActual ? actual : buildGeneratedSchedule(league.teams, seed);
  const perTeam = new Map();
  if (setup.horizon === 'team') {
    for (const game of source) {
      for (const code of [game.home, game.away]) if (!perTeam.has(code)) perTeam.set(code, game);
      if (perTeam.size >= league.teams.length) break;
    }
  }
  const slate = setup.horizon === 'team' ? [...new Set(perTeam.values())] : setup.horizon === 'short' ? source.slice(0, Math.max(league.teams.length * 4, 60)) : source;
  const repeats = Math.max(1, Number(setup.repeats) || 1);
  const runs = [];
  for (let index = 0; index < repeats; index += 1) {
    runs.push(runRepeat(league, slate, {
      seed: seed + index,
      playoffs: Boolean(setup.playoffs),
      offenseWeight: Number(setup.blend),
      defenseWeight: 1 - Number(setup.blend),
      bestOf: Number(setup.series) || 7,
    }));
    onProgress?.((index + 1) / repeats);
  }
  const median = values => {
    const finite = values.filter(value => Number.isFinite(value)).sort((a, b) => a - b);
    if (!finite.length) return null;
    const middle = Math.floor(finite.length / 2);
    return finite.length % 2 ? finite[middle] : (finite[middle - 1] + finite[middle]) / 2;
  };
  const first = runs[0];
  const summary = league.teams.map(team => {
    const rows = runs.map(run => run.standings.find(row => row.code === team.code)).filter(Boolean);
    return {
      code: team.code, name: team.name, conference: team.conference,
      wins: median(rows.map(row => row.wins)), losses: median(rows.map(row => row.losses)),
      ortg: median(rows.map(row => row.ortg)), drtg: median(rows.map(row => row.drtg)), pace: median(rows.map(row => row.pace)),
      playoff: null, confFinals: null, title: null,
    };
  }).sort((a, b) => (b.wins ?? -Infinity) - (a.wins ?? -Infinity));
  const champion = first.bracket?.champion || null;
  return {
    summary, games: first.games, scheduleGames: useActual ? alignGamesToSchedule(first.games, actual) : null,
    bracket: first.bracket, champion, repeats, seed: String(seed),
    scheduleSource: useActual ? 'actual' : 'round-robin', horizon: setup.horizon, bestOf: Number(setup.series) || 7,
    modelVersion: 'swishiq-local-season-model-v1', modeledFallback: true,
  };
}

// Season replay driven by the site's release-pinned native engine. The hook
// mirrors the local sim hook's surface so the replay console and every hub
// tab keep working; results are mapped from the native report.
export default function useNativeSeasonSim() {
  const [setup, setSetup] = useState({ repeats: 10, blend: '0.5', playoffs: true, seed: '', horizon: 'full', scheduleSource: 'actual', series: '7' });
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [policyBlocked, setPolicyBlocked] = useState(false);
  const [mode, setMode] = useState('native');

  const run = useCallback(async (league, scheduleRows, year) => {
    if (!league || !year) return;
    setRunning(true);
    setProgress(0);
    setError('');
    setPolicyBlocked(false);
    setMode('native');
    try {
      const mapped = await runNativeSeason({
        year,
        repeats: setup.repeats,
        seed: setup.seed.trim(),
        blend: Number.isFinite(Number(setup.blend)) ? Number(setup.blend) : 0.5,
        playoffs: setup.playoffs,
        seriesLength: Number(setup.series) || 7,
        horizon: setup.horizon,
        scheduleSource: setup.scheduleSource,
        scheduleRows: scheduleRows || [],
        league,
        onProgress: setProgress,
      });
      setResult(mapped);
    } catch (e) {
      const blocked = isV4RequiredError(e);
      if (blocked) {
        try {
          const fallback = localSeasonReplay({ league, scheduleRows, setup, onProgress: setProgress });
          setResult(fallback);
          setMode('local-fallback');
          setError('');
        } catch (fallbackError) {
          setPolicyBlocked(true);
          setError(`${V4_POLICY_NOTICE} ${fallbackError?.message || 'The local replay could not run.'}`);
        }
      } else setError(e?.message || 'The native season replay could not run.');
    } finally {
      setRunning(false);
    }
  }, [setup]);

  const reset = useCallback(() => {
    setResult(null);
    setProgress(0);
    setError('');
  }, []);

  return { setup, setSetup, running, progress, result, error, run, reset, policyBlocked, mode };
}
