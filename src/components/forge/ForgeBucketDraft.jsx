import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Eye, EyeOff, Lock, Loader2, Play, RefreshCcw } from 'lucide-react';
import confetti from 'canvas-confetti';

import { SKILLS, GROUPS } from '@/components/forge/bapSkills';
import { buildForgePool, forgeMax, forgeRanks } from '@/components/forge/forgePool';
import ForgeBuildWheel from '@/components/forge/ForgeBuildWheel';
import ForgeTeamWheel from '@/components/forge/ForgeTeamWheel';
import ForgeOfferCard from '@/components/forge/ForgeOfferCard';
import ForgeOvrMeter from '@/components/forge/ForgeOvrMeter';
import BucketBoard from '@/components/forge/BucketBoard';
import BucketSummary from '@/components/forge/BucketSummary';
import ForgeLeagueTour from '@/components/forge/ForgeLeagueTour';
import { Image } from '@/components/ui/image';

// Wheel draft, strictly single-player keep-and-respin: the wheel rolls an
// attribute, you lock the roll (or re-roll freely), then the final spin lands
// a donor team and offers ONE player-season from that roster — keep it or burn
// one of three respins. Nine attributes, then the composite tours the league.
const RESPIN_COUNT = 3;
const SILHOUETTE = 'https://media.base44.com/images/public/6abc41d86dabd382371f49ea/d00d11c89_generated_image.png';

export default function ForgeBucketDraft({ source, league }) {
  const allPool = useMemo(() => buildForgePool(source), [source]);
  const [group, setGroup] = useState('Guard');
  const [showGrades, setShowGrades] = useState(false);
  const [phase, setPhase] = useState('setup');
  const [picks, setPicks] = useState({});
  const [rolledKey, setRolledKey] = useState(null);
  const [lockedKey, setLockedKey] = useState(null);
  const [activeTeam, setActiveTeam] = useState(null);
  const [offer, setOffer] = useState(null);
  const [rolling, setRolling] = useState(false);
  const [teamSpinning, setTeamSpinning] = useState(false);
  const [teamRotation, setTeamRotation] = useState(0);
  const [respins, setRespins] = useState(RESPIN_COUNT);
  const rollTimer = useRef(null);
  const teamTimer = useRef(null);

  const pool = useMemo(() => {
    const active = GROUPS.find(item => item.key === group) || GROUPS[0];
    return allPool.filter(player => player.positions.some(code => active.codes.includes(code)));
  }, [allPool, group]);
  const leagueMax = useMemo(() => forgeMax(pool), [pool]);
  const withRanks = useMemo(() => {
    const ranks = forgeRanks(pool);
    return new Map(pool.map(player => [player.playerRef, Object.fromEntries(SKILLS.map(({ key }) => [key, ranks[key].get(player.playerRef)]))]));
  }, [pool]);

  const wheelTeams = useMemo(() => {
    const present = new Set(pool.map(player => player.teamCode));
    const teams = (league.teams || []).filter(team => present.has(team.code));
    return teams.length ? teams : league.teams || [];
  }, [league, pool]);

  const offerFromTeam = team => {
    const roster = pool.filter(player => player.teamCode === team.code);
    if (!roster.length) return null;
    const player = roster[Math.floor(Math.random() * roster.length)];
    return { ...player, ranks: withRanks.get(player.playerRef) };
  };

  // Stage 1 — the wheel rolls an attribute (free re-rolls until locked).
  const roll = () => {
    if (rolling || lockedKey) return;
    const open = SKILLS.filter(skill => !picks[skill.key]);
    if (!open.length || !pool.length) return;
    const target = open[Math.floor(Math.random() * open.length)];
    setRolledKey(null); setOffer(null); setActiveTeam(null); setRolling(true);
    rollTimer.current = window.setTimeout(() => { setRolling(false); setRolledKey(target.key); }, 1000);
  };
  useEffect(() => () => { window.clearTimeout(rollTimer.current); window.clearTimeout(teamTimer.current); }, []);

  const lockRoll = () => {
    if (!rolledKey || rolling || lockedKey) return;
    setLockedKey(rolledKey);
  };

  const reroll = () => {
    if (!rolledKey || rolling || lockedKey) return;
    setRolledKey(null);
    roll();
  };

  // Stage 2 — the final spin for team and player.
  const spinTeam = () => {
    if (teamSpinning || !lockedKey || !wheelTeams.length) return;
    const target = wheelTeams[Math.floor(Math.random() * wheelTeams.length)];
    setOffer(null); setActiveTeam(null); setTeamSpinning(true);
    const index = wheelTeams.indexOf(target);
    const chipAngle = index * (360 / wheelTeams.length);
    const current = ((teamRotation % 360) + 360) % 360;
    let delta = (360 - chipAngle - current) % 360;
    if (delta < 0) delta += 360;
    setTeamRotation(teamRotation + 1440 + delta + (Math.random() * 20 - 10));
    teamTimer.current = window.setTimeout(() => {
      setTeamSpinning(false); setActiveTeam(target);
      setOffer(offerFromTeam(target));
    }, 1000);
  };

  const start = () => { setPicks({}); setRolledKey(null); setLockedKey(null); setActiveTeam(null); setOffer(null); setRolling(false); setTeamSpinning(false); setRespins(RESPIN_COUNT); setPhase('drafting'); };

  const keep = () => {
    if (!offer || !lockedKey) return;
    const next = { ...picks, [lockedKey]: { player: offer, value: offer[lockedKey] || 0 } };
    setPicks(next); setOffer(null); setRolledKey(null); setLockedKey(null); setActiveTeam(null);
    if (Object.keys(next).length >= SKILLS.length) {
      setPhase('complete');
      confetti({ particleCount: 160, spread: 85, origin: { y: 0.6 }, colors: ['#E9B949','#3E63DD','#D63A4B'] });
    }
  };

  const respinPlayer = () => {
    if (!respins || teamSpinning || !offer || !activeTeam) return;
    setRespins(respins - 1);
    let next = offerFromTeam(activeTeam);
    let guard = 0;
    while (next && next.playerRef === offer.playerRef && guard++ < 12) next = offerFromTeam(activeTeam);
    setOffer(next || offer);
  };

  const undo = key => {
    const next = { ...picks };
    delete next[key];
    setPicks(next); setOffer(null); setRolledKey(null); setLockedKey(null); setActiveTeam(null); setPhase('drafting');
  };

  const filled = SKILLS.filter(skill => picks[skill.key]).length;
  const rolledSkill = SKILLS.find(skill => skill.key === rolledKey) || null;
  const lockedSkill = SKILLS.find(skill => skill.key === lockedKey) || null;
  const liveOvr = useMemo(() => {
    const rows = SKILLS.filter(skill => picks[skill.key]);
    if (!rows.length) return null;
    return Math.round(rows.reduce((sum, skill) => sum + Math.min(100, picks[skill.key].value / leagueMax[skill.key] * 100), 0) / rows.length);
  }, [picks, leagueMax]);
  const overall = useMemo(() => (filled >= SKILLS.length ? liveOvr : null), [liveOvr, filled]);

  return <section aria-label="Bucket draft game" className="space-y-4">
    {phase === 'setup' && <div className="court-panel court-panel-hover p-6">
      <div className="relative mx-auto max-w-xl text-center">
        <div className="absolute inset-x-10 top-4 bottom-12 rounded-full" style={{ background:'radial-gradient(circle, hsl(var(--court-accent) / 0.14), transparent 70%)' }} />
        <Image src={SILHOUETTE} alt="" fittingType="fit" className="relative mx-auto w-52" />
        <p className="court-kicker relative mt-3">Bucket draft</p>
        <h2 className="relative mt-1 font-display text-3xl">FORGE A PLAYER FROM REAL SEASONS</h2>
        <p className="relative mt-3 text-sm leading-relaxed text-muted-foreground">Roll the wheel for an attribute, lock the skill, then the final spin lands a team and offers one player-season — keep it or respin. {pool.length} {group.toLowerCase()} seasons in the pool.</p>
      </div>
      <div className="mt-4 flex justify-center gap-2">
        {GROUPS.map(item => <button key={item.key} type="button" onClick={() => setGroup(item.key)} className={`rounded-lg border px-4 py-2 text-xs font-semibold uppercase tracking-wider transition-colors ${group === item.key ? 'border-gold/60 bg-gold/10 text-gold' : 'border-border/30 text-muted-foreground hover:border-gold/40'}`}>{item.key} <span className="font-mono opacity-70">{item.hint}</span></button>)}
      </div>
      <div className="mt-4 flex flex-wrap justify-center gap-2">{SKILLS.map((skill, index) => <span key={skill.key} className={`rounded-lg border px-3 py-1.5 text-[11px] ${index % 4 === 0 ? 'border-gold/30 text-gold' : index % 4 === 1 ? 'border-royal/40 text-royal' : index % 4 === 2 ? 'border-trim/30 text-trim' : 'border-positive/30 text-positive'}`}>{skill.label} <span className="font-mono opacity-80">{skill.metric}</span></span>)}</div>
      <div className="mt-5 text-center"><button type="button" onClick={start} disabled={!pool.length} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-8 text-sm font-semibold uppercase tracking-wider text-primary-foreground transition-all hover:translate-y-px hover:bg-goldSoft disabled:cursor-not-allowed disabled:opacity-40"><Play className="h-4 w-4" />Start drafting</button></div>
    </div>}
    {phase === 'drafting' && <div className="court-panel p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><p className="court-kicker">Bucket draft · {group}</p><h2 className="mt-1 font-display text-2xl">ROLL · LOCK · SPIN · KEEP</h2><p className="mt-1 text-xs text-muted-foreground">Roll a skill and lock it, then the final spin lands team and player. {SKILLS.length - filled} of {SKILLS.length} slots open.</p></div>
        <button type="button" onClick={() => setShowGrades(value => !value)} className="flex min-h-9 items-center gap-2 rounded-lg border border-border/30 px-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground transition-colors hover:border-gold/40 hover:text-gold">{showGrades ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}{showGrades ? 'Grades on' : 'Grades off'}</button>
      </div>
      <div className="mt-5 grid items-start gap-5 lg:grid-cols-[minmax(0,23rem),minmax(0,1fr)]">
        <div className="space-y-3">
          <ForgeBuildWheel picks={picks} leagueMax={leagueMax} overall={liveOvr} selectedKey={lockedKey || rolledKey} spinning={rolling} />
          {lockedKey ? null : rolledKey ? <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={lockRoll} disabled={rolling} className="flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-3 text-xs font-semibold uppercase tracking-wider text-primary-foreground transition-all hover:bg-goldSoft disabled:cursor-not-allowed disabled:opacity-40"><Lock className="h-4 w-4" />{rolledSkill ? `Lock · ${rolledSkill.label}` : 'Lock roll'}</button>
            <button type="button" onClick={reroll} disabled={rolling} className="flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border/40 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground transition-colors hover:border-gold/40 hover:text-gold disabled:cursor-not-allowed disabled:opacity-40"><RefreshCcw className="h-4 w-4" />Re-roll</button>
          </div> : <button type="button" onClick={roll} disabled={rolling} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 text-xs font-semibold uppercase tracking-wider text-primary-foreground transition-all hover:bg-goldSoft disabled:cursor-not-allowed disabled:opacity-40">{rolling ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}{rolling ? 'Rolling…' : 'Roll the skill'}</button>}
          <ForgeOvrMeter overall={liveOvr} filled={filled} total={SKILLS.length} showGrades={showGrades} />
        </div>
        <div className="space-y-3">
          {lockedSkill ? <>
            <p className="text-xs text-muted-foreground"><span className="font-semibold text-gold">{lockedSkill.label}</span> locked · spin the wheel for the donor team and player.</p>
            <ForgeTeamWheel teams={wheelTeams} rotation={teamRotation} spinning={teamSpinning} onSpin={spinTeam} landedCode={activeTeam?.code || null} />
            {offer ? <ForgeOfferCard key={offer.playerRef} offer={offer} skill={lockedSkill} leagueMax={leagueMax} onKeep={keep} onRespin={respinPlayer} respins={respins} showGrades={showGrades} />
              : <div className="flex items-center gap-3 rounded-xl border border-dashed border-border/30 bg-canvas/30 p-5 text-sm text-muted-foreground">{teamSpinning ? <><Loader2 className="h-5 w-5 animate-spin text-gold" />The wheel is choosing the team and player…</> : <>Spin the wheel to offer a player from the landed team.</>}</div>}
          </>
            : <div className="flex items-center gap-3 rounded-xl border border-dashed border-border/30 bg-canvas/30 p-5 text-sm text-muted-foreground">Roll the attribute wheel, lock a skill, and the final spin for team and player unlocks.</div>}
        </div>
      </div>
      <div className="mt-5">
        <BucketBoard buckets={SKILLS} picks={picks} activeKey={lockedKey || rolledKey} onUndo={undo} complete={false} leagueMax={leagueMax} showGrades={showGrades} />
      </div>
    </div>}
    {phase === 'complete' && <div className="space-y-4">
      <BucketBoard buckets={SKILLS} picks={picks} activeKey={null} onUndo={undo} complete leagueMax={leagueMax} showGrades={showGrades} />
      <BucketSummary buckets={SKILLS} picks={picks} overall={overall} leagueMax={leagueMax} onRestart={start} />
      <ForgeLeagueTour league={league} buckets={SKILLS} picks={picks} />
    </div>}
  </section>;
}