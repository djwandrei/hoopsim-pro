import React, { useMemo, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from 'recharts';
import { LineChart as LineChartIcon, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import StudioShell from '@/components/studio/StudioShell';
import SeasonSelect from '@/components/studio/SeasonSelect';
import PlayerPicker from '@/components/studio/PlayerPicker';
import useSeasonSource from '@/hooks/useSeasonSource';
import { observedPlayers, perGameStats, per36Stats, projectCareer } from '@/lib/season/labs';

const round1 = value => Number(value.toFixed(1));

export default function CareerLab() {
  const { year, setYear, years, source, state, error } = useSeasonSource();
  const [player, setPlayer] = useState(null);
  const [age, setAge] = useState(24);
  const [span, setSpan] = useState(6);
  const [result, setResult] = useState(null);

  const players = useMemo(() => (source ? observedPlayers(source) : []), [source]);
  const gameStats = player ? perGameStats(player) : null;
  const rateStats = player ? per36Stats(player) : null;

  const selectPlayer = next => {
    setPlayer(next);
    setResult(null);
  };

  const run = () => {
    if (!player) return;
    setResult(projectCareer(player, {
      startAge: age, seasons: span, seed: Math.floor(Math.random() * 4294967296),
    }));
  };

  const chartData = result
    ? result.seasons.map(row => ({ age: row.age, p10: round1(row.pts36.p10), p50: round1(row.pts36.p50), p90: round1(row.pts36.p90) }))
    : [];

  return (
    <StudioShell active="/career">
      <header className="border-b border-border/50">
        <div className="mx-auto max-w-6xl px-4 pb-8 pt-10">
          <span className="court-kicker inline-flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-gold" />
            SWISHIQ STUDIO
          </span>
          <h1 className="court-display mt-2 text-5xl text-foreground">CAREER LAB</h1>
          <p className="mt-2 max-w-xl text-muted-foreground">
            Project a player&apos;s future seasons with aging-curve Monte Carlo — median paths and confidence bands for scoring, rebounds and playmaking.
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
        {state === 'ready' && (
          <div className="grid gap-5 lg:grid-cols-3">
            <div className="space-y-4">
              <SeasonSelect years={years} year={year} onChange={value => { setYear(value); setPlayer(null); setResult(null); }} />
              <PlayerPicker players={players} onSelect={selectPlayer} selectedRef={player?.playerRef} />
              <div className="court-panel space-y-4 p-4">
                <div>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Current age</span>
                    <span className="font-mono text-foreground">{age}</span>
                  </div>
                  <div className="pt-2">
                    <Slider value={[age]} min={19} max={38} step={1} onValueChange={([value]) => { setAge(value); setResult(null); }} />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Seasons to project</span>
                    <span className="font-mono text-foreground">{span}</span>
                  </div>
                  <div className="pt-2">
                    <Slider value={[span]} min={3} max={10} step={1} onValueChange={([value]) => { setSpan(value); setResult(null); }} />
                  </div>
                </div>
                <Button onClick={run} disabled={!player} className="w-full gap-2">
                  <LineChartIcon className="h-4 w-4" /> Project career
                </Button>
              </div>
            </div>

            <div className="space-y-4 lg:col-span-2">
              {player && gameStats && (
                <section className="court-panel p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="court-display text-3xl text-foreground">{player.name}</h2>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {player.teamCode} · baseline {gameStats.mpg.toFixed(1)} MPG · {rateStats.pts.toFixed(1)} / {rateStats.reb.toFixed(1)} / {rateStats.ast.toFixed(1)} per 36
                      </p>
                    </div>
                    {result && (
                      <span className="rounded-full border border-gold/40 bg-gold/10 px-3 py-1 text-xs text-goldSoft">
                        Peak projection: age {result.peak.age} · {result.peak.pts36.p50.toFixed(1)} PTS/36
                      </span>
                    )}
                  </div>
                </section>
              )}

              {result && (
                <>
                  <section className="court-panel p-5">
                    <h3 className="court-display text-xl text-foreground">SCORING PATH (PTS PER 36)</h3>
                    <div className="mt-3">
                      <ResponsiveContainer width="100%" height={260}>
                        <LineChart data={chartData} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
                          <CartesianGrid stroke="rgba(108,122,142,0.25)" strokeDasharray="3 3" />
                          <XAxis dataKey="age" tick={{ fill: '#B1BED2', fontSize: 12 }} stroke="rgba(108,122,142,0.4)" />
                          <YAxis tick={{ fill: '#B1BED2', fontSize: 12 }} stroke="rgba(108,122,142,0.4)" domain={['dataMin - 1', 'dataMax + 1']} />
                          <Tooltip
                            contentStyle={{ background: '#19233B', border: '1px solid #6C7A8E', borderRadius: 8, color: '#F4F6FA' }}
                            labelStyle={{ color: '#E9B949' }}
                          />
                          <Line type="monotone" dataKey="p90" stroke="#6C7A8E" strokeDasharray="4 4" dot={false} name="P90" />
                          <Line type="monotone" dataKey="p50" stroke="#E9B949" strokeWidth={2.5} dot={{ r: 3 }} name="Median" />
                          <Line type="monotone" dataKey="p10" stroke="#6C7A8E" strokeDasharray="4 4" dot={false} name="P10" />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </section>

                  <section className="court-panel p-5">
                    <h3 className="court-display text-xl text-foreground">PROJECTED SEASONS</h3>
                    <div className="mt-3 overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-xs text-muted-foreground">
                            <th className="py-1 text-left font-medium">AGE</th>
                            <th className="py-1 text-right font-medium">MPG</th>
                            <th className="py-1 text-right font-medium">PTS/36</th>
                            <th className="py-1 text-right font-medium">REB/36</th>
                            <th className="py-1 text-right font-medium">AST/36</th>
                          </tr>
                        </thead>
                        <tbody>
                          {result.seasons.map(row => (
                            <tr key={row.age} className="border-t border-border/40">
                              <td className="py-1.5">{row.age}</td>
                              <td className="text-right font-mono text-muted-foreground">{row.mpg.toFixed(1)}</td>
                              <td className="text-right font-mono text-goldSoft">{row.pts36.p50.toFixed(1)}</td>
                              <td className="text-right font-mono">{row.reb36.toFixed(1)}</td>
                              <td className="text-right font-mono">{row.ast36.toFixed(1)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                </>
              )}

              {!player && (
                <p className="rounded-xl border border-border/50 bg-card p-8 text-center text-sm text-muted-foreground">
                  Select a player and set their current age to project a career.
                </p>
              )}
            </div>
          </div>
        )}
      </main>
    </StudioShell>
  );
}