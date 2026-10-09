function normalizePlayerRef(value) {
  const ref = String(value ?? '').trim().toLowerCase();
  return ref || null;
}

export function filterExcludedPlayerEntries(entries, excludedRefs = []) {
  if (!Array.isArray(entries)) throw new TypeError('Player pool entries must be an array.');
  if (!Array.isArray(excludedRefs)) throw new TypeError('Excluded player references must be an array.');

  const excluded = new Set(excludedRefs.map(normalizePlayerRef).filter(Boolean));
  return entries.filter(entry => !excluded.has(normalizePlayerRef(entry?.playerRef)));
}
