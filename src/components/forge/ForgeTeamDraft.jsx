import React, { useEffect, useMemo, useRef, useState } from 'react';
import confetti from 'canvas-confetti';
import { Loader2, Play } from 'lucide-react';
import PlayerPortrait from '@/components/players/PlayerPortrait';
import { buildForgePool } from '@/components/forge/forgePool';
import { decodeForgeBuild, forgeBuildQuery } from '@/components/forge/forgeReceipt';
import { simulateForgeSeason } from '@/components/forge/forgeTeamSim';
import ForgeTeamSpinPanel from '@/components/forge/ForgeTeamSpinPanel';
import ForgeTeamPickPanel from '@/components/forge/ForgeTeamPickPanel';
import ForgePlayerShowcase from '@/components/forge/ForgePlayerShowcase';
import ForgeRosterBoard from '@/components/forge/ForgeRosterBoard';
import ForgeTeamBoard from '@/components/forge/ForgeTeamBoard';
import ForgeTeamResult from '@/components/forge/ForgeTeamResult';

export const TEAM_SLOTS = [
  { key:'PG', label:'PG', starter:true, minutes:34 },
  { key:'SG', label:'SG', starter:true, minutes:33 },
  { key:'SF', label:'SF', starter:true, minutes:32 },
  { key:'PF', label:'PF', starter:true, minutes:31 },
  { key:'C', label:'C', starter:true, minutes:30 },
  { key:'bench1', label:'BENCH 1', minutes:22 },
  { key:'bench2', label:'BENCH 2', minutes:18 },
  { key:'bench3', label:'BENCH 3', minutes:15 },
];

const TEAM_RESPINS = 2;
const PLAYER_RESPINS = 3;
const SPIN_MS = 1250;
const FAST_AFTER_SPINS = 8;

// Team Forge · 98-0: spin for a player every round, choose where they slot
// into the eight-man rotation, then simulate the season and chase perfection.
export default function ForgeTeamDraft({ source, league, pickMode = false, pool: poolProp }) {
  // Shared season pool from the Forge Lab level — no re-derivation per mode.
  const allPool = useMemo(() => poolProp || buildForgePool(source), [poolProp, source]);
  const [boot] = useState(() => {
    const shared = decodeForgeBuild(window.location.search);
    return shared?.mode === (pickMode ? 'teamPick' : 'team') ? shared : null;
  });
  const [phase, setPhase] = useState('setup');
  const [picks, setPicks] = useState({});
  const [reveal, setReveal] = useState(null);
  const [spinning, setSpinning] = useState(false);
  const [teamSpin, setTeamSpin] = useState({ token:0, targetKey:null });
  const [playerSpin, setPlayerSpin] = useState({ token:0, targetKey:null });
  const [activeTeam, setActiveTeam] = useState(null);
  const [teamRespins, setTeamRespins] = useState(TEAM_RESPINS);
  const [playerRespins, setPlayerRespins] = useState(PLAYER_RESPINS);
  const [result, setResult] = useState(null);
  const timer = useRef(null);
  const spinCount = useRef(0);

  const draftedRefs = useMemo(() => new Set(Object.values(picks).map(pick => pick.player.playerRef)), [picks]);

  const rosters = useMemo(() => {
    const map = new Map();
    for (const player of allPool) {
      const list = map.get(player.teamCode) || [];
      list.push(player);
      map.set(player.teamCode, list);
    }
    return map;
  }, [allPool]);
  const wheelTeams = useMemo(() => {
    const present = new Set(allPool.map(player => player.teamCode));
    return (league.teams || []).filter(team => present.has(team.code));
  }, [league, allPool]);
  const playerItems = useMemo(() => (activeTeam ? (rosters.get(activeTeam.code) || []).filter(player => !draftedRefs.has(player.playerRef)) : allPool.slice(0, 24)), [activeTeam, rosters, draftedRefs, allPool]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  // Shared build: a ?build= link restores the locked rotation once the season
  // pool is available; the recipient re-runs the season sim on their side.
  useEffect(() => {
    if (!boot || !allPool.length) return;
    const byRef = new Map(allPool.map(player => [player.playerRef, player]));
    const restored = {};
    for (const [slotKey, pick] of Object.entries(boot.picks)) {
      const player = byRef.get(pick.playerRef);
      if (player) restored[slotKey] = { player };
    }
    if (TEAM_SLOTS.every(slot => restored[slot.key])) {
      setPicks(restored);
      setPhase('ready');
    }
  }, [boot, allPool]);

  // A locked rotation lives in the URL, so copying the page link shares it.
  useEffect(() => {
    if (phase !== 'ready' || !TEAM_SLOTS.every(slot => picks[slot.key])) return;
    const payload = {};
    for (const slot of TEAM_SLOTS) if (picks[slot.key]) payload[slot.key] = [picks[slot.key].player.playerRef];
    window.history.replaceState(null, '', `${window.location.pathname}?${forgeBuildQuery({ mode: pickMode ? 'teamPick' : 'team', picks: payload })}`);
  }, [phase, picks, pickMode]);

  const available = code => (rosters.get(code) || []).filter(player => !draftedRefs.has(player.playerRef));

  const spin = (freshTeam, spend) => {
    if (spinning) return;
    spinCount.current += 1;
    if (spend === 'team' && !teamRespins) return;
    if (spend === 'player' && !playerRespins) return;
    if (pickMode && spend === 'player') return;
    let team = activeTeam;
    const needTeam = freshTeam || spend === 'team' || !team || !available(team.code).length;
    if (needTeam) {
      const options = wheelTeams.filter(item => available(item.code).length);
      if (!options.length) return;
      team = options[Math.floor(Math.random() * options.length)];
    }
    if (pickMode) {
      setActiveTeam(team);
      setReveal(null);
      setTeamSpin(value => ({ token:value.token + 1, targetKey:team.code }));
      setSpinning(true);
      timer.current = window.setTimeout(() => setSpinning(false), SPIN_MS);
      return;
    }
    const roster = available(team.code);
    const player = roster[Math.floor(Math.random() * roster.length)];
    if (spend === 'team') setTeamRespins(value => value - 1);
    if (spend === 'player') setPlayerRespins(value => value - 1);
    setActiveTeam(team);
    setReveal(null);
    if (needTeam) setTeamSpin(value => ({ token:value.token + 1, targetKey:team.code }));
    setPlayerSpin(value => ({ token:value.token + 1, targetKey:player.playerRef }));
    setSpinning(true);
    timer.current = window.setTimeout(() => { setSpinning(false); setReveal(player); }, SPIN_MS);
  };

  const selectPlayer = player => {
    if (!spinning) setReveal(player);
  };

  const filled = TEAM_SLOTS.filter(slot => picks[slot.key]).length;

  const assign = slotKey => {
    if (!reveal || picks[slotKey]) return;
    const next = { ...picks, [slotKey]: { player: reveal } };
    setPicks(next);
    setReveal(null);
    if (TEAM_SLOTS.every(slot => next[slot.key])) setPhase('ready');
  };

  const runSeason = nextPicks => {
    setPhase('simulating');
    timer.current = window.setTimeout(() => {
      const sim = simulateForgeSeason({ league, pool: allPool, picks: nextPicks, slots: TEAM_SLOTS, seed: Math.floor(Math.random() * 2 ** 31) });
      setResult(sim);
      setPhase('complete');
      if (sim.perfect) confetti({ particleCount: 240, spread: 100, origin: { y: 0.55 }, colors: ['#E9B949','#3E63DD','#D63A4B'] });
    }, 900);
  };

  const rerun = () => runSeason(picks);

  const reset = () => {
    setPicks({});
    setReveal(null);
    setSpinning(false);
    setActiveTeam(null);
    setResult(null);
    setTeamSpin({ token:0, targetKey:null });
    setPlayerSpin({ token:0, targetKey:null });
    setTeamRespins(TEAM_RESPINS);
    setPlayerRespins(PLAYER_RESPINS);
  };
  const start = () => { reset(); setPhase('drafting'); };
  const newDraft = () => { reset(); setPhase('setup'); };

  const revealNote = reveal ? `${TEAM_SLOTS.length - filled} open spots · tap one to place them` : null;

  return <section aria-label="Team forge game" className="space-y-4">
    {phase === 'setup' && <div className="court-panel court-panel-hover p-6">
      <div className="mx-auto max-w-xl text-center">
        <p className="bcast-kicker">98-0 chase</p>
        <h2 className="broadcast-gradient-text mt-1 font-display text-3xl">SPIN · PLACE · CHASE 98-0</h2>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{pickMode ? 'Spin the reel for a random team, then choose any player from their roster and tap an open rotation spot to place them.' : 'Spin the reels for a random team and player, then tap any open rotation spot to place them.'} Fill the five starter slots and three bench spots — then simulate the full 82-game season and playoff bracket. A flawless regular season plus a perfect title run is <span className="font-semibold text-gold">98-0</span>. {pickMode ? 'Two team respins per draft.' : 'Two team respins and three player respins per draft.'}</p>
      </div>
      <div className="mx-auto mt-4 grid max-w-lg grid-cols-5 gap-1.5">
        {TEAM_SLOTS.map(slot => <span key={slot.key} className={`rounded-lg border px-1 py-1.5 text-center font-mono text-[10px] ${slot.starter ? 'border-gold/30 text-gold' : 'border-border/30 text-muted-foreground'}`}>{slot.label}</span>)}
      </div>
      <p className="mt-3 text-center text-xs text-muted-foreground">{allPool.length} player seasons in the pool</p>
      <div className="mt-5 text-center"><button type="button" onClick={start} disabled={!allPool.length} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-8 text-sm font-semibold uppercase tracking-wider text-primary-foreground transition-all hover:translate-y-px hover:bg-goldSoft disabled:cursor-not-allowed disabled:opacity-40"><Play className="h-4 w-4" />Start the draft</button></div>
    </div>}
    {phase === 'drafting' && <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,19rem),minmax(0,1fr)]">
        {pickMode ? <ForgeTeamPickPanel
          teamItems={wheelTeams} teamSpin={teamSpin} spinning={spinning}
          activeTeam={activeTeam}
          onSpin={() => spin(true, null)} onRespinTeam={() => spin(true, 'team')}
          teamRespins={teamRespins} filled={filled} total={TEAM_SLOTS.length}
          pending={Boolean(reveal)}
        /> : <ForgeTeamSpinPanel
          teamItems={wheelTeams} playerItems={playerItems}
          teamSpin={teamSpin} playerSpin={playerSpin} spinning={spinning}
          fast={spinCount.current > FAST_AFTER_SPINS}
          onSpin={() => spin(true, null)} onRespinTeam={() => spin(true, 'team')} onRespinPlayer={() => spin(false, 'player')}
          teamRespins={teamRespins} playerRespins={playerRespins}
          filled={filled} total={TEAM_SLOTS.length}
          pending={Boolean(reveal)}
        />}
        {pickMode
          ? <div className="space-y-4">
              <ForgeRosterBoard team={activeTeam} roster={activeTeam ? available(activeTeam.code) : []} selectedRef={reveal ? reveal.playerRef : null} onPick={selectPlayer} />
              <ForgeTeamBoard slots={TEAM_SLOTS} picks={picks} reveal={reveal} revealPositions={reveal?.positions || []} spinning={spinning} onAssign={assign} />
            </div>
          : <ForgeTeamBoard slots={TEAM_SLOTS} picks={picks} reveal={reveal} revealPositions={reveal?.positions || []} spinning={spinning} onAssign={assign} />}
      </div>
      {!pickMode && <ForgePlayerShowcase player={reveal} note={revealNote} />}
    </div>}
    {phase === 'ready' && <div className="court-panel relative overflow-hidden p-6">
      <span className="bcast-watermark" aria-hidden="true">LOCKED</span>
      <div className="relative text-center">
        <p className="bcast-kicker">Roster complete</p>
        <h2 className="mt-1 font-display text-3xl">REVIEW YOUR ROTATION</h2>
        <p className="mt-2 text-sm text-muted-foreground">All eight spots are filled. Release anyone to rearrange, or lock in and run the 82-game season plus playoff bracket.</p>
        <div className="mx-auto mt-4 grid max-w-2xl grid-cols-2 gap-2 sm:grid-cols-4">
          {TEAM_SLOTS.map(slot => <div key={slot.key} className="flex items-center gap-2 rounded-xl border border-border/25 bg-raised/40 p-2 text-left">
            <PlayerPortrait player={picks[slot.key].player} className="h-9 w-9" />
            <div className="min-w-0"><p className="truncate text-[11px] font-bold leading-tight">{picks[slot.key].player.name}</p><p className="font-mono text-[9px] text-muted-foreground">{slot.label}</p></div>
          </div>)}
        </div>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <button type="button" onClick={() => runSeason(picks)} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-8 text-sm font-semibold uppercase tracking-wider text-primary-foreground transition-all hover:bg-goldSoft"><Play className="h-4 w-4" />Simulate the season</button>
          <button type="button" onClick={() => setPhase('drafting')} className="inline-flex min-h-11 items-center rounded-lg border border-border/30 px-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground transition-colors hover:border-gold/40 hover:text-gold">Adjust rotation</button>
        </div>
      </div>
    </div>}
    {phase === 'simulating' && <div className="court-panel p-10 text-center">
      <Loader2 className="mx-auto h-8 w-8 animate-spin text-gold" />
      <p className="mt-4 font-display text-2xl tracking-wide">SIMULATING THE SEASON</p>
      <p className="mt-2 text-sm text-muted-foreground">82 regular-season games, then the playoff bracket…</p>
    </div>}
    {phase === 'complete' && result && <ForgeTeamResult result={result} onRerun={rerun} onNewDraft={newDraft} shareEncode={() => {
      const payload = {};
      for (const slot of TEAM_SLOTS) if (picks[slot.key]) payload[slot.key] = [picks[slot.key].player.playerRef];
      return forgeBuildQuery({ mode: pickMode ? 'teamPick' : 'team', picks: payload });
    }} />}
  </section>;
}