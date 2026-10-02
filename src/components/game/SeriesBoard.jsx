import React from 'react';
import { Trophy } from 'lucide-react';
import TeamMark from '@/components/studio/TeamMark';

export default function SeriesBoard({ league, series }) {
  const winnerCode = series.homeWins === 4 ? series.home : series.away;
  const winner = league.byCode.get(winnerCode);
  return (
    <section className="myna-panel overflow-hidden" aria-label="Series result">
      <div className="broadcast-in-l flex flex-wrap items-center justify-between gap-4 p-5" style={{ background: 'linear-gradient(115deg, hsl(var(--court-accent) / 0.22), transparent 70%)' }}>
        <div className="flex min-w-0 items-center gap-4">
          <TeamMark code={winnerCode} name={winner?.name} className="h-16 w-16 rounded-2xl border border-[var(--myna-border)] bg-[var(--myna-raised)]" />
          <div className="min-w-0">
            <p className="myna-accent-text flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.2em]"><Trophy className="h-3.5 w-3.5" />SERIES RESULT</p>
            <h3 className="myna-display mt-1 text-2xl sm:text-3xl">{winner?.name.toUpperCase() || winnerCode} WIN THE SERIES</h3>
            <p className="myna-muted mt-1 text-[10px] tracking-[0.2em]">2-2-1-1-1 FORMAT · CLINCHED IN GAME {series.games.length}</p>
          </div>
        </div>
        <div className="myna-mono text-right text-4xl">
          <span className={series.homeWins === 4 ? 'text-[var(--myna-accent)]' : ''}>{series.homeWins}</span>
          <span className="myna-muted text-xl">–</span>
          <span className={series.awayWins === 4 ? 'text-[var(--myna-accent)]' : ''}>{series.awayWins}</span>
        </div>
      </div>
      <ol className="grid gap-2 border-t border-[var(--myna-border)] p-4 sm:grid-cols-2 lg:grid-cols-3">
        {series.games.map(item => {
          const hostWon = item.hostPts > item.visitorPts;
          return (
            <li key={item.game} className="broadcast-in-r flex items-center gap-3 rounded-lg border border-[var(--myna-border)] bg-[var(--myna-canvas)] px-3 py-2" style={{ animationDelay: `${item.game * 70}ms` }}>
              <span className="myna-mono myna-muted text-[11px]">G{item.game}</span>
              <span className="myna-mono min-w-0 flex-1 text-xs">
                {item.visitor} <span className={hostWon ? 'myna-muted' : 'font-bold text-[var(--myna-accent)]'}>{item.visitorPts}</span>
                {' @ '}
                {item.host} <span className={hostWon ? 'font-bold text-[var(--myna-accent)]' : 'myna-muted'}>{item.hostPts}</span>
              </span>
              {item.ot > 0 && <span className="myna-muted text-[10px] font-semibold">OT{item.ot > 1 ? item.ot : ''}</span>}
              <span className="myna-mono shrink-0 rounded-md bg-gold/10 px-1.5 py-0.5 text-[10px] text-gold">+{Math.abs(item.hostPts - item.visitorPts)}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}