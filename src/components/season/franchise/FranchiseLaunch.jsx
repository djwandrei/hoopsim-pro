import React, { useState } from 'react';
import { Database } from 'lucide-react';
import FranchiseSetup from './FranchiseSetup';

const SOURCES = [
  {
    id: 'v4', icon: Database, title: 'Exact V4 season',
    blurb: 'A pinned 30-team regular-season snapshot with verified source receipts, roster assignment, and IndexedDB checkpoints.',
  },
];

// Launch phase: hero, a source route picker, and the selected path's setup
// controls. Every control lives inside the two paths — nothing is removed.
export default function FranchiseLaunch({ sim, onBack }) {
  const [path, setPath] = useState('v4');
  return (
    <div className="space-y-4">
      <header className="court-panel frx-panel frx-hero">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="bcast-kicker">Franchise control room · Step 2</p>
            <h2 className="frx-hero__title">Launch a franchise season</h2>
            <p className="frx-note max-w-2xl">Pick a verified scenario source, resolve any multi-team roster names, and initialize the session. The pinned simulation engine handles every game from there.</p>
          </div>
          {onBack && (
            <button type="button" onClick={onBack}
              className="shrink-0 rounded-lg border border-border/50 bg-raised/40 px-3 py-2 text-xs font-semibold uppercase tracking-widest text-foreground transition-colors hover:border-gold/40 hover:text-gold">
              Back
            </button>
          )}
        </div>
      </header>
      <div className="grid gap-3">
        {SOURCES.map(source => {
          const selected = source.id === path;
          const Icon = source.icon;
          return (
            <button key={source.id} type="button" aria-pressed={selected}
              className={`frx-source ${selected ? 'frx-source--active' : ''}`}
              onClick={() => setPath(source.id)}>
              <span className="frx-source__icon"><Icon className="h-5 w-5" aria-hidden="true" /></span>
              <span className="min-w-0">
                <span className="frx-source__title">{source.title}</span>
                <span className="frx-source__blurb">{source.blurb}</span>
              </span>
              <span className={`frx-pill ${selected ? 'frx-pill--live' : 'frx-pill--slate'}`}>{selected ? 'Selected' : 'Choose'}</span>
            </button>
          );
        })}
      </div>
      <FranchiseSetup sim={sim} path={path} />
    </div>
  );
}