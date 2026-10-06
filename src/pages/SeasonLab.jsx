import React, { useEffect, useMemo, useState } from 'react';
import usePageMeta from '@/hooks/usePageMeta';
import StudioShell from '@/components/studio/StudioShell';
import WorkbenchHeader from '@/components/studio/WorkbenchHeader';
import SourceStatus from '@/components/studio/SourceStatus';
import useSeasonSource from '@/hooks/useSeasonSource';
import useSeasonSim from '@/hooks/useSeasonSim';
import MyNbaHub from '@/components/season/MyNbaHub';
import LeagueControls from '@/components/season/LeagueControls';
import LeagueHero from '@/components/season/LeagueHero';
import LeagueStandings from '@/components/season/LeagueStandings';
import LeagueSchedule from '@/components/season/LeagueSchedule';
import LeagueTeamView from '@/components/season/LeagueTeamView';
import PlayoffBracket from '@/components/season/PlayoffBracket';
import PlayerStatsLog from '@/components/season/PlayerStatsLog';
import LeagueLeaders from '@/components/season/LeagueLeaders';
import LeagueAwards from '@/components/season/LeagueAwards';
import SeasonSummaryPanel from '@/components/season/SeasonSummaryPanel';
import SeasonHistoryPanel from '@/components/season/SeasonHistoryPanel';
import '@/components/season/seasonTables.css';

export default function SeasonLab() {
  usePageMeta({ title: 'Season Lab — SwishIQ Studio', description: 'Explore any published NBA season: standings, brackets, schedules, leaders and full season simulation.' });
  const { year, setYear, years, source, league, state, error, retry } = useSeasonSource();
  const sim = useSeasonSim();
  const [tab, setTab] = useState('hub');
  const [focus, setFocus] = useState('BOS');

  useEffect(() => {
    if (league && !league.byCode.has(focus)) setFocus(league.teams[0]?.code || 'BOS');
  }, [league, focus]);

  // The site-wide team palette follows the season focus team automatically.
  useEffect(() => {
    const code = league?.byCode.has(focus) ? focus : league?.teams?.[0]?.code;
    if (code) window.dispatchEvent(new CustomEvent('djhc-court-team-follow', { detail: code }));
  }, [league, focus]);

  const actualRecords = useMemo(() => {
    const map = new Map();
    for (const game of source?.schedule || []) {
      if (!game.actual) continue;
      const homeWon = game.actual.home > game.actual.away;
      const winner = homeWon ? game.home : game.away;
      const loser = homeWon ? game.away : game.home;
      if (!map.has(winner)) map.set(winner, { w: 0, l: 0, gp: 0 });
      if (!map.has(loser)) map.set(loser, { w: 0, l: 0, gp: 0 });
      const winRow = map.get(winner);
      const lossRow = map.get(loser);
      winRow.w += 1; winRow.gp += 1;
      lossRow.l += 1; lossRow.gp += 1;
    }
    return map;
  }, [source]);

  if (state !== 'ready' || !league) {
    return (
      <StudioShell active="/season">
        <WorkbenchHeader title="SEASON LAB" description="A MyNBA-style league hub on the observed season package." state={state} status={state === 'ready' ? 'League hub ready' : undefined} />
        <main className="season-lab mx-auto min-w-0 max-w-7xl space-y-5 px-4 py-6"><SourceStatus state={state} error={error} year={year} years={years} onYearChange={setYear} onRetry={retry} /></main>
      </StudioShell>
    );
  }

  const summary = sim.result?.summary || null;
  const simGames = sim.result?.games || null;
  const team = league.byCode.get(focus) || league.teams[0];
  const simRow = summary ? summary.find(row => row.code === team.code) || null : null;
  const actualRecord = actualRecords.get(team.code) || null;
  const championName = sim.result?.champion ? league.byCode.get(sim.result.champion)?.name : null;

  const winsByCode = new Map();
  if (summary) for (const row of summary) winsByCode.set(row.code, Math.round(row.wins));
  else for (const [code, rec] of actualRecords) winsByCode.set(code, rec.w);
  const conferenceRank = league.teams
    .filter(item => item.conference === team.conference)
    .sort((a, b) => (winsByCode.get(b.code) ?? 0) - (winsByCode.get(a.code) ?? 0))
    .findIndex(item => item.code === team.code) + 1;

  const changeYear = value => {
    sim.reset();
    setYear(value);
  };

  return (
    <StudioShell active="/season">
      <WorkbenchHeader title="SEASON LAB" description="A MyNBA-style league hub: replay the observed season, track standings and the schedule, and dive into your team page." state="ready" status="League hub ready" />
      <main className="season-lab mx-auto min-w-0 max-w-7xl px-4 py-6 sm:px-6">
        <MyNbaHub
          focusCode={team.code}
          tab={tab}
          onTab={setTab}
          teamPicker={{ teams: league.teams, focusCode: team.code, onChange: setFocus }}
        >
          <LeagueControls
            years={years}
            year={year}
            onYearChange={changeYear}
            setup={sim.setup}
            onSetupChange={sim.setSetup}
            onRun={() => sim.run(league, source.schedule)}
            running={sim.running}
            progress={sim.progress}
            hasResults={Boolean(sim.result)}
            championName={championName}
          />
          <SeasonHistoryPanel year={year} hasResults={Boolean(sim.result)} result={sim.result} championName={championName} />
          <div key={tab} className="season-view-enter">
            {tab === 'hub' && (
              <div className="space-y-4">
                {summary && (
                  <SeasonSummaryPanel summary={summary} simGames={simGames} actualRecords={actualRecords} league={league} championCode={sim.result?.champion} onFocusChange={setFocus} />
                )}
                <LeagueHero team={team} simRow={simRow} actualRecord={actualRecord} conferenceRank={conferenceRank} />
                <LeagueStandings league={league} summary={summary} actualRecords={actualRecords} focusCode={team.code} onFocusChange={setFocus} limit={6} />
                <LeagueLeaders simGames={simGames} />
                <LeagueAwards simGames={simGames} />
              </div>
            )}
            {tab === 'standings' && (
              <LeagueStandings league={league} summary={summary} actualRecords={actualRecords} focusCode={team.code} onFocusChange={setFocus} />
            )}
            {tab === 'bracket' && (
              <PlayoffBracket bracket={sim.result?.bracket} onFocusChange={setFocus} />
            )}
            {tab === 'schedule' && (
              <LeagueSchedule league={league} schedule={source.schedule || []} simGames={simGames} focusCode={team.code} onFocusChange={setFocus} />
            )}
            {tab === 'team' && (
              <LeagueTeamView team={team} simRow={simRow} league={league} actualWins={actualRecord?.w} />
            )}
            {tab === 'log' && (
              <PlayerStatsLog team={team} simGames={simGames} />
            )}
          </div>
        </MyNbaHub>
      </main>
    </StudioShell>
  );
}