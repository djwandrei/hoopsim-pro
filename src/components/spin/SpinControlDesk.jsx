import React from 'react';
import { RotateCcw, Dices, UserMinus, Plus, X } from 'lucide-react';

// Broadcast control desk: pool eligibility filters (role, workload, quick
// position include/exclude, per-stat floor/cap rules), draw weighting and the
// Apply action. Any change marks the pool dirty; "Apply" rebuilds it.
const POSITION_CHIPS = ['PG', 'SG', 'SF', 'PF', 'C'];

export default function SpinControlDesk({ settings, onChange, onSubmit, onReset, roleOptions, teamOptions, metricOptions, dirty }) {
  const statRules = Array.isArray(settings.statRules) ? settings.statRules : [];
  const toggleList = (field, value) => {
    const current = settings[field] || [];
    onChange({ [field]: current.includes(value) ? current.filter(item => item !== value) : [...current, value] });
  };
  const updateRule = (id, updates) => onChange({ statRules: statRules.map(rule => rule.id === id ? { ...rule, ...updates } : rule) });
  const removeRule = id => onChange({ statRules: statRules.filter(rule => rule.id !== id) });
  const addRule = () => onChange({ statRules: [...statRules, { id: crypto.randomUUID(), metric: metricOptions[0]?.key || '', min: '', max: '' }] });
  return <form className="court-panel spin-desk" onSubmit={event => { event.preventDefault(); onSubmit(); }}>
    <header className="spin-desk__head">
      <div>
        <p className="bcast-kicker">Control desk</p>
        <h2 className="spin-desk__title">BUILD THE POOL</h2>
      </div>
      <span className="bcast-lowerthird"><span className="bcast-lowerthird__bar" aria-hidden="true" />{dirty ? 'Settings changed — apply' : 'Pool armed'}</span>
    </header>

    <div className="spin-desk__section">
      <p className="spin-desk__label">Eligibility</p>
      <div className="spin-desk__grid">
        <label className="spin-desk__field"><span>Skill role</span>
          <select name="eligibility" value={settings.roleValue} onChange={event => onChange({ roleValue: event.target.value })}>
            {roleOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label className="spin-desk__field"><span>Games floor</span>
          <input name="minGames" type="number" min="0" step="1" placeholder="Season default (1)" value={settings.minGames} onChange={event => onChange({ minGames: event.target.value })} />
        </label>
        <label className="spin-desk__field"><span>Minutes floor</span>
          <input name="minMinutes" type="number" min="0" step="any" placeholder="No minutes floor" value={settings.minMinutes} onChange={event => onChange({ minMinutes: event.target.value })} />
        </label>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <p className="spin-desk__label !mb-0">Positions</p>
        <div className="spin-mode" role="group" aria-label="Position filter mode">
          <button type="button" aria-pressed={settings.positionMode !== 'exclude'} onClick={() => onChange({ positionMode: 'include' })}>Include</button>
          <button type="button" aria-pressed={settings.positionMode === 'exclude'} onClick={() => onChange({ positionMode: 'exclude' })}>Exclude</button>
        </div>
      </div>
      <p className="spin-desk__hint">{settings.positionMode === 'exclude' ? 'Selected positions are removed from the pool.' : 'Selected positions are the only ones drawn.'}</p>
      <div className="spin-chips">{POSITION_CHIPS.map(code => <button key={code} type="button" aria-pressed={(settings.positions || []).includes(code)} className={`spin-chip${(settings.positions || []).includes(code) ? ' spin-chip--on' : ''}`} onClick={() => toggleList('positions', code)}>{code}</button>)}</div>
      <p className="spin-desk__label mt-3">Teams — any selected</p>
      <div className="spin-chips">{teamOptions.map(code => <button key={code} type="button" aria-pressed={(settings.teams || []).includes(code)} className={`spin-chip${(settings.teams || []).includes(code) ? ' spin-chip--on' : ''}`} onClick={() => toggleList('teams', code)}>{code}</button>)}</div>
    </div>

    <div className="spin-desk__section">
      <p className="spin-desk__label">Draw weighting</p>
      <div className="spin-desk__grid">
        <label className="spin-desk__field"><span>Weight draws by</span>
          <select name="weight" value={settings.weight} onChange={event => onChange({ weight: event.target.value })}>
            <option value="uniform">Uniform — equal odds</option>
            {metricOptions.map(metric => <option key={metric.key} value={metric.key}>{metric.label}</option>)}
          </select>
        </label>
      </div>
    </div>

    <div className="spin-desk__section">
      <div className="flex items-center justify-between gap-2">
        <p className="spin-desk__label !mb-0">Stat filters — players must pass every rule</p>
        <button type="button" className="spin-desk__add" onClick={addRule}><Plus className="h-3.5 w-3.5" aria-hidden="true" />Add</button>
      </div>
      {statRules.length === 0 && <p className="spin-desk__hint">No stat rules — e.g. filter for efficiency ≥ a value or exclude players below a PPG floor.</p>}
      <div className="space-y-2">
        {statRules.map(rule => <div key={rule.id} className="spin-rule">
          <select value={rule.metric} onChange={event => updateRule(rule.id, { metric: event.target.value })} aria-label="Stat">
            <option value="" disabled>Pick a stat</option>
            {metricOptions.map(metric => <option key={metric.key} value={metric.key}>{metric.label}</option>)}
          </select>
          <label className="spin-rule__bound"><span>Min</span>
            <input type="number" step="any" placeholder="—" value={rule.min} onChange={event => updateRule(rule.id, { min: event.target.value })} />
          </label>
          <label className="spin-rule__bound"><span>Max</span>
            <input type="number" step="any" placeholder="—" value={rule.max} onChange={event => updateRule(rule.id, { max: event.target.value })} />
          </label>
          <button type="button" className="spin-rule__remove" aria-label={`Remove ${rule.metric} filter`} onClick={() => removeRule(rule.id)}><X className="h-3.5 w-3.5" aria-hidden="true" /></button>
        </div>)}
      </div>
    </div>

    <div className="spin-desk__actions">
      <button type="button" onClick={onReset} className="spin-desk__reset" aria-label="Reset pool filters"><RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />Reset</button>
      <button type="submit" className="spin-desk__apply">{dirty ? <><Dices className="h-4 w-4" aria-hidden="true" />Apply pool settings</> : <><Dices className="h-4 w-4" aria-hidden="true" />Rebuild pool</>}</button>
    </div>
    <p className="mt-2 flex items-center justify-center gap-3 text-[11px] text-muted-foreground"><UserMinus className="h-3 w-3" aria-hidden="true" /> Multi-select chips narrow the pool; cleared chips re-open it.</p>
  </form>;
}