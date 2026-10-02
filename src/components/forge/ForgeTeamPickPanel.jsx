import React from 'react';
import ForgeReel from '@/components/forge/ForgeReel';

// Left panel of the Team Forge · Pick variant: a single TEAM reel plus spin and
// respin controls only — the roster lives in the wide board beside it.
export default function ForgeTeamPickPanel({
  teamItems, teamSpin, spinning, activeTeam, pending = false,
  onSpin, onRespinTeam, teamRespins, filled, total,
}) {
  return <aside className="court-panel p-3" aria-label="Team pick panel">
    <p className="text-center font-mono text-[9px] uppercase tracking-[0.25em] text-gold">Roster {filled}/{total}</p>
    <div className="mt-3">
      <ForgeReel label="Team" items={teamItems} getKey={team => team.code} getPrimary={team => team.code} getSub={team => (team.name || team.code || '').split(' ').slice(-1)[0]} spinRequest={teamSpin} spinning={spinning} />
    </div>
    {!pending && <button type="button" onClick={onSpin} disabled={spinning} className="mt-3 flex min-h-12 w-full items-center justify-center rounded-lg bg-primary text-sm font-bold uppercase tracking-[0.2em] text-primary-foreground transition-all hover:bg-goldSoft disabled:cursor-not-allowed disabled:opacity-40">
      {spinning ? 'Spinning…' : activeTeam ? 'Spin again' : 'Spin'}
    </button>}
    {activeTeam && <button type="button" onClick={onRespinTeam} disabled={!teamRespins || spinning} className="mt-1.5 flex min-h-10 w-full flex-col items-center justify-center gap-0.5 rounded-lg border border-trim/40 bg-trim/10 px-1 text-[10px] font-semibold uppercase tracking-wider text-trim transition-colors hover:bg-trim/20 disabled:cursor-not-allowed disabled:opacity-40">
      <span>Respin team</span><span className="font-mono text-[9px] opacity-80">{teamRespins} left</span>
    </button>}
    <p className="mt-4 text-center text-[10px] leading-relaxed text-muted-foreground">Spin lands on a random team — their full roster lands in the board. Pick any player, then tap an open rotation spot. Team respins are shared across the draft.</p>
  </aside>;
}