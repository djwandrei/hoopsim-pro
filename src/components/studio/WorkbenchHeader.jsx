import React from 'react';
import { useLocation } from 'react-router-dom';
import { Circle, Loader2 } from 'lucide-react';
import WorkbenchStages from '@/components/studio/WorkbenchStages';
import { WORKBENCHES } from '@/components/studio/workbenches';
import CourtGraphic from '@/components/studio/CourtGraphic';
import { Image } from '@/components/ui/image';
import TeamPalettePicker from '@/components/djhc/TeamPalettePicker';
export default function WorkbenchHeader({ title, description, steps = [], current = 0, state, status }) {
  const { pathname } = useLocation();
  const toolIndex = WORKBENCHES.findIndex(tool => pathname === tool.path || pathname.startsWith(`${tool.path}/`));
  const tool = WORKBENCHES[toolIndex];
  const Icon = tool?.icon;
  const loading = state === 'loading' || state === 'idle';
  const badge = loading ? 'Loading season' : state === 'error' ? 'Data unavailable' : status || (state === 'ready' ? 'Ready to explore' : null);
  return <header className="studio-palette-hero relative border-b border-border/40 bg-canvas"><div className="pointer-events-none absolute inset-0 overflow-hidden"><CourtGraphic className="absolute -right-20 -top-14 h-80 w-[32rem] opacity-20" />{tool && <span aria-hidden="true" className="bcast-watermark">0{toolIndex + 1}</span>}</div><div className="relative mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-6"><div className="flex flex-wrap items-center justify-between gap-3"><p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">DJHC <span className="mx-2 text-gold">/</span> SWISHIQ STUDIO {tool && <span className="ml-2 text-gold">/ 0{toolIndex + 1}</span>}</p>{badge && <span className={state === 'error' ? 'flex items-center gap-2 rounded-full border border-trim/40 bg-trim/10 px-3 py-1.5 text-[10px] text-foreground' : 'flex items-center gap-2 rounded-full border border-gold/30 bg-gold/5 px-3 py-1.5 text-[10px] text-gold'}>{loading ? <Loader2 className="h-3 w-3 animate-spin" /> : state === 'ready' ? <span className="h-2 w-2 rounded-full bg-positive" /> : <Circle className="h-2 w-2 fill-current" />}{badge}</span>}</div><div className="mt-6 flex flex-wrap items-start gap-4 min-[781px]:flex-nowrap">{tool?.emblem ? <Image src={tool.emblem} alt="" fittingType="fit" className="hidden h-16 w-16 shrink-0 object-contain sm:block" /> : Icon && <span className="hidden h-14 w-14 shrink-0 items-center justify-center sm:flex"><Icon className="h-10 w-10 text-gold" /></span>}<div className="min-w-0 flex-1"><h1 className="broadcast-gradient-text font-display text-4xl leading-none tracking-wide sm:text-5xl">{title}</h1><span className="hero-rule mt-4" aria-hidden="true" /><p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">{description}</p></div><div className="studio-palette-slot"><TeamPalettePicker /></div></div>{steps.length > 0 && <WorkbenchStages steps={steps} current={current} state={state} />}</div></header>;
}