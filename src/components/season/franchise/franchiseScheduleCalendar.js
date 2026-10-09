export function scheduleMonthKeys(rows = []) {
  return [...new Set(rows.map(row => String(row.date ?? '').slice(0, 7)).filter(value => /^\d{4}-\d{2}$/.test(value)))].sort();
}

export function paginateScheduleRows(rows = [], page = 0, pageSize = 100) {
  const size = Number.isInteger(pageSize) && pageSize > 0 ? pageSize : 100;
  const pageCount = Math.max(1, Math.ceil(rows.length / size));
  const pageIndex = Math.min(Math.max(0, Math.floor(Number(page) || 0)), pageCount - 1);
  const startIndex = pageIndex * size;
  const visibleRows = rows.slice(startIndex, startIndex + size);
  return { rows: visibleRows, page: pageIndex, pageCount, total: rows.length,
    start: visibleRows.length ? startIndex + 1 : 0, end: startIndex + visibleRows.length };
}

export function formatScheduleMonth(month) {
  const [year, monthNumber] = month.split('-').map(Number);
  return new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(Date.UTC(year, monthNumber - 1, 1)));
}

export function buildScheduleCalendarCells(month, rows = []) {
  const [year, monthNumber] = month.split('-').map(Number);
  const firstWeekday = new Date(Date.UTC(year, monthNumber - 1, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const gamesByDate = new Map();
  for (const row of rows) {
    if (!row.date?.startsWith(`${month}-`)) continue;
    if (!gamesByDate.has(row.date)) gamesByDate.set(row.date, []);
    gamesByDate.get(row.date).push(row);
  }
  const cellCount = Math.ceil((firstWeekday + daysInMonth) / 7) * 7;
  return Array.from({ length: cellCount }, (_, index) => {
    const day = index - firstWeekday + 1;
    if (day < 1 || day > daysInMonth) return null;
    const date = `${month}-${String(day).padStart(2, '0')}`;
    return { date, day, games: gamesByDate.get(date) ?? [] };
  });
}
