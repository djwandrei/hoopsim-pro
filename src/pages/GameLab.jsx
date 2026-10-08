import React, { useEffect, useState } from 'react';
import usePageMeta from '@/hooks/usePageMeta';
import StudioShell from '@/components/studio/StudioShell';
import WorkbenchHeader from '@/components/studio/WorkbenchHeader';
import SourceStatus from '@/components/studio/SourceStatus';
import useSeasonSource from '@/hooks/useSeasonSource';
import useNativeGameSim from '@/hooks/useNativeGameSim';
import MyNbaHub from '@/components/season/MyNbaHub';
import MatchupBreakdown from '@/components/game/MatchupBreakdown';
import GameControls from '@/components/game/GameControls';
import Candidate100Panel from '@/components/game/Candidate100Panel';
import GameScoreboard from '@/components/game/GameScoreboard';
import GameBoxScore from '@/components/game/GameBoxScore';
import NativeMatchupReport from '@/components/game/NativeMatchupReport';
import GamePlayFeed from '@/components/game/GamePlayFeed';
import SeriesBoard from '@/components/game/SeriesBoard';
import SeriesGameRecap from '@/components/game/SeriesGameRecap';
import GameMatchupTheme from '@/components/game/GameMatchupTheme';
import PreGameDisclosure from '@/components/game/PreGameDisclosure';
import LiveBoxScore from '@/components/game/LiveBoxScore';
import SavedResultsShelf from '@/components/game/SavedResultsShelf';
import SimErrorBanner from '@/components/game/SimErrorBanner';
import { loadSavedResults, saveSavedResult, removeSavedResult } from '@/lib/savedResults';
import { trackGa4 } from '@/lib/gaBridge';

export default function GameLab() {
  usePageMeta({ title: 'Game Lab — SwishIQ Studio', description: 'Simulate any NBA matchup or full seven-game series with live play-by-play and series momentum.' });
  const { year, setYear, years, source, league, state, error, retry } = useSeasonSource();
  // Shareable call state: matchup, seed, neutral court and tab live in the URL
  // so a copied link re-opens the exact call (the sim is deterministic).
  const params = new URLSearchParams(window.location.search);
  const urlPick = key => {
    const value = params.get(key);
    if (key === 'tab') return value === 'series' ? 'series' : 'game';
    if (key === 'neutral') return value === '1';
    return value || null;
  };
  const sim = useNativeGameSim({ seed: urlPick('seed') || undefined, neutral: urlPick('neutral') });
  // The verified exact-season package reference drives the native engine.
  const packageRef = source?.entry || null;
  const [tab, setTab] = useState(urlPick('tab'));
  const [a, setA] = useState(urlPick('a') || 'BOS');
  const [b, setB] = useState(urlPick('b') || 'LAL');
  const [feedDone, setFeedDone] = useState(false);
  const [drillGame, setDrillGame] = useState(null);
  const [showPreGame, setShowPreGame] = useState(true);
  const [liveCount, setLiveCount] = useState(0);

  useEffect(() => {
    setFeedDone(false);
    setLiveCount(0);
    setShowPreGame(!sim.game);
  }, [sim.game]);

  // A freshly simulated series clears any open per-game drill-down.
  useEffect(() => { setDrillGame(null); }, [sim.series]);

  // Analytics: report completed sims to GA4 (best-effort, never blocking).
  useEffect(() => {
    if (sim.game) trackGa4('game_sim_completed', { home: sim.game.home, away: sim.game.away, seed: String(sim.seed), neutral: sim.neutral });
  }, [sim.game]);
  useEffect(() => {
    if (sim.series) trackGa4('series_sim_completed', { home: sim.series.home, away: sim.series.away, home_wins: sim.series.homeWins, away_wins: sim.series.awayWins, seed: String(sim.seed) });
  }, [sim.series]);

  useEffect(() => {
    if (!league) return;
    if (!league.byCode.has(a)) setA(league.teams[0]?.code || 'BOS');
    if (!league.byCode.has(b) || b === a) setB(league.teams.find((team) => team.code !== a)?.code || 'LAL');
  }, [league, a, b]);

  // Keep the call in the URL so "copy link" always shares the current state.
  useEffect(() => {
    const query = new URLSearchParams({ tab, a, b, seed: String(sim.seed), neutral: sim.neutral ? '1' : '0' }).toString();
    window.history.replaceState(null, '', `${window.location.pathname}?${query}`);
  }, [tab, a, b, sim.seed, sim.neutral]);
  const shareLink = React.useCallback(() => navigator.clipboard.writeText(window.location.href), []);

  // Saved-results shelf: pin completed games and series by their call and
  // re-open them later. Opening a call from another season switches the
  // season source first, then replays the call once that league is ready.
  const [saved, setSaved] = useState(loadSavedResults);
  const [pendingOpen, setPendingOpen] = useState(null);
  const openSaved = entry => {
    if (entry.year !== year) setYear(entry.year);
    setTab(entry.kind === 'series' ? 'series' : 'game');
    setA(entry.a);
    setB(entry.b);
    sim.setSeed(entry.seed);
    sim.setNeutral(Boolean(entry.neutral));
    setPendingOpen(entry);
  };
  useEffect(() => {
    if (!pendingOpen || !league || year !== pendingOpen.year) return;
    const home = league.byCode.get(pendingOpen.a);
    const away = league.byCode.get(pendingOpen.b);
    setPendingOpen(null);
    if (!home || !away) return;
    if (pendingOpen.kind === 'series') sim.runSeries(league, home, away, { seed: pendingOpen.seed, neutral: pendingOpen.neutral, packageRef });
    else sim.runGame(league, home, away, { seed: pendingOpen.seed, neutral: pendingOpen.neutral, packageRef });
  }, [pendingOpen, league, year, sim]);

  if (state !== 'ready' || !league) {
    return (
      <StudioShell active="/game" followTeam="djhc">
        <GameMatchupTheme homeCode={league?.byCode.get(a)?.code || a} awayCode={league?.byCode.get(b)?.code || b}>
        <WorkbenchHeader title="GAME LAB" description="A MyNBA-style matchup hub on the observed season package." state={state} status={state === 'ready' ? 'Matchup hub ready' : undefined} />
        <main className="mx-auto min-w-0 max-w-7xl space-y-5 px-4 py-6"><SourceStatus state={state} error={error} year={year} years={years} onYearChange={setYear} onRetry={retry} /></main>
      </GameMatchupTheme>
      </StudioShell>);

  }

  const home = league.byCode.get(a) || league.teams[0];
  const away = league.byCode.get(b) || league.teams[1];
  const resultHome = league.byCode.get(sim.game?.home) || home;
  const resultAway = league.byCode.get(sim.game?.away) || away;
  // The native report carries a period timeline but no per-play stat events;
  // hide the live box score rather than showing an always-empty one.
  const hasLiveStats = (sim.game?.pbp || []).some(event => event.stat);
  const breakdown = simProps => (
    <MatchupBreakdown league={league} source={source} year={year} a={a} b={b} onA={setA} onB={setB} teamA={home} teamB={away} blocked={sim.policyBlocked} {...simProps} />
  );

  // The current finished result, expressed as a shelf entry (same call that
  // produced it), so "save" pins exactly what the user is looking at.
  const currentResult = sim.game
    ? {
      id: `game-${sim.game.home}-${sim.game.away}-${sim.seed}-${sim.neutral ? 1 : 0}`,
      kind: 'game', a: sim.game.home, b: sim.game.away,
      seed: String(sim.seed), neutral: sim.neutral, year, saved: Date.now(),
      label: `${league.byCode.get(sim.game.away)?.name || sim.game.away} @ ${league.byCode.get(sim.game.home)?.name || sim.game.home}`,
      score: `${sim.game.awayPts}–${sim.game.homePts}`,
    }
    : sim.series
      ? {
        id: `series-${sim.series.home}-${sim.series.away}-${sim.seed}-${sim.neutral ? 1 : 0}`,
        kind: 'series', a: sim.series.home, b: sim.series.away,
        seed: String(sim.seed), neutral: sim.neutral, year, saved: Date.now(),
        label: `${league.byCode.get(sim.series.home)?.name || sim.series.home} vs ${league.byCode.get(sim.series.away)?.name || sim.series.away}`,
        score: `${sim.series.homeWins}–${sim.series.awayWins}`,
      }
      : null;

  return (
    <StudioShell active="/game" followTeam="djhc">
        <GameMatchupTheme homeCode={league?.byCode.get(a)?.code || a} awayCode={league?.byCode.get(b)?.code || b}>
      <WorkbenchHeader title="GAME LAB" description="A MyNBA-style matchup hub: review the matchup intel, then sim single games and 7-game series." state="ready" status="Matchup hub ready" />
      <main className="mx-auto min-w-0 max-w-7xl px-4 py-6 sm:px-6">
        <SimErrorBanner error={sim.error} hint={sim.policyBlocked ? '' : undefined} />
        <MyNbaHub focusCode={home.code} awayCode={away.code} tab={tab} onTab={setTab} tabs={[['game', 'GAME'], ['series', 'SERIES']]}>
          {tab === 'game' &&
          <div className="space-y-4">
              <GameControls
              settings={sim.settings} onSettingsChange={sim.setSettings}
              running={sim.running} progress={sim.progress} blocked={sim.policyBlocked}
              onShareLink={shareLink} />
              <Candidate100Panel year={year} home={home} away={away} sourceEntry={packageRef} />
              {sim.game ?
              <PreGameDisclosure home={home} away={away} open={showPreGame} onToggle={() => setShowPreGame(current => !current)}>
                {breakdown({ onSimGame: () => sim.runGame(league, home, away, { packageRef }), hasGame: true })}
              </PreGameDisclosure> :
              breakdown({ onSimGame: () => sim.runGame(league, home, away, { packageRef }), hasGame: false })}
              {sim.game ?
              <GameMatchupTheme homeCode={resultHome.code} awayCode={resultAway.code}>
                  {!feedDone &&
                  <GamePlayFeed key={sim.game.stamp} game={sim.game} home={resultHome} away={resultAway} onComplete={() => setFeedDone(true)} onProgress={setLiveCount} />}
                  {!feedDone && hasLiveStats &&
                  <LiveBoxScore events={sim.game.pbp || []} count={liveCount} home={resultHome} away={resultAway} />}
                  {feedDone &&
                  <React.Fragment>
                    <GameScoreboard league={league} game={sim.game} />
                    {((sim.game.boxHome?.lines?.length || 0) + (sim.game.boxAway?.lines?.length || 0)) > 0 && <GameBoxScore game={sim.game} />}
                    <NativeMatchupReport native={sim.game.native} home={resultHome} away={resultAway} />
                  </React.Fragment>}
                  </GameMatchupTheme> :

            <section className="myna-panel p-6 text-center text-xs myna-muted">Pick a matchup, then sim the game — the site's release-pinned possession engine runs the Monte Carlo trials; the feed, scoreboard and native engine report land here.</section>
            }
            </div>
          }
          {tab === 'series' &&
          <div className="space-y-4">
              <GameControls
              settings={sim.settings} onSettingsChange={sim.setSettings}
              running={sim.running} progress={sim.progress} blocked={sim.policyBlocked}
              onShareLink={shareLink}
              onRunSeries={() => sim.runSeries(league, home, away, { packageRef })}
              hasSeries={Boolean(sim.series)} />
              {breakdown({})}
              {sim.series ?
            <React.Fragment>
              <SeriesBoard league={league} series={sim.series} onSelect={setDrillGame} />
              {drillGame && <SeriesGameRecap series={sim.series} game={drillGame} onClose={() => setDrillGame(null)} />}
              <NativeMatchupReport native={sim.series.native} home={home} away={away} />
            </React.Fragment> :

            <section className="myna-panel p-4 text-xs myna-muted">Sim a 7-game series with the site's engine — every game plays on neutral terms; display hosts follow the 2-2-1-1-1 pattern with {home.code} first.</section>
            }
            </div>
          }
        </MyNbaHub>
        <SavedResultsShelf
          entries={saved}
          canSave={Boolean(currentResult)}
          onSave={() => currentResult && setSaved(saveSavedResult(currentResult))}
          onOpen={openSaved}
          onRemove={id => setSaved(removeSavedResult(id))}
          year={year}
        />
      </main>
    </GameMatchupTheme>
      </StudioShell>);

}