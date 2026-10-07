import React from 'react';
import TeamMark from '@/components/studio/TeamMark';

const RATING_KEYS = [
  ['scoring', 'SCTR'], ['shooting', 'SHOT'], ['creation', 'CREA'],
  ['playmaking', 'PLAY'], ['rebounding', 'REBD'], ['defense', 'DEF'], ['durability', 'DURA'],
];
const headCell = 'px-2 py-2.5 text-[10px] font-bold uppercase tracking-[0.12em] myna-muted';
const num = value => (Number.isFinite(Number(value)) ? Number(value) : 0);

// User-team game plan panel and the roster viewer with native ratings.
export default function FranchiseTeamPanel({ state, teamId, onTeamChange, onCoaching, busy }) {
  const team = (state?.teams || []).find(item => item.teamId === teamId) || state?.teams?.[0] || null;
  const isUser = team?.control === 'user';
  const seasonLive = state?.calendar?.status === 'regular-season';
  const coaching = team?.coaching || {};

  return (
    <section className="myna-panel overflow-hidden" aria-label="Franchise roster">
      <header className="flex flex-wrap items-baseline justify-between gap-2 px-4 pb-3 pt-4">
        <div>
          <p className="myna-accent-text text-[10px] font-bold uppercase tracking-[0.22em]">Roster &amp; game plan</p>
          <h3 className="myna-display mt-0.5 text-2xl">{team ? `${team.teamId} ${team.displayName || ''}`.trim().toUpperCase() : 'ROSTER'}</h3>
        </div>
        <select
          value={team?.teamId || ''}
          onChange={event => onTeamChange?.(event.target.value)}
          className="min-h-9 max-w-48 rounded-lg border border-[var(--myna-border)] bg-[var(--myna-canvas)] px-2 text-xs font-semibold text-[var(--myna-text)]"
          aria-label="Roster team"
        >
          {(state?.teams || []).map(item => <option key={item.teamId} value={item.teamId}>{item.teamId}{item.control === 'user' ? ' · yours' : ''}</option>)}
        </select>
      </header>

      {isUser && seasonLive && (
        <div className="border-y border-[var(--myna-border)] bg-[var(--myna-canvas)] px-4 py-3">
          <div className="grid gap-3 sm:grid-cols-4">
            {[['Pace', 'pace', 94, 106], ['Offense', 'offense', 0, 100], ['Defense', 'defense', 0, 100]].map(([label, key, min, max]) => (
              <label key={key} className="block">
                <span className="myna-muted mb-1 block text-[9px] font-bold uppercase tracking-[0.18em]">{label} · {coaching[key] ?? '—'}</span>
                <input
                  type="range" min={min} max={max} step={1} defaultValue={coaching[key] ?? (min + max) / 2}
                  ref={node => { if (node && !node.dataset.init) { node.dataset.init = '1'; node.value = coaching[key] ?? (min + max) / 2; } }}
                  onChange={event => { event.target.nextValue = Number(event.target.value); }}
                  className="w-full" aria-label={label}
                />
              </label>
            ))}
            <button
              type="button" disabled={busy} onClick={event => {
                const inputs = event.currentTarget.closest('div').querySelectorAll('input[type="range"]');
                const plan = { teamId: team.teamId };
                ['pace', 'offense', 'defense'].forEach((key, index) => { plan[key] = Number(inputs[index].value); });
                onCoaching?.(plan);
              }}
              className="myna-accent min-h-10 self-end rounded-lg px-4 text-[11px] font-bold tracking-[0.16em] disabled:opacity-40" style={{ color: 'var(--myna-on-accent)' }}
            >
              Apply game plan
            </button>
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr>
              <th className={`${headCell} text-left`}>Player</th>
              <th className={headCell}>POS</th>
              <th className={headCell}>AGE</th>
              <th className={headCell}>GP</th>
              <th className={headCell}>MIN</th>
              <th className={headCell}>PPG</th>
              <th className={headCell}>RPG</th>
              <th className={headCell}>APG</th>
              {RATING_KEYS.map(([key, label]) => <th key={key} className={headCell}>{label}</th>)}
            </tr>
          </thead>
          <tbody>
            {(team?.roster || []).filter(player => player.status !== 'waived').map(player => {
              const stats = player.seasonStats || {};
              const gp = num(stats.games);
              return (
                <tr key={player.playerRef || player.name} className="border-t border-[var(--myna-border)] transition-colors hover:bg-[var(--myna-raised)]">
                  <td className="px-2 py-2.5 text-xs font-semibold">
                    {player.name}
                    {player.injury && <span className="ml-1.5 rounded border border-[var(--myna-border)] px-1 text-[8px] font-bold uppercase tracking-[0.1em] myna-muted">INJ</span>}
                  </td>
                  <td className="myna-mono px-2 py-2.5 text-center text-[10px]">{player.position || '—'}</td>
                  <td className="myna-mono px-2 py-2.5 text-center text-[10px]">{player.age ?? '—'}</td>
                  <td className="myna-mono px-2 py-2.5 text-center text-[10px]">{gp}</td>
                  <td className="myna-mono px-2 py-2.5 text-center text-[10px]">{gp ? num(stats.minutes / gp).toFixed(1) : '—'}</td>
                  <td className="myna-mono px-2 py-2.5 text-center text-[10px] font-bold" style={{ color: 'var(--myna-accent)' }}>{gp ? num(stats.points / gp).toFixed(1) : '—'}</td>
                  <td className="myna-mono px-2 py-2.5 text-center text-[10px]">{gp ? num(stats.rebounds / gp).toFixed(1) : '—'}</td>
                  <td className="myna-mono px-2 py-2.5 text-center text-[10px]">{gp ? num(stats.assists / gp).toFixed(1) : '—'}</td>
                  {RATING_KEYS.map(([key]) => (
                    <td key={key} className="myna-mono px-2 py-2.5 text-center text-[10px]">{player.ratings?.[key] ?? '—'}</td>
                  ))}
                </tr>
              );
            })}
            {!team?.roster?.length && (
              <tr><td colSpan={7 + RATING_KEYS.length} className="px-4 py-6 text-center text-xs myna-muted">Roster unavailable for this league.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}