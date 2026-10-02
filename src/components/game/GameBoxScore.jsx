import React, { useEffect, useState } from 'react';
import TeamMark from '@/components/studio/TeamMark';
import { paletteForTeam } from '@/components/djhc/basketballPalettes';

const cell = 'px-2 py-1.5 text-right';

export default function GameBoxScore({ game }) {
  const [side, setSide] = useState('home');
  useEffect(() => { setSide('home'); }, [game]);
  const team = side === 'home' ? game.home : game.away;
  const palette = paletteForTeam(team);
  const lines = (side === 'home' ? game.boxHome : game.boxAway)?.lines || [];
  return (
    <section className="myna-panel p-4" aria-label="Box score">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="myna-accent-text text-[10px] font-semibold uppercase tracking-[0.2em]">BOX SCORE</p>
          <h3 className="myna-display mt-1 text-2xl">{side === 'home' ? 'HOME' : 'AWAY'} ROTATION</h3>
        </div>
        <div className="flex gap-1 rounded-xl border border-[var(--myna-border)] bg-[var(--myna-canvas)] p-1">
          {[['away', game.away], ['home', game.home]].map(([key, code]) => (
            <button key={key} type="button" aria-pressed={side === key} onClick={() => setSide(key)}
              className={`min-h-9 rounded-lg px-4 font-mono text-[11px] font-bold transition-colors ${side === key ? '' : 'text-[var(--myna-muted)] hover:bg-[var(--myna-raised)]'}`}
              style={side === key ? { background: paletteForTeam(code).primary, color: paletteForTeam(code).highlight } : undefined}
            >
              {code}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="myna-muted text-[10px] uppercase tracking-[0.12em]">
              <th className="px-2 py-1 text-left">PLAYER</th>
              <th className="px-2 py-1 text-left">POS</th>
              <th className="px-2 py-1 text-right">MIN</th>
              <th className="px-2 py-1 text-right">PTS</th>
              <th className="px-2 py-1 text-right">REB</th>
              <th className="px-2 py-1 text-right">AST</th>
              <th className="px-2 py-1 text-right">STL</th>
              <th className="px-2 py-1 text-right">BLK</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, index) => (
              <tr key={index} className="border-t border-[var(--myna-border)]">
                <td className="px-2 py-1.5 text-left font-medium">{line.name}</td>
                <td className="px-2 py-1.5 text-left myna-muted">{(line.positions || []).join('/') || '—'}</td>
                <td className={`${cell} myna-mono`}>{line.min}</td>
                <td className={`${cell} myna-mono font-semibold`} style={{ color: line.pts >= 20 ? palette.primary : undefined }}>{line.pts}</td>
                <td className={`${cell} myna-mono`}>{line.reb}</td>
                <td className={`${cell} myna-mono`}>{line.ast}</td>
                <td className={`${cell} myna-mono myna-muted`}>{line.stl}</td>
                <td className={`${cell} myna-mono myna-muted`}>{line.blk}</td>
              </tr>
            ))}
            {lines.length === 0 && <tr><td colSpan={8} className="px-2 py-3 text-xs myna-muted">No box lines for this side.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}