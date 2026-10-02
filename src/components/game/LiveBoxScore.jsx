import React, { useMemo } from 'react';
import TeamMark from '@/components/studio/TeamMark';
import { useCourtTheme } from '@/components/djhc/CourtThemeProvider';
import { teamThemeVars } from '@/components/game/matchupTheme';

const cell = 'px-2 py-1 text-right';

function TeamLiveTable({ code, lines, mode }) {
  const totals = lines.reduce((acc, line) => ({ pts: acc.pts + line.pts, reb: acc.reb + line.reb, ast: acc.ast + line.ast, stl: acc.stl + line.stl, to: acc.to + line.to }), { pts: 0, reb: 0, ast: 0, stl: 0, to: 0 });
  return (
    <section className="myna-panel p-3" data-team-theme={code} style={teamThemeVars(code, mode)} aria-label={`Live box score for ${code}`}>
      <div className="flex items-center justify-between">
        <p className="myna-display flex items-center gap-2 text-lg"><TeamMark code={code} name={code} className="h-7 w-7" />{code}</p>
        <p className="myna-mono text-xs myna-muted">{totals.pts} PTS</p>
      </div>
      <table className="mt-1 w-full text-xs">
        <thead>
          <tr className="myna-muted text-[10px] uppercase tracking-[0.12em]">
            <th className="px-2 py-1 text-left">PLAYER</th>
            <th className={cell}>PTS</th><th className={cell}>REB</th><th className={cell}>AST</th><th className={cell}>STL</th><th className={cell}>TO</th>
          </tr>
        </thead>
        <tbody>
          {lines.map(line => (
            <tr key={line.name} className="border-t border-[var(--myna-border)]">
              <td className="px-2 py-1 text-left font-medium">{line.name}</td>
              <td className={`${cell} myna-mono font-semibold`} style={line.pts >= 10 ? { color: 'var(--team-ink)' } : undefined}>{line.pts}</td>
              <td className={`${cell} myna-mono`}>{line.reb}</td>
              <td className={`${cell} myna-mono`}>{line.ast}</td>
              <td className={`${cell} myna-mono`}>{line.stl}</td>
              <td className={`${cell} myna-mono myna-muted`}>{line.to}</td>
            </tr>
          ))}
          {lines.length === 0 && <tr><td colSpan={6} className="px-2 py-2 text-xs myna-muted">Waiting for the first stat…</td></tr>}
        </tbody>
        {lines.length > 0 && (
          <tfoot>
            <tr className="myna-mono border-t-2 border-[var(--myna-border)] font-bold">
              <td className="px-2 py-1 text-left text-[10px] uppercase tracking-[0.15em]">Totals</td>
              <td className={cell}>{totals.pts}</td><td className={cell}>{totals.reb}</td><td className={cell}>{totals.ast}</td><td className={cell}>{totals.stl}</td><td className={cell}>{totals.to}</td>
            </tr>
          </tfoot>
        )}
      </table>
    </section>
  );
}

// Player stats accumulating live with the play-by-play feed, built from the
// structured stat fields the sim engine attaches to each event.
export default function LiveBoxScore({ events, count, home, away }) {
  const { mode = 'dark' } = useCourtTheme() || {};
  const box = useMemo(() => {
    const homeMap = new Map(); const awayMap = new Map();
    const row = (map, name) => { let line = map.get(name); if (!line) { line = { pts: 0, reb: 0, ast: 0, stl: 0, to: 0 }; map.set(name, line); } return line; };
    events.slice(0, count).forEach(event => {
      if (!event.stat || !event.side) return;
      const map = event.side === 'home' ? homeMap : awayMap;
      const stat = event.stat;
      if (stat.scorer) row(map, stat.scorer).pts += event.pts;
      if (stat.assist) row(map, stat.assist).ast += 1;
      if (stat.rebound) row(map, stat.rebound).reb += 1;
      if (stat.turnover) row(map, stat.turnover).to += 1;
      if (stat.steal) row(map, stat.steal).stl += 1;
    });
    const lines = map => [...map.entries()]
      .map(([name, stats]) => ({ name, ...stats }))
      .filter(line => line.pts || line.reb || line.ast || line.stl || line.to)
      .sort((x, y) => y.pts - x.pts || y.reb - x.reb || y.ast - x.ast);
    return { homeLines: lines(homeMap), awayLines: lines(awayMap) };
  }, [events, count]);
  return (
    <section className="space-y-2" aria-label="Live box scores">
      <p className="myna-accent-text text-[10px] font-semibold uppercase tracking-[0.2em]">LIVE BOX SCORE</p>
      <div className="grid gap-4 lg:grid-cols-2">
        <TeamLiveTable code={away.code} lines={box.awayLines} mode={mode} />
        <TeamLiveTable code={home.code} lines={box.homeLines} mode={mode} />
      </div>
    </section>
  );
}