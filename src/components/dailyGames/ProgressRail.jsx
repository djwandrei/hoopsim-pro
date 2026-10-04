import React from 'react';
import { Check, Lock } from 'lucide-react';

export default function ProgressRail({ steps, current, completed = {}, labelFor, pointsFor }) {
  return (
    <nav aria-label="Run progress" className="dg-rail">
      {steps.map((step, index) => {
        const done = Boolean(completed[step]);
        const active = index === current;
        const points = done && pointsFor ? pointsFor(step, index) : null;
        return (
          <div
            key={step}
            className={`dg-rail__step ${done ? 'is-done' : active ? 'is-active' : 'is-locked'}`}
            aria-current={active ? 'step' : undefined}
          >
            {index > 0 && <span className="dg-rail__track" aria-hidden="true" />}
            <span className="dg-rail__dot">
              {done ? <Check className="h-3 w-3" /> : active ? <span className="dg-rail__pulse" /> : <Lock className="h-2.5 w-2.5" />}
            </span>
            <span className="dg-rail__name">{labelFor ? labelFor(step, index) : `Step ${index + 1}`}</span>
            {points != null && <span className="dg-rail__points">{points} pts</span>}
          </div>
        );
      })}
    </nav>
  );
}