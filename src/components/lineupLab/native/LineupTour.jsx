import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import CourtArt from '@/components/lineupLab/native/CourtArt';

const KEY = 'll-tour-v1';
const steps = [
  { n: '01', title: 'Load your squad', body: 'Pick a historical team and season. Your last choice loads automatically when you return.' },
  { n: '02', title: 'Call the game plan', body: 'Choose what you are building — starting five or full rotation — then shape the objective with presets or fine-tuning sliders.' },
  { n: '03', title: 'Set boundaries & pool', body: 'In the pool stage, lock your must-haves and exclude anyone off the table. Detailed mode adds court-role rules and production floors.' },
  { n: '04', title: 'Run the build', body: 'Solve for the best eligible group, then read the desk: run summary, diff vs your last run, and click any player for their season line.' },
];

export default function LineupTour() {
  const [open, setOpen] = useState(() => { try { return !localStorage.getItem(KEY); } catch { return false; } });
  const [step, setStep] = useState(0);
  useEffect(() => {
    const openTour = () => { setStep(0); setOpen(true); };
    window.addEventListener('ll-open-tour', openTour);
    return () => window.removeEventListener('ll-open-tour', openTour);
  }, []);
  const close = done => {
    setOpen(false);
    try { localStorage.setItem(KEY, 'done'); } catch { /* appearance still works */ }
    if (done) window.dispatchEvent(new CustomEvent('ll-goto-stage', { detail: 'season' }));
  };
  if (!open) return null;
  const current = steps[step];
  return <div className="ll-tour" role="dialog" aria-modal="true" aria-label="Lineup Lab game guide">
    <div className="ll-tour__panel">
      <CourtArt className="ll-tour__art" />
      <p className="court-kicker">Game guide · Step {step + 1} of {steps.length}</p>
      <h2>{current.title}</h2>
      <p className="helper">{current.body}</p>
      <div className="ll-tour__dots" aria-hidden="true">{steps.map((s, i) => <span key={s.n} className={i <= step ? 'is-lit' : ''} />)}</div>
      <div className="ll-tour__actions">
        {step > 0 && <button type="button" className="text-button" onClick={() => setStep(step - 1)}>Back</button>}
        {step < steps.length - 1
          ? <button type="button" className="button" onClick={() => setStep(step + 1)}>Next</button>
          : <button type="button" className="button" onClick={() => close(true)}>Start building</button>}
        <button type="button" className="text-button" onClick={() => close(false)}>Skip tour</button>
      </div>
      <button type="button" className="ll-tour__close" aria-label="Close guide" onClick={() => close(false)}><X size={16} /></button>
    </div>
  </div>;
}