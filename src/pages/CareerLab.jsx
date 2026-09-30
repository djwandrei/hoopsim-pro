import React, { useMemo, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from 'recharts';
import { LineChart as LineChartIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import StudioShell from '@/components/studio/StudioShell';
import WorkbenchHeader from '@/components/studio/WorkbenchHeader';
import SourceStatus from '@/components/studio/SourceStatus';
import CareerEvidence from '@/components/career/CareerEvidence';
import WorkspaceEmpty from '@/components/studio/WorkspaceEmpty';

import PlayerPicker from '@/components/studio/PlayerPicker';
import useSeasonSource from '@/hooks/useSeasonSource';
import { observedPlayers, perGameStats, per36Stats, projectCareer } from '@/lib/season/labs';

const round1 = value => Number(value.toFixed(1));

export default function CareerLab() {
  const { year, setYear, years, source, state, error, retry } = useSeasonSource();
  const [player, setPlayer] = useState(null);
  const [age, setAge] = useState(24);
  const [span, setSpan] = useState(6);
  const [result, setResult] = useState(null);
  const [view, setView] = useState('evidence');

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
      <WorkbenchHeader title="CAREER LAB" description="Start with recorded season evidence. Conditional aging scenarios are a separate exploration; validated forecasts remain unavailable." steps={['Player', 'Recorded evidence', 'Local scenario']} current={player ? view === 'scenario' ? 2 : 1 : 0} />
      <main className="mx-auto max-w-6xl space-y-5 px-4 py-6">
        <SourceStatus state={state} error={error} source={source} year={year} years={years} onYearChange={value => { setYear(value); setPlayer(null); setResult(null); }} onRetry={retry} />
        {state === 'ready' && (
          <div className="grid gap-5 lg:grid-cols-3">
            <div className="space-y-4">
              <p className="court-kicker">Player browser</p>
              <PlayerPicker players={players} onSelect={selectPlayer} selectedRef={player?.playerRef} />
              <div className="court-panel p-4"><p className="text-xs text-muted-foreground">View</p><div className="mt-2 flex flex-wrap gap-2">{[['evidence','Recorded evidence'],['scenario','Local scenario']].map(([key,label]) => <button key={key} type="button" aria-pressed={view === key} onClick={() => setView(key)} className={view === key ? 'rounded-lg bg-gold/10 px-3 py-2 text-xs text-gold' : 'rounded-lg px-3 py-2 text-xs text-muted-foreground hover:bg-raised'}>{label}</button>)}</div></div>
              {view === 'scenario' && <div className="court-panel space-y-4 p-4">
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
                  <LineChartIcon className="h-4 w-4" /> Run local scenario
                </Button>
                <p className="text-xs text-muted-foreground">User-specified age and generic aging curves. These are conditional assumptions, not recorded biography or a validated forecast.</p>
              </div>}
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
                        Local scenario peak: age {result.peak.age} · {result.peak.pts36.p50.toFixed(1)} PTS/36
                      </span>
                    )}
                  </div>
                </section>
              )}

              {player && view === 'evidence' && <CareerEvidence player={player} source={source} year={year} />}
              {result && view === 'scenario' && (
                <>
                  <section className="court-panel p-5">
                    <h3 className="court-display text-xl text-foreground">CONDITIONAL SCORING PATH · PTS / 36</h3>
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
                    <h3 className="court-display text-xl text-foreground">LOCAL SCENARIO ROWS · NOT A FORECAST</h3>
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
                <WorkspaceEmpty title="START WITH RECORDED EVIDENCE">Choose a player to review source season stints. Local aging scenarios are kept in a separate view.</WorkspaceEmpty>
              )}
            </div>
          </div>
        )}
      </main>
    </StudioShell>
  );
}