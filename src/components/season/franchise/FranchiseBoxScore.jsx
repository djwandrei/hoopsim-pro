import React from 'react';
import { Activity } from 'lucide-react';
import { FranchiseTeamMark } from './FranchiseTeamMark';

// Latest game: a scoreboard header with winner emphasis, then one stat table
// per team with the team-totals footer preserved from the ledger's receipt.
export default function FranchiseBoxScore({ view }) {
  const box = view.box || {};
  const groups = box.groups || [];
  const home = groups[0] ?? null;
  const away = groups[1] ?? null;
  return (
    <section className="court-panel frx-panel space-y-3 p-4" aria-labelledby="frx-box-title">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className="frx-head-icon"><Activity className="h-4 w-4" aria-hidden="true" /></span>
          <div><p className="bcast-kicker">Latest game</p><h3 className="frx-title">Box score</h3></div>
        </div>
        {box.headline && <span className="frx-pill frx-pill--live">{box.headline}</span>}
      </div>
      {box.empty ? <p className="frx-note">{box.empty}</p> : (
        <>
          {home && away && (
            <div className="frx-scoreboard">
              <div className="frx-scoreboard__side">
                <FranchiseTeamMark code={away.code} />
                <strong>{away.code}</strong>
                <span className={`frx-scoreboard__score ${away.score < home.score ? 'frx-scoreboard__loser' : 'frx-scoreboard__score--winner'}`}>{away.score}</span>
              </div>
              <span className="frx-scoreboard__final">Final</span>
              <div className="frx-scoreboard__side">
                <FranchiseTeamMark code={home.code} />
                <strong>{home.code}</strong>
                <span className={`frx-scoreboard__score ${home.score < away.score ? 'frx-scoreboard__loser' : 'frx-scoreboard__score--winner'}`}>{home.score}</span>
              </div>
            </div>
          )}
          <div className="grid gap-4 xl:grid-cols-2">
            {groups.map(group => (
              <div key={group.code} className="min-w-0 overflow-x-auto">
                <div className="flex items-center gap-2 py-1.5">
                  <FranchiseTeamMark code={group.code} />
                  <span className="font-display text-sm tracking-wide">{group.code}</span>
                  <span className="frx-pill frx-pill--slate">{group.score} pts</span>
                </div>
                {group.empty ? <p className="frx-note">{group.empty}</p> : (
                  <table className="w-full min-w-[30rem]">
                    <thead>
                      <tr><th scope="col">Player</th>{box.statLabels.map(label => <th key={label} scope="col">{label}</th>)}</tr>
                    </thead>
                    <tbody>
                      {group.rows.map((row, index) => (
                        <tr key={index}><td>{row.name}</td>{row.cells.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>
                      ))}
                    </tbody>
                    {group.totals && (
                      <tfoot>
                        <tr><th scope="row">Team totals</th>{group.totals.map((cell, index) => <td key={index}>{cell}</td>)}</tr>
                      </tfoot>
                    )}
                  </table>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}