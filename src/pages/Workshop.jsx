import React, { useEffect, useState } from 'react';
import { ShieldCheck, Wrench } from 'lucide-react';
import StudioShell from '@/components/studio/StudioShell';
import WorkbenchHeader from '@/components/studio/WorkbenchHeader';
import usePageMeta from '@/hooks/usePageMeta';
import { WORKSHOP_DEFINITIONS, getWorkshopDefinition } from '@/components/workshop/workshopDefinitions';
import WorkshopSetup from '@/components/workshop/WorkshopSetup';

const WORKSHOP_STORAGE_KEY = 'djhc:tool-workshop:v1';
const urlParams = new URLSearchParams(window.location.search);

function readDrafts() {
  try {
    const parsed = JSON.parse(localStorage.getItem(WORKSHOP_STORAGE_KEY) || '');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeDraft(drafts, definitionId, values) {
  const next = { ...drafts, [definitionId]: { values, savedAt: Date.now() } };
  try { localStorage.setItem(WORKSHOP_STORAGE_KEY, JSON.stringify(next)); } catch { /* storage unavailable */ }
  return next;
}

export default function Workshop() {
  usePageMeta({ title: 'Workshop · SwishIQ Studio', description: 'Preview the upcoming fan-tool workshop experiences: review each setup, save it on this device, and follow the build steps.' });
  const [experienceId, setExperienceId] = useState(() => {
    const requested = urlParams.get('experience');
    return WORKSHOP_DEFINITIONS.some(definition => definition.id === requested) ? requested : WORKSHOP_DEFINITIONS[0].id;
  });
  const [drafts, setDrafts] = useState({});
  useEffect(() => { setDrafts(readDrafts()); }, []);
  const definition = getWorkshopDefinition(experienceId);
  const draft = drafts[definition.id] || null;

  return <StudioShell active="/workshop">
    <WorkbenchHeader
      title="FAN TOOL WORKSHOP"
      description="Choose a workshop experience, review its setup, and save it on this device."
      state="ready"
      status="Preview only; live results are not connected"
    />
    <main className="mx-auto min-w-0 max-w-5xl space-y-5 px-4 py-6 sm:px-6">
      <section className="court-panel space-y-3 p-4">
        <p className="court-kicker">Pick an experience</p>
        <div className="flex flex-wrap gap-2">
          {WORKSHOP_DEFINITIONS.map(entry => (
            <button key={entry.id} type="button" onClick={() => setExperienceId(entry.id)} aria-pressed={entry.id === definition.id} className={`rounded-lg border px-4 py-2 text-xs font-semibold uppercase tracking-widest transition-colors ${entry.id === definition.id ? 'border-gold/40 bg-gold/10 text-gold' : 'border-border/50 text-muted-foreground hover:bg-raised hover:text-foreground'}`}>{entry.category.split(' · ')[0]}</button>
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/30 pt-3">
          <div className="min-w-0">
            <span className="bcast-kicker">{definition.category}</span>
            <h2 className="mt-2 font-display text-3xl leading-tight tracking-wide text-foreground">{definition.prompt}</h2>
          </div>
          <span className="bcast-lowerthird"><span className="bcast-lowerthird__bar" aria-hidden="true" /><Wrench className="h-3.5 w-3.5" aria-hidden="true" />Local setup</span>
        </div>
      </section>

      <WorkshopSetup
        key={definition.id}
        definition={definition}
        savedAt={draft?.savedAt || null}
        onSave={(values, savedDefinition) => setDrafts(current => writeDraft(current, savedDefinition.id, values))}
        onReset={(savedDefinition) => setDrafts(current => {
          const next = { ...current };
          delete next[savedDefinition.id];
          try { localStorage.setItem(WORKSHOP_STORAGE_KEY, JSON.stringify(next)); } catch { /* storage unavailable */ }
          return next;
        })}
      />

      <section className="space-y-3">
        <div>
          <p className="court-kicker">How it works</p>
          <h2 className="mt-1 font-display text-2xl tracking-wide text-foreground">YOUR STEPS</h2>
        </div>
        <ol className="grid gap-3 sm:grid-cols-3">
          {definition.stages.map((stage, index) => <li key={stage.title} className="court-panel p-4">
            <span className="font-mono text-[11px] font-bold text-gold">{String(index + 1).padStart(2, '0')}</span>
            <h3 className="mt-1 font-display text-xl tracking-wide text-foreground">{stage.title}</h3>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{stage.summary}</p>
          </li>)}
        </ol>
      </section>

      <section className="court-panel space-y-4 p-4">
        <div>
          <p className="court-kicker">Build contract</p>
          <h2 className="mt-1 font-display text-2xl tracking-wide text-foreground">WHAT THE RESULT WILL CONTAIN</h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div><p className="studio-control-label">Result contract</p><ul className="space-y-1">{definition.resultContract.map(item => <li key={item} className="text-[11px] text-muted-foreground">· {item}</li>)}</ul></div>
          <div><p className="studio-control-label">Guardrails</p><ul className="space-y-1">{definition.guardrails.map(item => <li key={item} className="flex items-start gap-1.5 text-[11px] text-muted-foreground"><ShieldCheck className="mt-0.5 h-3 w-3 shrink-0 text-positive" aria-hidden="true" />{item}</li>)}</ul></div>
          <div><p className="studio-control-label">Connection points</p><ul className="space-y-1">{definition.connectionPoints.map(item => <li key={item} className="font-mono text-[10.4px] text-muted-foreground">· {item}</li>)}</ul></div>
        </div>
        <p className="border-t border-border/30 pt-3 text-[11px] leading-relaxed text-muted-foreground"><span className="font-semibold text-foreground">Next milestone:</span> {definition.nextMilestone}</p>
      </section>
    </main>
  </StudioShell>;
}