import React from 'react';
import NativeWorkbench from '@/components/native/NativeWorkbench';
import PairIntel from '@/components/chemistry/PairIntel';
export default function ChemistryLab() { return <NativeWorkbench kind="chemistry" sidecar={({ source }) => <PairIntel source={source} />} />; }