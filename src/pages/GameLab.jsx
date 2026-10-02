import React, { useEffect, useState } from 'react';
import StudioShell from '@/components/studio/StudioShell';
import WorkbenchHeader from '@/components/studio/WorkbenchHeader';
import WorkbenchState from '@/components/studio/WorkbenchState';
import useSeasonSource from '@/hooks/useSeasonSource';
import useGameSim from '@/hooks/useGameSim';
import MyNbaHub from '@/components/season/MyNbaHub';
import MatchupBreakdown from '@/components/game/MatchupBreakdown';
import GameControls from '@/components/game/GameControls';
import GameScoreboard from '@/components/game/GameScoreboard';
import GameBoxScore from '@/components/game/GameBoxScore';
import SeriesBoard from '@/components/game/SeriesBoard';

export default function GameLab() {
  const { year, setYear, source, league, state } = useSeasonSource();
  const sim = useGameSim();
  const [tab, setTab] = useState('game');
  const [a, setA] = useState('BOS');
  const [b, setB] = useState('LAL');

  useEffect(() => {
    if (!league) return;
    if (!league.byCode.has(a)) setA(league.teams[0]?.code || 'BOS');
    if (!league.byCode.has(b) || b === a) setB(league.teams.find((team) => team.code !== a)?.code || 'LAL');
  }, [league, a, b]);

  if (state !== 'ready' || !league) {
    return (
      <StudioShell active="/game">
        <WorkbenchHeader title="GAME LAB" description="A MyNBA-style matchup hub on the observed season package." state={state} status={state === 'ready' ? 'Matchup hub ready' : undefined} />
        <main className="mx-auto min-w-0 max-w-7xl px-4 py-6"><WorkbenchState state={state} /></main>
      </StudioShell>);

  }

  const home = league.byCode.get(a) || league.teams[0];
  const away = league.byCode.get(b) || league.teams[1];
  const breakdown = simProps => (
    <MatchupBreakdown league={league} source={source} year={year} a={a} b={b} onA={setA} onB={setB} teamA={home} teamB={away} {...simProps} />
  );

  return (
    <StudioShell active="/game">
      <WorkbenchHeader title="GAME LAB" description="A MyNBA-style matchup hub: pick the board, review the intel and charts, and sim single games and 7-game series with team-colored scoreboards and box scores." state="ready" status="Matchup hub ready" />
      <main className="mx-auto min-w-0 max-w-7xl px-4 py-6">
        <MyNbaHub focusCode={home.code} tab={tab} onTab={setTab} tabs={[['game', 'GAME'], ['series', 'SERIES']]}>
          {tab === 'game' &&
          <div className="space-y-4">
              {breakdown({ onSimGame: () => sim.runGame(league, home, away), hasGame: Boolean(sim.game) })}
              <GameControls
              seed={sim.seed} onSeedChange={sim.setSeed}
              neutral={sim.neutral} onNeutralChange={sim.setNeutral} />
            
              {sim.game ?
            <React.Fragment>
                  <GameScoreboard league={league} game={sim.game} />
                  <GameBoxScore game={sim.game} />
                </React.Fragment> :

            <section className="myna-panel p-4 text-xs myna-muted hidden">Set a seed, then sim the game to see the team-colored scoreboard and full box score.</section>
            }
            </div>
          }
          {tab === 'series' &&
          <div className="space-y-4">
              {breakdown({})}
              <GameControls
              seed={sim.seed} onSeedChange={sim.setSeed}
              neutral={sim.neutral} onNeutralChange={sim.setNeutral}
              onRunSeries={() => sim.runSeries(league, home, away)}
              hasSeries={Boolean(sim.series)} />
            
              {sim.series ?
            <SeriesBoard league={league} series={sim.series} /> :

            <section className="myna-panel p-4 text-xs myna-muted">Sim a 7-game series between the picked teams — home court follows the 2-2-1-1-1 format with {home.code} hosting.</section>
            }
            </div>
          }
        </MyNbaHub>
      </main>
    </StudioShell>);

}