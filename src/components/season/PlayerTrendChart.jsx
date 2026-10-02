import React from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';

// Small recent-form line chart: the player's last 10 games with a season-average marker.
export default function PlayerTrendChart({ rows }) {
  const data = rows.slice(-10).map(row => ({ game: row.gameNo, pts: row.pts || 0 }));
  const avg = data.length ? data.reduce((sum, d) => sum + d.pts, 0) / data.length : 0;
  return (
    <aside className="rounded-xl border border-[var(--myna-border)] bg-[var(--myna-canvas)] p-3" aria-label="Recent scoring trend">
      <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[var(--myna-muted)]">Recent form</p>
      {data.length ? (
        <>
          <div className="mt-2 h-40">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 8, right: 6, bottom: 0, left: -22 }}>
                <XAxis dataKey="game" tick={{ fontSize: 9, fill: '#8FA0BC' }} stroke="#2A3450" />
                <YAxis tick={{ fontSize: 9, fill: '#8FA0BC' }} stroke="#2A3450" domain={['dataMin - 3', 'dataMax + 3']} />
                <Tooltip
                  contentStyle={{ background: '#0C1326', border: '1px solid rgba(233,185,73,.4)', borderRadius: 8, fontSize: 11 }}
                  labelFormatter={value => `Game ${value}`}
                  formatter={value => [value, 'PTS']}
                />
                <ReferenceLine y={avg} stroke="#8FA0BC" strokeDasharray="4 4" strokeOpacity={0.7} />
                <Line type="monotone" dataKey="pts" stroke="#E9B949" strokeWidth={2} dot={{ r: 2.5, fill: '#E9B949' }} activeDot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-1 text-[10px] text-[var(--myna-muted)]">Last {data.length} games · dashed line = {avg.toFixed(1)} PPG</p>
        </>
      ) : (
        <p className="mt-2 text-[11px] text-[var(--myna-muted)]">No games logged yet.</p>
      )}
    </aside>
  );
}