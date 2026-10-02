import React from 'react';
import { Trophy } from 'lucide-react';
import TeamMark from '@/components/studio/TeamMark';
import { useCourtTheme } from '@/components/djhc/CourtThemeProvider';
import { matchupThemeVars, teamThemeVars } from '@/components/game/matchupTheme';

export default function SeriesBoard({ league, series }) {
  const winnerCode = series.homeWins === 4 ? series.home : series.away;
  const winner = league.byCode.get(winnerCode);
  const { mode = 'dark' } = useCourtTheme() || {};
  return (
    <section className="myna-panel overflow-hidden" data-team-theme={winnerCode} style={{ ...matchupThemeVars(series.home, series.away, mode), ...teamThemeVars(winnerCode, mode) }} aria-label="Series result">
      <div className="broadcast-in-l flex flex-wrap items-center justify-between gap-4 p-5">
        <div className="flex min-w-0 items-center gap-4">
          <TeamMark code={winnerCode} name={winner?.name} className="h-20 w-20" />
          <div className="min-w-0">
            <p className="myna-accent-text flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.2em]"><Trophy className="h-3.5 w-3.5" />SERIES RESULT</p>
            <h3 className="myna-display mt-1 text-2xl sm:text-3xl">{winner?.name.toUpperCase() || winnerCode} WIN THE SERIES</h3>
            <p className="myna-muted mt-1 text-[10px] tracking-[0.2em]">2-2-1-1-1 FORMAT · CLINCHED IN GAME {series.games.length}</p>
          </div>
        </div>
        <div className="myna-mono text-right text-4xl">
          <span style={{ color: 'var(--matchup-home-color)' }}>{series.homeWins}</span>
          <span className="myna-muted text-xl">–</span>
          <span style={{ color: 'var(--matchup-away-color)' }}>{series.awayWins}</span>
        </div>
      </div>
      <ol className="grid gap-2 border-t border-[var(--myna-border)] p-4 sm:grid-cols-2 lg:grid-cols-3">
        {series.games.map(item => {
          const hostWon = item.hostPts > item.visitorPts;
          return (
            <li key={item.game} data-team-theme={hostWon ? item.host : item.visitor} className="broadcast-in-r flex items-center gap-3 rounded-lg border px-3 py-2" style={{ ...teamThemeVars(hostWon ? item.host : item.visitor, mode), animationDelay: `${item.game * 70}ms` }}>
              <span className="myna-mono myna-muted text-[11px]">G{item.game}</span>
              <span className="myna-mono min-w-0 flex-1 text-xs">
                {item.visitor} <span data-team-side={item.visitor === series.home ? 'home' : 'away'} className={hostWon ? 'myna-muted' : 'font-bold matchup-side-text'}>{item.visitorPts}</span>
                {' @ '}
                {item.host} <span data-team-side={item.host === series.home ? 'home' : 'away'} className={hostWon ? 'font-bold matchup-side-text' : 'myna-muted'}>{item.hostPts}</span>
              </span>
              {item.ot > 0 && <span className="myna-muted text-[10px] font-semibold">OT{item.ot > 1 ? item.ot : ''}</span>}
              <span className="myna-mono shrink-0 rounded-md px-1.5 py-0.5 text-[10px]" style={{ background: 'color-mix(in srgb, var(--team-primary) 20%, transparent)', color: 'var(--team-ink)' }}>+{Math.abs(item.hostPts - item.visitorPts)}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}