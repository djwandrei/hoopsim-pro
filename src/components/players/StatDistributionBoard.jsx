import React, { useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
const CHOICES = [['pts','PPG'],['ast','APG'],['reb','RPG'],['mpg','MPG']];
const BINS = 12;
export default function StatDistributionBoard({ rows, selected }) {
  const [metric,setMetric] = useState('pts');
  const data = useMemo(() => {
    const pool = rows.map(row => row.stats[metric]).filter(Number.isFinite);
    if (pool.length < 8) return null;
    const min = Math.min(...pool), max = Math.max(...pool);
    const step = (max-min)/BINS || 1;
    const bins = Array.from({ length:BINS },(_,index) => ({ lo:min+index*step, hi:min+(index+1)*step, count:0 }));
    for (const value of pool) bins[Math.min(BINS-1,Math.max(0,Math.floor((value-min)/step)))].count += 1;
    return bins.map(bin => ({ ...bin, bin:`${((bin.lo+bin.hi)/2).toFixed(1)}` }));
  },[rows,metric]);
  const markers = useMemo(() => {
    if (!data) return [];
    const min = data[0].lo, step = (data[BINS-1].hi - min)/BINS;
    return selected.filter(player => Number.isFinite(player.stats[metric])).map(player => {
      const index = Math.min(BINS-1,Math.max(0,Math.floor((player.stats[metric]-min)/step)));
      return { label:data[index].bin, name:player.name };
    });
  },[data,selected,metric]);
  return <section className="court-panel p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="court-kicker">Where do they sit?</p><h2 className="mt-1 font-display text-2xl">LEAGUE DISTRIBUTION</h2><p className="mt-2 text-xs text-muted-foreground">Histogram of the scoped rows · gold lines flag your pinned players.</p></div><label className="block"><span className="studio-control-label">Metric</span><select value={metric} onChange={event => setMetric(event.target.value)} className="studio-select sm:w-36">{CHOICES.map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></label></div>{data ? <><div className="mt-4 h-64" role="img" aria-label={`League distribution of ${metric}`}><ResponsiveContainer width="100%" height="100%"><BarChart data={data} margin={{ top:18,right:10,bottom:14,left:0 }}><defs><linearGradient id="dist-bar" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="hsl(var(--court-royal))" stopOpacity="0.95" /><stop offset="100%" stopColor="hsl(var(--court-royal))" stopOpacity="0.3" /></linearGradient></defs><CartesianGrid vertical={false} stroke="hsl(var(--border) / .3)" /><XAxis dataKey="bin" tick={{ fill:'hsl(var(--muted-foreground))', fontSize:10 }} tickLine={{ stroke:'hsl(var(--border) / .5)' }} axisLine={{ stroke:'hsl(var(--border) / .7)', strokeWidth:1.5 }} interval={1} label={{ value:`${CHOICES.find(([key]) => key === metric)[1]} per game`, position:'insideBottomRight', offset:-10, fill:'hsl(var(--foreground) / .85)', fontSize:11, fontWeight:600 }} /><YAxis tick={{ fill:'hsl(var(--muted-foreground))', fontSize:10 }} tickLine={{ stroke:'hsl(var(--border) / .5)' }} axisLine={{ stroke:'hsl(var(--border) / .7)', strokeWidth:1.5 }} width={34} allowDecimals={false} label={{ value:'Players', angle:-90, position:'insideLeft', offset:16, fill:'hsl(var(--foreground) / .85)', fontSize:11, fontWeight:600 }} /><Tooltip cursor={{ fill:'hsl(var(--secondary) / .4)' }} contentStyle={{ background:'hsl(var(--card))', border:'1px solid hsl(var(--border) / .4)', borderRadius:10, fontSize:11 }} formatter={value => [value,'Rows in bin']} /><Bar dataKey="count" fill="url(#dist-bar)" radius={[5,5,0,0]} isAnimationActive={false} />{markers.map(marker => <ReferenceLine key={`${marker.name}-${marker.label}`} x={marker.label} stroke="hsl(var(--court-accent))" strokeWidth={2} label={{ value:marker.name.split(' ').slice(-1)[0], position:'top', fill:'hsl(var(--court-accent))', fontSize:9 }} />)}</BarChart></ResponsiveContainer></div>{!markers.length && <p className="mt-2 text-xs text-muted-foreground">Select players to flag them on this distribution.</p>}</> : <p className="mt-4 text-sm text-muted-foreground">Not enough supplied values for this metric.</p>}</section>;
}