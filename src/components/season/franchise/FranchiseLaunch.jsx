import React, { useState } from 'react';
import { Database, FileCheck2 } from 'lucide-react';
import FranchiseSetup from './FranchiseSetup';

const SOURCES = [
  {
    id: 'v4', icon: Database, title: 'Exact V4 season',
    blurb: 'A pinned 30-team regular-season snapshot with verified source receipts, roster-choice review, and IndexedDB checkpoints.',
  },
  {
    id: 'fixture', icon: FileCheck2, title: 'Prepared fixture',
    blurb: 'A locally pinned fixture payload with prepared game inputs — the fastest path to a live session.',
  },
];

// Launch phase: hero, a source route picker, and the selected path's setup
// controls. Every control lives inside the two paths — nothing is removed.
export default function FranchiseLaunch({ sim }) {
  const [path, setPath] = useState('v4');
  return (
    <div className="space-y-4">
      <header className="court-panel frx-panel frx-hero">
        <p className="bcast-kicker">Franchise control room</p>
        <h2 className="frx-hero__title">Launch a franchise season</h2>
        <p className="frx-note max-w-2xl">Pick a verified scenario source, resolve any multi-team roster names, and initialize the session. The pinned simulation engine handles every game from there.</p>
      </header>
      <div className="grid gap-3 sm:grid-cols-2">
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