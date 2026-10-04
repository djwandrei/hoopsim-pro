import React from 'react';

export default function BoardControlStrip({ presentation, seed, onSeedChange, bare = false }) {
  if (!presentation) return null;
  const scope = presentation.packageRef.scope;
  const season = `${scope.seasonStartYear}-${String(scope.seasonEndYear).slice(2)}`;
  return (
    <div className={`dg-strip${bare ? ' dg-strip--bare' : ''}`}>
      <span className="dg-badge"><span className="h-1.5 w-1.5 rounded-full bg-positive" /> Board {presentation.dailySeed}</span>
      <span className="dg-badge dg-badge--plain">{season} · {presentation.packageRef.phase.replaceAll('_', ' ')}</span>
      
      <span className="dg-strip__spacer" />
      <label className="dg-date">
        Board date
        <input
          type="date"
          value={seed}
          onChange={(event) => {
            const value = event.target.value;
            if (/^\d{4}-\d{2}-\d{2}$/.test(value)) onSeedChange(value);
          }} />
        
      </label>
    </div>);

}