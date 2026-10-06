import { useCallback, useState } from 'react';
import { runRepeat, aggregateRepeats, summarizeAggregate, buildGeneratedSchedule } from '@/lib/season/simEngine';

// Scoring-mix presets: share of own offense vs opponent defense in expected ORtg.
const BLEND_WEIGHT = { '0.5': 0.8, '0.65': 0.35, '0.35': 1.1 };

// Replay seed text → deterministic uint32: numeric text passes through,
// anything else is FNV-hashed, and blank means a fresh random run.
function seedToNumber(text, fallback) {
  const trimmed = (text || '').trim();
  if (!trimmed) return fallback;
  if (/^-?\d+$/.test(trimmed)) return Number(trimmed) >>> 0;
  let hash = 2166136261;
  for (let i = 0; i < trimmed.length; i += 1) {
    hash ^= trimmed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

// Horizon cuts, per the live console: the earliest dated rows until every team
// has appeared once, until every team reaches a half-season target, or the
// full slate. Falls back to the whole schedule when a cut never completes.
function applyHorizon(schedule, horizon) {
  if (horizon === 'full') return schedule;
  const target = horizon === 'team' ? 1 : 41;
  const seen = new Map();
  const rows = [];
  for (const game of schedule) {
    for (const code of [game.home, game.away]) seen.set(code, (seen.get(code) || 0) + 1);
    rows.push(game);
    if (seen.size === 30 && Math.min(...seen.values()) >= target) return rows;
  }
  return schedule;
}

export default function useSeasonSim() {
  const [setup, setSetup] = useState({ repeats: 10, blend: '0.5', playoffs: true, seed: '', horizon: 'full', scheduleSource: 'actual', series: '7' });
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState(null);

  const run = useCallback(async (league, schedule) => {
    if (!league || !schedule?.length) return;
    const repeats = setup.repeats;
    const seedBase = seedToNumber(setup.seed, Math.floor(Math.random() * 4294960000));
    const defenseWeight = BLEND_WEIGHT[setup.blend] ?? 0.8;
    const bestOf = Number(setup.series) || 7;
    const effective = setup.scheduleSource === 'round-robin'
      ? applyHorizon(buildGeneratedSchedule(league.teams, seedBase), setup.horizon)
      : applyHorizon(schedule, setup.horizon);
    setRunning(true);
    setProgress(0);
    let agg = null;
    let lastGames = [];
    let lastBracket = null;
    let champion = null;
    let done = 0;
    const chunk = repeats <= 10 ? 1 : repeats <= 25 ? 2 : 5;
    await new Promise(resolve => {
      const step = () => {
        const stop = Math.min(done + chunk, repeats);
        for (; done < stop; done += 1) {
          const replay = runRepeat(league, effective, { seed: seedBase + done, playoffs: setup.playoffs, defenseWeight, bestOf });
          agg = aggregateRepeats(agg, replay);
          lastGames = replay.games.map(({ at, home, away, homePts, awayPts, ot, actual, boxHome, boxAway }) => ({ at, home, away, homePts, awayPts, ot, actual, boxHome, boxAway }));
          if (replay.bracket?.champion) champion = replay.bracket.champion;
          lastBracket = replay.bracket || lastBracket;
        }
        setProgress(done / repeats);
        if (done < repeats) setTimeout(step, 0);
        else resolve();
      };
      step();
    });
    setResult({ summary: summarizeAggregate(agg), games: lastGames, champion, repeats, bracket: lastBracket, seed: setup.seed.trim(), scheduleSource: setup.scheduleSource, horizon: setup.horizon, bestOf });
    setRunning(false);
  }, [setup]);

  const reset = useCallback(() => {
    setResult(null);
    setProgress(0);
  }, []);

  return { setup, setSetup, running, progress, result, run, reset };
}