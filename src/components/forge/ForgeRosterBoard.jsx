import React from 'react';
import PlayerPortrait from '@/components/players/PlayerPortrait';
import TeamMark from '@/components/studio/TeamMark';
import { SKILLS } from '@/components/forge/bapSkills';

// Wide roster board for the Pick variant: the landed team's full roster as a
// stat table — click any row to select that player, then place them on the board.
export default function ForgeRosterBoard({ team, roster, selectedRef, onPick }) {
  return <section aria-label="Roster board" className="court-panel flex h-full flex-col p-4">
    <header className="flex flex-wrap items-center justify-between gap-2">
      <div>
        <p className="court-kicker">Player list</p>
        <h2 className="mt-0.5 font-display text-2xl tracking-wide">{team ? team.name : 'AWAITING SPIN'}</h2>
      </div>
      {team && <span className="flex items-center gap-1.5 rounded-full border border-gold/30 bg-gold/5 px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-gold"><TeamMark code={team.code} className="h-4 w-4" />{team.code}</span>}
    </header>
    {team ? <div className="mt-3 min-h-0 flex-1 overflow-y-auto">
      <table className="w-full text-sm">
        <thead><tr>
          <th className="text-left">Player</th><th>Pos</th><th>G</th><th>PTS</th>
          {SKILLS.map(skill => <th key={skill.key}>{skill.metric}</th>)}
        </tr></thead>
        <tbody>
          {roster.map(player => <tr key={player.playerRef} onClick={() => onPick(player)} className={`cursor-pointer transition-colors ${selectedRef === player.playerRef ? 'bg-gold/10' : 'hover:bg-gold/5'}`}>
            <td className="text-left"><span className="flex items-center gap-2"><PlayerPortrait player={player} className="h-7 w-7 shrink-0" /><span className="truncate text-xs font-bold">{player.name}</span></span></td>
            <td className="text-center font-mono text-[10px]">{player.positions?.[0] || '—'}</td>
            <td className="text-center font-mono text-xs">{player.games}</td>
            <td className="text-center font-mono text-xs">{player.pts.toFixed(1)}</td>
            {SKILLS.map(skill => <td key={skill.key} className="text-center font-mono text-xs">{skill.fmt(player[skill.key])}</td>)}
          </tr>)}
          {!roster.length && <tr><td colSpan={4 + SKILLS.length} className="text-center text-xs text-muted-foreground">Every player here is already drafted — respin the team.</td></tr>}
        </tbody>
      </table>
    </div> : <p className="flex flex-1 items-center justify-center py-10 text-center text-sm text-muted-foreground">Spin the reel to pull up a team's roster.</p>}
  </section>;
}