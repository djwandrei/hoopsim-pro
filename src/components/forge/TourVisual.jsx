import React from 'react';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, ReferenceLine, Cell, CartesianGrid } from 'recharts';
import MetricTile from '@/components/studio/MetricTile';

// Horizontal, sorted margin chart: every opponent on its own row, wins in
// gold above the zero line, losses in trim below — much easier to scan than
// the old vertical column strip.
export default function TourVisual({ tour }) {
  const rows = [...tour.rows].sort((a, b) => b.margin - a.margin);
  return <div className="mt-5">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="court-kicker">One game vs every opponent</p>
      <div className="flex items-center gap-3 text-[9px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-sm bg-gold" />Win</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-sm bg-trim" />Loss</span>
      </div>
    </div>
    <div className="mt-2 rounded-xl border border-border/25 bg-canvas/30 p-2" role="img" aria-label="League tour point margins by opponent, sorted from best to worst">
      <div className="h-[30rem]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} layout="vertical" margin={{ left: 8, right: 24, top: 4, bottom: 4 }}>
            <CartesianGrid horizontal={false} stroke="hsl(var(--border) / .18)" />
            <XAxis type="number" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 9, fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} tickFormatter={value => (value > 0 ? `+${value}` : value)} />
            <YAxis type="category" dataKey="code" width={42} interval={0} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 9, fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} />
            <Tooltip
              cursor={{ fill: 'hsl(var(--court-raised) / .3)' }}
              contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border) / .4)', borderRadius: 10, fontSize: 11 }}
              formatter={value => [`${value > 0 ? '+' : ''}${value} · ${value > 0 ? 'win' : 'loss'}`, 'Point margin']}
              labelFormatter={code => {
                const row = rows.find(item => item.code === code);
                return `${code} — ${row && row.margin > 0 ? 'Composite wins' : 'Opponent wins'}`;
              }}
            />
            <ReferenceLine x={0} stroke="hsl(var(--border))" />
            <Bar dataKey="margin" barSize={11} radius={[0, 4, 4, 0]} isAnimationActive={false}>
              {rows.map(row => <Cell key={row.code} fill={row.margin > 0 ? 'hsl(var(--court-accent))' : 'hsl(var(--court-trim))'} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
    <p className="mt-2 text-[10px] text-muted-foreground">Local simulation · each bar is the composite’s point margin against one opponent, sorted best to worst.</p>
  </div>;
}