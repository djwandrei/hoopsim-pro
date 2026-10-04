import React from 'react';
import { Image } from '@/components/ui/image';
import { playerAsset } from '@/components/studio/teamAssets';
import { statDisplay, statNumber } from '@/lib/dailyGames/boardHydration';

const MARKER_STATS = [['PTS', 'points'], ['REB', 'rebounds'], ['AST', 'assists']];

export default function CourtPlayerMarker({ point, player, tone = 'starter', tag, sub, scale = 1 }) {
  const headshot = playerAsset(player.headshotPath || null);
  const initials = player.displayName.split(/\s+/).map(part => part[0]).join('').slice(0, 2);
  const position = (player.positions || [])[0] || '';
  return (
    <figure className={`dg-court__marker dg-court__card dg-court__marker--${tone}`} style={{ left: `${point.x / 10}%`, top: `${point.y / 6}%`, zIndex: Math.round(point.y), '--ds': scale }} aria-label={`${player.displayName}${tag ? ` · ${tag}` : ''}`}>
      {tone !== 'starter' && <span className="dg-court__ring" aria-hidden="true" />}
      <span className="dg-court__shadow" aria-hidden="true" />
      <span className="dg-court__id">
        {headshot
          ? <Image src={headshot} alt={player.displayName} fittingType="fit" loading="eager" className="dg-court__portrait" />
          : <span className="dg-court__initials" aria-hidden="true">{initials}</span>}
        <span className="dg-court__name" title={player.displayName}>{player.displayName}</span>
      </span>
      <figcaption className="dg-court__caption">
        <span className="dg-court__plate">
          {position && <span className="dg-court__pos">{position}</span>}
          {MARKER_STATS.map(([label, key]) => (
            <span key={key} className="dg-court__stat">{label} <b>{statDisplay(statNumber(player, key))}</b></span>
          ))}
        </span>
        {sub && <span className="dg-court__sub">for {sub}</span>}
        {tag && <span className={`dg-court__tag dg-court__tag--${tone}`}>{tag}</span>}
      </figcaption>
    </figure>
  );
}