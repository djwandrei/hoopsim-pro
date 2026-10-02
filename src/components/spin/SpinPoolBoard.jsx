import React from 'react';
import MetricTile from '@/components/studio/MetricTile';
export default function SpinPoolBoard({ pool, latest, excluded }) {
  const ready=pool?.status==='ready';
  const draws=latest?.spinNumber||0,eligible=ready?pool.entries.length:null;
  return <section aria-label="Draft pool dashboard" className="space-y-3"><div className="grid grid-cols-2 gap-3 xl:grid-cols-4"><MetricTile label="Eligible players" value={eligible??'—'}/><MetricTile label="Confirmed draws" value={ready?draws:'—'} tone="positive"/><MetricTile label="Remaining players" value={ready?Math.max(0,eligible-draws):'—'} tone="royal"/><MetricTile label="Your exclusions" value={excluded.length}/></div><p role="status" className="rounded-xl border border-border/30 bg-canvas/30 px-4 py-3 text-xs text-muted-foreground">{ready?`${draws} of ${eligible} players drawn · No replacement · Rebuild with the same seed and role to replay.`:pool?.status==='dirty'?'Controls changed. Apply the seed and role to rebuild before drawing again.':pool?.reason||'The source-bound pool will appear when the workbench is ready.'}</p></section>;
}