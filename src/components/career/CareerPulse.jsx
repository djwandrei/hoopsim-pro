import React, { useMemo } from 'react';
import MetricTile from '@/components/studio/MetricTile';

export default function CareerPulse({ players }) {
  const pulse = useMemo(() => {
    const rows = players.reduce((sum, player) => sum + player.rows.length, 0);
    const deepest = players.reduce((best, player) => (player.rows.length > (best?.rows.length || 0) ? player : best), players[0]);
    return { rows, deepest };
  }, [players]);
  if (!players.length) return null;
  return <section aria-label="Career pulse" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
    <MetricTile label="Careers tracked" value={players.length} detail="Observed regular-season careers in the pooled archive" />
    <MetricTile label="Recorded rows" value={pulse.rows.toLocaleString()} detail="Observed team-season records" tone="royal" />
    <MetricTile label="Longest record" value={`${pulse.deepest?.rows.length || 0} rows`} detail={pulse.deepest?.name || '—'} tone="positive" />
    <MetricTile label="Minutes leader" value={players[0].minutes.toLocaleString()} detail={`${players[0].name} leads recorded minutes`} />
  </section>;
}