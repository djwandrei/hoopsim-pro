import React from 'react';
import { Database, Lightbulb, Loader2, Lock, Play, Sparkles } from 'lucide-react';
import { pillClass } from './franchiseUi';
import { GENERATED_SHOOTING_RATING_POLICY } from './franchiseLogic';

const cardHead = (Icon, title, kicker, id) => (
  <div className="flex items-center gap-2.5">
    <span className="frx-head-icon"><Icon className="h-4 w-4" aria-hidden="true" /></span>
    <div className="min-w-0">
      <p className="bcast-kicker">{kicker}</p>
      <h3 className="frx-title" id={id}>{title}</h3>
    </div>
  </div>
);

const buttonBase = 'inline-flex items-center gap-2 rounded-lg border px-3.5 py-2 text-xs font-semibold uppercase tracking-widest transition-colors disabled:cursor-not-allowed disabled:opacity-45';
const goldButton = `${buttonBase} border-gold/50 bg-gold/15 text-gold hover:bg-gold/25`;
const ghostButton = `${buttonBase} border-border/50 bg-raised/40 text-foreground hover:border-gold/40 hover:text-gold`;

// The selected scenario path's setup panel. `path` comes from the launch
// picker; every control of the site preview stays available in its own path.
export default function FranchiseSetup({ sim, path = 'v4' }) {
  const { v4, busy } = sim.view;
  const rating = v4.ratingReceipt;
  return (
    <div className="space-y-4">
      {path === 'v4' && (
        <section className="court-panel frx-panel space-y-4 p-4" aria-labelledby="frx-v4-title">
          {cardHead(Database, 'Exact V4 season', 'Primary scenario path', 'frx-v4-title')}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="studio-control-label" htmlFor="frx-v4-season">Starting season</label>
              <select id="frx-v4-season" className="studio-select" value={v4.year} disabled={v4.yearDisabled}
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
            <div>
              <label className="studio-control-label" htmlFor="frx-v4-team">Team to control</label>
              <select id="frx-v4-team" className="studio-select" value={v4.teamSelected} disabled={v4.teamDisabled}
                onChange={event => sim.setV4UserTeam(event.target.value)}>
                <option value="">{v4.teamMessage}</option>
                {v4.teamOptions.map(option => <option key={option.code} value={option.code}>{option.label}</option>)}
              </select>
            </div>
          </div>
          <div className="flex flex-wrap gap-2.5">
            <button type="button" className={goldButton} disabled={!v4.canLoad} onClick={sim.loadV4Season}>
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Database className="h-3.5 w-3.5" aria-hidden="true" />} Load V4 season
            </button>
            <button type="button" className={ghostButton} disabled={!v4.canSuggest} onClick={sim.applySuggestions}>
              <Lightbulb className="h-3.5 w-3.5" aria-hidden="true" /> Apply latest-team suggestions
            </button>
          </div>
          <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-border/40 bg-raised/30 p-3 text-xs leading-relaxed">
            <input type="checkbox" className="mt-0.5 h-4 w-4" checked={v4.generateRating} disabled={v4.ratingDisabled}
              onChange={event => sim.setGenerateRating(event.target.checked)} />
            <span><strong className="text-foreground">Generate provisional shooting ratings</strong> — allow initialization when players lack a source rating (explicit scenario policy, values are uncalibrated).</span>
          </label>
          <button type="button" className={`${goldButton} book-cta w-full justify-center sm:w-auto`} disabled={!v4.canInitialize} onClick={() => sim.initializeScenario('v4')}>
            <Play className="h-3.5 w-3.5" aria-hidden="true" /> Initialize 30-team scenario
          </button>
          {/* Intake status */}
          <div className={`rounded-xl border p-3 text-xs leading-relaxed ${v4.status.state === 'ready' ? 'border-positive/40 bg-positive/8' : v4.status.state === 'error' ? 'border-trim/40 bg-trim/10' : v4.status.state === 'loading' ? 'border-gold/40 bg-gold/8' : 'border-border/40 bg-raised/30'}`}>
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
          {/* Provisional rating receipt */}
          {rating && (
            <div className="frx-rating" data-state={rating.kind}>
              {rating.kind === 'review' && <><strong>Initialization held: {rating.count} player{rating.count === 1 ? '' : 's'} lack a source shooting rating.</strong><p className="frx-note">Default behavior rejects these missing components. Enable the explicit {GENERATED_SHOOTING_RATING_POLICY} scenario policy and retry. No source rating was changed.</p><ul>{rating.names.map((name, index) => <li key={index}>{name}</li>)}</ul></>}
              {rating.kind === 'generated' && <><strong>{rating.count} provisional shooting rating{rating.count === 1 ? '' : 's'} generated under {rating.policy}.</strong><ul>{rating.rows.map((row, index) => <li key={index}><span>{row.name}</span>{row.value && <span className="frx-rating__value">· {row.value}</span>}<small>{row.method}</small></li>)}{rating.more > 0 && <li>{rating.more} additional generated rating{rating.more === 1 ? '' : 's'} are recorded in this session receipt.</li>}</ul><p className="frx-note">These are uncalibrated scenario values, not observed source ratings or confidence intervals. Original source values are preserved: {rating.preserved}.</p></>}
              {(rating.kind === 'idle' || rating.kind === 'ready') && <strong>{rating.text}</strong>}
            </div>
          )}
          {v4.sessionLocked && <p className="frx-note flex items-center gap-2"><Lock className="h-3.5 w-3.5" aria-hidden="true" /> Source choices are locked while a session is active.</p>}
        </section>
      )}

      {/* V4 roster assignment — a launch step on the exact-season path */}
      {path === 'v4' && (
        <section className="court-panel frx-panel space-y-3 p-4" aria-labelledby="frx-choices-title">
          <div className="flex flex-wrap items-center justify-between gap-2">
            {cardHead(Sparkles, 'Roster assignment', 'Multi-team names', 'frx-choices-title')}
            <span className="frx-pill frx-pill--slate">{v4.choiceCount}</span>
          </div>
          {!v4.groups.length && <p className="frx-note">{v4.status.state === 'idle' ? 'Roster assignment appears after V4 intake.' : 'No multi-team player names need a franchise choice in this exact season.'}</p>}
          <div className="grid gap-2.5 sm:grid-cols-2">
            <button type="button" className={`${buttonBase} h-auto flex-col items-start gap-1 border-border/50 bg-raised/40 p-3.5 tracking-normal normal-case hover:border-gold/40 ${v4.rosterMode === 'start' ? 'border-gold/60 bg-gold/10 text-gold' : 'text-foreground'}`} disabled={!v4.canAssign}
              onClick={() => sim.applyRosterMode('start')}>
              <strong className="text-xs font-semibold uppercase tracking-widest">Start of season</strong>
              <span className="text-xs leading-relaxed">Every multi-team player joins the team they first played for in the season.</span>
            </button>
            <button type="button" className={`${buttonBase} h-auto flex-col items-start gap-1 border-border/50 bg-raised/40 p-3.5 tracking-normal normal-case hover:border-gold/40 ${v4.rosterMode === 'end' ? 'border-gold/60 bg-gold/10 text-gold' : 'text-foreground'}`} disabled={!v4.canAssign}
              onClick={() => sim.applyRosterMode('end')}>
              <strong className="text-xs font-semibold uppercase tracking-widest">End of season</strong>
              <span className="text-xs leading-relaxed">Every multi-team player joins the team they last played for in the season.</span>
            </button>
          </div>
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
          {v4.groups.length > 0 && v4.unresolvedGroups.length > 0 && (
            <div className="grid gap-2.5">
              <p className="frx-note"><strong className="text-foreground">{v4.unresolvedGroups.length} name{v4.unresolvedGroups.length === 1 ? '' : 's'} still need{v4.unresolvedGroups.length === 1 ? 's' : ''} a manual exact-team choice.</strong></p>
              {v4.unresolvedGroups.map(group => (
                <article key={group.key} className="frx-choice">
                  <div className="frx-choice__head">
                    <div className="min-w-0">
                      <h4>{group.name}</h4>
                      <p>{group.label}{group.observed ? ` · ${group.observed}` : ''}</p>
                    </div>
                    <span className={pillClass(group.pill.kind)}>{group.pill.text}</span>
                  </div>
                  <div className="grid gap-2.5 sm:grid-cols-[minmax(0,13rem)_1fr] sm:items-start">
                    <div>
                      <label className="studio-control-label" htmlFor={`frx-choice-${group.key}`}>Exact regular-season team</label>
                      <select id={`frx-choice-${group.key}`} className="studio-select" value={group.selectedTeam} disabled={v4.choiceDisabled}
                        onChange={event => sim.onRosterChoice(group.key, event.target.value)}>
                        <option value="">Choose a team</option>
                        {group.options.map(code => <option key={code} value={code}>{code}</option>)}
                      </select>
                    </div>
                    <details>
                      <summary className="cursor-pointer text-xs font-semibold text-muted-foreground">Evidence rows ({group.evidenceCount})</summary>
                      <ul className="frx-choice__evidence">{group.evidenceRows.map((row, index) => <li key={index}>{row}</li>)}</ul>
                    </details>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}