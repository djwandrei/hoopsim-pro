import React from 'react';
import { Info, RotateCcw } from 'lucide-react';
import PlayerPortrait from '@/components/players/PlayerPortrait';
import TeamMark from '@/components/studio/TeamMark';
import MetricTile from '@/components/studio/MetricTile';
import { gradeFor } from '@/components/forge/bapSkills';

export default function BucketSummary({ buckets, picks, overall, onRestart }) {
  const sorted = [...buckets].sort((a, b) => picks[b.key].value - picks[a.key].value);
  return <section className="court-panel relative overflow-hidden p-5" aria-label="Completed build summary">
    <span className="bcast-watermark" aria-hidden="true">FORGED</span>
    <header className="relative flex flex-wrap items-center justify-between gap-3">
      <div><p className="bcast-kicker">Build complete</p><h3 className="broadcast-gradient-text mt-1 font-display text-3xl">YOUR COMPOSITE PLAYER</h3></div>
      <button type="button" onClick={onRestart} className="flex min-h-10 items-center gap-2 rounded-lg border border-gold/40 bg-gold/10 px-4 text-xs font-semibold text-gold transition-colors hover:bg-gold/20"><RotateCcw className="h-3.5 w-3.5" />Draft a new player</button>
    </header>
    <div className="mt-4 grid gap-3 sm:grid-cols-3">
      <MetricTile label="Build OVR" value={overall} detail={`Mean of nine DJHC skill ratings · grade ${gradeFor(overall)}`} tone="positive" />
      <MetricTile label="Buckets filled" value={buckets.length} detail="Real player-season donors" />
      <MetricTile label="Top contributor" value={picks[sorted[0].key].player.name.split(' ').slice(-1)[0]} detail={`${sorted[0].label} · DJHC ${picks[sorted[0].key].value}`} tone="royal" />
    </div>
    <div className="mt-5 space-y-2">{buckets.map(bucket => {
      const pick = picks[bucket.key];
      const pct = Math.min(100, Math.max(0, Math.round(pick.value / 99 * 100)));
      return <div key={bucket.key} className="flex items-center gap-3 rounded-xl border border-border/25 bg-raised/40 px-3 py-2 transition-colors hover:border-gold/35">
        <PlayerPortrait player={pick.player} className="h-10 w-10 shrink-0" />
        <div className="min-w-0 w-40 shrink-0"><p className="truncate text-xs font-semibold">{pick.player.name}</p><p className="flex items-center gap-1 text-[10px] text-muted-foreground"><TeamMark code={pick.player.teamCode} className="h-7 w-7" />{pick.player.teamCode}</p></div>
        <div className="min-w-0 flex-1"><div className="flex items-center justify-between text-[10px] text-muted-foreground"><span>{bucket.label} · {bucket.basis}</span><span className="font-mono">DJHC {bucket.fmt(pick.value)} / 99</span></div><div className="mt-1 h-2 overflow-hidden rounded-full bg-raised/70"><div className="h-full rounded-full bg-gradient-to-r from-gold/60 to-gold" style={{ width: `${Math.max(4, pct)}%` }} /></div></div>
        <span className="shrink-0 rounded-md border border-gold/30 bg-gold/10 px-1.5 py-0.5 font-mono text-[10px] font-bold text-gold">{gradeFor(pick.value)}</span>
      </div>;
    })}</div>
    <p className="mt-4 flex items-start gap-2 text-[11px] leading-relaxed text-muted-foreground"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gold" />DJHC skill estimates rank observed players within the selected season using box-score rates, attempt-shrunk shooting efficiency, and a role adjustment when the sample supports it. OVR is the mean of the nine 25–99 estimates. These are exploratory, descriptive ratings, not official 2K ratings or validated forecasts.</p>
  </section>;
}