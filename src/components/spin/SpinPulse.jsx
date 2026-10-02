import React from 'react';
import MetricTile from '@/components/studio/MetricTile';

const STATUS = { ready: 'Pool ready', dirty: 'Seed or role changed', unavailable: 'Pool unavailable' };

export default function SpinPulse({ players, pool, latest, excluded }) {
  const eligible = pool?.status === 'ready' ? pool.entries.length : null;
  return <section aria-label="Spin pulse" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
    <MetricTile label="Candidates" value={players.length} detail="Observed players in this exact season" />
    <MetricTile label="Excluded" value={excluded.length} detail="Removed from the role pool" tone="royal" />
    <MetricTile label="Eligible pool" value={eligible === null ? '—' : eligible} detail={STATUS[pool?.status] || 'Not built yet'} tone="positive" />
    <MetricTile label="Latest pick" value={latest ? `#${latest.spinNumber}` : '—'} detail={latest ? latest.displayPlayer?.name || 'Selected player' : 'No draw yet'} />
  </section>;
}