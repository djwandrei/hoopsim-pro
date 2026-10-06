import React from 'react';
import { ExternalLink } from 'lucide-react';
import ToolEmblem from '@/components/djhc/ToolEmblem';
import { FAN_TOOLS } from '@/components/djhc/siteNavigation';

// The rest of the DJHC fan-tools suite, as it lives on the live site hub.
// Every tile opens its page on djshouseofcards-comics.com so the whole suite
// stays reachable from one desk.
export default function FanToolsGrid() {
  return <section className="mt-12" aria-labelledby="fan-tools-heading">
    





    
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {FAN_TOOLS.map((tool) => <a key={tool.path} href={tool.href} target="_blank" rel="noreferrer" className="court-panel court-panel-hover group flex min-w-0 items-center gap-4 p-4">
        <ToolEmblem emblem={tool.emblem} label={tool.label} className="h-11 w-11 shrink-0 object-contain" />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-display text-lg tracking-wide text-foreground">{tool.label}</span>
        </span>
        <ExternalLink className="h-4 w-4 shrink-0 text-gold opacity-60 transition-opacity group-hover:opacity-100" aria-hidden="true" />
      </a>)}
    </div>
  </section>;
}