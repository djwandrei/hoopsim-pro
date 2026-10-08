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
          <div className="mt-2 h-52">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 8, right: 6, bottom: 0, left: -22 }}>
                <XAxis dataKey="game" tick={{ fontSize: 10.4, fill: 'var(--myna-muted)' }} stroke="var(--myna-border)" />
                <YAxis tick={{ fontSize: 10.4, fill: 'var(--myna-muted)' }} stroke="var(--myna-border)" domain={['dataMin - 3', 'dataMax + 3']} />
                <Tooltip
                  contentStyle={{ background: 'var(--myna-surface)', color: 'var(--myna-text)', border: '1px solid var(--myna-border)', borderRadius: 8, fontSize: 11 }}
                  labelStyle={{ color: 'var(--myna-muted)' }}
                  itemStyle={{ color: 'var(--myna-accent)' }}
                  labelFormatter={value => `Game ${value}`}
                  formatter={value => [value, 'PTS']}
                />
                <ReferenceLine y={avg} stroke="var(--myna-muted)" strokeDasharray="4 4" strokeOpacity={0.7} label={{ value: `${avg.toFixed(1)} PPG avg`, position: 'insideTopRight', fontSize: 10.4, fill: 'var(--myna-muted)' }} />
                <Line type="monotone" dataKey="pts" stroke="var(--myna-accent)" strokeWidth={2} dot={{ r: 2.5, fill: 'var(--myna-accent)' }} activeDot={{ r: 4 }} />
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