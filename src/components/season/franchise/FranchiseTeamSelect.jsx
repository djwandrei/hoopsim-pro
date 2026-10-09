import React from 'react';
import { Image } from '@/components/ui/image';
import { teamAsset } from '@/components/studio/teamAssets';

// 2K-style team picker: logo tiles in a grid instead of a plain dropdown.
// Same engine call on pick — presentation only.
export default function FranchiseTeamSelect({ v4, onPick }) {
  if (!v4.teamOptions.length) return <p className="frx-note">{v4.teamMessage}</p>;
  return (
    <div className="frx-team-grid" role="radiogroup" aria-label="Team to control">
      {v4.teamOptions.map(option => {
        const selected = option.code === v4.teamSelected;
        const logo = teamAsset(option.code);
        const name = option.label.slice(0, option.label.lastIndexOf(' · '));
        return (
          <button key={option.code} type="button" role="radio" aria-checked={selected} disabled={v4.teamDisabled}
            className="frx-team-tile" data-checked={selected} onClick={() => onPick(option.code)}>
            {logo && <Image src={logo} alt="" fittingType="fit" className="h-9 w-9 shrink-0 object-contain" />}
            <span className="frx-team-tile__name">{name}</span>
            <span className="frx-team-tile__code">{option.code}</span>
          </button>
        );
      })}
    </div>
  );
}