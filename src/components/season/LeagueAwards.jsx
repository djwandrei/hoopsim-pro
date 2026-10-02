import React, { useMemo } from 'react';
import { Trophy, Flame, Mountain, Zap } from 'lucide-react';
import { buildPlayerAverages } from '@/lib/season/playerAverages';
import TeamMark from '@/components/studio/TeamMark';

const AWARD_DEFS = [
  { id: 'mvp', label: 'Most Valuable Player', icon: Trophy, score: p => p.pts + p.reb * 0.8 + p.ast * 0.8, detail: p => `${p.pts.toFixed(1)} / ${p.reb.toFixed(1)} / ${p.ast.toFixed(1)}` },
  { id: 'pts', label: 'Scoring Champion', icon: Flame, score: p => p.pts, detail: p => `${p.pts.toFixed(1)} PPG` },
  { id: 'reb', label: 'Rebounding Champion', icon: Mountain, score: p => p.reb, detail: p => `${p.reb.toFixed(1)} RPG` },
  { id: 'ast', label: 'Assist Champion', icon: Zap, score: p => p.ast, detail: p => `${p.ast.toFixed(1)} APG` },
];

// Season awards: trophy cards with a team-colored crest bar, recalculated from every replay's simulated averages.
export default function LeagueAwards({ simGames }) {
  const ranked = useMemo(() => buildPlayerAverages(simGames), [simGames]);
  if (!ranked.length) return null;
  const awards = AWARD_DEFS.map(def => ({ ...def, winner: [...ranked].sort((a, b) => def.score(b) - def.score(a))[0] }));
  return (
    <section className="myna-panel overflow-hidden" aria-label="Season awards">
      <header className="flex flex-wrap items-baseline justify-between gap-2 px-4 pb-3 pt-4">
        <div>
          <p className="myna-accent-text text-[10px] font-bold uppercase tracking-[0.22em]">Hardware watch</p>
          <h3 className="myna-display mt-0.5 text-2xl">SEASON AWARDS</h3>
        </div>
        <p className="myna-muted text-[11px]">From simulated averages · recrowned every replay</p>
      </header>
      <div className="grid gap-px border-t border-[var(--myna-border)] bg-[var(--myna-border)] sm:grid-cols-2 xl:grid-cols-4">
        {awards.map(({ id, label, icon: Icon, winner, detail }) => (
          <div key={id} className="relative overflow-hidden bg-[var(--myna-surface)] p-4 transition-colors hover:bg-[var(--myna-raised)]">
            <span aria-hidden className="pointer-events-none absolute -right-2 -top-3 select-none opacity-[0.08]"><Icon className="h-20 w-20" /></span>
            <span aria-hidden className="absolute inset-x-0 top-0 h-0.5" style={{ background: 'linear-gradient(90deg, var(--myna-accent), transparent 85%)' }} />
            <div className="relative">
              <div className="mx-auto mb-2.5 flex h-10 w-10 items-center justify-center rounded-full border" style={{ borderColor: 'color-mix(in srgb, var(--myna-accent) 60%, transparent)', background: 'color-mix(in srgb, var(--myna-accent) 14%, transparent)', color: 'var(--myna-accent)' }}>
                <Icon className="h-4.5 w-4.5" />
              </div>
              <p className="text-center text-[9px] font-bold uppercase tracking-[0.2em]" style={{ color: 'var(--myna-accent)' }}>{label}</p>
              <div className="mt-1.5 flex items-center justify-center gap-2">
                <TeamMark code={winner.team} className="h-8 w-8" />
                <p className="myna-display text-xl leading-tight">{winner.name}</p>
              </div>
              <p className="mt-0.5 text-center text-[11px] myna-muted">
                <span className="myna-mono rounded border border-[var(--myna-border)] px-1">{winner.team}</span> · {winner.gp} GP
              </p>
              <p className="myna-mono mt-2 text-center text-xs font-semibold">{detail(winner)}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}