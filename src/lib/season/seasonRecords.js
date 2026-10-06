// Observed W–L records built from the actual results embedded in a season
// schedule (games carry an `actual` score only after they were played).
export function actualRecordsFrom(schedule) {
  const map = new Map();
  for (const game of schedule || []) {
    if (!game.actual) continue;
    const homeWon = game.actual.home > game.actual.away;
    const winner = homeWon ? game.home : game.away;
    const loser = homeWon ? game.away : game.home;
    if (!map.has(winner)) map.set(winner, { w: 0, l: 0, gp: 0 });
    if (!map.has(loser)) map.set(loser, { w: 0, l: 0, gp: 0 });
    const winRow = map.get(winner);
    const lossRow = map.get(loser);
    winRow.w += 1; winRow.gp += 1;
    lossRow.l += 1; lossRow.gp += 1;
  }
  return map;
}