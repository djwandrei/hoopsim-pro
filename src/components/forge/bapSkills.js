const one = value => {
  const num = value == null || value === '' ? NaN : Number(value);
  return Number.isFinite(num) ? String(Math.round(num)) : '—';
};

// DJHC game attributes use observed season evidence and reported measurements.
// Every rating is a 25–99 descriptive estimate, not a forecast.
export const SKILLS = [
  { key: 'scoring', label: 'Scoring', basis: 'Scoring volume + true shooting', metricKey: 'pointsPer36', fmt: one, weight: 1.2 },
  { key: 'jumpShot', label: 'Jump Shot', basis: '3P accuracy + volume + free throws', metricKey: 'threePointPercentage', fmt: one, weight: 1.1 },
  { key: 'finishing', label: 'Finishing', basis: '2P accuracy + volume + foul drawing', metricKey: 'twoPointPercentage', fmt: one, weight: 1.1 },
  { key: 'playmaking', label: 'Playmaking', basis: 'Assists per 36 minutes', metricKey: 'assistsPer36', fmt: one, weight: 0.9 },
  { key: 'decision', label: 'Decision', basis: 'AST/TO + ball security', metricKey: 'assistTurnoverRatio', fmt: one, weight: 0.9 },
  { key: 'rebounding', label: 'Rebounding', basis: 'Defensive + total rebounds', metricKey: 'reboundsPer36', fmt: one, weight: 0.8 },
  { key: 'clutch', label: 'Clutch', basis: 'Clutch scoring, efficiency + ball security', metricKey: 'clutchPointsPer36', fmt: one, weight: 0.7 },
  { key: 'perimeterDefense', label: 'Perimeter Defense', basis: 'Outside shot contests + deflections + steals', metricKey: 'perimeterSuppression', fmt: one, weight: 0.9 },
  { key: 'rimProtection', label: 'Rim Protection', basis: 'Blocks per 36 minutes', metricKey: 'blocksPer36', fmt: one, weight: 0.7 },
  { key: 'body', label: 'Body', basis: 'Height, wingspan + weight relative to position', metricKey: 'height', fmt: one, weight: 0.7 },
];

// Pinned rating model version, mirrored from the live forge release.
export const RATING_MODEL = 'djhc-forge-observed-skills-v3';
export const RATING_POLICY = { minGames: 15, minMinutes: 300, ratePriorMinutes: 250, threePriorAttempts: 100, twoPriorAttempts: 100, freeThrowPriorAttempts: 50, clutchMinMinutes: 10, clutchMinAttempts: 5, clutchPriorMinutes: 100, clutchPriorAttempts: 50, bodyPopulationMin: 8 };

// Letter grade from a 25–99 DJHC skill rating.
export const gradeFor = rating => {
  const value = rating == null || rating === '' ? NaN : Number(rating);
  if (!Number.isFinite(value)) return '—';
  if (value >= 90) return 'A';
  if (value >= 80) return 'B';
  if (value >= 70) return 'C';
  if (value >= 60) return 'D';
  return 'F';
};

// Tone bucket for a rating, mapped to the court palette tokens.
export const gradeTone = rating => {
  const value = rating == null || rating === '' ? NaN : Number(rating);
  if (!Number.isFinite(value)) return 'trim';
  if (value >= 80) return 'positive';
  if (value >= 70) return 'royal';
  if (value >= 60) return 'gold';
  return 'trim';
};

// Build-A-Bucket's Guard / Big split, mapped to the source's G / F / C codes.
export const GROUPS = [
  { key: 'All', codes: ['G', 'F', 'C', 'PG', 'SG', 'SF', 'PF'], hint: 'All roles' },
  { key: 'Guard', codes: ['G'], hint: 'G' },
  { key: 'Big', codes: ['F', 'C'], hint: 'F · C' },
];

// Role adjustment blend: role populations under 30 players are ignored, and a
// supported role percentile is blended at 15% against the season percentile.
export const ROLE_SAMPLE_MIN = 30;
export const ROLE_BLEND = 0.15;
