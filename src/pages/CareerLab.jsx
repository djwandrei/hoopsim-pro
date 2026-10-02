import React, { useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import PlayerPortrait from '@/components/players/PlayerPortrait';
import StudioShell from '@/components/studio/StudioShell';
import WorkbenchHeader from '@/components/studio/WorkbenchHeader';
import WorkspaceEmpty from '@/components/studio/WorkspaceEmpty';
import PlayerPicker from '@/components/studio/PlayerPicker';
import PlayerIdentity from '@/components/players/PlayerIdentity';
import PlayerBio from '@/components/players/PlayerBio';
import TrophyCase from '@/components/players/TrophyCase';
import usePlayerContext from '@/components/players/usePlayerContext';
import useCareerArchive from '@/components/career/useCareerArchive';
import CareerArchiveStatus from '@/components/career/CareerArchiveStatus';
import RecordedCareerChart from '@/components/career/RecordedCareerChart';
import RecordedCareerTable from '@/components/career/RecordedCareerTable';
import { careerSeasons } from '@/components/career/careerHistoryModel';
import CareerSummary from '@/components/career/CareerSummary';
import CareerSpotlight from '@/components/career/CareerSpotlight';
import MyNbaHub from '@/components/season/MyNbaHub';

const CAREER_TABS = [['overview', 'CAREER PATH'], ['history', 'SEASON LEDGER'], ['bio', 'BIO & AWARDS']];

// Career Lab, rebuilt on the MyNBA-style hub shell used by Season and Game Lab.
export default function CareerLab() {
  const { source, players, state, error, retry } = useCareerArchive();
  const [player, setPlayer] = useState(null);
  const [view, setView] = useState('overview');
  const [pickerOpen, setPickerOpen] = useState(true);
  const seasons = useMemo(() => player ? careerSeasons(player) : [], [player]);
  const { context, status } = usePlayerContext(player?.name || '');

  return (
    <StudioShell active="/career">
      <WorkbenchHeader title="CAREER LAB" description="A MyNBA-style career hub on the real site's pooled 2017–26 archive. Explore season changes, team stints and source-backed biography—without invented forecasts." steps={['Find a player', 'Recorded career path', 'History & biography']} current={player ? view === 'overview' ? 1 : 2 : 0} state={state} status={player ? `${seasons.length} recorded seasons` : 'Browse the pooled archive'} />
      <main className="mx-auto min-w-0 max-w-7xl px-4 py-6">
        <MyNbaHub focusCode="djhc" tab={view} onTab={setView} tabs={CAREER_TABS}>
          <div className="myna-panel p-4">
            <div className="min-w-0">
              <p className="court-kicker mb-2">Recorded career browser</p>
              <button
                type="button"
                aria-expanded={pickerOpen}
                onClick={() => setPickerOpen(open => !open)}
                className="flex min-h-12 w-full items-center justify-between gap-3 rounded-xl border border-border/60 bg-card px-4 text-left transition-colors hover:border-gold/40"
              >
                {player ? (
                  <span className="flex min-w-0 items-center gap-3">
                    <PlayerPortrait player={player} className="h-9 w-9" />
                    <span className="truncate text-sm font-semibold">{player.name}</span>
                    <span className="shrink-0 font-mono text-xs text-muted-foreground">{player.teamCode}</span>
                  </span>
                ) : (
                  <span className="text-sm font-semibold">Select a player…</span>
                )}
                <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${pickerOpen ? 'rotate-180' : ''}`} />
              </button>
              {pickerOpen && (
                <div className="mt-3">
                  <PlayerPicker
                    players={players}
                    selectedRef={player?.playerRef}
                    onSelect={(value) => {setPlayer(value);setPickerOpen(false);setView('overview');}}
                    placeholder="Find a career…"
                    teamFilter="chips" />
                </div>
              )}
            </div>
            {Boolean(players.length) && <CareerSpotlight players={players} selectedRef={player?.playerRef} onSelect={(value) => {setPlayer(value);setView('overview');}} />}
          </div>
          <CareerArchiveStatus source={source} state={state} error={error} retry={retry} />
          {!player ?
          <WorkspaceEmpty title="FOLLOW THE RECORDED JOURNEY">Select a player to see the original archive's season-by-season rates, team changes and published award records.</WorkspaceEmpty> :

          <div className="space-y-4">
              <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
                <div className="myna-panel"><PlayerIdentity player={player} year={player.latestYear} /></div>
                <div className="myna-panel p-4"><CareerSummary seasons={seasons} /></div>
              </div>
              {view === 'overview' &&
            <div className="myna-panel p-4">
                  <RecordedCareerChart key={player.playerRef} seasons={seasons} />
                  









              
                </div>}
              {view === 'history' &&
            <div className="myna-panel p-4"><RecordedCareerTable seasons={seasons} /></div>}
              {view === 'bio' && <div className="grid gap-4 lg:grid-cols-2">
                <div className="myna-panel p-4"><p className="court-kicker">Bio & awards</p><h2 className="mt-1 font-display text-2xl">BIOGRAPHY</h2><PlayerBio player={{ ...player, seasonStartYear: player.latestYear }} context={context} status={status} /></div>
                <div className="myna-panel p-4"><p className="court-kicker">Published honors</p><h2 className="mt-1 font-display text-2xl">AWARDS</h2><TrophyCase context={context} status={status} /></div>
              </div>}
            </div>
          }
        </MyNbaHub>
      </main>
    </StudioShell>);

}