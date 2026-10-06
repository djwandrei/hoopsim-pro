import React from 'react';
export default function WorkbenchStages({ steps, current, state }) {
  const active = state && state !== 'ready' ? 0 : current;
  const loading = state === 'idle' || state === 'loading';
  return <ol aria-label="Workspace progression" className="mt-7 grid gap-2 sm:grid-cols-3">{steps.map((step, index) => null)}</ol>;
}