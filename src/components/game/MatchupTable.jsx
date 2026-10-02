import React from 'react';
const ROWS = [['off','Offensive rating',false],['def','Defensive rating',true],['net','Net rating',false],['pace','Pace',false],['efg','eFG%',false],['oppEfg','Opponent eFG%',true],['orb','Off. rebound rate',false],['drb','Def. rebound rate',false],['tov','Turnovers',true],['oppTov','Opponent turnovers',false]];
const better = (a,b,invert) => a === b ? 0 : (invert ? a < b : a > b) ? -1 : 1;
export default function MatchupTable({ teamA,teamB }) {
  return (
    <section className="court-panel p-5">
      <p className="court-kicker">Stat sheet</p>
      <h2 className="mt-1 font-display text-2xl">HEAD-TO-HEAD</h2>
      <p className="mt-2 text-xs text-muted-foreground">Observed full-season team rates; each leading value is marked in that team's color.</p>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="text-left">Metric</th>
              <th data-team-side="home" className="text-right">{teamA.code}</th>
              <th data-team-side="away" className="text-right">{teamB.code}</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map(([key,label,invert]) => {
              const av = teamA[key],bv = teamB[key];
              const result = Number.isFinite(av) && Number.isFinite(bv) ? better(av,bv,invert) : 0;
              return (
                <tr key={key} className="border-b border-border/25">
                  <td className="py-2 text-left text-xs text-muted-foreground">{label}</td>
                  <td data-team-side="home" className={`py-2 text-right myna-mono ${result < 0 ? 'font-semibold matchup-side-cell' : ''}`}>{Number.isFinite(av) ? av.toFixed(1) : '—'}</td>
                  <td data-team-side="away" className={`py-2 text-right myna-mono ${result > 0 ? 'font-semibold matchup-side-cell' : ''}`}>{Number.isFinite(bv) ? bv.toFixed(1) : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}