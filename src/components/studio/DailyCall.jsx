import React from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Sparkles } from 'lucide-react';
import { Image } from '@/components/ui/image';
import { DAILY_GAMES_ROUTES } from '@/components/studio/workbenches';

// Today's call: one daily game featured above the fold, rotating by local
// calendar day so repeat visits land on a fresh hook.
export default function DailyCall() {
  const tool = DAILY_GAMES_ROUTES[Math.floor(Date.now() / 86400000) % DAILY_GAMES_ROUTES.length];
  return <Link to={tool.path} className="court-panel court-panel-hover group flex items-center gap-4 p-4 sm:p-5">
    {tool.emblem && <Image src={tool.emblem} alt="" fittingType="fit" className="h-14 w-14 shrink-0 object-contain sm:h-16 sm:w-16" />}
    <div className="min-w-0 flex-1">
      <p className="court-kicker mb-1 flex items-center gap-1.5"><Sparkles className="h-3 w-3" aria-hidden="true" />Today's call · {tool.tag}</p>
      <h2 className="font-display text-2xl tracking-wide text-foreground">{tool.title}</h2>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{tool.description}</p>
    </div>
    <span className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-gold/40 bg-gold/10 px-3 py-2 text-[10.4px] font-semibold uppercase tracking-widest text-gold transition-colors group-hover:bg-gold/20">Make the call<ChevronRight className="h-3.5 w-3.5" aria-hidden="true" /></span>
  </Link>;
}