import React from 'react';
import { ArrowRight, Database, Gamepad2, ListChecks } from 'lucide-react';

const STEP_CARDS = [
  {
    icon: Database,
    title: 'Pick your season & team',
    text: 'Choose an exact pinned V4 regular season and the franchise you control. The verified season package loads with source receipts.',
  },
  {
    icon: ListChecks,
    title: 'Set your rotation',
    text: 'Mark five starters and distribute the 240-minute rotation before your first game. Edits save with an action receipt.',
  },
  {
    icon: Gamepad2,
    title: 'Play the schedule',
    text: 'Advance games one at a time or jump to your next game, with box scores, the full schedule board, and league standings updating live.',
  },
];

// Screen 1: the 2K-style mode hero. One call to action into the setup screen.
export default function FranchiseWelcome({ sim, onStart }) {
  const seasons = sim.view.v4?.seasons ?? [];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={onStart} className="frx2k-cta">
          <span>Start franchise setup <ArrowRight className="h-4 w-4" aria-hidden="true" /></span>
        </button>
        <span className="frx-pill frx-pill--green">Engine connected</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {STEP_CARDS.map((step, index) => {
          const Icon = step.icon;
          return (
            <article key={step.title} className="frx2k-tile">
              <span className="frx2k-tile__num" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
              <span className="frx2k-tile__icon"><Icon className="h-5 w-5" aria-hidden="true" /></span>
              <h3 className="frx2k-tile__title">{step.title}</h3>
              <p className="frx2k-tile__text">{step.text}</p>
            </article>
          );
        })}
      </div>
      {seasons.length > 0 && (
        <p className="frx-note">Exact V4 regular seasons available: {seasons.map(year => `${year}–${String(year + 1).slice(2)}`).join(' · ')}</p>
      )}
    </div>
  );
}