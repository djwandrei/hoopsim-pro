import React, { useMemo } from 'react';
import MetricTile from '@/components/studio/MetricTile';

export default function BlueprintPulse({ roster }) {
  const pulse = useMemo(() => {
    const teams = new Set(roster.map(row => row.teamCode));
    const byMinutes = [...roster].sort((a, b) => (b.stats.mpg ?? -1) - (a.stats.mpg ?? -1))[0];
    const byScoring = [...roster].sort((a, b) => (b.stats.pts ?? -1) - (a.stats.pts ?? -1))[0];
    return { teams: teams.size, minutes: byMinutes, scoring: byScoring };
  }, [roster]);
  if (!roster.length) return null;
  return <section aria-label="Blueprint pulse" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
    <MetricTile label="Observed rows" value={roster.length} detail="Player-team records in this exact season" />
    <MetricTile label="Teams represented" value={pulse.teams} detail="Distinct observed teams" tone="royal" />
    <MetricTile label="Minutes leader" value={Number.isFinite(pulse.minutes?.stats.mpg) ? `${pulse.minutes.stats.mpg.toFixed(1)} MPG` : '—'} detail={pulse.minutes?.name || 'No observed rows'} tone="positive" />
    <MetricTile label="Scoring leader" value={Number.isFinite(pulse.scoring?.stats.pts) ? `${pulse.scoring.stats.pts.toFixed(1)} PPG` : '—'} detail={pulse.scoring?.name || 'No observed rows'} />
  </section>;
}