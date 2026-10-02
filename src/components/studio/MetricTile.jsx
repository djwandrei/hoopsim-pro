import React from 'react';
export default function MetricTile({ label, value, detail, tone = 'gold' }) {
  return <div className="metric-tile"><p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{label}</p><p className={tone === 'royal' ? 'mt-2 font-display text-4xl leading-none text-royal' : tone === 'positive' ? 'mt-2 font-display text-4xl leading-none text-positive' : 'mt-2 font-display text-4xl leading-none text-gold'}>{value}</p>{detail && <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">{detail}</p>}</div>;
}