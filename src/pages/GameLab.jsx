import React, { useState } from 'react';
import { Loader2, Play, RotateCcw, Swords, Trophy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import StudioShell from '@/components/studio/StudioShell';
import SeasonSelect from '@/components/studio/SeasonSelect';
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
  const { year, setYear, years, league, state, error } = useSeasonSource();
  const [homeCode, setHomeCode] = useState('');
  const [awayCode, setAwayCode] = useState('');
  const [neutral, setNeutral] = useState(false);
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
    setResult(simSingleGame(league, league.byCode.get(home), league.byCode.get(away), {
      seed: Math.floor(Math.random() * 4294967296), neutral,
    }));
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
        ? simSingleGame(league, homeTeam, awayTeam, { seed: Math.floor(Math.random() * 4294967296), neutral })
        : simSingleGame(league, awayTeam, homeTeam, { seed: Math.floor(Math.random() * 4294967296), neutral });
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
    setSeries({ home, away, results, winner, hw, aw });
    setResult(null);
    saveCampaign([...campaign, {
      label: `${winner} defeated ${loser} ${Math.max(hw, aw)}–${Math.min(hw, aw)}`,
    }].slice(-20));
  };

  const homeBox = result?.boxHome || null;
  const awayBox = result?.boxAway || null;

  return (
    <StudioShell active="/game">
      <header className="border-b border-border/50">
        <div className="mx-auto max-w-6xl px-4 pb-8 pt-10">
          <span className="court-kicker inline-flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-gold" />
            SWISHIQ STUDIO
          </span>
          <h1 className="court-display mt-2 text-5xl text-foreground">GAME LAB</h1>
          <p className="mt-2 max-w-xl text-muted-foreground">
            Simulate any matchup with full box scores, then run best-of-seven series and keep your campaign record.
          </p>
        </div>
      </header>
      <main className="mx-auto max-w-6xl space-y-5 px-4 py-6">
        {state === 'loading' && (
          <div className="flex items-center gap-2 rounded-xl border border-border/50 bg-card p-8 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin text-gold" /> Loading the selected season package…
          </div>
        )}
        {state === 'error' && (
          <div className="rounded-xl border border-trim/50 bg-card p-6 text-sm text-trim">{error}</div>
        )}
        {ready && (
          <>
            <section className="court-panel p-5">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <SeasonSelect years={years} year={year} onChange={value => { setYear(value); setResult(null); setSeries(null); }} />
                <TeamSelect teams={teams} value={home} onChange={setHomeCode} label="Home team" />
                <TeamSelect teams={teams} value={away} onChange={setAwayCode} label="Away team" />
                <div className="flex items-end">
                  <div className="flex w-full items-center justify-between rounded-md border border-input bg-raised px-3 py-2">
                    <span className="text-sm text-foreground">Neutral court</span>
                    <Switch checked={neutral} onCheckedChange={setNeutral} />
                  </div>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-3">
                <Button onClick={playSingle} disabled={sameTeams} className="gap-2">
                  <Play className="h-4 w-4" /> Simulate game
                </Button>
                <Button onClick={playSeries} disabled={sameTeams} variant="outline" className="gap-2 border-gold/50 text-goldSoft hover:bg-gold/10">
                  <Swords className="h-4 w-4" /> Play best-of-7 series
                </Button>
                {sameTeams && <span className="self-center text-sm text-trim">Pick two different teams.</span>}
              </div>
            </section>

            {result && (
              <>
                <section className="court-panel p-6 text-center">
                  <div className="flex items-center justify-center gap-6">
                    <div>
                      <p className="font-display text-xl tracking-widest text-muted-foreground">{home}</p>
                      <p className="court-display text-7xl text-foreground">{result.homePts}</p>
                    </div>
                    <div className="text-center">
                      <p className="font-display text-sm tracking-widest text-gold">{result.ot ? `FINAL/${result.ot}OT` : 'FINAL'}</p>
                      <p className="mt-1 font-mono text-xs text-muted-foreground">{Math.round(result.poss)} poss</p>
                    </div>
                    <div>
                      <p className="font-display text-xl tracking-widest text-muted-foreground">{away}</p>
                      <p className="court-display text-7xl text-foreground">{result.awayPts}</p>
                    </div>
                  </div>
                  <p className="mt-3 font-mono text-xs text-muted-foreground">
                    ORTG {result.ortgH.toFixed(1)} vs {result.ortgA.toFixed(1)}
                  </p>
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