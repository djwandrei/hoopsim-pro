import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Eye, EyeOff, Loader2, Play, Users } from 'lucide-react';
import confetti from 'canvas-confetti';

import { SKILLS, GROUPS } from '@/components/forge/bapSkills';
import { buildForgePool, forgeMax, forgeRanks } from '@/components/forge/forgePool';
import ForgeSkillSelect from '@/components/forge/ForgeSkillSelect';
import ForgeBuildWheel from '@/components/forge/ForgeBuildWheel';
import ForgeTeamWheel from '@/components/forge/ForgeTeamWheel';
import ForgeOvrMeter from '@/components/forge/ForgeOvrMeter';
import BucketBoard from '@/components/forge/BucketBoard';
import BucketSummary from '@/components/forge/BucketSummary';
import ForgeLeagueTour from '@/components/forge/ForgeLeagueTour';
import ForgeOfferCard from '@/components/forge/ForgeOfferCard';

// Second draft mode: the player selects the skill, spins the wheel for the
// donor team, then keeps or respins the offered player from that roster.
const RESPIN_COUNT = 3;

export default function ForgePickDraft({ source, league }) {
  const allPool = useMemo(() => buildForgePool(source), [source]);
  const [group, setGroup] = useState('Guard');
  const [showGrades, setShowGrades] = useState(false);
  const [phase, setPhase] = useState('setup');
  const [picks, setPicks] = useState({});
  const [selectedKey, setSelectedKey] = useState(null);
  const [activeTeam, setActiveTeam] = useState(null);
  const [offer, setOffer] = useState(null);
  const [spinning, setSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [respins, setRespins] = useState(RESPIN_COUNT);
  const timer = useRef(null);

  const pool = useMemo(() => {
    const active = GROUPS.find(item => item.key === group) || GROUPS[0];
    return allPool.filter(player => player.positions.some(code => active.codes.includes(code)));
  }, [allPool, group]);
  const leagueMax = useMemo(() => forgeMax(pool), [pool]);
  const ranks = useMemo(() => forgeRanks(pool), [pool]);
  const withRanks = useMemo(() => new Map(pool.map(player => [player.playerRef, Object.fromEntries(SKILLS.map(({ key }) => [key, ranks[key].get(player.playerRef)]))])), [pool, ranks]);

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

  const selectSkill = key => {
    if (spinning || picks[key]) return;
    setSelectedKey(key); setOffer(null); setActiveTeam(null);
  };

  const spinTeam = () => {
    if (spinning || !selectedKey || picks[selectedKey] || !wheelTeams.length) return;
    const target = wheelTeams[Math.floor(Math.random() * wheelTeams.length)];
    setOffer(null); setSpinning(true);
    const index = wheelTeams.indexOf(target);
    const chipAngle = index * (360 / wheelTeams.length);
    const current = ((rotation % 360) + 360) % 360;
    let delta = (360 - chipAngle - current) % 360;
    if (delta < 0) delta += 360;
    setRotation(rotation + 1440 + delta + (Math.random() * 20 - 10));
    timer.current = window.setTimeout(() => {
      setSpinning(false); setActiveTeam(target);
      setOffer(offerFromTeam(target));
    }, 1000);
  };
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const start = () => { setPicks({}); setSelectedKey(null); setActiveTeam(null); setOffer(null); setSpinning(false); setRespins(RESPIN_COUNT); setPhase('drafting'); };

  const keep = () => {
    if (!offer || !selectedKey) return;
    const next = { ...picks, [selectedKey]: { player: offer, value: offer[selectedKey] || 0 } };
    setPicks(next); setOffer(null); setSelectedKey(null); setActiveTeam(null);
    if (Object.keys(next).length >= SKILLS.length) {
      setPhase('complete');
      confetti({ particleCount: 160, spread: 85, origin: { y: 0.6 }, colors: ['#E9B949','#3E63DD','#D63A4B'] });
    }
  };

  const respinPlayer = () => {
    if (!respins || spinning || !offer || !activeTeam) return;
    setRespins(respins - 1);
    let next = offerFromTeam(activeTeam);
    let guard = 0;
    while (next && next.playerRef === offer.playerRef && guard++ < 12) next = offerFromTeam(activeTeam);
    setOffer(next || offer);
  };

  const undo = key => {
    const next = { ...picks };
    delete next[key];
    setPicks(next); setOffer(null); setSelectedKey(null); setActiveTeam(null); setPhase('drafting');
  };

  const filled = SKILLS.filter(skill => picks[skill.key]).length;
  const selectedSkill = SKILLS.find(skill => skill.key === selectedKey) || null;
  const liveOvr = useMemo(() => {
    const rows = SKILLS.filter(skill => picks[skill.key]);
    if (!rows.length) return null;
    return Math.round(rows.reduce((sum, skill) => sum + Math.min(100, picks[skill.key].value / leagueMax[skill.key] * 100), 0) / rows.length);
  }, [picks, leagueMax]);
  const overall = useMemo(() => (filled >= SKILLS.length ? liveOvr : null), [liveOvr, filled]);

  return <section aria-label="Pick and spin draft game" className="space-y-4">
    {phase === 'setup' && <div className="court-panel court-panel-hover p-6">
      <p className="court-kicker">Pick &amp; spin draft</p>
      <h2 className="mt-1 font-display text-3xl">PICK THE SKILL · SPIN FOR THE TEAM</h2>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">You choose which attribute to draft next, spin the wheel for a donor team, and the wheel offers one player from that roster — keep them or burn one of {RESPIN_COUNT} respins. Fill all nine slots to forge the composite and tour the league.</p>
      <div className="mt-4 flex gap-2">
        {GROUPS.map(item => <button key={item.key} type="button" onClick={() => setGroup(item.key)} className={`rounded-lg border px-4 py-2 text-xs font-semibold uppercase tracking-wider transition-colors ${group === item.key ? 'border-gold/60 bg-gold/10 text-gold' : 'border-border/30 text-muted-foreground hover:border-gold/40'}`}>{item.key} <span className="font-mono opacity-70">{item.hint}</span></button>)}
      </div>
      <button type="button" onClick={start} disabled={!pool.length} className="mt-5 flex min-h-11 items-center gap-2 rounded-lg bg-primary px-8 text-sm font-semibold uppercase tracking-wider text-primary-foreground transition-all hover:translate-y-px hover:bg-goldSoft disabled:cursor-not-allowed disabled:opacity-40"><Play className="h-4 w-4" />Start drafting</button>
    </div>}
    {phase === 'drafting' && <div className="court-panel p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><p className="court-kicker">Pick &amp; spin draft · {group}</p><h2 className="mt-1 font-display text-2xl">PICK · SPIN · BUILD</h2><p className="mt-1 text-xs text-muted-foreground">Pick a skill, spin for the donor team, keep or respin the offered player. {SKILLS.length - filled} of {SKILLS.length} slots open.</p></div>
        <button type="button" onClick={() => setShowGrades(value => !value)} className="flex min-h-9 items-center gap-2 rounded-lg border border-border/30 px-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground transition-colors hover:border-gold/40 hover:text-gold">{showGrades ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}{showGrades ? 'Grades on' : 'Grades off'}</button>
      </div>
      <div className="mt-5 grid items-start gap-5 lg:grid-cols-[minmax(0,20rem),minmax(0,1fr)]">
        <div className="space-y-3">
          <ForgeSkillSelect picks={picks} selectedKey={selectedKey} onSelect={selectSkill} disabled={spinning} />
          <ForgeBuildWheel picks={picks} leagueMax={leagueMax} overall={liveOvr} selectedKey={selectedKey} />
          <BucketBoard buckets={SKILLS} picks={picks} activeKey={null} onUndo={undo} complete={false} leagueMax={leagueMax} showGrades={showGrades} />
        </div>
        <div className="space-y-3">
          <ForgeOvrMeter overall={liveOvr} filled={filled} total={SKILLS.length} showGrades={showGrades} />
          {selectedSkill ? <p className="text-xs text-muted-foreground"><span className="font-semibold text-gold">{selectedSkill.label}</span> selected · {activeTeam ? `landed ${activeTeam.code} — the offer is in` : spinning ? 'spinning for a team…' : 'spin the wheel for a donor team'}</p> : <p className="text-xs text-muted-foreground">Pick a skill on the left to arm the wheel.</p>}
          <ForgeTeamWheel teams={wheelTeams} rotation={rotation} spinning={spinning} onSpin={spinTeam} disabled={!selectedSkill || Boolean(selectedSkill && picks[selectedKey])} landedCode={activeTeam?.code || null} />
          {offer ? <ForgeOfferCard offer={offer} skill={selectedSkill} leagueMax={leagueMax} onKeep={keep} onRespin={respinPlayer} respins={respins} showGrades={showGrades} />
            : <div className="flex items-center gap-3 rounded-xl border border-dashed border-border/30 bg-canvas/30 p-5 text-sm text-muted-foreground">{spinning ? <><Loader2 className="h-5 w-5 animate-spin text-gold" />The wheel is choosing a team…</> : <><Users className="h-5 w-5 text-gold" />{selectedSkill ? 'Spin for a team to draw a player.' : 'Pick a skill, then spin for a team.'}</>}</div>}
        </div>
      </div>
    </div>}
    {phase === 'complete' && <div className="space-y-4">
      <ForgeBuildWheel picks={picks} leagueMax={leagueMax} overall={overall} />
      <BucketBoard buckets={SKILLS} picks={picks} activeKey={null} onUndo={undo} complete leagueMax={leagueMax} showGrades={showGrades} />
      <BucketSummary buckets={SKILLS} picks={picks} overall={overall} leagueMax={leagueMax} onRestart={start} />
      <ForgeLeagueTour league={league} buckets={SKILLS} picks={picks} />
    </div>}
  </section>;
}