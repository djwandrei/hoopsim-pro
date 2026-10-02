import React from 'react';
import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer } from 'recharts';
const AXES = [['pts','Scoring'],['ast','Playmaking'],['reb','Rebounding'],['ts','Efficiency'],['three','Three-point'],['mpg','Minutes']];
const COLORS = ['hsl(var(--court-accent))','hsl(var(--court-royal))','hsl(var(--court-positive))','hsl(var(--court-trim))'];
export default function PlayerRadarChart({ players, atlas }) {
  const data = AXES.map(([key,label]) => {
    const row = { axis: label };
    players.forEach((player,index) => { row[`p${index}`] = atlas?.percentile(key,player.stats[key]) ?? 0; });
    return row;
  });
  return <div className="rounded-xl border border-border/30 bg-canvas/35 p-4"><div className="mb-2 flex flex-wrap items-center justify-between gap-2"><div><h3 className="font-display text-xl tracking-wide">PERCENTILE RADAR</h3><p className="mt-1 text-[11px] text-muted-foreground">Each axis: percentile vs the {atlas?.count ?? '—'} loaded exact-season rows</p></div></div><div className="mx-auto h-72 max-w-md" role="img" aria-label="Percentile radar of selected players"><ResponsiveContainer width="100%" height="100%"><RadarChart data={data} outerRadius="72%"><PolarGrid stroke="hsl(var(--border) / .35)" /><PolarAngleAxis dataKey="axis" tick={{ fill:'hsl(var(--muted-foreground))', fontSize:11 }} /><PolarRadiusAxis domain={[0,100]} tick={false} axisLine={false} />{players.map((player,index) => <Radar key={player.id} name={player.name} dataKey={`p${index}`} stroke={COLORS[index]} fill={COLORS[index]} fillOpacity={.16} strokeWidth={2} isAnimationActive={false} />)}</RadarChart></ResponsiveContainer></div><div className="flex flex-wrap justify-center gap-3">{players.map((player,index) => <span key={player.id} className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><span className="inline-block h-2 w-2 rounded-full" style={{ background:COLORS[index] }} />{player.name}</span>)}</div></div>;
}