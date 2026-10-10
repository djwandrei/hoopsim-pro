import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import usePageMeta from '@/hooks/usePageMeta';
import { Download, Loader2, RefreshCw, Plus, Upload, Pencil, Trash2 } from 'lucide-react';
import { exportCourtDiagram } from '@/components/playbook/exportDiagram';
import StudioShell from '@/components/studio/StudioShell';
import WorkbenchHeader from '@/components/studio/WorkbenchHeader';
import { loadPlayLibrary, findPlay } from '@/components/playbook/playLibrary';
import { buildFrames } from '@/components/playbook/playAnimation';
import { mirrorText } from '@/components/playbook/playNarration';
import { tagLabel } from '@/components/playbook/playTags';
import { filmLinksForPlay } from '@/components/playbook/playVideos';
import PlayCourt from '@/components/playbook/PlayCourt';
import PlayControls from '@/components/playbook/PlayControls';
import PlayFilmPanel from '@/components/playbook/PlayFilmPanel';
import PlayStepPanel from '@/components/playbook/PlayStepPanel';
import PlayLibraryList from '@/components/playbook/PlayLibraryList';
import PlayBuilder from '@/components/playbook/PlayBuilder';
import { createCustomPlay, customLibraryPlay, compileCustomPlay, readCustomPlays, writeCustomPlays, exportCustomPlay, importCustomPlay } from '@/components/playbook/customPlays';
import '@/components/playbook/playbook.css';

const SPEEDS = [1, 1.5, 2];
const actionButton = 'inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-border/50 bg-raised/40 px-3 text-sm text-foreground hover:border-gold/50';

// Interactive Playbook: every play from the animation dictionary runs on an
// animated half court, step by step, with the who/what/why narrated beside it.
export default function Playbook() {
  usePageMeta({ title: 'Interactive Playbook — SwishIQ Studio', description: 'Learn basketball plays, sets and schemes on an animated court: labelled players run each step while the who, the what and the why are narrated.' });
  const [library, setLibrary] = useState(null);
  const [error, setError] = useState(null);
  const load = useCallback(() => {
    setError(null);
    loadPlayLibrary().then(setLibrary).catch((err) => setError(err.message || 'The play library could not be loaded.'));
  }, []);
  useEffect(() => {
    // Ignore the response if this view unmounts mid-fetch.
    let cancelled = false;
    setError(null);
    loadPlayLibrary()
      .then((result) => { if (!cancelled) setLibrary(result); })
      .catch((err) => { if (!cancelled) setError(err.message || 'The play library could not be loaded.'); });
    return () => { cancelled = true; };
  }, [load]);

  const initialParams = useMemo(() => new URLSearchParams(typeof window === 'undefined' ? '' : window.location.search), []);
  const [playId, setPlayId] = useState(initialParams.get('play'));
  const [stepIndex, setStepIndex] = useState(() => {
    const step = Number(initialParams.get('step'));
    return Number.isFinite(step) ? Math.max(0, Math.floor(step)) : 0;
  });
  const [playing, setPlaying] = useState(false);
  const [paused, setPaused] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [mirrored, setMirrored] = useState(false);
  const courtRef = useRef(null);
  const [exporting, setExporting] = useState(false);
  const [saved, setSaved] = useState(readCustomPlays);
  const [editing, setEditing] = useState(null);
  const [deleted, setDeleted] = useState(null);
  const [showDefense, setShowDefense] = useState(() => saved.plays.find(item => item.id === initialParams.get('play'))?.showDefense !== false);
  const importRef = useRef(null);

  const combinedLibrary = useMemo(() => ({ categories: [...(saved.plays.length ? [{ title: 'My plays', plays: saved.plays.map(customLibraryPlay) }] : []), ...(library?.categories || [])] }), [library, saved.plays]);
  const play = useMemo(() => findPlay(combinedLibrary, playId) || combinedLibrary.categories[0]?.plays[0] || null, [combinedLibrary, playId]);
  const filmLinks = useMemo(() => play?.customDraft ? [] : filmLinksForPlay(play), [play]);
  const animationResult = useMemo(() => {
    try { return { animation: play ? play.customDraft ? compileCustomPlay(play.customDraft) : buildFrames(play) : null, error: '' }; }
    catch (err) { return { animation: null, error: err.message || 'This play could not be animated.' }; }
  }, [play]);
  const animation = animationResult.animation;
  const frames = useMemo(() => (animation ? [{ ...animation.setup }, ...animation.frames] : []), [animation]);
  const stepCount = frames.length;
  const safeStep = Math.max(0, Math.min(stepIndex, stepCount - 1));
  const frame = frames[safeStep];

  // PNG export of the current diagram step (SVG tokens resolved, rasterized 2x).
  const handleExport = useCallback(async () => {
    const svg = courtRef.current?.querySelector('svg');
    if (!svg || exporting) return;
    setExporting(true);
    try { await exportCourtDiagram(svg, `swishiq-playbook-${play.id}-step${safeStep}.png`); }
    finally { setExporting(false); }
  }, [exporting, play, safeStep]);

  // Advance only when the shared player/ball clock finishes, including the
  // final step. Pausing and speed changes never reset a second timeout.
  const handleFrameComplete = useCallback(() => {
    if (!playing) return;
    if (safeStep < stepCount - 1) setStepIndex(safeStep + 1);
    else setPlaying(false);
  }, [playing, safeStep, stepCount]);

  // Shareable call: the selected play and step live in the URL.
  useEffect(() => {
    if (!play) return;
    const url = new URL(window.location.href);
    url.searchParams.set('play', play.id);
    url.searchParams.set('step', String(safeStep));
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
  }, [play, safeStep]);

  const handleTogglePlay = () => {
    if (!playing && safeStep >= stepCount - 1) setStepIndex(0);
    setPaused(playing);
    setPlaying((current) => !current);
  };
  const handleRestart = () => { setPaused(false); setPlaying(false); setStepIndex(0); };
  const handleCycleSpeed = () => setSpeed((current) => SPEEDS[(SPEEDS.indexOf(current) + 1) % SPEEDS.length]);
  const selectPlay = id => {
    setPaused(false); setPlaying(false); setStepIndex(0); setPlayId(id);
    setShowDefense(findPlay(combinedLibrary, id)?.customDraft?.showDefense !== false);
  };
  const persist = (plays, message) => {
    const persisted = writeCustomPlays(plays);
    setSaved({ plays, message: persisted ? message : `${message} Browser storage is unavailable or full; this change is kept for this session. Export your play JSON to keep a copy.` });
  };
  const savePlay = draft => {
    const plays = saved.plays.some(item => item.id === draft.id) ? saved.plays.map(item => item.id === draft.id ? draft : item) : [draft, ...saved.plays];
    persist(plays, `“${draft.name}” saved to My plays.`);
    setEditing(null); setDeleted(null); setPlayId(draft.id); setShowDefense(draft.showDefense); handleRestart();
  };
  const startEditing = draft => { setEditing(draft); setPlaying(false); setPaused(false); };
  const downloadPlay = draft => {
    const url = URL.createObjectURL(new Blob([exportCustomPlay(draft)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = `swishiq-${draft.id}.json`; link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const importPlay = async event => {
    const file = event.target.files?.[0]; event.target.value = ''; if (!file) return;
    try {
      if (file.size > 200000) throw new Error('Choose a SwishIQ play JSON file smaller than 200 KB.');
      startEditing(importCustomPlay(await file.text()));
    } catch (err) { setSaved(current => ({ ...current, message: err.message })); }
  };

  return (
    <StudioShell active="/playbook">
      <WorkbenchHeader
        showEmblemOnMobile
        title="INTERACTIVE PLAYBOOK"
        description="Learn the dictionary of basketball plays, sets and schemes on an animated court. Labelled players run each step of the action while the narration explains what is happening, who is involved and what each move is trying to accomplish."
        steps={['Browse the play library', 'Run the step animation', 'Study the reads & goals']}
        current={safeStep > 0 ? 2 : play ? 1 : 0}
        state={!library ? 'loading' : error ? 'error' : 'ready'}
        status={library ? `${library.playCount} plays, sets & schemes` : undefined}
      />
      <main className="mx-auto min-w-0 max-w-7xl px-4 py-6 sm:px-6">
        {!editing && <div className="mb-4 flex flex-wrap items-center gap-3">
          <button type="button" className={`${actionButton} border-gold/50 bg-gold/10 text-gold`} onClick={() => startEditing(createCustomPlay())}><Plus className="h-4 w-4" />Create play</button>
          <button type="button" className={actionButton} onClick={() => importRef.current?.click()}><Upload className="h-4 w-4" />Import play</button>
          <input ref={importRef} className="hidden" type="file" accept=".json,application/json" aria-label="Import a SwishIQ custom play" onChange={importPlay} />
          <p className="text-xs text-muted-foreground">Custom plays save in this browser. Export JSON to share or back them up.</p>
        </div>}
        {saved.message && <div role="status" className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-border/50 bg-raised/30 p-3 text-sm text-muted-foreground">
          <p>{saved.message}</p>
          {deleted && <button type="button" className={actionButton} onClick={() => {
            try { persist([deleted, ...saved.plays], `“${deleted.name}” restored.`); setPlayId(deleted.id); setDeleted(null); }
            catch (err) { setSaved(current => ({ ...current, message: err.message })); }
          }}>Undo delete</button>}
        </div>}
        {editing && <PlayBuilder key={editing.id} initialDraft={editing} onSave={savePlay} onCancel={() => setEditing(null)} />}
        {!editing && error && (
          <div className="court-panel flex flex-wrap items-center justify-between gap-3 p-4">
            <p className="text-sm text-trim-ink">{error}</p>
            <button type="button" onClick={load} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-gold/40 bg-gold/10 px-3 text-xs font-semibold uppercase tracking-widest text-gold"><RefreshCw className="h-4 w-4" />Retry</button>
          </div>
        )}
        {!editing && !library && !error && !saved.plays.length && (
          <div className="court-panel grid h-64 place-items-center p-4">
            <span className="inline-flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading the play library…</span>
          </div>
        )}
        {!editing && play && (
          <div className="grid items-start gap-4 lg:grid-cols-[290px_minmax(0,1fr)]">
            <PlayLibraryList categories={combinedLibrary.categories} selectedId={play.id} onSelect={selectPlay} />
            <div className="min-w-0 space-y-4">
              <div className="court-panel p-4 sm:p-5">
                <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="font-display text-2xl tracking-wide text-foreground">{play.name}</h2>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="bcast-lowerthird">{play.type}</span>
                    {(play.tags || []).map((id) => (
                      <span key={id} className="rounded-full border border-border/40 bg-raised/30 px-2 py-0.5 font-mono text-[10.4px] text-muted-foreground">{tagLabel(id)}</span>
                    ))}
                    <button type="button" onClick={handleExport} disabled={exporting || !frame} className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-border/40 bg-raised/30 px-2.5 font-mono text-[10.4px] font-semibold uppercase tracking-widest text-muted-foreground transition-colors hover:border-gold/40 hover:text-gold disabled:opacity-40">
                      <Download className="h-3 w-3 shrink-0" />{exporting ? 'Exporting…' : 'Export PNG'}
                    </button>
                  </div>
                </div>
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <label className="inline-flex min-h-10 items-center gap-2 text-sm text-foreground"><input type="checkbox" checked={showDefense} onChange={event => setShowDefense(event.target.checked)} />Show defense</label>
                  {play.customDraft && <>
                    <button type="button" className={actionButton} onClick={() => startEditing(play.customDraft)}><Pencil className="h-4 w-4" />Edit play</button>
                    <button type="button" className={actionButton} onClick={() => downloadPlay(play.customDraft)}><Download className="h-4 w-4" />Export JSON</button>
                    <button type="button" className={actionButton} onClick={() => {
                      persist(saved.plays.filter(item => item.id !== play.id), `“${play.name}” removed from My plays.`); setDeleted(play.customDraft); setPlayId(null); handleRestart();
                    }}><Trash2 className="h-4 w-4" />Delete play</button>
                  </>}
                </div>
                {animationResult.error && <p role="alert" className="rounded-lg border border-trim/50 p-3 text-sm text-trim-ink">{animationResult.error}{play.customDraft ? ' Edit this play to correct its steps.' : ''}</p>}
                {frame && <div ref={courtRef}><PlayCourt key={play.id} playId={play.id} frame={frame} showDefense={showDefense} mirrored={mirrored} speed={speed} paused={paused} playing={playing} onComplete={handleFrameComplete} /></div>}
                {frame && <div className="mt-4">
                  <PlayControls
                    stepIndex={safeStep}
                    stepCount={stepCount}
                    playing={playing}
                    speed={speed}
                    mirrored={mirrored}
                    onPrev={() => { setPaused(false); setPlaying(false); setStepIndex((current) => Math.max(0, current - 1)); }}
                    onNext={() => { setPaused(false); setStepIndex((current) => Math.min(stepCount - 1, current + 1)); }}
                    onTogglePlay={handleTogglePlay}
                    onRestart={handleRestart}
                    onCycleSpeed={handleCycleSpeed}
                    onToggleMirror={() => setMirrored((current) => !current)}
                    onScrub={(index) => { setPaused(false); setPlaying(false); setStepIndex(index); }}
                  />
                </div>}
              </div>
              {frame && <PlayStepPanel play={mirrored ? { ...play, alignment: mirrorText(play.alignment, true), goal: mirrorText(play.goal, true), reads: play.reads.map(read => mirrorText(read, true)) } : play} label={`Step ${safeStep} of ${stepCount - 1}`} text={mirrorText(frame.text, mirrored)} involved={frame.involved} actions={(frame.actions || []).map(action => mirrorText(action, mirrored))} isSetup={safeStep === 0} />}
              {!play.customDraft && <PlayFilmPanel play={play} films={filmLinks} />}
            </div>
          </div>
        )}
      </main>
    </StudioShell>
  );
}
