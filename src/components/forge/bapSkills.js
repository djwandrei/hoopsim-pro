const one = value => value.toFixed(1);
const pct = value => `${(value * 100).toFixed(1)}%`;

// Nine Build-A-Bucket style attributes, each backed by an observed metric
// from the season source. Perimeter D blends steals + blocks per 36.
export const SKILLS = [
  { key:'handles', label:'Handles', metric:'A/TO', metricKey:'assistTurnoverRatio', fmt:one, weight:0.8 },
  { key:'jumpShot', label:'Jump Shot', metric:'3P%', metricKey:'threePointPercentage', fmt:pct, weight:0.9 },
  { key:'finishing', label:'Finishing', metric:'FG%', metricKey:'fieldGoalPercentage', fmt:pct, weight:0.9 },
  { key:'speed', label:'Speed', metric:'SPG', metricKey:'stealsPerGame', fmt:one, weight:0.7 },
  { key:'bounce', label:'Bounce', metric:'BPG', metricKey:'blocksPerGame', fmt:one, weight:0.7 },
  { key:'passing', label:'Passing', metric:'APG', metricKey:'assistsPerGame', fmt:one, weight:0.9 },
  { key:'perimeterD', label:'Perimeter D', metric:'STL+B/36', metricKey:'perimeterD36', fmt:one, weight:0.8 },
  { key:'strength', label:'Strength', metric:'RPG', metricKey:'reboundsPerGame', fmt:one, weight:0.8 },
  { key:'hl', label:'H/L', metric:'MPG', metricKey:'minutesPerGame', fmt:one, weight:0.6 },
];

// Letter grade from a 0..1 share of the pool maximum (BAP-style slot grades).
export const gradeFor = ratio => {
  const share = Math.max(0, Math.min(1, Number(ratio) || 0));
  if (share >= 0.88) return 'A+'; if (share >= 0.80) return 'A'; if (share >= 0.72) return 'A-';
  if (share >= 0.64) return 'B+'; if (share >= 0.55) return 'B'; if (share >= 0.46) return 'C+';
  if (share >= 0.37) return 'C'; if (share >= 0.28) return 'D'; return 'F';
};

// Build-A-Bucket's Guard / Big split, mapped to the source's G / F / C codes.
export const GROUPS = [
  { key:'Guard', codes:['G'], hint:'G' },
  { key:'Big', codes:['F','C'], hint:'F · C' },
];