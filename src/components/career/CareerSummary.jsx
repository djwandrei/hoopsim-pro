import React from 'react';
import MetricTile from '@/components/studio/MetricTile';
export default function CareerSummary({ seasons }) {
  if (!seasons.length) return null;
  const games=seasons.reduce((total,row)=>total+row.games,0);
  const stints=seasons.reduce((total,row)=>total+row.rows.length,0);
  return <div className="grid gap-3 sm:grid-cols-3"><MetricTile label="Archive coverage" value={seasons.length} detail={`${seasons[0].label} → ${seasons.at(-1).label}`}/><MetricTile label="Recorded games" value={games.toLocaleString()} detail="Supplied regular-season exposure" tone="royal"/><MetricTile label="Team-season stints" value={stints} detail="Traded-player team rows stay visible" tone="positive"/></div>;
}