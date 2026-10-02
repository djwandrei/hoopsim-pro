import React from 'react';
import { Crown } from 'lucide-react';
import { paletteForTeam } from '@/components/djhc/basketballPalettes';

const pct = v => `${(v * 100).toFixed(1)}%`;
const tri = (x, y) => (x > y ? true : x < y ? false : null);

export default function GameRecap({ game, home, away }) {
  const stH = game.statsHome; const stA = game.statsAway;
  if (!stH || !stA) return null;
  const homeWon = game.homePts > game.awayPts;
  const winner = homeWon ? home : away;
  const wPts = homeWon ? game.homePts : game.awayPts;
  const lPts = homeWon ? game.awayPts : game.homePts;
  const palette = paletteForTeam(winner.code);
  const otLabel = game.ot ? ` (${game.ot === 1 ? 'OT' : `${game.ot}OT`})` : '';

  const topFor = box => (box?.lines || []).slice()
    .sort((x, y) => (y.pts + y.reb * 0.8 + y.ast * 0.8) - (x.pts + x.reb * 0.8 + x.ast * 0.8))
    .slice(0, 3);
  const mvp = [
    ...topFor(game.boxHome).map(line => ({ ...line, team: home.code })),
    ...topFor(game.boxAway).map(line => ({ ...line, team: away.code })),
  ].sort((x, y) => (y.pts + y.reb * 0.8 + y.ast * 0.8) - (x.pts + x.reb * 0.8 + x.ast * 0.8))[0];

  const rows = [
    { label: 'eFG%', h: pct(stH.efg), a: pct(stA.efg), winH: tri(stH.efg, stA.efg) },
    { label: 'Field goals', h: `${Math.round(stH.fgm)}/${Math.round(stH.fga)}`, a: `${Math.round(stA.fgm)}/${Math.round(stA.fga)}`, winH: tri(stH.fgm / Math.max(1, stH.fga), stA.fgm / Math.max(1, stA.fga)) },
    { label: 'Free throws', h: `${Math.round(stH.ftm)}/${Math.round(stH.fta)}`, a: `${Math.round(stA.ftm)}/${Math.round(stA.fta)}`, winH: tri(stH.ftm / Math.max(1, stH.fta), stA.ftm / Math.max(1, stA.fta)) },
    { label: 'Rebounds', h: `${stH.reb} (${stH.orb} off)`, a: `${stA.reb} (${stA.orb} off)`, winH: tri(stH.reb, stA.reb) },
    { label: 'Assists', h: String(stH.ast), a: String(stA.ast), winH: tri(stH.ast, stA.ast) },
    { label: 'Turnovers', h: String(Math.round(stH.tov)), a: String(Math.round(stA.tov)), winH: tri(stA.tov, stH.tov) },
    { label: 'ORtg (est.)', h: game.ortgH.toFixed(1), a: game.ortgA.toFixed(1), winH: tri(game.ortgH, game.ortgA) },
  ];

  return (
    <section className="court-panel overflow-hidden" aria-label="Post-game recap">
      <div className="p-5" style={{ background: `linear-gradient(115deg, ${palette.primary}33, transparent 65%)` }}>
        <span className="court-kicker">Post-game recap</span>
        <h2 className="court-display mt-1 text-3xl">{winner.name} take it {wPts}–{lPts}{otLabel}</h2>
        <span className="hero-rule mt-2" />
        {mvp && (
          <div className="mt-3 inline-flex max-w-full items-center gap-2 rounded-lg border border-gold/40 bg-gold/10 px-3 py-1.5 text-xs text-gold">
            <Crown className="h-3.5 w-3.5 shrink-0" />
            <span className="font-semibold tracking-[0.1em]">GAME MVP</span>
            <span className="truncate">{mvp.name} ({mvp.team}) — {Math.round(mvp.pts)} PTS · {Math.round(mvp.reb)} REB · {Math.round(mvp.ast)} AST</span>
          </div>
        )}
      </div>

      <div className="grid gap-4 border-t border-border/25 p-5 md:grid-cols-2">
        {[['away', away, game.boxAway], ['home', home, game.boxHome]].map(([side, team, box]) => {
          const tp = paletteForTeam(team.code);
          return (
            <div key={side} className="rounded-xl border border-border/25 bg-raised/30 p-4">
              <header className="flex items-center gap-2">
                <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: tp.primary }} />
                <span className="myna-display truncate text-base">{team.name}</span>
                <span className="myna-muted ml-auto hidden shrink-0 text-[10px] tracking-[0.2em] sm:block">TOP PERFORMERS</span>
              </header>
              <ol className="mt-2 space-y-1.5 text-xs">
                {topFor(box).map((line, i) => (
                  <li key={line.name} className="flex items-baseline gap-2">
                    <span className={`font-mono text-[10px] ${i === 0 ? 'text-gold' : 'myna-muted'}`}>{i + 1}</span>
                    <span className="min-w-0 flex-1 truncate font-medium">{line.name}</span>
                    <span className="myna-mono shrink-0 myna-muted">{Math.round(line.pts)} PTS · {Math.round(line.reb)} REB · {Math.round(line.ast)} AST</span>
                  </li>
                ))}
              </ol>
            </div>
          );
        })}
      </div>

      <div className="border-t border-border/25 p-5">
        <span className="court-kicker">Key team stats</span>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr>
                <th className="text-left">STAT</th>
                <th className="text-right">{away.code}</th>
                <th className="text-right">{home.code}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={row.label}>
                  <td className="myna-muted">{row.label}</td>
                  <td className={`text-right myna-mono ${row.winH === false ? 'text-gold' : ''}`}>{row.a}</td>
                  <td className={`text-right myna-mono ${row.winH === true ? 'text-gold' : ''}`}>{row.h}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="myna-muted mt-2 text-[10px]">Gold marks the better value in each matchup column. All modeled lines, never observed.</p>
      </div>
    </section>
  );
}