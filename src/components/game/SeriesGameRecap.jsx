import React from 'react';
import { X } from 'lucide-react';
import { useCourtTheme } from '@/components/djhc/CourtThemeProvider';
import { matchupThemeVars } from '@/components/game/matchupTheme';

// Per-game drill-down from the series board: the native engine's period
// timeline for that game, plus the final and any overtime note.
export default function SeriesGameRecap({ series, game, onClose }) {
  const { mode = 'dark' } = useCourtTheme() || {};
  if (!series || !game) return null;
  const homePts = game.host === series.home ? game.hostPts : game.visitorPts;
  const awayPts = game.host === series.away ? game.hostPts : game.visitorPts;
  const clincher = game.game === series.games.length;
  return (
    <section className="myna-panel p-4" data-team-theme={homePts > awayPts ? series.home : series.away} style={matchupThemeVars(series.home, series.away, mode)} aria-label={`Game ${game.game} recap`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="myna-accent-text text-[10px] font-semibold uppercase tracking-[0.2em]">Game {game.game} recap{clincher && ' · clincher'}</p>
        <div className="flex items-center gap-3">
          {game.ot > 0 && <span className="myna-mono rounded-md border border-[var(--myna-border)] px-1.5 py-0.5 text-[10px] myna-muted">OT{game.ot > 1 ? game.ot : ''}</span>}
          <button type="button" onClick={onClose} aria-label="Close the game recap" className="flex min-h-9 min-w-9 items-center justify-center rounded-lg border border-[var(--myna-border)] text-[var(--myna-muted)] transition-colors hover:text-[var(--myna-accent)]"><X className="h-4 w-4" /></button>
        </div>
      </div>
      <div className="myna-mono mt-2 flex items-center gap-3 text-3xl">
        <span style={{ color: 'var(--matchup-away-color)' }}>{series.away} {awayPts}</span>
        <span className="myna-muted text-lg">@</span>
        <span style={{ color: 'var(--matchup-home-color)' }}>{series.home} {homePts}</span>
      </div>
      {game.timeline?.length ? (
        <table className="myna-mono mt-3 w-full text-xs">
          <caption className="text-left text-[10px] uppercase tracking-[0.2em] myna-muted">Score by period</caption>
          <thead><tr><th className="text-left">Period</th><th style={{ color: 'var(--matchup-away-color)' }}>{series.away}</th><th style={{ color: 'var(--matchup-home-color)' }}>{series.home}</th></tr></thead>
          <tbody>
            {game.timeline.map(row => (
              <tr key={row.period}><td className="py-1 text-left myna-muted">{row.period}</td><td className="py-1" style={{ color: 'var(--matchup-away-color)' }}>{row.b}</td><td className="py-1" style={{ color: 'var(--matchup-home-color)' }}>{row.a}</td></tr>
            ))}
            <tr><td className="border-t border-[var(--myna-border)] py-1 font-bold text-left">FINAL</td><td className="border-t border-[var(--myna-border)] py-1 font-bold" style={{ color: 'var(--matchup-away-color)' }}>{awayPts}</td><td className="border-t border-[var(--myna-border)] py-1 font-bold" style={{ color: 'var(--matchup-home-color)' }}>{homePts}</td></tr>
          </tbody>
        </table>
      ) : <p className="mt-3 text-[11px] myna-muted">The engine report for this series predates per-game timelines — only the final is available.</p>}
    </section>
  );
}