import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Eye, EyeOff, Loader2, Play } from 'lucide-react';
import confetti from 'canvas-confetti';

import { SKILLS, GROUPS } from '@/components/forge/bapSkills';
import BuildWheel from '@/components/forge/BuildWheel';
import ForgeOfferCard from '@/components/forge/ForgeOfferCard';
import ForgeOvrMeter from '@/components/forge/ForgeOvrMeter';
import BucketBoard from '@/components/forge/BucketBoard';
import BucketSummary from '@/components/forge/BucketSummary';
import ForgeLeagueTour from '@/components/forge/ForgeLeagueTour';
import { Image } from '@/components/ui/image';

// Build-A-Bucket style draft over the observed season pool: pick Guard or Big,
// the wheel picks an open attribute, a single player-season is offered, and you
// keep it or burn a limited respin. Nine attributes, then the composite tours
// the league.
const RESPIN_COUNT = 3;
const SILHOUETTE = 'https://media.base44.com/images/public/6abc41d86dabd382371f49ea/d00d11c89_generated_image.png';

export default function ForgeBucketDraft({ source, league }) {
  const allPool = useMemo(() => (source.blueprintRows || [])
    .filter(row => row.phase === 'regular' && row.observed && row.games >= 15 && row.minutes >= 300)
    .map(row => {
      const m = row.metrics || {};
      const value = metric => (Number.isFinite(metric?.value) ? metric.value : 0);
      const player = {
        playerRef: row.playerRef, name: row.displayName, teamCode: row.teamCode,
        positions: row.positions || [], headshotPath: row.headshotPath || null,
        games: row.games, minutes: row.minutes,
        pts: value(m.pointsPerGame), ast: value(m.assistsPerGame), reb: value(m.reboundsPerGame), mpg: value(m.minutesPerGame),
      };
      for (const skill of SKILLS) {
        player[skill.key] = skill.key === 'perimeterD'
          ? value(m.stealsPer36) + value(m.blocksPer36)
          : value(m[skill.metricKey]);
      }
      return player;
    }), [source]);

  const [group, setGroup] = useState('Guard');
  const [showGrades, setShowGrades] = useState(false);
  const [phase, setPhase] = useState('setup');
  const [picks, setPicks] = useState({});
  const [activeKey, setActiveKey] = useState(null);
  const [offer, setOffer] = useState(null);
  const [spinning, setSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [respins, setRespins] = useState(RESPIN_COUNT);
  const timer = useRef(null);

  const pool = useMemo(() => {
    const active = GROUPS.find(item => item.key === group) || GROUPS[0];
    return allPool.filter(player => player.positions.some(code => active.codes.includes(code)));
  }, [allPool, group]);

  const leagueMax = useMemo(() => Object.fromEntries(SKILLS.map(({ key }) => [key, pool.length ? Math.max(...pool.map(player => player[key] || 0)) : 0])), [pool]);
  const ranks = useMemo(() => Object.fromEntries(SKILLS.map(({ key }) => {
    const sorted = [...pool].sort((a, b) => (b[key] || 0) - (a[key] || 0));
    return [key, new Map(sorted.map((player, index) => [player.playerRef, index + 1]))];
  })), [pool]);
  const withRanks = useMemo(() => new Map(pool.map(player => [player.playerRef, Object.fromEntries(SKILLS.map(({ key }) => [key, ranks[key].get(player.playerRef)]))])), [pool, ranks]);

  const drawOffer = () => pool[Math.floor(Math.random() * pool.length)] || null;

  const spin = () => {
    if (spinning) return;
    const open = SKILLS.filter(skill => !picks[skill.key]);
    if (!open.length || !pool.length) return;
    const target = open[Math.floor(Math.random() * open.length)];
    setOffer(null); setActiveKey(null); setSpinning(true);
    const chipAngle = SKILLS.indexOf(target) * (360 / SKILLS.length);
    const current = ((rotation % 360) + 360) % 360;
    let delta = (360 - chipAngle - current) % 360;
    if (delta < 0) delta += 360;
    setRotation(rotation + 1440 + delta + (Math.random() * 20 - 10));
    timer.current = window.setTimeout(() => {
      setSpinning(false); setActiveKey(target.key);
      const player = drawOffer();
      setOffer(player ? { ...player, ranks: withRanks.get(player.playerRef) } : null);
    }, 1000);
  };
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const start = () => { setPicks({}); setActiveKey(null); setOffer(null); setSpinning(false); setRespins(RESPIN_COUNT); setPhase('drafting'); };

  const keep = () => {
    if (!offer || !activeKey) return;
    const next = { ...picks, [activeKey]: { player: offer, value: offer[activeKey] || 0 } };
    setPicks(next); setOffer(null); setActiveKey(null);
    if (Object.keys(next).length >= SKILLS.length) {
      setPhase('complete');
      confetti({ particleCount: 160, spread: 85, origin: { y: 0.6 }, colors: ['#E9B949','#3E63DD','#D63A4B'] });
    }
  };

  const respin = () => {
    if (!respins || spinning || !offer) return;
    setRespins(respins - 1);
    let player = drawOffer();
    if (pool.length > 1) { let guard = 0; while (player.playerRef === offer.playerRef && guard++ < 12) player = drawOffer(); }
    setOffer({ ...player, ranks: withRanks.get(player.playerRef) });
  };

  const undo = key => {
    const next = { ...picks };
    delete next[key];
    setPicks(next); setOffer(null); setActiveKey(null); setPhase('drafting');
  };

  const filled = SKILLS.filter(skill => picks[skill.key]).length;
  const activeSkill = SKILLS.find(skill => skill.key === activeKey) || null;
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
        <p className="relative mt-3 text-sm leading-relaxed text-muted-foreground">Spin the wheel of real player-seasons and keep an aspect of their game until you have a complete custom player. {pool.length} {group.toLowerCase()} seasons in the pool.</p>
      </div>
      <div className="mt-4 flex justify-center gap-2">
        {GROUPS.map(item => <button key={item.key} type="button" onClick={() => setGroup(item.key)} className={`rounded-lg border px-4 py-2 text-xs font-semibold uppercase tracking-wider transition-colors ${group === item.key ? 'border-gold/60 bg-gold/10 text-gold' : 'border-border/30 text-muted-foreground hover:border-gold/40'}`}>{item.key} <span className="font-mono opacity-70">{item.hint}</span></button>)}
      </div>
      <div className="mt-4 flex flex-wrap justify-center gap-2">{SKILLS.map((skill, index) => <span key={skill.key} className={`rounded-lg border px-3 py-1.5 text-[11px] ${index % 4 === 0 ? 'border-gold/30 text-gold' : index % 4 === 1 ? 'border-royal/40 text-royal' : index % 4 === 2 ? 'border-trim/30 text-trim' : 'border-positive/30 text-positive'}`}>{skill.label} <span className="font-mono opacity-80">{skill.metric}</span></span>)}</div>
      <div className="mt-5 text-center"><button type="button" onClick={start} disabled={!pool.length} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-8 text-sm font-semibold uppercase tracking-wider text-primary-foreground transition-all hover:translate-y-px hover:bg-goldSoft disabled:cursor-not-allowed disabled:opacity-40"><Play className="h-4 w-4" />Start drafting</button></div>
    </div>}
    {phase === 'drafting' && <div className="court-panel p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><p className="court-kicker">Bucket draft · {group}</p><h2 className="mt-1 font-display text-2xl">SPIN · KEEP · BUILD</h2><p className="mt-1 text-xs text-muted-foreground">Spin to open an attribute, keep or respin the offered player-season. {SKILLS.length - filled} of {SKILLS.length} slots open.</p></div>
        <button type="button" onClick={() => setShowGrades(value => !value)} className="flex min-h-9 items-center gap-2 rounded-lg border border-border/30 px-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground transition-colors hover:border-gold/40 hover:text-gold">{showGrades ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}{showGrades ? 'Grades on' : 'Grades off'}</button>
      </div>
      <div className="mt-5 grid items-start gap-5 lg:grid-cols-[minmax(0,21rem),minmax(0,1fr)]">
        <BuildWheel skills={SKILLS} picks={picks} activeKey={activeKey} leagueMax={leagueMax} rotation={rotation} spinning={spinning} onSpin={spin} showGrades={showGrades} />
        <div className="space-y-3">
          <ForgeOvrMeter overall={liveOvr} filled={filled} total={SKILLS.length} showGrades={showGrades} />
          {offer && activeSkill ? <ForgeOfferCard offer={offer} skill={activeSkill} leagueMax={leagueMax} onKeep={keep} onRespin={respin} respins={respins} showGrades={showGrades} />
            : <div className="flex items-center gap-3 rounded-xl border border-dashed border-border/30 bg-canvas/30 p-5 text-sm text-muted-foreground">{spinning ? <><Loader2 className="h-5 w-5 animate-spin text-gold" />The wheel is choosing an attribute…</> : <>Spin the wheel to offer a player for the next attribute.</>}</div>}
          <BucketBoard buckets={SKILLS} picks={picks} activeKey={activeKey} onUndo={undo} complete={false} leagueMax={leagueMax} showGrades={showGrades} />
        </div>
      </div>
    </div>}
    {phase === 'complete' && <div className="space-y-4">
      <BucketBoard buckets={SKILLS} picks={picks} activeKey={null} onUndo={undo} complete leagueMax={leagueMax} showGrades={showGrades} />
      <BucketSummary buckets={SKILLS} picks={picks} overall={overall} leagueMax={leagueMax} onRestart={start} />
      <ForgeLeagueTour league={league} buckets={SKILLS} picks={picks} />
    </div>}
  </section>;
}