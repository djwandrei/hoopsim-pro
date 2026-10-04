import React from 'react';

// Court / depth-chart view toggle, shown inside the "How this run works" bar.
export default function LineupViewToggle({ value, onChange }) {
  return (
    <div
      className="inline-flex rounded-lg border border-border/40 bg-canvas/60 p-0.5"
      role="tablist"
      aria-label="Lineup view"
    >
      {[['court', 'Court'], ['depth', 'Depth chart']].map(([key, label]) => (
        <button
          key={key}
          type="button"
          role="tab"
          aria-selected={value === key}
          onClick={() => onChange(key)}
          className={`h-9 px-3.5 rounded-md font-mono text-[0.6rem] font-semibold uppercase tracking-[0.14em] transition-colors ${value === key ? 'bg-gold text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
        >{label}</button>
      ))}
    </div>
  );
}