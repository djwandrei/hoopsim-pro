import React, { useState } from 'react';
import { RotateCcw, Save } from 'lucide-react';

// Step 2 · Your setup: the definition's fields, save/reset, and the saved badge.
export default function WorkshopSetup({ definition, savedAt, onSave, onReset }) {
  const [values, setValues] = useState(() => Object.fromEntries(definition.fields.map(field => [field.id, field.defaultValue])));
  const [message, setMessage] = useState('Choose settings, then save them here.');
  const change = (fieldId, value) => setValues(current => ({ ...current, [fieldId]: value }));
  return (
    <section className="court-panel space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="court-kicker">Step 2 · Your setup</p>
          <h2 className="mt-1 font-display text-2xl tracking-wide text-foreground">SET IT UP</h2>
        </div>
        <span className="rounded-full border border-gold/30 bg-gold/5 px-3 py-1 font-mono text-[10px] text-gold">{savedAt ? `Saved locally ${new Date(savedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}` : 'Not saved'}</span>
      </div>
      <form onSubmit={event => { event.preventDefault(); onSave(values, definition); setMessage('Setup saved on this device.'); }} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          {definition.fields.map(field => (
            <label key={field.id} className="block">
              <span className="studio-control-label">{field.label}</span>
              <select value={values[field.id]} onChange={event => change(field.id, event.target.value)} className="studio-select">
                {field.options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
              <span className="mt-1 block text-[10.4px] text-muted-foreground">{field.help}</span>
            </label>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="submit" className="inline-flex items-center gap-2 rounded-lg border border-gold/40 bg-gold/10 px-4 py-2 text-xs font-semibold uppercase tracking-widest text-gold transition-colors hover:bg-gold/20"><Save className="h-4 w-4" aria-hidden="true" />Save setup</button>
          <button type="button" onClick={() => { onReset(definition); setValues(Object.fromEntries(definition.fields.map(field => [field.id, field.defaultValue]))); setMessage('Setup reset. Choose settings, then save them here.'); }} className="inline-flex items-center gap-2 rounded-lg border border-border/50 px-4 py-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground transition-colors hover:border-trim/50 hover:text-trim-ink"><RotateCcw className="h-4 w-4" aria-hidden="true" />Reset setup</button>
          <p role="status" className="text-[11px] text-muted-foreground">{message}</p>
        </div>
      </form>
    </section>
  );
}