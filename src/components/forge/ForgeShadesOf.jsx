import React, { useMemo } from 'react';
import { Sparkles } from 'lucide-react';
import PlayerPortrait from '@/components/players/PlayerPortrait';
import { forgeShadesOf } from './forgePlayerComparisons.js';
import { SKILLS } from './bapSkills';
import './forgeStage.css';

export default function ForgeShadesOf({ picks, pool }) {
  const matches = useMemo(() => forgeShadesOf(picks, pool), [picks, pool]);
  if (!matches.length) return null;
  const filled = SKILLS.filter(skill => Number.isFinite(picks[skill.key]?.value)).length;
  return <section className="forge-shades" aria-label="Player skill comparisons">
    <header><div><span className="bcast-kicker"><Sparkles size={12} />Your build is taking shape</span><h3>Shades of</h3></div><span>{filled} / {SKILLS.length} assigned</span></header>
    <div className="forge-shades__players">{matches.map(({ player, traits }, index) => <article key={player.playerRef}>
      <PlayerPortrait player={player} frameless className="forge-shades__portrait" />
      <div><span className="forge-shades__rank">{index === 0 ? 'Closest profile' : `Comparison ${index + 1}`}</span><h4>{player.name}</h4><span className="forge-shades__season">{player.teamCode} · {player.seasonStartYear}–{String(player.seasonStartYear + 1).slice(-2)}</span><p>{traits.join(' · ')}</p></div>
    </article>)}</div>
    <p className="forge-shades__note">Based on assigned skills only. Comparisons update with each pick; body size is excluded.</p>
  </section>;
}
