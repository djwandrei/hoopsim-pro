import { fitCandidate57FromNormalEquations } from './game-lab-candidate57-c51-pass6-hybrid-v4.mjs';

// Penalties operate on the pinned normalized basis. Intercepts stay unpenalized.
export function fitCandidate57WithFeaturePenalties({ total, margin, standardization,
  ridgeLambda = 400, totalRidgeLambda = ridgeLambda, marginRidgeLambda = ridgeLambda,
  featureRidgePenaltyMultipliers = { total: {}, margin: {} } }) {
  if (!featureRidgePenaltyMultipliers || typeof featureRidgePenaltyMultipliers !== 'object' || Object.getPrototypeOf(featureRidgePenaltyMultipliers) !== Object.prototype || Object.keys(featureRidgePenaltyMultipliers).some(k=>!['total','margin'].includes(k))) throw TypeError('Invalid feature-penalty map');
  const equations = { total: structuredClone(total), margin: structuredClone(margin) };
  const lambdas = { total: totalRidgeLambda, margin: marginRidgeLambda };
  for (const head of ['total', 'margin']) {
    const names = standardization[head + 'FeatureNames'], penalties = Object.hasOwn(featureRidgePenaltyMultipliers, head) ? featureRidgePenaltyMultipliers[head] : {};
    if (!penalties || typeof penalties !== 'object' || Object.getPrototypeOf(penalties) !== Object.prototype
      || Object.keys(penalties).some(n => !names.includes(n))
      || Object.values(penalties).some(v => !Number.isFinite(v) || v <= 0)) throw TypeError('Invalid selected feature ridge penalties');
    names.forEach((name, j) => { equations[head].gram[j + 1][j + 1] += lambdas[head] * ((penalties[name] ?? 1) - 1); });
  }
  return Object.freeze({ ...fitCandidate57FromNormalEquations({ ...equations, standardization, ridgeLambda, totalRidgeLambda, marginRidgeLambda }),
    featureRidgePenaltyMultipliers: structuredClone(featureRidgePenaltyMultipliers),
    solverAuditDefinition: 'Gram includes lambda*(featurePenaltyMultiplier-1); core adds uniform lambda, yielding exact feature-specific penalties' });
}
