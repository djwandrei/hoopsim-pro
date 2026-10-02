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
  const fmtMonth = at => (at ? moment(at).format('MMMM YYYY').toUpperCase() : 'TBD');

  const focusPalette = paletteForTeam(focusCode);
  const chip = active => `min-h-8 rounded-lg px-3 text-[10px] font-bold tracking-[0.16em] transition-colors ${active ? 'myna-accent' : 'text-[var(--myna-muted)] hover:bg-[var(--myna-raised)]'}`;

  const outcomeOf = game => {
    const sim = game.sim;
    const actual = game.actual;
    if (sim) return { won: (sim.homePts > sim.awayPts ? game.home : game.away) === focusCode, from: 'REPLAY' };
    if (actual) return { won: (actual.home > actual.away ? game.home : game.away) === focusCode, from: 'ACTUAL' };
    return null;
  };
  const record = scope === 'team'
    ? filtered.reduce((acc, game) => { const outcome = outcomeOf(game); if (outcome) acc[outcome.won ? 'w' : 'l'] += 1; return acc; }, { w: 0, l: 0 })
    : null;

  return (
    <section className="myna-panel overflow-hidden" aria-label="Schedule">
      <header className="flex flex-wrap items-center justify-between gap-3 px-4 pb-3 pt-4">
        <div>
          <p className="myna-accent-text text-[10px] font-bold uppercase tracking-[0.22em]">Schedule</p>
          <h3 className="myna-display mt-0.5 text-2xl">{scope === 'team' ? `${league.byCode.get(focusCode)?.name.toUpperCase() || 'MY TEAM'} GAMES` : 'FULL LEAGUE SLATE'}</h3>
        </div>
        <div className="flex gap-1 rounded-xl border border-[var(--myna-border)] bg-[var(--myna-canvas)] p-1">
          <button type="button" aria-pressed={scope === 'team'} onClick={() => setScope('team')} className={chip(scope === 'team')}>MY TEAM</button>
          <button type="button" aria-pressed={scope === 'league'} onClick={() => setScope('league')} className={chip(scope === 'league')}>FULL SLATE</button>
        </div>
      </header>

      {record && (
        <div className="flex flex-wrap items-center gap-3 border-y border-[var(--myna-border)] bg-[var(--myna-canvas)] px-4 py-2 text-[10px] font-bold uppercase tracking-[0.16em]">
          <span className="myna-muted">Record in listed games</span>
          <span className="myna-mono rounded-md px-2 py-0.5" style={{ background: 'color-mix(in srgb, var(--myna-accent) 16%, transparent)', color: 'var(--myna-accent)' }}>{record.w}–{record.l}</span>
          <span className="myna-muted">Replay score in accent · actual score dimmed</span>
          <span className="ml-auto myna-muted">{filtered.length} games</span>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="myna-muted text-[10px] uppercase tracking-[0.14em]">
              <th className="px-4 py-2 text-left">Date</th>
              <th className="px-2 py-2 text-left">Matchup</th>
              <th className="px-2 py-2 text-right">Replay</th>
              <th className="px-2 py-2 text-right">Actual</th>
              <th className="px-2 py-2 text-center">OT</th>
              {scope === 'team' && <th className="px-4 py-2 text-right">Result</th>}
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-xs myna-muted">No games found for this scope.</td></tr>
            )}
            {visible.map((game, index) => {
              const sim = game.sim;
              const actual = game.actual;
              const simWinner = sim ? (sim.homePts > sim.awayPts ? game.home : game.away) : null;
              const actualWinner = actual ? (actual.home > actual.away ? game.home : game.away) : null;
              const outcome = scope === 'team' ? outcomeOf(game) : null;
              const monthKey = fmtMonth(game.at);
              const prevMonth = index > 0 ? fmtMonth(visible[index - 1].at) : null;
              const teamButton = (code, side) => (
                <button type="button" onClick={() => onFocusChange(code)} title={league.byCode.get(code)?.name} className={`flex min-h-8 items-center gap-1.5 rounded-md px-1 transition-colors hover:bg-[var(--myna-raised)] ${side === 'away' ? 'flex-row-reverse' : ''}`}>
                  <TeamMark code={code} name={league.byCode.get(code)?.name} className="h-6 w-6 rounded-md border border-[var(--myna-border)] bg-[var(--myna-canvas)]" />
                  <span className="myna-mono text-xs font-bold" style={{ color: code === (simWinner || actualWinner) ? paletteForTeam(code).primary : undefined }}>{code}</span>
                </button>
              );
              return (
                <React.Fragment key={`${game.at}-${game.away}-${game.home}-${index}`}>
                  {monthKey !== prevMonth && (
                    <tr key={`month-${index}`}>
                      <td colSpan={6} className="border-y border-[var(--myna-border)] bg-[var(--myna-raised)] px-4 py-1 text-[9px] font-bold uppercase tracking-[0.2em] myna-muted">{monthKey}</td>
                    </tr>
                  )}
                  <tr className="border-t border-[var(--myna-border)] transition-colors hover:bg-[var(--myna-raised)]">
                    <td className="myna-mono px-4 py-2 text-[11px] myna-muted">{fmtDate(game.at)}</td>
                    <td className="px-2 py-2">
                      <span className="flex min-w-0 items-center gap-1.5">
                        {teamButton(game.away, 'away')}
                        <span className="myna-muted text-[10px]">@</span>
                        {teamButton(game.home, 'home')}
                      </span>
                    </td>
                    <td className="myna-mono px-2 py-2 text-right font-semibold" style={{ color: sim ? 'var(--myna-accent)' : undefined }}>{sim ? `${sim.awayPts}–${sim.homePts}` : '—'}</td>
                    <td className="myna-mono px-2 py-2 text-right myna-muted">{actual ? `${actual.away}–${actual.home}` : '—'}</td>
                    <td className="px-2 py-2 text-center">{game.ot > 0 ? <span className="myna-mono rounded border border-[var(--myna-border)] px-1.5 py-0.5 text-[9px] font-bold">OT{game.ot > 1 ? game.ot : ''}</span> : <span className="myna-muted">·</span>}</td>
                    {scope === 'team' && (
                      <td className="px-4 py-2 text-right">
                        {outcome ? (
                          <span
                            className="inline-flex h-6 min-w-8 items-center justify-center rounded-md px-1.5 font-mono text-[10px] font-bold"
                            style={outcome.won
                              ? { background: focusPalette.primary, color: focusPalette.highlight }
                              : { border: '1px solid var(--myna-border)', color: 'var(--myna-muted)' }}
                          >
                            {outcome.won ? 'W' : 'L'}
                          </span>
                        ) : <span className="myna-muted">—</span>}
                      </td>
                    )}
                  </tr>
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {filtered.length > visible.length && (
        <button type="button" onClick={() => setPage(current => current + 1)} className="m-3 min-h-10 w-[calc(100%-1.5rem)] rounded-lg border border-[var(--myna-border)] text-[11px] font-bold tracking-[0.18em] transition-colors hover:bg-[var(--myna-raised)]">
          LOAD MORE ({filtered.length - visible.length} left)
        </button>
      )}
    </section>
  );
}