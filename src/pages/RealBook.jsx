import React from 'react';
import { Banknote } from 'lucide-react';
import StudioShell from '@/components/studio/StudioShell';
import WorkbenchHeader from '@/components/studio/WorkbenchHeader';
import BackendPlannedNotice from '@/components/realbook/BackendPlannedNotice';
import usePageMeta from '@/hooks/usePageMeta';

export default function RealBook() {
  usePageMeta({
    title: 'Real-Money Sportsbook — Planned',
    description: 'Real-money sportsbook backend is planned for SwishIQ Studio and is not connected yet.',
  });

  return (
    <StudioShell active="/book">
      <WorkbenchHeader
        title="REAL-MONEY SPORTSBOOK"
        description="This planned Studio feature has no connected real-money backend. No deposits, wagers, wallet balances, or eligibility checks are available here."
        state="error"
        status="Backend planned / not connected"
      />
      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
        <BackendPlannedNotice icon={Banknote} />
      </main>
    </StudioShell>
  );
}
