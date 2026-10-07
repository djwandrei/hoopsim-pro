import React from 'react';
import LeagueScatterBoard from '@/components/players/LeagueScatterBoard';
import StatDistributionBoard from '@/components/players/StatDistributionBoard';
import PositionLens from '@/components/players/PositionLens';
import AtlasLeaderBoard from '@/components/players/AtlasLeaderBoard';
export default function LeagueAtlas({ rows, atlas, selected, onSelect, onCompare }) {
  return <div className="space-y-5"><LeagueScatterBoard rows={rows} atlas={atlas} selected={selected} onSelect={onSelect} /><div className="grid gap-5 lg:grid-cols-2"><StatDistributionBoard rows={rows} selected={selected} /><PositionLens rows={rows} /></div><AtlasLeaderBoard rows={rows} selected={selected} onSelect={onSelect} onCompare={onCompare} /></div>;
}