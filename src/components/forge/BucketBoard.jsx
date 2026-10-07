import React from 'react';
import { X } from 'lucide-react';
import PlayerPortrait from '@/components/players/PlayerPortrait';
import TeamMark from '@/components/studio/TeamMark';
import { gradeFor } from '@/components/forge/bapSkills';

// Build-slot list: attribute on the left with its DJHC rating basis, donor and
// 25–99 rating value in the middle, letter grade on the right.
export default function BucketBoard({ buckets, picks, activeKey, onUndo, complete, showGrades }) {
  const filled = buckets.filter(bucket => picks[bucket.key]).length;
  return <div className="overflow-hidden rounded-xl border border-border/25">
    <div className="flex items-center justify-between border-b border-border/25 bg-raised/60 px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Build slots</p>
      <p className="font-mono text-[10px] text-muted-foreground">{filled} / {buckets.length}</p>
    </div>
    {buckets.map(bucket => {
      const pick = picks[bucket.key];
      const active = !complete && !pick && activeKey === bucket.key;
      const grade = pick ? gradeFor(pick.value) : null;
      return <div key={`${bucket.key}:${pick ? pick.player.playerRef : 'open'}`} className={`${pick ? 'slot-pop ' : ''}flex items-center gap-3 border-b border-border/15 px-3 py-2.5 last:border-b-0 transition-colors ${pick ? 'bg-gold/5' : active ? 'bg-gold/10' : 'bg-raised/30'}`}>
        <div className="w-28 shrink-0">
          <p className={`text-[10px] font-semibold uppercase tracking-wider ${pick || active ? 'text-gold' : 'text-muted-foreground'}`}>{bucket.label}</p>
          <p className="font-mono text-[9px] text-muted-foreground">DJHC rating · {bucket.basis}</p>
        </div>
        {pick ? <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <PlayerPortrait player={pick.player} className="h-9 w-9 shrink-0" />
          <div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold">{pick.player.name}</p><p className="flex items-center gap-1 font-mono text-[10px] text-muted-foreground"><TeamMark code={pick.player.teamCode} className="h-6 w-6" />{pick.player.teamCode}</p></div>
          <p className="shrink-0 font-display text-xl leading-none text-gold" aria-label={`${pick.value} DJHC rating`}>{bucket.fmt(pick.value)}</p>
          <span className={`w-8 shrink-0 rounded-md border py-0.5 text-center font-mono text-xs ${showGrades && grade ? 'border-gold/30 bg-gold/10 text-gold' : 'border-border/20 text-muted-foreground'}`}>{showGrades && grade ? grade : '·'}</span>
          {!complete && <button type="button" aria-label={`Release ${pick.player.name} from ${bucket.label}`} onClick={() => onUndo(bucket.key)} className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-raised hover:text-trim-ink"><X className="h-3.5 w-3.5" /></button>}
        </div> : <p className={`flex-1 font-mono text-[11px] ${active ? 'text-gold' : 'text-muted-foreground/85'}`}>{active ? '▸ Wheel landed — keep or respin the offer' : 'EMPTY'}</p>}
      </div>;
    })}
  </div>;
}