import React, { useRef } from 'react';
import { Download, FileUp, Save, Undo2 } from 'lucide-react';
import { ghostButton } from './franchiseUi';

// Checkpoint bar: browser/IndexedDB save + resume, portable export, and the
// matching-import gate — with the live status line from the save operations.
export default function FranchiseSaves({ sim }) {
  const saves = sim.view.saves;
  const fileRef = useRef(null);
  return (
    <section className="court-panel frx-panel space-y-3 p-4" aria-labelledby="frx-saves-title">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="bcast-kicker">Checkpoints</p>
        <span className="frx-pill frx-pill--slate">{saves.backend === 'indexeddb' ? 'IndexedDB' : 'localStorage'}</span>
      </div>
      <div className="flex flex-wrap gap-2.5">
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
      </div>
      <p className="frx-note" role="status">{sim.view.saveStatus}</p>
    </section>
  );
}