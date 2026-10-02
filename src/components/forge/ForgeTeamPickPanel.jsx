import React from 'react';
import ForgeReel from '@/components/forge/ForgeReel';
import PlayerPortrait from '@/components/players/PlayerPortrait';
import TeamMark from '@/components/studio/TeamMark';

// Left panel of the Team Forge · Pick variant: a single TEAM reel plus the
// landed team's available roster — pick any player, then place them on the board.
export default function ForgeTeamPickPanel({
  teamItems, teamSpin, spinning, activeTeam, roster, selectedRef,
  onSpin, onRespinTeam, teamRespins, filled, total, onPick,
}) {
  return <aside className="court-panel p-3" aria-label="Team pick panel">
    <p className="text-center font-mono text-[9px] uppercase tracking-[0.25em] text-gold">Roster {filled}/{total}</p>
    <div className="mt-3">
      <ForgeReel label="Team" items={teamItems} getKey={team => team.code} getPrimary={team => team.code} getSub={team => (team.name || team.code || '').split(' ').slice(-1)[0]} spinRequest={teamSpin} spinning={spinning} />
    </div>
    {activeTeam ? <button type="button" onClick={onRespinTeam} disabled={!teamRespins || spinning} className="mt-3 flex min-h-10 w-full flex-col items-center justify-center gap-0.5 rounded-lg border border-trim/40 bg-trim/10 px-1 text-[10px] font-semibold uppercase tracking-wider text-trim transition-colors hover:bg-trim/20 disabled:cursor-not-allowed disabled:opacity-40">
      <span>Respin team</span><span className="font-mono text-[9px] opacity-80">{teamRespins} left</span>
    </button> : <button type="button" onClick={onSpin} disabled={spinning} className="mt-3 flex min-h-12 w-full items-center justify-center rounded-lg bg-primary text-sm font-bold uppercase tracking-[0.2em] text-primary-foreground transition-all hover:bg-goldSoft disabled:cursor-not-allowed disabled:opacity-40">
      {spinning ? 'Spinning…' : 'Spin'}
    </button>}
    {activeTeam && <div className="mt-3">
      <p className="text-center font-mono text-[9px] uppercase tracking-[0.25em] text-gold">{activeTeam.name} — pick any player</p>
      <div className="mt-2 max-h-[26rem] space-y-1.5 overflow-y-auto pr-1">
        {roster.map(player => <button key={player.playerRef} type="button" onClick={() => onPick(player)} className={`flex w-full items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left transition-colors ${selectedRef === player.playerRef ? 'border-gold/60 bg-gold/10' : 'border-border/25 bg-canvas/40 hover:border-gold/40'}`}>
          <PlayerPortrait player={player} className="h-9 w-9 shrink-0" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[11px] font-bold leading-tight">{player.name}</span>
            <span className="block font-mono text-[9px] text-muted-foreground">{player.positions?.[0] || '—'} · {player.pts?.toFixed(1)}p {player.ast?.toFixed(1)}a {player.reb?.toFixed(1)}r</span>
          </span>
          {selectedRef === player.playerRef && <span className="shrink-0 font-mono text-[9px] uppercase tracking-wider text-gold">Selected</span>}
        </button>)}
        {!roster.length && <p className="px-1 py-3 text-center text-[10px] text-muted-foreground">Every player on this roster is already drafted — respin the team.</p>}
      </div>
    </div>}
    <p className="mt-4 text-center text-[10px] leading-relaxed text-muted-foreground">Spin lands on a random team — pick any player from their roster, then tap an open rotation spot. Team respins are shared across the draft.</p>
  </aside>;
}