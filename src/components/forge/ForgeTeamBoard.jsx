import React from 'react';
import PlayerPortrait from '@/components/players/PlayerPortrait';
import TeamMark from '@/components/studio/TeamMark';
import { positionFits } from './forgeSimulation';

// Depth chart: one clean row per rotation slot — position tag, player, role
// notes — with the starting five above the bench unit. After a spin, open
// slots light up; matching positions glow as a suggested fit.
export default function ForgeTeamBoard({ slots, picks, reveal, revealPositions = [], spinning, onAssign, onSwap, onMinutes }) {
  const filled = slots.filter(slot => picks[slot.key]).length;

  const slotRow = slot => {
    const pick = picks[slot.key];
    const live = Boolean(reveal) && !pick && !spinning;
    const fit = live && positionFits(revealPositions, slot.key);
    if (pick) return <div key={slot.key} className="slot-pop flex items-center gap-3 rounded-lg border border-border/30 bg-raised/40 px-2.5 py-2">
      <span className="w-12 shrink-0 rounded-md border border-gold/25 bg-gold/10 py-1 text-center font-mono text-[9px] font-semibold uppercase tracking-wider text-gold">{slot.label}</span>
      <PlayerPortrait player={pick.player} className="h-9 w-9" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[12px] font-semibold leading-tight">{pick.player.name}</p>
        <p className="flex items-center gap-1 font-mono text-[9px] text-muted-foreground"><TeamMark code={pick.player.teamCode} className="h-5 w-5" />{pick.player.teamCode} · {pick.player.pts?.toFixed(1)} PPG</p>
      </div>
      <div className="grid shrink-0 gap-1">
        {onMinutes ? <label className="text-[10px]">Minutes<input type="number" min="0" max="48" value={slot.minutes} onChange={e => onMinutes(slot.key, e.target.value)} aria-label={`${pick.player.name} rotation minutes`} className="studio-input w-16" /></label> : <span className="text-[10px]">{slot.minutes} min</span>}
        {onSwap && <select value="" aria-label={`Swap ${pick.player.name} with another rotation slot`} onChange={e => onSwap(slot.key, e.target.value)} className="studio-select max-w-24 text-[10px]"><option value="">Swap spot</option>{slots.filter(s => s.key !== slot.key && picks[s.key]).map(s => <option key={s.key} value={s.key}>{s.label}</option>)}</select>}
      </div>
    </div>;
    return <button key={slot.key} type="button" disabled={!live} onClick={() => onAssign(slot.key)}
      className={`flex min-h-14 w-full items-center gap-3 rounded-lg border border-dashed px-2.5 py-2 text-left transition-colors ${fit ? 'cursor-pointer border-gold/70 bg-gold/10 shadow-[0_0_14px_rgba(233,185,73,0.16)]' : live ? 'cursor-pointer border-gold/50 bg-gold/5 wheel-chip-active' : 'cursor-default border-border/30 bg-canvas/20'}`}>
      <span className={`w-12 shrink-0 rounded-md border py-1 text-center font-mono text-[9px] font-semibold uppercase tracking-wider ${fit || live ? 'border-gold/40 bg-gold/10 text-gold' : 'border-border/25 text-muted-foreground'}`}>{slot.label}</span>
      <p className={`min-w-0 flex-1 text-[11px] font-semibold uppercase tracking-wider ${fit || live ? 'text-gold' : 'text-muted-foreground/85'}`}>{fit ? '★ Suggested fit — place here' : live ? 'Place here' : 'Open'}</p>
      <span className="shrink-0 rounded-md border border-border/25 bg-canvas/40 px-2 py-1 font-mono text-[9px] uppercase tracking-wider text-muted-foreground/70">{slot.minutes} min</span>
    </button>;
  };

  const section = (label, list) => <React.Fragment>
    <div className="mt-4 flex items-center gap-2">
      <span className="court-kicker">{label}</span>
      <span className="h-px flex-1 bg-gradient-to-r from-gold/40 to-transparent" />
      <span className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">{list.filter(slot => picks[slot.key]).length}/{list.length}</span>
    </div>
    <div className="mt-2 grid gap-1.5">{list.map(slotRow)}</div>
  </React.Fragment>;

  return <section aria-label="Rotation board" className="court-panel relative overflow-hidden p-4">
    <span className="bcast-watermark" aria-hidden="true">FRG</span>
    <header className="relative flex flex-wrap items-center justify-between gap-2">
      <div>
        <p className="bcast-kicker">Team forge</p>
        <h2 className="broadcast-gradient-text mt-0.5 font-display text-2xl tracking-wide">DEPTH CHART</h2>
      </div>
      <span className="rounded-full border border-gold/30 bg-gold/5 px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-gold">{filled}/{slots.length} rostered</span>
    </header>
    {section('Starting five', slots.filter(slot => slot.starter))}
    {section('Bench unit', slots.filter(slot => !slot.starter))}
    <p className="relative mt-4 text-[10px] leading-relaxed text-muted-foreground">{slots.reduce((s, row) => s + row.minutes, 0)} / 240 rotation minutes. Gold suggests a compatible position; playing out of position carries a modest simulation penalty. Players remain locked until you restart.</p>
  </section>;
}
