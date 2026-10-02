import React, { useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LabelList } from 'recharts';
const GROUPS = ['G','F','C'];
const CHOICES = [['pts','PPG'],['ast','APG'],['reb','RPG'],['stl','SPG'],['blk','BPG'],['ts','TS%'],['three','3P%'],['mpg','MPG']];
const medianOf = list => { const sorted = list.filter(Number.isFinite).sort((a,b) => a-b); return sorted.length ? sorted[Math.floor((sorted.length-1)/2)] : null; };
export default function PositionLens({ rows }) {
  const [metric,setMetric] = useState('pts');
  const data = useMemo(() => {
    const overall = medianOf(rows.map(row => row.stats[metric]));
    const bars = GROUPS.map(group => {
      const members = rows.filter(row => row.positions[0] === group);
      return { group:`${group} · ${members.length}`, value:medianOf(members.map(row => row.stats[metric])), players:members.length };
    });
    return Number.isFinite(overall) ? [...bars,{ group:'League', value:overall, players:rows.length }] : bars;
  },[rows,metric]);
  const plotted = data.filter(row => Number.isFinite(row.value));
  return <section className="court-panel p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="court-kicker">Position lens</p><h2 className="mt-1 font-display text-2xl">MEDIAN BY POSITION</h2><p className="mt-2 text-xs text-muted-foreground">Median of each primary position group vs the whole league, for the chosen rate.</p></div><label className="block"><span className="studio-control-label">Metric</span><select value={metric} onChange={event => setMetric(event.target.value)} className="studio-select sm:w-36">{CHOICES.map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></label></div>{plotted.length ? <div className="mt-4 h-56" role="img" aria-label={`Median ${metric} by position`}><ResponsiveContainer width="100%" height="100%"><BarChart data={data} margin={{ top:10,right:10,bottom:0,left:0 }}><CartesianGrid vertical={false} stroke="hsl(var(--border) / .2)" /><XAxis dataKey="group" tick={{ fill:'hsl(var(--muted-foreground))', fontSize:10 }} tickLine={false} axisLine={false} /><YAxis tick={{ fill:'hsl(var(--muted-foreground))', fontSize:10 }} tickLine={false} axisLine={false} width={40} /><Tooltip cursor={{ fill:'hsl(var(--secondary) / .4)' }} contentStyle={{ background:'hsl(var(--card))', border:'1px solid hsl(var(--border) / .4)', borderRadius:10, fontSize:11 }} formatter={(value,name,entry) => [Number(value).toFixed(metric.endsWith('%') ? 1 : 1), `${entry?.payload?.players ?? ''} players · median`]} /><Bar dataKey="value" radius={[6,6,0,0]} isAnimationActive={false}><LabelList dataKey="value" position="top" formatter={value => Number(value).toFixed(1)} fill="hsl(var(--foreground))" fontSize={10} />{data.map(row => <Cell key={row.group} fill={row.group === 'League' ? 'hsl(var(--court-accent))' : 'hsl(var(--court-royal) / .55)'} />)}</Bar></BarChart></ResponsiveContainer></div> : <p className="mt-4 text-sm text-muted-foreground">Not enough supplied values for this metric.</p>}</section>;
}