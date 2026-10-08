import { normalizeCanonicalPlayerName } from './simulation-contracts-v1.mjs';

export const PRIOR_SHOT_EFFICIENCY_FORMAT = 'djhc-prior-shot-efficiency-v1';
export const PRIOR_SHOT_FIELDS = Object.freeze({ twoPointPct: ['twoPointMakes', 'twoPointAttempts'],
  threePointPct: ['threePointersMade', 'threePointAttempts'], freeThrowPct: ['freeThrowsMade', 'freeThrowAttempts'] });
const generatedStrength = Object.freeze({ twoPointPct: 20, threePointPct: 30, freeThrowPct: 20 });
const validDate = date => typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) &&
  Number.isFinite(Date.parse(`${date}T00:00:00Z`)) && new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date;
function validateWindow(window, year, targetDate) {
  if (!window || window.seasonStartYear !== year || !Array.isArray(window.observations) || window.observations.length > 10) throw new Error('Unsupported prior shot window.');
  for (const observation of window.observations) {
    if (!validDate(observation.date) || observation.date >= targetDate || ![year, year + 1].includes(Number(observation.date.slice(0, 4)))) throw new Error('Shot history must precede target local date and match its season.');
    for (const [made, attempted] of Object.values(PRIOR_SHOT_FIELDS)) {
      if (![observation.counts?.[made], observation.counts?.[attempted]].every(value => Number.isSafeInteger(value) && value >= 0) ||
          observation.counts[made] > observation.counts[attempted]) throw new Error('Missing or inconsistent prior shot counts.');
    }
  }
}
export function createPriorShotEfficiency({ canonicalName, seasonStartYear, targetDateExclusive, current, prior, leaguePrior }) {
  const nameKey = normalizeCanonicalPlayerName(canonicalName);
  if (!nameKey || !Number.isInteger(seasonStartYear) || !validDate(targetDateExclusive) ||
      ![seasonStartYear, seasonStartYear + 1].includes(Number(targetDateExclusive.slice(0, 4))) || leaguePrior?.seasonStartYear !== seasonStartYear - 1 ||
      typeof leaguePrior.source !== 'string' || !leaguePrior.source) throw new Error('Unbound prior-shot identity, season or league prior.');
  validateWindow(current, seasonStartYear, targetDateExclusive); validateWindow(prior, seasonStartYear - 1, targetDateExclusive);
  const rates = {}, components = {};
  for (const [field, [made, attempted]] of Object.entries(PRIOR_SHOT_FIELDS)) {
    const priorRate = leaguePrior.rates?.[field];
    if (!Number.isFinite(priorRate) || priorRate <= 0 || priorRate >= 1) throw new Error('Prior league shooting rate must be inside (0,1).');
    const sum = (window, statistic) => window.observations.reduce((total, row) => total + row.counts[statistic], 0);
    const currentMakes = sum(current, made), currentAttempts = sum(current, attempted);
    const priorMakes = sum(prior, made), priorAttempts = sum(prior, attempted);
    if (![currentMakes, currentAttempts, priorMakes, priorAttempts].every(Number.isSafeInteger)) throw new Error('Prior shot window sum exceeds safe count range.');
    const pseudoAttempts = generatedStrength[field], discount = 0.5;
    const effectiveMakes = currentMakes + discount * priorMakes, effectiveAttempts = currentAttempts + discount * priorAttempts;
    rates[field] = (effectiveMakes + priorRate * pseudoAttempts) / (effectiveAttempts + pseudoAttempts);
    if (!Number.isFinite(rates[field]) || rates[field] <= 0 || rates[field] >= 1) throw new Error('Prior shot posterior is nonfinite or on a structural endpoint.');
    components[field] = { currentMakes, currentAttempts, priorMakes, priorAttempts, priorSeasonDiscount: discount,
      generatedPseudoAttempts: pseudoAttempts, leaguePriorRate: priorRate, effectiveMakes, effectiveAttempts };
  }
  return { format: PRIOR_SHOT_EFFICIENCY_FORMAT, version: 1, canonicalNameKey: nameKey, seasonStartYear, targetDateExclusive,
    lastPriorDate: [...current.observations, ...prior.observations].map(row => row.date).sort().at(-1) ?? null,
    currentObservations: current.observations.length, priorObservations: prior.observations.length,
    leaguePrior: structuredClone(leaguePrior), rates, components,
    provenance: { window: 'last-ten-positive-appearances in current and immediately prior season; whole-local-date embargo',
      priorStrength: 'generated development pseudocounts; not empirically selected', derivedFromTargetGame: false,
      estimate: 'discounted prior counts plus league pseudocount shrinkage; not a certified skill estimate' } };
}
export function validatePriorShotEfficiency(profile, { canonicalName, seasonStartYear, gameLocalDate }) {
  if (profile?.format !== PRIOR_SHOT_EFFICIENCY_FORMAT || profile.version !== 1 ||
      profile.canonicalNameKey !== normalizeCanonicalPlayerName(canonicalName) || profile.seasonStartYear !== seasonStartYear ||
      !validDate(gameLocalDate) || profile.targetDateExclusive !== gameLocalDate ||
      !(profile.lastPriorDate === null || (validDate(profile.lastPriorDate) && profile.lastPriorDate < gameLocalDate)) ||
      profile.leaguePrior?.seasonStartYear !== seasonStartYear - 1 || profile.provenance?.derivedFromTargetGame !== false) throw new Error('Unbound prior shooting estimate.');
  if (typeof profile.leaguePrior.source !== 'string' || !profile.leaguePrior.source ||
      ![profile.currentObservations, profile.priorObservations].every(value => Number.isInteger(value) && value >= 0 && value <= 10) ||
      (profile.lastPriorDate === null && profile.currentObservations + profile.priorObservations > 0)) throw new Error('Invalid prior shooting population/provenance.');
  for (const [field, value] of Object.entries(profile.rates ?? {})) {
    if (!Object.hasOwn(PRIOR_SHOT_FIELDS, field) || !Number.isFinite(value) || value <= 0 || value >= 1) throw new Error('Unsupported prior shooting rate.');
    const component = profile.components?.[field];
    if (!component || [component.currentMakes, component.currentAttempts, component.priorMakes, component.priorAttempts]
      .some(number => !Number.isSafeInteger(number) || number < 0) || component.currentMakes > component.currentAttempts || component.priorMakes > component.priorAttempts ||
      !Number.isFinite(component.leaguePriorRate) || component.leaguePriorRate <= 0 || component.leaguePriorRate >= 1 ||
      component.priorSeasonDiscount !== 0.5 || component.generatedPseudoAttempts !== generatedStrength[field] ||
      component.leaguePriorRate !== profile.leaguePrior.rates?.[field]) throw new Error('Invalid prior shooting components.');
    if (component.effectiveMakes !== component.currentMakes + 0.5 * component.priorMakes ||
        component.effectiveAttempts !== component.currentAttempts + 0.5 * component.priorAttempts ||
        (profile.currentObservations === 0 && component.currentAttempts !== 0) ||
        (profile.priorObservations === 0 && component.priorAttempts !== 0)) throw new Error('Invalid effective prior shooting counts.');
    const numerator = component.currentMakes + 0.5 * component.priorMakes + component.leaguePriorRate * component.generatedPseudoAttempts;
    const denominator = component.currentAttempts + 0.5 * component.priorAttempts + component.generatedPseudoAttempts;
    if (Math.abs(numerator / denominator - value) > 1e-12) throw new Error('Prior shooting components do not reproduce estimate.');
  }
  if (!Object.keys(PRIOR_SHOT_FIELDS).every(field => Object.hasOwn(profile.rates ?? {}, field))) throw new Error('Incomplete prior shooting rates.');
  return profile;
}
