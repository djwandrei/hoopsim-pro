import React, { useRef } from 'react';
import { Download, FileUp, Save, Undo2 } from 'lucide-react';
import { ghostButton } from './franchiseUi';

// Checkpoint bar: browser/IndexedDB save + resume, portable export, and the
// matching-import gate — with the live status line from the save operations.
export default function FranchiseSaves({ sim }) {
  const saves = sim.view.saves;
  const fileRef = useRef(null);
  return (
    <section className="court-panel frx-strip" aria-label="Checkpoints">
      <span className="frx-strip__seg">
        <span className="bcast-kicker">Checkpoints</span>
        <span className={`frx-pill ${saves.backend === 'indexeddb' ? 'frx-pill--green' : 'frx-pill--slate'}`}>{saves.backend === 'indexeddb' ? 'IndexedDB' : 'localStorage'}</span>
      </span>
      <span className="frx-strip__div" aria-hidden="true" />
      <span className="flex flex-wrap gap-2">
        <button type="button" className={ghostButton} disabled={!saves.canSave} onClick={sim.saveLocal}>
          <Save className="h-3.5 w-3.5" aria-hidden="true" /> {saves.saveLabel}
        </button>
        <button type="button" className={ghostButton} disabled={!saves.canResume} onClick={sim.resumeLocal} title={saves.canResume ? undefined : 'No checkpoint exists for this exact source, model, season, and team pin yet.'}>
          <Undo2 className="h-3.5 w-3.5" aria-hidden="true" /> {saves.resumeLabel}
        </button>
        <button type="button" className={ghostButton} disabled={!saves.canExport} onClick={sim.exportSave}>
          <Download className="h-3.5 w-3.5" aria-hidden="true" /> Export JSON
        </button>
        <label className={saves.canImport ? ghostButton : `${ghostButton} opacity-45 cursor-not-allowed`} title={saves.importTitle} aria-disabled={String(!saves.canImport)}>
          <FileUp className="h-3.5 w-3.5" aria-hidden="true" /> Import JSON
          <input ref={fileRef} type="file" accept="application/json,.json" className="sr-only" disabled={!saves.canImport}
            onChange={event => sim.importSave(event.target.files?.[0])} />
        </label>
      </span>
      <p className="frx-note w-full" role="status">{sim.view.saveStatus}</p>
    </section>
  );
}