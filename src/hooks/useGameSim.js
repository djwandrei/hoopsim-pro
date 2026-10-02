import { useCallback, useState } from 'react';
import { simSingleGame } from '@/lib/season/simEngine';

const SERIES_PATTERN = [1, 2, 5, 7]; // home team hosts these game numbers in a 2-2-1-1-1 format

export default function useGameSim() {
  const [seed, setSeed] = useState('7');
  const [neutral, setNeutral] = useState(false);
  const [game, setGame] = useState(null);
  const [series, setSeries] = useState(null);

  const runGame = useCallback((league, home, away) => {
    if (!league || !home || !away) return;
    const result = simSingleGame(league, home, away, { seed: Number(seed) || 1, neutral });
    setGame({ ...result, home: home.code, away: away.code });
  }, [seed, neutral]);

  const runSeries = useCallback((league, home, away) => {
    if (!league || !home || !away) return;
    const baseSeed = Number(seed) || 1;
    const games = [];
    let homeWins = 0;
    let awayWins = 0;
    let number = 0;
    while (homeWins < 4 && awayWins < 4 && number < 7) {
      number += 1;
      const homeHosts = SERIES_PATTERN.includes(number);
      const host = homeHosts ? home : away;
      const visitor = homeHosts ? away : home;
      const result = simSingleGame(league, host, visitor, { seed: baseSeed + number * 100, neutral });
      const hostPts = result.homePts;
      const visitorPts = result.awayPts;
      const hostWon = hostPts > visitorPts;
      if (homeHosts) { if (hostWon) homeWins += 1; else awayWins += 1; }
      else { if (hostWon) awayWins += 1; else homeWins += 1; }
      games.push({ game: number, host: host.code, visitor: visitor.code, hostPts, visitorPts, ot: result.ot });
    }
    setSeries({ home: home.code, away: away.code, homeWins, awayWins, games });
  }, [seed, neutral]);

  const reset = useCallback(() => {
    setGame(null);
    setSeries(null);
  }, []);

  return { seed, setSeed, neutral, setNeutral, game, series, runGame, runSeries, reset };
}