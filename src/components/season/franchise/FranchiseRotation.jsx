import React from 'react';
import { CheckCircle2, Save, Users } from 'lucide-react';
import { TeamChip } from './FranchiseTeamMark';
import { goldButton } from './franchiseUi';

// Rotation HQ: overview chips, a minutes-allocation strip against the 240
// target, the rotation draft table, and its validation strip.
export default function FranchiseRotation({ sim }) {
  const team = sim.view.team;
  if (team.empty) {
    return (
      <section className="court-panel frx-panel space-y-2 p-4">
        <div className="flex items-center gap-2.5">
          <span className="frx-head-icon"><Users className="h-4 w-4" aria-hidden="true" /></span>
          <div><p className="bcast-kicker">Team HQ</p><h3 className="frx-title">Rotation</h3></div>
        </div>
        <p className="frx-note">{team.text}</p>
      </section>
    );
  }
  const validation = team.validationState;
  const numericMinutes = row => {
    const value = Number(row.minutes);
    return Number.isFinite(value) && value > 0 ? value : 0;
  };
  const activeRows = team.rows.filter(row => row.active && !row.excluded && !row.unavailable);
  const totalAssigned = activeRows.reduce((sum, row) => sum + numericMinutes(row), 0);
  const gapPct = Math.max(0, 100 - Math.min(100, (totalAssigned / 240) * 100));
  const starterCount = team.rows.filter(row => row.starter && !row.excluded && !row.unavailable).length;
  return (
    <section className="court-panel frx-panel space-y-3 p-4" aria-label="Team rotation HQ">
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-2.5">
          <TeamChip code={team.code} name={team.name} />
          <span className="frx-pill frx-pill--green">User-controlled</span>
        </div>
        <span className="frx-pill frx-pill--slate">{team.wins}–{team.losses} <span className="font-normal opacity-75">current record</span></span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="frx-pill frx-pill--slate">{activeRows.length} active</span>
        <span className="frx-pill frx-pill--slate">{starterCount} starters</span>
        <span className={`frx-pill ${Math.abs(totalAssigned - 240) < 0.001 ? 'frx-pill--green' : 'frx-pill--amber'}`}>{Math.round(totalAssigned * 10) / 10}/240 minutes</span>
      </div>
      <div>
        <p className="bcast-kicker mb-1.5">Minutes allocation · target 240</p>
        <div className="frx-alloc" role="img" aria-label={`Minutes allocation: ${Math.round(totalAssigned)} of 240 minutes assigned`}>
          {activeRows.map((row, index) => {
            const minutes = numericMinutes(row);
            const width = Math.min(100, (minutes / 240) * 100);
            return <span key={row.name} className={index % 2 ? 'frx-alloc__seg--alt' : 'frx-alloc__seg'} style={{ width: `${width}%` }} title={`${row.name} · ${minutes} min`} />;
          })}
          {gapPct > 0.05 && <span className="frx-alloc__gap" style={{ width: `${gapPct}%` }} />}
        </div>
      </div>
      <p className="frx-note">Shot usage ×1.0 is the baseline. Adjusts relative field-goal shooter selection among the five players on court; it is a scenario assumption, not a measured efficiency effect. Possessions stay fixed, while makes, rebounds, fouls, and realized box totals can vary.</p>
      <div className="frx-roster -mx-1 overflow-x-auto">
        <table className="w-full min-w-[36rem]">
          <caption>Rotation draft</caption>
          <thead>
            <tr><th scope="col">Player</th><th scope="col">Active</th><th scope="col">Starter</th><th scope="col">Minutes</th><th scope="col">Shot usage ×</th></tr>
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
                <td><input type="number" min="0" max="48" step="any" inputMode="decimal" value={row.minutes} disabled={row.disabled}
                  aria-label={`Minutes for ${row.name}`} title="Full stored precision; regulation assignments must sum to 240 minutes."
                  onChange={event => sim.setDraft(row.name, 'minutes', event.target.value, { typing: true })} /></td>
                <td>
                  <label className="frx-usage-control">
                    <span>{row.shotUsageMultiplier.toFixed(1)}</span>
                    <input type="range" min="0" max="2" step="0.1" value={row.shotUsageMultiplier}
                      disabled={row.shotUsageDisabled} aria-label={`Shot usage scenario multiplier for ${row.name}`}
                      title="Relative field-goal shooter weight; 1.0 is baseline and 0.0 removes this active player from shot selection."
                      onChange={event => sim.setDraft(row.name, 'shotUsageMultiplier', event.target.value)} />
                  </label>
                </td>
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
