import React from 'react';
import { RotateCcw, Dices, UserMinus } from 'lucide-react';

// Broadcast control desk: pool eligibility filters, draw weighting and the
// replay seed. Any change marks the pool dirty; "Apply" rebuilds it.
const POSITION_CHIPS = ['PG', 'SG', 'SF', 'PF', 'C'];

export default function SpinControlDesk({ settings, onChange, onSubmit, onReset, roleOptions, teamOptions, metricOptions, dirty }) {
  const metricActive = settings.metric !== 'none';
  const toggleList = (field, value) => {
    const current = settings[field] || [];
    onChange({ [field]: current.includes(value) ? current.filter(item => item !== value) : [...current, value] });
  };
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
      <p className="spin-desk__label mt-3">Positions — any selected</p>
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
      <p className="spin-desk__label">Stat floor / cap</p>
      <div className="spin-desk__grid">
        <label className="spin-desk__field"><span>Stat</span>
          <select name="metric" value={settings.metric} onChange={event => onChange({ metric: event.target.value })}>
            <option value="none">No stat floor or cap</option>
            {metricOptions.map(metric => <option key={metric.key} value={metric.key}>{metric.label}</option>)}
          </select>
        </label>
        <label className="spin-desk__field"><span>Minimum</span>
          <input name="metricMin" type="number" step="any" placeholder="No floor" disabled={!metricActive} value={settings.metricMin} onChange={event => onChange({ metricMin: event.target.value })} />
        </label>
        <label className="spin-desk__field"><span>Maximum</span>
          <input name="metricMax" type="number" step="any" placeholder="No cap" disabled={!metricActive} value={settings.metricMax} onChange={event => onChange({ metricMax: event.target.value })} />
        </label>
      </div>
    </div>

    <div className="spin-desk__section">
      <p className="spin-desk__label">Replay</p>
      <label className="spin-desk__field"><span>Replay seed</span>
        <input name="seed" autoComplete="off" maxLength={80} value={settings.seed} onChange={event => onChange({ seed: event.target.value })} />
      </label>
    </div>

    <div className="spin-desk__actions">
      <button type="button" onClick={onReset} className="spin-desk__reset" aria-label="Reset pool filters"><RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />Reset</button>
      <button type="submit" className="spin-desk__apply">{dirty ? <><Dices className="h-4 w-4" aria-hidden="true" />Apply pool settings</> : <><Dices className="h-4 w-4" aria-hidden="true" />Rebuild pool</>}</button>
    </div>
    <p className="mt-2 flex items-center justify-center gap-3 text-[11px] text-muted-foreground"><UserMinus className="h-3 w-3" aria-hidden="true" /> Multi-select chips narrow the pool; cleared chips re-open it.</p>
  </form>;
}