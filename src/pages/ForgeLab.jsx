import React, { useState } from 'react';
import StudioShell from '@/components/studio/StudioShell';
import WorkbenchHeader from '@/components/studio/WorkbenchHeader';
import SourceStatus from '@/components/studio/SourceStatus';
import WorkbenchViewTabs from '@/components/studio/WorkbenchViewTabs';
import useSeasonSource from '@/hooks/useSeasonSource';
import NativeSurface from '@/components/native/NativeSurface';
import ForgeBucketDraft from '@/components/forge/ForgeBucketDraft';
export default function ForgeLab() {
  const data = useSeasonSource();
  const [nativeState, setNativeState] = useState('loading');
  const [mode, setMode] = useState('bucket');
  const state = data.state === 'ready' ? (mode === 'bucket' ? 'ready' : nativeState) : data.state;
  return <StudioShell active="/forge">
    <WorkbenchHeader title="COMPOSITE FORGE" description="Draft a composite player bucket by bucket from real player-season donors, or open the original forge to build from skill donors with full source evidence." steps={['Bucket draft', 'Choose skill donors', 'Build & review']} state={state} status={state === 'ready' ? 'Workbench source ready' : undefined} />
    <main className="mx-auto min-w-0 max-w-7xl space-y-5 px-4 py-6">
      <SourceStatus state={data.state} source={data.source} error={data.error} year={data.year} years={data.years} onYearChange={data.setYear} onRetry={data.retry} />
      {data.state === 'ready' && <>
        <WorkbenchViewTabs label="Forge modes" options={[{ key: 'bucket', label: 'Bucket Draft' }, { key: 'forge', label: 'Original Forge' }]} value={mode} onChange={setMode} />
        {mode === 'bucket' ? <ForgeBucketDraft key={data.source.entry.packageVersion} league={data.league} /> : <NativeSurface key={`composite:${data.source.entry.packageVersion}`} kind="composite" entry={data.source.entry} onStateChange={setNativeState} />}
      </>}
    </main>
  </StudioShell>;
}