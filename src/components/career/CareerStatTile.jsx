import React from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';

const TONES = { gold: 'text-gold', royal: 'text-royal', positive: 'text-positive' };

export default function CareerStatTile({ label, value, detail, tone = 'gold', icon: Icon, trend }) {
  const moving = Number.isFinite(trend) && Math.abs(trend) >= 0.05;
  return (
    <div className="metric-tile">
      {Icon && <Icon className="absolute right-3 top-3 h-4 w-4 text-muted-foreground/70" />}
      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className={`mt-2 font-display text-4xl leading-none ${TONES[tone]}`}>{value}</p>
      {moving && (
        <p className={`mt-2 flex items-center gap-1 text-[10px] font-medium ${trend > 0 ? 'text-positive' : 'text-destructive'}`}>
          {trend > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
          {trend > 0 ? '+' : ''}{trend.toFixed(1)} first → latest season
        </p>
      )}
      {detail && <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">{detail}</p>}
    </div>
  );
}