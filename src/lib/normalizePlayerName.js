// Canonical player-name normalization for matching rows across data sources
// (official stats, board metadata, career archives): strips diacritics and
// dagger/asterisk suffixes, lowercases, and collapses separators.
export function normalizePlayerName(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u2020*]+$/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}