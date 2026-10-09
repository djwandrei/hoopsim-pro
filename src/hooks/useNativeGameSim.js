import { useCallback, useEffect, useState } from 'react';
import {
  nativeGameLabModules, nativeGameLabSource,
  mapNativeGameReport, mapNativeSeriesReport,
} from '@/lib/season/nativeGameEngine';
import { seasonSourceBlocked } from '@/lib/season/nativeSeasonEngine';
import { isV4RequiredError, V4_POLICY_NOTICE } from '@/lib/season/v4Policy';
import { simSingleGame } from '@/lib/season/simEngine';

const SERIES_HISTORY_KEY = 'swishiq-game-lab-series';
const DEFAULT_SETTINGS = { possessions: 100, trials: 1000, attackWeight: 0.5 };
const LOCAL_GAME_MODEL_VERSION = 'swishiq-local-game-model-v1';
const LOCAL_FALLBACK_DISCLOSURE = 'Local reviewed simulation from the loaded season profiles. This is modeled output, not a native V4 run, exact-season forecast, or betting odds.';
const LOCAL_SERIES_PATTERN = [1, 2, 5, 7];
const clampNumber = (value, min, max, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
};

function numericSeed(value) {
  const text = String(value ?? '1');
  const parsed = Number(text);
  if (Number.isSafeInteger(parsed)) return parsed >>> 0;
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function localSimulationSettings(settings) {
  return {
    trials: Math.round(clampNumber(settings?.trials, 100, 5000, DEFAULT_SETTINGS.trials)),
    attackWeight: clampNumber(settings?.attackWeight, 0, 1, DEFAULT_SETTINGS.attackWeight),
  };
}

function progressStep(trials) {
  return Math.max(1, Math.floor(trials / 20));
}

function scoreHistogram(margins) {
  const rows = [
    ['≤−20', 0], ['−19 to −10', 0], ['−9 to −1', 0],
    ['0 to 8', 0], ['9 to 19', 0], ['≥20', 0],
  ];
  margins.forEach(margin => {
    const index = margin <= -20 ? 0 : margin <= -10 ? 1 : margin < 0 ? 2
      : margin <= 8 ? 3 : margin < 20 ? 4 : 5;
    rows[index][1] += 1;
  });
  return rows.map(([label, count]) => ({ label, count }));
}

function localSummary({ homeWins, awayWins, homeScores, awayScores, homeOrtg, awayOrtg, margins, settings, format }) {
  const trials = homeWins + awayWins;
  const homeShare = trials ? homeWins / trials : 0;
  const awayShare = trials ? awayWins / trials : 0;
  const mean = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  const standardError = share => trials ? Math.sqrt(Math.max(0, share * (1 - share)) / trials) : 0;
  return {
    mode: 'local-fallback',
    modelVersion: LOCAL_GAME_MODEL_VERSION,
    outcomeModel: LOCAL_GAME_MODEL_VERSION,
    shares: { a: homeShare, b: awayShare, unresolved: 0 },
    wins: { a: homeWins, b: awayWins },
    standardError: { a: standardError(homeShare), b: standardError(awayShare) },
    expectedScore: { a: mean(homeScores), b: mean(awayScores) },
    expectedPpp: { a: mean(homeOrtg), b: mean(awayOrtg) },
    histogram: format === 'game' ? scoreHistogram(margins) : null,
    seriesLengths: null,
    settings: { format, trials: settings.trials, attackWeight: settings.attackWeight, possessions: null },
    disclosure: LOCAL_FALLBACK_DISCLOSURE,
  };
}

function localGameReport(league, home, away, { seed, neutral, settings, onProgress }) {
  const normalized = localSimulationSettings(settings);
  const baseSeed = numericSeed(seed);
  let first = null;
  let homeWins = 0;
  let awayWins = 0;
  const homeScores = [];
  const awayScores = [];
  const homeOrtg = [];
  const awayOrtg = [];
  const margins = [];
  const step = progressStep(normalized.trials);
  for (let index = 0; index < normalized.trials; index += 1) {
    const game = simSingleGame(league, home, away, {
      seed: baseSeed + index,
      neutral: Boolean(neutral),
      offenseWeight: normalized.attackWeight,
      defenseWeight: 1 - normalized.attackWeight,
      log: index === 0,
    });
    if (index === 0) first = game;
    if (game.homePts > game.awayPts) homeWins += 1;
    else awayWins += 1;
    homeScores.push(game.homePts); awayScores.push(game.awayPts);
    homeOrtg.push(game.ortgH / 100); awayOrtg.push(game.ortgA / 100);
    margins.push(game.homePts - game.awayPts);
    if ((index + 1) % step === 0 || index === normalized.trials - 1) onProgress?.((index + 1) / normalized.trials);
  }
  if (!first) throw new Error('The local Game Lab model returned no game draw.');
  return {
    ...first,
    home: home.code,
    away: away.code,
    native: localSummary({ homeWins, awayWins, homeScores, awayScores, homeOrtg, awayOrtg, margins, settings: normalized, format: 'game' }),
  };
}

function periodTimeline(game, homeCode, awayCode, originalHomeCode) {
  const periods = new Map();
  for (const event of game?.pbp || []) {
    if (event.type !== 'period' || !Array.isArray(event.score)) continue;
    periods.set(event.q, { period: event.q, a: event.score[0], b: event.score[1] });
  }
  const hostIsOriginalHome = homeCode === originalHomeCode;
  return [...periods.values()].map(row => ({
    period: row.period,
    a: hostIsOriginalHome ? row.a : row.b,
    b: hostIsOriginalHome ? row.b : row.a,
  }));
}

function localSeriesDraw(league, home, away, seed, settings, withTimeline) {
  let homeWins = 0;
  let awayWins = 0;
  const games = [];
  for (let number = 1; homeWins < 4 && awayWins < 4; number += 1) {
    const homeHosts = LOCAL_SERIES_PATTERN.includes(number);
    const host = homeHosts ? home : away;
    const visitor = homeHosts ? away : home;
    const game = simSingleGame(league, host, visitor, {
      seed: seed + number,
      neutral: true,
      offenseWeight: settings.attackWeight,
      defenseWeight: 1 - settings.attackWeight,
      log: withTimeline,
    });
    const hostWon = game.homePts > game.awayPts;
    if (host === home) { if (hostWon) homeWins += 1; else awayWins += 1; }
    else if (hostWon) awayWins += 1;
    else homeWins += 1;
    games.push({
      game: number,
      host: host.code,
      visitor: visitor.code,
      hostPts: game.homePts,
      visitorPts: game.awayPts,
      ot: game.ot,
      timeline: withTimeline ? periodTimeline(game, host.code, visitor.code, home.code) : [],
    });
  }
  return { homeWins, awayWins, games };
}

function localSeriesReport(league, home, away, { seed, settings, onProgress }) {
  const normalized = localSimulationSettings(settings);
  const baseSeed = numericSeed(seed);
  let first = null;
  let homeSeriesWins = 0;
  let awaySeriesWins = 0;
  const homeScores = [];
  const awayScores = [];
  const homeOrtg = [];
  const awayOrtg = [];
  const margins = [];
  const step = progressStep(normalized.trials);
  for (let index = 0; index < normalized.trials; index += 1) {
    const draw = localSeriesDraw(league, home, away, baseSeed + index * 31, normalized, index === 0);
    if (index === 0) first = draw;
    if (draw.homeWins > draw.awayWins) homeSeriesWins += 1;
    else awaySeriesWins += 1;
    const finalGame = draw.games.at(-1);
    const finalHomeScore = finalGame.host === home.code ? finalGame.hostPts : finalGame.visitorPts;
    const finalAwayScore = finalGame.host === away.code ? finalGame.hostPts : finalGame.visitorPts;
    homeScores.push(finalHomeScore); awayScores.push(finalAwayScore);
    margins.push(finalHomeScore - finalAwayScore);
    if ((index + 1) % step === 0 || index === normalized.trials - 1) onProgress?.((index + 1) / normalized.trials);
  }
  if (!first) throw new Error('The local Game Lab model returned no series draw.');
  return {
    home: home.code,
    away: away.code,
    homeWins: first.homeWins,
    awayWins: first.awayWins,
    games: first.games,
    native: localSummary({
      homeWins: homeSeriesWins,
      awayWins: awaySeriesWins,
      homeScores,
      awayScores,
      homeOrtg,
      awayOrtg,
      margins,
      settings: normalized,
      format: 'best_of_7',
    }),
  };
}

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
  const [policyBlocked, setPolicyBlocked] = useState(false);
  const [mode, setMode] = useState('native');

  // Probe the site's V4 model-execution gate before the first click. The
  // reviewed V4 release intentionally blocks the V3 native source; keep the
  // controls live and select the local, explicitly disclosed model instead.
  useEffect(() => {
    let active = true;
    seasonSourceBlocked().then(blocked => { if (active && blocked) setMode('local-fallback'); });
    return () => { active = false; };
  }, []);

  const run = useCallback(async (league, home, away, packageRef, format, neutralOverride) => {
    if (running) return null;
    setRunning(true);
    setProgress(0);
    setError('');
    setPolicyBlocked(false);
    try {
      if (mode === 'local-fallback') {
        return format === 'game'
          ? localGameReport(league, home, away, { seed, neutral: neutralOverride, settings, onProgress: setProgress })
          : localSeriesReport(league, home, away, { seed, settings, onProgress: setProgress });
      }
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
      const blocked = isV4RequiredError(e);
      if (blocked) {
        try {
          const fallback = format === 'game'
            ? localGameReport(league, home, away, { seed, neutral: neutralOverride, settings, onProgress: setProgress })
            : localSeriesReport(league, home, away, { seed, settings, onProgress: setProgress });
          setMode('local-fallback');
          return fallback;
        } catch (fallbackError) {
          setPolicyBlocked(true);
          setError(`${V4_POLICY_NOTICE} ${fallbackError?.message || 'The local matchup could not run.'}`);
          return null;
        }
      }
      setError(e?.message || 'The native matchup could not run.');
      return null;
    } finally {
      setRunning(false);
      setProgress(0);
    }
  }, [mode, seed, settings, running]);

  const runGame = useCallback(async (league, home, away, override = {}) => {
    if (!league || !home || !away) return;
    const selectedNeutral = override.neutral ?? neutral;
    const report = await run(league, home, away, override.packageRef, 'game', selectedNeutral);
    if (!report) return;
    try {
      const result = report.native?.mode === 'local-fallback'
        ? report
        : mapNativeGameReport(report, home.code, away.code);
      setGame({ ...result, seed, neutral: selectedNeutral, stamp: Date.now() });
    } catch (e) {
      setError(e?.message || 'The simulated game could not be displayed.');
    }
  }, [run, seed, neutral]);

  const runSeries = useCallback(async (league, home, away, override = {}) => {
    if (!league || !home || !away) return;
    const report = await run(league, home, away, override.packageRef, 'best_of_7', true);
    if (!report) return;
    try {
      const result = report.native?.mode === 'local-fallback'
        ? report
        : mapNativeSeriesReport(report, home.code, away.code);
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

  return { seed, setSeed, neutral, setNeutral, settings, setSettings, game, series, runGame, runSeries, reset, running, progress, error, policyBlocked, mode };
}
