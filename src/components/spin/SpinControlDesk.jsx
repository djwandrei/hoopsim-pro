import React from 'react';

// Broadcast control desk: the pool builder form. Any change marks the pool
// dirty; "Apply pool settings" rebuilds the seeded pool. Field values are
// controlled — the parent hook owns them.
export default function SpinControlDesk({ settings, onChange, onSubmit, roleOptions, teamOptions, metricOptions, dirty }) {
  const metricActive = settings.metric !== 'none';
  return <form className="court-panel spin-desk" onSubmit={event => { event.preventDefault(); onSubmit(); }}>
    <header className="spin-desk__head">
      <div>
        <p className="bcast-kicker">Control desk</p>
        <h2 className="spin-desk__title">BUILD THE POOL</h2>
      </div>
      <span className="bcast-lowerthird"><span className="bcast-lowerthird__bar" aria-hidden="true" />{dirty ? 'Settings changed — apply' : 'Pool armed'}</span>
    </header>
    <div className="spin-desk__grid">
      <label className="spin-desk__field"><span>Replay seed</span>
        <input name="seed" autoComplete="off" maxLength={80} value={settings.seed} onChange={event => onChange({ seed: event.target.value })} />
      </label>
      <label className="spin-desk__field"><span>Skill</span>
        <select name="eligibility" value={settings.roleValue} onChange={event => onChange({ roleValue: event.target.value })}>
          {roleOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>
      <label className="spin-desk__field"><span>Team</span>
        <select name="team" value={settings.team} onChange={event => onChange({ team: event.target.value })}>
          <option value="all">All teams</option>
          {teamOptions.map(code => <option key={code} value={code}>{code}</option>)}
        </select>
      </label>
      <label className="spin-desk__field"><span>Weight draws by</span>
        <select name="weight" value={settings.weight} onChange={event => onChange({ weight: event.target.value })}>
          <option value="uniform">Uniform — equal odds</option>
          {metricOptions.map(metric => <option key={metric.key} value={metric.key}>{metric.label}</option>)}
        </select>
      </label>
      <label className="spin-desk__field"><span>Stat floor / cap on</span>
        <select name="metric" value={settings.metric} onChange={event => onChange({ metric: event.target.value })}>
          <option value="none">No stat floor or cap</option>
          {metricOptions.map(metric => <option key={metric.key} value={metric.key}>{metric.label}</option>)}
        </select>
      </label>
      <label className="spin-desk__field"><span>Stat minimum</span>
        <input name="metricMin" type="number" step="any" placeholder="No floor" disabled={!metricActive} value={settings.metricMin} onChange={event => onChange({ metricMin: event.target.value })} />
      </label>
      <label className="spin-desk__field"><span>Stat maximum</span>
        <input name="metricMax" type="number" step="any" placeholder="No cap" disabled={!metricActive} value={settings.metricMax} onChange={event => onChange({ metricMax: event.target.value })} />
      </label>
      <label className="spin-desk__field"><span>Games floor</span>
        <input name="minGames" type="number" min="0" step="1" placeholder="Season default (1)" value={settings.minGames} onChange={event => onChange({ minGames: event.target.value })} />
      </label>
    </div>
    <button type="submit" className="spin-desk__apply">{dirty ? 'Apply pool settings' : 'Rebuild pool'}</button>
  </form>;
}