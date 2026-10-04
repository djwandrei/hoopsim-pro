import React from 'react';
import { Image } from '@/components/ui/image';
import { playerAsset } from '@/components/studio/teamAssets';
import { hasPublicStats, statNumber, statDisplay } from '@/lib/dailyGames/boardHydration';

const TAPE_STATS = [['PTS', 'points'], ['REB', 'rebounds'], ['AST', 'assists'], ['MIN', 'minutes']];

// The pinned reference row: the outgoing starter's stat line every candidate
// is taped against.
export default function TapeReference({ player }) {
  if (!player) return null;
  const headshot = playerAsset(player.headshotPath || null);
  return (
    <div className="dg-ref">
      {headshot
        ? <Image src={headshot} alt="" fittingType="fit" className="dg-ref__shot" />
        : <span className="dg-ref__shot dg-ref__shot--empty" aria-hidden="true" />}
      <div className="min-w-0">
        <span className="dg-ref__kicker">Outgoing</span>
        <span className="dg-ref__name block truncate">{player.displayName}</span>
      </div>
      {hasPublicStats(player) && (
        <dl className="dg-ref__stats">
          {TAPE_STATS.map(([label, key]) => (
            <div key={key} className="dg-ref__stat">
              <dt>{label}</dt>
              <dd>{statDisplay(statNumber(player, key))}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}