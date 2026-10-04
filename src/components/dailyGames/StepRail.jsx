import React from 'react';

// Vertical numbered step rail that runs down the left gutter of the board.
export default function StepRail({ total, completedCount, label }) {
  return (
    <nav aria-label="Run progress" className="dg-steprail">
      {Array.from({ length: total }, (_, index) => (
        <React.Fragment key={index}>
          {index > 0 && <span className="dg-steprail__link" aria-hidden="true" />}
          <span className={`dg-steprail__dot ${index < completedCount ? 'is-done' : index === completedCount ? 'is-active' : ''}`}>
            {index + 1}
          </span>
        </React.Fragment>
      ))}
      <span className="dg-steprail__label">{label}</span>
    </nav>
  );
}