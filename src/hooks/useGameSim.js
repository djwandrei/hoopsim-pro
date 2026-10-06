import { useCallback, useState } from 'react';
import { simSingleGame } from '@/lib/season/simEngine';

const SERIES_PATTERN = [1, 2, 5, 7]; // home team hosts these game numbers in a 2-2-1-1-1 format
const SERIES_HISTORY_KEY = 'swishiq-game-lab-series';

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

export default function useGameSim(initial = {}) {
  const [seed, setSeed] = useState(initial.seed || '7');
  const [neutral, setNeutral] = useState(Boolean(initial.neutral));
  const [game, setGame] = useState(null);
  const [series, setSeries] = useState(readStoredSeries);

  // An optional override lets a caller replay a saved call without waiting
  // for the seed/neutral state setters to commit (e.g. the results shelf).
  const runGame = useCallback((league, home, away, override = {}) => {
    if (!league || !home || !away) return;
    const result = simSingleGame(league, home, away, {
      seed: Number(override.seed ?? seed) || 1,
      neutral: override.neutral ?? neutral,
      log: true,
    });
    setGame({ ...result, home: home.code, away: away.code, stamp: Date.now() });
  }, [seed, neutral]);

  const runSeries = useCallback((league, home, away, override = {}) => {
    if (!league || !home || !away) return;
    const baseSeed = Number(override.seed ?? seed) || 1;
    const useNeutral = override.neutral ?? neutral;
    const games = [];
    let homeWins = 0;
    let awayWins = 0;
    let number = 0;
    while (homeWins < 4 && awayWins < 4 && number < 7) {
      number += 1;
      const homeHosts = SERIES_PATTERN.includes(number);
      const host = homeHosts ? home : away;
      const visitor = homeHosts ? away : home;
      const result = simSingleGame(league, host, visitor, { seed: baseSeed + number * 100, neutral: useNeutral });
      const hostPts = result.homePts;
      const visitorPts = result.awayPts;
      const hostWon = hostPts > visitorPts;
      if (homeHosts) { if (hostWon) homeWins += 1; else awayWins += 1; }
      else { if (hostWon) awayWins += 1; else homeWins += 1; }
      games.push({ game: number, host: host.code, visitor: visitor.code, hostPts, visitorPts, ot: result.ot });
    }
    const result = { home: home.code, away: away.code, homeWins, awayWins, games };
    storeSeries(result);
    setSeries(result);
  }, [seed, neutral]);

  const reset = useCallback(() => {
    setGame(null);
    setSeries(null);
    try { sessionStorage.removeItem(SERIES_HISTORY_KEY); } catch { /* ignore */ }
  }, []);

  return { seed, setSeed, neutral, setNeutral, game, series, runGame, runSeries, reset };
}