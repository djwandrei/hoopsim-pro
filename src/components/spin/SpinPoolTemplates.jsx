import React from 'react';
import { Bookmark, X } from 'lucide-react';

// Saved pool templates: one-tap restore of a recent control-desk setup.
export default function SpinPoolTemplates({ templates, onApply, onRemove }) {
  if (!templates.length) return null;
  return <div className="court-panel space-y-2 p-4">
    <p className="bcast-kicker">Pool templates</p>
    <div className="flex flex-wrap gap-1.5">
      {templates.map((template) => (
        <span key={template.label} className="inline-flex items-center gap-1 rounded-full border border-border/40 bg-raised/30">
          <button type="button" onClick={() => onApply(template)} aria-label={`Apply the ${template.label} pool template`}
            className="inline-flex items-center gap-1.5 rounded-l-full py-1.5 pl-3 pr-1.5 font-mono text-[10.4px] font-semibold text-foreground transition-colors hover:text-gold">
            <Bookmark className="h-3 w-3 text-gold" aria-hidden="true" />{template.label}
          </button>
          <button type="button" onClick={() => onRemove(template.label)} aria-label={`Remove the ${template.label} pool template`}
            className="rounded-r-full p-1.5 pr-2 text-muted-foreground transition-colors hover:text-trim-ink"><X className="h-3 w-3" aria-hidden="true" /></button>
        </span>
      ))}
    </div>
  </div>;
}