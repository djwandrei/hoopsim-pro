import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BadgeCheck, Loader2, ShieldAlert, ShieldCheck } from 'lucide-react';
import StudioShell from '@/components/studio/StudioShell';
import WorkbenchHeader from '@/components/studio/WorkbenchHeader';
import usePageMeta from '@/hooks/usePageMeta';
import { renderNativeSharedResult, sharedResultStatusMessage } from '@/lib/season/nativeSharedResult';

// Shared Result — the native version of the site's /tools/shared-result/ page.
// A shared run link is verified in place (signed envelope, package-pin proof)
// and its non-identifying summary is shown here; no redirect to the site.
export default function LineupSharedResult() {
  usePageMeta({ title: 'Shared Result — SwishIQ Studio', description: 'View the non-identifying summary from a shared SwishIQ result.' });
  const [state, setState] = useState({ state: 'loading' });

  useEffect(() => {
    let active = true;
    renderNativeSharedResult({ search: window.location.search, hash: window.location.hash })
      .then(result => { if (active) setState(result); })
      .catch(() => { if (active) setState({ state: 'package-proof-unavailable' }); });
    return () => { active = false; };
  }, []);

  const verified = state.state === 'verified';
  const failed = !verified && state.state !== 'loading';
  const headerState = state.state === 'loading' ? 'loading' : verified ? 'ready' : 'error';

  return <StudioShell active="/tools/shared-result">
    <WorkbenchHeader
      title="SHARED RESULT"
      description="Open a shared result link to view its verified, non-identifying summary — the share is checked against the original signature chain before anything is displayed."
      state={headerState}
      status={verified ? 'Share verified' : failed ? sharedResultStatusMessage(state.state) : undefined}
    />
    <main className="mx-auto min-w-0 max-w-4xl space-y-5 px-4 py-6 sm:px-6">
      {state.state === 'loading' && <div className="court-panel grid place-items-center p-14 text-sm text-muted-foreground"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" aria-hidden="true" />Verifying the shared result…</div>}

      {verified && <section className="court-panel space-y-4 p-6" aria-label="Shared result summary">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="court-kicker">RESULT SUMMARY</p>
            <h2 className="mt-1 font-display text-3xl leading-tight tracking-wide text-foreground">{state.summary.title}</h2>
            <p className="mt-1 font-mono text-xs text-muted-foreground">{state.summary.scope}</p>
          </div>
          <BadgeCheck className="h-8 w-8 shrink-0 text-positive" aria-hidden="true" />
        </div>
        <dl className="grid gap-2 sm:grid-cols-2" aria-label="Aggregate result summary">
          {state.summary.facts.map(fact => <div key={fact.label} className="metric-tile">
            <dt className="text-[10.4px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{fact.label}</dt>
            <dd className="mt-1 font-mono text-base font-semibold text-foreground">{fact.value}</dd>
          </div>)}
        </dl>
        <div className="bcast-divider" aria-hidden="true" />
        <p className="flex items-start gap-2 text-[11px] leading-relaxed text-muted-foreground"><ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-positive" aria-hidden="true" />Summary ready. The creator supplied the outcome values; they were not recalculated.</p>
        <p className="text-[11px] leading-relaxed text-muted-foreground">{state.summary.disclosure}</p>
      </section>}

      {failed && <section className="court-panel flex items-start gap-3 p-6" aria-label="Shared result status">
        <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-trim-ink" aria-hidden="true" />
        <p role="status" className="text-sm leading-relaxed text-muted-foreground">{sharedResultStatusMessage(state.state)}</p>
      </section>}

      <section className="court-panel space-y-2 p-4" aria-label="Share boundary">
        <p className="court-kicker">WHAT THIS PREVIEW CONTAINS</p>
        <p className="text-[11px] leading-relaxed text-muted-foreground">Only aggregate fields are shown. Player identities, picks, answer keys, and user notes are not included.</p>
        <p className="text-[11px] leading-relaxed text-muted-foreground">Expired or incomplete shares stay hidden.</p>
      </section>

      <p className="text-[11px] text-muted-foreground"><Link to="/lineup-lab" className="inline-flex items-center gap-1.5 text-gold hover:underline">Return to the Lineup Lab</Link></p>
    </main>
  </StudioShell>;
}