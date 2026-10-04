import React, { useState } from 'react';
import { ChevronDown, Info } from 'lucide-react';

// How-to disclosure with an optional controls slot (e.g. the board date bar)
// rendered in the collapsed header row, so both share one bar.
export default function HowToPlay({ steps = [], note, controls = null }) {
  const [open, setOpen] = useState(false);
  if (!steps.length && !controls) return null;
  return (
    <div className="dg-howto dg-flow-in" aria-label="How this run works">
      <div className="dg-howto__bar">
        <button type="button" className="bcast-kicker dg-howto__toggle" aria-expanded={open} onClick={() => setOpen(value => !value)}>
          <Info className="h-3.5 w-3.5 shrink-0" /> How this run works
          <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
        </button>
        {controls}
      </div>
      {open && (
        <>
          <ol className="dg-howto__steps">
            {steps.map((step, index) => (
              <li key={index} className="dg-howto__step">
                <span className="dg-howto__num" aria-hidden="true">{index + 1}</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
          {note && <p className="dg-howto__note">{note}</p>}
        </>
      )}
    </div>
  );
}