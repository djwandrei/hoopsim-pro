import React, { useCallback, useMemo, useState } from 'react';
import usePageMeta from '@/hooks/usePageMeta';
import StudioShell from '@/components/studio/StudioShell';
import WorkbenchHeader from '@/components/studio/WorkbenchHeader';
import SourceStatus from '@/components/studio/SourceStatus';
import SpinExclusions from '@/components/spin/SpinExclusions';
import SpinStage from '@/components/spin/SpinStage';
import SpinControlDesk from '@/components/spin/SpinControlDesk';
import SpinPoolBoard from '@/components/spin/SpinPoolBoard';
import SpinHistory from '@/components/spin/SpinHistory';
import SpinReceipt from '@/components/spin/SpinReceipt';
import useSeasonSource from '@/hooks/useSeasonSource';
import useSpinDraw from '@/components/spin/useSpinDraw';
import { observedPlayers } from '@/lib/season/labs';
import '@/components/spin/draftShow.css';

// The Spin Room as a draft-show broadcast: a spotlight lottery stage with
// lower-third pick announcements, a control desk that builds the seeded
// pool, and the pool board, draft ledger and replay receipt as sidebars.
// The seeded-pool engine and its verifiable hashes are unchanged.
export default function SpinRoom() {
  usePageMeta({ title: 'Spin Room — SwishIQ Studio', description: 'Tune the wheel by season, skill, team and stat floors, weight the draw by any per-game metric, and draft seeded player scenarios with verifiable receipts.' });
  const { year, setYear, years, source, state, error, retry } = useSeasonSource();
  const [excluded, setExcluded] = useState([]);
  const [latest, setLatest] = useState(null);
  const [history, setHistory] = useState([]);
  const recordSelection = useCallback(payload => {
    setLatest(payload);
    if (!payload) setHistory([]);
    else setHistory(current => [...current, { number: payload.spinNumber, player: payload.displayPlayer }]);
  }, []);
  const spin = useSpinDraw({ source, year, excluded, onSelection: recordSelection });
  const players = useMemo(() => source ? observedPlayers(source) : [], [source]);
  const changeExclusions = refs => setExcluded(refs);
  const changeSeason = value => { setYear(value); setExcluded([]); };
  const roleLabel = spin.roleOptions.find(option => option.value === spin.settings.roleValue)?.label || 'All source-backed players';
  const stage = spin.pool?.status === 'ready' ? 1 : 0;
  const current = latest ? 2 : stage;
  return <StudioShell active="/spin">
    <WorkbenchHeader
      title="SPIN ROOM"
      description="Build a source-bound role pool at the control desk, then draw one player at a time on the broadcast stage — seeded, weighted by any per-game metric, and verifiable to the hash."
      steps={['Build the pool', 'Draw on stage', 'Confirm & verify']}
      current={current}
      state={state}
      status={latest ? `Pick ${latest.spinNumber} confirmed` : spin.pool?.status === 'ready' ? 'Eligible pool armed' : spin.pool?.status === 'dirty' ? 'Pool settings changed' : 'Build your pool'}
    />
    <main className="mx-auto min-w-0 max-w-7xl space-y-5 px-4 py-6 sm:px-6">
      <SourceStatus state={state} error={error} source={source} year={year} years={years} onYearChange={changeSeason} onRetry={retry} />
      {state === 'ready' && <>
        <SpinStage pool={spin.pool} latest={latest} spinning={spin.spinning} historyCount={spin.history.length} onSpin={spin.spin} roleLabel={roleLabel} />
        <div className="grid items-start gap-5 lg:grid-cols-3">
          <SpinExclusions players={players} excluded={excluded} onChange={changeExclusions} />
          <div className="min-w-0 space-y-5 lg:col-span-2">
            <SpinControlDesk settings={spin.settings} onChange={spin.changeSettings} onSubmit={spin.rebuild} roleOptions={spin.roleOptions} teamOptions={spin.teamOptions} metricOptions={spin.metricOptions} dirty={spin.dirty} />
            <SpinPoolBoard pool={spin.pool} latest={latest} excluded={excluded} />
            <SpinHistory history={history} />
            <SpinReceipt source={source} pool={spin.pool} latest={latest} excluded={excluded} />
            <p className="px-1 text-[11px] text-muted-foreground">The wheel is a visual cue. The original seeded-pool engine determines each pick; skill, team, workload and stat filters are applied before every draw, and the weight field shapes the draw odds.</p>
          </div>
        </div>
      </>}
    </main>
  </StudioShell>;
}