import React, { useEffect, useState } from 'react';
import StudioShell from '@/components/studio/StudioShell';
import WorkbenchHeader from '@/components/studio/WorkbenchHeader';
import WorkbenchState from '@/components/studio/WorkbenchState';
import useSeasonSource from '@/hooks/useSeasonSource';
import useGameSim from '@/hooks/useGameSim';
import MyNbaHub from '@/components/season/MyNbaHub';
import MatchupPicker from '@/components/game/MatchupPicker';
import MatchupRadar from '@/components/game/MatchupRadar';
import MatchupTable from '@/components/game/MatchupTable';
import MatchupEdges from '@/components/game/MatchupEdges';
import MatchupMeetings from '@/components/game/MatchupMeetings';
import GameControls from '@/components/game/GameControls';
import GameScoreboard from '@/components/game/GameScoreboard';
import GameBoxScore from '@/components/game/GameBoxScore';
import SeriesBoard from '@/components/game/SeriesBoard';

export default function GameLab() {
  const { year, setYear, years, source, league, state } = useSeasonSource();
  const sim = useGameSim();
  const [tab, setTab] = useState('matchup');
  const [a, setA] = useState('BOS');
  const [b, setB] = useState('LAL');

  useEffect(() => {
    if (!league) return;
    if (!league.byCode.has(a)) setA(league.teams[0]?.code || 'BOS');
    if (!league.byCode.has(b) || b === a) setB(league.teams.find(team => team.code !== a)?.code || 'LAL');
  }, [league, a, b]);

  if (state !== 'ready' || !league) {
    return (
      <StudioShell active="/game">
        <WorkbenchHeader title="GAME LAB" description="A MyNBA-style matchup hub on the observed season package." state={state} status={state === 'ready' ? 'Matchup hub ready' : undefined} />
        <main className="mx-auto min-w-0 max-w-7xl px-4 py-6"><WorkbenchState state={state} /></main>
      </StudioShell>
    );
  }

  const home = league.byCode.get(a) || league.teams[0];
  const away = league.byCode.get(b) || league.teams[1];
  const changeYear = value => {
    sim.reset();
    setYear(value);
  };

  return (
    <StudioShell active="/game">
      <WorkbenchHeader title="GAME LAB" description="A MyNBA-style matchup hub: set the matchup, review the intel, and sim single games and 7-game series with team-colored scoreboards and box scores." state="ready" status="Matchup hub ready" />
      <main className="mx-auto min-w-0 max-w-7xl px-4 py-6">
        <MyNbaHub focusCode={home.code} tab={tab} onTab={setTab} tabs={[['matchup', 'MATCHUP'], ['game', 'GAME'], ['series', 'SERIES']]}>
          {tab === 'matchup' && (
            <div className="space-y-4">
              <MatchupPicker league={league} a={a} b={b} onA={setA} onB={setB} />
              <MatchupRadar teamA={home} teamB={away} league={league} />
              <MatchupTable teamA={home} teamB={away} />
              <MatchupEdges teamA={home} teamB={away} />
              <MatchupMeetings source={source} teamA={home} teamB={away} year={year} />
            </div>
          )}
          {tab === 'game' && (
            <div className="space-y-4">
              <GameControls
                seed={sim.seed} onSeedChange={sim.setSeed}
                neutral={sim.neutral} onNeutralChange={sim.setNeutral}
                onRunGame={() => sim.runGame(league, home, away)}
                hasGame={Boolean(sim.game)}
              />
              <label className="block w-40">
                <span className="myna-muted mb-1 block text-[10px] font-semibold uppercase tracking-[0.18em]">Season</span>
                <select onChange={event => changeYear(Number(event.target.value))} value={year} className="min-h-10 w-full rounded-lg border border-[var(--myna-border)] bg-[var(--myna-raised)] px-3 text-xs text-[var(--myna-text)]">
                  {years.map(value => <option key={value} value={value}>{value}–{String(value + 1).slice(-2)}</option>)}
                </select>
              </label>
              {sim.game ? (
                <React.Fragment>
                  <GameScoreboard league={league} game={sim.game} />
                  <GameBoxScore game={sim.game} />
                </React.Fragment>
              ) : (
                <section className="myna-panel p-4 text-xs myna-muted">Pick the matchup, set a seed, then sim the game to see the team-colored scoreboard and full box score.</section>
              )}
            </div>
          )}
          {tab === 'series' && (
            <div className="space-y-4">
              <GameControls
                seed={sim.seed} onSeedChange={sim.setSeed}
                neutral={sim.neutral} onNeutralChange={sim.setNeutral}
                onRunSeries={() => sim.runSeries(league, home, away)}
                hasSeries={Boolean(sim.series)}
              />
              {sim.series ? (
                <SeriesBoard league={league} series={sim.series} />
              ) : (
                <section className="myna-panel p-4 text-xs myna-muted">Sim a 7-game series between the picked teams — home court follows the 2-2-1-1-1 format with {home.code} hosting.</section>
              )}
            </div>
          )}
        </MyNbaHub>
      </main>
    </StudioShell>
  );
}