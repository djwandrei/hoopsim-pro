import React from 'react';
import { CheckCircle2, Save } from 'lucide-react';
import { TeamChip } from './FranchiseTeamMark';
import { goldButton } from './franchiseUi';

// Team HQ: overview chips, the rotation draft table, and its validation strip.
export default function FranchiseRotation({ sim }) {
  const team = sim.view.team;
  if (team.empty) {
    return (
      <section className="court-panel frx-panel space-y-2 p-4">
        <p className="bcast-kicker">Team HQ</p>
        <p className="frx-note">{team.text}</p>
      </section>
    );
  }
  const validation = team.validationState;
  return (
    <section className="court-panel frx-panel space-y-3 p-4" aria-labelledby="frx-rotation-title">
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-3">
          <TeamChip code={team.code} name={team.name} />
          <span className="frx-pill frx-pill--green">User-controlled</span>
        </div>
        <span className="frx-pill frx-pill--slate">{team.wins}–{team.losses} <span className="font-normal opacity-75">current record</span></span>
      </div>
      <p className="frx-note">{team.rosterCount} roster entries · set the active rotation, five starters, and exact minutes (must total 240).</p>
      <div className="frx-roster -mx-1 overflow-x-auto">
        <table className="w-full min-w-[26rem]">
          <caption>Rotation draft</caption>
          <thead>
            <tr><th scope="col">Player</th><th scope="col">Active</th><th scope="col">Starter</th><th scope="col">Minutes</th></tr>
          </thead>
          <tbody>
            {team.rows.map(row => (
              <tr key={row.name} data-state={row.excluded ? 'excluded' : row.unavailable ? 'unavailable' : undefined}>
                <td>
                  <span className="block font-medium leading-tight">{row.name}</span>
                  <span className="block text-[10px] leading-tight text-muted-foreground">{row.availabilityLabel}</span>
                </td>
                <td><input type="checkbox" aria-label={`Include ${row.name} in active rotation`} checked={row.active} disabled={row.disabled}
                  onChange={event => sim.setDraft(row.name, 'active', event.target.checked)} /></td>
                <td><input type="checkbox" aria-label={`Start ${row.name}`} checked={row.starter} disabled={row.disabled}
                  onChange={event => sim.setDraft(row.name, 'starter', event.target.checked)} /></td>
                <td><input type="number" min="0" max="48" step="any" inputmode="decimal" value={row.minutes} disabled={row.disabled}
                  aria-label={`Minutes for ${row.name}`} title="Full stored precision; regulation assignments must sum to 240 minutes."
                  onChange={event => sim.setDraft(row.name, 'minutes', event.target.value, { typing: true })} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className={`frx-validation frx-validation--${validation}`} role="status">
        {validation === 'ready' ? <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" /> : <span className="h-2 w-2 shrink-0 rounded-full bg-current" aria-hidden="true" />}
        <span className="min-w-0">{team.validationText}</span>
      </div>
      <button type="button" className={goldButton} disabled={!sim.view.canSaveRotation} onClick={sim.saveRotation}>
        <Save className="h-3.5 w-3.5" aria-hidden="true" /> {sim.view.rotationSaved ? 'Rotation saved' : 'Save rotation'}
      </button>
    </section>
  );
}