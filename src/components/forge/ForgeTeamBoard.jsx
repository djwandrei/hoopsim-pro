import React from 'react';
import PlayerPortrait from '@/components/players/PlayerPortrait';
import TeamMark from '@/components/studio/TeamMark';

// Rotation board: five starter spots on top, three bench spots below.
// After a spin, any open spot lights up — tap one to place the revealed player.
export default function ForgeTeamBoard({ slots, picks, reveal, revealPositions = [], spinning, onAssign, onUndo }) {
  const filled = slots.filter(slot => picks[slot.key]).length;
  const starters = slots.filter(slot => slot.starter);
  const bench = slots.filter(slot => !slot.starter);
  const slotButton = slot => {
    const pick = picks[slot.key];
    const live = Boolean(reveal) && !pick && !spinning;
    const fit = live && revealPositions.includes(slot.key);
    if (pick) return <button key={slot.key} type="button" onClick={() => onUndo(slot.key)} title="Release player" className="slot-pop flex w-full flex-col items-center gap-1.5 rounded-xl border border-gold/30 bg-raised/40 p-2.5 transition-colors hover:border-trim/60">
      <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-gold">{slot.label}</span>
      <PlayerPortrait player={pick.player} className="h-14 w-14" />
      <span className="w-full truncate text-center text-[11px] font-bold leading-tight">{pick.player.name}</span>
      <span className="flex items-center gap-1 font-mono text-[9px] text-muted-foreground"><TeamMark code={pick.player.teamCode} className="h-3.5 w-3.5" />{pick.player.teamCode} · {pick.player.pts?.toFixed(1)}p</span>
    </button>;
    return <button key={slot.key} type="button" disabled={!live} onClick={() => onAssign(slot.key)} className={`flex min-h-24 w-full flex-col items-center justify-center gap-1.5 rounded-xl border p-2.5 transition-colors ${fit ? 'cursor-pointer border-gold/70 bg-gold/15 shadow-[0_0_16px_rgba(233,185,73,0.2)]' : live ? 'cursor-pointer border-dashed border-gold/60 bg-gold/5 wheel-chip-active' : 'cursor-default border-dashed border-border/40 bg-canvas/30'}`}>
      <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground">{slot.label}</span>
      {live ? <span className="rounded-md border border-gold/60 bg-gold/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-gold">{fit ? '★ Fit — place here' : 'Place here'}</span> : <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70">Open</span>}
    </button>;
  };
  return <section aria-label="Rotation board" className="court-panel p-4">
    <header className="flex flex-wrap items-center justify-between gap-2">
      <div>
        <p className="court-kicker">Team Forge</p>
        <h2 className="mt-0.5 font-display text-2xl tracking-wide">ROTATION BOARD</h2>
      </div>
      <span className="rounded-full border border-gold/30 bg-gold/5 px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-gold">{filled}/{slots.length} rostered</span>
    </header>
    <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">{starters.map(slotButton)}</div>
    <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">{bench.map(slotButton)}</div>
    <p className="mt-3 text-center text-[10px] text-muted-foreground">Starters log heavy minutes in the sim — your best players belong up top. Tap a filled spot to release them.</p>
  </section>;
}