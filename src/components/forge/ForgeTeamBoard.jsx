import React from 'react';
import PlayerPortrait from '@/components/players/PlayerPortrait';
import TeamMark from '@/components/studio/TeamMark';

// Rotation board: a starting five row above a bench unit row. After a spin,
// open slots light up — matching positions glow solid as a suggested fit.
export default function ForgeTeamBoard({ slots, picks, reveal, revealPositions = [], spinning, onAssign, onUndo }) {
  const filled = slots.filter(slot => picks[slot.key]).length;
  const starters = slots.filter(slot => slot.starter);
  const bench = slots.filter(slot => !slot.starter);

  const slotButton = slot => {
    const pick = picks[slot.key];
    const live = Boolean(reveal) && !pick && !spinning;
    const fit = live && revealPositions.includes(slot.key);
    if (pick) return <button key={slot.key} type="button" onClick={() => onUndo(slot.key)} title="Release player" className="slot-pop flex w-full flex-col items-center gap-1 rounded-xl border border-gold/25 bg-gradient-to-b from-raised/60 to-canvas/40 p-2.5 transition-colors hover:border-trim/60">
      <span className="self-start rounded-md border border-gold/30 bg-gold/10 px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-[0.15em] text-gold">{slot.label} · {slot.minutes} MIN</span>
      <PlayerPortrait player={pick.player} className="h-14 w-14" />
      <span className="w-full truncate text-center text-[11px] font-bold leading-tight">{pick.player.name}</span>
      <span className="flex items-center gap-1 font-mono text-[9px] text-muted-foreground"><TeamMark code={pick.player.teamCode} className="h-3.5 w-3.5" />{pick.player.teamCode} · {pick.player.pts?.toFixed(1)}p</span>
    </button>;
    return <button key={slot.key} type="button" disabled={!live} onClick={() => onAssign(slot.key)} className={`flex min-h-28 w-full flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed p-2.5 transition-colors ${fit ? 'cursor-pointer border-gold/70 bg-gold/15 shadow-[0_0_16px_rgba(233,185,73,0.2)]' : live ? 'cursor-pointer border-gold/60 bg-gold/5 wheel-chip-active' : 'cursor-default border-border/40 bg-canvas/30'}`}>
      <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground">{slot.label}</span>
      {live ? <span className="rounded-md border border-gold/60 bg-gold/10 px-2 py-1 text-center text-[10px] font-semibold uppercase tracking-wider text-gold">{fit ? '★ Fit — place here' : 'Place here'}</span>
        : <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground/60">{slot.minutes} min · open</span>}
    </button>;
  };

  const section = (label, list, grid) => <React.Fragment>
    <div className="mt-4 flex items-center gap-2">
      <span className="court-kicker">{label}</span>
      <span className="h-px flex-1 bg-gradient-to-r from-gold/40 to-transparent" />
    </div>
    <div className={`mt-2 ${grid}`}>{list.map(slotButton)}</div>
  </React.Fragment>;

  return <section aria-label="Rotation board" className="court-panel relative overflow-hidden p-4">
    <span className="bcast-watermark" aria-hidden="true">FRG</span>
    <header className="relative flex flex-wrap items-center justify-between gap-2">
      <div>
        <p className="bcast-kicker">Team forge</p>
        <h2 className="broadcast-gradient-text mt-0.5 font-display text-2xl tracking-wide">ROTATION BOARD</h2>
      </div>
      <span className="rounded-full border border-gold/30 bg-gold/5 px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-gold">{filled}/{slots.length} rostered</span>
    </header>
    {section('Starting five', starters, 'grid grid-cols-2 gap-2 sm:grid-cols-5')}
    {section('Bench unit', bench, 'grid grid-cols-1 gap-2 sm:grid-cols-3')}
    <p className="relative mt-3 text-center text-[10px] text-muted-foreground">Starters log heavy minutes in the sim — your best players belong up top. When a landed player's position matches a slot, it glows as a suggested fit. Tap a filled spot to release them.</p>
  </section>;
}