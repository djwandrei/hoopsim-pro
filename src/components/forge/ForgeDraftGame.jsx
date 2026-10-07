import React, { useEffect, useMemo, useRef, useState } from 'react';
import confetti from 'canvas-confetti';

import { SKILLS, GROUPS } from '@/components/forge/bapSkills';
import { buildForgePool } from '@/components/forge/forgePool';
import ForgeSetupPanel from '@/components/forge/ForgeSetupPanel';
import ForgeReelPanel from '@/components/forge/ForgeReelPanel';
import ForgeStage from '@/components/forge/ForgeStage';
import ForgeOvrPanel from '@/components/forge/ForgeOvrPanel';
import ForgeBuildWheel from '@/components/forge/ForgeBuildWheel';
import BucketBoard from '@/components/forge/BucketBoard';
import ForgeLeagueTour from '@/components/forge/ForgeLeagueTour';
import ForgePlayerCard from '@/components/forge/ForgePlayerCard';
import ForgeShareButton from '@/components/forge/ForgeShareButton';
import MetricTile from '@/components/studio/MetricTile';
import { RotateCcw } from 'lucide-react';
import { decodeForgeBuild, forgeBuildQuery } from '@/components/forge/forgeReceipt';

// Build-A-Bucket-style reel draft, shared by both Forge modes:
// TEAM / PLAYER reels on the left, silhouette stage with DJHC skill chips in
// the center, and the OVR / slots panel on the right.
// mode 'wheel' — spin first, then tap any lit chip to take that rating.
// mode 'pick' — arm a skill chip first, spin, then keep the offered value.
const TEAM_RESPINS = 1;
const PLAYER_RESPINS = 3;
const SPIN_MS = 1250;
const FAST_AFTER_SPINS = 6;

const COPY = {
  wheel: {
    kicker: 'Wheel draft',
    title: 'SPIN · TAP · FORGE',
    intro: 'Spin for a random team and player, then draft one of their nine DJHC skill estimates. Estimates use that player’s selected-season statistics, normalized against the same season, with a role adjustment when the sample supports it.',
  },
  pick: {
    kicker: 'Pick & spin draft',
    title: 'PICK · SPIN · FORGE',
    intro: 'Choose a skill, then spin for a player from the selected team. Keep the player’s DJHC skill estimate or use a respin. Each estimate comes from that player’s selected-season statistics.',
  },
};

export const MODE_STEPS = {
  wheel: ['Spin team & player', 'Assign a stat chip', 'Forge & tour'],
  pick: ['Pick the skill', 'Spin team & player', 'Forge & tour'],
  team: ['Spin for each player', 'Place in the rotation', 'Chase 98-0'],
  teamPick: ['Spin for a team', 'Pick any roster player', 'Chase 98-0'],
};

export default function ForgeDraftGame({ source, league, mode, pool: poolProp }) {
  const copy = COPY[mode] || COPY.wheel;
  // The season pool is built once at the Forge Lab level and shared across
  // every draft mode, so switching modes never re-derives it.
  const allPool = useMemo(() => poolProp || buildForgePool(source), [poolProp, source]);
  const [boot] = useState(() => {
    const shared = decodeForgeBuild(window.location.search);
    return shared?.mode === mode ? shared : null;
  });
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
  const spinCount = useRef(0);

  const pool = useMemo(() => {
    const active = GROUPS.find(item => item.key === group) || GROUPS[0];
    return allPool.filter(player => player.positions.some(code => active.codes.includes(code)));
  }, [allPool, group]);

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

  // Shared build: a ?build= link restores the finished composite once the
  // season pool is available; every encoded pick must resolve to a player.
  useEffect(() => {
    if (!boot || !allPool.length) return;
    const byRef = new Map(allPool.map(player => [player.playerRef, player]));
    const restored = {};
    for (const [key, pick] of Object.entries(boot.picks)) {
      const player = byRef.get(pick.playerRef);
      if (player) restored[key] = { player, value: pick.value ?? player[key] };
    }
    if (Object.keys(restored).length === Object.keys(boot.picks).length) {
      setPicks(restored);
      setPhase('complete');
    }
  }, [boot, allPool]);

  // A finished build lives in the URL, so copying the page link shares it.
  const buildPayload = useMemo(() => {
    const payload = {};
    for (const skill of SKILLS) if (picks[skill.key]) payload[skill.key] = [picks[skill.key].player.playerRef, picks[skill.key].value];
    return payload;
  }, [picks]);
  useEffect(() => {
    if (phase !== 'complete' || !SKILLS.every(skill => picks[skill.key])) return;
    window.history.replaceState(null, '', `${window.location.pathname}?${forgeBuildQuery({ mode, picks: buildPayload })}`);
  }, [phase, picks, mode, buildPayload]);

  const openSkills = SKILLS.filter(skill => !picks[skill.key]);

  const eligibleRoster = code => rosterOf(code).filter(player => mode === 'pick'
    ? Number.isFinite(player[selectedKey])
    : openSkills.some(skill => Number.isFinite(player[skill.key])));

  const spin = (withTeam, spend) => {
    if (spinning || !wheelTeams.length) return;
    spinCount.current += 1;
    if (spend === 'team' && !teamRespins) return;
    if (spend === 'player' && !playerRespins) return;
    const options = wheelTeams.filter(team => eligibleRoster(team.code).length);
    if (!options.length) return;
    const needTeam = withTeam || !activeTeam || !eligibleRoster(activeTeam.code).length;
    const team = needTeam ? options[Math.floor(Math.random() * options.length)] : activeTeam;
    const roster = eligibleRoster(team.code);
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
    const value = reveal[key];
    if (!Number.isFinite(value)) return;
    const next = { ...picks, [key]: { player: reveal, value } };
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
    const values = rows.map(skill => picks[skill.key].value).filter(Number.isFinite);
    return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null;
  }, [picks]);
  const overall = useMemo(() => (filled >= SKILLS.length ? liveOvr : null), [liveOvr, filled]);

  const selectedSkill = SKILLS.find(skill => skill.key === selectedKey) || null;
  const revealNote = !reveal ? null
    : mode === 'pick' && selectedSkill ? `${selectedSkill.label} · DJHC ${selectedSkill.fmt(reveal[selectedSkill.key])}`
    : `${openSkills.length} skills open · tap a rating`;

  return <section aria-label="Forge draft game" className="space-y-4">
    {phase === 'setup' && <ForgeSetupPanel kicker={copy.kicker} title={copy.title} intro={copy.intro} group={group} onGroup={setGroup} poolCount={pool.length} onStart={start} steps={MODE_STEPS[mode]} />}
    {/* Drafting reads as before: reels · silhouette stage · forge dashboard
        in one row, with the landed-player profile full width underneath. */}
    {phase === 'drafting' && <div className="space-y-4">
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,17.5rem),minmax(0,1fr),minmax(0,13.5rem)] xl:grid-cols-[minmax(0,17.5rem),minmax(0,1fr),minmax(0,15rem)]">
      <ForgeReelPanel
        armedSkill={selectedSkill}
        showGrades={showGrades} onToggleGrades={() => setShowGrades(value => !value)}
        teamItems={wheelTeams} playerItems={playerItems}
        teamSpin={teamSpin} playerSpin={playerSpin} spinning={spinning}
        fast={spinCount.current > FAST_AFTER_SPINS}
        reveal={reveal}
        onSpin={requestSpin} spinDisabled={mode === 'pick' && !selectedKey}
        onRespinTeam={() => spin(true, 'team')} onRespinPlayer={() => spin(false, 'player')}
        teamRespins={teamRespins} playerRespins={playerRespins}
      />
      <ForgeStage
        mode={mode} spinning={spinning} picks={picks}
        reveal={reveal} selectedKey={selectedKey}
        onSelect={selectSkill} onAssign={assign} showGrades={showGrades}
      />
      <ForgeOvrPanel picks={picks} overall={liveOvr} showGrades={showGrades} onUndo={undo} />
      </div>
      <ForgePlayerCard player={reveal} note={revealNote} />
    </div>}
    {/* Build complete: the wheel, summary tiles and share rail sit beside the
        full slot list, so the whole composite reads on one screen. */}
    {phase === 'complete' && <div className="space-y-4">
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,21rem),minmax(0,1fr)]">
        <div className="space-y-3">
          <div className="court-panel p-4">
            <p className="bcast-kicker">DJHC skill ratings</p>
            <div className="mx-auto mt-2 max-w-60"><ForgeBuildWheel picks={picks} overall={overall} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <MetricTile label="Buckets filled" value={SKILLS.length} detail="Real player-season donors" tone="positive" />
            {(() => {
              const top = SKILLS.reduce((best, skill) => (!best || picks[skill.key].value > picks[best.key].value ? skill : best), null);
              return <MetricTile label="Top contributor" value={top.player.name.split(' ').slice(-1)[0]} detail={`${top.label} · DJHC ${top.fmt(picks[top.key].value)}`} tone="royal" />;
            })()}
          </div>
          <div className="flex flex-col gap-2">
            <ForgeShareButton encode={() => forgeBuildQuery({ mode, picks: buildPayload })} />
            <button type="button" onClick={start} className="flex min-h-10 items-center justify-center gap-2 rounded-lg border border-gold/40 bg-gold/10 px-4 text-xs font-semibold text-gold transition-colors hover:bg-gold/20"><RotateCcw className="h-3.5 w-3.5" />Draft a new player</button>
          </div>
        </div>
        <BucketBoard buckets={SKILLS} picks={picks} activeKey={null} onUndo={undo} complete showGrades={showGrades} />
      </div>
      <ForgeLeagueTour league={league} buckets={SKILLS} picks={picks} />
    </div>}
  </section>;
}