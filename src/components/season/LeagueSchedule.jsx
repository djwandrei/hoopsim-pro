import React, { useEffect, useState } from 'react';
import moment from 'moment';
import TeamMark from '@/components/studio/TeamMark';
import { paletteForTeam } from '@/components/djhc/basketballPalettes';

const PAGE = 12;

export default function LeagueSchedule({ league, schedule, simGames, focusCode, onFocusChange }) {
  const [scope, setScope] = useState('team');
  const [page, setPage] = useState(0);
  useEffect(() => { setPage(0); }, [scope, focusCode]);
  const rows = schedule.map((game, index) => ({ ...game, sim: simGames?.[index] ?? null }));
  const filtered = scope === 'team'
    ? rows.filter(game => game.home === focusCode || game.away === focusCode)
    : rows;
  const visible = filtered.slice(0, (page + 1) * PAGE);
  const fmtDate = at => (at ? moment(at).format('MMM D') : 'TBD');
  const chip = active => `min-h-8 rounded-lg px-3 text-[10px] font-semibold tracking-[0.15em] transition-colors ${active ? 'myna-accent' : 'text-[var(--myna-muted)] hover:bg-[var(--myna-raised)]'}`;
  return (
    <section className="myna-panel p-4" aria-label="Schedule">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="myna-accent-text text-[10px] font-semibold uppercase tracking-[0.2em]">SCHEDULE</p>
          <h3 className="myna-display mt-1 text-2xl">{scope === 'team' ? `${league.byCode.get(focusCode)?.name.toUpperCase() || 'MY TEAM'} GAMES` : 'FULL LEAGUE SLATE'}</h3>
        </div>
        <div className="flex gap-1 rounded-xl border border-[var(--myna-border)] bg-[var(--myna-canvas)] p-1">
          <button type="button" aria-pressed={scope === 'team'} onClick={() => setScope('team')} className={chip(scope === 'team')}>MY TEAM</button>
          <button type="button" aria-pressed={scope === 'league'} onClick={() => setScope('league')} className={chip(scope === 'league')}>FULL SLATE</button>
        </div>
      </div>
      {scope === 'team' && (
        <p className="mt-2 text-[11px] myna-muted">
          Sim score in accent color · actual score dimmed · tap a team code to switch focus.
        </p>
      )}
      <ol className="mt-3 space-y-1.5">
        {visible.length === 0 && <li className="text-xs myna-muted">No games found for this scope.</li>}
        {visible.map((game, index) => {
          const sim = game.sim;
          const actual = game.actual;
          const simWinner = sim ? (sim.homePts > sim.awayPts ? game.home : game.away) : null;
          const focusWon = simWinner === focusCode || (actual && (actual.home > actual.away ? game.home : game.away) === focusCode);
          const palette = paletteForTeam(focusCode);
          const badge = scope === 'team' && (sim || actual) ? (
            <span
              className="inline-flex h-6 w-6 items-center justify-center rounded-md font-mono text-[10px] font-bold"
              style={focusWon
                ? { background: palette.primary, color: palette.highlight }
                : { border: '1px solid var(--myna-border)', color: 'var(--myna-muted)' }}
            >
              {focusWon ? 'W' : 'L'}
            </span>
          ) : null;
          const teamButton = (code, side) => (
            <button type="button" onClick={() => onFocusChange(code)} title={league.byCode.get(code)?.name} className={`flex min-h-8 items-center gap-1.5 rounded-md px-1 transition-colors hover:bg-[var(--myna-raised)] ${side === 'away' ? 'flex-row-reverse' : ''}`}>
              <TeamMark code={code} name={league.byCode.get(code)?.name} className="h-6 w-6 rounded-md border border-[var(--myna-border)] bg-[var(--myna-canvas)]" />
              <span className={`myna-mono text-xs ${code === simWinner ? 'text-[var(--myna-accent)] font-bold' : ''}`}>{code}</span>
            </button>
          );
          return (
            <li key={`${game.at}-${game.away}-${game.home}-${index}`} className="flex items-center gap-2 rounded-lg border border-[var(--myna-border)] bg-[var(--myna-canvas)] px-3 py-2">
              <span className="myna-mono w-14 shrink-0 text-[11px] myna-muted">{fmtDate(game.at)}</span>
              <span className="flex min-w-0 items-center gap-1.5">{teamButton(game.away, 'away')}<span className="myna-muted text-[10px]">@</span>{teamButton(game.home, 'home')}</span>
              <span className="ml-auto flex items-center gap-3">
                {sim && <span className="myna-mono text-xs text-[var(--myna-accent)]">{sim.awayPts}–{sim.homePts}</span>}
                {actual && <span className="myna-mono text-[11px] myna-muted">{actual.away}–{actual.home}</span>}
                {game.ot > 0 && <span className="myna-muted text-[10px] font-semibold">OT{game.ot > 1 ? game.ot : ''}</span>}
                {badge}
              </span>
            </li>
          );
        })}
      </ol>
      {filtered.length > visible.length && (
        <button type="button" onClick={() => setPage(current => current + 1)} className="mt-3 min-h-10 w-full rounded-lg border border-[var(--myna-border)] text-[11px] font-semibold tracking-[0.15em] transition-colors hover:bg-[var(--myna-raised)]">
          LOAD MORE ({filtered.length - visible.length} left)
        </button>
      )}
    </section>
  );
}