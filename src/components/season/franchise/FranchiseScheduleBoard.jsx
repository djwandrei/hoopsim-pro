import React, { useState } from 'react';
import { CalendarRange, ChevronLeft, ChevronRight, List } from 'lucide-react';
import { FranchiseTeamMark } from './FranchiseTeamMark';
import { ghostButton, pillClass } from './franchiseUi';
import { buildScheduleCalendarCells, formatScheduleMonth, paginateScheduleRows, scheduleMonthKeys } from './franchiseScheduleCalendar';

const PAGE_SIZE = 100;
const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'mine', label: 'My games' },
  { id: 'played', label: 'Completed' },
  { id: 'upcoming', label: 'Upcoming' },
];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function ScheduleCalendar({ rows, month, months, onMonthChange }) {
  if (!month) return <div className="chart-frame__empty">No dated schedule games match this filter.</div>;
  const cells = buildScheduleCalendarCells(month, rows);
  const currentIndex = months.indexOf(month);
  const monthRows = rows.filter(row => row.date?.startsWith(`${month}-`));
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2">
        <div className="flex items-center gap-2">
          <button type="button" className={ghostButton} aria-label="Previous schedule month"
            disabled={currentIndex <= 0} onClick={() => onMonthChange(months[currentIndex - 1])}>
            <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" /> Previous
          </button>
          <h4 className="frx-board-calendar-title" aria-live="polite">{formatScheduleMonth(month)}</h4>
          <button type="button" className={ghostButton} aria-label="Next schedule month"
            disabled={currentIndex < 0 || currentIndex >= months.length - 1}
            onClick={() => onMonthChange(months[currentIndex + 1])}>
            Next <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
        <span className="frx-pill frx-pill--slate">{monthRows.length} games this month</span>
      </div>
      <div className="frx-calendar-scroll">
        <div className="frx-calendar-grid" role="grid" aria-label={`${formatScheduleMonth(month)} schedule`}>
          {WEEKDAYS.map(day => <div key={day} className="frx-calendar-weekday" role="columnheader">{day}</div>)}
          {cells.map((cell, index) => (
            <div key={cell?.date ?? `empty-${index}`} className={`frx-calendar-day ${cell ? '' : 'frx-calendar-day--empty'}`}
              role="gridcell" aria-label={cell ? `${cell.date}, ${cell.games.length} games` : undefined}>
              {cell && (
                <>
                  <span className="frx-calendar-day__number">{cell.day}</span>
                  <div className="frx-calendar-day__games">
                    {cell.games.map(row => (
                      <div key={row.gameId}
                        className={`frx-calendar-game ${row.status === 'next' ? 'frx-calendar-game--next' : ''} ${row.isUserGame ? 'frx-calendar-game--mine' : ''}`}
                        title={row.gameId}>
                        <span>{row.away} at {row.home}</span>
                        {row.status === 'played' && <strong>{row.awayScore}–{row.homeScore}</strong>}
                        {row.status === 'next' && <small>Next</small>}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </div>
      <p className="frx-note mt-2">Gold highlights mark your games. Results appear here after each completed game.</p>
    </div>
  );
}

function ScheduleList({ filtered, filter, onFilterChange }) {
  const [page, setPage] = useState(0);
  const pageData = paginateScheduleRows(filtered, page, PAGE_SIZE);
  const visibleRows = pageData.rows;
  const groups = [];
  for (const row of visibleRows) {
    const month = String(row.date || '').slice(0, 7) || 'Scheduled';
    const last = groups[groups.length - 1];
    if (last?.month === month) last.rows.push(row);
    else groups.push({ month, rows: [row] });
  }
  const changeFilter = value => {
    setPage(0);
    onFilterChange(value);
  };
  return (
    <>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Schedule filters">
        {FILTERS.map(item => (
          <button key={item.id} type="button" aria-pressed={filter === item.id}
            className={filter === item.id ? pillClass('live') : pillClass('slate')}
            onClick={() => changeFilter(item.id)}>
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
      {pageData.total > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2" aria-live="polite">
          <span className="frx-note">Showing {pageData.start}–{pageData.end} of {pageData.total} games · page {pageData.page + 1} of {pageData.pageCount}</span>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={ghostButton} disabled={pageData.page === 0} onClick={() => setPage(pageData.page - 1)}>
              Previous page
            </button>
            <button type="button" className={ghostButton} disabled={pageData.page >= pageData.pageCount - 1}
              onClick={() => setPage(pageData.page + 1)}>
              Next page
            </button>
          </div>
        </div>
      )}
    </>
  );
}

// The list starts with a bounded page of rows so each result update stays
// light; Calendar shows the exact schedule dates without expanding the DOM.
export default function FranchiseScheduleBoard({ view }) {
  const [filter, setFilter] = useState('all');
  const [mode, setMode] = useState('calendar');
  const [calendarMonth, setCalendarMonth] = useState('');
  const rows = view.scheduleList ?? [];
  const filtered = rows.filter(row => {
    if (filter === 'all') return true;
    if (filter === 'mine') return row.isUserGame;
    return row.status === filter;
  });
  const months = scheduleMonthKeys(filtered);
  const selectedMonth = months.includes(calendarMonth) ? calendarMonth : months[0] ?? '';
  const played = rows.filter(row => row.status === 'played').length;
  const mine = rows.filter(row => row.isUserGame).length;
  return (
    <section className="court-panel frx-panel space-y-3 p-4" aria-labelledby="frx-board-title">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className="frx-head-icon"><CalendarRange className="h-4 w-4" aria-hidden="true" /></span>
          <div><p className="bcast-kicker">Full schedule</p><h3 className="frx-title" id="frx-board-title">Season schedule</h3></div>
        </div>
        <span className="frx-pill frx-pill--slate">{played} / {rows.length} played · {mine} my games</span>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Schedule view">
          <button type="button" aria-pressed={mode === 'calendar'} className={mode === 'calendar' ? pillClass('live') : pillClass('slate')}
            onClick={() => setMode('calendar')}>
            <CalendarRange className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" /> Calendar
          </button>
          <button type="button" aria-pressed={mode === 'list'} className={mode === 'list' ? pillClass('live') : pillClass('slate')}
            onClick={() => setMode('list')}>
            <List className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" /> List
          </button>
        </div>
        <span className="frx-note">{mode === 'calendar' ? 'Month view' : `Up to ${PAGE_SIZE} rows per page`}</span>
      </div>
      {mode === 'calendar' ? (
        <>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Schedule filters">
            {FILTERS.map(item => (
              <button key={item.id} type="button" aria-pressed={filter === item.id}
                className={filter === item.id ? pillClass('live') : pillClass('slate')}
                onClick={() => setFilter(item.id)}>
                {item.label}
              </button>
            ))}
          </div>
          <ScheduleCalendar rows={filtered} month={selectedMonth} months={months} onMonthChange={setCalendarMonth} />
        </>
      ) : (
        <ScheduleList filtered={filtered} filter={filter} onFilterChange={setFilter} />
      )}
    </section>
  );
}
