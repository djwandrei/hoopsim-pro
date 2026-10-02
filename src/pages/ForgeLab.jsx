import React from 'react';
import NativeWorkbench from '@/components/native/NativeWorkbench';
import DonorBoard from '@/components/forge/DonorBoard';
export default function ForgeLab() { return <NativeWorkbench kind="composite" sidecar={({ source }) => <DonorBoard source={source} />} />; }