import React from 'react';
import { Check } from 'lucide-react';

const STEPS = [
  { id: 'welcome', label: 'Welcome' },
  { id: 'setup', label: 'Franchise setup' },
  { id: 'season', label: 'In-season control room' },
];

// The franchise game path, always visible: welcome → setup → in-season
// control room. Past steps check off, the current step glows.
export default function FranchiseStepRail({ active }) {
  const activeIndex = STEPS.findIndex(step => step.id === active);
  return (
    <ol className="court-panel frx-steps" aria-label="Franchise path">
      {STEPS.map((step, index) => {
        const state = index < activeIndex ? 'done' : index === activeIndex ? 'active' : 'todo';
        return (
          <li key={step.id} className={`frx-step frx-step--${state}`} aria-current={index === activeIndex ? 'step' : undefined}>
            <span className="frx-step__num">{index < activeIndex ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : index + 1}</span>
            <span className="frx-step__label">{step.label}</span>
            {index < STEPS.length - 1 && <span className="frx-step__link" aria-hidden="true" />}
          </li>
        );
      })}
    </ol>
  );
}