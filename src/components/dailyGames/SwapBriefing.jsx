import React from 'react';
import { Crosshair, UserMinus } from 'lucide-react';
import { statNumber } from '@/lib/dailyGames/boardHydration';
import { primaryRoles, roleOf } from '@/components/dailyGames/lineupRoles';

// Qualitative swap briefing: what the removed starter takes with them and
// what the replacement candidate needs to bring, derived from board stats.
export default function SwapBriefing({ challenge }) {
  const outgoing = (challenge.lineup || []).find(player => player.playerRef === challenge.removePlayerRef);
  if (!outgoing) return null;
  const others = challenge.lineup.filter(player => player.playerRef !== challenge.removePlayerRef);
  const pos = (outgoing.positions && (outgoing.positions[0] || roleOf(outgoing))) || roleOf(outgoing);
  const pts = statNumber(outgoing, 'points');
  const reb = statNumber(outgoing, 'rebounds');
  const ast = statNumber(outgoing, 'assists');
  const min = statNumber(outgoing, 'minutes');
  const roles = primaryRoles(outgoing, challenge.lineup);
  const otherPts = others.reduce((sum, player) => sum + (statNumber(player, 'points') ?? 0), 0);
  const share = pts != null && otherPts > 0 ? Math.round((pts / (pts + otherPts)) * 100) : null;
  const onlyAtPosition = !(others.some(player => ((player.positions || [])[0] || roleOf(player)) === pos));

  const removing = [];
  if (pts != null) removing.push(`${share != null ? `${share}% of the five's scoring — ` : ''}${pts.toFixed(1)} PPG${min != null ? ` in ${min.toFixed(1)} MPG` : ''}.`);
  if (roles[0]) removing.push(`${roles[0]}: leaving a hole the box score only partially shows.`);
  if (ast != null && roles.includes('Primary playmaker')) removing.push(`Team's top playmaker at ${ast.toFixed(1)} APG.`);
  if (reb != null && roles.includes('Primary rebounder')) removing.push(`Team's top rebounder at ${reb.toFixed(1)} RPG.`);
  if (onlyAtPosition) removing.push(`The only ${pos} in the starting five — the frontcourt loses its anchor.`);
  if (!removing.length) removing.push('A rotation starter whose minutes must be replaced.');

  const looking = [];
  if (pts != null) looking.push(`A ${pos}-slot replacement targeting roughly ${Math.round(pts)}+ PPG to restore the lost scoring.`);
  if (roles.includes('Primary playmaker') && ast != null) looking.push(`Secondary creation near ${Math.round(ast)} APG keeps the offense organized.`);
  if (roles.includes('Primary rebounder') && reb != null) looking.push(`Rebounding presence around ${Math.round(reb)} RPG protects possessions.`);
  if (min != null) looking.push(`Like-for-like minutes (~${Math.round(min)} MPG) with comparable per-36 efficiency.`);
  if (!looking.length) looking.push(`A rotation fit at ${pos} with comparable per-36 output.`);

  return (
    <section className="dg-brief" aria-label="Swap briefing">
      <div className="dg-brief__col dg-brief__col--out">
        <span className="bcast-kicker">What you're removing</span>
        <h4 className="dg-brief__title">{outgoing.displayName}</h4>
        <ul className="dg-brief__list">
          {removing.map((item, index) => (
            <li key={index} className="dg-brief__item dg-brief__item--out"><UserMinus className="h-3.5 w-3.5" />{item}</li>
          ))}
        </ul>
      </div>
      <div className="dg-brief__col dg-brief__col--look">
        <span className="bcast-kicker">What to look for</span>
        <h4 className="dg-brief__title">Replacement profile</h4>
        <ul className="dg-brief__list">
          {looking.map((item, index) => (
            <li key={index} className="dg-brief__item dg-brief__item--look"><Crosshair className="h-3.5 w-3.5" />{item}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}