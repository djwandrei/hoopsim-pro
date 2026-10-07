import React from 'react';
import TeamMark from '@/components/studio/TeamMark';
import { useCourtTheme } from '@/components/djhc/CourtThemeProvider';
import { teamThemeVars } from '@/components/game/matchupTheme';

// Count-up for the final score digits: the result lands with a rising tally.
function useCountUp(target, duration = 900) {
  const [value, setValue] = React.useState(0);
  React.useEffect(() => {
    let raf;
    const start = performance.now();
    const tick = now => {
      const t = Math.min(1, (now - start) / duration);
      setValue(Math.round(target * (1 - (1 - t) ** 3)));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return value;
}

function Half({ team, pts, won, label, side }) {
  const { mode = 'dark' } = useCourtTheme() || {};
  const shown = useCountUp(pts);
  return (
    <div data-team-theme={team.code} className={`relative overflow-hidden p-5 text-center ${won ? 'winner-glow shine-sweep ' : ''}${side === 'away' ? 'broadcast-in-l' : 'broadcast-in-r'}`} style={{ ...teamThemeVars(team.code, mode), background: won ? 'color-mix(in srgb, var(--team-primary) 9%, transparent)' : undefined }}>
      {won && <span className="myna-mono absolute right-3 top-3 rounded-full border px-2 py-0.5 text-[9px] tracking-[0.18em]" style={{ borderColor: 'var(--team-primary)', color: 'var(--team-ink)' }}>WINNER</span>}
      <TeamMark code={team.code} name={team.name} className="mx-auto h-16 w-16" />
      <p className="myna-display mt-2 text-lg" style={{ color: won ? 'var(--myna-accent)' : 'var(--myna-text)' }}>{team.code}<span className="myna-muted text-[10px] tracking-[0.2em]"> · {label}</span></p>
      <p className="myna-mono mt-1 text-5xl font-semibold" style={{ color: won ? 'var(--myna-accent)' : 'var(--myna-muted)' }}>{shown}</p>
    </div>
  );
}

export default function GameScoreboard({ league, game }) {
  const { mode = 'dark' } = useCourtTheme() || {};
  const home = league.byCode.get(game.home);
  const away = league.byCode.get(game.away);
  if (!home || !away) return null;
  const homeWon = game.homePts > game.awayPts;
  const winnerCode = homeWon ? home.code : away.code;
  const margin = Math.abs(game.homePts - game.awayPts);
  // Quarter-by-quarter line score, derived from the play-by-play score trail.
  const lineScore = [];
  let prev = [0, 0];
  const seenQuarters = new Set();
  for (const event of game.pbp || []) {
    // The native report appends a final row that repeats the last period's
    // label (Q4 on a regulation game): skip repeats so the line score shows
    // one column per period, keeping the final row's OT delta when needed.
    if ((event.type === 'period' || event.type === 'final') && event.score && !seenQuarters.has(event.q)) {
      seenQuarters.add(event.q);
      lineScore.push({ q: event.q, a: event.score[1] - prev[1], h: event.score[0] - prev[0] });
      prev = event.score;
    }
  }
  const maxAway = Math.max(...lineScore.map(row => row.a), 0);
  const maxHome = Math.max(...lineScore.map(row => row.h), 0);
  return (
    <section key={`${game.home}-${game.away}-${game.homePts}-${game.awayPts}`} className="myna-panel overflow-hidden" aria-label="Game scoreboard">
      <div className="grid grid-cols-2 border-b border-[var(--myna-border)]">
        <Half team={away} pts={game.awayPts} won={!homeWon} label="AWAY" side="away" />
        <Half team={home} pts={game.homePts} won={homeWon} label="HOME" side="home" />
      </div>
      {lineScore.length > 0 && (
        <div className="overflow-x-auto border-b border-[var(--myna-border)] px-3 py-2">
          <table className="w-full min-w-80 text-center text-xs">
            <thead>
              <tr className="myna-muted text-[9px] uppercase tracking-[0.15em]">
                <th className="px-2 py-1 text-left">TEAM</th>
                {lineScore.map(row => <th key={row.q} className="px-2 py-1">{row.q}</th>)}
                <th className="px-2 py-1">T</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-[var(--myna-border)]">
                <td className="px-2 py-1.5 text-left font-semibold">{away.code}</td>
                {lineScore.map(row => <td key={row.q} className={`myna-mono px-2 py-1.5 ${row.a === maxAway && maxAway > 0 ? 'font-bold' : ''}`} style={row.a === maxAway && maxAway > 0 ? { color: 'var(--matchup-away-color)' } : undefined}>{row.a}</td>)}
                <td className="myna-mono px-2 py-1.5 font-bold" style={{ color: 'var(--matchup-away-color)' }}>{game.awayPts}</td>
              </tr>
              <tr className="border-t border-[var(--myna-border)]">
                <td className="px-2 py-1.5 text-left font-semibold">{home.code}</td>
                {lineScore.map(row => <td key={row.q} className={`myna-mono px-2 py-1.5 ${row.h === maxHome && maxHome > 0 ? 'font-bold' : ''}`} style={row.h === maxHome && maxHome > 0 ? { color: 'var(--matchup-home-color)' } : undefined}>{row.h}</td>)}
                <td className="myna-mono px-2 py-1.5 font-bold" style={{ color: 'var(--matchup-home-color)' }}>{game.homePts}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-center gap-2 p-3 text-[11px] myna-muted">
        <span className="bcast-lowerthird"><span className="bcast-lowerthird__bar" aria-hidden="true"></span>{game.ot ? (game.ot === 1 ? 'FINAL · OT' : `FINAL · ${game.ot}OT`) : 'FINAL'}</span>
        <span className="myna-mono rounded-md border px-2 py-0.5" data-team-theme={winnerCode} style={{ ...teamThemeVars(winnerCode, mode), color: 'var(--team-ink)' }}>{winnerCode} WIN BY {margin}{margin <= 3 ? ' · DOWN TO THE WIRE' : ''}{margin >= 20 ? ' · BLOWOUT' : ''}</span>
        <span className="myna-mono rounded-md border border-[var(--myna-border)] px-2 py-0.5">POSS {Math.round(game.poss)}</span>
        <span className="myna-mono rounded-md border border-[var(--myna-border)] px-2 py-0.5">ORTG {away.code} {game.ortgA.toFixed(1)} · {home.code} {game.ortgH.toFixed(1)}</span>
      </div>
    </section>
  );
}