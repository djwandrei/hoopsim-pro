import React, { useEffect, useMemo, useRef, useState } from 'react';
import confetti from 'canvas-confetti';

import { SKILLS, GROUPS } from '@/components/forge/bapSkills';
import { buildForgePool, forgeMax } from '@/components/forge/forgePool';
import ForgeSetupPanel from '@/components/forge/ForgeSetupPanel';
import ForgeReelPanel from '@/components/forge/ForgeReelPanel';
import ForgeStage from '@/components/forge/ForgeStage';
import ForgeOvrPanel from '@/components/forge/ForgeOvrPanel';
import ForgeBuildWheel from '@/components/forge/ForgeBuildWheel';
import BucketBoard from '@/components/forge/BucketBoard';
import BucketSummary from '@/components/forge/BucketSummary';
import ForgeLeagueTour from '@/components/forge/ForgeLeagueTour';
import ForgePlayerShowcase from '@/components/forge/ForgePlayerShowcase';

// Build-A-Bucket-style reel draft, shared by both Forge modes:
// TEAM / PLAYER reels on the left, silhouette stage with attribute chips in
// the center, and the OVR / slots panel on the right.
// mode 'wheel' — spin first, then tap any lit chip to take that stat.
// mode 'pick' — arm a skill chip first, spin, then keep the offered value.
const TEAM_RESPINS = 1;
const PLAYER_RESPINS = 3;
const SPIN_MS = 1250;

const COPY = {
  wheel: {
    kicker: 'Wheel draft',
    title: 'SPIN · TAP · FORGE',
    intro: 'Spin the reels for a random team and a random player from that roster, then tap a lit attribute chip to take that part of their game. One team respin and three player respins — fill all nine slots to forge the composite.',
  },
  pick: {
    kicker: 'Pick & spin draft',
    title: 'PICK · SPIN · FORGE',
    intro: 'Tap an attribute chip to arm the slot, spin the reels for a random team and player, then keep the offered value or burn a respin. One team respin and three player respins — fill all nine slots to forge the composite.',
  },
};

export const MODE_STEPS = {
  wheel: ['Spin team & player', 'Assign a stat chip', 'Forge & tour'],
  pick: ['Pick the skill', 'Spin team & player', 'Forge & tour'],
  team: ['Spin for each player', 'Place in the rotation', 'Chase 98-0'],
  teamPick: ['Spin for a team', 'Pick any roster player', 'Chase 98-0'],
};

export default function ForgeDraftGame({ source, league, mode }) {
  const copy = COPY[mode] || COPY.wheel;
  const allPool = useMemo(() => buildForgePool(source), [source]);
  const [group, setGroup] = useState('Guard');
  const [showGrades, setShowGrades] = useState(true);
  const [phase, setPhase] = useState('setup');
  const [picks, setPicks] = useState({});
  const [reveal, setReveal] = useState(null);
  const [selectedKey, setSelectedKey] = useState(null);
  const [spinning, setSpinning] = useState(false);
  const [teamSpin, setTeamSpin] = useState({ token:0, targetKey:null });
  const [playerSpin, setPlayerSpin] = useState({ token:0, targetKey:null });
  const [activeTeam, setActiveTeam] = useState(null);
  const [teamRespins, setTeamRespins] = useState(TEAM_RESPINS);
  const [playerRespins, setPlayerRespins] = useState(PLAYER_RESPINS);
  const timer = useRef(null);

  const pool = useMemo(() => {
    const active = GROUPS.find(item => item.key === group) || GROUPS[0];
    return allPool.filter(player => player.positions.some(code => active.codes.includes(code)));
  }, [allPool, group]);
  const leagueMax = useMemo(() => forgeMax(pool), [pool]);

  const wheelTeams = useMemo(() => {
    const present = new Set(pool.map(player => player.teamCode));
    const teams = (league.teams || []).filter(team => present.has(team.code));
    return teams.length ? teams : league.teams || [];
  }, [league, pool]);

  const rosterOf = useMemo(() => {
    const map = new Map(wheelTeams.map(team => [team.code, pool.filter(player => player.teamCode === team.code)]));
    return code => map.get(code) || [];
  }, [wheelTeams, pool]);
  const playerItems = useMemo(() => (activeTeam ? rosterOf(activeTeam.code) : pool.slice(0, 24)), [activeTeam, rosterOf, pool]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const openSkills = SKILLS.filter(skill => !picks[skill.key]);

  const spin = (withTeam, spend) => {
    if (spinning || !wheelTeams.length) return;
    if (spend === 'team' && !teamRespins) return;
    if (spend === 'player' && !playerRespins) return;
    const team = withTeam || !activeTeam ? wheelTeams[Math.floor(Math.random() * wheelTeams.length)] : activeTeam;
    const roster = rosterOf(team.code);
    if (!roster.length) return;
    const player = roster[Math.floor(Math.random() * roster.length)];
    if (spend === 'team') setTeamRespins(value => value - 1);
    if (spend === 'player') setPlayerRespins(value => value - 1);
    setActiveTeam(team);
    setReveal(null);
    if (withTeam || !activeTeam) setTeamSpin(value => ({ token:value.token + 1, targetKey:team.code }));
    setPlayerSpin(value => ({ token:value.token + 1, targetKey:player.playerRef }));
    setSpinning(true);
    timer.current = window.setTimeout(() => { setSpinning(false); setReveal(player); }, SPIN_MS);
  };

  const requestSpin = () => {
    if (mode === 'pick' && !selectedKey) return;
    spin(true, null);
  };

  const selectSkill = key => {
    if (mode !== 'pick' || spinning || reveal || picks[key]) return;
    setSelectedKey(key);
  };

  const assign = key => {
    if (!reveal || picks[key]) return;
    if (mode === 'pick' && key !== selectedKey) return;
    const next = { ...picks, [key]: { player: reveal, value: reveal[key] || 0 } };
    setPicks(next);
    setReveal(null);
    setSelectedKey(null);
    if (Object.keys(next).length >= SKILLS.length) {
      setPhase('complete');
      confetti({ particleCount: 160, spread: 85, origin: { y: 0.6 }, colors: ['#E9B949','#3E63DD','#D63A4B'] });
    }
  };

  const undo = key => {
    const next = { ...picks };
    delete next[key];
    setPicks(next);
    setPhase('drafting');
  };

  const start = () => {
    setPicks({});
    setReveal(null);
    setSelectedKey(null);
    setSpinning(false);
    setActiveTeam(null);
    setTeamSpin({ token:0, targetKey:null });
    setPlayerSpin({ token:0, targetKey:null });
    setTeamRespins(TEAM_RESPINS);
    setPlayerRespins(PLAYER_RESPINS);
    setPhase('drafting');
  };

  const filled = SKILLS.filter(skill => picks[skill.key]).length;
  const liveOvr = useMemo(() => {
    const rows = SKILLS.filter(skill => picks[skill.key]);
    if (!rows.length) return null;
    return Math.round(rows.reduce((sum, skill) => sum + Math.min(100, picks[skill.key].value / leagueMax[skill.key] * 100), 0) / rows.length);
  }, [picks, leagueMax]);
  const overall = useMemo(() => (filled >= SKILLS.length ? liveOvr : null), [liveOvr, filled]);

  const selectedSkill = SKILLS.find(skill => skill.key === selectedKey) || null;
  const revealNote = !reveal ? null
    : mode === 'pick' && selectedSkill ? `${selectedSkill.label} · ${selectedSkill.fmt(reveal[selectedSkill.key] || 0)}`
    : `${openSkills.length} slots open · tap a lit chip`;

  return <section aria-label="Forge draft game" className="space-y-4">
    {phase === 'setup' && <ForgeSetupPanel kicker={copy.kicker} title={copy.title} intro={copy.intro} group={group} onGroup={setGroup} poolCount={pool.length} onStart={start} steps={MODE_STEPS[mode]} />}
    {phase === 'drafting' && <div className="space-y-4">
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,17.5rem),minmax(0,1fr),minmax(0,13.5rem)] xl:grid-cols-[minmax(0,17.5rem),minmax(0,1fr),minmax(0,15rem)]">
      <ForgeReelPanel
        armedSkill={selectedSkill}
        showGrades={showGrades} onToggleGrades={() => setShowGrades(value => !value)}
        teamItems={wheelTeams} playerItems={playerItems}
        teamSpin={teamSpin} playerSpin={playerSpin} spinning={spinning}
        reveal={reveal}
        onSpin={requestSpin} spinDisabled={mode === 'pick' && !selectedKey}
        onRespinTeam={() => spin(true, 'team')} onRespinPlayer={() => spin(false, 'player')}
        teamRespins={teamRespins} playerRespins={playerRespins}
        picks={picks} leagueMax={leagueMax}
      />
      <ForgeStage
        mode={mode} spinning={spinning} picks={picks} leagueMax={leagueMax}
        reveal={reveal} selectedKey={selectedKey}
        onSelect={selectSkill} onAssign={assign} showGrades={showGrades}
      />
      <ForgeOvrPanel picks={picks} overall={liveOvr} leagueMax={leagueMax} showGrades={showGrades} onUndo={undo} />
      </div>
      <ForgePlayerShowcase player={reveal} note={revealNote} />
    </div>}
    {phase === 'complete' && <div className="space-y-4">
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,22rem),minmax(0,1fr)]">
        <div className="court-panel p-5"><p className="bcast-kicker">Attribute wheel</p><div className="mt-3"><ForgeBuildWheel picks={picks} leagueMax={leagueMax} overall={overall} /></div></div>
        <BucketBoard buckets={SKILLS} picks={picks} activeKey={null} onUndo={undo} complete leagueMax={leagueMax} showGrades={showGrades} />
      </div>
      <BucketSummary buckets={SKILLS} picks={picks} overall={overall} leagueMax={leagueMax} onRestart={start} />
      <ForgeLeagueTour league={league} buckets={SKILLS} picks={picks} />
    </div>}
  </section>;
}