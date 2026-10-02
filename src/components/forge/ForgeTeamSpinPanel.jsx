import React from 'react';
import ForgeReel from '@/components/forge/ForgeReel';
import PlayerPortrait from '@/components/players/PlayerPortrait';
import TeamMark from '@/components/studio/TeamMark';

// Left panel of the Team Forge: TEAM / PLAYER reels, spin + respin controls,
// and the revealed player waiting to be placed in the rotation.
export default function ForgeTeamSpinPanel({
  teamItems, playerItems, teamSpin, playerSpin, spinning, reveal, revealNote,
  onSpin, onRespinTeam, onRespinPlayer, teamRespins, playerRespins, filled, total,
}) {
  const landed = Boolean(reveal);
  return <aside className="court-panel p-3" aria-label="Spin panel">
    <p className="text-center font-mono text-[9px] uppercase tracking-[0.25em] text-gold">Roster {filled}/{total}</p>
    <div className="mt-3 grid grid-cols-2 gap-2">
      <ForgeReel label="Team" items={teamItems} getKey={team => team.code} getPrimary={team => team.code} getSub={team => (team.name || team.code || '').split(' ').slice(-1)[0]} spinRequest={teamSpin} spinning={spinning} />
      <ForgeReel label="Player" items={playerItems} getKey={player => player.playerRef} getPrimary={player => player.name.split(' ')[0]} getSub={player => player.name.split(' ').slice(1).join(' ')} spinRequest={playerSpin} spinning={spinning} />
    </div>
    {landed ? <div className="mt-3 grid grid-cols-[1fr,auto,1fr] items-stretch gap-1.5">
      <button type="button" onClick={onRespinTeam} disabled={!teamRespins || spinning} className="flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-lg border border-trim/40 bg-trim/10 px-1 text-[10px] font-semibold uppercase tracking-wider text-trim transition-colors hover:bg-trim/20 disabled:cursor-not-allowed disabled:opacity-40">
        <span>Respin team</span><span className="font-mono text-[9px] opacity-80">{teamRespins} left</span>
      </button>
      <div className="w-px bg-border/30" />
      <button type="button" onClick={onRespinPlayer} disabled={!playerRespins || spinning} className="flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-lg border border-gold/40 bg-gold/10 px-1 text-[10px] font-semibold uppercase tracking-wider text-gold transition-colors hover:bg-gold/20 disabled:cursor-not-allowed disabled:opacity-40">
        <span>Respin player</span><span className="font-mono text-[9px] opacity-80">{playerRespins} left</span>
      </button>
    </div> : <button type="button" onClick={onSpin} disabled={spinning} className="mt-3 flex min-h-12 w-full items-center justify-center rounded-lg bg-primary text-sm font-bold uppercase tracking-[0.2em] text-primary-foreground transition-all hover:bg-goldSoft disabled:cursor-not-allowed disabled:opacity-40">
      {spinning ? 'Spinning…' : 'Spin'}
    </button>}
    {reveal && <div className="mt-3 flex items-center gap-3 rounded-xl border border-border/30 bg-raised/50 p-2.5">
      <PlayerPortrait player={reveal} className="h-12 w-12" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-bold leading-tight">{reveal.name}</p>
        <p className="flex items-center gap-1 text-[10px] text-muted-foreground"><TeamMark code={reveal.teamCode} className="h-4 w-4" />{reveal.teamCode} · {reveal.pts?.toFixed(1)} PTS · {reveal.ast?.toFixed(1)} AST · {reveal.reb?.toFixed(1)} REB</p>
        {revealNote && <p className="mt-0.5 truncate font-mono text-[10px] text-gold">{revealNote}</p>}
      </div>
      {reveal.positions?.[0] && <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-royal/50 bg-royal/15 font-mono text-[10px] text-royal">{reveal.positions[0]}</span>}
    </div>}
    <p className="mt-4 text-center text-[10px] leading-relaxed text-muted-foreground">Spin lands on a random team and player — tap any open rotation spot to place them. Respins are shared across the whole draft.</p>
  </aside>;
}