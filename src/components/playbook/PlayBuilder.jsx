import React, { useMemo, useState } from 'react';
import { Plus, Save, Play, ArrowUp, ArrowDown, Copy, Trash2, X } from 'lucide-react';
import PlayEditorCourt from '@/components/playbook/PlayEditorCourt';
import PlayCourt from '@/components/playbook/PlayCourt';
import PlayControls from '@/components/playbook/PlayControls';
import PlayStepPanel from '@/components/playbook/PlayStepPanel';
import { clampPoint } from '@/components/playbook/playGeometry';
import { mirrorText, roleLabel } from '@/components/playbook/playNarration';
import { OFFENSE_IDS, DEFENSE_IDS, SCREEN_TYPES, MAX_CUSTOM_STEPS, customId, createCustomStep, normalizeCustomPlay, customLibraryPlay, compileCustomPlay, ballOwnerBeforeStep } from '@/components/playbook/customPlays';

const button = 'inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg border border-border/50 bg-raised/40 px-3 text-sm text-foreground hover:border-gold/50 disabled:cursor-not-allowed disabled:opacity-40';
const input = 'mt-1 min-h-10 w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm text-foreground';
function Field({ label, children }) { return <label className="block min-w-0 text-xs font-semibold text-muted-foreground">{label}{children}</label>; }
function PlayerSelect({ label, value, onChange, ids = OFFENSE_IDS }) {
  return <Field label={label}><select className={input} value={value} onChange={event => onChange(event.target.value)}>{ids.map(id => <option key={id} value={id}>{roleLabel(id)}</option>)}</select></Field>;
}

export default function PlayBuilder({ initialDraft, onSave, onCancel }) {
  const [draft, setDraft] = useState(() => structuredClone(initialDraft));
  const [selected, setSelected] = useState(0), [actor, setActor] = useState('O1');
  const [preview, setPreview] = useState(null), [previewStep, setPreviewStep] = useState(0);
  const [playing, setPlaying] = useState(false), [paused, setPaused] = useState(false);
  const [speed, setSpeed] = useState(1), [mirrored, setMirrored] = useState(false);
  const [message, setMessage] = useState(''), [discard, setDiscard] = useState(false);
  const [dirty, setDirty] = useState(false);
  const step = selected ? draft.steps[selected - 1] : null;
  const positions = step?.positions || draft.setup;
  const previous = selected > 1 ? draft.steps[selected - 2].positions : selected ? draft.setup : null;
  const owner = ballOwnerBeforeStep(draft, Math.max(0, selected - 1));
  const previewPlay = useMemo(() => preview ? customLibraryPlay(preview.draft) : null, [preview]);
  const frames = preview ? [preview.animation.setup, ...preview.animation.frames] : [];
  const frame = frames[previewStep];
  const change = update => {
    setDraft(current => update(current)); setDirty(true); setPreview(null); setPlaying(false); setPaused(false); setMessage(''); setDiscard(false);
  };
  const updateStep = update => change(current => ({ ...current, steps: current.steps.map((item, index) => index === selected - 1 ? update(item) : item) }));
  const place = (id, point) => {
    const next = clampPoint(point, draft.courtHeight);
    if (selected) updateStep(item => ({ ...item, positions: { ...item.positions, [id]: next } }));
    else change(current => ({ ...current, setup: { ...current.setup, [id]: next } }));
  };
  const addStep = () => {
    if (draft.steps.length >= MAX_CUSTOM_STEPS || draft.steps.at(-1)?.action.type === 'shot') return;
    change(current => ({ ...current, steps: [...current.steps, createCustomStep(current.steps.at(-1)?.positions || current.setup)] }));
    setSelected(draft.steps.length + 1);
  };
  const setAction = type => updateStep(item => ({ ...item, action: type === 'pass' || type === 'handoff' ? { type, to: owner === 'O2' ? 'O3' : 'O2' }
    : type === 'screen' ? { type, screener: 'O5', target: 'X1', kind: 'ball' }
      : type === 'use' ? { type, actor: 'O1', screener: 'O5' } : { type } }));
  const actionField = (field, value) => updateStep(item => {
    const action = { ...item.action, [field]: value };
    if (action.type === 'use' && action.actor === action.screener) action.screener = OFFENSE_IDS.find(id => id !== action.actor);
    return { ...item, action };
  });
  const runPreview = () => {
    try {
      const clean = normalizeCustomPlay(draft), animation = compileCustomPlay(clean);
      setPreview({ draft: clean, animation }); setPreviewStep(0); setPlaying(false); setPaused(false); setMessage('');
    } catch (error) { setMessage(error.message); }
  };
  const save = () => {
    try { const clean = normalizeCustomPlay(draft); compileCustomPlay(clean); onSave(clean); }
    catch (error) { setMessage(error.message); }
  };
  const moveStep = offset => {
    const index = selected - 1, target = index + offset;
    if (target < 0 || target >= draft.steps.length) return;
    change(current => { const steps = [...current.steps]; [steps[index], steps[target]] = [steps[target], steps[index]]; return { ...current, steps }; });
    setSelected(target + 1);
  };
  const stopAt = index => { setPreviewStep(index); setPlaying(false); setPaused(false); };
  return <section className="court-panel p-4 sm:p-5" aria-labelledby="play-builder-title">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div><h2 id="play-builder-title" className="font-display text-2xl text-foreground">CREATE YOUR PLAY</h2><p className="mt-1 text-xs text-muted-foreground">Set the formation, add movement steps, then preview and save to My plays.</p></div>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={button} onClick={runPreview}><Play className="h-4 w-4" />Preview</button>
        <button type="button" className={`${button} border-gold/50 bg-gold/10 text-gold`} onClick={save}><Save className="h-4 w-4" />Save play</button>
        <button type="button" className={button} onClick={() => dirty ? setDiscard(true) : onCancel()}><X className="h-4 w-4" />Cancel</button>
      </div>
    </div>
    {discard && <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-border p-3 text-sm" role="alert"><span>Discard these unsaved changes?</span><button type="button" className={button} onClick={onCancel}>Discard draft</button><button type="button" className={button} onClick={() => setDiscard(false)}>Keep editing</button></div>}
    {message && <p role="alert" className="mb-4 rounded-lg border border-trim/50 bg-trim/10 p-3 text-sm text-trim-ink">{message}</p>}
    <div className="grid items-start gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
      <div className="min-w-0 space-y-4">
        <Field label="Play name"><input className={input} maxLength={80} value={draft.name} onChange={event => change(current => ({ ...current, name: event.target.value }))} /></Field>
        <Field label="Tactical goal"><textarea className={input} rows={2} maxLength={500} placeholder="What should this play create?" value={draft.goal} onChange={event => change(current => ({ ...current, goal: event.target.value }))} /></Field>
        <div className="rounded-lg border border-border/50 p-3">
          <label className="flex min-h-10 items-center gap-2 text-sm font-semibold text-foreground"><input type="checkbox" checked={draft.showDefense} onChange={event => {
            const showDefense = event.target.checked;
            // This is a view preference; changing it does not restart playback.
            setDraft(current => ({ ...current, showDefense })); setDirty(true);
            if (!showDefense && actor[0] === 'X') setActor('O1');
          }} />Show defense</label>
          <p className="text-xs leading-relaxed text-muted-foreground">Hiding defense keeps its positions and movements in the play.</p>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2"><h3 className="text-sm font-semibold text-foreground">Play sequence</h3><span className="font-mono text-xs text-muted-foreground">{draft.steps.length}/{MAX_CUSTOM_STEPS}</span></div>
          <div className="max-h-56 space-y-1 overflow-y-auto pr-1" role="group" aria-label="Select a play step">
            {[{ id: 'setup', title: 'Starting formation' }, ...draft.steps].map((item, index) => <button key={item.id} type="button" aria-pressed={!preview && selected === index} className={`${button} w-full justify-start text-left ${!preview && selected === index ? 'border-gold/60 bg-gold/10' : ''}`} onClick={() => { setSelected(index); setPreview(null); setPlaying(false); setPaused(false); }}><span className="font-mono text-xs text-gold">{index === 0 ? 'SET' : String(index).padStart(2, '0')}</span><span className="truncate">{item.title || `Step ${index}`}</span></button>)}
          </div>
          <button type="button" className={`${button} w-full`} disabled={draft.steps.length >= MAX_CUSTOM_STEPS || draft.steps.at(-1)?.action.type === 'shot'} onClick={addStep}><Plus className="h-4 w-4" />Add step</button>
          {draft.steps.at(-1)?.action.type === 'shot' && <p className="text-xs text-muted-foreground">The shot ends this possession. Change or remove it to add another step.</p>}
        </div>
        {!step ? <PlayerSelect label="Starting ballhandler" value={draft.owner} onChange={value => change(current => ({ ...current, owner: value }))} /> : <div className="space-y-3 rounded-lg border border-border/50 p-3">
          <div className="flex flex-wrap gap-1.5">
            <button type="button" className={button} aria-label="Move step earlier" disabled={selected === 1} onClick={() => moveStep(-1)}><ArrowUp className="h-4 w-4" /></button>
            <button type="button" className={button} aria-label="Move step later" disabled={selected === draft.steps.length} onClick={() => moveStep(1)}><ArrowDown className="h-4 w-4" /></button>
            <button type="button" className={button} aria-label="Duplicate step" disabled={draft.steps.length >= MAX_CUSTOM_STEPS || step.action.type === 'shot'} onClick={() => {
              change(current => { const steps = [...current.steps]; steps.splice(selected, 0, { ...structuredClone(step), id: customId() }); return { ...current, steps }; }); setSelected(selected + 1);
            }}><Copy className="h-4 w-4" /></button>
            <button type="button" className={button} aria-label="Delete step" onClick={() => { change(current => ({ ...current, steps: current.steps.filter((_, index) => index !== selected - 1) })); setSelected(Math.max(0, selected - 1)); }}><Trash2 className="h-4 w-4" /></button>
          </div>
          <Field label="Step title"><input className={input} maxLength={70} placeholder={`Step ${selected}`} value={step.title} onChange={event => updateStep(item => ({ ...item, title: event.target.value }))} /></Field>
          <Field label="Action after movement"><select className={input} value={step.action.type} onChange={event => setAction(event.target.value)}>
            <option value="move">Move / hold spacing</option><option value="pass">Pass</option><option value="handoff">Handoff</option><option value="screen">Set screen</option><option value="use">Use screen during movement</option><option value="shot">Shoot</option>
          </select></Field>
          <p className="text-xs leading-relaxed text-muted-foreground">{owner ? `${roleLabel(owner)} starts this step with the ball.` : 'The previous shot ended possession.'} Players moved in the same step move together; passes, handoffs, screens and shots follow their movement. Set a screen in an earlier step before using it.</p>
          {['pass', 'handoff'].includes(step.action.type) && <PlayerSelect label="Receiver" value={step.action.to} ids={OFFENSE_IDS.filter(id => id !== owner)} onChange={value => actionField('to', value)} />}
          {step.action.type === 'screen' && <>
            <PlayerSelect label="Screener" value={step.action.screener} onChange={value => actionField('screener', value)} />
            <PlayerSelect label="Defender being screened" value={step.action.target} ids={DEFENSE_IDS} onChange={value => actionField('target', value)} />
            <Field label="Screen type"><select className={input} value={step.action.kind} onChange={event => actionField('kind', event.target.value)}>{SCREEN_TYPES.map(type => <option key={type} value={type}>{type.replaceAll('-', ' ')} screen</option>)}</select></Field>
          </>}
          {step.action.type === 'use' && <><PlayerSelect label="Cutter / ballhandler" value={step.action.actor} onChange={value => actionField('actor', value)} /><PlayerSelect label="Established screener" value={step.action.screener} ids={OFFENSE_IDS.filter(id => id !== step.action.actor)} onChange={value => actionField('screener', value)} /></>}
          <Field label="Coaching note"><textarea className={input} rows={2} maxLength={400} placeholder="Explain the timing or read using PG, SG, SF, PF and C." value={step.notes} onChange={event => updateStep(item => ({ ...item, notes: event.target.value }))} /></Field>
        </div>}
      </div>
      <div className="min-w-0 space-y-4">
        <div className="rounded-xl border border-border/50 bg-background/30 p-3 sm:p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h3 className="font-display text-xl text-foreground">{preview ? 'ANIMATED PREVIEW' : selected ? `STEP ${selected} · END POSITIONS` : 'STARTING FORMATION'}</h3>{preview && <button type="button" className={button} onClick={() => { setPreview(null); setPlaying(false); setPaused(false); }}>Back to editing</button>}</div>
          {frame ? <>
            <PlayCourt key={`${draft.id}-preview`} playId={`${draft.id}-preview`} frame={frame} showDefense={draft.showDefense} mirrored={mirrored} speed={speed} playing={playing} paused={paused} onComplete={() => { if (playing && previewStep < frames.length - 1) setPreviewStep(previewStep + 1); else setPlaying(false); }} />
            <div className="mt-4"><PlayControls stepIndex={previewStep} stepCount={frames.length} playing={playing} speed={speed} mirrored={mirrored}
              onPrev={() => stopAt(Math.max(0, previewStep - 1))} onNext={() => stopAt(Math.min(frames.length - 1, previewStep + 1))} onScrub={stopAt} onRestart={() => stopAt(0)}
              onTogglePlay={() => { if (!playing && previewStep === frames.length - 1) setPreviewStep(0); setPaused(playing); setPlaying(!playing); }}
              onCycleSpeed={() => setSpeed(current => current === 1 ? 1.5 : current === 1.5 ? 2 : 1)} onToggleMirror={() => setMirrored(current => !current)} /></div>
          </> : <><PlayEditorCourt positions={positions} previous={previous} owner={owner} courtHeight={draft.courtHeight} showDefense={draft.showDefense} selectedActor={actor} onSelect={setActor} onPlace={place} /><p className="mt-3 text-xs leading-relaxed text-muted-foreground">Drag a player, or select a position below and click the court. Keyboard: focus a player and use the arrow keys; hold Shift for larger moves. Dashed lines connect this step’s starting and ending positions; Preview shows the actual routes.</p></>}
        </div>
        {frame && previewPlay ? <PlayStepPanel play={mirrored ? { ...previewPlay, alignment: mirrorText(previewPlay.alignment, true), goal: mirrorText(previewPlay.goal, true) } : previewPlay} label={`Step ${previewStep} of ${frames.length - 1}`} text={mirrorText(frame.text, mirrored)} involved={frame.involved} actions={(frame.actions || []).map(action => mirrorText(action, mirrored))} isSetup={previewStep === 0} /> : <div className="rounded-xl border border-border/50 p-3 sm:p-4">
          <h3 className="mb-3 text-sm font-semibold text-foreground">Place a player</h3>
          <div className="mb-3 flex flex-wrap gap-2" role="group" aria-label="Select a player to position">{[...OFFENSE_IDS, ...(draft.showDefense ? DEFENSE_IDS : [])].map(id => <button key={id} type="button" className={`${button} ${actor === id ? 'border-gold/60 bg-gold/10 text-gold' : ''}`} aria-pressed={actor === id} onClick={() => setActor(id)}>{roleLabel(id)}</button>)}</div>
          <div className="grid grid-cols-2 gap-3">{['Horizontal position', 'Vertical position'].map((label, axis) => <Field key={`${actor}-${selected}-${axis}`} label={`${roleLabel(actor)} · ${label}`}><input className={input} type="number" min={32} max={axis === 0 ? 468 : draft.courtHeight - 32} step={1} value={Math.round(positions[actor][axis])} onChange={event => { if (!event.target.value || !Number.isFinite(event.target.valueAsNumber)) return; const next = [...positions[actor]]; next[axis] = event.target.valueAsNumber; place(actor, next); }} /></Field>)}</div>
        </div>}
      </div>
    </div>
  </section>;
}
