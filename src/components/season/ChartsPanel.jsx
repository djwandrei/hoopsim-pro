import React, { useMemo } from 'react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ScatterChart, Scatter, ZAxis, Cell,
} from 'recharts';

const tooltipStyle = { backgroundColor: '#19233B', border: '1px solid #6C7A8E', borderRadius: 8, fontSize: 12 };

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
      <div className="flex items-baseline justify-between">
        <h3 className="court-display text-2xl text-foreground">WIN DISTRIBUTION · {focusCode}</h3>
        <span className="text-xs text-muted-foreground">{focus.winsList.length} replays · median {focus.wins.toFixed(1)}</span>
      </div>
      <div className="mt-3 h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
            <CartesianGrid stroke="#6C7A8E33" vertical={false} />
            <XAxis dataKey="bucket" tick={{ fill: '#B1BED2', fontSize: 10 }} interval={1} />
            <YAxis tick={{ fill: '#B1BED2', fontSize: 10 }} allowDecimals={false} />
            <Tooltip contentStyle={tooltipStyle} cursor={{ fill: '#4169E122' }} />
            {Number.isFinite(actualWins) && <ReferenceLine x={`${Math.floor(actualWins / 4) * 4}–${Math.floor(actualWins / 4) * 4 + 3}`} stroke="#80DBB0" strokeDasharray="4 3" label={{ value: 'Actual', fill: '#80DBB0', fontSize: 10, position: 'top' }} />}
            <ReferenceLine x={`${Math.floor(focus.wins / 4) * 4}–${Math.floor(focus.wins / 4) * 4 + 3}`} stroke="#E9B949" label={{ value: 'Median', fill: '#E9B949', fontSize: 10, position: 'top' }} />
            <Bar dataKey="wins" fill="#4169E1" radius={[3, 3, 0, 0]} />
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
      <div className="flex items-baseline justify-between">
        <h3 className="court-display text-2xl text-foreground">EFFICIENCY MAP</h3>
        <span className="text-xs text-muted-foreground">ORtg ↑ better · DRtg ↓ better · gold = focus team</span>
      </div>
      <div className="mt-3 h-72">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 12, right: 16, left: -12, bottom: 4 }}>
            <CartesianGrid stroke="#6C7A8E33" />
            <XAxis type="number" dataKey="ortg" name="ORtg" tick={{ fill: '#B1BED2', fontSize: 10 }} domain={['dataMin - 1', 'dataMax + 1']} />
            <YAxis type="number" dataKey="drtg" name="DRtg" tick={{ fill: '#B1BED2', fontSize: 10 }} domain={['dataMin - 1', 'dataMax + 1']} reversed />
            <ZAxis dataKey="net" range={[30, 30]} />
            <Tooltip contentStyle={tooltipStyle} />
            <Scatter data={data} shape="circle">
              {data.map(entry => (
                <Cell key={entry.code} fill={entry.focus ? '#E9B949' : '#4169E1'} stroke={entry.focus ? '#F4D37C' : 'none'} strokeWidth={2} />
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