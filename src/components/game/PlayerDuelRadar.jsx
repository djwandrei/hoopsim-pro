import React, { useEffect, useMemo, useState } from 'react';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, ResponsiveContainer, Tooltip } from 'recharts';
import { paletteForTeam } from '@/components/djhc/basketballPalettes';

const AXES = [['pts', 'PTS'], ['reb', 'REB'], ['ast', 'AST'], ['stl', 'STL'], ['blk', 'BLK']];
const selectClass = 'w-full min-h-9 rounded-lg border border-[var(--myna-border)] bg-[var(--myna-canvas)] px-2 py-1.5 text-xs text-[var(--myna-text)]';

// One-on-one duel of a picked player from each team: the five per-game rates,
// each spoke scaled 0-100 across both rosters so a wider wedge is the edge.
export default function PlayerDuelRadar({ teamA, teamB }) {
  const pool = useMemo(() => ({
    a: (teamA.roster || []).filter(p => p.minutes > 0),
    b: (teamB.roster || []).filter(p => p.minutes > 0),
  }), [teamA, teamB]);
  const [aIdx, setAIdx] = useState(0);
  const [bIdx, setBIdx] = useState(0);
  useEffect(() => { setAIdx(0); setBIdx(0); }, [teamA.code, teamB.code]);
  const pA = pool.a[Math.min(aIdx, Math.max(pool.a.length - 1, 0))];
  const pB = pool.b[Math.min(bIdx, Math.max(pool.b.length - 1, 0))];
  const cA = paletteForTeam(teamA.code).primary;
  const awayPalette = paletteForTeam(teamB.code);
  const cB = cA === awayPalette.primary ? awayPalette.highlight : awayPalette.primary;
  const data = useMemo(() => {
    if (!pA || !pB) return [];
    return AXES.map(([key, label]) => {
      const values = [...pool.a, ...pool.b].map(p => p[key]).filter(Number.isFinite);
      const min = Math.min(...values), span = Math.max(...values) - min || 1;
      return { axis: label, a: Math.round((pA[key] - min) / span * 100), b: Math.round((pB[key] - min) / span * 100), rawA: pA[key], rawB: pB[key] };
    });
  }, [pA, pB, pool]);
  const tip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const point = payload[0].payload;
    return (
      <div className="rounded-lg border border-border/50 bg-card px-3 py-2 text-xs shadow-lg">
        <p className="font-semibold text-foreground">{point.axis}</p>
        <p className="mt-1 font-mono" style={{ color: 'var(--matchup-home-color)' }}>{pA.name} {point.rawA.toFixed(1)}</p>
        <p className="font-mono" style={{ color: 'var(--matchup-away-color)' }}>{pB.name} {point.rawB.toFixed(1)}</p>
      </div>
    );
  };
  return (
    <section className="myna-panel p-4" aria-label="Player duel">
      <p className="myna-accent-text text-[10px] font-semibold uppercase tracking-[0.2em]">PLAYER DUEL</p>
      <h3 className="myna-display mt-1 text-2xl">ONE ON ONE</h3>
      <p className="mt-1 text-xs myna-muted">Pick one player per team; each spoke is scaled 0–100 across both rosters, so a wider wedge is the edge.</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <label data-team-side="home" className="block">
          <span className="matchup-side-text mb-1 block text-[10px] font-semibold uppercase tracking-[0.15em]">{teamA.code}</span>
          <select className={`${selectClass} matchup-side-surface`} value={Math.min(aIdx, Math.max(pool.a.length - 1, 0))} onChange={e => setAIdx(Number(e.target.value))}>
            {pool.a.map((p, i) => <option key={p.playerRef} value={i}>{p.name} · {p.pts.toFixed(1)} PPG</option>)}
          </select>
        </label>
        <label data-team-side="away" className="block">
          <span className="matchup-side-text mb-1 block text-[10px] font-semibold uppercase tracking-[0.15em]">{teamB.code}</span>
          <select className={`${selectClass} matchup-side-surface`} value={Math.min(bIdx, Math.max(pool.b.length - 1, 0))} onChange={e => setBIdx(Number(e.target.value))}>
            {pool.b.map((p, i) => <option key={p.playerRef} value={i}>{p.name} · {p.pts.toFixed(1)} PPG</option>)}
          </select>
        </label>
      </div>
      {pA && pB ?
        <React.Fragment>
          <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] myna-muted">
            <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: cA }} />{pA.name}</span>
            <span>vs</span>
            <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: cB }} />{pB.name}</span>
          </div>
          <div className="mt-2 h-72" role="img" aria-label={`Radar comparing ${pA.name} and ${pB.name}`}>
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={data} outerRadius="72%">
                <PolarGrid stroke="hsl(var(--border) / .3)" />
                <PolarAngleAxis dataKey="axis" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} />
                <Radar name={pA.name} dataKey="a" stroke="var(--matchup-home-color)" fill={cA} fillOpacity={0.25} isAnimationActive={false} />
                <Radar name={pB.name} dataKey="b" stroke="var(--matchup-away-color)" fill={cB} fillOpacity={0.25} isAnimationActive={false} />
                <Tooltip content={tip} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </React.Fragment> :
        <p className="mt-3 text-xs myna-muted">No eligible players on one of these rosters.</p>
      }
    </section>
  );
}