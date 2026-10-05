import React from 'react';
import { statText } from '@/components/players/blueprintModel';

const COLUMNS = [['gp', 'GP'], ['mpg', 'MPG'], ['pts', 'PPG'], ['reb', 'RPG'], ['ast', 'APG'], ['fg', 'FG%'], ['three', '3P%'], ['ft', 'FT%']];

// Selected-season stats table for the Lineup Lab pool dossier: a single row
// for exactly the season chosen in the lineup optimizer, formatted like the
// blueprint's year-by-year table but scoped to that one year.
export default function LineupSeasonRecord({ player, year, teamCode, status }) {
  if (status === 'loading') return <p className="mt-3 text-xs text-muted-foreground">Loading season statistics…</p>;
  const season = year ? `${year}–${String(year + 1).slice(-2)}` : null;
  return <div className="mt-3 overflow-x-auto rounded-xl border border-border/25">
    <table className="w-full">
      <thead><tr>
        <th className="text-left">Season</th>
        <th className="text-left">Team</th>
        {COLUMNS.map(([, label]) => <th key={label} className="text-right">{label}</th>)}
      </tr></thead>
      <tbody>
        <tr>
          <td className="text-xs font-semibold text-foreground">{season || '—'}</td>
          <td className="text-xs text-muted-foreground">{teamCode || '—'}</td>
          {COLUMNS.map(([key, label]) => <td key={key} className={`text-right font-mono text-[11px] tabular-nums ${key === 'pts' ? 'text-gold' : 'text-foreground'}`}>{statText(key, player.stats[key])}</td>)}
        </tr>
      </tbody>
    </table>
  </div>;
}