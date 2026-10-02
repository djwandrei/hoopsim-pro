import React from 'react';
import { RotateCcw, Trophy } from 'lucide-react';
import PlayerPortrait from '@/components/players/PlayerPortrait';
import TeamMark from '@/components/studio/TeamMark';
import MetricTile from '@/components/studio/MetricTile';
export default function BucketSummary({ buckets, picks, overall, leagueMax, onRestart }) {
  const sorted = [...buckets].sort((a, b) => (picks[b.key].value / leagueMax[b.key]) - (picks[a.key].value / leagueMax[a.key]));
  return <section className="court-panel p-5" aria-label="Completed build summary">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div><p className="court-kicker">Build complete</p><h3 className="mt-1 font-display text-3xl">YOUR COMPOSITE PLAYER</h3></div>
      <button type="button" onClick={onRestart} className="flex min-h-10 items-center gap-2 rounded-lg border border-gold/40 bg-gold/10 px-4 text-xs font-semibold text-gold"><RotateCcw className="h-3.5 w-3.5" />Draft a new player</button>
    </header>
    <div className="mt-4 grid gap-3 sm:grid-cols-3">
      <MetricTile label="Build OVR" value={overall} detail="Weighted pool percentile" tone="positive" />
      <MetricTile label="Buckets filled" value={buckets.length} detail="Real player-season donors" />
      <MetricTile label="Top contributor" value={picks[sorted[0].key].player.name.split(' ').slice(-1)[0]} detail={`${sorted[0].label} · ${sorted[0].value.toFixed(1)} ${sorted[0].metric}`} tone="royal" />
    </div>
    <div className="mt-5 space-y-2">{buckets.map(bucket => {
      const pick = picks[bucket.key];
      const pct = Math.min(100, Math.round(pick.value / leagueMax[bucket.key] * 100));
      return <div key={bucket.key} className="flex items-center gap-3 rounded-xl border border-border/25 bg-canvas/30 px-3 py-2">
        <PlayerPortrait player={pick.player} className="h-10 w-10 shrink-0" />
        <div className="min-w-0 w-40 shrink-0"><p className="truncate text-xs font-semibold">{pick.player.name}</p><p className="flex items-center gap-1 text-[10px] text-muted-foreground"><TeamMark code={pick.player.teamCode} className="h-5 w-5" />{pick.player.teamCode}</p></div>
        <div className="min-w-0 flex-1"><div className="flex items-center justify-between text-[10px] text-muted-foreground"><span>{bucket.label} · {bucket.metric}</span><span className="font-mono">{bucket.fmt(pick.value)} · {pct}% of pool max</span></div><div className="mt-1 h-1.5 overflow-hidden rounded-full bg-canvas/60"><div className="h-full rounded-full bg-gold" style={{ width: `${Math.max(4, pct)}%` }} /></div></div>
      </div>;
    })}</div>
    <p className="mt-4 flex items-start gap-2 text-[11px] leading-relaxed text-muted-foreground"><Trophy className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gold" />A casual draft game over observed player-season rows — the OVR is a weighted share of pool maxima, not a scouting grade or a validated forecast.</p>
  </section>;
}