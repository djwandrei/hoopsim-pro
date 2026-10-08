import React from 'react';
import { Image } from '@/components/ui/image';
import { teamAsset } from '@/components/studio/teamAssets';
import { readableTeamInk } from '@/components/djhc/basketballPalettes';

// A team mark with logo fallback to a display-code tile, tinted by the team's
// readable ink on the dark canvas.
export function FranchiseTeamMark({ code }) {
  const src = code ? teamAsset(code) : null;
  const ink = code ? readableTeamInk(code, 'dark') : null;
  return (
    <span className="frx-team-chip__mark" style={ink ? { color: ink, borderColor: `${ink}55` } : undefined}>
      {src
        ? <Image src={src} alt="" fittingType="fit" className="h-full w-full object-contain p-0.5" />
        : <span>{code?.slice(0, 3) || '—'}</span>}
    </span>
  );
}

export function TeamChip({ code, name, sub }) {
  return (
    <span className="frx-team-chip">
      <FranchiseTeamMark code={code} />
      <span className="frx-team-chip__body">
        <strong>{code}</strong>
        <small className="truncate">{name}{sub ? ` · ${sub}` : ''}</small>
      </span>
    </span>
  );
}

export default FranchiseTeamMark;