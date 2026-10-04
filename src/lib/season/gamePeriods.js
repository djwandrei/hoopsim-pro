function splitRegulation(total, rng) {
  const weights = Array.from({ length: 4 }, () => 0.7 + rng() * 0.6);
  const sum = weights.reduce((a, b) => a + b, 0);
  const raw = weights.map(weight => weight / sum * total);
  const points = raw.map(Math.floor);
  const order = raw.map((value, index) => ({ index, fraction: value - points[index] })).sort((a, b) => b.fraction - a.fraction);
  const left = total - points.reduce((a, b) => a + b, 0);
  for (let i = 0; i < left; i++) points[order[i].index]++;
  return points;
}

export function buildGamePeriods(homePoints, awayPoints, overtime, rng) {
  const home = splitRegulation(homePoints, rng);
  const away = splitRegulation(awayPoints, rng);
  return [
    ...home.map((points, index) => ({ label: `Q${index + 1}`, seconds: 720, home: points, away: away[index] })),
    ...overtime.map((period, index) => ({ label: `OT${index + 1}`, seconds: 300, ...period })),
  ];
}

// Use the same period grouping in live and final views; FINAL isn't a period.
export function replayPeriods(events, visibleCount = events.length) {
  const periods = new Map();
  for (const event of events) {
    if (!event.q || event.type === 'final' || event.q === 'FINAL') continue;
    if (!periods.has(event.q)) periods.set(event.q, { home: null, away: null });
  }
  for (const event of events.slice(0, visibleCount)) {
    if (event.type === 'final') continue;
    const period = periods.get(event.q);
    if (!period) continue;
    period.home ??= 0; period.away ??= 0;
    if (event.side === 'home') period.home += event.pts || 0;
    if (event.side === 'away') period.away += event.pts || 0;
  }
  return [...periods.entries()];
}