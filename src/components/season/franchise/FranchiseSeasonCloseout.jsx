import React from 'react';
import { Award, CalendarCheck2, ShieldCheck } from 'lucide-react';
import { ghostButton, pillClass } from './franchiseUi';
import FranchiseSeasonLifecycle from './FranchiseSeasonLifecycle';

function closeoutTone(state) {
  if (state === 'closed') return 'green';
  if (state === 'ready' || state === 'blocked') return 'amber';
  if (state === 'error') return 'error';
  return 'slate';
}

function closeoutValidationState(state) {
  if (state === 'closed') return 'ready';
  if (state === 'error') return 'invalid';
  return 'dirty';
}

const closeoutLabel = state => String(state ?? 'unavailable').replaceAll('-', ' ');

function awardsTone(state) {
  if (state === 'finalized') return 'green';
  if (state === 'ready' || state === 'recorded' || state === 'blocked') return 'amber';
  if (state === 'error') return 'error';
  return 'slate';
}

function awardsValidationState(state) {
  if (state === 'finalized') return 'ready';
  if (state === 'error') return 'invalid';
  return 'dirty';
}

function receiptText(receipt) {
  if (typeof receipt === 'string') return receipt;
  if (receipt === null || receipt === undefined) return '';
  try { return JSON.stringify(receipt, null, 2); }
  catch { return 'Receipt details could not be rendered.'; }
}

/**
 * Presentational season completion and regular-season closeout controls.
 * `view.completion` keeps its existing verify/read-only contract. The hook may
 * additionally supply `view.closeout` with { state, seasonStartYear,
 * statusText, hint, receipt }; `onCloseout` is the hook-owned action.
 */
export default function FranchiseSeasonCloseout({ sim, view, onVerifyCompletion, onCloseout, onFinalizeAwards, busy = false }) {
  const completion = view?.completion;
  const closeout = view?.closeout;
  const awards = view?.awards;
  const completionStatus = completion?.status;
  const closeoutReceipt = receiptText(closeout?.receipt);
  const awardsReceipt = receiptText(awards?.receipt);

  const submitAwards = event => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const awardsSeed = Number(formData.get('awardsSeed'));
    if (Number.isSafeInteger(awardsSeed) && awardsSeed >= 0 && awardsSeed <= 0xffffffff) {
      onFinalizeAwards?.(awardsSeed);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="bcast-kicker">Season completion</p>
        <button type="button" className={ghostButton} disabled={!completion?.enabled || busy || typeof onVerifyCompletion !== 'function'} title={completion?.title} onClick={onVerifyCompletion}>
          {busy ? <span className="h-3.5 w-3.5 animate-spin rounded-full border border-current border-r-transparent" aria-hidden="true" /> : <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />} Verify completion
        </button>
      </div>
      <p className={`frx-validation frx-validation--${completionStatus?.state === 'verified' ? 'ready' : 'dirty'}`} role="status">{completion?.hint ?? 'Season completion status is unavailable.'}</p>
      {completionStatus?.state === 'verified' && (
        <div className="space-y-1.5">
          <p className="frx-note">{completionStatus.text}</p>
          <details>
            <summary className="cursor-pointer text-xs font-semibold text-muted-foreground">Completion receipt</summary>
            <pre className="mt-1.5 overflow-x-auto rounded-lg border border-border/40 bg-court-canvas/50 p-3 font-mono text-[10px] leading-relaxed text-muted-foreground">{completionStatus.receipt}</pre>
          </details>
        </div>
      )}

      {closeout && (
        <>
          <div className="bcast-divider" aria-hidden="true" />
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <p className="bcast-kicker">Regular-season closeout</p>
                <span className={pillClass(closeoutTone(closeout.state))}>{closeoutLabel(closeout.state)}</span>
                {Number.isInteger(closeout.seasonStartYear) && <span className="frx-pill frx-pill--slate">{closeout.seasonStartYear} season</span>}
              </div>
              {typeof onCloseout === 'function' && (
                <button type="button" className={ghostButton} disabled={busy || closeout.state !== 'ready'} title={closeout.hint ?? 'Closeout is not ready.'} onClick={onCloseout}>
                  <CalendarCheck2 className="h-3.5 w-3.5" aria-hidden="true" />
                  {closeout.state === 'closed' ? 'Season closed' : 'Close regular season'}
                </button>
              )}
            </div>
            <p className={`frx-validation frx-validation--${closeoutValidationState(closeout.state)}`} role="status">{closeout.statusText ?? closeout.hint ?? 'Closeout status has not been supplied.'}</p>
            {closeout.hint && closeout.statusText && <p className="frx-note">{closeout.hint}</p>}
            {closeoutReceipt && (
              <details>
                <summary className="cursor-pointer text-xs font-semibold text-muted-foreground">Closeout receipt</summary>
                <pre className="mt-1.5 overflow-x-auto rounded-lg border border-border/40 bg-court-canvas/50 p-3 font-mono text-[10px] leading-relaxed text-muted-foreground">{closeoutReceipt}</pre>
              </details>
            )}
          </div>
        </>
      )}

      {awards && (
        <>
          <div className="bcast-divider" aria-hidden="true" />
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <p className="bcast-kicker">Season-end simulated awards</p>
                <span className={pillClass(awardsTone(awards.state))}>{closeoutLabel(awards.state)}</span>
                {Number.isInteger(awards.seasonStartYear) && <span className="frx-pill frx-pill--slate">{awards.seasonStartYear} season</span>}
              </div>
            </div>
            <p className={`frx-validation frx-validation--${awardsValidationState(awards.state)}`} role="status">{awards.statusText ?? 'Season-awards finalization status is unavailable.'}</p>
            {awards.hint && <p className="frx-note">{awards.hint}</p>}
            {awards.available && typeof onFinalizeAwards === 'function' && (
              <form key={awards.formKey} className="space-y-2" onSubmit={submitAwards}>
                <div className="flex flex-wrap items-end gap-2">
                  <label className="grid gap-1 text-xs font-semibold text-muted-foreground" htmlFor="frx-awards-seed">
                    Awards seed
                    <input
                      id="frx-awards-seed"
                      name="awardsSeed"
                      type="number"
                      min="0"
                      max="4294967295"
                      step="1"
                      required
                      defaultValue={awards.seed ?? 1}
                      disabled={busy}
                      className="h-9 w-40 rounded-md border border-border/60 bg-court-canvas px-2 font-mono text-sm text-foreground"
                      aria-describedby="frx-awards-seed-note"
                    />
                  </label>
                  <button type="submit" className={ghostButton} disabled={busy || !awards.enabled} title={awards.buttonTitle}>
                    {busy ? <span className="h-3.5 w-3.5 animate-spin rounded-full border border-current border-r-transparent" aria-hidden="true" /> : <Award className="h-3.5 w-3.5" aria-hidden="true" />}
                    {awards.hasSavedRecord ? 'Verify saved awards' : 'Finalize simulated awards'}
                  </button>
                </div>
                <p className="frx-note" id="frx-awards-seed-note">Selecting this action records a reproducible simulated result in the local franchise session and advances its revision.</p>
              </form>
            )}

            {awards.historyRecord && (
              <div className="grid gap-2 rounded-lg border border-border/40 bg-court-canvas/40 p-3 sm:grid-cols-2">
                <p className="text-xs"><span className="text-muted-foreground">MVP</span><br /><strong>{awards.historyRecord.mvp?.canonicalName ?? 'No assignment recorded'}</strong></p>
                <p className="text-xs"><span className="text-muted-foreground">Defensive Player of the Year</span><br /><strong>{awards.historyRecord.defensivePlayerOfTheYear?.canonicalName ?? 'No assignment recorded'}</strong></p>
                <p className="frx-note sm:col-span-2">{awards.verifiedForCurrentRevision ? 'The worker receipt and saved history were verified for the current session revision.' : 'A saved awards row is present. Verify it against the current closeout before treating it as finalized.'}</p>
              </div>
            )}
            {awardsReceipt && (
              <details>
                <summary className="cursor-pointer text-xs font-semibold text-muted-foreground">Season-awards finalization receipt</summary>
                <pre className="mt-1.5 overflow-x-auto rounded-lg border border-border/40 bg-court-canvas/50 p-3 font-mono text-[10px] leading-relaxed text-muted-foreground">{awardsReceipt}</pre>
              </details>
            )}
            <p className="frx-note">These are reproducible simulated awards based on this franchise season. They are not official NBA results, predictions of actual voters, or calibrated award forecasts.</p>
          </div>
        </>
      )}
      <FranchiseSeasonLifecycle sim={sim} view={view} busy={busy} />
    </div>
  );
}
