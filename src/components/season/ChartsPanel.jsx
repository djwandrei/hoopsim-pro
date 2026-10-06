import React, { useMemo } from 'react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ScatterChart, Scatter, ZAxis, Cell, LabelList,
} from 'recharts';

const tooltipStyle = { backgroundColor:'hsl(var(--card))', border:'1px solid hsl(var(--border))', color:'hsl(var(--foreground))', borderRadius:10, fontSize:12 };
const axisTick = { fill: 'hsl(var(--muted-foreground))', fontSize: 11 };
const axisLabel = { fill: 'hsl(var(--muted-foreground))', fontSize: 10, fontWeight: 600 };

function WinDistribution({ summary, focusCode, actualWins }) {
  const focus = summary.find(row => row.code === focusCode);
  const data = useMemo(() => {
    if (!focus) return [];
    const counts = new Map();
    let low = Infinity; let high = -Infinity;
    for (const wins of focus.winsList) {
      const bucket = Math.floor(wins / 4) * 4;
      counts.set(bucket, (counts.get(bucket) || 0) + 1);
      low = Math.min(low, bucket); high = Math.max(high, bucket);
    }
    const rows = [];
    for (let bucket = low; bucket <= high; bucket += 4) rows.push({ bucket: `${bucket}–${bucket + 3}`, wins: counts.get(bucket) || 0 });
    return rows;
  }, [focus]);
  if (!focus) return null;
  return (
    <div className="chart-frame rise-in court-panel-hover">
      <div className="chart-frame__head">
        <h3 className="chart-frame__title">WIN DISTRIBUTION · {focusCode}</h3>
        <span className="text-xs text-muted-foreground">{focus.winsList.length} replays · median {focus.wins.toFixed(1)}</span>
      </div>
      {data.length ? <div className="mt-3 h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 12, right: 8, left: -14, bottom: 8 }}>
            <CartesianGrid stroke="hsl(var(--border) / .25)" vertical={false} />
            <XAxis dataKey="bucket" tick={axisTick} interval={1} label={{ value: 'Wins (bucketed in fours)', position: 'insideBottom', offset: -6, ...axisLabel }} />
            <YAxis tick={axisTick} allowDecimals={false} label={{ value: 'Replays', angle: -90, position: 'insideLeft', offset: 16, ...axisLabel }} />
            <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'hsl(var(--court-royal) / .13)' }} formatter={value => [`${value} replays`, 'Simulated seasons']} labelFormatter={label => `${label} wins`} />
            {Number.isFinite(actualWins) && <ReferenceLine x={`${Math.floor(actualWins / 4) * 4}–${Math.floor(actualWins / 4) * 4 + 3}`} stroke="hsl(var(--court-positive))" strokeDasharray="4 3" label={{ value: 'Actual', fill: 'hsl(var(--court-positive))', fontSize: 10, position: 'top' }} />}
            <ReferenceLine x={`${Math.floor(focus.wins / 4) * 4}–${Math.floor(focus.wins / 4) * 4 + 3}`} stroke="hsl(var(--court-accent))" label={{ value: 'Median', fill: 'hsl(var(--court-accent))', fontSize: 10, position: 'top' }} />
            <Bar dataKey="wins" fill="hsl(var(--court-royal))" radius={[4, 4, 0, 0]} animationDuration={600}>
              <LabelList dataKey="wins" position="top" style={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10, fontFamily: 'var(--font-mono)' }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div> : <div className="chart-frame__empty mt-3">No replay seasons recorded yet — run a replay to fill this out.</div>}
      <p className="chart-frame__caption">Where every replay season landed. Gold line marks the median outcome; green dashed marks the actual season.</p>
    </div>
  );
}

function NetScatter({ summary, focusCode }) {
  const data = summary.map(row => ({
    code: row.code, name: row.name || row.code, ortg: Number(row.ortg.toFixed(1)), drtg: Number(row.drtg.toFixed(1)),
    net: Number((row.ortg - row.drtg).toFixed(1)),
    focus: row.code === focusCode,
  }));
  const netTip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const t = payload[0].payload;
    return (
      <div className="rounded-lg border border-border/50 bg-card px-3 py-2 text-xs shadow-xl">
        <p className="font-semibold text-foreground">{t.name}</p>
        <p className="mt-1 font-mono text-muted-foreground">ORtg {t.ortg.toFixed(1)} · DRtg {t.drtg.toFixed(1)}</p>
        <p className="font-mono font-semibold" style={{ color: t.net >= 0 ? 'hsl(var(--court-positive))' : 'hsl(var(--court-trim-ink))' }}>{t.net >= 0 ? '+' : ''}{t.net.toFixed(1)} net rating</p>
      </div>
    );
  };
  return (
    <div className="chart-frame rise-in court-panel-hover" style={{ '--rise-delay': '90ms' }}>
      <div className="chart-frame__head">
        <h3 className="chart-frame__title">EFFICIENCY MAP</h3>
        <span className="inline-flex items-center gap-3 text-[10px] text-muted-foreground"><span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full border-2 border-[hsl(var(--court-focus))]" style={{ background: 'hsl(var(--court-accent))' }} />Focus team</span><span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: 'hsl(var(--court-royal))' }} />Rest of league</span></span>
      </div>
      <div className="mt-3 h-72">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 12, right: 16, left: -10, bottom: 14 }}>
            <CartesianGrid stroke="hsl(var(--border) / .25)" />
            <XAxis type="number" dataKey="ortg" name="ORtg" tick={axisTick} domain={['dataMin - 1', 'dataMax + 1']} label={{ value: 'Offensive rating →', position: 'insideBottom', offset: -8, ...axisLabel }} />
            <YAxis type="number" dataKey="drtg" name="DRtg" tick={axisTick} domain={['dataMin - 1', 'dataMax + 1']} reversed label={{ value: 'Defensive rating ↓ better', angle: -90, position: 'insideLeft', offset: 14, ...axisLabel }} />
            <ZAxis dataKey="net" range={[30, 30]} />
            <Tooltip content={netTip} cursor={{ strokeDasharray: '3 3' }} />
            <Scatter data={data} shape="circle" animationDuration={600}>
              {data.map(entry => (
                <Cell key={entry.code} fill={entry.focus ? 'hsl(var(--court-accent))' : 'hsl(var(--court-royal))'} stroke={entry.focus ? 'hsl(var(--court-focus))' : 'none'} strokeWidth={2} />
              ))}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </div>
      <p className="chart-frame__caption">Each dot is a team: further right scores more, further down defends better. The gold dot is the focused team.</p>
    </div>
  );
}

export default function ChartsPanel({ summary, focusCode, actualWins }) {
  return (
    <section className="grid gap-4 lg:grid-cols-2">
      <WinDistribution summary={summary} focusCode={focusCode} actualWins={actualWins} />
      <NetScatter summary={summary} focusCode={focusCode} />
    </section>
  );
}