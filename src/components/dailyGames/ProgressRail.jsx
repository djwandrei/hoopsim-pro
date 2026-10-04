import React from 'react';
import { Check, Lock } from 'lucide-react';

export default function ProgressRail({ steps, current, completed = {}, labelFor }) {
  return (
    <nav aria-label="Run progress" className="flex flex-wrap items-center gap-1.5">
      {steps.map((step, index) => {
        const done = Boolean(completed[step]);
        const active = index === current;
        return (
          <span
            key={step}
            className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-widest ${
              done ? 'border-positive/50 bg-positive/10 text-positive'
                : active ? 'border-gold/60 bg-gold/10 text-gold'
                  : 'border-border/40 bg-canvas/40 text-muted-foreground'
            }`}
            aria-current={active ? 'step' : undefined}
          >
            {done ? <Check className="h-3 w-3" /> : active ? <span className="h-1.5 w-1.5 rounded-full bg-gold" /> : <Lock className="h-2.5 w-2.5" />}
            {labelFor ? labelFor(step, index) : `Step ${index + 1}`}
          </span>
        );
      })}
    </nav>
  );
}