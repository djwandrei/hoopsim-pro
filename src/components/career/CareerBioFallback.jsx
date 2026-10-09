import React from 'react';
import { Archive } from 'lucide-react';

// Graceful fallback when the archive holds no biography or award record for a
// player: say so plainly, then summarize what the recorded seasons DO show.
export default function CareerBioFallback({ seasons }) {
  const games = seasons.reduce((sum, row) => sum + row.games, 0);
  const teams = [...new Set(seasons.flatMap((row) => row.teams))];
  const average = key => {
    const supplied = seasons.filter(row => Number.isFinite(row[key]) && row.games > 0);
    const exposure = supplied.reduce((sum, row) => sum + row.games, 0);
    return exposure ? supplied.reduce((sum, row) => sum + row[key] * row.games, 0) / exposure : null;
  };
  const perGame = value => Number.isFinite(value) ? value.toFixed(1) : '—';
  const tiles = [['Recorded seasons', seasons.length], ['Team stints', teams.join(' · ') || '—'], ['Games observed', games.toLocaleString()], ['Career PPG', perGame(average('pts'))], ['Career RPG', perGame(average('reb'))], ['Career APG', perGame(average('ast'))]];
  return <div className="mt-4 space-y-3">
    <p className="flex items-start gap-2 rounded-xl border border-royal/40 bg-royal/10 p-3 text-xs leading-relaxed text-foreground"><Archive className="mt-0.5 h-4 w-4 shrink-0 text-royal" aria-hidden="true" />The archive has no biography or award record for this player yet — here's what the recorded seasons show.</p>
    <dl className="grid gap-2 sm:grid-cols-3">
      {tiles.map(([label, value]) => (
        <div key={label} className="rounded-xl border border-border/25 bg-canvas/35 px-3 py-2.5">
          <dt className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{label}</dt>
          <dd className="mt-1 break-words font-mono text-sm text-foreground">{value}</dd>
        </div>
      ))}
    </dl>
    <p className="text-[10px] text-muted-foreground">Career rates use only seasons where the source supplied that metric.</p>
  </div>;
}
