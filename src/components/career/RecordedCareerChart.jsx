import React, { useState } from 'react';
import { Area, AreaChart, CartesianGrid, ReferenceDot, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useCourtTheme } from '@/components/djhc/CourtThemeProvider';
import { readableTeamInk } from '@/components/djhc/basketballPalettes';
import TeamMark from '@/components/studio/TeamMark';
import CareerStatTile from '@/components/career/CareerStatTile';

const STATS = [['pts', 'Points'], ['reb', 'Rebounds'], ['ast', 'Assists']];
const PALETTE = { pts: 'hsl(var(--primary))', reb: 'hsl(var(--chart-2))', ast: 'hsl(var(--chart-3))' };

export default function RecordedCareerChart({ seasons }) {
  const [stat, setStat] = useState('pts'), [selectedYear, setSelectedYear] = useState(null);
  const { mode = 'dark' } = useCourtTheme() || {};
  if (!seasons.length) return <section className="court-panel p-6"><h2 className="font-display text-2xl">NO RECORDED SEASONS</h2><p className="mt-3 text-sm text-muted-foreground">Select a player with observed regular-season history.</p></section>;
  const supplied = seasons.filter(row => Number.isFinite(row[stat]));
  const peak = supplied.reduce((best, row) => !best || row[stat] > best[stat] ? row : best, null);
  const focus = seasons.find(row => row.year === selectedYear) || seasons.at(-1);
  const byYear = new Map(seasons.map(row => [row.year, row]));
  const chart = Array.from({ length: seasons.at(-1).year - seasons[0].year + 1 }, (_, index) => {
    const year = seasons[0].year + index;
    return byYear.get(year) || { year, label: `${year}–${String(year + 1).slice(-2)}`, pts: null, reb: null, ast: null };
  });
  const text = value => Number.isFinite(value) ? value.toFixed(1) : '—';
  const ink = row => readableTeamInk(row.teams?.[0] || 'djhc', mode);
  const Tip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const row = payload[0].payload;
    return <div className="max-w-56 rounded-lg border border-border/40 bg-card p-3 text-xs shadow-xl">
      <p className="font-semibold">{row.label}</p>
      {STATS.map(([key, label]) => <p key={key} className="mt-1 font-mono">{label} {Number.isFinite(row[key]) ? row[key].toFixed(2) : '—'} / G</p>)}
      <p className="mt-1 text-muted-foreground">{row.teams?.length ? `${row.teams.join(' · ')} · ${row.games} GP` : 'Missing archive record'}</p>
    </div>;
  };
  return <section className="court-panel p-5">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div><p className="court-kicker">Observed, not projected</p><h2 className="mt-1 font-display text-2xl">THE RECORDED CAREER PATH</h2><p className="mt-2 text-xs text-muted-foreground">Dots wear each season's team color; the ringed point marks the peak season.</p></div>
      <nav aria-label="Career chart statistic" className="flex gap-1 rounded-lg bg-canvas/40 p-1">
        {STATS.map(([key, label]) => <button key={key} type="button" aria-pressed={stat === key} onClick={() => setStat(key)}
          className={stat === key ? 'min-h-10 rounded-md bg-gold/10 px-3 text-xs text-gold' : 'min-h-10 rounded-md px-3 text-xs text-muted-foreground transition-colors hover:bg-raised'}>{label}</button>)}
      </nav>
    </header>
    <div className="mt-5 h-72" role="img" aria-label={`Recorded ${stat} per game by season; missing archive seasons create gaps`}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chart} margin={{ top: 10, right: 15, bottom: 5, left: -15 }} onClick={event => { const row = event?.activePayload?.[0]?.payload; if (row && byYear.has(row.year)) setSelectedYear(row.year); }}>
          <defs><linearGradient id={`career-fill-${stat}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={PALETTE[stat]} stopOpacity={0.32} /><stop offset="100%" stopColor={PALETTE[stat]} stopOpacity={0.03} /></linearGradient></defs>
          <CartesianGrid vertical={false} stroke="hsl(var(--border) / .25)" strokeDasharray="3 3" />
          <XAxis dataKey="label" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} tickLine={false} axisLine={false} />
          <YAxis tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} tickLine={false} axisLine={false} />
          <Tooltip content={<Tip />} cursor={{ stroke: 'hsl(var(--border) / .5)' }} />
          <Area type="linear" dataKey={stat} connectNulls={false} stroke={PALETTE[stat]} strokeWidth={3} fill={`url(#career-fill-${stat})`} activeDot={{ r: 5, stroke: 'hsl(var(--card))', strokeWidth: 2 }}
            dot={props => { const row = props.payload; if (!row || !Number.isFinite(row[stat])) return null; const active = row.year === focus.year; return <circle key={`${row.year}-${active}`} cx={props.cx} cy={props.cy} r={active ? 6 : 4} fill={ink(row)} stroke="hsl(var(--card))" strokeWidth={2} />; }}
            isAnimationActive={false} />
          {peak && <ReferenceDot x={peak.label} y={peak[stat]} r={7} fill="hsl(var(--card))" stroke={PALETTE[stat]} strokeWidth={3} ifOverflow="extendDomain" />}
          {Number.isFinite(focus[stat]) && focus !== peak && <ReferenceDot x={focus.label} y={focus[stat]} r={6} fill="transparent" stroke="hsl(var(--foreground) / .6)" strokeWidth={2} ifOverflow="extendDomain" />}
        </AreaChart>
      </ResponsiveContainer>
    </div>
    {/* Clickable season strip — jump to any recorded season, gaps stay visible */}
    <div className="mt-4 flex gap-2 overflow-x-auto pb-1" role="listbox" aria-label="Recorded seasons">
      {chart.map(row => byYear.has(row.year) ? (
        <button key={row.year} type="button" aria-selected={row.year === focus.year} onClick={() => setSelectedYear(row.year)}
          className={`flex shrink-0 items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs transition-colors ${
            row.year === focus.year ? 'border-gold/50 bg-gold/10 text-gold' : 'border-border/40 bg-canvas/40 text-muted-foreground hover:border-gold/30'
          }`}>
          {row.teams?.map(code => <TeamMark key={code} code={code} className="h-5 w-5" />)}
          <span className="font-mono">{row.label}</span>
        </button>
      ) : (
        <span key={row.year} className="shrink-0 rounded-lg border border-dashed border-border/30 px-2.5 py-1.5 text-[10px] text-muted-foreground/85">{row.label} · no record</span>
      ))}
    </div>
    <div className="mt-4 grid gap-3 sm:grid-cols-3">
      <CareerStatTile label="Selected season / G" value={text(focus[stat])} detail={`${focus.label} · ${focus.teams.join(' / ')}`} tone={stat === 'pts' ? 'gold' : stat === 'reb' ? 'royal' : 'positive'} />
      <CareerStatTile label="Recorded peak / G" value={text(peak?.[stat])} detail={`${peak?.label || 'No supplied value'} · ${seasons.length ? 'best observed season' : ''}`} tone="positive" />
      <CareerStatTile label="Selected season GP" value={focus.games} detail="Observed exposure, not projected games" tone="royal" />
    </div>
    <p className="mt-4 text-xs leading-relaxed text-muted-foreground">The chart shows only supplied regular-season observations inside 2017–26. Gaps are missing records—not zero production, retirement or a future aging scenario.</p>
  </section>;
}