import React from 'react';
import { Image } from '@/components/ui/image';
import { teamAsset } from '@/components/studio/teamAssets';

// 2K-style team picker: logo-only tiles in a grid instead of a dropdown.
// Same engine call on pick — presentation only.
export default function FranchiseTeamSelect({ v4, onPick }) {
  if (!v4.teamOptions.length) return <p className="frx-note">{v4.teamMessage}</p>;
  return (
    <div className="frx-team-grid" role="radiogroup" aria-label="Team to control">
      {v4.teamOptions.map(option => {
        const selected = option.code === v4.teamSelected;
        const logo = teamAsset(option.code);
        return (
          <button key={option.code} type="button" role="radio" aria-checked={selected} aria-label={option.label}
            disabled={v4.teamDisabled} className="frx-team-tile" data-checked={selected}
            onClick={() => onPick(option.code)}>
            {logo && <Image src={logo} alt="" fittingType="fit" className="frx-team-tile__logo" />}
          </button>
        );
      })}
    </div>
  );
}