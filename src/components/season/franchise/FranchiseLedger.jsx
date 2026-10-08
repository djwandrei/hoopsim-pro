import React from 'react';
import { ScrollText } from 'lucide-react';
import { FranchiseTeamMark } from './FranchiseTeamMark';

// Ledger: the recent completed games and actions as a broadcast timeline.
export default function FranchiseLedger({ view }) {
  const { history, historyEmpty } = view;
  return (
    <section className="court-panel frx-panel space-y-2 p-4" aria-labelledby="frx-history-title">
      <div className="flex items-center gap-2.5">
        <span className="frx-head-icon"><ScrollText className="h-4 w-4" aria-hidden="true" /></span>
        <div><p className="bcast-kicker">Ledger</p><h3 className="frx-title" id="frx-history-title">Recent results &amp; actions</h3></div>
      </div>
      {historyEmpty ? <p className="frx-note">{historyEmpty}</p> : (
        <div className="frx-history frx-scroll">
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
  );
}