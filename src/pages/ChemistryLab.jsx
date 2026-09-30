import React, { useState } from 'react';
import { X, Check } from 'lucide-react';
import StudioShell from '@/components/studio/StudioShell';
import WorkbenchHeader from '@/components/studio/WorkbenchHeader';
import SourceStatus from '@/components/studio/SourceStatus';
import WorkspaceEmpty from '@/components/studio/WorkspaceEmpty';
import LineupEvidence from '@/components/chemistry/LineupEvidence';
import useSeasonSource from '@/hooks/useSeasonSource';
export default function ChemistryLab() {
  const { year, setYear, years, source, league, state, error, retry } = useSeasonSource();
  const [teamCode, setTeamCode] = useState('');
  const [lineup, setLineup] = useState([]);
  const [query, setQuery] = useState('');
  const [view, setView] = useState('comparison');
  const teams = league?.teams || [];
  const team = league?.byCode.get(teamCode || teams[0]?.code);
  const roster = (team?.roster || []).filter(member => member.name.toLowerCase().includes(query.toLowerCase()));
  const toggle = member => setLineup(current => current.some(item => item.playerRef === member.playerRef) ? current.filter(item => item.playerRef !== member.playerRef) : current.length < 5 ? [...current, member] : current);
  return <StudioShell active="/chemistry"><WorkbenchHeader title="CHEMISTRY LAB" description="Compare the selected five using observed player-season evidence. No invented chemistry score or lineup winner." steps={['Roster', 'Selected five', 'Evidence']} current={lineup.length ? 1 : 0} /><main className="mx-auto max-w-6xl space-y-5 px-4 py-6">
    <SourceStatus state={state} error={error} source={source} year={year} years={years} onYearChange={value => { setYear(value); setTeamCode(''); setLineup([]); }} onRetry={retry} />
    {state === 'ready' && team && <div className="grid gap-5 lg:grid-cols-3"><section className="court-panel space-y-4 p-4"><label className="block text-xs text-muted-foreground">Team roster<select value={team.code} onChange={event => { setTeamCode(event.target.value); setLineup([]); }} className="mt-2 w-full rounded-lg border border-input bg-raised px-3 text-sm text-foreground">{teams.map(item => <option key={item.code} value={item.code}>{item.name}</option>)}</select></label><input type="search" aria-label="Search team roster" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search roster…" className="w-full rounded-lg border border-input bg-raised px-3 py-2 text-sm" /><p className="text-[10px] text-muted-foreground">PTS / REB / AST per game</p><div className="max-h-96 space-y-1 overflow-y-auto">{roster.map(member => { const chosen = lineup.some(item => item.playerRef === member.playerRef); return <button key={member.playerRef} type="button" aria-pressed={chosen} disabled={!chosen && lineup.length === 5} onClick={() => toggle(member)} className={chosen ? 'flex min-h-11 w-full items-center justify-between gap-2 rounded-lg bg-gold/10 px-3 py-2 text-left text-xs text-gold' : 'flex min-h-11 w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-xs hover:bg-raised disabled:opacity-40'}><span className="min-w-0 flex-1 truncate">{member.name}</span>{chosen ? <Check className="h-4 w-4" /> : <span className="font-mono text-[10px] text-muted-foreground">{member.pts.toFixed(1)} / {member.reb.toFixed(1)} / {member.ast.toFixed(1)}</span>}</button>; })}{!roster.length && <p className="text-xs text-muted-foreground">No roster records match your search.</p>}</div></section>
    <div className="space-y-4 lg:col-span-2"><section className="court-panel p-5"><div className="flex items-center justify-between"><h2 className="font-display text-2xl">SELECTED FIVE</h2><span className="font-mono text-xs text-gold" role="status">{lineup.length} / 5</span></div><div className="mt-4 flex flex-wrap gap-2">{lineup.map(member => <button type="button" key={member.playerRef} onClick={() => toggle(member)} aria-label={`Remove ${member.name}`} className="flex min-h-10 items-center gap-2 rounded-lg border border-gold/30 bg-gold/10 px-3 text-xs text-gold">{member.name}<X className="h-3 w-3" /></button>)}{!lineup.length && <p className="text-sm text-muted-foreground">Choose players from the roster to compare their source records.</p>}</div></section>
    <nav aria-label="Chemistry analysis views" className="flex flex-wrap gap-2">{[['comparison','Player comparison'],['observed','Observed lineup']].map(([key,label]) => <button type="button" key={key} aria-pressed={view === key} onClick={() => setView(key)} className={view === key ? 'rounded-lg border border-gold/40 bg-gold/10 px-4 py-2 text-xs text-gold' : 'rounded-lg border border-border px-4 py-2 text-xs text-muted-foreground'}>{label}</button>)}</nav>
    {view === 'comparison' && (lineup.length ? <LineupEvidence lineup={lineup} year={year} /> : <WorkspaceEmpty title="COMPARE THE EVIDENCE">Select up to five player profiles. Individual statistics do not establish shared-lineup performance.</WorkspaceEmpty>)}
    {view === 'observed' && <WorkspaceEmpty title="OBSERVED LINEUP DATA NOT SUPPLIED">This source has player and roster records, but no exact-five shared possessions or minutes. Coverage and denominators are unavailable, not zero.</WorkspaceEmpty>}
    </div></div>}
  </main></StudioShell>;
}