import React from 'react';
import { TrendingUp } from 'lucide-react';
import { Bar, BarChart, Cell, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

const axisTick = { fill: 'hsl(var(--muted-foreground))', fontSize: 10 };
const tooltipStyle = { background: 'hsl(var(--card))', border: '1px solid hsl(var(--border) / .5)', borderRadius: '.5rem', fontSize: '.72rem', color: 'hsl(var(--foreground))' };

// Season pulse charts: the controlled team's cumulative win/loss curve and
// per-game scoring margin, both read-only views of the completed-game ledger.
export default function FranchiseCharts({ view }) {
  const curve = view.seasonCurve;
  const team = view.team?.code ?? null;
  const record = view.team ? `${view.team.wins}–${view.team.losses}` : null;
  return (
    <section className="court-panel frx-panel space-y-3 p-4" aria-labelledby="frx-charts-title">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className="frx-head-icon"><TrendingUp className="h-4 w-4" aria-hidden="true" /></span>
          <div><p className="bcast-kicker">Season pulse</p><h3 className="frx-title" id="frx-charts-title">Win curve{team ? ` · ${team}` : ''}</h3></div>
        </div>
        {record && <span className="frx-pill frx-pill--amber">{record} record</span>}
      </div>
      {!curve ? (
        <div className="chart-frame__empty">Charts appear after your first completed game.</div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          <div>
            <div className="chart-frame__head mb-1.5">
              <p className="chart-frame__title text-base">Cumulative results</p>
              <div className="flex gap-3">
                <span className="chart-frame__legend"><span style={{ background: 'hsl(var(--court-accent))' }} />Wins</span>
                <span className="chart-frame__legend"><span style={{ background: 'hsl(var(--court-trim-ink))' }} />Losses</span>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={190}>
              <LineChart data={curve} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
                <XAxis dataKey="game" tick={axisTick} axisLine={false} tickLine={false} />
                <YAxis tick={axisTick} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} labelFormatter={label => `Game ${label}`} />
                <Line type="monotone" dataKey="wins" stroke="hsl(var(--court-accent))" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="losses" stroke="hsl(var(--court-trim-ink))" strokeWidth={2} strokeDasharray="4 3" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div>
            <div className="chart-frame__head mb-1.5">
              <p className="chart-frame__title text-base">Margin per game</p>
              <p className="chart-frame__caption mt-0">Positive = win margin · negative = loss margin</p>
            </div>
            <ResponsiveContainer width="100%" height={190}>
              <BarChart data={curve} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
                <XAxis dataKey="game" tick={axisTick} axisLine={false} tickLine={false} />
                <YAxis tick={axisTick} axisLine={false} tickLine={false} />
                <ReferenceLine y={0} stroke="hsl(var(--border))" />
                <Tooltip contentStyle={tooltipStyle} labelFormatter={label => `Game ${label}`}
                  formatter={value => [`${value > 0 ? '+' : ''}${value} pts`, 'Margin']}
                  cursor={{ fill: 'hsl(var(--court-accent) / .08)' }} />
                <Bar dataKey="margin" radius={[2, 2, 0, 0]}>
                  {curve.map(row => (
                    <Cell key={row.game} fill={row.margin > 0 ? 'hsl(var(--court-accent))' : 'hsl(var(--court-trim))'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </section>
  );
}