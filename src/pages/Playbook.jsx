import React, { useCallback, useEffect, useMemo, useState } from 'react';
import usePageMeta from '@/hooks/usePageMeta';
import { Loader2, RefreshCw } from 'lucide-react';
import StudioShell from '@/components/studio/StudioShell';
import WorkbenchHeader from '@/components/studio/WorkbenchHeader';
import { loadPlayLibrary, findPlay } from '@/components/playbook/playLibrary';
import { buildFrames } from '@/components/playbook/playAnimation';
import PlayCourt from '@/components/playbook/PlayCourt';
import PlayControls from '@/components/playbook/PlayControls';
import PlayStepPanel from '@/components/playbook/PlayStepPanel';
import PlayLibraryList from '@/components/playbook/PlayLibraryList';
import '@/components/playbook/playbook.css';

const SPEEDS = [1, 1.5, 2];

// Interactive Playbook: every play from the animation dictionary runs on an
// animated half court, step by step, with the who/what/why narrated beside it.
export default function Playbook() {
  usePageMeta({ title: 'Interactive Playbook — SwishIQ Studio', description: 'Learn basketball plays, sets and schemes on an animated half court: labelled players run each step while the who, the what and the why are narrated.' });
  const [library, setLibrary] = useState(null);
  const [error, setError] = useState(null);
  const load = useCallback(() => {
    setError(null);
    loadPlayLibrary().then(setLibrary).catch((err) => setError(err.message || 'The play library could not be loaded.'));
  }, []);
  useEffect(load, [load]);

  const initialParams = useMemo(() => new URLSearchParams(window.location.search), []);
  const [playId, setPlayId] = useState(initialParams.get('play'));
  const [stepIndex, setStepIndex] = useState(Number(initialParams.get('step')) || 0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [mirrored, setMirrored] = useState(false);

  const play = useMemo(() => (library ? findPlay(library, playId) || library.categories[0].plays[0] : null), [library, playId]);
  const animation = useMemo(() => (play ? buildFrames(play) : null), [play]);
  const frames = useMemo(() => (animation ? [{ ...animation.setup }, ...animation.frames] : []), [animation]);
  const stepCount = frames.length;
  const safeStep = Math.min(stepIndex, Math.max(0, stepCount - 1));
  const frame = frames[safeStep];

  useEffect(() => { setStepIndex(0); }, [playId]);

  // Auto-advance through the steps while playing.
  useEffect(() => {
    if (!playing || safeStep >= stepCount - 1) {
      if (playing && safeStep >= stepCount - 1) setPlaying(false);
      return;
    }
    const timer = setTimeout(() => setStepIndex((current) => Math.min(current + 1, stepCount - 1)), 2300 / speed);
    return () => clearTimeout(timer);
  }, [playing, safeStep, speed, stepCount]);

  // Shareable call: the selected play and step live in the URL.
  useEffect(() => {
    if (!play) return;
    const query = new URLSearchParams({ play: play.id, step: String(safeStep) }).toString();
    window.history.replaceState(null, '', `${window.location.pathname}?${query}`);
  }, [play, safeStep]);

  const handleTogglePlay = () => {
    if (!playing && safeStep >= stepCount - 1) setStepIndex(0);
    setPlaying((current) => !current);
  };
  const handleRestart = () => { setPlaying(false); setStepIndex(0); };
  const handleCycleSpeed = () => setSpeed((current) => SPEEDS[(SPEEDS.indexOf(current) + 1) % SPEEDS.length]);

  return (
    <StudioShell active="/playbook">
      <WorkbenchHeader
        title="INTERACTIVE PLAYBOOK"
        description="Learn the dictionary of basketball plays, sets and schemes on an animated half court. Labelled players run each step of the action while the narration explains what is happening, who is involved and what each move is trying to accomplish."
        steps={['Browse the play library', 'Run the step animation', 'Study the reads & goals']}
        current={safeStep > 0 ? 2 : play ? 1 : 0}
        state={!library ? 'loading' : error ? 'error' : 'ready'}
        status={library ? `${library.playCount} plays, sets & schemes` : undefined}
      />
      <main className="mx-auto min-w-0 max-w-7xl px-4 py-6 sm:px-6">
        {error && (
          <div className="court-panel flex flex-wrap items-center justify-between gap-3 p-4">
            <p className="text-sm text-trim-ink">{error}</p>
            <button type="button" onClick={load} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-gold/40 bg-gold/10 px-3 text-xs font-semibold uppercase tracking-widest text-gold"><RefreshCw className="h-4 w-4" />Retry</button>
          </div>
        )}
        {!library && !error && (
          <div className="court-panel grid h-64 place-items-center p-4">
            <span className="inline-flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading the play library…</span>
          </div>
        )}
        {library && play && frame && (
          <div className="grid items-start gap-4 lg:grid-cols-[290px_minmax(0,1fr)]">
            <PlayLibraryList categories={library.categories} selectedId={play.id} onSelect={(id) => { setPlaying(false); setPlayId(id); }} />
            <div className="min-w-0 space-y-4">
              <div className="court-panel p-4 sm:p-5">
                <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="font-display text-2xl tracking-wide text-foreground">{play.name}</h2>
                  <span className="bcast-lowerthird">{play.type}</span>
                </div>
                <PlayCourt key={play.id} playId={play.id} frame={frame} mirrored={mirrored} />
                <div className="mt-4">
                  <PlayControls
                    stepIndex={safeStep}
                    stepCount={stepCount}
                    playing={playing}
                    speed={speed}
                    mirrored={mirrored}
                    onPrev={() => { setPlaying(false); setStepIndex((current) => Math.max(0, current - 1)); }}
                    onNext={() => setStepIndex((current) => Math.min(stepCount - 1, current + 1))}
                    onTogglePlay={handleTogglePlay}
                    onRestart={handleRestart}
                    onCycleSpeed={handleCycleSpeed}
                    onToggleMirror={() => setMirrored((current) => !current)}
                    onScrub={(index) => { setPlaying(false); setStepIndex(index); }}
                  />
                </div>
              </div>
              <PlayStepPanel play={play} label={`Step ${safeStep} of ${stepCount - 1}`} text={frame.text} isSetup={safeStep === 0} />
            </div>
          </div>
        )}
      </main>
    </StudioShell>
  );
}