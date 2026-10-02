import React from 'react';
import StudioShell from '@/components/studio/StudioShell';
import WorkbenchHeader from '@/components/studio/WorkbenchHeader';
import SourceStatus from '@/components/studio/SourceStatus';
import useSeasonSource from '@/hooks/useSeasonSource';
import ForgeBucketDraft from '@/components/forge/ForgeBucketDraft';
export default function ForgeLab() {
  const data = useSeasonSource();
  return <StudioShell active="/forge">
    <WorkbenchHeader title="COMPOSITE FORGE" description="A Build-A-Bucket style draft over observed seasons: spin the wheel to open an attribute, keep or respin the offered player-season, then the finished build tours the league." steps={['Spin the wheel', 'Keep or respin', 'Forge & tour']} state={data.state} status={data.state === 'ready' ? 'Workbench source ready' : undefined} />
    <main className="mx-auto min-w-0 max-w-7xl space-y-5 px-4 py-6">
      <SourceStatus state={data.state} source={data.source} error={data.error} year={data.year} years={data.years} onYearChange={data.setYear} onRetry={data.retry} />
      {data.state === 'ready' && <ForgeBucketDraft key={data.source.entry.packageVersion} source={data.source} league={data.league} />}
    </main>
  </StudioShell>;
}