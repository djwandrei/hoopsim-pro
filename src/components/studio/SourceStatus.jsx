import React from 'react';
import { Database, Loader2, RefreshCw } from 'lucide-react';
import SeasonSelect from '@/components/studio/SeasonSelect';
import WorkbenchState from '@/components/studio/WorkbenchState';
export default function SourceStatus({ state, error, source, year, years, onYearChange, onRetry, disabled, phase = 'regular' }) {
  const phaseLabel = { regular: 'Regular season', in_season_tournament: 'In-season tournament', play_in: 'Play-in', playoffs: 'Playoffs' }[phase] || phase;
  const ready = state === 'ready';
  const limited = state === 'error' && /credit|billing|quota|limit exceeded/i.test(error || '');
  return <>
    









    
    <WorkbenchState state={state} />
  </>;
}