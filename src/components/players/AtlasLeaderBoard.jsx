import React, { useMemo, useState } from 'react';
import { Plus, Check, GitCompare } from 'lucide-react';
import PlayerPortrait from '@/components/players/PlayerPortrait';
import TeamMark from '@/components/studio/TeamMark';
import { statText } from '@/components/players/blueprintModel';
const CHOICES = [['pts','PPG'],['ast','APG'],['reb','RPG'],['mpg','MPG'],['ts','TS%'],['stl','SPG'],['blk','BPG'],['tov','TOV']];
export default function AtlasLeaderBoard({ rows, selected, onSelect, onCompare }) {
  const [metric,setMetric] = useState('pts');
  const metricLabel = CHOICES.find(([key]) => key === metric)[1];
  const chosen = useMemo(() => new Set(selected.map(player => player.id)),[selected]);
  const leaders = useMemo(() => rows.filter(row => Number.isFinite(row.stats[metric])).sort((a,b) => metric === 'tov' ? a.stats[metric]-b.stats[metric] : b.stats[metric]-a.stats[metric]).slice(0,10),[rows,metric]);
  const max = leaders.length ? leaders[0].stats[metric] : 0;
  const barWidth = value => {
    if (!Number.isFinite(value) || !Number.isFinite(max)) return 0;
    if (metric === 'tov') {
      if (max === 0) return value === 0 ? 100 : 0;
      return Math.max(0, Math.min(100, max / value * 100));
    }
    if (max === 0) return value === 0 ? 100 : 0;
    return Math.max(0, Math.min(100, value / max * 100));
  };
  return <section className="court-panel p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="court-kicker">Leader board</p><h2 className="mt-1 font-display text-2xl">TOP OF THE LEAGUE</h2><p className="mt-2 text-xs text-muted-foreground">{metric === 'tov' ? 'Lowest' : 'Best'} observed {metricLabel} rates among the {rows.length} scoped rows. Pin anyone straight to your dossier.</p></div><label className="block"><span className="studio-control-label">Metric</span><select value={metric} onChange={event => setMetric(event.target.value)} className="studio-select sm:w-36">{CHOICES.map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></label></div><ol className="mt-4 grid gap-2">{!leaders.length && <p className="mt-4 text-sm text-muted-foreground">Scope the rows above to populate this board.</p>}{leaders.map((row,index) => { const pinned = chosen.has(row.id);return <li key={row.id} className={`flex min-w-0 items-center gap-2 rounded-xl border p-2 transition-colors hover:border-gold/30 sm:gap-3 sm:p-2.5 ${pinned ? 'border-gold/40 bg-gold/10' : index < 3 ? 'border-gold/45 bg-canvas/30 shadow-[0_0_18px_rgba(233,185,73,0.1)]' : 'border-border/25 bg-canvas/30'}`}><span className={`w-6 shrink-0 text-center font-display sm:w-7 ${index === 0 ? 'text-2xl text-gold' : index < 3 ? 'text-xl text-foreground' : 'text-lg text-muted-foreground'}`}>{index+1}</span><PlayerPortrait player={row} frameless className="h-12 w-12 rounded-lg sm:h-14 sm:w-14" /><div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold">{row.name}</p><p className="mt-0.5 flex items-center gap-1.5 text-[10px] text-muted-foreground"><TeamMark code={row.teamCode} className="h-6 w-6" />{row.teamCode} · {row.positions.join('/')} · {row.stats.gp} GP</p><div className="mt-1.5 h-2 rounded bg-raised"><div className={pinned ? 'h-full rounded bg-gold' : 'h-full rounded bg-royal/70'} style={{ width:`${Math.max(4,Math.round(barWidth(row.stats[metric])))}%` }} /></div></div><span className="shrink-0 font-mono text-sm text-gold">{statText(metric,row.stats[metric])}</span><button type="button" onClick={() => onSelect(row)} aria-label={`${pinned ? 'Remove' : 'Pin'} ${row.name} on the scouting board`} className="shrink-0 rounded-lg border border-border/35 p-2 text-gold transition-colors hover:bg-raised"><Check className={`h-4 w-4 ${pinned ? '' : 'hidden'}`} /><Plus className={`h-4 w-4 ${pinned ? 'hidden' : ''}`} /></button>
{typeof onCompare === 'function' && <button type="button" onClick={() => onCompare(row)} aria-label={`Send ${row.name} to the comparison board`} className="shrink-0 rounded-lg border border-border/35 p-2 text-royal transition-colors hover:bg-raised"><GitCompare className="h-4 w-4" /></button>}</li>; })}</ol></section>;
}
