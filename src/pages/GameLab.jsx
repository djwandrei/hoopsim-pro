import React from 'react';
import NativeWorkbench from '@/components/native/NativeWorkbench';
import MatchupIntel from '@/components/game/MatchupIntel';
export default function GameLab() { return <NativeWorkbench kind="game" sidecar={({ source, league, year }) => <MatchupIntel source={source} league={league} year={year} />} />; }