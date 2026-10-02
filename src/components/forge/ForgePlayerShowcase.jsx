import React from 'react';
import PlayerPortrait from '@/components/players/PlayerPortrait';
import TeamMark from '@/components/studio/TeamMark';
import { SKILLS } from '@/components/forge/bapSkills';

// Wide showcase beside the reels: the revealed player's full stat line —
// every pool metric, one tile each.
export default function ForgePlayerShowcase({ player, note }) {
  return <section aria-label="Player showcase" className="court-panel p-4">
    {player ? <header className="flex flex-wrap items-center gap-3">
      <PlayerPortrait player={player} className="h-16 w-16 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="court-kicker">Player showcase</p>
        <h2 className="truncate font-display text-2xl tracking-wide">{player.name}</h2>
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><TeamMark code={player.teamCode} className="h-4 w-4" />{player.teamCode}{player.positions?.[0] ? ` · ${player.positions.join(' / ')}` : ''} · {player.games} GP</p>
      </div>
      {note && <p className="shrink-0 rounded-lg border border-gold/40 bg-gold/10 px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-gold">{note}</p>}
    </header> : <div className="flex min-h-44 flex-col items-center justify-center text-center">
      <p className="court-kicker">Player showcase</p>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">Spin the reels — the revealed player's full stat line lands here.</p>
    </div>}
    {player && <table className="mt-4 w-full text-center">
      <thead>
        <tr>
          {SKILLS.map(skill => <th key={skill.key}>{skill.label}<span className="block text-[8px] font-normal normal-case tracking-normal opacity-70">{skill.metric}</span></th>)}
          <th>GP</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          {SKILLS.map(skill => <td key={skill.key} className="font-display text-lg leading-tight">{skill.fmt(player[skill.key])}</td>)}
          <td className="font-display text-lg leading-tight">{player.games}</td>
        </tr>
      </tbody>
    </table>}
  </section>;
}