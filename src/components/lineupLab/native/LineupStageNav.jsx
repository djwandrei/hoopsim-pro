import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export default function LineupStageNav({ stages, index, onGoto, isRun }) {
  const prev = stages[index - 1];
  const next = stages[index + 1];
  return <div className="ll-stage-nav">
    {prev && <button type="button" className="text-button" onClick={() => onGoto(prev.key)}><ChevronLeft size={14} /> {prev.title}</button>}
    {next && !isRun && <button type="button" className="button" onClick={() => onGoto(next.key)}>Continue: {next.title} <ChevronRight size={14} /></button>}
  </div>;
}