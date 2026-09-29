import React, { useMemo, useState } from 'react';
import { Loader2, Play, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import StudioShell from '@/components/studio/StudioShell';
import SeasonSelect from '@/components/studio/SeasonSelect';
import useSeasonSource from '@/hooks/useSeasonSource';
import { simSingleGame } from '@/lib/season/simEngine';
import { lineupChemistry, lineupTeam } from '@/lib/season/labs';

function TeamSelect({ teams, value, onChange, label, extraOptions }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-muted-foreground">{label}</span>
      <select
        className="w-full rounded-md border border-input bg-raised px-3 py-2 text-sm text-foreground"
        value={value}
        onChange={event => onChange(event.target.value)}
      >
        {extraOptions}
        {teams.map(team => <option key={team.code} value={team.code}>{team.name}</option>)}
      </select>
    </label>
  );
}

function MeterBar({ label, value }) {
  return (
    <div>
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{label}</span>
        <span className="font-mono">{value}</span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-raised">
        <div className="h-2 rounded-full bg-gold" style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
      </div>
    </div>
  );
}

export default function ChemistryLab() {
  const { year, setYear, years, league, state, error } = useSeasonSource();
  const [teamCode, setTeamCode] = useState('');
  const [lineup, setLineup] = useState([]);
  const [oppCode, setOppCode] = useState('league');
  const [test, setTest] = useState(null);

  const teams = league?.teams || [];
  const team = league ? league.byCode.get(teamCode || teams[0]?.code) : null;
  const roster = team?.roster || [];
  const chemistry = useMemo(() => (lineup.length === 5 ? lineupChemistry(lineup) : null), [lineup]);

  const avgTeam = useMemo(() => {
    if (!league) return null;
    const mean = key => league.teams.reduce((sum, t) => sum + t[key], 0) / league.teams.length;
    return {
      code: 'AVG', name: 'League average', conference: 'EAST',
      off: league.offAvg, def: league.defAvg, pace: mean('pace'), efg: mean('efg'),
      ftr: mean('ftr'), orb: mean('orb'), drb: mean('drb'), tov: mean('tov'),
      oppEfg: mean('oppEfg'), oppFtr: mean('oppFtr'), oppTov: mean('oppTov'), roster: [],
    };
  }, [league]);

  const togglePlayer = member => {
    setLineup(prev => (
      prev.some(p => p.playerRef === member.playerRef)
        ? prev.filter(p => p.playerRef !== member.playerRef)
        : prev.length < 5 ? [...prev, member] : prev
    ));
    setTest(null);
  };

  const runTest = () => {
    if (!team || !chemistry || !avgTeam) return;
    const opponent = oppCode === 'league' ? avgTeam : league.byCode.get(oppCode);
    const unit = lineupTeam(team, lineup, chemistry.overall);
    let wins = 0; let losses = 0; let marginSum = 0; let ptsSum = 0;
    for (let i = 0; i < 15; i += 1) {
      const unitHome = i % 2 === 0;
      const game = unitHome
        ? simSingleGame(league, unit, opponent, { seed: Math.floor(Math.random() * 4294967296) })
        : simSingleGame(league, opponent, unit, { seed: Math.floor(Math.random() * 4294967296) });
      const unitPts = unitHome ? game.homePts : game.awayPts;
      const oppPts = unitHome ? game.awayPts : game.homePts;
      if (unitPts > oppPts) wins += 1; else losses += 1;
      marginSum += unitPts - oppPts;
      ptsSum += unitPts;
    }
    setTest({
      wins, losses,
      avgMargin: marginSum / 15,
      avgPoints: ptsSum / 15,
      opponent: oppCode === 'league' ? 'League average' : oppCode,
    });
  };

  return (
    <StudioShell active="/chemistry">
      <header className="border-b border-border/50">
        <div className="mx-auto max-w-6xl px-4 pb-8 pt-10">
          <span className="court-kicker inline-flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-gold" />
            SWISHIQ STUDIO
          </span>
          <h1 className="court-display mt-2 text-5xl text-foreground">CHEMISTRY LAB</h1>
          <p className="mt-2 max-w-xl text-muted-foreground">
            Build a five-man lineup from any roster, score its fit, then simulate a 15-game run against any opponent.
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
        {state === 'ready' && team && (
          <div className="grid gap-5 lg:grid-cols-3">
            <div className="space-y-4">
              <SeasonSelect years={years} year={year} onChange={value => { setYear(value); setTeamCode(''); setLineup([]); setTest(null); }} />
              <TeamSelect
                teams={teams}
                value={team.code}
                onChange={value => { setTeamCode(value); setLineup([]); setTest(null); }}
                label="Roster"
              />
              <div className="court-panel p-4">
                <h3 className="court-display text-lg text-foreground">ROSTER · {team.code}</h3>
                <div className="mt-3 max-h-96 space-y-1 overflow-y-auto pr-1">
                  {roster.map(member => {
                    const chosen = lineup.some(p => p.playerRef === member.playerRef);
                    return (
                      <button
                        key={member.playerRef}
                        type="button"
                        onClick={() => togglePlayer(member)}
                        className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                          chosen ? 'bg-royal/30' : 'hover:bg-raised'
                        }`}
                      >
                        <span className="truncate">{member.name}</span>
                        <span className="shrink-0 font-mono text-xs text-muted-foreground">
                          {member.pts.toFixed(1)} / {member.reb.toFixed(1)} / {member.ast.toFixed(1)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="space-y-4 lg:col-span-2">
              <section className="court-panel p-5">
                <div className="flex items-center justify-between">
                  <h3 className="court-display text-xl text-foreground">SELECTED FIVE</h3>
                  <span className="font-mono text-xs text-muted-foreground">{lineup.length}/5</span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {lineup.map(member => (
                    <button
                      key={member.playerRef}
                      type="button"
                      onClick={() => togglePlayer(member)}
                      className="inline-flex items-center gap-1.5 rounded-full bg-royal/30 px-3 py-1 text-sm text-foreground hover:bg-trim/30"
                    >
                      {member.name}
                      <X className="h-3.5 w-3.5" />
                    </button>
                  ))}
                  {!lineup.length && <p className="text-sm text-muted-foreground">Tap five players from the roster.</p>}
                </div>
              </section>

              {chemistry && (
                <section className="court-panel p-5">
                  <div className="flex items-center justify-between">
                    <h3 className="court-display text-xl text-foreground">CHEMISTRY PROFILE</h3>
                    <div className="text-right">
                      <p className="court-display text-4xl text-gold">{chemistry.overall}</p>
                      <p className="text-xs text-muted-foreground">overall fit</p>
                    </div>
                  </div>
                  <div className="mt-4 space-y-3">
                    {chemistry.parts.map(part => (
                      <MeterBar key={part.label} label={part.label} value={part.value} />
                    ))}
                  </div>
                </section>
              )}

              <section className="court-panel p-5">
                <h3 className="court-display text-xl text-foreground">LINEUP TRIAL</h3>
                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                  <TeamSelect
                    teams={teams}
                    value={oppCode}
                    onChange={setOppCode}
                    label="Trial opponent"
                    extraOptions={<option value="league">League average</option>}
                  />
                  <div className="flex items-end">
                    <Button onClick={runTest} disabled={!chemistry} className="w-full gap-2">
                      <Play className="h-4 w-4" /> Test 15 games
                    </Button>
                  </div>
                </div>
                {test && (
                  <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {[
                      ['RECORD', `${test.wins}–${test.losses}`],
                      ['AVG MARGIN', test.avgMargin >= 0 ? `+${test.avgMargin.toFixed(1)}` : test.avgMargin.toFixed(1)],
                      ['LINEUP PPG', test.avgPoints.toFixed(1)],
                      ['VS', test.opponent],
                    ].map(([label, value]) => (
                      <div key={label} className="rounded-lg bg-raised/60 px-3 py-2">
                        <p className="text-xs text-muted-foreground">{label}</p>
                        <p className="court-display text-2xl text-foreground">{value}</p>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          </div>
        )}
      </main>
    </StudioShell>
  );
}