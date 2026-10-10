import React from 'react';
import { Target, GitBranch, MapPin, MoveRight, User } from 'lucide-react';
import { positionText, roleLabel } from '@/components/playbook/playNarration';

// Narration for the current step: what is happening, who is involved, the
// play's tactical goal, its reads/counters, and the starting alignment.
export default function PlayStepPanel({ play, label, text, involved, actions = [], isSetup = false }) {
  const tokens = involved || [...new Set([...(text || '').matchAll(/\b([OX]\d)\b/g)].map((m) => m[1]))];
  return (
    <div className="court-panel p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="bcast-kicker">{isSetup ? 'Setup' : label}</p>
        <div className="flex flex-wrap gap-1.5">
          {tokens.map((id) => (
            <span key={id} className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 font-mono text-[10.4px] font-semibold ${id[0] === 'O' ? 'border-gold/40 bg-gold/10 text-gold' : 'border-trim/40 bg-trim/10 text-trim-ink'}`}>
              <User className="h-3 w-3" />{roleLabel(id)}
            </span>
          ))}
        </div>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-foreground">{positionText(text)}</p>
      {actions.length > 0 && (
        <div className="mt-3 rounded-xl border border-border/40 bg-raised/30 p-3">
          <p className="mb-1.5 flex items-center gap-1.5 font-mono text-[10.4px] font-semibold uppercase tracking-[0.18em] text-gold"><MoveRight className="h-3.5 w-3.5" />On the court</p>
          <ul className="space-y-1 text-xs leading-relaxed text-muted-foreground">
            {actions.map((line, i) => <li key={i} className="flex gap-1.5"><span className="text-gold">•</span>{positionText(line)}</li>)}
          </ul>
        </div>
      )}
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-border/40 bg-raised/30 p-3">
          <p className="mb-1.5 flex items-center gap-1.5 font-mono text-[10.4px] font-semibold uppercase tracking-[0.18em] text-gold"><Target className="h-3.5 w-3.5" />Tactical goal</p>
          <p className="text-xs leading-relaxed text-muted-foreground">{positionText(play.goal || 'Move the defense until an advantage appears.')}</p>
        </div>
        {play.reads.length > 0 && (
          <div className="rounded-xl border border-border/40 bg-raised/30 p-3">
            <p className="mb-1.5 flex items-center gap-1.5 font-mono text-[10.4px] font-semibold uppercase tracking-[0.18em] text-gold"><GitBranch className="h-3.5 w-3.5" />Reads &amp; counters</p>
            <ul className="space-y-1 text-xs leading-relaxed text-muted-foreground">
              {play.reads.map((read, i) => <li key={i} className="flex gap-1.5"><span className="text-gold">•</span>{positionText(read)}</li>)}
            </ul>
          </div>
        )}
      </div>
      {play.alignment && (
        <p className="mt-3 flex items-start gap-1.5 font-mono text-[10.4px] uppercase tracking-[0.14em] text-muted-foreground"><MapPin className="mt-0.5 h-3 w-3 shrink-0" />Starting alignment: {positionText(play.alignment)}</p>
      )}
    </div>
  );
}
