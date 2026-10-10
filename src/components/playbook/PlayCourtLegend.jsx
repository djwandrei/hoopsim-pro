import React from 'react';
export default function PlayCourtLegend({ frame, showDefense = true }) {
  if (!Object.keys(frame.defense || {}).length) return null;
  return <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
    <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-gold" />O1–O5: offense</span>
    {showDefense && <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-trim" />X1–X5: defense</span>}
    <span className="basis-full leading-relaxed">{frame.cue}</span>
  </div>;
}
