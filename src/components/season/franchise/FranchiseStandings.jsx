import React from 'react';
import { Trophy } from 'lucide-react';
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { FranchiseTeamMark } from './FranchiseTeamMark';

// League rail: a win-pace chart of the full ladder plus the compact ladder
// with a win-rate bar per team; the controlled team stays lit.
export default function FranchiseStandings({ view, onFocusTeam }) {
  const rows = view.records || [];
  const userCode = view.team?.code || null;
  const leader = rows[0];
  const chartData = rows.map(row => ({ code: row.code, wins: row.wins, pct: row.games ? Math.round((row.wins / row.games) * 100) : 0 }));
  return (
    <section className="court-panel frx-panel space-y-2.5 p-4" aria-labelledby="frx-standings-title">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className="frx-head-icon"><Trophy className="h-4 w-4" aria-hidden="true" /></span>
          <div><p className="bcast-kicker">League rail</p><h3 className="frx-title">Team records</h3></div>
        </div>
        {leader && <span className="frx-pill frx-pill--amber">Leader · {leader.code} {leader.wins}–{leader.losses}</span>}
      </div>
      {rows.length ? (
        <>
          <div className="frx-scroll pr-1" aria-label="Win-pace chart, every team's wins">
            <ResponsiveContainer width="100%" height={Math.max(180, rows.length * 17 + 28)}>
              <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 30, bottom: 0, left: 0 }}>
                <XAxis type="number" hide domain={[0, 'dataMax']} />
                <YAxis type="category" dataKey="code" width={46}
                  tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10, fontFamily: 'var(--font-mono)' }}
                  axisLine={false} tickLine={false} interval={0} />
                <Tooltip cursor={{ fill: 'hsl(var(--court-accent) / .08)' }}
                  contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border) / .5)', borderRadius: '.5rem', fontSize: '.72rem', color: 'hsl(var(--foreground))' }}
                  formatter={(value, name, entry) => [`${value} wins · ${entry?.payload?.pct ?? 0}%`, 'Record']}
                  labelStyle={{ color: 'hsl(var(--foreground))', fontWeight: 600 }} />
                <Bar dataKey="wins" radius={[0, 3, 3, 0]} barSize={9}>
                  {chartData.map(row => (
                    <Cell key={row.code} fill={row.code === userCode ? 'hsl(var(--court-accent))' : 'hsl(var(--court-royal) / .55)'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="frx-standings">
            {rows.map((row, index) => {
              const games = row.games || 1;
              const pct = Math.round((row.wins / games) * 100);
              return (
                <button key={row.code} type="button"
                  className={`frx-standing-row w-full text-left ${row.code === userCode ? 'frx-standing-row--focus' : ''}`}
                  onClick={onFocusTeam ? () => onFocusTeam(row.code) : undefined}>
                  <span className="frx-standing-row__rank">{String(index + 1).padStart(2, '0')}</span>
                  <span className="flex min-w-0 items-center gap-2">
                    <FranchiseTeamMark code={row.code} />
                    <span className="truncate font-display text-sm tracking-wide">{row.code}</span>
                  </span>
                  <span className="frx-standing-row__record">{row.wins}–{row.losses}</span>
                  <span className={`frx-standing-bar ${row.code === userCode ? 'frx-standing-bar--user' : ''}`} title={`${pct}% wins`}><span style={{ width: `${pct}%` }} /></span>
                </button>
              );
            })}
          </div>
        </>
      ) : (
        <p className="frx-note">No team records.</p>
      )}
    </section>
  );
}