import React, { useMemo, useState } from 'react';
import { CalendarRange } from 'lucide-react';
import { FranchiseTeamMark } from './FranchiseTeamMark';
import { pillClass } from './franchiseUi';

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'mine', label: 'My games' },
  { id: 'played', label: 'Completed' },
  { id: 'upcoming', label: 'Upcoming' },
];

// The interactive high-def schedule: every scheduled game grouped by month,
// with played scores, the glowing next game, prepared-input pills, and
// quick filters for my-team / completed / upcoming games.
export default function FranchiseScheduleBoard({ view }) {
  const [filter, setFilter] = useState('all');
  const rows = view.scheduleList ?? [];
  const filtered = rows.filter(row => {
    if (filter === 'all') return true;
    if (filter === 'mine') return row.isUserGame;
    return row.status === filter;
  });
  const groups = useMemo(() => {
    const out = [];
    for (const row of filtered) {
      const month = String(row.date || '').slice(0, 7) || 'Scheduled';
      const last = out[out.length - 1];
      if (last?.month === month) last.rows.push(row);
      else out.push({ month, rows: [row] });
    }
    return out;
  }, [filtered]);
  const played = rows.filter(row => row.status === 'played').length;
  const mine = rows.filter(row => row.isUserGame).length;
  return (
    <section className="court-panel frx-panel space-y-3 p-4" aria-labelledby="frx-board-title">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className="frx-head-icon"><CalendarRange className="h-4 w-4" aria-hidden="true" /></span>
          <div><p className="bcast-kicker">Full schedule</p><h3 className="frx-title" id="frx-board-title">Season schedule board</h3></div>
        </div>
        <span className="frx-pill frx-pill--slate">{played} / {rows.length} played · {mine} my games</span>
      </div>
      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Schedule filters">
        {FILTERS.map(item => (
          <button key={item.id} type="button" role="tab" aria-selected={filter === item.id}
            className={filter === item.id ? pillClass('live') : pillClass('slate')}
            onClick={() => setFilter(item.id)}>
            {item.label}
          </button>
        ))}
      </div>
      {groups.length ? (
        <div className="frx-scroll pr-1" style={{ maxHeight: '30rem' }}>
          {groups.map(group => (
            <div key={group.month}>
              <p className="frx-board-month">{group.month}</p>
              {group.rows.map(row => {
                const playedRow = row.status === 'played';
                const homeWon = playedRow && Number(row.homeScore) > Number(row.awayScore);
                return (
                  <div key={row.gameId} className={`frx-board-row ${row.status === 'next' ? 'frx-board-row--next' : ''}`} title={row.gameId}>
                    <span className="frx-board-date">{row.date || '—'}</span>
                    <span className={`frx-board-team ${playedRow ? (homeWon ? 'frx-board-team--loser' : 'frx-board-team--winner') : ''}`}>
                      <FranchiseTeamMark code={row.away} /> {row.away}
                    </span>
                    <span className="frx-board-mid">
                      {playedRow
                        ? <span className="frx-board-score">{row.awayScore}–{row.homeScore}</span>
                        : <span className="frx-board-at">AT</span>}
                    </span>
                    <span className={`frx-board-team ${playedRow ? (homeWon ? 'frx-board-team--winner' : 'frx-board-team--loser') : ''}`}>
                      <FranchiseTeamMark code={row.home} /> {row.home}
                    </span>
                    <span className="frx-board-state">
                      {row.status === 'next' && <span className={pillClass('live')}>Next</span>}
                      {row.status === 'upcoming' && <span className={pillClass(row.inputReady ? 'green' : 'slate')}>{row.inputReady ? 'Input ready' : 'Scheduled'}</span>}
                      {row.isUserGame && <span className="frx-matchup__you">You</span>}
                    </span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      ) : (
        <div className="chart-frame__empty">No games match this filter.</div>
      )}
    </section>
  );
}