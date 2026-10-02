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
import GameRecap from '@/components/game/GameRecap';
import GamePlayFeed from '@/components/game/GamePlayFeed';
import SeriesBoard from '@/components/game/SeriesBoard';
import GameMatchupTheme from '@/components/game/GameMatchupTheme';
import PreGameDisclosure from '@/components/game/PreGameDisclosure';
import LiveBoxScore from '@/components/game/LiveBoxScore';

export default function GameLab() {
  const { year, setYear, source, league, state } = useSeasonSource();
  const sim = useGameSim();
  const [tab, setTab] = useState('game');
  const [a, setA] = useState('BOS');
  const [b, setB] = useState('LAL');
  const [feedDone, setFeedDone] = useState(false);
  const [showPreGame, setShowPreGame] = useState(true);
  const [liveCount, setLiveCount] = useState(0);

  useEffect(() => {
    setFeedDone(false);
    setLiveCount(0);
    setShowPreGame(!sim.game);
  }, [sim.game]);

  useEffect(() => {
    if (!league) return;
    if (!league.byCode.has(a)) setA(league.teams[0]?.code || 'BOS');
    if (!league.byCode.has(b) || b === a) setB(league.teams.find((team) => team.code !== a)?.code || 'LAL');
  }, [league, a, b]);

  if (state !== 'ready' || !league) {
    return (
      <StudioShell active="/game" followTeam="djhc">
        <GameMatchupTheme homeCode={league?.byCode.get(a)?.code || a} awayCode={league?.byCode.get(b)?.code || b}>
        <WorkbenchHeader title="GAME LAB" description="A MyNBA-style matchup hub on the observed season package." state={state} status={state === 'ready' ? 'Matchup hub ready' : undefined} />
        <main className="mx-auto min-w-0 max-w-7xl px-4 py-6"><WorkbenchState state={state} /></main>
      </GameMatchupTheme>
      </StudioShell>);

  }

  const home = league.byCode.get(a) || league.teams[0];
  const away = league.byCode.get(b) || league.teams[1];
  const resultHome = league.byCode.get(sim.game?.home) || home;
  const resultAway = league.byCode.get(sim.game?.away) || away;
  const breakdown = simProps => (
    <MatchupBreakdown league={league} source={source} year={year} a={a} b={b} onA={setA} onB={setB} teamA={home} teamB={away} {...simProps} />
  );

  return (
    <StudioShell active="/game" followTeam="djhc">
        <GameMatchupTheme homeCode={league?.byCode.get(a)?.code || a} awayCode={league?.byCode.get(b)?.code || b}>
      <WorkbenchHeader title="GAME LAB" description="A MyNBA-style matchup hub: pick the board, review the intel and charts, and sim single games and 7-game series with team-colored scoreboards and box scores." state="ready" status="Matchup hub ready" />
      <main className="mx-auto min-w-0 max-w-7xl px-4 py-6">
        <MyNbaHub focusCode={home.code} awayCode={away.code} tab={tab} onTab={setTab} tabs={[['game', 'GAME'], ['series', 'SERIES']]}>
          {tab === 'game' &&
          <div className="space-y-4">
              {sim.game ?
              <PreGameDisclosure home={home} away={away} open={showPreGame} onToggle={() => setShowPreGame(current => !current)}>
                {breakdown({ onSimGame: () => sim.runGame(league, home, away), hasGame: true })}
              </PreGameDisclosure> :
              breakdown({ onSimGame: () => sim.runGame(league, home, away), hasGame: false })}
              <GameControls
              seed={sim.seed} onSeedChange={sim.setSeed}
              neutral={sim.neutral} onNeutralChange={sim.setNeutral} />
            
              {sim.game ?
              <GameMatchupTheme homeCode={resultHome.code} awayCode={resultAway.code}>
                  {!feedDone &&
                  <GamePlayFeed key={sim.game.stamp} game={sim.game} home={resultHome} away={resultAway} onComplete={() => setFeedDone(true)} onProgress={setLiveCount} />}
                  {!feedDone &&
                  <LiveBoxScore events={sim.game.pbp || []} count={liveCount} home={resultHome} away={resultAway} />}
                  {feedDone &&
                  <React.Fragment>
                    <GameRecap game={sim.game} home={resultHome} away={resultAway} />
                    <GameScoreboard league={league} game={sim.game} />
                    <GameBoxScore game={sim.game} />
                  </React.Fragment>}
                  </GameMatchupTheme> :

            <section className="myna-panel p-6 text-center text-xs myna-muted">Set a seed, then sim the game — the live play-by-play feed, team-colored scoreboard and full box score land here.</section>
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
    </GameMatchupTheme>
      </StudioShell>);

}