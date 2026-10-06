import React, { useState } from 'react';
import usePageMeta from '@/hooks/usePageMeta';
import { Loader2 } from 'lucide-react';
import StudioShell from '@/components/studio/StudioShell';
import WorkbenchHeader from '@/components/studio/WorkbenchHeader';
import SourceStatus from '@/components/studio/SourceStatus';
import useSeasonSource from '@/hooks/useSeasonSource';
import useChemistryData from '@/components/chemistry/useChemistryData';
import ChemPairView from '@/components/chemistry/ChemPairView';
import ChemObservedView from '@/components/chemistry/ChemObservedView';

const DESCRIPTION = 'Compare a pair’s full-season profiles, play the comparison challenge, and explore verified shared-floor and exact-five combinations.';
const STEPS = ['Pair profiles', 'Compare & challenge', 'Observed combinations'];

export default function ChemistryLab() {
  usePageMeta({ title: 'Chemistry Lab — SwishIQ Studio', description: 'Rate and explore two-man lineup chemistry across any published NBA season.' });
  const season = useSeasonSource();
  const entry = season.source?.entry;
  const chemistry = useChemistryData(entry);
  const [view, setView] = useState('pair');
  const state = season.state !== 'ready' ? season.state : chemistry.state;
  const ready = chemistry.state === 'ready' && chemistry.data?.pair;
  const observedReady = Boolean(chemistry.data?.observed);
  return <StudioShell active="/chemistry">
    <WorkbenchHeader title="CHEMISTRY LAB" description={DESCRIPTION} steps={STEPS} state={state} status={ready ? 'Workbench source ready' : undefined} />
    <main className="mx-auto min-w-0 max-w-7xl space-y-5 px-4 py-6 sm:px-6">
      <SourceStatus state={season.state} error={season.error} year={season.year} years={season.years} onYearChange={season.setYear} onRetry={season.retry} />
      {season.state === 'ready' && <React.Fragment>
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Chemistry views">
          {[['pair', 'Player comparison'], ['combinations', 'Observed lineups']].map(([value, label]) => (
            <button key={value} type="button" role="tab" aria-selected={view === value} onClick={() => setView(value)} className={`rounded-lg border px-4 py-2 text-xs font-semibold uppercase tracking-wider transition-colors ${view === value ? 'border-gold/60 bg-gradient-to-r from-gold/15 to-royal/10 text-gold shadow-[0_0_18px_rgba(233,185,73,0.12)]' : 'border-border/30 text-muted-foreground hover:border-gold/40 hover:text-gold'}`}>{label}</button>
          ))}
        </div>
        {view === 'combinations' && chemistry.progress && <p role="status" className="court-panel flex items-center gap-3 p-4 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin text-gold" />{chemistry.progress}</p>}
        {view === 'combinations' && !observedReady && !chemistry.progress && chemistry.state === 'ready' && <p role="status" className="court-panel p-5 text-sm text-muted-foreground">Observed lineups are unavailable for this season. Player comparison remains available.</p>}
        {ready && view === 'pair' && <ChemPairView dataset={chemistry.data.pair} chem={chemistry.data.chem} />}
        {ready && view === 'combinations' && observedReady && <ChemObservedView observed={chemistry.data.observed} pair={chemistry.data.pair} chem={chemistry.data.chem} />}
      </React.Fragment>}
      {chemistry.state === 'error' && <div role="alert" className="court-panel border-trim/40 p-5">
        <p className="text-sm text-foreground">{chemistry.error}</p>
        <button type="button" onClick={chemistry.retry} className="mt-3 min-h-10 rounded-lg border border-border/50 px-4 text-xs font-medium text-muted-foreground transition-colors hover:border-gold/40 hover:text-gold">Retry verified data</button>
      </div>}
    </main>
  </StudioShell>;
}