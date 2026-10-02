import React, { useMemo, useState } from 'react';
import { Dices, Play } from 'lucide-react';

import BucketBoard from '@/components/forge/BucketBoard';
import BucketCandidates from '@/components/forge/BucketCandidates';
import BucketSummary from '@/components/forge/BucketSummary';
import ForgeLeagueTour from '@/components/forge/ForgeLeagueTour';

const BUCKETS = [
  { key: 'pts', label: 'Scoring', metric: 'PPG', weight: 0.28, hint: 'Points per game' },
  { key: 'ast', label: 'Playmaking', metric: 'APG', weight: 0.16, hint: 'Assists per game' },
  { key: 'reb', label: 'Rebounding', metric: 'RPG', weight: 0.16, hint: 'Rebounds per game' },
  { key: 'stl', label: 'Perimeter D', metric: 'SPG', weight: 0.14, hint: 'Steals per game' },
  { key: 'blk', label: 'Rim Protection', metric: 'BPG', weight: 0.12, hint: 'Blocks per game' },
  { key: 'mpg', label: 'Engine', metric: 'MPG', weight: 0.14, hint: 'Minutes per game' },
];

export default function ForgeBucketDraft({ league }) {
  const pool = useMemo(() => league.teams.flatMap(team => team.roster.map(player => ({ ...player, teamCode: team.code, mpg: player.games ? player.minutes / player.games : 0 }))).filter(player => player.games >= 15 && player.minutes >= 300), [league]);
  const leagueMax = useMemo(() => Object.fromEntries(BUCKETS.map(({ key }) => [key, Math.max(...pool.map(player => player[key] || 0))])), [pool]);
  const ranks = useMemo(() => Object.fromEntries(BUCKETS.map(({ key }) => {
    const sorted = [...pool].sort((a, b) => (b[key] || 0) - (a[key] || 0));
    return [key, new Map(sorted.map((player, index) => [player.playerRef, index + 1]))];
  })), [pool]);
  const [phase, setPhase] = useState('setup');
  const [activeKey, setActiveKey] = useState(BUCKETS[0].key);
  const [picks, setPicks] = useState({});
  const [candidates, setCandidates] = useState([]);
  const draw = exclude => {
    const available = pool.filter(player => !exclude.has(player.playerRef));
    for (let i = available.length - 1; i > 0; i -= 1) { const j = Math.floor(Math.random() * (i + 1)); [available[i], available[j]] = [available[j], available[i]]; }
    return available.slice(0, 4).map(player => ({ ...player, ranks: Object.fromEntries(BUCKETS.map(({ key }) => [key, ranks[key].get(player.playerRef)])) }));
  };
  const start = () => { setPicks({}); setActiveKey(BUCKETS[0].key); setCandidates(draw(new Set())); setPhase('drafting'); };
  const reroll = () => setCandidates(draw(new Set(Object.values(picks).map(entry => entry.player.playerRef))));
  const pickPlayer = player => {
    const next = { ...picks, [activeKey]: { player, value: player[activeKey] || 0 } };
    setPicks(next);
    const used = new Set(Object.values(next).map(entry => entry.player.playerRef));
    const remaining = BUCKETS.filter(bucket => !next[bucket.key]);
    if (!remaining.length) { setPhase('complete'); setCandidates([]); return; }
    setActiveKey(remaining[0].key);
    setCandidates(draw(used));
  };
  const undo = key => {
    const next = { ...picks };
    delete next[key];
    setPicks(next);
    setPhase('drafting');
    setActiveKey(key);
    setCandidates(draw(new Set(Object.values(next).map(entry => entry.player.playerRef))));
  };
  const overall = useMemo(() => {
    if (BUCKETS.some(bucket => !picks[bucket.key])) return null;
    return Math.round(BUCKETS.reduce((sum, bucket) => sum + bucket.weight * Math.min(100, picks[bucket.key].value / leagueMax[bucket.key] * 100), 0));
  }, [picks, leagueMax]);
  const filled = BUCKETS.filter(bucket => picks[bucket.key]).length;
  const activeBucket = BUCKETS.find(bucket => bucket.key === activeKey);
  return <section aria-label="Bucket draft game" className="space-y-4">
    {phase === 'setup' && <div className="court-panel p-6">
      <p className="court-kicker">Bucket draft</p>
      <h2 className="mt-1 font-display text-3xl">BUILD A PLAYER FROM REAL SEASONS</h2>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">Fill all six buckets with real player-season donors. Each round draws four cards — target a slot, pick a card, and their observed rate fills the bucket. Complete the board to forge the composite and tour the league.</p>
      <div className="mt-4 flex flex-wrap gap-2">{BUCKETS.map(bucket => <span key={bucket.key} className="rounded-lg border border-border/30 bg-canvas/30 px-3 py-1.5 text-[11px] text-muted-foreground">{bucket.label} <span className="font-mono text-gold">{bucket.metric}</span> · weight {Math.round(bucket.weight * 100)}%</span>)}</div>
      <button type="button" onClick={start} className="mt-5 flex min-h-11 items-center gap-2 rounded-lg bg-primary px-6 text-sm font-semibold text-primary-foreground"><Play className="h-4 w-4" />Start drafting</button>
    </div>}
    {phase === 'drafting' && <>
      <div className="court-panel p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><p className="court-kicker">Bucket draft</p><h2 className="mt-1 font-display text-2xl">FILL THE BOARD</h2><p className="mt-1 text-xs text-muted-foreground">Target: <span className="text-gold">{activeBucket.label}</span> · {activeBucket.hint}. Tap another empty slot to retarget; cards are drawn from {pool.length} eligible seasons.</p></div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-gold" role="status">{filled} / {BUCKETS.length} filled</span>
            <button type="button" onClick={reroll} className="flex min-h-10 items-center gap-2 rounded-lg border border-input px-3 text-xs text-foreground hover:border-gold/40 hover:text-gold"><Dices className="h-3.5 w-3.5" />Redraw cards</button>
          </div>
        </div>
        <div className="mt-4"><BucketBoard buckets={BUCKETS} picks={picks} activeKey={activeKey} onActivate={setActiveKey} onUndo={undo} complete={false} /></div>
      </div>
      <BucketCandidates candidates={candidates} bucket={activeBucket} onPick={pickPlayer} />
    </>}
    {phase === 'complete' && <div className="space-y-4">
      <BucketBoard buckets={BUCKETS} picks={picks} activeKey={null} onActivate={() => {}} onUndo={undo} complete />
      <BucketSummary buckets={BUCKETS} picks={picks} overall={overall} leagueMax={leagueMax} onRestart={start} />
      <ForgeLeagueTour league={league} buckets={BUCKETS} picks={picks} />
    </div>}
  </section>;
}