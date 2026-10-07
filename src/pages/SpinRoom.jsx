import React, { useCallback, useMemo, useState } from 'react';
import usePageMeta from '@/hooks/usePageMeta';
import StudioShell from '@/components/studio/StudioShell';
import WorkbenchHeader from '@/components/studio/WorkbenchHeader';
import SourceStatus from '@/components/studio/SourceStatus';
import SpinControlDesk from '@/components/spin/SpinControlDesk';
import SpinPoolManager from '@/components/spin/SpinPoolManager';
import SpinStage from '@/components/spin/SpinStage';
import SpinPoolBoard from '@/components/spin/SpinPoolBoard';
import SpinHistory from '@/components/spin/SpinHistory';
import SpinReceipt from '@/components/spin/SpinReceipt';
import SpinShareCard, { readSharedDraw } from '@/components/spin/SpinShareCard';
import SpinPoolTemplates from '@/components/spin/SpinPoolTemplates';
import { readSpinTemplates, prependSpinTemplate, removeSpinTemplate } from '@/components/spin/spinTemplates';
import useSeasonSource from '@/hooks/useSeasonSource';
import useSpinDraw from '@/components/spin/useSpinDraw';
import { observedPlayers } from '@/lib/season/labs';
import { SlidersHorizontal, Users } from 'lucide-react';
import '@/components/spin/draftShow.css';

// The Spin Room as a broadcast control room: a sticky left rail with tabs for
// pool filters and player in/out management, and the draft stage, pool board,
// ledger and receipt on the right. The seeded-pool engine is unchanged.
export default function SpinRoom() {
  usePageMeta({ title: 'Spin Room — SwishIQ Studio', description: 'Tune the wheel by season, role, position, team, minutes and stat floors, weight the draw by any per-game metric, and include or exclude players with one tap.' });
  const { year, setYear, years, source, state, error, retry } = useSeasonSource();
  const [tab, setTab] = useState('filters');
  const [poolMode, setPoolMode] = useState('exclude');
  const [selection, setSelection] = useState([]);
  const [latest, setLatest] = useState(null);
  const [templates, setTemplates] = useState(readSpinTemplates);
  const [history, setHistory] = useState([]);
  const [receivedDraw, setReceivedDraw] = useState(() => readSharedDraw(window.location.search));
  const recordSelection = useCallback(payload => {
    setLatest(payload);
    if (!payload) setHistory([]);
    else setHistory(current => [...current, { number: payload.spinNumber, player: payload.displayPlayer }]);
  }, []);
  const players = useMemo(() => source ? observedPlayers(source) : [], [source]);
  const allRefs = useMemo(() => players.map(player => player.playerRef), [players]);
  // "Exclude" mode: the selection is out. "Only these": everyone else is out.
  const excluded = useMemo(() => poolMode === 'include'
    ? allRefs.filter(ref => !selection.includes(ref))
    : selection, [poolMode, selection, allRefs]);
  const spin = useSpinDraw({ source, year, excluded, onSelection: recordSelection });
  const changeSeason = value => { setYear(value); setSelection([]); setPoolMode('exclude'); };
  const roleLabel = spin.roleOptions.find(option => option.value === spin.settings.roleValue)?.label || 'All source-backed players';
  // Pool templates: every Apply saves the current setup (labelled compactly)
  // and applying one restores season, settings, exclusions and mode, then
  // rebuilds the pool after the state settles.
  const templateLabel = useMemo(() => {
    const parts = [];
    if (spin.settings.roleValue && spin.settings.roleValue !== 'all') parts.push(spin.roleOptions.find(option => option.value === spin.settings.roleValue)?.label || spin.settings.roleValue);
    if ((spin.settings.teams || []).length) parts.push(spin.settings.teams.join(' '));
    if (spin.settings.weight && spin.settings.weight !== 'uniform') parts.push(spin.metricOptions.find(metric => metric.key === spin.settings.weight)?.label || spin.settings.weight);
    return parts.length ? parts.join(' · ') : 'All players';
  }, [spin.settings, spin.roleOptions, spin.metricOptions]);
  const applyAndSave = useCallback(() => {
    setTemplates(prependSpinTemplate({ label: templateLabel, savedAt: Date.now(), year, settings: spin.settings, selection, poolMode }));
    spin.rebuild();
  }, [templateLabel, year, spin.settings, spin.rebuild, selection, poolMode]);
  const applyTemplate = useCallback(template => {
    if (template.year && years.includes(template.year)) setYear(template.year);
    spin.changeSettings(template.settings);
    setSelection(template.selection || []);
    setPoolMode(template.poolMode || 'exclude');
    window.setTimeout(() => spin.rebuild(), 0);
  }, [spin, years]);
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
      {state === 'ready' && <div className="grid items-start gap-5 lg:grid-cols-12">
        <div className="order-2 min-w-0 space-y-3 lg:order-1 lg:col-span-5 lg:sticky lg:top-[calc(var(--djhc-header-h,0px)+1rem)] xl:col-span-4">
          <SpinPoolTemplates templates={templates} onApply={applyTemplate} onRemove={label => setTemplates(removeSpinTemplate(label))} />
          <div className="spin-tabs" role="tablist" aria-label="Control rail panels">
            <button type="button" role="tab" aria-selected={tab === 'filters'} onClick={() => setTab('filters')}><SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />Filters & weights</button>
            <button type="button" role="tab" aria-selected={tab === 'players'} onClick={() => setTab('players')}><Users className="h-3.5 w-3.5" aria-hidden="true" />Players in / out</button>
          </div>
          {tab === 'filters' ? <SpinControlDesk settings={spin.settings} onChange={spin.changeSettings} onSubmit={applyAndSave} onReset={spin.resetSettings} roleOptions={spin.roleOptions} teamOptions={spin.teamOptions} metricOptions={spin.metricOptions} dirty={spin.dirty} /> : <SpinPoolManager players={players} selected={selection} mode={poolMode} onModeChange={setPoolMode} onChange={setSelection} />}
        </div>
        <div className="order-1 min-w-0 space-y-5 lg:order-2 lg:col-span-7 xl:col-span-8">
          <SpinStage pool={spin.pool} latest={latest} spinning={spin.spinning} historyCount={spin.history.length} history={history} onSpin={spin.spin} roleLabel={roleLabel} />
          <SpinPoolBoard pool={spin.pool} latest={latest} excluded={excluded} />
          <SpinHistory history={history} />
          <SpinShareCard latest={latest} pool={spin.pool} received={receivedDraw} onClearReceived={() => { setReceivedDraw(null); window.history.replaceState(null, '', window.location.pathname); }} />
          <SpinReceipt source={source} pool={spin.pool} latest={latest} excluded={excluded} />
          <p className="px-1 text-[11px] text-muted-foreground">The wheel is a visual cue. The original seeded-pool engine determines each pick; role, position, team, workload and stat filters are applied before every draw, and the weight field shapes the draw odds.</p>
        </div>
      </div>}
    </main>
  </StudioShell>;
}