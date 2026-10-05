// Shared result-desk capture: reads the solved result's scoreboard cards and
// lineup table straight from the rendered DOM, so every consumer (saved runs,
// league scan, narrative, diagnostics) sees exactly what the native tool
// rendered — no duplicated parsing logic.

export function captureScoreboard(results, maxCards = undefined) {
  const text = (node) => (node?.textContent || '').trim();
  const scoreboard = results.querySelector('.result-scoreboard');
  const metrics = scoreboard
    ? [...scoreboard.querySelectorAll('.score-card')]
      .map((card, index) => ({ card, index }))
      .filter(({ index }) => maxCards === undefined || index < maxCards)
      .map(({ card }) => ({ label: text(card.querySelector('span')), value: text(card.querySelector('strong')) }))
      .filter((metric) => metric.label && metric.value)
    : [];
  // Null when nothing is solved yet — callers treat this as "no result".
  if (!metrics.length) return null;
  const table = results.querySelector('table');
  const lineup = table
    ? [...table.querySelectorAll('tbody tr')]
      .map((row) => (row.children[0]?.innerText || '').replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .slice(0, 15)
    : [];
  return { metrics, lineup };
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}