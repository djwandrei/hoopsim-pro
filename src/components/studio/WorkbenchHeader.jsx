import React from 'react';
export default function WorkbenchHeader({ title, description, steps = [], current = 0 }) {
  return (
    <header className="border-b border-border/60 bg-canvas">
      <div className="mx-auto max-w-6xl px-4 py-7 sm:px-6 sm:py-8">
        <p className="court-kicker text-xs">DJHC / ANALYTICS WORKSPACE</p>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-5">
          <div className="min-w-0"><h1 className="font-display text-4xl leading-none tracking-wide text-foreground sm:text-5xl">{title}</h1><p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">{description}</p></div>
          {steps.length > 0 && <ol aria-label="Workspace stages" className="flex flex-wrap gap-x-4 gap-y-2">{steps.map((step, index) => <li key={step} aria-current={current === index ? 'step' : undefined} className={current === index ? 'flex items-center gap-2 text-xs font-medium text-gold' : 'flex items-center gap-2 text-xs text-muted-foreground'}><span className="font-mono text-[10px]">0{index + 1}</span>{step}</li>)}</ol>}
        </div>
      </div>
    </header>
  );
}