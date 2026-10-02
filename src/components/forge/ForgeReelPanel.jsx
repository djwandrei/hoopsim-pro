import React from 'react';
import ForgeReel from '@/components/forge/ForgeReel';
import PlayerPortrait from '@/components/players/PlayerPortrait';
import TeamMark from '@/components/studio/TeamMark';
import { SKILLS, gradeFor, gradeTone } from '@/components/forge/bapSkills';

const TONE_CHIP = {
  positive: 'border-positive/50 bg-positive/15 text-positive',
  royal: 'border-royal/50 bg-royal/15 text-royal',
  gold: 'border-gold/50 bg-gold/15 text-gold',
  trim: 'border-trim/50 bg-trim/15 text-trim',
};

// Left panel of the Build-A-Bucket layout: grades toggle, TEAM / PLAYER reels,
// the spin or respin controls, the revealed player card, and the skills list.
export default function ForgeReelPanel({
  armedSkill = null,
  showGrades, onToggleGrades, teamItems, playerItems, teamSpin, playerSpin, spinning,
  reveal, revealNote, onSpin, spinDisabled, onRespinTeam, onRespinPlayer,
  teamRespins, playerRespins, picks, leagueMax,
}) {
  const landed = Boolean(reveal);
  const filled = SKILLS.filter(skill => picks[skill.key]);
  return <aside className="court-panel p-3" aria-label="Spin panel">
    <button type="button" onClick={onToggleGrades} className="flex min-h-8 w-full items-center justify-center rounded-lg border border-border/30 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground transition-colors hover:border-gold/40 hover:text-gold">
      {showGrades ? 'Turn off grades' : 'Turn on grades'}
    </button>
    <div className="mt-3 grid grid-cols-2 gap-2">
      <ForgeReel label="Team" items={teamItems} getKey={team => team.code} getPrimary={team => team.code} getSub={team => (team.name || team.code || '').split(' ').slice(-1)[0]} spinRequest={teamSpin} spinning={spinning} />
      <ForgeReel label="Player" items={playerItems} getKey={player => player.playerRef} getPrimary={player => player.name.split(' ')[0]} getSub={player => player.name.split(' ').slice(1).join(' ')} spinRequest={playerSpin} spinning={spinning} />
    </div>
    {!landed && <button type="button" onClick={onSpin} disabled={spinning || spinDisabled} className="mt-3 flex min-h-12 w-full items-center justify-center rounded-lg bg-primary text-sm font-bold uppercase tracking-[0.2em] text-primary-foreground transition-all hover:bg-goldSoft disabled:cursor-not-allowed disabled:opacity-40">
      {spinning ? 'Spinning…' : armedSkill ? `Spin for ${armedSkill.label}` : filled.length ? 'Spin again' : 'Spin'}
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
    {reveal && <div className="mt-3 flex items-center gap-3 rounded-xl border border-border/30 bg-raised/50 p-2.5">
      <PlayerPortrait player={reveal} className="h-12 w-12" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-bold leading-tight">{reveal.name}</p>
        <p className="flex items-center gap-1 text-[10px] text-muted-foreground"><TeamMark code={reveal.teamCode} className="h-4 w-4" />{reveal.teamCode}</p>
        {revealNote && <p className="mt-0.5 truncate font-mono text-[10px] text-gold">{revealNote}</p>}
      </div>
      {reveal.positions?.[0] && <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-royal/50 bg-royal/15 font-mono text-[10px] text-royal">{reveal.positions[0]}</span>}
    </div>}
    <p className="mt-4 text-center font-mono text-[9px] uppercase tracking-[0.25em] text-gold">Skills</p>
    <div className="mt-2 space-y-1.5">
      {filled.map(skill => {
        const pick = picks[skill.key];
        const ratio = leagueMax[skill.key] ? pick.value / leagueMax[skill.key] : 0;
        return <div key={skill.key} className="slot-pop flex items-center gap-2 rounded-lg border border-border/20 bg-canvas/40 px-2.5 py-1.5">
          <span className="flex-1 text-[10px] font-semibold uppercase tracking-wider">{skill.label}</span>
          <span className={`flex h-6 min-w-6 items-center justify-center rounded-full border px-1 font-mono text-[10px] font-bold ${TONE_CHIP[gradeTone(ratio)]}`}>{showGrades ? gradeFor(ratio) : skill.fmt(pick.value)}</span>
        </div>;
      })}
      {!filled.length && <p className="px-1 py-2 text-center text-[10px] leading-relaxed text-muted-foreground">No skills locked yet — spin the reels.</p>}
    </div>
  </aside>;
}