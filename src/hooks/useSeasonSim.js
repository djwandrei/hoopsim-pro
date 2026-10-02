import { useCallback, useState } from 'react';
import { runRepeat, aggregateRepeats, summarizeAggregate } from '@/lib/season/simEngine';

// Scoring-mix presets: share of own offense vs opponent defense in expected ORtg.
const BLEND_WEIGHT = { '0.5': 0.8, '0.65': 0.35, '0.35': 1.1 };

export default function useSeasonSim() {
  const [setup, setSetup] = useState({ repeats: 10, blend: '0.5', playoffs: true });
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState(null);

  const run = useCallback(async (league, schedule) => {
    if (!league || !schedule?.length) return;
    const repeats = setup.repeats;
    const seedBase = Math.floor(Math.random() * 4294960000);
    const defenseWeight = BLEND_WEIGHT[setup.blend] ?? 0.8;
    setRunning(true);
    setProgress(0);
    let agg = null;
    let lastGames = [];
    let champion = null;
    let done = 0;
    const chunk = repeats <= 10 ? 1 : repeats <= 25 ? 2 : 5;
    await new Promise(resolve => {
      const step = () => {
        const stop = Math.min(done + chunk, repeats);
        for (; done < stop; done += 1) {
          const replay = runRepeat(league, schedule, { seed: seedBase + done, playoffs: setup.playoffs, defenseWeight });
          agg = aggregateRepeats(agg, replay);
          lastGames = replay.games.map(({ at, home, away, homePts, awayPts, ot, actual }) => ({ at, home, away, homePts, awayPts, ot, actual }));
          if (replay.bracket?.champion) champion = replay.bracket.champion;
        }
        setProgress(done / repeats);
        if (done < repeats) setTimeout(step, 0);
        else resolve();
      };
      step();
    });
    setResult({ summary: summarizeAggregate(agg), games: lastGames, champion, repeats });
    setRunning(false);
  }, [setup]);

  const reset = useCallback(() => {
    setResult(null);
    setProgress(0);
  }, []);

  return { setup, setSetup, running, progress, result, run, reset };
}