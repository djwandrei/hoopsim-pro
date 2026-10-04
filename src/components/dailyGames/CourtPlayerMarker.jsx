import React from 'react';
import { Image } from '@/components/ui/image';
import { playerAsset } from '@/components/studio/teamAssets';

export default function CourtPlayerMarker({ point, player, tone = 'starter', tag, sub, scale = 1 }) {
  const headshot = playerAsset(player.headshotPath || null);
  const initials = player.displayName.split(/\s+/).map(part => part[0]).join('').slice(0, 2);
  return (
    <figure className={`dg-court__marker dg-court__marker--${tone}`} style={{ left: `${point.x / 10}%`, top: `${point.y / 6}%`, zIndex: Math.round(point.y), '--ds': scale }} aria-label={`${player.displayName}${tag ? ` · ${tag}` : ''}`}>
      <span className="dg-court__shadow" aria-hidden="true" />
      {headshot
        ? <Image src={headshot} alt={player.displayName} fittingType="fit" loading="eager" className="dg-court__portrait" />
        : <span className="dg-court__initials" aria-hidden="true">{initials}</span>}
      <figcaption className="dg-court__caption">
        <span className="dg-court__name" title={player.displayName}>{player.displayName}</span>
        {sub && <span className="dg-court__sub">for {sub}</span>}
        {tag && <span className={`dg-court__tag dg-court__tag--${tone}`}>{tag}</span>}
      </figcaption>
    </figure>
  );
}