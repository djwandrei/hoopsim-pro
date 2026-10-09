import React from 'react';
import { Database, Loader2, Lock, Play, Sparkles } from 'lucide-react';
import { GENERATED_SHOOTING_RATING_POLICY } from './franchiseLogic';

const goldButton = 'frx2k-btn';

// The selected scenario path's setup screen, styled as a 2K-style options
// menu. Same controls, states and engine calls as before — presentation only.
export default function FranchiseSetup({ sim, path = 'v4' }) {
  const { v4, busy } = sim.view;
  const rating = v4.ratingReceipt;
  return (
    <div className="space-y-4">
      {path === 'v4' && (
        <section className="frx2k-screen" aria-labelledby="frx-v4-title">
          <header className="frx2k-screen__head">
            <span className="frx-head-icon"><Database className="h-4 w-4" aria-hidden="true" /></span>
            <div className="min-w-0">
              <p className="bcast-kicker">Primary scenario path</p>
              <h3 className="frx-title" id="frx-v4-title">Exact V4 Season</h3>
            </div>
            {v4.sessionLocked && <span className="frx-pill frx-pill--amber ml-auto"><Lock className="h-3 w-3" aria-hidden="true" /> Locked</span>}
          </header>
          <div className="frx2k-row">
            <div>
              <label className="frx2k-row__label" htmlFor="frx-v4-season">Starting season</label>
              <span className="frx2k-row__hint">A verified regular-season package loads as soon as you pick.</span>
            </div>
            <select id="frx-v4-season" className="frx2k-select" value={v4.year} disabled={v4.yearDisabled}
              onChange={event => {
                const value = Number(event.target.value);
                if (!value) return;
                sim.setV4Year(value);
                sim.loadV4Season();
              }}>
              <option value="">Choose your starting season</option>
              {v4.seasons.map(year => <option key={year} value={year}>{year}–{String(year + 1).slice(2)}</option>)}
            </select>
          </div>
          <div className="frx2k-row">
            <div>
              <label className="frx2k-row__label" htmlFor="frx-v4-team">Team to control</label>
              <span className="frx2k-row__hint">{v4.teamDisabled ? 'Available after the season package loads.' : 'Pick any of the 30 exact-season franchises.'}</span>
            </div>
            <select id="frx-v4-team" className="frx2k-select" value={v4.teamSelected} disabled={v4.teamDisabled}
              onChange={event => sim.setV4UserTeam(event.target.value)}>
              <option value="">{v4.teamMessage}</option>
              {v4.teamOptions.map(option => <option key={option.code} value={option.code}>{option.label}</option>)}
            </select>
          </div>
          <div className="frx2k-row">
            <div>
              <span className="frx2k-row__label">Season package</span>
              <span className="frx2k-row__hint">Fetch the pinned source snapshot and run intake with receipts.</span>
            </div>
            <button type="button" className={goldButton} disabled={!v4.canLoad} onClick={sim.loadV4Season}>
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Database className="h-3.5 w-3.5" aria-hidden="true" />} Load V4 season
            </button>
          </div>
          <div className="frx2k-row">
            <div>
              <label className="frx2k-row__label" htmlFor="frx-rating-policy">Provisional shooting ratings</label>
              <span className="frx2k-row__hint">Allow initialization when players lack a source rating — explicit {GENERATED_SHOOTING_RATING_POLICY} policy, values are uncalibrated.</span>
            </div>
            <label htmlFor="frx-rating-policy" className="flex cursor-pointer items-center gap-2.5 text-xs font-semibold uppercase tracking-widest text-foreground">
              <input id="frx-rating-policy" type="checkbox" className="frx2k-switch" checked={v4.generateRating} disabled={v4.ratingDisabled}
                onChange={event => sim.setGenerateRating(event.target.checked)} />
              {v4.generateRating ? 'Enabled' : 'Off'}
            </label>
          </div>
          <div className="frx2k-actions">
            <button type="button" className="frx2k-cta" disabled={!v4.canInitialize} onClick={() => sim.initializeScenario('v4')}>
              <span><Play className="h-4 w-4" aria-hidden="true" /> Initialize 30-team scenario</span>
            </button>
            {v4.sessionLocked && <p className="frx-note flex items-center gap-2"><Lock className="h-3.5 w-3.5" aria-hidden="true" /> Source choices are locked while a session is active.</p>}
          </div>
          <div className="frx2k-tail">
            <div className="frx2k-console" data-state={v4.status.state}>
              <strong className="block text-foreground">{v4.status.title}</strong>
              {v4.status.metrics.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {v4.status.metrics.map((line, index) => <span key={index} className="frx-metric-line">{line}</span>)}
                </div>
              )}
              {v4.status.issues.length > 0 && (
                <ul className="mt-2 list-disc space-y-0.5 pl-4 text-trim-ink">
                  {v4.status.issues.map((issue, index) => <li key={index}>{issue}</li>)}
                </ul>
              )}
            </div>
            {rating && (
              <div className="frx-rating" data-state={rating.kind}>
                {rating.kind === 'review' && <><strong>Initialization held: {rating.count} player{rating.count === 1 ? '' : 's'} lack a source shooting rating.</strong><p className="frx-note">Default behavior rejects these missing components. Enable the explicit {GENERATED_SHOOTING_RATING_POLICY} scenario policy and retry. No source rating was changed.</p><ul>{rating.names.map((name, index) => <li key={index}>{name}</li>)}</ul></>}
                {rating.kind === 'generated' && <><strong>{rating.count} provisional shooting rating{rating.count === 1 ? '' : 's'} generated under {rating.policy}.</strong><ul>{rating.rows.map((row, index) => <li key={index}><span>{row.name}</span>{row.value && <span className="frx-rating__value">· {row.value}</span>}<small>{row.method}</small></li>)}{rating.more > 0 && <li>{rating.more} additional generated rating{rating.more === 1 ? '' : 's'} are recorded in this session receipt.</li>}</ul><p className="frx-note">These are uncalibrated scenario values, not observed source ratings or confidence intervals. Original source values are preserved: {rating.preserved}.</p></>}
                {(rating.kind === 'idle' || rating.kind === 'ready') && <strong>{rating.text}</strong>}
              </div>
            )}
          </div>
        </section>
      )}

      {/* V4 roster assignment — a launch step on the exact-season path */}
      {path === 'v4' && (
        <section className="frx2k-screen" aria-labelledby="frx-choices-title">
          <header className="frx2k-screen__head">
            <span className="frx-head-icon"><Sparkles className="h-4 w-4" aria-hidden="true" /></span>
            <div className="min-w-0">
              <p className="bcast-kicker">Multi-team names</p>
              <h3 className="frx-title" id="frx-choices-title">Roster assignment</h3>
            </div>
            <span className="frx-pill frx-pill--slate ml-auto">{v4.choiceCount}</span>
          </header>
          <div className="frx2k-tail">
            {!v4.groups.length && <p className="frx-note">{v4.status.state === 'idle' ? 'Roster assignment appears after V4 intake.' : 'No multi-team player names need a franchise choice in this exact season.'}</p>}
            {v4.groups.length > 0 && (
              <>
                <p className="frx2k-legend">Choose which roster set to use — all multi-team players are assigned automatically</p>
                <fieldset className="grid gap-2.5 sm:grid-cols-2" disabled={!v4.canAssign}>
                  <legend className="sr-only">Roster set for multi-team players</legend>
                  <label className="frx2k-choice" data-checked={v4.rosterMode === 'start'}>
                    <input type="radio" name="frx-roster-mode" checked={v4.rosterMode === 'start'} onChange={() => sim.applyRosterMode('start')} />
                    <span><strong>Start of season rosters</strong>
                      <span className="frx2k-choice__text">Every multi-team player joins the team they first played for in the season.</span></span>
                  </label>
                  <label className="frx2k-choice" data-checked={v4.rosterMode === 'end'}>
                    <input type="radio" name="frx-roster-mode" checked={v4.rosterMode === 'end'} onChange={() => sim.applyRosterMode('end')} />
                    <span><strong>End of season rosters</strong>
                      <span className="frx2k-choice__text">Every multi-team player joins the team they last played for in the season.</span></span>
                  </label>
                </fieldset>
              </>
            )}
            {v4.appliedSummary && (
              <div className="rounded-xl border border-border/40 bg-raised/30 p-3">
                <p className="frx-note"><strong className="text-foreground">{v4.appliedSummary.text}</strong>{v4.appliedSummary.suggestionNote ? <><br />{v4.appliedSummary.suggestionNote}</> : ''}</p>
                {v4.appliedSummary.appliedRows.length > 0 && (
                  <details className="mt-1.5">
                    <summary className="cursor-pointer text-xs font-semibold text-muted-foreground">Applied team choices and provenance</summary>
                    <ul className="frx-choice__evidence">{v4.appliedSummary.appliedRows.map((row, index) => <li key={index}>{row}</li>)}</ul>
                  </details>
                )}
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}