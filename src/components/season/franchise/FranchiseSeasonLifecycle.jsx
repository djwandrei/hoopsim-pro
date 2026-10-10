import React from 'react';
import { CalendarClock, CheckCircle2, ChevronRight, ShieldAlert, Trophy } from 'lucide-react';
import { goldButton, ghostButton, pillClass } from './franchiseUi';

const money = value => {
  const raw = value && typeof value === 'object' && Object.hasOwn(value, 'value') ? value.value : value;
  return Number.isFinite(Number(raw)) && raw !== null && raw !== undefined && raw !== ''
    ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Number(raw))
    : 'Unresolved';
};
const pretty = value => String(value ?? 'unavailable').replaceAll('-', ' ');
const receiptText = value => {
  try { return JSON.stringify(value, null, 2); }
  catch { return 'Receipt details could not be rendered.'; }
};

function proposalDetails(proposal) {
  if (!proposal || typeof proposal !== 'object') return null;
  const legs = Array.isArray(proposal.legs) ? proposal.legs : [];
  const terms = Array.isArray(proposal.contractSeasons) ? proposal.contractSeasons : [];
  return (
    <div className="space-y-2">
      <p className="frx-note">{pretty(proposal.kind)} · {proposal.proposalId ?? 'proposal ID unavailable'} · LeagueState revision {proposal.expectedStateRevision ?? '—'}</p>
      {legs.length > 0 && (
        <ul className="space-y-1 text-xs">
          {legs.map((leg, index) => (
            <li key={`${index}-${leg.canonicalName ?? leg.pickId ?? leg.assetType}`}>
              <strong>{leg.canonicalName ?? leg.prospect?.canonicalName ?? leg.pickId ?? leg.assetType ?? 'Asset'}</strong>
              {' · '}{pretty(leg.action ?? 'transaction')}
              {leg.fromTeamCode || leg.toTeamCode ? ` · ${leg.fromTeamCode ?? 'FA'} → ${leg.toTeamCode ?? 'FA'}` : ''}
            </li>
          ))}
        </ul>
      )}
      {terms.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-border/40">
          <table className="w-full text-xs">
            <caption className="sr-only">Saved proposal contract terms</caption>
            <thead><tr><th scope="col" className="px-2 py-1 text-left">Season</th><th scope="col" className="px-2 py-1 text-left">Salary</th><th scope="col" className="px-2 py-1 text-left">Cap hit</th><th scope="col" className="px-2 py-1 text-left">Guaranteed</th></tr></thead>
            <tbody>{terms.map((term, index) => (
              <tr key={`${term.seasonStartYear ?? term.fromYear ?? index}`} className="border-t border-border/30">
                <td className="px-2 py-1">{term.seasonStartYear ?? term.fromYear ?? '—'}</td>
                <td className="px-2 py-1">{money(term.salary)}</td>
                <td className="px-2 py-1">{money(term.capHit)}</td>
                <td className="px-2 py-1">{money(term.guaranteedCash)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      <details>
        <summary className="cursor-pointer text-xs font-semibold text-muted-foreground">Full saved proposal</summary>
        <pre className="mt-1.5 max-h-64 overflow-auto rounded-lg border border-border/40 bg-court-canvas/50 p-3 font-mono text-[10px] leading-relaxed text-muted-foreground">{receiptText(proposal)}</pre>
      </details>
    </div>
  );
}

export default function FranchiseSeasonLifecycle({ sim, view, busy = false }) {
  const lifecycle = view?.lifecycle;
  if (!lifecycle || lifecycle.currentWindow === 'games') return null;
  const postseason = lifecycle.postseason;
  const preview = postseason?.preview;
  const offseason = lifecycle.offseason;
  const pending = offseason?.pendingApproval;
  const submitPostseason = event => {
    event.preventDefault();
    const raw = new FormData(event.currentTarget).get('postseasonSeed');
    if (typeof raw !== 'string' || !raw.trim()) return;
    const seed = Number(raw);
    if (Number.isSafeInteger(seed) && seed >= 0 && seed <= 0xffffffff) sim.preparePostseason(seed);
  };

  return (
    <section className="court-panel frx-panel space-y-3 p-4" aria-labelledby="frx-lifecycle-title" aria-busy={busy}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className="frx-head-icon"><CalendarClock className="h-4 w-4" aria-hidden="true" /></span>
          <div><p className="bcast-kicker">Franchise calendar</p><h3 className="frx-title" id="frx-lifecycle-title">Season lifecycle</h3></div>
        </div>
        <span className={pillClass(lifecycle.currentWindow === 'season-end' ? 'amber' : 'slate')}>
          {lifecycle.seasonStartYear} · {pretty(lifecycle.currentWindow)}
        </span>
      </div>
      <p className="frx-note">{lifecycle.hint}</p>

      {lifecycle.currentWindow === 'season-end' && (
        <div className="space-y-3 rounded-lg border border-border/50 bg-raised/25 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Trophy className="h-4 w-4 text-gold" aria-hidden="true" />
              <strong className="text-sm">Simulated postseason</strong>
              <span className={pillClass(postseason?.state === 'completed' ? 'green' : postseason?.state === 'prepared' ? 'amber' : 'slate')}>
                {pretty(postseason?.state)}
              </span>
            </div>
          </div>
          <p className="frx-note" role="status">{postseason?.statusText ?? 'Postseason status is unavailable.'}</p>

          {postseason?.available && typeof sim.preparePostseason === 'function' && (
            <form key={postseason.formKey} className="flex flex-wrap items-end gap-2" onSubmit={submitPostseason}>
              <label className="grid gap-1 text-xs font-semibold text-muted-foreground" htmlFor="frx-postseason-seed">
                Postseason seed
                <input id="frx-postseason-seed" name="postseasonSeed" type="number" min="0" max="4294967295" step="1" required defaultValue="1" disabled={busy}
                  className="h-9 w-40 rounded-md border border-border/60 bg-court-canvas px-2 font-mono text-sm text-foreground" />
              </label>
              <button type="submit" className={goldButton} disabled={busy || !postseason.enabled}>
                <Trophy className="h-3.5 w-3.5" aria-hidden="true" /> Prepare postseason
              </button>
            </form>
          )}

          {preview && (
            <div className="space-y-2 rounded-lg border border-gold/30 bg-gold/5 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-gold" aria-hidden="true" />
                <strong className="text-sm">Review before commit</strong>
                <span className="frx-pill frx-pill--slate">seed {preview.receipt.postseasonSeed}</span>
                <span className="frx-pill frx-pill--slate">{preview.postseason.games.length} games</span>
              </div>
              <p className="text-sm">Champion: <strong>{preview.postseason.champion.teamCode}</strong>{preview.postseason.champion.teamName ? ` · ${preview.postseason.champion.teamName}` : ''}</p>
              <p className="frx-note">This preview leaves the franchise unchanged. Commit approval records the championship and postseason ledger at the next session revision.</p>
              <button type="button" className={goldButton} disabled={busy || !postseason.canCommit}
                title={postseason.canCommit ? 'Commit the reviewed receipt-bound postseason result.' : 'The worker no longer advertises this preview for the current revision.'}
                onClick={sim.commitPostseason}>
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> Commit postseason result
              </button>
              <details>
                <summary className="cursor-pointer text-xs font-semibold text-muted-foreground">Postseason receipt</summary>
                <pre className="mt-1.5 max-h-64 overflow-auto rounded-lg border border-border/40 bg-court-canvas/50 p-3 font-mono text-[10px] leading-relaxed text-muted-foreground">{receiptText(preview.receipt)}</pre>
              </details>
            </div>
          )}

          {postseason?.history && (
            <div className="rounded-lg border border-positive/30 bg-positive/5 p-3">
              <p className="text-sm"><strong>{postseason.history.champion?.teamCode ?? 'Champion'}</strong> · simulated championship recorded</p>
              <p className="frx-note">Receipt {postseason.receipt?.receiptSha256?.slice(0, 20) ?? 'available'}… · {postseason.receipt?.postseasonGameCount ?? 0} postseason games</p>
            </div>
          )}

          <p className="frx-note">Simulated development-scenario output; not observed games, official NBA results, or a certified forecast.</p>
        </div>
      )}

      {lifecycle.currentWindow === 'season-end' && (
        <div className="space-y-2 rounded-lg border border-border/50 bg-raised/25 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <strong className="text-sm">Next season</strong>
            <span className="frx-pill frx-pill--slate">{lifecycle.nextSeason?.targetSeasonStartYear} preseason</span>
          </div>
          <p className="frx-note">{lifecycle.nextSeason?.statusText}</p>
          <button type="button" className={ghostButton} disabled={busy || !lifecycle.nextSeason?.enabled}
            title={lifecycle.nextSeason?.enabled ? 'Advance exactly one season after worker validation.' : 'A verified postseason receipt and current lifecycle capability are required.'}
            onClick={sim.advanceNextSeason}>
            <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" /> Advance one season
          </button>
        </div>
      )}

      {!['games', 'season-end'].includes(lifecycle.currentWindow) && (
        <div className="space-y-3 rounded-lg border border-border/50 bg-raised/25 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <strong className="text-sm">Offseason work</strong>
            <span className="frx-pill frx-pill--slate">{pretty(lifecycle.currentWindow)}</span>
          </div>
          <p className="frx-note" role="status">{offseason?.statusText}</p>

          {offseason?.phaseName && (
            <div className="space-y-2">
              {offseason.canRunPhase ? (
                <button type="button" className={goldButton} disabled={busy} onClick={sim.runOffseasonPhase}>
                  <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" /> Run {offseason.phaseName} phase
                </button>
              ) : (
                <p className="frx-note">{offseason.phaseMissingInputs?.length
                  ? `Phase is held for missing inputs: ${offseason.phaseMissingInputs.join(', ')}.`
                  : `No ready ${offseason.phaseName} executor is currently advertised by this worker.`}</p>
              )}
              {offseason.phaseResult && <p className="frx-note">Latest phase result: {pretty(offseason.phaseResult)}.</p>}
            </div>
          )}

          {pending && (
            <div className="space-y-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
              <div className="flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 text-amber-300" aria-hidden="true" />
                <strong className="text-sm">Proposal requires your decision</strong>
                <span className={pillClass(offseason.canResolveApproval ? 'amber' : 'error')}>
                  {offseason.canResolveApproval ? 'current revision' : 'stale'}
                </span>
              </div>
              {proposalDetails(pending.proposal)}
              <p className="frx-note">This panel supports approving or rejecting the saved proposal. Counter terms are not exposed without a defined, safe field editor.</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" className={goldButton} disabled={busy || !offseason.canResolveApproval}
                  onClick={() => sim.resolveOffseasonApproval('approve')}>Approve exact proposal</button>
                <button type="button" className={ghostButton} disabled={busy || !offseason.canResolveApproval}
                  onClick={() => sim.resolveOffseasonApproval('reject')}>Reject proposal</button>
              </div>
            </div>
          )}

          {offseason?.canAdvanceWindow && (
            <button type="button" className={ghostButton} disabled={busy}
              title={`Advance one step to ${offseason.nextWindow}. The worker will enforce LeagueState readiness.`}
              onClick={() => sim.advanceOffseasonWindow(offseason.nextWindow)}>
              <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" /> Continue to {pretty(offseason.nextWindow)}
            </button>
          )}
        </div>
      )}

      {lifecycle.latestAction?.receipt && !preview && (
        <details>
          <summary className="cursor-pointer text-xs font-semibold text-muted-foreground">Latest lifecycle receipt</summary>
          <pre className="mt-1.5 max-h-64 overflow-auto rounded-lg border border-border/40 bg-court-canvas/50 p-3 font-mono text-[10px] leading-relaxed text-muted-foreground">{receiptText(lifecycle.latestAction.receipt)}</pre>
        </details>
      )}
    </section>
  );
}
