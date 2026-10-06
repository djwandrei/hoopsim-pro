import React from 'react';
import { Link } from 'react-router-dom';
import { History } from 'lucide-react';
import { recentTools } from '@/lib/recentTools';

// Home-page "pick up where you left off" chips: the last tools visited this
// session, as one quiet strip under the ticker.
export default function ResumeStrip() {
  const recent = recentTools();
  if (!recent.length) return null;
  return <div className="rise-in mb-4 flex flex-wrap items-center gap-2">
    <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground"><History className="h-3.5 w-3.5 text-gold" /> Resume</span>
    {recent.map(item => (
      <Link key={item.path} to={item.path} className="rounded-full border border-border/40 bg-card px-3 py-1.5 text-[11px] font-medium text-foreground transition-colors hover:border-gold/50 hover:text-gold">
        {item.label}
      </Link>
    ))}
  </div>;
}