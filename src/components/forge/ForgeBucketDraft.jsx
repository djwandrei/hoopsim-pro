import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Dices, Loader2, Play } from 'lucide-react';

import BucketBoard from '@/components/forge/BucketBoard';
import BucketCandidates from '@/components/forge/BucketCandidates';
import BucketSummary from '@/components/forge/BucketSummary';
import ForgeLeagueTour from '@/components/forge/ForgeLeagueTour';
import TeamMark from '@/components/studio/TeamMark';

const one = value => value.toFixed(1);
const pct = value => `${(value * 100).toFixed(1)}%`;

// The original Composite Forge's eight skill components, unchanged
// (composite-forge model v21). Creation's involvementPer36 is approximated
// by points + assists per 36, the observed involvement proxy in the package.
const SKILLS = [
  { key: 'scoring', label: 'Scoring', metric: 'PPG', metricKey: 'pointsPerGame', fmt: one },
  { key: 'shooting', label: 'Shooting', metric: 'FG%', metricKey: 'fieldGoalPercentage', fmt: pct },
  { key: 'creation', label: 'Creation', metric: 'P+A /36', metricKey: null, fmt: one },
  { key: 'playmaking', label: 'Playmaking & ball security', metric: 'APG', metricKey: 'assistsPerGame', fmt: one },
  { key: 'rebounding', label: 'Rebounding', metric: 'RPG', metricKey: 'reboundsPerGame', fmt: one },
  { key: 'defensiveActivity', label: 'Defensive activity', metric: 'SPG', metricKey: 'stealsPerGame', fmt: one },
  { key: 'efficiency', label: 'Efficiency', metric: 'TS%', metricKey: 'trueShootingPercentage', fmt: pct },
  { key: 'workload', label: 'Workload', metric: 'MPG', metricKey: 'minutesPerGame', fmt: one },
];

const shuffle = list => { const copy = [...list]; for (let i = copy.length - 1; i > 0; i -= 1) { const j = Math.floor(Math.random() * (i + 1)); [copy[i], copy[j]] = [copy[j], copy[i]]; } return copy; };

export default function ForgeBucketDraft({ source, league }) {
  const pool = useMemo(() => (source.blueprintRows || [])
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
        player[skill.key] = skill.key === 'creation'
          ? value(m.pointsPer36) + value(m.assistsPer36)
          : value(m[skill.metricKey]);
      }
      return player;
    }), [source]);

  const leagueMax = useMemo(() => Object.fromEntries(SKILLS.map(({ key }) => [key, Math.max(...pool.map(player => player[key] || 0))])), [pool]);
  const ranks = useMemo(() => Object.fromEntries(SKILLS.map(({ key }) => {
    const sorted = [...pool].sort((a, b) => (b[key] || 0) - (a[key] || 0));
    return [key, new Map(sorted.map((player, index) => [player.playerRef, index + 1]))];
  })), [pool]);
  const teams = useMemo(() => shuffle([...new Set(pool.map(player => player.teamCode))]), [pool]);

  const [phase, setPhase] = useState('setup');
  const [order, setOrder] = useState([]);
  const [round, setRound] = useState(0);
  const [picks, setPicks] = useState({});
  const [spunTeam, setSpunTeam] = useState(null);
  const [candidates, setCandidates] = useState([]);
  const [spinning, setSpinning] = useState(false);
  const [rerolls, setRerolls] = useState(1);
  const timer = useRef(null);

  const spin = () => {
    window.clearTimeout(timer.current);
    setSpinning(true);
    setCandidates([]);
    timer.current = window.setTimeout(() => {
      const team = teams[Math.floor(Math.random() * teams.length)];
      setSpunTeam(team);
      setCandidates(shuffle(pool.filter(player => player.teamCode === team)).slice(0, 8)
        .map(player => ({ ...player, ranks: Object.fromEntries(SKILLS.map(({ key }) => [key, ranks[key].get(player.playerRef)])) })));
      setSpinning(false);
    }, 800);
  };
  useEffect(() => () => window.clearTimeout(timer.current), []);

  useEffect(() => {
    if (phase !== 'drafting') return;
    if (!order[round] || picks[order[round].key]) return;
    spin();
  }, [phase, round, order, picks]);

  const start = () => { setPicks({}); setOrder(shuffle(SKILLS)); setRound(0); setRerolls(1); setPhase('drafting'); };
  const pickPlayer = player => {
    const next = { ...picks, [order[round].key]: { player, value: player[order[round].key] || 0 } };
    setPicks(next);
    if (round + 1 >= SKILLS.length) { setPhase('complete'); setCandidates([]); setSpunTeam(null); return; }
    setRound(round + 1);
  };
  const undo = key => {
    const next = { ...picks };
    delete next[key];
    setPicks(next);
    setPhase('drafting');
    setRound(order.findIndex(skill => skill.key === key));
  };
  const rerollTeam = () => { if (!rerolls) return; setRerolls(0); spin(); };

  const overall = useMemo(() => {
    if (SKILLS.some(skill => !picks[skill.key])) return null;
    return Math.round(SKILLS.reduce((sum, skill) => sum + Math.min(100, picks[skill.key].value / leagueMax[skill.key] * 100), 0) / SKILLS.length);
  }, [picks, leagueMax]);
  const filled = SKILLS.filter(skill => picks[skill.key]).length;
  const activeSkill = order[round] || null;

  return <section aria-label="Bucket draft game" className="space-y-4">
    {phase === 'setup' && <div className="court-panel p-6">
      <p className="court-kicker">Bucket draft · Build-A-Bucket cycle</p>
      <h2 className="mt-1 font-display text-3xl">FORGE A PLAYER FROM REAL SEASONS</h2>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">Eight original forge skills, one wheel run. Each round the wheel draws an open skill and a random NBA team — draft a card from that roster and their observed grade fills the skill. One team reroll per build. Finish the board to forge the composite and tour the league.</p>
      <div className="mt-4 flex flex-wrap gap-2">{SKILLS.map(skill => <span key={skill.key} className="rounded-lg border border-border/30 bg-canvas/30 px-3 py-1.5 text-[11px] text-muted-foreground">{skill.label} <span className="font-mono text-gold">{skill.metric}</span></span>)}</div>
      <button type="button" onClick={start} className="mt-5 flex min-h-11 items-center gap-2 rounded-lg bg-primary px-6 text-sm font-semibold text-primary-foreground"><Play className="h-4 w-4" />Start drafting</button>
    </div>}
    {phase === 'drafting' && <>
      <div className="court-panel p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><p className="court-kicker">Bucket draft</p><h2 className="mt-1 font-display text-2xl">SPIN, THEN DRAFT</h2><p className="mt-1 text-xs text-muted-foreground">The wheel picks the open skill and a random team — pick a card from that roster to fill the skill. {order.length - filled} skills remain.</p></div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-gold" role="status">{filled} / {SKILLS.length} filled</span>
            <button type="button" onClick={rerollTeam} disabled={!rerolls || spinning} className="flex min-h-10 items-center gap-2 rounded-lg border border-input px-3 text-xs text-foreground hover:border-gold/40 hover:text-gold disabled:opacity-40 disabled:hover:border-input disabled:hover:text-foreground"><Dices className="h-3.5 w-3.5" />Reroll team · {rerolls} left</button>
          </div>
        </div>
        <div className="mt-4 grid items-center gap-4 lg:grid-cols-[minmax(0,18rem),1fr]">
          <div className="flex items-center gap-3 rounded-xl border border-gold/30 bg-canvas/40 px-4 py-3">
            <TeamMark code={spinning ? 'SQ' : spunTeam || 'SQ'} className={`h-14 w-14 ${spinning ? 'animate-pulse' : ''}`} />
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Wheel skill</p>
              <p className="font-display text-xl leading-tight text-gold">{activeSkill?.label || '—'} <span className="font-mono text-xs">{activeSkill?.metric}</span></p>
              <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">{spinning ? <><Loader2 className="h-3 w-3 animate-spin text-gold" />Spinning the team wheel…</> : spunTeam ? <>Team drawn · draft from {spunTeam}</> : 'Awaiting spin'}</p>
            </div>
          </div>
          <BucketBoard buckets={SKILLS} picks={picks} activeKey={activeSkill?.key || null} onActivate={() => {}} onUndo={undo} complete={false} />
        </div>
      </div>
      {spinning ? <div className="court-panel flex items-center gap-3 p-5 text-sm text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin text-gold" />Spinning the team wheel…</div>
        : <BucketCandidates candidates={candidates} bucket={activeSkill} onPick={pickPlayer} />}
    </>}
    {phase === 'complete' && <div className="space-y-4">
      <BucketBoard buckets={SKILLS} picks={picks} activeKey={null} onActivate={() => {}} onUndo={undo} complete />
      <BucketSummary buckets={SKILLS} picks={picks} overall={overall} leagueMax={leagueMax} onRestart={start} />
      <ForgeLeagueTour league={league} buckets={SKILLS} picks={picks} />
    </div>}
  </section>;
}