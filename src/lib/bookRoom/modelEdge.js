// SwishIQ Model Edge — the studio's differentiator: the possession-based
// season sim runs seeded Monte Carlo trials on every upcoming game from the
// live board, producing fair model probabilities that are compared against
// book prices to expose positive-EV picks.
import { simSingleGame, TEAM_NAMES } from '@/lib/season/simEngine';
import { americanToDecimal, decimalToAmerican } from '@/components/book/betsMath';

export const MODEL_TRIALS = 300;

// Odds API team full names ("Los Angeles Lakers") → studio season codes.
export const CODE_BY_NAME = Object.fromEntries(Object.entries(TEAM_NAMES).map(([code, name]) => [name, code]));

// Implied win probability the book is charging for a price.
export function impliedProb(price) {
  return 1 / americanToDecimal(price);
}

export function probToAmerican(prob) {
  if (!Number.isFinite(prob) || prob <= 0 || prob >= 1) return null;
  return decimalToAmerican(1 / prob);
}

// Monte Carlo one matchup: win probability, fair moneyline odds, expected
// total and spread, plus full samples for spread/total probabilities.
export function runModelGame(league, home, away, trials = MODEL_TRIALS) {
  const margins = [], totals = [];
  for (let index = 0; index < trials; index++) {
    const sim = simSingleGame(league, home, away, { seed: 90071 + index * 7919, neutral: false });
    margins.push(sim.homePts - sim.awayPts);
    totals.push(sim.homePts + sim.awayPts);
  }
  const homeWinProb = margins.filter(margin => margin > 0).length / margins.length;
  const avg = list => list.reduce((sum, value) => sum + value, 0) / list.length;
  return {
    trials, margins, totals, homeWinProb,
    fairHome: probToAmerican(homeWinProb),
    fairAway: probToAmerican(1 - homeWinProb),
    modelTotal: avg(totals),
    modelSpread: avg(margins),
  };
}

// Model probability for a specific leg (moneyline, spread or total), matching
// the same covering rules the settlement grading uses.
export function modelLegProb(model, leg) {
  if (!model) return null;
  const samples = model.margins?.length;
  if (!samples) return null;
  if (leg.market === 'moneyline') return leg.pickSide === 'home' ? model.homeWinProb : 1 - model.homeWinProb;
  const count = predicate => {
    let hits = 0;
    for (let index = 0; index < samples; index++) if (predicate(model.margins[index], model.totals[index])) hits += 1;
    return hits / samples;
  };
  if (leg.market === 'spread') {
    const line = Number(leg.line);
    return Number.isFinite(line) ? (leg.pickSide === 'home' ? count(margin => margin > -line) : count(margin => margin < line)) : null;
  }
  if (leg.market === 'total') {
    const line = Number(leg.line);
    return Number.isFinite(line) ? (leg.totalPick === 'over' ? count((margin, total) => total > line) : count((margin, total) => total < line)) : null;
  }
  return null;
}

// Edge in probability points: model probability minus the book's implied one.
export function modelEdgePct(model, leg, bookPrice) {
  const prob = modelLegProb(model, leg);
  const implied = impliedProb(Number(bookPrice));
  if (prob == null || !Number.isFinite(implied) || implied <= 0) return null;
  return (prob - implied) * 100;
}