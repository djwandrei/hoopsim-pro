import React from 'react';
import { Info } from 'lucide-react';

// Numbered how-to strip shown under the board controls, before the first call.
export default function HowToPlay({ steps = [], note }) {
  if (!steps.length) return null;
  return (
    <details className="dg-howto" aria-label="How to play">
      <summary className="bcast-kicker"><Info className="h-3.5 w-3.5 shrink-0" />How this run works</summary>
      <ol className="dg-howto__steps">
        {steps.map((step, index) => (
          <li key={index} className="dg-howto__step">
            <span className="dg-howto__num" aria-hidden="true">{index + 1}</span>
            <span>{step}</span>
          </li>
        ))}
      </ol>
      {note && <p className="dg-howto__note">{note}</p>}
    </details>
  );
}