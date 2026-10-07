import React from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink } from 'lucide-react';
import { FAN_TOOLS } from '@/components/djhc/siteNavigation';
import ToolEmblem from '@/components/djhc/ToolEmblem';

// The rest of the DJHC fan-tools suite, as it lives on the live site hub.
// Every tile opens its page on djshouseofcards-comics.com so the whole suite
// stays reachable from one desk.
export default function FanToolsGrid() {
  return <section className="mt-12" aria-labelledby="fan-tools-heading">
    <div className="rise-in mb-5 flex flex-wrap items-baseline justify-between gap-2">
      <div>
        <p className="bcast-kicker mb-2">DJHC suite</p>
        <h2 id="fan-tools-heading" className="font-display text-xl tracking-wide">THE FAN TOOLS HUB</h2>
      </div>
      <span className="bcast-lowerthird"><span className="bcast-lowerthird__bar" aria-hidden="true"></span>Every desk, one shelf</span>
    </div>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {FAN_TOOLS.map((tool, index) => {
        const tile = <div className="court-panel court-panel-hover flex items-center gap-3 p-3">
          <ToolEmblem emblem={tool.emblem} label={tool.label} className="h-11 w-11 shrink-0" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">{tool.label}</p>
            <p className="truncate text-[10.4px] text-muted-foreground">{tool.route ? 'Opens in the studio' : tool.path}</p>
          </div>
          {tool.route ? null : <ExternalLink className="ml-auto h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />}
        </div>;
        return tool.route
          ? <Link key={tool.path} to={tool.route} className="rise-in block" style={{ '--rise-delay': `${index * 45}ms` }}>{tile}</Link>
          : <a key={tool.path} href={tool.href} target="_blank" rel="noreferrer" className="rise-in block" style={{ '--rise-delay': `${index * 45}ms` }}>{tile}</a>;
      })}
    </div>
  </section>;
}