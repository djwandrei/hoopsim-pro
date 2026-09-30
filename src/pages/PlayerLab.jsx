import React, { useMemo, useState } from 'react';
import { Dices } from 'lucide-react';
import { Button } from '@/components/ui/button';
import StudioShell from '@/components/studio/StudioShell';
import WorkbenchHeader from '@/components/studio/WorkbenchHeader';
import SourceStatus from '@/components/studio/SourceStatus';
import PlayerProfileViews from '@/components/players/PlayerProfileViews';
import PlayerIdentity from '@/components/players/PlayerIdentity';
import ScenarioBands from '@/components/players/ScenarioBands';
import WorkspaceEmpty from '@/components/studio/WorkspaceEmpty';

import PlayerPicker from '@/components/studio/PlayerPicker';
import useSeasonSource from '@/hooks/useSeasonSource';
import { observedPlayers, perGameStats, projectNextGame } from '@/lib/season/labs';

const BAND_COLS = ['P10', 'P25', 'MEDIAN', 'P75', 'P90'];

function TeamSelect({ teams, value, onChange }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-muted-foreground">Next-game opponent</span>
      <select
        className="w-full rounded-md border border-input bg-raised px-3 py-2 text-sm text-foreground"
        value={value}
        onChange={event => onChange(event.target.value)}
      >
        <option value="league">League average</option>
        {teams.map(team => <option key={team.code} value={team.code}>{team.name}</option>)}
      </select>
    </label>
  );
}

function BandTable({ rows }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-xs text-muted-foreground">
          <th className="py-1 text-left font-medium">STAT</th>
          {BAND_COLS.map(col => <th key={col} className="py-1 text-right font-medium">{col}</th>)}
        </tr>
      </thead>
      <tbody>
        {rows.map(row => (
          <tr key={row.label} className="border-t border-border/40">
            <td className="py-1.5 font-medium">{row.label}</td>
            {['p10', 'p25', 'p50', 'p75', 'p90'].map(key => (
              <td key={key} className={`text-right font-mono ${key === 'p50' ? 'text-goldSoft' : ''}`}>{row.band[key].toFixed(1)}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function PlayerLab() {
  const { year, setYear, years, source, league, state, error, retry } = useSeasonSource();
  const [player, setPlayer] = useState(null);
  const [oppCode, setOppCode] = useState('league');
  const [seed, setSeed] = useState(11);
  const [view, setView] = useState('profile');

  const players = useMemo(() => (source ? observedPlayers(source) : []), [source]);
  const teams = league?.teams || [];
  const opponent = oppCode === 'league' ? null : league?.byCode.get(oppCode);
  const projection = useMemo(
    () => (player && league ? projectNextGame(player, opponent, league, { seed }) : null),
    [player, opponent, league, seed],
  );
  const gameStats = player ? perGameStats(player) : null;

  return (
    <StudioShell active="/players">
      <WorkbenchHeader title="PLAYER BLUEPRINT" description="Browse observed player records, compare rates, and keep next-game scenarios separate from the evidence." steps={['Roster', 'Profile', 'Scenario']} current={player ? view === 'scenario' ? 2 : 1 : 0} state={state} status={player ? view === 'scenario' ? 'Scenario available' : 'Player selected' : 'Choose a player'} />
      <main className="mx-auto max-w-6xl space-y-5 px-4 py-6">
        <SourceStatus state={state} error={error} source={source} year={year} years={years} onYearChange={value => { setYear(value); setPlayer(null); }} onRetry={retry} />
        {state === 'ready' && (
          <div className="grid gap-5 lg:grid-cols-3">
            <div className="space-y-4">
              <p className="court-kicker">Observed roster browser</p>
              <PlayerPicker players={players} onSelect={value => { setPlayer(value); setView('profile'); }} selectedRef={player?.playerRef} />
            </div>

            <div className="space-y-4 lg:col-span-2">
              {player && gameStats && (
                <>
                  <PlayerIdentity player={player} year={year} />
                  <nav aria-label="Player workspace views" className="flex flex-wrap gap-2">{[['profile','Profile & evidence'],['scenario','Next-game scenario']].map(([key,label]) => <button type="button" key={key} aria-pressed={view === key} onClick={() => setView(key)} className={view === key ? 'min-h-10 rounded-lg border border-gold/40 bg-gold/10 px-4 text-xs font-medium text-gold' : 'min-h-10 rounded-lg border border-border/40 bg-card px-4 text-xs text-muted-foreground hover:bg-raised'}>{label}</button>)}</nav>
                  {view === 'profile' && <PlayerProfileViews player={player} year={year} source={source} />}
                  {view === 'scenario' && <section className="court-panel flex flex-wrap items-end justify-between gap-3 p-4"><div className="w-full sm:w-64"><TeamSelect teams={teams} value={oppCode} onChange={setOppCode} /></div><Button variant="outline" onClick={() => setSeed(Math.floor(Math.random() * 4294967296))}><Dices className="h-4 w-4" /> Re-roll scenario</Button></section>}

                  {projection && view === 'scenario' && (
                    <section className="court-panel p-5">
                      <h3 className="court-display text-xl text-foreground">
                        LOCAL NEXT-GAME SCENARIO {opponent ? `vs ${opponent.code}` : 'vs league average'}
                      </h3>
                      <p className="mt-2 text-xs text-muted-foreground">2,000 modeled trials · seed {seed} · percentile bands, not a validated forecast.</p>
                      <ScenarioBands projection={projection} />
                      <div className="mt-5 overflow-x-auto" tabIndex={0} aria-label="Next-game scenario percentile bands">
                        <BandTable rows={[
                          { label: 'PTS', band: projection.pts },
                          { label: 'REB', band: projection.reb },
                          { label: 'AST', band: projection.ast },
                        ]} />
                      </div>

                    </section>
                  )}
                </>
              )}
              {!player && (
                <WorkspaceEmpty title="START WITH THE ROSTER">Search by name or team, select a player, then explore Profile, Stats and Bio alongside the source evidence.</WorkspaceEmpty>
              )}
            </div>
          </div>
        )}
      </main>
    </StudioShell>
  );
}