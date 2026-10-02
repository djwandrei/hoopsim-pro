import React, { useState } from 'react';
import { Loader2, Users } from 'lucide-react';
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
  const season = useSeasonSource();
  const entry = season.source?.entry;
  const chemistry = useChemistryData(entry);
  const [view, setView] = useState('pair');
  const state = season.state !== 'ready' ? season.state : chemistry.state;
  const ready = chemistry.state === 'ready' && chemistry.data?.pair;
  const observedReady = Boolean(chemistry.data?.observed);
  return <StudioShell active="/chemistry">
    <WorkbenchHeader title="CHEMISTRY LAB" description={DESCRIPTION} steps={STEPS} state={state} status={ready ? 'Workbench source ready' : undefined} />
    <main className="mx-auto min-w-0 max-w-7xl space-y-5 px-4 py-6">
      <SourceStatus state={season.state} />
      {season.state === 'ready' && <React.Fragment>
        <div className="flex w-fit gap-1 rounded-xl border border-border/30 bg-card p-1">
          {[['pair', 'Player comparison'], ['combinations', 'Observed lineups']].map(([value, label]) => (
            <button key={value} type="button" aria-pressed={view === value} onClick={() => setView(value)} className={`flex min-h-10 items-center gap-2 rounded-lg border px-4 text-xs transition-colors ${view === value ? 'border-gold/30 bg-gradient-to-r from-gold/15 to-royal/10 font-semibold text-gold' : 'border-transparent font-medium text-muted-foreground hover:bg-raised hover:text-foreground'}`}>{value === 'combinations' ? <Users className="h-3.5 w-3.5" /> : null}{label}</button>
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
      {ready && chemistry.progress && view === 'pair' && <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{chemistry.progress}</p>}
    </main>
  </StudioShell>;
}