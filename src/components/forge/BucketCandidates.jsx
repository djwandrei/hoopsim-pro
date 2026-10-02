import React from 'react';
import PlayerPortrait from '@/components/players/PlayerPortrait';
import TeamMark from '@/components/studio/TeamMark';
import { CircleAlert } from 'lucide-react';
export default function BucketCandidates({ candidates, bucket, onPick }) {
  if (!candidates.length) return <p className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-border/30 bg-canvas/30 p-6 text-center text-sm text-muted-foreground"><CircleAlert className="h-4 w-4 text-gold" />The pool is exhausted — release a pick to redraw.</p>;
  return <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{candidates.map(player => <button key={player.playerRef} type="button" onClick={() => onPick(player)} className="flex min-w-0 flex-col items-center gap-1 rounded-xl border border-border/35 bg-card p-4 text-center transition-all hover:-translate-y-1 hover:border-gold/50 hover:bg-gold/5 hover:shadow-[0_14px_30px_hsl(var(--court-canvas)/0.45)]">
    <PlayerPortrait player={player} className="h-20 w-20" />
    <p className="w-full truncate text-sm font-semibold">{player.name}</p>
    <p className="flex items-center gap-1.5 text-[10px] text-muted-foreground"><TeamMark code={player.teamCode} className="h-6 w-6" />{player.teamCode} · {player.positions.join('/') || '—'}</p>
    <p className="mt-1 font-display text-4xl leading-none text-gold">{bucket.fmt(player[bucket.key])}</p>
    <p className="mt-1 flex items-center gap-1.5"><span className="text-[10px] uppercase tracking-widest text-muted-foreground">{bucket.metric}</span><span className="rounded-full border border-gold/30 bg-gold/10 px-2 py-0.5 font-mono text-[10px] text-gold">pool #{player.ranks?.[bucket.key] ?? '—'}</span></p>
    <p className="mt-1 w-full border-t border-border/25 pt-2 font-mono text-[10px] text-muted-foreground">{player.pts.toFixed(1)} PTS · {player.ast.toFixed(1)} AST · {player.reb.toFixed(1)} REB · {player.mpg.toFixed(1)} MPG</p>
  </button>)}</div>;
}