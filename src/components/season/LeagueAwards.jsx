import React, { useMemo } from 'react';
import { Trophy, Flame, Mountain, Zap } from 'lucide-react';
import { buildPlayerAverages } from '@/lib/season/playerAverages';

const AWARD_DEFS = [
  { id: 'mvp', label: 'Most Valuable Player', icon: Trophy, score: p => p.pts + p.reb * 0.8 + p.ast * 0.8, detail: p => `${p.pts.toFixed(1)} / ${p.reb.toFixed(1)} / ${p.ast.toFixed(1)}` },
  { id: 'pts', label: 'Scoring Champion', icon: Flame, score: p => p.pts, detail: p => `${p.pts.toFixed(1)} PPG` },
  { id: 'reb', label: 'Rebounding Champion', icon: Mountain, score: p => p.reb, detail: p => `${p.reb.toFixed(1)} RPG` },
  { id: 'ast', label: 'Assist Champion', icon: Zap, score: p => p.ast, detail: p => `${p.ast.toFixed(1)} APG` },
];

// Season awards: gold-trimmed trophies recalculated from every replay's simulated averages.
export default function LeagueAwards({ simGames }) {
  const ranked = useMemo(() => buildPlayerAverages(simGames), [simGames]);
  if (!ranked.length) return null;
  const awards = AWARD_DEFS.map(def => ({ ...def, winner: [...ranked].sort((a, b) => def.score(b) - def.score(a))[0] }));
  return (
    <section className="myna-panel p-4" aria-label="Season awards">
      <header className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="myna-display text-lg">Season Awards</h3>
        <p className="myna-muted text-[11px]">From simulated averages · recrowned every replay</p>
      </header>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {awards.map(({ id, label, icon: Icon, winner, detail }) => (
          <div key={id} className="rounded-xl border border-[var(--myna-border)] bg-[var(--myna-canvas)] p-4 text-center">
            <div className="mx-auto mb-2 flex h-9 w-9 items-center justify-center rounded-full" style={{ background: 'hsl(var(--court-accent))', color: 'hsl(var(--court-canvas))' }}>
              <Icon className="h-4 w-4" />
            </div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em]" style={{ color: 'hsl(var(--court-accent))' }}>{label}</p>
            <p className="myna-display mt-1 text-xl leading-tight">{winner.name}</p>
            <p className="myna-muted text-[11px]">{winner.team} · {winner.gp} GP</p>
            <p className="myna-mono mt-1 text-xs">{detail(winner)}</p>
          </div>
        ))}
      </div>
    </section>
  );
}