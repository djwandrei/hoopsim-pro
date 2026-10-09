import React from 'react';
export default function PlayerContextTiles({ bio, status }) {
  if (status === 'loading') return <p className="mt-3 text-xs text-muted-foreground">Loading player details…</p>;
  const fields = [
    ['Jersey', bio?.jerseyNumber !== null && bio?.jerseyNumber !== undefined && bio?.jerseyNumber !== '' ? `#${bio.jerseyNumber}` : null],
    ['Height', bio?.height?.display || null],
    ['College', bio?.college || null],
    ['Country', bio?.country || null],
  ];
  return <div className="mt-3 flex flex-wrap gap-2">{fields.map(([label,value]) => <div key={label} className="min-w-[7.5rem] flex-1 rounded-xl border border-border/25 bg-canvas/35 px-3 py-2.5 transition-colors hover:border-gold/35"><p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{label}</p><p className={`mt-1 text-sm ${value ? 'text-foreground' : 'text-muted-foreground'}`}>{value ?? '—'}</p></div>)}</div>;
}
