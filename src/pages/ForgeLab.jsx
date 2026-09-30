import React, { useMemo, useState } from 'react';
import { RotateCcw, Swords } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import StudioShell from '@/components/studio/StudioShell';
import WorkbenchHeader from '@/components/studio/WorkbenchHeader';
import SourceStatus from '@/components/studio/SourceStatus';
import DonorRecipe from '@/components/forge/DonorRecipe';
import ForgeVisual from '@/components/forge/ForgeVisual';
import TourVisual from '@/components/forge/TourVisual';

import useSeasonSource from '@/hooks/useSeasonSource';
import { simSingleGame } from '@/lib/season/simEngine';

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

export default function ForgeLab() {
  const { year, setYear, years, source, league, state, error, retry } = useSeasonSource();
  const [codeA, setCodeA] = useState('');
  const [codeB, setCodeB] = useState('');
  const [mix, setMix] = useState(60);
  const [tour, setTour] = useState(null);
  const [locked, setLocked] = useState(false);

  const teams = league?.teams || [];
  const teamA = league ? league.byCode.get(codeA || teams[0]?.code) : null;
  const teamB = league ? league.byCode.get(codeB || teams[1]?.code) : null;

  const composite = useMemo(() => {
    if (!teamA || !teamB) return null;
    const wA = mix / 100;
    const blend = (a, b) => wA * a + (1 - wA) * b;
    const roster = [...teamA.roster, ...teamB.roster]
      .sort((a, b) => b.minutes - a.minutes)
      .slice(0, 10);
    return {
      ...teamA,
      code: 'CMP',
      name: `${teamA.code}+${teamB.code} composite`,
      off: blend(teamA.off, teamB.off),
      def: blend(teamA.def, teamB.def),
      pace: blend(teamA.pace, teamB.pace),
      efg: blend(teamA.efg, teamB.efg),
      ftr: blend(teamA.ftr, teamB.ftr),
      orb: blend(teamA.orb, teamB.orb),
      drb: blend(teamA.drb, teamB.drb),
      tov: blend(teamA.tov, teamB.tov),
      oppEfg: blend(teamA.oppEfg, teamB.oppEfg),
      oppFtr: blend(teamA.oppFtr, teamB.oppFtr),
      oppTov: blend(teamA.oppTov, teamB.oppTov),
      roster,
    };
  }, [teamA, teamB, mix]);

  const net = composite ? composite.off - composite.def : 0;
  const rank = composite && league ? 1 + league.teams.filter(t => t.net > net).length : 0;

  const runTour = () => {
    if (!composite || !league) return;
    let wins = 0; let marginSum = 0;
    const rows = [];
    league.teams.forEach((opponent, index) => {
      const compHome = index % 2 === 0;
      const game = compHome
        ? simSingleGame(league, composite, opponent, { seed: Math.floor(Math.random() * 4294967296) })
        : simSingleGame(league, opponent, composite, { seed: Math.floor(Math.random() * 4294967296) });
      const compPts = compHome ? game.homePts : game.awayPts;
      const oppPts = compHome ? game.awayPts : game.homePts;
      if (compPts > oppPts) wins += 1;
      marginSum += compPts - oppPts;
      rows.push({ code: opponent.code, name: opponent.name, compPts, oppPts, margin: compPts - oppPts });
    });
    rows.sort((a, b) => b.margin - a.margin);
    setTour({ wins, losses: rows.length - wins, rows, avgMargin: marginSum / rows.length });
  };

  return (
    <StudioShell active="/forge">
      <WorkbenchHeader title="COMPOSITE FORGE" description="Choose two observed team profiles, review the donor recipe, then test a clearly labeled local scenario." steps={['Donors', 'Recipe', 'Tour']} current={tour ? 2 : locked ? 1 : 0} state={state} status={tour ? 'Tour complete' : locked ? 'Recipe locked · ready to run' : 'Choose your donors'} />
      <main className="mx-auto max-w-6xl space-y-5 px-4 py-6">
        <SourceStatus state={state} error={error} source={source} year={year} years={years} onYearChange={value => { setYear(value); setTour(null); setLocked(false); }} onRetry={retry} disabled={locked} />
        {state === 'ready' && teamA && teamB && composite && (
          <>
            <section className="court-panel p-5">
              <fieldset disabled={locked} className="grid gap-4 sm:grid-cols-3">
                <TeamSelect teams={teams} value={teamA.code} onChange={value => { setCodeA(value); setTour(null); }} label="Roster A" />
                <TeamSelect teams={teams} value={teamB.code} onChange={value => { setCodeB(value); setTour(null); }} label="Roster B" />
                <div>
                  <span className="mb-1.5 block text-xs font-medium text-muted-foreground">Blend · {mix}% A</span>
                  <div className="pt-3">
                    <Slider value={[mix]} min={0} max={100} step={5} onValueChange={([value]) => { setMix(value); setTour(null); }} />
                  </div>
                </div>
              </fieldset>
            </section>
            <ForgeVisual teamA={teamA} teamB={teamB} mix={mix} composite={composite} locked={locked} />
            <DonorRecipe teamA={teamA} teamB={teamB} mix={mix} year={year} locked={locked} onLock={() => setLocked(value => !value)} />

            <section className="court-panel p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="court-display text-3xl text-foreground">{composite.name.toUpperCase()}</h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Conditional profile rank by net rating: #{rank} of {league.teams.length + 1} · {locked ? 'Recipe locked' : 'Lock recipe before running'}
                  </p>
                </div>
                <Button onClick={runTour} disabled={!locked} className="gap-2">
                  <Swords className="h-4 w-4" /> Run league tour
                </Button>
              </div>
            </section>

            {tour && (
              <section className="court-panel p-5">
                <div className="flex items-center justify-between">
                  <h3 className="court-display text-xl text-foreground">
                    LEAGUE TOUR · {tour.wins}–{tour.losses} · avg margin {tour.avgMargin >= 0 ? '+' : ''}{tour.avgMargin.toFixed(1)}
                  </h3>
                  <Button variant="ghost" size="sm" onClick={runTour} className="gap-1 text-muted-foreground">
                    <RotateCcw className="h-3.5 w-3.5" /> Re-roll
                  </Button>
                </div>
                <TourVisual tour={tour} />
                <div className="mt-5 max-h-96 overflow-auto pr-1" tabIndex={0} aria-label="League tour results">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-muted-foreground">
                        <th className="py-1 text-left font-medium">OPPONENT</th>
                        <th className="py-1 text-right font-medium">CMP</th>
                        <th className="py-1 text-right font-medium">OPP</th>
                        <th className="py-1 text-right font-medium">MARGIN</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tour.rows.map(row => (
                        <tr key={row.code} className="border-t border-border/40">
                          <td className="py-1.5">{row.name}</td>
                          <td className="text-right font-mono text-goldSoft">{row.compPts}</td>
                          <td className="text-right font-mono">{row.oppPts}</td>
                          <td className={`text-right font-mono ${row.margin > 0 ? 'text-positive' : 'text-trim'}`}>
                            {row.margin > 0 ? '+' : ''}{row.margin}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
          </>
        )}
      </main>
    </StudioShell>
  );
}