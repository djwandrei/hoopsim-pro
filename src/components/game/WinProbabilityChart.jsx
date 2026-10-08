import React, { useMemo } from 'react';
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

// Brownian-motion win probability: a lead is worth more the less time is left.
// SIGMA approximates the typical std dev of a final NBA margin (points).
const SIGMA = 12;
const clamp = value => Math.min(98, Math.max(2, value));
const erf = x => {
  const sign = x < 0 ? -1 : 1;
  const abs = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * abs);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-abs * abs);
  return sign * y;
};
const normCdf = z => 0.5 * (1 + erf(z / Math.SQRT2));

function winProbabilitySeries(events, homeCode, awayCode) {
  const total = events.length || 1;
  const rows = [{ play: 0, homeProb: 50, awayProb: 50, label: 'PREGAME', homeCode, awayCode }];
  events.forEach((event, index) => {
    const margin = event.score[0] - event.score[1];
    const remaining = Math.max(1 - (index + 1) / total, 0.05);
    const prob = event.type === 'final'
      ? (margin > 0 ? 99 : margin < 0 ? 1 : 50)
      : clamp(normCdf(margin / (SIGMA * Math.sqrt(remaining))) * 100);
    rows.push({
      play: index + 1, homeProb: prob, awayProb: 100 - prob,
      q: event.q, label: event.type === 'final' ? 'FINAL' : `${event.q} ${event.clock}`,
      margin, homeCode, awayCode,
    });
  });
  return rows;
}

const tip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  const home = Math.round(row.homeProb);
  return (
    <div className="rounded-lg border border-border/50 bg-card px-3 py-2 text-xs shadow-lg">
      <p className="font-semibold text-foreground">{row.label}</p>
      <p className="mt-1 font-mono" style={{ color: 'var(--matchup-home-color, var(--myna-accent))' }}>{row.homeCode} {home}%</p>
      <p className="font-mono" style={{ color: 'var(--matchup-away-color, var(--myna-accent))' }}>{row.awayCode} {100 - home}%</p>
      {row.label !== 'PREGAME' && row.label !== 'FINAL' && <p className="mt-1 font-mono myna-muted">Margin {row.margin > 0 ? '+' : ''}{row.margin}</p>}
    </div>
  );
};

// Live win-probability area chart: the bottom band is the home side's chance,
// the top band the away side's — each in that team's primary color.
export default function WinProbabilityChart({ events, count, homeCode, awayCode, onHoverPlay }) {
  const series = useMemo(() => winProbabilitySeries(events, homeCode, awayCode), [events, homeCode, awayCode]);
  const quarterMarks = useMemo(() => {
    const marks = [];
    let last = null;
    series.forEach(row => {
      if (row.play > 0 && row.q && row.q !== last) { last = row.q; marks.push(row.play); }
    });
    return marks;
  }, [series]);
  const data = series.slice(0, Math.min(count + 1, series.length));
  const homeProb = Math.round(data[data.length - 1]?.homeProb ?? 50);
  const gradId = `wp-${homeCode}-${awayCode}`;

  return (
    <section className="myna-panel p-4" aria-label="Live win probability">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="myna-accent-text text-[10px] font-semibold uppercase tracking-[0.2em]">Win probability</p>
        <span className="myna-mono text-[11px] myna-muted">
          <span style={{ color: 'var(--matchup-away-color, var(--myna-accent))' }}>{awayCode} {100 - homeProb}%</span>
          {' · '}
          <span style={{ color: 'var(--matchup-home-color, var(--myna-accent))' }}>{homeCode} {homeProb}%</span>
        </span>
      </div>
      <div className="mt-2 h-40">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 6, left: -22, bottom: 0 }} onMouseMove={event => { if (typeof event?.activeTooltipIndex === 'number') onHoverPlay?.(event.activeTooltipIndex + 1); }} onMouseLeave={() => onHoverPlay?.(null)}>
            <defs>
              <linearGradient id={`${gradId}-home`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--matchup-home-chart, var(--matchup-home-primary))" stopOpacity={0.75} />
                <stop offset="100%" stopColor="var(--matchup-home-chart, var(--matchup-home-primary))" stopOpacity={0.2} />
              </linearGradient>
              <linearGradient id={`${gradId}-away`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--matchup-away-chart, var(--matchup-away-primary))" stopOpacity={0.2} />
                <stop offset="100%" stopColor="var(--matchup-away-chart, var(--matchup-away-primary))" stopOpacity={0.75} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="hsl(var(--border) / .3)" vertical={false} />
            <XAxis dataKey="play" hide />
            <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tickFormatter={value => `${value}%`} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10.4 }} width={54} />
            <Tooltip content={tip} cursor={{ stroke: 'hsl(var(--border))' }} />
            <ReferenceLine x={data[data.length - 1]?.play} stroke="hsl(var(--court-accent))" strokeWidth={2} />
            <ReferenceLine y={50} stroke="hsl(var(--border) / .6)" strokeDasharray="4 4" />
            {quarterMarks.map(mark => <ReferenceLine key={mark} x={mark} stroke="hsl(var(--border) / .35)" />)}
            <Area dataKey="homeProb" stackId="wp" isAnimationActive={false} stroke="var(--matchup-home-chart, var(--matchup-home-primary))" strokeWidth={1.5} fill={`url(#${gradId}-home)`} />
            <Area dataKey="awayProb" stackId="wp" isAnimationActive={false} stroke="var(--matchup-away-chart, var(--matchup-away-primary))" strokeWidth={1.5} fill={`url(#${gradId}-away)`} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-2 text-[10.4px] leading-relaxed myna-muted">Lead-protection estimate: the same margin is worth more with less time remaining. Vertical ticks mark quarter breaks.</p>
    </section>
  );
}