import React, { useState } from 'react';
import { Play, RotateCcw, Swords, Trophy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import StudioShell from '@/components/studio/StudioShell';
import WorkbenchHeader from '@/components/studio/WorkbenchHeader';
import SourceStatus from '@/components/studio/SourceStatus';
import MatchupReview from '@/components/game/MatchupReview';
import WorkspaceEmpty from '@/components/studio/WorkspaceEmpty';
import useSeasonSource from '@/hooks/useSeasonSource';
import { simSingleGame } from '@/lib/season/simEngine';

const CAMPAIGN_STORE = 'djhc:swishiq:game-campaign:v1:base44';
const BOX_HEAD = ['MIN', 'PTS', 'REB', 'AST', 'STL', 'BLK'];

function readStore(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch { return fallback; }
}

function TeamSelect({ teams, value, onChange, label }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-muted-foreground">{label}</span>
      <select
        className="w-full rounded-md border border-input bg-raised px-3 py-2 text-sm text-foreground"
        value={value}
        onChange={event => onChange(event.target.value)}
      >
        {teams.map(team => <option key={team.code} value={team.code}>{team.name}</option>)}
      </select>
    </label>
  );
}

function BoxTable({ title, box }) {
  return (
    <div className="court-panel p-4">
      <h3 className="court-display text-xl text-foreground">{title}</h3>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-96 text-sm">
          <thead>
            <tr className="text-xs text-muted-foreground">
              <th className="py-1 text-left font-medium">PLAYER</th>
              {BOX_HEAD.map(head => <th key={head} className="py-1 text-right font-medium">{head}</th>)}
            </tr>
          </thead>
          <tbody>
            {box.lines.map(line => (
              <tr key={line.name} className="border-t border-border/40">
                <td className="py-1.5 pr-2">{line.name}</td>
                <td className="text-right font-mono text-muted-foreground">{line.min}</td>
                <td className="text-right font-mono text-goldSoft">{line.pts}</td>
                <td className="text-right font-mono">{line.reb}</td>
                <td className="text-right font-mono">{line.ast}</td>
                <td className="text-right font-mono">{line.stl}</td>
                <td className="text-right font-mono">{line.blk}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function GameLab() {
  const { year, setYear, years, source, league, state, error, retry } = useSeasonSource();
  const [homeCode, setHomeCode] = useState('');
  const [awayCode, setAwayCode] = useState('');
  const [neutral, setNeutral] = useState(false);
  const [seed, setSeed] = useState(11);
  const [reviewMode, setReviewMode] = useState(null);
  const [result, setResult] = useState(null);
  const [series, setSeries] = useState(null);
  const [campaign, setCampaign] = useState(() => readStore(CAMPAIGN_STORE, []));

  const ready = state === 'ready' && league;
  const teams = league?.teams || [];
  const home = homeCode || teams[0]?.code || '';
  const away = awayCode || teams[1]?.code || '';
  const sameTeams = home === away;

  const saveCampaign = entries => {
    setCampaign(entries);
    try { localStorage.setItem(CAMPAIGN_STORE, JSON.stringify(entries)); } catch { /* storage unavailable */ }
  };

  const playSingle = () => {
    if (!ready || sameTeams) return;
    const game = simSingleGame(league, league.byCode.get(home), league.byCode.get(away), { seed: Number(seed) >>> 0, neutral });
    setResult({ ...game, replaySeed: Number(seed) >>> 0 });
    setReviewMode(null);
    setSeries(null);
  };

  const playSeries = () => {
    if (!ready || sameTeams) return;
    const homeTeam = league.byCode.get(home);
    const awayTeam = league.byCode.get(away);
    const homeGames = [1, 2, 5, 7];
    const results = [];
    let hw = 0; let aw = 0;
    for (let n = 1; hw < 4 && aw < 4; n += 1) {
      const isHome = homeGames.includes(n);
      const game = isHome
        ? simSingleGame(league, homeTeam, awayTeam, { seed: (Number(seed) + n - 1) >>> 0, neutral })
        : simSingleGame(league, awayTeam, homeTeam, { seed: (Number(seed) + n - 1) >>> 0, neutral });
      const hp = isHome ? game.homePts : game.awayPts;
      const ap = isHome ? game.awayPts : game.homePts;
      if (hp > ap) hw += 1; else aw += 1;
      results.push({
        n, home: isHome ? home : away, away: isHome ? away : home,
        homePts: game.homePts, awayPts: game.awayPts,
      });
    }
    const winner = hw > aw ? home : away;
    const loser = winner === home ? away : home;
    setSeries({ home, away, results, winner, hw, aw, replaySeed: Number(seed) >>> 0 });
    setReviewMode(null);
    setResult(null);
    saveCampaign([...campaign, {
      label: `${winner} defeated ${loser} ${Math.max(hw, aw)}–${Math.min(hw, aw)}`,
    }].slice(-20));
  };

  const homeBox = result?.boxHome || null;
  const awayBox = result?.boxAway || null;

  return (
    <StudioShell active="/game">
      <WorkbenchHeader title="GAME LAB" description="Set the exact-season matchup, review the supported decisions, then run and replay a seeded local simulation." steps={['Mode & setup', 'Decisions', 'Results & replay']} current={reviewMode ? 1 : result || series ? 2 : 0} />
      <main className="mx-auto max-w-6xl space-y-5 px-4 py-6">
        <SourceStatus state={state} error={error} source={source} year={year} years={years} onYearChange={value => { setYear(value); setResult(null); setSeries(null); setReviewMode(null); }} onRetry={retry} />
        {ready && (
          <>
            <section className="court-panel p-5">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <label className="block"><span className="mb-1.5 block text-xs text-muted-foreground">Replay seed</span><input type="number" min={0} max={4294967295} value={seed} onChange={event => { setSeed(event.target.value); setResult(null); setSeries(null); setReviewMode(null); }} className="min-h-10 w-full rounded-md border border-input bg-raised px-3 text-sm" /></label>
                <TeamSelect teams={teams} value={home} onChange={value => { setHomeCode(value); setResult(null); setSeries(null); setReviewMode(null); }} label="Home team" />
                <TeamSelect teams={teams} value={away} onChange={value => { setAwayCode(value); setResult(null); setSeries(null); setReviewMode(null); }} label="Away team" />
                <div className="flex items-end">
                  <div className="flex w-full items-center justify-between rounded-md border border-input bg-raised px-3 py-2">
                    <span className="text-sm text-foreground">Neutral court</span>
                    <Switch aria-label="Neutral court" checked={neutral} onCheckedChange={value => { setNeutral(value); setResult(null); setSeries(null); setReviewMode(null); }} />
                  </div>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-3">
                <Button onClick={() => setReviewMode('single')} disabled={sameTeams || seed === '' || !Number.isInteger(Number(seed)) || Number(seed) < 0 || Number(seed) > 4294967295} className="gap-2">
                  <Play className="h-4 w-4" /> Review single game
                </Button>
                <Button onClick={() => setReviewMode('series')} disabled={sameTeams || seed === '' || !Number.isInteger(Number(seed)) || Number(seed) < 0 || Number(seed) > 4294967295} variant="outline" className="gap-2 border-gold/50 text-goldSoft hover:bg-gold/10">
                  <Swords className="h-4 w-4" /> Review best-of-seven
                </Button>
                {sameTeams && <span className="self-center text-sm text-trim">Pick two different teams.</span>}
              </div>
            </section>

            {reviewMode && <MatchupReview home={home} away={away} year={year} neutral={neutral} seed={seed} mode={reviewMode} onRun={reviewMode === 'single' ? playSingle : playSeries} onBack={() => setReviewMode(null)} />}
            {!result && !series && !reviewMode && <WorkspaceEmpty title="SET YOUR MATCHUP">Choose two different teams and a seed. Review the supported inputs before running; games are computed in one step, without live possession controls.</WorkspaceEmpty>}
            {result && (
              <>
                <section className="court-panel p-6 text-center">
                  <div className="flex items-center justify-center gap-3 sm:gap-6">
                    <div>
                      <p className="font-display text-xl tracking-widest text-muted-foreground">{home}</p>
                      <p className="court-display text-5xl text-foreground sm:text-7xl">{result.homePts}</p>
                    </div>
                    <div className="text-center">
                      <p className="font-display text-sm tracking-widest text-gold">{result.ot ? `FINAL/${result.ot}OT` : 'FINAL'}</p>
                      <p className="mt-1 font-mono text-xs text-muted-foreground">{Math.round(result.poss)} poss</p>
                    </div>
                    <div>
                      <p className="font-display text-xl tracking-widest text-muted-foreground">{away}</p>
                      <p className="court-display text-5xl text-foreground sm:text-7xl">{result.awayPts}</p>
                    </div>
                  </div>
                  <p className="mt-3 font-mono text-xs text-muted-foreground">
                    ORTG {result.ortgH.toFixed(1)} vs {result.ortgA.toFixed(1)} · seed {result.replaySeed}
                  </p>
                  <p className="mt-3 text-xs text-muted-foreground">Modeled final score and player box scores · not observed results.</p>
                  <Button className="mt-4" variant="outline" onClick={playSingle}><RotateCcw className="h-4 w-4" />Replay same seed</Button>
                </section>
                <div className="grid gap-4 lg:grid-cols-2">
                  {homeBox && <BoxTable title={`${home} box score`} box={homeBox} />}
                  {awayBox && <BoxTable title={`${away} box score`} box={awayBox} />}
                </div>
              </>
            )}

            {series && (
              <section className="court-panel p-5">
                <div className="flex items-center gap-2">
                  <Trophy className="h-5 w-5 text-gold" />
                  <h3 className="court-display text-2xl text-foreground">
                    {series.winner} WIN {Math.max(series.hw, series.aw)}–{Math.min(series.hw, series.aw)}
                  </h3>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">Local series simulation · base seed {series.replaySeed} · successive game seeds increment by one.</p>
                <Button className="mt-3" variant="outline" onClick={playSeries}><RotateCcw className="h-4 w-4" />Replay same series seed</Button>
                <div className="mt-3 space-y-1">
                  {series.results.map(game => (
                    <div key={game.n} className="flex items-center justify-between rounded-lg bg-raised/60 px-3 py-1.5 text-sm">
                      <span className="text-muted-foreground">G{game.n}</span>
                      <span className="font-mono">{game.home} {game.homePts} — {game.awayPts} {game.away}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section className="court-panel p-5">
              <div className="flex items-center justify-between">
                <h3 className="court-display text-xl text-foreground">CAMPAIGN LOG</h3>
                {campaign.length > 0 && (
                  <Button variant="ghost" size="sm" onClick={() => saveCampaign([])} className="gap-1 text-muted-foreground">
                    <RotateCcw className="h-3.5 w-3.5" /> Reset
                  </Button>
                )}
              </div>
              {campaign.length ? (
                <ul className="mt-3 space-y-1 text-sm text-muted-foreground">
                  {[...campaign].reverse().map((entry, index) => (
                    <li key={index} className="rounded-lg bg-raised/60 px-3 py-1.5">{entry.label}</li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-sm text-muted-foreground">No series played yet — run one above and it lands here.</p>
              )}
            </section>
          </>
        )}
      </main>
    </StudioShell>
  );
}