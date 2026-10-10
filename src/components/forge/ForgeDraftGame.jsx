import React, { useEffect, useMemo, useRef, useState } from 'react';
import confetti from 'canvas-confetti';

import { SKILLS, GROUPS } from '@/components/forge/bapSkills';
import { buildForgePool, forgeCompositeScore } from '@/components/forge/forgePool';
import ForgeDraftSettings from './ForgeDraftSettings';
import ForgeSaveButton from './ForgeSaveButton';
import { chooseForgeOffer } from './forgeDraftRules';
import { newForgeSeed, readForgeSession, saveForgeSession, sessionKey } from './forgeSession';
import ForgeSetupPanel from '@/components/forge/ForgeSetupPanel';
import ForgeReelPanel from '@/components/forge/ForgeReelPanel';
import ForgeStage from '@/components/forge/ForgeStage';
import ForgeShadesOf from './ForgeShadesOf';
import ForgeBuildWheel from '@/components/forge/ForgeBuildWheel';
import BucketBoard from '@/components/forge/BucketBoard';
import ForgeLeagueTour from '@/components/forge/ForgeLeagueTour';
import ForgePlayerCard from '@/components/forge/ForgePlayerCard';
import ForgeShareButton from '@/components/forge/ForgeShareButton';
import ForgeWardrobeControls from '@/components/forge/ForgeWardrobeControls';
import { DEFAULT_APPEARANCE, DEFAULT_WARDROBE_EDITIONS } from '@/components/forge/forgeWardrobeRules';
import MetricTile from '@/components/studio/MetricTile';
import { RotateCcw } from 'lucide-react';
import { decodeForgeBuild, forgeBuildQuery, restoreForgePicks, updateForgeBuildUrl } from '@/components/forge/forgeReceipt';

// Build-A-Bucket-style reel draft, shared by both Forge modes:
// TEAM / PLAYER reels and the revealed profile on the left; the composite
// summary, athlete and equipment map share the stage on the right.
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
    intro: 'Spin for a random team and player, then draft one of their ten DJHC attributes. Skill estimates use the selected season; Body compares reported size and reach with position peers.',
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
  teamPick: ['Spin for a team', 'Pick an eligible player', 'Chase 98-0'],
};

export default function ForgeDraftGame({ source, league, mode, pool: poolProp }) {
  const copy = COPY[mode] || COPY.wheel;
  // The season pool is built once at the Forge Lab level and shared across
  // every draft mode, so switching modes never re-derives it.
  const allPool = useMemo(() => poolProp || buildForgePool(source), [poolProp, source]);
  const key = sessionKey(mode, source);
  const [saved] = useState(() => readForgeSession(key));
  const [boot] = useState(() => {
    const shared = decodeForgeBuild(window.location.search);
    return shared?.mode === mode ? shared : decodeForgeBuild(`?${saved?.build || ''}`);
  });
  const [restored] = useState(() => restoreForgePicks(boot, allPool, source));
  const [group, setGroup] = useState(boot?.group || saved?.group || 'All');
  const [sampling, setSampling] = useState(boot?.sampling || saved?.sampling || 'player');
  const [repeatDonors, setRepeatDonors] = useState(boot?.repeatDonors ?? saved?.repeatDonors ?? true);
  const [seed, setSeed] = useState(boot?.seed ?? saved?.seed ?? newForgeSeed());
  const [drawOdds, setDrawOdds] = useState(null);
  const [showGrades, setShowGrades] = useState(true);
  const [phase, setPhase] = useState(() => SKILLS.every(s => restored.picks[s.key]) ? 'complete' : Object.keys(restored.picks).length || saved?.phase === 'drafting' ? 'drafting' : 'setup');
  const [picks, setPicks] = useState(restored.picks);
  const [editions, setEditions] = useState(() => boot?.editions || { ...DEFAULT_WARDROBE_EDITIONS });
  const [appearance, setAppearance] = useState(() => ({ ...DEFAULT_APPEARANCE, ...boot?.appearance }));
  const onEdition = (element, edition) => setEditions(value => ({ ...value, [element]: edition }));
  const onAppearance = (field, value) => setAppearance(current => ({ ...current, [field]: value }));
  const [reveal, setReveal] = useState(() => allPool.find(p => p.playerRef === saved?.reveal) || null);
  const [selectedKey, setSelectedKey] = useState(SKILLS.some(skill => skill.key === saved?.selectedKey) ? saved.selectedKey : saved?.selectedKey === 'steals' ? 'perimeterDefense' : null);
  const [spinning, setSpinning] = useState(false);
  const [teamSpin, setTeamSpin] = useState({ token:0, targetKey:null });
  const [playerSpin, setPlayerSpin] = useState({ token:0, targetKey:null });
  const [activeTeam, setActiveTeam] = useState(() => league.byCode.get(saved?.activeTeam) || null);
  const [teamRespins, setTeamRespins] = useState(saved?.teamRespins ?? TEAM_RESPINS);
  const [playerRespins, setPlayerRespins] = useState(saved?.playerRespins ?? PLAYER_RESPINS);
  const timer = useRef(null);
  const spinCount = useRef(saved?.spinCount || 0);

  const pool = useMemo(() => {
    const active = GROUPS.find(item => item.key === group) || GROUPS[0];
    return allPool.filter(player => group === 'All' || player.positions.some(code => active.codes.includes(code) || group === 'Guard' && ['PG', 'SG'].includes(code) || group === 'Big' && ['SF', 'PF'].includes(code)));
  }, [allPool, group]);

  const wheelTeams = useMemo(() => {
    const present = new Set(pool.map(player => player.teamCode));
    const teams = (league.teams || []).filter(team => present.has(team.code));
    return teams;
  }, [league, pool]);

  const rosterOf = useMemo(() => {
    const map = new Map(wheelTeams.map(team => [team.code, pool.filter(player => player.teamCode === team.code)]));
    return code => map.get(code) || [];
  }, [wheelTeams, pool]);
  const playerItems = useMemo(() => (activeTeam ? rosterOf(activeTeam.code) : pool.slice(0, 24)), [activeTeam, rosterOf, pool]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  // A finished build lives in the URL, so copying the page link shares it.
  const buildPayload = useMemo(() => {
    const payload = {};
    for (const skill of SKILLS) if (picks[skill.key]) payload[skill.key] = [picks[skill.key].player.playerRef, picks[skill.key].value];
    return payload;
  }, [picks]);
  const sharePayload = { mode, picks: buildPayload, editions, appearance, sampling, repeatDonors, group, year: Number(source.entry.scope.seasonStartYears[0]), packageVersion: source.entry.packageVersion, seed };
  useEffect(() => {
    if (phase !== 'complete' || !SKILLS.every(skill => picks[skill.key])) return;
    updateForgeBuildUrl(forgeBuildQuery({ ...sharePayload }));
  }, [phase, picks, mode, buildPayload, editions, appearance, source, seed]);
  useEffect(() => { saveForgeSession(key, { build: forgeBuildQuery(sharePayload), phase, group, sampling, repeatDonors, seed, selectedKey, activeTeam: activeTeam?.code, reveal: reveal?.playerRef, teamRespins, playerRespins, spinCount: spinCount.current }); }, [key, mode, buildPayload, editions, appearance, source, phase, group, sampling, repeatDonors, seed, selectedKey, activeTeam, reveal, teamRespins, playerRespins]);

  const openSkills = SKILLS.filter(skill => !picks[skill.key]);

  const used = new Set(Object.values(picks).map(p => p.player.playerRef));
  const eligibleRoster = code => rosterOf(code).filter(player => (repeatDonors || !used.has(player.playerRef)) && (mode === 'pick'
    ? Number.isFinite(player[selectedKey])
    : openSkills.some(skill => Number.isFinite(player[skill.key]))));

  const spin = (withTeam, spend) => {
    if (spinning || !wheelTeams.length) return;
    if (spend === 'team' && !teamRespins) return;
    if (spend === 'player' && !playerRespins) return;
    const options = wheelTeams.filter(team => eligibleRoster(team.code).length);
    if (!options.length) return;
    const needTeam = withTeam || !activeTeam || !eligibleRoster(activeTeam.code).length;
    const offer = chooseForgeOffer({ teams: options, players: options.flatMap(t => eligibleRoster(t.code)), sampling, sameTeam: !needTeam, activeTeam: activeTeam?.code, seed, step: spinCount.current });
    if (!offer) return;
    spinCount.current += 1;
    const { team, player, probability } = offer; setDrawOdds(probability);
    if (spend === 'team') setTeamRespins(value => value - 1);
    if (spend === 'player') setPlayerRespins(value => value - 1);
    setActiveTeam(team);
    setReveal(null);
    if (needTeam) setTeamSpin(value => ({ token:value.token + 1, targetKey:team.code }));
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
    setSelectedKey(value => value === key ? null : key);
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

  const start = () => {
    window.clearTimeout(timer.current); spinCount.current = 0; updateForgeBuildUrl(null); setDrawOdds(null);
    setPicks({});
    setEditions({ ...DEFAULT_WARDROBE_EDITIONS });
    setAppearance({ ...DEFAULT_APPEARANCE });
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
    const score = forgeCompositeScore(picks, group); return score === null ? null : Math.round(score);
  }, [picks, group]);
  const overall = useMemo(() => (filled >= SKILLS.length ? liveOvr : null), [liveOvr, filled]);

  const selectedSkill = SKILLS.find(skill => skill.key === selectedKey) || null;
  const revealNote = !reveal ? null
    : mode === 'pick' && selectedSkill ? `${selectedSkill.label} · DJHC ${selectedSkill.fmt(reveal[selectedSkill.key])}`
    : `${openSkills.length} skills open · tap a rating`;

  return <section aria-label="Forge draft game" className="space-y-4">
    {restored.warning && <p role="status" className="court-panel p-3 text-xs">{restored.warning}</p>}
    <ForgeDraftSettings sampling={sampling} onSampling={setSampling} repeatDonors={repeatDonors} onRepeat={setRepeatDonors} seed={seed} onSeed={setSeed} locked={phase !== 'setup'} />
    {phase !== 'setup' && <div className="flex flex-wrap items-center justify-between gap-2"><p aria-live="polite" className="text-xs text-muted-foreground">{filled}/{SKILLS.length} attributes locked{drawOdds ? ` · Last player draw chance ${(drawOdds * 100).toFixed(2)}%` : ''} · Draft seed {seed}</p><button type="button" className="min-h-10 rounded-lg border border-border px-4 text-xs" onClick={() => { start(); setPhase('setup'); }}>Restart game</button></div>}
    {phase === 'setup' && <ForgeSetupPanel kicker={copy.kicker} title={copy.title} intro={copy.intro} group={group} onGroup={setGroup} poolCount={pool.length} onStart={start} steps={MODE_STEPS[mode]} />}
    {/* Keep the reels beside the player, with the build summary inside its stage. */}
    {phase === 'drafting' && <div className="space-y-4">
      <div className="forge-draft-workspace">
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
        mode={mode} spinning={spinning} picks={picks} pool={allPool} group={group} overall={liveOvr}
        reveal={reveal} selectedKey={selectedKey}
        onSelect={selectSkill} onAssign={assign} showGrades={showGrades}
        editions={editions} onEdition={onEdition}
        appearance={appearance} onAppearance={onAppearance}
      />
      <ForgePlayerCard player={reveal} note={revealNote} className="forge-draft-profile" />
      </div>
    </div>}
    {/* Build complete: the wheel, summary tiles and share rail sit beside the
        full slot list, so the whole composite reads on one screen. */}
    {phase === 'complete' && <div className="space-y-4">
      <ForgeShadesOf picks={picks} pool={allPool} />
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,21rem),minmax(0,1fr)]">
        <div className="space-y-3">
          <div className="court-panel p-4">
            <p className="bcast-kicker">DJHC skill ratings</p>
            <div className="mx-auto mt-2 max-w-60"><ForgeBuildWheel picks={picks} overall={overall} editions={editions} appearance={appearance} /></div>
            <div className="mt-3"><ForgeWardrobeControls picks={picks} editions={editions} onEdition={onEdition} appearance={appearance} onAppearance={onAppearance} teams={league.teams} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <MetricTile label="Buckets filled" value={SKILLS.length} detail="Real player-season donors" tone="positive" />
            {(() => {
              const top = SKILLS.reduce((best, skill) => (!best || picks[skill.key].value > picks[best.key].value ? skill : best), null);
              return <MetricTile label="Top contributor" value={picks[top.key].player.name.split(' ').slice(-1)[0]} detail={`${top.label} · DJHC ${top.fmt(picks[top.key].value)}`} tone="royal" />;
            })()}
          </div>
          <div className="flex flex-col gap-2">
            <ForgeShareButton encode={() => forgeBuildQuery(sharePayload)} />
            <ForgeSaveButton payload={sharePayload} />
            <button type="button" onClick={start} className="flex min-h-10 items-center justify-center gap-2 rounded-lg border border-gold/40 bg-gold/10 px-4 text-xs font-semibold text-gold transition-colors hover:bg-gold/20"><RotateCcw className="h-3.5 w-3.5" />Draft a new player</button>
          </div>
        </div>
        <BucketBoard buckets={SKILLS} picks={picks} activeKey={null} complete showGrades={showGrades} />
      </div>
      <ForgeLeagueTour league={league} buckets={SKILLS} picks={picks} group={group} seed={seed} />
    </div>}
  </section>;
}
