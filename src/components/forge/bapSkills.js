const one = value => {
  const num = Number(value);
  return Number.isFinite(num) ? String(Math.round(num)) : '—';
};

// Nine DJHC skill attributes, each backed by an observed season metric from
// the blueprint rows. Every rating is a 25–99 percentile estimate.
export const SKILLS = [
  { key: 'scoring', label: 'Scoring', basis: 'Points per 36 minutes', metricKey: 'pointsPer36', fmt: one, weight: 0.9 },
  { key: 'jumpShot', label: 'Jump Shot', basis: 'Attempt-shrunk 3P%', metricKey: 'threePointPercentage', fmt: one, weight: 0.9 },
  { key: 'finishing', label: 'Finishing', basis: 'Attempt-shrunk 2P% (FG% fallback)', metricKey: 'twoPointPercentage', fmt: one, weight: 0.9 },
  { key: 'playmaking', label: 'Playmaking', basis: 'Assists per 36 minutes', metricKey: 'assistsPer36', fmt: one, weight: 0.9 },
  { key: 'decision', label: 'Decision', basis: 'Attempt-shrunk AST/TO', metricKey: 'assistTurnoverRatio', fmt: one, weight: 0.8 },
  { key: 'rebounding', label: 'Rebounding', basis: 'Rebounds per 36 minutes', metricKey: 'reboundsPer36', fmt: one, weight: 0.8 },
  { key: 'offensiveRebound', label: 'O. Rebounding', basis: 'Offensive rebounds per 36 minutes', metricKey: 'offensiveReboundsPer36', fmt: one, weight: 0.7 },
  { key: 'steals', label: 'Steals', basis: 'Steals per 36 minutes', metricKey: 'stealsPer36', fmt: one, weight: 0.7 },
  { key: 'rimProtection', label: 'Rim Protection', basis: 'Blocks per 36 minutes', metricKey: 'blocksPer36', fmt: one, weight: 0.7 },
];

// Pinned rating model version, mirrored from the live forge release.
export const RATING_MODEL = 'djhc-season-skill-percentile-v1';

// Letter grade from a 25–99 DJHC skill rating.
export const gradeFor = rating => {
  const value = Number(rating);
  if (!Number.isFinite(value)) return '—';
  if (value >= 90) return 'A';
  if (value >= 80) return 'B';
  if (value >= 70) return 'C';
  if (value >= 60) return 'D';
  return 'F';
};

// Tone bucket for a rating, mapped to the court palette tokens.
export const gradeTone = rating => {
  const value = Number(rating);
  if (!Number.isFinite(value)) return 'trim';
  if (value >= 80) return 'positive';
  if (value >= 70) return 'royal';
  if (value >= 60) return 'gold';
  return 'trim';
};

// Build-A-Bucket's Guard / Big split, mapped to the source's G / F / C codes.
export const GROUPS = [
  { key: 'Guard', codes: ['G'], hint: 'G' },
  { key: 'Big', codes: ['F', 'C'], hint: 'F · C' },
];

// Role adjustment blend: role populations under 30 players are ignored, and a
// supported role percentile is blended at 25% against the season percentile.
export const ROLE_SAMPLE_MIN = 30;
export const ROLE_BLEND = 0.25;