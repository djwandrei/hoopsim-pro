import React, { useState } from 'react';
import { Database } from 'lucide-react';
import FranchiseSetup from './FranchiseSetup';

const SOURCES = [
{
  id: 'v4', icon: Database, title: 'Exact V4 season',
  blurb: 'A pinned 30-team regular-season snapshot with verified source receipts, roster assignment, and IndexedDB checkpoints.'
}];


// Launch phase: 2K-style hero, a scenario source picker, and the selected
// path's setup screen. Every control lives inside the two paths — nothing is
// removed and the engine calls are unchanged.
export default function FranchiseLaunch({ sim, onBack }) {
  const [path, setPath] = useState('v4');
  return (
    <div className="space-y-4">
      <header className="frx2k-hero frx2k-hero--slim">
        <span className="frx2k-hero__slash" aria-hidden="true" />
        <span className="frx2k-hero__ghost" aria-hidden="true">Season</span>
        {onBack &&
        <button type="button" onClick={onBack} className="frx2k-cta frx2k-cta--ghost relative self-start">
            <span className="hidden">Back</span>
          </button>
        }
        <p className="frx2k-eyebrow">Franchise control room · Step 2</p>
        <h2 className="frx2k-hero__title frx2k-hero__title--sm">Launch a franchise season</h2>
        <p className="frx2k-hero__sub">Pick a verified scenario source, choose which roster set multi-team players join, and initialize the session. The pinned simulation engine handles every game from there.</p>
      </header>
      <div className="grid gap-3">
        {SOURCES.map((source) => {
          const selected = source.id === path;
          const Icon = source.icon;
          return (
            <button key={source.id} type="button" aria-pressed={selected}
            className={`frx-source hidden ${selected ? 'frx-source--active' : ''}`}
            onClick={() => setPath(source.id)}>
              <span className="frx-source__icon"><Icon className="h-5 w-5" aria-hidden="true" /></span>
              <span className="min-w-0">
                <span className="frx-source__title">{source.title}</span>
                <span className="frx-source__blurb">{source.blurb}</span>
              </span>
              <span className={`frx-pill ${selected ? 'frx-pill--live' : 'frx-pill--slate'}`}>{selected ? 'Selected' : 'Choose'}</span>
            </button>);

        })}
      </div>
      <FranchiseSetup sim={sim} path={path} />
    </div>);

}