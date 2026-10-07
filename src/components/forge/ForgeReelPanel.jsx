import React from 'react';
import ForgeReel from '@/components/forge/ForgeReel';

// Left panel of the Build-A-Bucket layout: grades toggle, TEAM / PLAYER reels,
// and the spin or respin controls. Locked skills live in the forge dashboard.
export default function ForgeReelPanel({
  armedSkill = null,
  fast = false,
  showGrades, onToggleGrades, teamItems, playerItems, teamSpin, playerSpin, spinning,
  reveal, onSpin, spinDisabled, onRespinTeam, onRespinPlayer,
  teamRespins, playerRespins,
}) {
  const landed = Boolean(reveal);
  return <aside className="court-panel p-3" aria-label="Spin panel">
    <button type="button" onClick={onToggleGrades} className="flex min-h-8 w-full items-center justify-center rounded-lg border border-border/30 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground transition-colors hover:border-gold/40 hover:text-gold">
      {showGrades ? 'Turn off grades' : 'Turn on grades'}
    </button>
    <div className="mt-3 grid grid-cols-2 gap-2">
      <ForgeReel label="Team" items={teamItems} getKey={team => team.code} getPrimary={team => team.code} getSub={team => (team.name || team.code || '').split(' ').slice(-1)[0]} spinRequest={teamSpin} spinning={spinning} fast={fast} />
      <ForgeReel label="Player" items={playerItems} getKey={player => player.playerRef} getPrimary={player => player.name.split(' ')[0]} getSub={player => player.name.split(' ').slice(1).join(' ')} spinRequest={playerSpin} spinning={spinning} fast={fast} />
    </div>
    {!landed && <button type="button" onClick={onSpin} disabled={spinning || spinDisabled} className="mt-3 flex min-h-12 w-full items-center justify-center rounded-lg bg-primary text-sm font-bold uppercase tracking-[0.2em] text-primary-foreground transition-all hover:bg-goldSoft disabled:cursor-not-allowed disabled:opacity-40">
      {spinning ? 'Spinning…' : armedSkill ? `Spin for ${armedSkill.label}` : filled.length ? 'Spin again' : 'Spin'}
    </button>}
    {landed && <div className="mt-1.5 grid grid-cols-[1fr,auto,1fr] items-stretch gap-1.5">
      <button type="button" onClick={onRespinTeam} disabled={!teamRespins || spinning} className="flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-lg border border-trim/40 bg-trim/10 px-1 text-[10px] font-semibold uppercase tracking-wider text-trim-ink transition-colors hover:bg-trim/20 disabled:cursor-not-allowed disabled:opacity-40">
        <span>Respin team</span><span className="font-mono text-[9px] opacity-80">{teamRespins} left</span>
      </button>
      <div className="w-px bg-border/30" />
      <button type="button" onClick={onRespinPlayer} disabled={!playerRespins || spinning} className="flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-lg border border-gold/40 bg-gold/10 px-1 text-[10px] font-semibold uppercase tracking-wider text-gold transition-colors hover:bg-gold/20 disabled:cursor-not-allowed disabled:opacity-40">
        <span>Respin player</span><span className="font-mono text-[9px] opacity-80">{playerRespins} left</span>
      </button>
    </div>}
  </aside>;
}