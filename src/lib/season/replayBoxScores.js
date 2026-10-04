const KEYS = ['pts', 'fgm', 'fga', 'fg3m', 'fg3a', 'ftm', 'fta', 'orb', 'dreb', 'reb', 'ast', 'stl', 'blk', 'tov'];

export function replayBoxScores(boxHome, boxAway, events) {
  const boxes = [boxHome, boxAway].map(box => ({ ...box, lines: box.lines.map(line => ({ ...line, ...Object.fromEntries(KEYS.map(key => [key, 0])) })) }));
  const players = boxes.map(box => new Map(box.lines.map(line => [line.name, line])));
  const totals = boxes.map(() => Object.fromEntries(KEYS.map(key => [key, 0])));
  const award = (side, name, key, amount = 1) => {
    totals[side][key] += amount;
    const line = players[side].get(name);
    if (line) line[key] += amount;
  };
  for (const event of events) {
    if (!['home', 'away'].includes(event.side)) continue;
    const side = event.side === 'home' ? 0 : 1;
    const other = 1 - side;
    const stat = event.stat || {};
    if (event.pts) award(side, stat.scorer, 'pts', event.pts);
    if (event.type === 'made' || event.type === 'miss') {
      award(side, stat.scorer, 'fga');
      if (stat.shot === 3) award(side, stat.scorer, 'fg3a');
      if (event.type === 'made') {
        award(side, stat.scorer, 'fgm');
        if (stat.shot === 3) award(side, stat.scorer, 'fg3m');
      }
    }
    if (event.type === 'ft') { award(side, stat.scorer, 'fta', stat.fta); award(side, stat.scorer, 'ftm', event.pts); }
    if (stat.turnover) award(side, stat.turnover, 'tov');
    if (stat.assist) award(side, stat.assist, 'ast');
    if (stat.steal) award(other, stat.steal, 'stl');
    if (stat.block) award(other, stat.block, 'blk');
    if (stat.rebound) {
      const reboundSide = stat.reboundSide === 'home' ? 0 : 1;
      award(reboundSide, stat.rebound, 'reb');
      award(reboundSide, stat.rebound, stat.offensiveRebound ? 'orb' : 'dreb');
    }
  }
  totals.forEach(stats => { stats.efg = stats.fga ? (stats.fgm + stats.fg3m / 2) / stats.fga : 0; });
  boxes.forEach(box => box.lines.sort((a, b) => b.min - a.min || b.pts - a.pts));
  return { boxHome: boxes[0], boxAway: boxes[1], statsHome: totals[0], statsAway: totals[1] };
}