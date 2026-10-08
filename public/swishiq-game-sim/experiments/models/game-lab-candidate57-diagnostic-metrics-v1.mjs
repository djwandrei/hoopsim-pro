/* Shared official metric definitions for the Candidate 57 research procedures. */
import { scoreEmpiricalDistribution } from './game-lab-candidate10-paired-distribution-v3.mjs';
import { probabilityMetrics, pointMetrics } from './game-lab-candidate10-predictive-metrics-v2.mjs';
const mean = values => values.reduce((sum,value)=>sum+value,0)/values.length;
const levels = [0.5, 0.8, 0.9, 0.95];
function intervals(distribution, actual) {
  const quantile = (probability) => {
    let cumulative = 0;
    for (const entry of distribution.support) {
      cumulative += entry.probability;
      if (cumulative + 1e-12 >= probability) return entry.value;
    }
    return distribution.support.at(-1).value;
  };
  return Object.fromEntries(levels.map(level => {
    const alpha = 1 - level;
    const lower = quantile(alpha / 2);
    const upper = quantile(1 - alpha / 2);
    const score = upper - lower + (2 / alpha) * Math.max(0, lower - actual) + (2 / alpha) * Math.max(0, actual - upper);
    return [String(level), { lower, upper, width: upper - lower, covered: actual >= lower && actual <= upper, score }];
  }));
}
export function scoreHybridRow(row, prediction, distribution) {
  const actual = { home: row.target.homeScore, away: row.target.awayScore, margin: row.target.margin };
  const sideRows = Object.fromEntries(['home', 'away', 'margin'].map(side => {
    const value = distribution[side];
    const actualValue = actual[side];
    const interval = intervals(value, actualValue);
    return [side, { error: value.mean - actualValue, crps: scoreEmpiricalDistribution(value, actualValue).crps, intervals: interval,
      equalWeightIntervalScore: mean(levels.map(level => interval[String(level)].score)) }];
  }));
  return { gameRef: row.gameRef, gameDateLocal: row.gameDateLocal, seasonStartYear: row.seasonStartYear,
    homeWin: Number(row.target.homeScore > row.target.awayScore), probability: distribution.homeWinProbability,
    actualHomeScore: row.target.homeScore, actualAwayScore: row.target.awayScore,
    predictedTotal: prediction.total, predictedMargin: prediction.margin, residualPoolCount: distribution.residualPoolCount,
    residualDrawCount: distribution.residualDrawCount, regime: distribution.regime,
    poolSelection: distribution.poolSelection, residualObservedThrough: distribution.residualObservedThrough, sides: sideRows };
}
export function summarizeHybridRows(scored) {
  return {
    n: scored.length,
    probability: probabilityMetrics(scored.map(row => ({ probability: row.probability, outcome: row.homeWin }))),
    sides: Object.fromEntries(['home', 'away', 'margin'].map(side => {
      const values = scored.map(row => row.sides[side]);
      return [side, { ...pointMetrics(values.map(row => row.error)), crps: mean(values.map(row => row.crps)),
        intervals: Object.fromEntries(levels.map(level => {
          const rowsAtLevel = values.map(row => row.intervals[String(level)]);
          return [String(level), { coverage: mean(rowsAtLevel.map(row => Number(row.covered))), meanWidth: mean(rowsAtLevel.map(row => row.width)), intervalScore: mean(rowsAtLevel.map(row => row.score)) }];
        })), equalWeightIntervalScore: mean(values.map(row => row.equalWeightIntervalScore)) }];
    })),
  };
}
