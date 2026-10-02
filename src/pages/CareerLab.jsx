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
import WorkbenchViewTabs from '@/components/studio/WorkbenchViewTabs';
import CareerPulse from '@/components/career/CareerPulse';

export default function CareerLab() {
  const { source,players,state,error,retry } = useCareerArchive();
  const [player,setPlayer] = useState(null);
  const [view,setView] = useState('overview');
  const seasons = useMemo(() => player ? careerSeasons(player) : [],[player]);
  const { context,status } = usePlayerContext(player?.name || '');
  return <StudioShell active="/career"><WorkbenchHeader title="CAREER LAB" description="Follow recorded player histories across the real site's pooled 2017–26 archive. Explore season changes, team stints and source-backed biography—without invented forecasts." steps={['Find a player','Recorded career path','History & biography']} current={player ? view === 'overview' ? 1 : 2 : 0} state={state} status={player ? `${seasons.length} recorded seasons` : 'Browse the pooled archive'} /><main className="mx-auto max-w-6xl space-y-5 px-4 py-6"><CareerArchiveStatus source={source} state={state} error={error} retry={retry} /><CareerPulse players={players} />{state === 'ready' && <div className="grid items-start gap-5 lg:grid-cols-3"><div className="space-y-4 lg:sticky lg:top-4"><p className="court-kicker">Recorded career browser</p><PlayerPicker players={players} selectedRef={player?.playerRef} onSelect={value => { setPlayer(value);setView('overview'); }} placeholder="Find a career…" /><p className="px-1 text-xs leading-relaxed text-muted-foreground">The career window is pooled independently of the exact-season selection in other workbenches. Seasons outside 2017–26 are not inferred.</p></div><div className="space-y-5 lg:col-span-2">{!player ? <WorkspaceEmpty title="FOLLOW THE RECORDED JOURNEY">Select a player to see the original archive's season-by-season rates, team changes and published award records.</WorkspaceEmpty> : <><PlayerIdentity player={player} year={player.latestYear} /><CareerSummary seasons={seasons}/><WorkbenchViewTabs label="Career Lab views" value={view} onChange={setView} options={[{key:'overview',label:'Career path'},{key:'history',label:'Season ledger'},{key:'bio',label:'Bio & awards'}]}/>{view === 'overview' && <RecordedCareerChart key={player.playerRef} seasons={seasons} />}{view === 'history' && <RecordedCareerTable seasons={seasons} />}{view === 'bio' && <section className="court-panel p-5"><h2 className="font-display text-2xl">BIOGRAPHY & AWARD HISTORY</h2><PlayerBio player={{ ...player,seasonStartYear:player.latestYear }} context={context} status={status} /><TrophyCase context={context} status={status} /></section>}<details className="court-panel p-4 text-xs"><summary className="cursor-pointer text-gold">Career archive source receipt</summary><dl className="mt-3 space-y-3 break-all">{[['Package',source.entry.packageId],['Version',source.entry.packageVersion],['Original career artifact SHA-256',source.sourceReceipt.artifactSha256],['Package manifest SHA-256',source.entry.packageManifestSha256],['Copied',source.sourceReceipt.copiedAt]].map(([label,value]) => <div key={label}><dt className="text-muted-foreground">{label}</dt><dd className="mt-1 font-mono">{value}</dd></div>)}</dl></details></>}</div></div>}</main></StudioShell>;
}