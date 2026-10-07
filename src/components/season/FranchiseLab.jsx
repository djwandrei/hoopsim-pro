import React, { useEffect, useState } from 'react';
import { Crown, Dices, Loader2, Play, RotateCcw, Sun, Trophy } from 'lucide-react';
import {
  startNativeFranchise, runNativeFranchiseSeason, advanceNativeFranchiseOffseason,
  coachNativeFranchise, loadNativeFranchise, saveNativeFranchise, clearNativeFranchise,
} from '@/lib/season/nativeSeasonEngine';
import FranchiseStandings from '@/components/season/FranchiseStandings';
import FranchiseTeamPanel from '@/components/season/FranchiseTeamPanel';
import FranchisePlayoffs from '@/components/season/FranchisePlayoffs';

const fieldCls = 'min-h-10 w-full rounded-lg border border-[var(--myna-border)] bg-[var(--myna-canvas)] px-3 text-xs text-[var(--myna-text)]';
const labelCls = 'myna-muted mb-1.5 block text-[9px] font-bold uppercase tracking-[0.22em]';
const randomSeed = () => String(Math.floor(Math.random() * 4294960000));

// Franchise mode: the site's persistent league engine, driven from the
// studio. Create a seeded league for the selected season, simulate with
// checkpoints, manage the user team's game plan, then advance the offseason.
export default function FranchiseLab({ year, league }) {
  const [franchise, setFranchise] = useState(null);
  const [seed, setSeed] = useState('');
  const [userTeam, setUserTeam] = useState('');
  const [series, setSeries] = useState('7');
  const [rosterTeam, setRosterTeam] = useState('');
  const [busy, setBusy] = useState(null);
  const [progress, setProgress] = useState(0);
  const [note, setNote] = useState('');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let live = true;
    loadNativeFranchise().then(state => { if (live) { setFranchise(state || null); setReady(true); } })
      .catch(error => { if (live) { setNote(error.message); setReady(true); } });
    return () => { live = false; };
  }, []);

  useEffect(() => {
    if (franchise && !rosterTeam) {
      const userTeamRow = (franchise.teams || []).find(team => team.control === 'user');
      setRosterTeam(userTeamRow?.teamId || franchise.teams?.[0]?.teamId || '');
    }
  }, [franchise, rosterTeam]);

  const persist = async state => {
    try {
      await saveNativeFranchise(state);
      setNote('Saved to this browser.');
    } catch {
      setNote('The league could not be saved (storage limit); the in-memory result stays available.');
    }
  };

  const createLeague = async () => {
    setBusy('create');
    setNote('Building the persistent league from the observed season package…');
    try {
      const teamNames = Object.fromEntries((league?.teams || []).map(team => [team.code, team.name]));
      const state = await startNativeFranchise({ year, userTeamId: userTeam || null, seed: seed.trim() || randomSeed(), seriesLength: Number(series) || 7, teamNames });
      setFranchise(state);
      await persist(state);
    } catch (error) {
      setNote(error.message);
    } finally {
      setBusy(null);
    }
  };

  const runSeason = async () => {
    setBusy('run');
    setProgress(0);
    setNote('Simulating the league schedule…');
    try {
      const report = await runNativeFranchiseSeason(franchise, { onProgress: setProgress });
      setFranchise(report.state);
      const championId = report.result?.championId || report.state?.playoffs?.championId;
      setNote(championId ? `Season ${report.state.currentSeason} complete · champion ${championId}.` : 'Season advanced.');
      await persist(report.state);
    } catch (error) {
      setNote(error.message);
    } finally {
      setBusy(null);
    }
  };

  const advanceOffseason = async () => {
    setBusy('offseason');
    setNote('Advancing the offseason…');
    try {
      const state = await advanceNativeFranchiseOffseason(franchise);
      setFranchise(state);
      setNote(`Rosters advanced to season ${state.currentSeason}. Simulate when ready.`);
      await persist(state);
    } catch (error) {
      setNote(error.message);
    } finally {
      setBusy(null);
    }
  };

  const applyCoaching = async plan => {
    setBusy('coaching');
    try {
      const state = await coachNativeFranchise(franchise, plan);
      setFranchise(state);
      setNote('Game plan applied.');
    } catch (error) {
      setNote(error.message);
    } finally {
      setBusy(null);
    }
  };

  const resetLeague = async () => {
    await clearNativeFranchise();
    setFranchise(null);
    setRosterTeam('');
    setNote('Franchise cleared.');
  };

  if (!ready) {
    return <div className="myna-panel flex items-center gap-3 p-5 text-sm text-[var(--myna-muted)]"><Loader2 className="h-5 w-5 animate-spin" style={{ color: 'var(--myna-accent)' }} />Checking for a saved franchise…</div>;
  }

  const seasonComplete = franchise?.calendar?.status === 'complete';
  const running = busy === 'run';

  return (
    <div className="space-y-4">
      {!franchise ? (
        <section className="myna-panel p-4 sm:p-5" aria-label="Start a franchise">
          <div className="flex items-center gap-3">
            <span className="inline-block h-8 w-1 rounded-full" style={{ background: 'linear-gradient(180deg, var(--myna-accent), transparent)' }} />
            <div>
              <p className="myna-accent-text text-[10px] font-semibold uppercase tracking-[0.22em]">Franchise mode</p>
              <h3 className="myna-display mt-0.5 text-xl">Start a persistent league</h3>
            </div>
          </div>
          <p className="myna-muted mt-3 text-[11px] leading-relaxed">
            The original {year}–{String(year + 1).slice(-2)} season package builds every roster; your saved league lives in this browser and carries
            seasons, records, game plans and player development across the offseason.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:items-end">
            <label className="block">
              <span className={labelCls}><Dices className="mr-1 inline h-3 w-3" />Replay seed</span>
              <input className={fieldCls} value={seed} onChange={event => setSeed(event.target.value)} placeholder="Blank = fresh random seed" aria-label="Franchise seed" />
            </label>
            <label className="block">
              <span className={labelCls}><Crown className="mr-1 inline h-3 w-3" />Your team</span>
              <select className={fieldCls} value={userTeam} onChange={event => setUserTeam(event.target.value)} aria-label="User team">
                <option value="">None — CPU league</option>
                {(league?.teams || []).map(team => <option key={team.code} value={team.code}>{team.name}</option>)}
              </select>
            </label>
            <label className="block">
              <span className={labelCls}><Trophy className="mr-1 inline h-3 w-3" />Series length</span>
              <select className={fieldCls} value={series} onChange={event => setSeries(event.target.value)} aria-label="Playoff series length">
                <option value="7">Best of 7</option>
                <option value="5">Best of 5</option>
                <option value="3">Best of 3</option>
                <option value="1">One game</option>
              </select>
            </label>
            <button
              type="button" onClick={createLeague} disabled={Boolean(busy)}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-5 text-[11px] font-bold tracking-[0.18em] transition-all hover:brightness-110 disabled:opacity-40"
              style={{ background: 'linear-gradient(115deg, var(--myna-accent), var(--myna-action-end, var(--myna-hi)))', color: 'var(--myna-on-accent)', boxShadow: '0 6px 18px color-mix(in srgb, var(--myna-accent) 30%, transparent)' }}
            >
              {busy === 'create' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              {busy === 'create' ? 'Building…' : 'Create franchise'}
            </button>
          </div>
        </section>
      ) : (
        <>
          <section className="myna-panel p-4 sm:p-5" aria-label="Franchise controls">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="inline-block h-8 w-1 rounded-full" style={{ background: 'linear-gradient(180deg, var(--myna-accent), transparent)' }} />
                <div>
                  <p className="myna-accent-text text-[10px] font-semibold uppercase tracking-[0.22em]">Franchise · {franchise.leagueId || 'league'}</p>
                  <h3 className="myna-display mt-0.5 text-xl">
                    SEASON {franchise.currentSeason}–{String(franchise.currentSeason + 1).slice(-2)} · {(franchise.teams || []).length} TEAMS
                  </h3>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {seasonComplete ? (
                  <button type="button" onClick={advanceOffseason} disabled={Boolean(busy)} className="inline-flex min-h-10 items-center gap-2 rounded-lg border px-4 text-[11px] font-bold tracking-[0.16em] transition-colors hover:bg-[var(--myna-raised)] disabled:opacity-40" style={{ borderColor: 'color-mix(in srgb, var(--myna-accent) 45%, transparent)', color: 'var(--myna-accent)' }}>
                    {busy === 'offseason' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sun className="h-4 w-4" />}
                    {busy === 'offseason' ? 'Advancing…' : 'Advance offseason'}
                  </button>
                ) : (
                  <button
                    type="button" onClick={runSeason} disabled={Boolean(busy)}
                    className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-5 text-[11px] font-bold tracking-[0.18em] transition-all hover:brightness-110 disabled:opacity-40"
                    style={{ background: 'linear-gradient(115deg, var(--myna-accent), var(--myna-action-end, var(--myna-hi)))', color: 'var(--myna-on-accent)', boxShadow: '0 6px 18px color-mix(in srgb, var(--myna-accent) 30%, transparent)' }}
                  >
                    {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                    {running ? `Simulating… ${Math.round(progress * 100)}%` : 'Simulate season'}
                  </button>
                )}
                <button type="button" onClick={resetLeague} disabled={Boolean(busy)} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-[var(--myna-border)] px-3 text-[11px] font-bold tracking-[0.16em] text-[var(--myna-muted)] transition-colors hover:bg-[var(--myna-raised)] disabled:opacity-40">
                  <RotateCcw className="h-4 w-4" />Reset
                </button>
              </div>
            </div>
            {running && (
              <div className="myna-bar mt-3"><span className="transition-all" style={{ width: `${Math.round(progress * 100)}%`, background: 'linear-gradient(90deg, var(--myna-accent), var(--myna-hi))' }} /></div>
            )}
            {note && <p className="myna-muted mt-3 flex items-center gap-2 text-[11px]">{seasonComplete && <Trophy className="h-3.5 w-3.5" style={{ color: 'var(--myna-accent)' }} />}{note}</p>}
          </section>

          {seasonComplete && franchise.playoffs?.championId && (
            <div className="myna-panel flex items-center justify-center gap-3 p-4">
              <Crown className="h-5 w-5" style={{ color: 'var(--myna-accent)' }} />
              <span className="myna-display text-xl">{franchise.playoffs.championId} WIN SEASON {franchise.currentSeason}–{String(franchise.currentSeason + 1).slice(-2)}</span>
            </div>
          )}

          <FranchiseStandings state={franchise} focusTeamId={rosterTeam} onFocusTeam={setRosterTeam} />
          {franchise.playoffs && <FranchisePlayoffs playoffs={franchise.playoffs} />}
          <FranchiseTeamPanel state={franchise} teamId={rosterTeam} onTeamChange={setRosterTeam} onCoaching={applyCoaching} busy={Boolean(busy)} />
        </>
      )}
    </div>
  );
}