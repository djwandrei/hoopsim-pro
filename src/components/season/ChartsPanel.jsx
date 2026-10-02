import React, { useMemo } from 'react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ScatterChart, Scatter, ZAxis, Cell,
} from 'recharts';

const tooltipStyle = { backgroundColor:'hsl(var(--card))', border:'1px solid hsl(var(--border))', color:'hsl(var(--foreground))', borderRadius:10, fontSize:12 };

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
    <div className="court-panel p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="court-display text-2xl text-foreground">WIN DISTRIBUTION · {focusCode}</h3>
        <span className="text-xs text-muted-foreground">{focus.winsList.length} replays · median {focus.wins.toFixed(1)}</span>
      </div>
      <div className="mt-3 h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
            <CartesianGrid stroke="hsl(var(--border) / .25)" vertical={false} />
            <XAxis dataKey="bucket" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} interval={1} />
            <YAxis tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} allowDecimals={false} />
            <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'hsl(var(--court-royal) / .13)' }} />
            {Number.isFinite(actualWins) && <ReferenceLine x={`${Math.floor(actualWins / 4) * 4}–${Math.floor(actualWins / 4) * 4 + 3}`} stroke="hsl(var(--court-positive))" strokeDasharray="4 3" label={{ value: 'Actual', fill: 'hsl(var(--court-positive))', fontSize: 10, position: 'top' }} />}
            <ReferenceLine x={`${Math.floor(focus.wins / 4) * 4}–${Math.floor(focus.wins / 4) * 4 + 3}`} stroke="hsl(var(--court-accent))" label={{ value: 'Median', fill: 'hsl(var(--court-accent))', fontSize: 10, position: 'top' }} />
            <Bar dataKey="wins" fill="hsl(var(--court-royal))" radius={[4, 4, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function NetScatter({ summary, focusCode }) {
  const data = summary.map(row => ({
    code: row.code, ortg: Number(row.ortg.toFixed(1)), drtg: Number(row.drtg.toFixed(1)),
    net: Number((row.ortg - row.drtg).toFixed(1)),
    focus: row.code === focusCode,
  }));
  return (
    <div className="court-panel p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="court-display text-2xl text-foreground">EFFICIENCY MAP</h3>
        <span className="text-xs text-muted-foreground">ORtg ↑ better · DRtg ↓ better · accent = focus team</span>
      </div>
      <div className="mt-3 h-72">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 12, right: 16, left: -12, bottom: 4 }}>
            <CartesianGrid stroke="hsl(var(--border) / .25)" />
            <XAxis type="number" dataKey="ortg" name="ORtg" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} domain={['dataMin - 1', 'dataMax + 1']} />
            <YAxis type="number" dataKey="drtg" name="DRtg" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} domain={['dataMin - 1', 'dataMax + 1']} reversed />
            <ZAxis dataKey="net" range={[30, 30]} />
            <Tooltip contentStyle={tooltipStyle} />
            <Scatter data={data} shape="circle">
              {data.map(entry => (
                <Cell key={entry.code} fill={entry.focus ? 'hsl(var(--court-accent))' : 'hsl(var(--court-royal))'} stroke={entry.focus ? 'hsl(var(--court-focus))' : 'none'} strokeWidth={2} />
              ))}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </div>
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