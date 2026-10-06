import React, { useCallback, useMemo, useState } from 'react';
import StudioShell from '@/components/studio/StudioShell';
import WorkbenchHeader from '@/components/studio/WorkbenchHeader';
import SourceStatus from '@/components/studio/SourceStatus';
import SpinMount from '@/components/spin/SpinMount';
import SpinExclusions from '@/components/spin/SpinExclusions';
import SpinReceipt from '@/components/spin/SpinReceipt';
import SpinSelection from '@/components/spin/SpinSelection';
import useSeasonSource from '@/hooks/useSeasonSource';
import { observedPlayers } from '@/lib/season/labs';
import SpinPoolBoard from '@/components/spin/SpinPoolBoard';
import SpinHistory from '@/components/spin/SpinHistory';
export default function SpinRoom() {
  const { year,setYear,years,source,state,error,retry } = useSeasonSource();
  const [excluded,setExcluded] = useState([]);
  const [latest,setLatest] = useState(null);
  const [pool,setPool] = useState(null);
  const [history,setHistory] = useState([]);
  const recordSelection=useCallback(payload=>{setLatest(payload);if(!payload)setHistory([]);else setHistory(current=>[...current,{number:payload.spinNumber,player:payload.displayPlayer}]);},[]);
  const players = useMemo(() => source ? observedPlayers(source) : [],[source]);
  const changeExclusions = refs => { setExcluded(refs);setLatest(null);setPool(null);setHistory([]); };
  return <StudioShell active="/spin"><WorkbenchHeader title="SPIN ROOM" description="Build an exact-season role pool, review exclusions, and discover your next player through a repeatable, no-repeat draw." steps={['Pool & exclusions','Draw a player','Selection & receipt']} current={latest ? 2 : pool?.status === 'ready' ? 1 : 0} state={state} status={latest ? `Pick ${latest.spinNumber} confirmed` : pool?.status === 'ready' ? 'Eligible pool ready' : 'Build your pool'} /><main className="mx-auto min-w-0 max-w-7xl space-y-5 px-4 py-6 sm:px-6"><SourceStatus state={state} error={error} source={source} year={year} years={years} onYearChange={value => { setYear(value);changeExclusions([]); }} onRetry={retry} />{state === 'ready' && <div className="grid items-start gap-5 lg:grid-cols-3"><SpinExclusions players={players} excluded={excluded} onChange={changeExclusions} /><div className="min-w-0 space-y-5 lg:col-span-2"><SpinPoolBoard pool={pool} latest={latest} excluded={excluded}/><SpinMount source={source} year={year} excluded={excluded} onSelection={recordSelection} onPool={setPool} />{latest && <SpinSelection latest={latest} />}<SpinHistory history={history}/><SpinReceipt source={source} pool={pool} latest={latest} excluded={excluded} /><p className="px-1 text-[11px] text-muted-foreground">The wheel is a visual cue. The original seeded-pool engine determines each pick; source position labels determine role eligibility.</p></div></div>}</main></StudioShell>;
}