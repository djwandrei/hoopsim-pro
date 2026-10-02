import React from 'react';
import { Database, CircleDot, Shuffle, Target, Dumbbell, Zap } from 'lucide-react';
import CareerStatTile from '@/components/career/CareerStatTile';

export default function CareerSummary({ seasons }) {
  if (!seasons.length) return null;
  const games = seasons.reduce((total, row) => total + row.games, 0);
  const stints = seasons.reduce((total, row) => total + row.rows.length, 0);
  const teams = new Set(seasons.flatMap(row => row.teams)).size;
  const average = key => {
    const usable = seasons.filter(row => Number.isFinite(row[key]));
    const exposure = usable.reduce((sum, row) => sum + row.games, 0);
    return exposure ? usable.reduce((sum, row) => sum + row[key] * row.games, 0) / exposure : null;
  };
  const trend = key => {
    const usable = seasons.filter(row => Number.isFinite(row[key]));
    if (usable.length < 2) return null;
    const delta = usable.at(-1)[key] - usable[0][key];
    return Math.abs(delta) < 0.05 ? 0 : delta;
  };
  const text = value => Number.isFinite(value) ? value.toFixed(1) : '—';
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <CareerStatTile icon={Database} label="Archive coverage" value={seasons.length} detail={`${seasons[0].label} → ${seasons.at(-1).label}`} />
      <CareerStatTile icon={CircleDot} label="Recorded games" value={games.toLocaleString()} detail="Supplied regular-season exposure" tone="royal" />
      <CareerStatTile icon={Shuffle} label="Teams played" value={teams} detail={`${stints} team-season stints stay visible`} tone="positive" />
      <CareerStatTile icon={Target} label="Career PPG" value={text(average('pts'))} detail="Games-weighted observed average" trend={trend('pts')} />
      <CareerStatTile icon={Dumbbell} label="Career RPG" value={text(average('reb'))} detail="Games-weighted observed average" tone="royal" trend={trend('reb')} />
      <CareerStatTile icon={Zap} label="Career APG" value={text(average('ast'))} detail="Games-weighted observed average" tone="positive" trend={trend('ast')} />
    </div>
  );
}