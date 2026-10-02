import React, { useEffect, useMemo, useState } from 'react';
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, ReferenceArea } from 'recharts';
import { SCATTER_METRICS, SCATTER_LABEL, scatterText, scatterTick, scatterDomain } from '@/components/players/leagueAtlas';
import { playerAsset } from '@/components/studio/teamAssets';

function ScatterTip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return <div className="rounded-lg border border-border/50 bg-card px-3 py-2 text-xs shadow-lg"><p className="font-semibold text-foreground">{point.name} · {point.team}</p>{point.season && <p className="text-[10px] text-muted-foreground">{point.season}</p>}<p className="mt-1 font-mono text-gold">{SCATTER_LABEL(point.xKey)} {scatterText(point.xKey,Number(point.x))} · {SCATTER_LABEL(point.yKey)} {scatterText(point.yKey,Number(point.y))}</p><p className="mt-0.5 text-[10px] text-muted-foreground">{point.gp} games observed</p></div>;
}

const makeShape = (desktop, tone) => function AvatarShape(props) {
  const { cx,cy,payload } = props;
  const url = desktop && playerAsset(payload.row?.headshotPath);
  const r = tone === 'accent' ? 20 : 16;
  const clip = `scatter-clip-${payload.pkey}`;
  if (!url) return <circle cx={cx} cy={cy} r={tone === 'accent' ? 8 : 6} fill={tone === 'accent' ? 'hsl(var(--court-accent))' : 'hsl(var(--court-royal) / .55)'} stroke={tone === 'accent' ? 'hsl(var(--foreground))' : 'none'} className="cursor-pointer" />;
  return <g className="cursor-pointer">
    <clipPath id={clip}><circle cx={cx} cy={cy} r={r} /></clipPath>
    {tone === 'accent' && <circle cx={cx} cy={cy} r={r + 2.5} fill="none" stroke="hsl(var(--court-accent))" strokeWidth="1.5" />}
    <circle cx={cx} cy={cy} r={r} fill="hsl(var(--court-raised))" stroke={tone === 'accent' ? 'hsl(var(--court-accent))' : 'hsl(var(--border) / .5)'} strokeWidth="1.5" />
    <image href={url} x={cx - r} y={cy - r} width={r * 2} height={r * 2} clipPath={`url(#${clip})`} preserveAspectRatio="xMidYMid slice" />
  </g>;
};

export default function LeagueScatterBoard({ rows, atlas, selected, onSelect }) {
  const [xKey,setXKey] = useState('pts');
  const [yKey,setYKey] = useState('ts');
  const [minimum,setMinimum] = useState(10);
  const [desktop,setDesktop] = useState(() => typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches);
  useEffect(() => {
    const query = window.matchMedia('(min-width: 1024px)');
    const onChange = event => setDesktop(event.matches);
    query.addEventListener('change',onChange);
    return () => query.removeEventListener('change',onChange);
  },[]);
  const xLabel = SCATTER_LABEL(xKey), yLabel = SCATTER_LABEL(yKey);
  const chosen = useMemo(() => new Set(selected.map(player => player.id)),[selected]);
  const points = useMemo(() => rows.filter(row => row.stats.gp >= minimum && Number.isFinite(row.stats[xKey]) && Number.isFinite(row.stats[yKey])).map((row,index) => ({ pkey:index,id:row.id,name:row.name,team:row.teamCode,gp:row.stats.gp,x:row.stats[xKey],y:row.stats[yKey],row,xKey,yKey,season:row.seasonLabel })),[rows,minimum,xKey,yKey]);
  const main = points.filter(point => !chosen.has(point.id));
  const highlighted = points.filter(point => chosen.has(point.id));
  const medianX = atlas?.median(xKey), medianY = atlas?.median(yKey);
  const xDomain = useMemo(() => scatterDomain(xKey, points.map(point => point.x)),[points,xKey]);
  const yDomain = useMemo(() => scatterDomain(yKey, points.map(point => point.y)),[points,yKey]);
  const pick = entry => { const candidate = entry?.payload ?? entry; const row = candidate?.row || candidate; if (row?.id) onSelect(row); };
  const axisTick = key => value => scatterTick(key,value);
  return <section className="court-panel p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="court-kicker">Interactive scatter · League map</p><h2 className="mt-1 font-display text-3xl leading-none"><span className="text-royal">{xLabel}</span> <span className="text-muted-foreground">×</span> <span className="text-gold">{yLabel}</span></h2><p className="mt-2 max-w-xl text-xs text-muted-foreground">{points.length} player-season rows at {minimum}+ games · dashed lines mark league medians · click any headshot to pin the player.</p></div><div className="flex items-end gap-3"><span className="bcast-lowerthird"><span className="bcast-lowerthird__bar" aria-hidden="true"></span>{points.length} rows</span><label className="block"><span className="studio-control-label">Minimum games</span><select value={minimum} onChange={event => setMinimum(Number(event.target.value))} className="studio-select w-auto"><option value={0}>Any</option><option value={10}>10+</option><option value={25}>25+</option><option value={50}>50+</option></select></label></div></div><div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2"><label className="block"><span className="studio-control-label">X-axis metric</span><select value={xKey} onChange={event => setXKey(event.target.value)} className="studio-select">{SCATTER_METRICS.map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></label><label className="block"><span className="studio-control-label">Y-axis metric</span><select value={yKey} onChange={event => setYKey(event.target.value)} className="studio-select">{SCATTER_METRICS.map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></label></div><div className="mt-3 h-[26rem]" role="img" aria-label={`League scatter of ${xLabel} against ${yLabel}`}><ResponsiveContainer width="100%" height="100%"><ScatterChart margin={{ top:16,right:28,bottom:26,left:8 }}><CartesianGrid stroke="hsl(var(--border) / .2)" strokeDasharray="3 6" /><XAxis type="number" dataKey="x" name={xLabel} tickFormatter={axisTick(xKey)} tick={{ fill:'hsl(var(--muted-foreground))', fontSize:10 }} tickLine={false} axisLine={{ stroke:'hsl(var(--border) / .35)' }} domain={xDomain} label={{ value:xLabel, position:'insideBottomRight', offset:-14, fill:'hsl(var(--muted-foreground))', fontSize:10, letterSpacing:'0.08em' }} /><YAxis type="number" dataKey="y" name={yLabel} tickFormatter={axisTick(yKey)} tick={{ fill:'hsl(var(--muted-foreground))', fontSize:10 }} tickLine={false} axisLine={false} width={56} domain={yDomain} label={{ value:yLabel, angle:-90, position:'insideLeft', offset:12, fill:'hsl(var(--muted-foreground))', fontSize:10, letterSpacing:'0.08em' }} /><Tooltip content={<ScatterTip />} cursor={{ strokeDasharray:'4 4', stroke:'hsl(var(--border) / .5)' }} />{Number.isFinite(medianX) && <ReferenceLine x={medianX} stroke="hsl(var(--court-accent) / .5)" strokeDasharray="6 6" label={{ value:`median ${xLabel}`, position:'top', fill:'hsl(var(--court-accent))', fontSize:9 }} />}{Number.isFinite(medianY) && <ReferenceLine y={medianY} stroke="hsl(var(--court-accent) / .5)" strokeDasharray="6 6" label={{ value:`median ${yLabel}`, position:'right', fill:'hsl(var(--court-accent))', fontSize:9 }} />}{Number.isFinite(medianX) && Number.isFinite(medianY) && <ReferenceArea x1={medianX} x2={xDomain[1]} y1={medianY} y2={yDomain[0]} fill="hsl(var(--court-accent) / .06)" stroke="none" />}<Scatter data={main} shape={makeShape(desktop,'royal')} onClick={pick} isAnimationActive={false} /><Scatter data={highlighted} shape={makeShape(desktop,'accent')} onClick={pick} isAnimationActive={false} /></ScatterChart></ResponsiveContainer></div><div className="mt-2 flex flex-wrap gap-4 text-[11px] text-muted-foreground"><span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background:'hsl(var(--court-royal) / .8)' }} />League row</span><span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-full border border-gold" style={{ background:'hsl(var(--court-accent))' }} />Your selection</span></div></section>;
}