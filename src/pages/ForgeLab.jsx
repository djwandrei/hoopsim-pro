import React from 'react';
import StudioShell from '@/components/studio/StudioShell';
import WorkbenchHeader from '@/components/studio/WorkbenchHeader';
import SourceStatus from '@/components/studio/SourceStatus';
import useSeasonSource from '@/hooks/useSeasonSource';
import ForgeBucketDraft from '@/components/forge/ForgeBucketDraft';
export default function ForgeLab() {
  const data = useSeasonSource();
  return <StudioShell active="/forge">
    <WorkbenchHeader title="COMPOSITE FORGE" description="One bucket-draft game: draw real donor cards, fill the six skill buckets, then forge the composite and send it on a tour of the league." steps={['Bucket draft', 'Forge the composite', 'League tour']} state={data.state} status={data.state === 'ready' ? 'Workbench source ready' : undefined} />
    <main className="mx-auto min-w-0 max-w-7xl space-y-5 px-4 py-6">
      <SourceStatus state={data.state} source={data.source} error={data.error} year={data.year} years={data.years} onYearChange={data.setYear} onRetry={data.retry} />
      {data.state === 'ready' && <ForgeBucketDraft key={data.source.entry.packageVersion} league={data.league} />}
    </main>
  </StudioShell>;
}