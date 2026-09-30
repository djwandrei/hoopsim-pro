import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
export default function WorkbenchCard({ tool, index }) {
  const Icon = tool.icon;
  return <Link to={tool.path} className="court-panel group flex min-w-0 flex-col p-5 hover:border-gold/50 sm:p-6"><div className="flex items-start justify-between"><span className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-raised"><Icon className="h-5 w-5 text-gold" /></span><span className="font-mono text-xs text-muted-foreground">0{index + 1}</span></div><p className="mt-5 text-[9px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">{tool.tag}</p><h2 className="mt-1 font-display text-3xl tracking-wide text-foreground">{tool.title}</h2><p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">{tool.description}</p><div className="mt-6 flex items-center justify-between gap-3 border-t border-border/60 pt-4"><span className="text-[10px] text-muted-foreground">{tool.flow}</span><ArrowUpRight className="h-4 w-4 shrink-0 text-gold" /></div></Link>;
}