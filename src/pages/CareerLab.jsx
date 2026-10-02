import React, { useMemo, useState } from 'react';
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
import MyNbaHub from '@/components/season/MyNbaHub';

const CAREER_TABS = [['overview', 'CAREER PATH'], ['history', 'SEASON LEDGER'], ['bio', 'BIO & AWARDS']];

// Career Lab, rebuilt on the MyNBA-style hub shell used by Season and Game Lab.
export default function CareerLab() {
  const { source, players, state, error, retry } = useCareerArchive();
  const [player, setPlayer] = useState(null);
  const [view, setView] = useState('overview');
  const seasons = useMemo(() => player ? careerSeasons(player) : [], [player]);
  const { context, status } = usePlayerContext(player?.name || '');

  return (
    <StudioShell active="/career">
      <WorkbenchHeader title="CAREER LAB" description="A MyNBA-style career hub on the real site's pooled 2017–26 archive. Explore season changes, team stints and source-backed biography—without invented forecasts." steps={['Find a player', 'Recorded career path', 'History & biography']} current={player ? view === 'overview' ? 1 : 2 : 0} state={state} status={player ? `${seasons.length} recorded seasons` : 'Browse the pooled archive'} />
      <main className="mx-auto min-w-0 max-w-7xl px-4 py-6">
        <MyNbaHub focusCode={player?.teamCode} tab={view} onTab={setView} tabs={CAREER_TABS}>
          <div className="myna-panel p-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="min-w-[16rem] flex-1">
                <p className="court-kicker mb-2">Recorded career browser</p>
                <PlayerPicker
                  players={players}
                  selectedRef={player?.playerRef}
                  onSelect={(value) => {setPlayer(value);setView('overview');}}
                  placeholder="Find a career…" />
                
              </div>
              

              
            </div>
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
                  <details className="court-panel mt-4 p-4 text-xs">
                    <summary className="cursor-pointer text-gold">Career archive source receipt</summary>
                    <dl className="mt-3 space-y-3 break-all">
                      {[['Package', source.entry.packageId], ['Version', source.entry.packageVersion], ['Original career artifact SHA-256', source.sourceReceipt.artifactSha256], ['Package manifest SHA-256', source.entry.packageManifestSha256], ['Copied', source.sourceReceipt.copiedAt]].map(([label, value]) =>
                  <div key={label}>
                          <dt className="text-muted-foreground">{label}</dt>
                          <dd className="mt-1 font-mono">{value}</dd>
                        </div>
                  )}
                    </dl>
                  </details>
                </div>}
              {view === 'history' &&
            <div className="myna-panel p-4"><RecordedCareerTable seasons={seasons} /></div>}
              {view === 'bio' &&
            <div className="myna-panel p-4">
                  <p className="court-kicker">Bio & awards</p>
                  <h2 className="mt-1 font-display text-2xl">BIOGRAPHY & AWARD HISTORY</h2>
                  <PlayerBio player={{ ...player, seasonStartYear: player.latestYear }} context={context} status={status} />
                  <TrophyCase context={context} status={status} />
                </div>}
            </div>
          }
        </MyNbaHub>
      </main>
    </StudioShell>);

}