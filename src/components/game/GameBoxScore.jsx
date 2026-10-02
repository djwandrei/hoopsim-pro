import React, { useEffect, useState } from 'react';
import TeamMark from '@/components/studio/TeamMark';

import { useCourtTheme } from '@/components/djhc/CourtThemeProvider';
import { teamThemeVars } from '@/components/game/matchupTheme';

const cell = 'px-2 py-1.5 text-right';

export default function GameBoxScore({ game }) {
  const [side, setSide] = useState('home');
  useEffect(() => { setSide('home'); }, [game]);
  const team = side === 'home' ? game.home : game.away;
  const { mode = 'dark' } = useCourtTheme() || {};
  const lines = (side === 'home' ? game.boxHome : game.boxAway)?.lines || [];
  const [sort, setSort] = useState({ key: 'pts', dir: 'desc' });
  useEffect(() => { setSort({ key: 'pts', dir: 'desc' }); }, [game]);
  const numeric = key => Number(key) || 0;
  const sortedLines = lines.slice().sort((x, y) => sort.dir === 'desc'
    ? numeric(y[sort.key]) - numeric(x[sort.key])
    : numeric(x[sort.key]) - numeric(y[sort.key]));
  const totals = lines.reduce((acc, line) => ({ min: acc.min + line.min, pts: acc.pts + line.pts, reb: acc.reb + line.reb, ast: acc.ast + line.ast, stl: acc.stl + line.stl, blk: acc.blk + line.blk }), { min: 0, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0 });
  const maxPts = Math.max(1, ...lines.map(line => line.pts || 0));
  const sortHead = (key, label) => (
    <th className="px-2 py-1 text-right">
      <button type="button" onClick={() => setSort(current => ({ key, dir: current.key === key && current.dir === 'desc' ? 'asc' : 'desc' }))} className="transition-colors hover:text-[var(--myna-accent)]">{label}{sort.key === key ? (sort.dir === 'desc' ? ' ▾' : ' ▴') : ''}</button>
    </th>
  );
  return (
    <section key={`${game.home}-${game.away}-${game.homePts}-${game.awayPts}`} className="myna-panel p-4" data-team-theme={team} style={teamThemeVars(team, mode)} aria-label="Box score">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="myna-accent-text text-[10px] font-semibold uppercase tracking-[0.2em]">BOX SCORE</p>
          <h3 className="myna-display mt-1 text-2xl">{team} · {side === 'home' ? 'HOME' : 'AWAY'} ROTATION</h3>
        </div>
        <div className="flex gap-1 rounded-xl border border-[var(--myna-border)] bg-[var(--myna-canvas)] p-1">
          {[['away', game.away], ['home', game.home]].map(([key, code]) => (
            <button key={key} type="button" aria-pressed={side === key} onClick={() => setSide(key)}
              className={`min-h-9 rounded-lg px-4 font-mono text-[11px] font-bold transition-colors ${side === key ? '' : 'text-[var(--myna-muted)] hover:bg-[var(--myna-raised)]'}`}
              data-team-theme={code}
              style={{ ...teamThemeVars(code, mode), background: side === key ? 'var(--team-primary)' : 'var(--myna-canvas)', color: side === key ? 'var(--team-on-primary)' : 'var(--team-ink)' }}
            >
              <TeamMark code={code} name={code} className="h-5 w-5" />
              {code}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="myna-muted text-[10px] uppercase tracking-[0.12em]">
              <th className="px-2 py-1 text-left">
                <button type="button" onClick={() => setSort(current => ({ key: 'name', dir: current.key === 'name' && current.dir === 'asc' ? 'desc' : 'asc' }))} className="transition-colors hover:text-[var(--myna-accent)]">PLAYER{sort.key === 'name' ? (sort.dir === 'asc' ? ' ▴' : ' ▾') : ''}</button>
              </th>
              <th className="px-2 py-1 text-left">POS</th>
              {sortHead('min', 'MIN')}{sortHead('pts', 'PTS')}{sortHead('reb', 'REB')}{sortHead('ast', 'AST')}{sortHead('stl', 'STL')}{sortHead('blk', 'BLK')}
            </tr>
          </thead>
          <tbody>
            {sortedLines.map((line, index) => (
              <tr key={index} className="border-t border-[var(--myna-border)] broadcast-in-r" style={{ animationDelay: `${index * 55}ms` }}>
                <td className="px-2 py-1.5 text-left font-medium">{line.name}</td>
                <td className="px-2 py-1.5 text-left myna-muted">{(line.positions || []).join('/') || '—'}</td>
                <td className={`${cell} myna-mono`}>{line.min}</td>
                <td className={`${cell} myna-mono font-semibold`} style={{ color: line.pts >= 20 ? 'var(--team-ink)' : undefined }}>
                  <span className="relative inline-flex min-w-10 items-center justify-end">
                    <span aria-hidden className="absolute inset-y-0.5 right-0 rounded" style={{ width: `${Math.max(8, Math.round(line.pts / maxPts * 100))}%`, background: 'color-mix(in srgb, var(--team-primary) 22%, transparent)' }} />
                    <span className="relative">{line.pts}</span>
                  </span>
                </td>
                <td className={`${cell} myna-mono`}>{line.reb}</td>
                <td className={`${cell} myna-mono`}>{line.ast}</td>
                <td className={`${cell} myna-mono myna-muted`}>{line.stl}</td>
                <td className={`${cell} myna-mono myna-muted`}>{line.blk}</td>
              </tr>
            ))}
            {lines.length === 0 && <tr><td colSpan={8} className="px-2 py-3 text-xs myna-muted">No box lines for this side.</td></tr>}
          </tbody>
          {lines.length > 0 && (
            <tfoot>
              <tr className="matchup-totals-row border-t-2 border-[var(--myna-border)]">
                <td className="px-2 py-1.5 text-left text-[10px] font-bold uppercase tracking-[0.15em]">Team totals</td>
                <td />
                <td className={`${cell} myna-mono font-bold`}>{totals.min}</td>
                <td className={`${cell} myna-mono font-bold`} style={{ color: 'var(--team-ink)' }}>{totals.pts}</td>
                <td className={`${cell} myna-mono font-bold`}>{totals.reb}</td>
                <td className={`${cell} myna-mono font-bold`}>{totals.ast}</td>
                <td className={`${cell} myna-mono font-bold`}>{totals.stl}</td>
                <td className={`${cell} myna-mono font-bold`}>{totals.blk}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </section>
  );
}