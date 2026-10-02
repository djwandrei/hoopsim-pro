import React from 'react';
import ForgeReel from '@/components/forge/ForgeReel';
import TeamMark from '@/components/studio/TeamMark';

// Left panel of the Team Forge: TEAM / PLAYER reels and the spin or respin
// controls only — the revealed player lives in the wide showcase beside it.
export default function ForgeTeamSpinPanel({
  teamItems, playerItems, teamSpin, playerSpin, spinning, pending = false,
  onSpin, onRespinTeam, onRespinPlayer, teamRespins, playerRespins, filled, total,
}) {
  const landed = Boolean(teamSpin?.targetKey) && !spinning;
  return <aside className="court-panel p-3" aria-label="Spin panel">
    <p className="text-center font-mono text-[9px] uppercase tracking-[0.25em] text-gold">Roster {filled}/{total}</p>
    <div className="mt-3 grid grid-cols-2 gap-2">
      <ForgeReel label="Team" items={teamItems} getKey={team => team.code} getPrimary={team => team.code} getSub={team => (team.name || team.code || '').split(' ').slice(-1)[0]} spinRequest={teamSpin} spinning={spinning} />
      <ForgeReel label="Player" items={playerItems} getKey={player => player.playerRef} getPrimary={player => player.name.split(' ')[0]} getSub={player => player.name.split(' ').slice(1).join(' ')} spinRequest={playerSpin} spinning={spinning} />
    </div>
    {!pending && <button type="button" onClick={onSpin} disabled={spinning} className="mt-3 flex min-h-12 w-full items-center justify-center rounded-lg bg-primary text-sm font-bold uppercase tracking-[0.2em] text-primary-foreground transition-all hover:bg-goldSoft disabled:cursor-not-allowed disabled:opacity-40">
      {spinning ? 'Spinning…' : landed ? 'Spin again' : 'Spin'}
    </button>}
    {landed && <div className="mt-1.5 grid grid-cols-[1fr,auto,1fr] items-stretch gap-1.5">
      <button type="button" onClick={onRespinTeam} disabled={!teamRespins || spinning} className="flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-lg border border-trim/40 bg-trim/10 px-1 text-[10px] font-semibold uppercase tracking-wider text-trim transition-colors hover:bg-trim/20 disabled:cursor-not-allowed disabled:opacity-40">
        <span>Respin team</span><span className="font-mono text-[9px] opacity-80">{teamRespins} left</span>
      </button>
      <div className="w-px bg-border/30" />
      <button type="button" onClick={onRespinPlayer} disabled={!playerRespins || spinning} className="flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-lg border border-gold/40 bg-gold/10 px-1 text-[10px] font-semibold uppercase tracking-wider text-gold transition-colors hover:bg-gold/20 disabled:cursor-not-allowed disabled:opacity-40">
        <span>Respin player</span><span className="font-mono text-[9px] opacity-80">{playerRespins} left</span>
      </button>
    </div>}
    <p className="mt-4 text-center text-[10px] leading-relaxed text-muted-foreground">Spin lands on a random team and player — their full stat line lands in the showcase. Tap any open rotation spot to place them. Respins are shared across the whole draft.</p>
  </aside>;
}