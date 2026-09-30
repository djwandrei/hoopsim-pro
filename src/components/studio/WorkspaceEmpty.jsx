import React from 'react';
import { ArrowUpRight } from 'lucide-react';
export default function WorkspaceEmpty({ title, children }) {
  return <section className="court-panel flex min-h-52 flex-col items-center justify-center p-6 text-center"><ArrowUpRight className="mb-4 h-6 w-6 text-gold" /><h2 className="font-display text-2xl tracking-wide text-foreground">{title}</h2><p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">{children}</p></section>;
}