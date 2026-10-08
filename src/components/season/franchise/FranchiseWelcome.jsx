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

// Screen 1: the welcome hero. One call to action into the setup screen.
export default function FranchiseWelcome({ sim, onStart }) {
  const seasons = sim.view.v4?.seasons ?? [];
  return (
    <div className="space-y-4">
      <section className="court-panel frx-panel frx-hero" aria-labelledby="frx-welcome-title">
        <p className="bcast-kicker">Franchise control room</p>
        <h2 className="frx-hero__title" id="frx-welcome-title">Run a franchise, season by season</h2>
        <p className="frx-note max-w-2xl">Take control of an NBA franchise inside the pinned V4 simulation engine: load a verified season package, set your rotation, then play the schedule game by game with box scores, standings, and checkpoints.</p>
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <button type="button" onClick={onStart}
            className="book-cta inline-flex items-center gap-2 rounded-lg border border-gold/50 bg-gold/15 px-5 py-2.5 text-sm font-semibold uppercase tracking-widest text-gold transition-colors hover:bg-gold/25">
            <Database className="h-4 w-4" aria-hidden="true" /> Start franchise setup <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </button>
          <span className="frx-pill frx-pill--green">Engine connected</span>
        </div>
      </section>
      <div className="grid gap-3 sm:grid-cols-3">
        {STEP_CARDS.map(step => {
          const Icon = step.icon;
          return (
            <article key={step.title} className="court-panel frx-panel p-4">
              <span className="frx-source__icon"><Icon className="h-5 w-5" aria-hidden="true" /></span>
              <h3 className="frx-source__title mt-2.5">{step.title}</h3>
              <p className="frx-note mt-1">{step.text}</p>
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