import React from 'react';
import { useLocation } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import CourtGraphic from '@/components/studio/CourtGraphic';
import { WORKBENCHES } from '@/components/studio/workbenches';
export default function WorkspaceEmpty({ title, children }) {
  const { pathname } = useLocation();
  const Icon = WORKBENCHES.find(tool => tool.path === pathname)?.icon || ArrowUpRight;
  return <section className="court-panel relative flex min-h-64 flex-col items-center justify-center overflow-hidden p-6 text-center sm:min-h-72"><CourtGraphic className="absolute inset-0 h-full w-full opacity-40" /><div className="relative"><span className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-gold/30 bg-canvas"><Icon className="h-7 w-7 text-gold" /></span><h2 className="font-display text-2xl tracking-wide text-foreground sm:text-3xl">{title}</h2><p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">{children}</p></div></section>;
}