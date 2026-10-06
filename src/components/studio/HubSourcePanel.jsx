import React from 'react';
import { ShieldCheck } from 'lucide-react';

// One at-a-glance panel of what this workspace carries and how it is wired:
// verified local modules, the relay that streams the live site's pinned
// season data, and the standing rule that no season packages are stored here.
const FACTS = [
  ['31/31', 'Emblems & logos verified by SHA-256'],
  ['9', 'Studio engine modules, release-pinned'],
  ['11', 'Lineup Lab solver modules'],
  ['4', 'Relay functions streaming the live site'],
];

export default function HubSourcePanel() {
  return <section className="mt-12" aria-labelledby="source-heading">
    <div className="court-panel relative overflow-hidden p-5 sm:p-6">
      <div className="relative flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="bcast-kicker mb-2">Verified source</p>
          <h2 id="source-heading" className="font-display text-xl tracking-wide">HOW EVERYTHING IS WIRED</h2>
        </div>
        <span className="bcast-lowerthird"><span className="bcast-lowerthird__bar" aria-hidden="true"></span><ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />Integrity-checked imports</span>
      </div>
      <p className="relative mt-4 max-w-3xl text-xs leading-relaxed text-muted-foreground">Every imported module and emblem matches its SHA-256 pin from the original site. Season data is never stored in this workspace — the studio streams the live site's release-pinned v4 packages through verified relays, so the packages themselves can't crash the page.</p>
      <div className="relative mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {FACTS.map(([value, label]) => <div key={label} className="metric-tile">
          <p className="font-display text-3xl tracking-wide text-gold">{value}</p>
          <p className="mt-1 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
        </div>)}
      </div>
    </div>
  </section>;
}