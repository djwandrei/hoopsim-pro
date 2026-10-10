import React, { useMemo } from 'react';
import { SKILLS } from './bapSkills.js';
import { forgeCompositeScore } from './forgePool.js';
import { getForgeCompositeOvrContext } from './forgeOverall.js';
import { buildForgeProfile, seededRandom, simulateForgeGame } from './forgeSimulation.js';
import TourVisual from './TourVisual';
import MetricTile from '@/components/studio/MetricTile';

export default function ForgeLeagueTour({ league, picks, group = 'All', seed = 41 }) {
  const ovr = forgeCompositeScore(picks, group), context = getForgeCompositeOvrContext(picks, group);
  const ratings = Object.fromEntries(SKILLS.map(skill => [skill.key, Number.isFinite(picks[skill.key]?.value) ? picks[skill.key].value : 75]));
  const composite = useMemo(() => {
    const roster = SKILLS.map(skill => {
      const player = picks[skill.key]?.player;
      return player ? { playerRef: player.playerRef, name: player.name, positions: player.positions, rotationMinutes: 240 / SKILLS.length, ratings: player } : null;
    }).filter(Boolean);
    return buildForgeProfile(league, ratings, { code: 'CMP', name: 'Composite Forge', conference: 'EAST', roster });
  }, [league, JSON.stringify(Object.values(picks).map(p => [p?.player?.playerRef, p?.value]))]);
  const tour = useMemo(() => {
    let wins = 0, losses = 0;
    const rows = league.teams.map((team, index) => {
      const margins = [];
      for (let trial = 0; trial < 32; trial++) {
        const rng = seededRandom((seed + (index + 1) * 65537 + trial * 104729) >>> 0);
        const game = simulateForgeGame(league, composite, team, rng, { neutral: true });
        margins.push(game.homePts - game.awayPts);
      }
      margins.sort((a, b) => a - b);
      const margin = margins.reduce((sum, value) => sum + value, 0) / margins.length, winRate = margins.filter(value => value > 0).length / margins.length;
      wins += winRate > .5 ? 1 : winRate === .5 ? .5 : 0; losses += winRate < .5 ? 1 : winRate === .5 ? .5 : 0;
      return { code: team.code, margin, winRate, low: margins[3], high: margins[28] };
    });
    return { wins, losses, avgMargin: rows.reduce((sum, row) => sum + row.margin, 0) / (rows.length || 1), rows, trialsPerTeam: 32 };
  }, [league, composite, seed]);
  return <section className="court-panel relative overflow-hidden p-5" aria-label="Composite league tour">
    <span className="bcast-watermark" aria-hidden="true">CMP</span>
    <header className="relative flex flex-wrap items-center justify-between gap-3">
      <div><p className="bcast-kicker">Modeled profile · {composite.name}</p><h3 className="mt-1 font-display text-2xl">COMPOSITE TOURS THE LEAGUE</h3><p className="mt-1 text-xs text-muted-foreground">Every selected skill changes the profile’s shooting, turnovers, free throws, rebounding, and defense. Each neutral matchup repeats {tour.trialsPerTeam} seeded games; percentages are model outcomes, not observed records.</p></div>
      <span className="bcast-lowerthird" role="status"><span className="bcast-lowerthird__bar" aria-hidden="true"></span>{tour.wins}–{tour.losses} matchup edges</span>
    </header>
    <div className="mt-4 grid gap-3 sm:grid-cols-4">
      <MetricTile label="Offensive rating" value={composite.off.toFixed(1)} detail="modeled points / 100 possessions" />
      <MetricTile label="Defensive rating" value={composite.def.toFixed(1)} detail="modeled points allowed / 100" tone="royal" />
      <MetricTile label="Net rating" value={composite.net.toFixed(1)} detail="modeled offense minus defense" />
      <MetricTile label="Pace" value={composite.pace.toFixed(1)} detail="modeled possessions / 48 min" tone="royal" />
    </div>
    <div className="mt-2 grid gap-2 sm:grid-cols-3"><MetricTile label="Effective FG%" value={`${(composite.efg * 100).toFixed(1)}%`} detail="rating adjusted" /><MetricTile label="Turnover rate" value={`${(composite.tov * 100).toFixed(1)}%`} detail="rating adjusted" tone="royal" /><MetricTile label="Composite OVR" value={ovr?.toFixed(0) ?? '—'} detail={context.label} /></div>
    <TourVisual tour={tour} />
    <div className="mt-3 max-h-72 overflow-auto rounded-lg border border-border/25"><table className="w-full text-xs"><thead className="sticky top-0 bg-card"><tr><th className="p-2 text-left">Opponent</th><th>Modeled win rate</th><th>Avg margin</th><th>Middle 80% margin</th></tr></thead><tbody>{tour.rows.map(row => <tr key={row.code} className="border-t border-border/20"><td className="p-2 text-left">{league.byCode.get(row.code)?.name || row.code}</td><td className="text-center">{(row.winRate * 100).toFixed(0)}%</td><td className="text-center">{row.margin > 0 ? '+' : ''}{row.margin.toFixed(1)}</td><td className="text-center">{row.low > 0 ? '+' : ''}{row.low} to {row.high > 0 ? '+' : ''}{row.high}</td></tr>)}</tbody></table></div>
  </section>;
}
