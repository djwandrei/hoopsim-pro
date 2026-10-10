import React, { useEffect, useMemo, useRef, useState } from 'react';
import confetti from 'canvas-confetti';
import { Loader2, Play } from 'lucide-react';
import { buildForgePool } from './forgePool';
import { decodeForgeBuild, forgeBuildQuery, restoreForgePicks, updateForgeBuildUrl } from './forgeReceipt';
import { simulateForgeSeason } from './forgeTeamSim';
import { TEAM_SLOTS, rotationValid } from './forgeSimulation';
import { chooseForgeOffer } from './forgeDraftRules';
import { newForgeSeed, readForgeSession, saveForgeSession, sessionKey } from './forgeSession';
import ForgeDraftSettings from './ForgeDraftSettings';
import ForgeSaveButton from './ForgeSaveButton';
import ForgeTeamSpinPanel from './ForgeTeamSpinPanel';
import ForgeTeamPickPanel from './ForgeTeamPickPanel';
import ForgePlayerCard from './ForgePlayerCard';
import ForgeTeamSetupPanel from './ForgeTeamSetupPanel';
import ForgeRosterBoard from './ForgeRosterBoard';
import ForgeTeamBoard from './ForgeTeamBoard';
import ForgeTeamResult from './ForgeTeamResult';
export { TEAM_SLOTS } from './forgeSimulation';
const TEAM_RESPINS = 2, PLAYER_RESPINS = 3, SPIN_MS = 1250;

export default function ForgeTeamDraft({ source, league, pickMode = false, pool: poolProp }) {
  const mode = pickMode ? 'teamPick' : 'team';
  const allPool = useMemo(() => poolProp || buildForgePool(source), [poolProp, source]), key = sessionKey(mode, source);
  const [saved] = useState(() => readForgeSession(key));
  const [boot] = useState(() => { const shared = decodeForgeBuild(window.location.search); return shared?.mode === mode ? shared : decodeForgeBuild(`?${saved?.build || ''}`); });
  const [restored] = useState(() => restoreForgePicks(boot, allPool, source));
  const [picks, setPicks] = useState(restored.picks);
  const [phase, setPhase] = useState(() => TEAM_SLOTS.every(s => restored.picks[s.key]) ? 'ready' : Object.keys(restored.picks).length || saved?.phase === 'drafting' ? 'drafting' : 'setup');
  const [slots, setSlots] = useState(() => TEAM_SLOTS.map(s => ({ ...s, minutes: boot?.minutes?.[s.key] ?? s.minutes })));
  const [seed, setSeed] = useState(boot?.seed ?? saved?.seed ?? newForgeSeed());
  const [hostCode, setHostCode] = useState(boot?.hostCode || saved?.hostCode || league.teams[0]?.code);
  const [repeats, setRepeats] = useState(boot?.repeats || saved?.repeats || 12);
  const [sampling, setSampling] = useState(boot?.sampling || saved?.sampling || (pickMode ? 'team' : 'player'));
  const [reveal, setReveal] = useState(() => allPool.find(p => p.playerRef === saved?.reveal) || null);
  const [activeTeam, setActiveTeam] = useState(() => league.byCode.get(saved?.activeTeam) || null);
  const [spinning, setSpinning] = useState(false);
  const [teamSpin, setTeamSpin] = useState({ token: 0, targetKey: null });
  const [playerSpin, setPlayerSpin] = useState({ token: 0, targetKey: null });
  const [teamRespins, setTeamRespins] = useState(saved?.teamRespins ?? TEAM_RESPINS);
  const [playerRespins, setPlayerRespins] = useState(saved?.playerRespins ?? PLAYER_RESPINS);
  const [result, setResult] = useState(null), [error, setError] = useState(''), [drawOdds, setDrawOdds] = useState(null);
  const timer = useRef(null), worker = useRef(null), job = useRef(0), spinCount = useRef(saved?.spinCount || 0);
  const draftedRefs = useMemo(() => new Set(Object.values(picks).map(p => p.player.playerRef)), [picks]);
  const rosters = useMemo(() => { const map = new Map(); for (const p of allPool) map.set(p.teamCode, [...(map.get(p.teamCode) || []), p]); return map; }, [allPool]);
  const wheelTeams = useMemo(() => league.teams.filter(t => rosters.has(t.code)), [league, rosters]);
  const available = code => (rosters.get(code) || []).filter(p => !draftedRefs.has(p.playerRef));
  const playerItems = activeTeam ? available(activeTeam.code) : allPool.slice(0, 24);
  const filled = slots.filter(s => picks[s.key]).length;
  const payload = useMemo(() => ({ mode, picks: Object.fromEntries(Object.entries(picks).map(([k, p]) => [k, [p.player.playerRef]])), year: Number(source.entry.scope.seasonStartYears[0]), packageVersion: source.entry.packageVersion, seed, hostCode, minutes: Object.fromEntries(slots.map(s => [s.key, s.minutes])), sampling, repeats }), [mode, picks, source, seed, hostCode, slots, sampling, repeats]);
  useEffect(() => () => { window.clearTimeout(timer.current); worker.current?.terminate(); job.current++; }, []);
  useEffect(() => { saveForgeSession(key, { build: forgeBuildQuery(payload), phase: phase === 'complete' || phase === 'simulating' ? 'ready' : phase, sampling, seed, hostCode, repeats, activeTeam: activeTeam?.code, reveal: reveal?.playerRef, teamRespins, playerRespins, spinCount: spinCount.current }); }, [key, payload, phase, sampling, seed, hostCode, repeats, activeTeam, reveal, teamRespins, playerRespins]);
  useEffect(() => { if (phase === 'ready' || phase === 'complete') updateForgeBuildUrl(forgeBuildQuery(payload)); }, [phase, payload]);
  const spin = (fresh, spend) => {
    if (spinning || filled === slots.length || spend === 'team' && !teamRespins || spend === 'player' && (!playerRespins || pickMode)) return;
    const options = wheelTeams.filter(t => available(t.code).length), needTeam = fresh || !activeTeam || !available(activeTeam.code).length;
    const offer = chooseForgeOffer({ teams: options, players: options.flatMap(t => available(t.code)), sampling, activeTeam: activeTeam?.code, sameTeam: !needTeam, seed, step: spinCount.current });
    if (!offer) { setError('No eligible undrafted players remain. Restart to choose a different pool.'); return; }
    spinCount.current++;
    if (spend === 'team') setTeamRespins(v => v - 1);
    if (spend === 'player') setPlayerRespins(v => v - 1);
    setError(''); setActiveTeam(offer.team); setReveal(null); setDrawOdds(offer.probability);
    if (needTeam) setTeamSpin(v => ({ token: v.token + 1, targetKey: offer.team.code }));
    if (!pickMode) setPlayerSpin(v => ({ token: v.token + 1, targetKey: offer.player.playerRef }));
    setSpinning(true); timer.current = window.setTimeout(() => { setSpinning(false); if (!pickMode) setReveal(offer.player); }, SPIN_MS);
  };
  const assign = slotKey => {
    if (!reveal || spinning || picks[slotKey] || draftedRefs.has(reveal.playerRef)) return;
    const next = { ...picks, [slotKey]: { player: reveal } }; setPicks(next); setReveal(null);
    if (slots.every(s => next[s.key])) setPhase('ready');
  };
  const swap = (first, second) => {
    if (!picks[first] || !picks[second] || first === second) return;
    setPicks(current => ({ ...current, [first]: current[second], [second]: current[first] })); setResult(null);
  };
  const reset = () => {
    window.clearTimeout(timer.current); worker.current?.terminate(); worker.current = null; job.current++; spinCount.current = 0; updateForgeBuildUrl(null);
    setPicks({}); setReveal(null); setSpinning(false); setActiveTeam(null); setResult(null); setError(''); setDrawOdds(null); setSlots(TEAM_SLOTS.map(s => ({ ...s })));
    setTeamSpin({ token: 0, targetKey: null }); setPlayerSpin({ token: 0, targetKey: null }); setTeamRespins(TEAM_RESPINS); setPlayerRespins(PLAYER_RESPINS);
  };
  const restart = () => { reset(); setPhase('setup'); };
  const runSeason = (simulationSeed = seed) => {
    if (!rotationValid(slots, picks)) { setError('Allocate exactly 240 minutes across eight unique players, with each player at 0–48 minutes.'); return; }
    setPhase('simulating'); setError(''); const token = ++job.current;
    const args = { league, picks, slots, seed: simulationSeed, hostCode, schedule: source.schedule, repeats };
    const finish = message => {
      if (token !== job.current) return;
      worker.current?.terminate(); worker.current = null;
      if (message.error) { setError(message.error); setPhase('ready'); return; }
      setResult(message.result); setPhase('complete');
      if (message.result.perfect && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) confetti({ particleCount: 180, spread: 85, colors: ['#E9B949', '#3E63DD', '#D63A4B'] });
    };
    try {
      if (typeof Worker === 'undefined') { timer.current = window.setTimeout(() => { try { finish({ result: simulateForgeSeason(args) }); } catch (e) { finish({ error: e.message }); } }, 30); return; }
      worker.current = new Worker(new URL('./forgeSimulation.worker.js', import.meta.url), { type: 'module' });
      worker.current.onmessage = event => finish(event.data); worker.current.onerror = () => finish({ error: 'The season worker could not complete. Retry or reduce the repeat count.' }); worker.current.postMessage(args);
    } catch (e) { finish({ error: e.message }); }
  };
  return <section aria-label="Team forge game" className="space-y-4">
    {restored.warning && <p role="status" className="court-panel p-3 text-xs">{restored.warning}</p>}
    {error && <p role="alert" className="court-panel p-3 text-xs text-trim-ink">{error}</p>}
    <ForgeDraftSettings sampling={sampling} onSampling={setSampling} seed={seed} onSeed={setSeed} locked={phase !== 'setup'} />
    {phase !== 'setup' && <div className="flex flex-wrap items-center justify-between gap-2"><p aria-live="polite" className="text-xs text-muted-foreground">{filled}/8 players locked · Draft seed {seed}{!pickMode && drawOdds ? ` · Last draw chance ${(drawOdds * 100).toFixed(2)}%` : ''}</p><button type="button" onClick={restart} className="min-h-10 rounded-lg border border-border px-4 text-xs">Restart game / roster</button></div>}
    {phase === 'setup' && <ForgeTeamSetupPanel pickMode={pickMode} slots={slots} poolCount={allPool.length} onStart={() => setPhase('drafting')} />}
    {phase === 'drafting' && <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,16rem),minmax(0,1fr),minmax(0,18rem)]">
      {pickMode ? <ForgeTeamPickPanel teamItems={wheelTeams} teamSpin={teamSpin} spinning={spinning} activeTeam={activeTeam} onSpin={() => spin(true, null)} onRespinTeam={() => spin(true, 'team')} teamRespins={teamRespins} filled={filled} total={slots.length} pending={Boolean(reveal)} />
        : <ForgeTeamSpinPanel teamItems={wheelTeams} playerItems={playerItems} teamSpin={teamSpin} playerSpin={playerSpin} spinning={spinning} fast={spinCount.current > 8} onSpin={() => spin(true, null)} onRespinTeam={() => spin(true, 'team')} onRespinPlayer={() => spin(false, 'player')} teamRespins={teamRespins} playerRespins={playerRespins} filled={filled} total={slots.length} pending={Boolean(reveal)} />}
      {pickMode ? <ForgeRosterBoard team={activeTeam} roster={activeTeam ? available(activeTeam.code) : []} selectedRef={reveal?.playerRef} onPick={p => { if (!spinning && !draftedRefs.has(p.playerRef)) setReveal(p); }} disabled={spinning} /> : <ForgePlayerCard player={reveal} note={reveal ? `${8 - filled} open spots` : null} />}
      <ForgeTeamBoard slots={slots} picks={picks} reveal={reveal} revealPositions={reveal?.positions || []} spinning={spinning} onAssign={assign} onSwap={swap} />
    </div>}
    {phase === 'ready' && <div className="court-panel p-4 sm:p-6 space-y-4">
      <header><p className="bcast-kicker">Roster complete</p><h2 className="font-display text-3xl">REVIEW YOUR ROTATION</h2><p className="text-xs text-muted-foreground">Players stay locked. Swap positions and set their minutes; the rotation must total 240 minutes.</p></header>
      <ForgeTeamBoard slots={slots} picks={picks} spinning={false} onSwap={swap} onMinutes={(key, value) => setSlots(current => current.map(s => s.key === key ? { ...s, minutes: Math.max(0, Math.min(48, Math.round(Number(value) || 0))) } : s))} />
      <div className="grid gap-3 sm:grid-cols-3"><label className="text-xs">Replace this franchise<select value={hostCode} onChange={e => setHostCode(e.target.value)} className="studio-select mt-1 w-full">{league.teams.map(t => <option key={t.code} value={t.code}>{t.name} · {t.conference}</option>)}</select></label><label className="text-xs">Simulation seed<input type="number" min="0" max="4294967295" value={seed} onChange={e => setSeed(Math.max(0, Math.min(4294967295, Number(e.target.value) || 0)) >>> 0)} className="studio-input mt-1 w-full" /></label><label className="text-xs">Season samples<select className="studio-select mt-1 w-full" value={repeats} onChange={e => setRepeats(Number(e.target.value))}><option value="1">1 season</option><option value="12">12 seasons</option><option value="32">32 seasons</option></select></label></div>
      <p className="text-xs text-muted-foreground">The franchise sets conference and schedule context. Results are game simulations using observed statistical proxies, not calibrated NBA forecasts.</p>
      <div className="flex flex-wrap gap-2"><button type="button" disabled={!rotationValid(slots, picks)} onClick={runSeason} className="min-h-11 rounded-lg bg-primary px-6 text-sm font-semibold text-primary-foreground disabled:opacity-40"><Play className="mr-2 inline h-4 w-4" />Simulate season</button><ForgeSaveButton payload={payload} /></div>
    </div>}
    {phase === 'simulating' && <div className="court-panel p-10 text-center" role="status"><Loader2 className="mx-auto h-8 w-8 animate-spin text-gold" /><p className="mt-4 font-display text-2xl">SIMULATING {repeats} SEASONS</p><p className="mt-2 text-xs text-muted-foreground">82 games per team, Play-In and playoffs. You can restart while this runs.</p></div>}
    {phase === 'complete' && result && <ForgeTeamResult result={result} onRerun={() => { const next = newForgeSeed(); setSeed(next); runSeason(next); }} onNewDraft={restart} onEdit={() => setPhase('ready')} shareEncode={() => forgeBuildQuery(payload)} />}
  </section>;
}
