import React from 'react';
import { Play } from 'lucide-react';

// Team Forge setup screen shared by both team games — a two-column briefing
// matching the ForgeSetupPanel treatment: the mode story, pool state and
// numbered workflow on the left, and the eight-slot rotation map with the
// 98-0 win condition on the right.
export default function ForgeTeamSetupPanel({ pickMode, slots, poolCount, onStart }) {
  const steps = pickMode
    ? ['Spin a team', 'Pick from the roster', 'Simulate 82 + playoffs']
    : ['Spin team & player', 'Place in the rotation', 'Simulate 82 + playoffs'];
  const respinNote = pickMode ? '2 team respins per draft' : '2 team respins · 3 player respins';
  return <section className="court-panel relative overflow-hidden p-5 sm:p-7">
    <span className="bcast-watermark" aria-hidden="true">98-0</span>
    <div className="relative grid items-start gap-7 lg:grid-cols-[minmax(0,1fr),minmax(0,21rem)]">
      <div className="min-w-0">
        <p className="bcast-kicker">98-0 chase</p>
        <h2 className="broadcast-gradient-text mt-1.5 font-display text-4xl leading-none sm:text-5xl">SPIN · PLACE · CHASE 98-0</h2>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">{pickMode
          ? 'Spin the reel for a random team, then choose any player from their roster and tap an open rotation spot to place them.'
          : 'Spin the reels for a random team and player, then tap any open rotation spot to place them.'}
          {' '}Fill the five starter slots and three bench spots — then simulate the full 82-game season and playoff bracket.</p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="bcast-lowerthird"><span className="bcast-lowerthird__bar" aria-hidden="true"></span>{poolCount} player seasons armed</span>
          <span className="rounded-lg border border-border/30 bg-raised/50 px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{respinNote}</span>
        </div>
        <ol className="mt-5 grid gap-2 sm:grid-cols-3">
          {steps.map((step, index) => <li key={step} className="flex items-center gap-2.5 rounded-xl border border-border/30 bg-raised/40 px-3 py-2.5">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-gold/40 bg-gold/10 font-mono text-[10px] font-bold text-gold">{index + 1}</span>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-foreground">{step}</span>
          </li>)}
        </ol>
        <div className="mt-6"><button type="button" onClick={onStart} disabled={!poolCount} className="book-cta inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-8 text-sm font-semibold uppercase tracking-wider text-primary-foreground transition-all hover:translate-y-px hover:bg-goldSoft disabled:cursor-not-allowed disabled:opacity-40"><Play className="h-4 w-4" />Start the draft</button></div>
      </div>
      <aside className="min-w-0 rounded-2xl border border-border/30 bg-raised/30 p-4" aria-label="Rotation map">
        <p className="bcast-kicker">Rotation map</p>
        <p className="mt-1 text-[11px] text-muted-foreground">Eight spots to fill — five starters lead, three benches ride the rotation.</p>
        <div className="mt-3 grid grid-cols-5 gap-1.5">
          {slots.filter(slot => slot.starter).map(slot => <span key={slot.key} className="rounded-lg border border-gold/40 bg-gold/10 px-1 py-2 text-center font-mono text-[10px] font-bold text-gold">{slot.label}<span className="mt-0.5 block font-mono text-[9px] font-normal opacity-80">{slot.minutes}m</span></span>)}
        </div>
        <div className="mt-1.5 grid grid-cols-3 gap-1.5">
          {slots.filter(slot => !slot.starter).map(slot => <span key={slot.key} className="rounded-lg border border-border/30 px-1 py-2 text-center font-mono text-[10px] text-muted-foreground">{slot.label}<span className="mt-0.5 block font-mono text-[9px] opacity-80">{slot.minutes}m</span></span>)}
        </div>
        <p className="mt-3 rounded-lg border border-gold/30 bg-gold/10 px-3 py-2 text-[11px] leading-relaxed text-gold">The flawless run: a perfect 82-0 regular season plus a spotless 16-0 playoff title run.</p>
      </aside>
    </div>
  </section>;
}