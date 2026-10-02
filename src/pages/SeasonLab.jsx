import React from 'react';
import NativeWorkbench from '@/components/native/NativeWorkbench';
import SeasonCockpit from '@/components/season/SeasonCockpit';
export default function SeasonLab() { return <NativeWorkbench kind="season" sidecar={({ source, league, year }) => <SeasonCockpit source={source} league={league} year={year} />} />; }