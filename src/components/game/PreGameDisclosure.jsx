import React from 'react';
import { ChevronDown } from 'lucide-react';

// Collapses the full pre-game matchup breakdown behind a single toggle once a
// simulation has run, so the live sim sits near the top of the page.
export default function PreGameDisclosure({ home, away, open, onToggle, children }) {
  return (
    <section className="court-panel overflow-hidden">
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left">
        <span className="court-kicker">PRE-GAME MATCHUP INTEL</span>
        <span className="myna-mono flex items-center gap-2 text-[10px] tracking-[0.15em] myna-muted">
          {home.code} VS {away.code}
          <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
        </span>
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </section>
  );
}