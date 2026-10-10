import React from 'react';
export default function ForgeDraftSettings({ sampling, onSampling, repeatDonors, onRepeat, seed, onSeed, locked = false }) {
  return <details className="court-panel p-3"><summary className="cursor-pointer text-xs font-semibold text-gold">Draft rules & reproducibility</summary><div className="mt-3 grid gap-3 sm:grid-cols-3">
    <label className="text-xs">Draw odds<select disabled={locked} className="studio-select mt-1 w-full" value={sampling} onChange={e => onSampling(e.target.value)}><option value="player">Equal chance per eligible player</option><option value="team">Equal team, then equal player</option></select></label>
    <label className="text-xs">Draft seed<input disabled={locked} type="number" min="0" max="4294967295" className="studio-input mt-1 w-full" value={seed} onChange={e => onSeed(Math.max(0, Math.min(4294967295, Number(e.target.value) || 0)) >>> 0)} /></label>
    {onRepeat && <label className="flex items-center gap-2 text-xs"><input disabled={locked} type="checkbox" checked={repeatDonors} onChange={e => onRepeat(e.target.checked)} />Allow the same donor in different skills</label>}
  </div><p className="mt-2 text-xs text-muted-foreground">Eligible observed regular seasons: at least 15 games and 300 minutes. Missing skill estimates cannot be drafted. A seed repeats the draw sequence with the same pool and rules.</p></details>;
}
