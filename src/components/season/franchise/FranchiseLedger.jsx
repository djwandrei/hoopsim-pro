import React from 'react';
import { Activity, ScrollText } from 'lucide-react';
import { FranchiseTeamMark } from './FranchiseTeamMark';

// Ledger: recent completed games and actions next to the latest box score.
export default function FranchiseLedger({ view }) {
  const { history, historyEmpty, box } = view;
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <section className="court-panel frx-panel space-y-2 p-4" aria-labelledby="frx-history-title">
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-gold/35 bg-gold/10 text-gold"><ScrollText className="h-4.5 w-4.5" aria-hidden="true" /></span>
          <div><p className="bcast-kicker">Ledger</p><h3 className="frx-title">Recent results &amp; actions</h3></div>
        </div>
        {historyEmpty ? <p className="frx-note">{historyEmpty}</p> : (
          <div className="frx-history">
            {history.map((item, index) => (
              <div key={index} className={`frx-history-row ${item.userTeam ? 'frx-history-row--team' : ''}`}>
                <div className="min-w-0">
                  <strong className="block truncate text-xs">{item.detail}</strong>
                  <small>{item.kindText}{item.revision ? ` · revision ${item.revision}` : ''}</small>
                </div>
                <span className="frx-history-row__score">{item.score}</span>
              </div>
            ))}
          </div>
        )}
      </section>
      <section className="court-panel frx-panel space-y-2.5 p-4" aria-labelledby="frx-box-title">
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-gold/35 bg-gold/10 text-gold"><Activity className="h-4.5 w-4.5" aria-hidden="true" /></span>
          <div><p className="bcast-kicker">Latest game</p><h3 className="frx-title">Box score</h3></div>
          {box.headline && <span className="frx-pill frx-pill--live ml-auto">{box.headline}</span>}
        </div>
        {box.empty ? <p className="frx-note">{box.empty}</p> : box.groups.map(group => (
          <div key={group.code} className="overflow-x-auto">
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
      </section>
    </div>
  );
}