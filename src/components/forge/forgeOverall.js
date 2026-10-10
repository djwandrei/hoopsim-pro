import { SKILLS } from './bapSkills.js';

const ROLE_MULTIPLIERS = {
  Guard: { jumpShot: 1.12, playmaking: 1.12, perimeterDefense: 1.12, rimProtection: 0.9 },
  Big: { finishing: 1.12, rebounding: 1.12, rimProtection: 1.12 },
};
const POSITION_ROLES = { PG: 'Guard', SG: 'Guard', SF: 'Wing', PF: 'Big', C: 'Big', G: 'Guard' };

function canonicalRole(value) {
  const role = String(value || '').trim().toLowerCase();
  if (role === 'guard') return 'Guard';
  if (role === 'wing') return 'Wing';
  if (role === 'big' || role === 'center' || role === 'centre') return 'Big';
  return null;
}

function positionTokens(value) {
  const values = Array.isArray(value) ? value : [value];
  return values.flatMap(position => String(position || '').toUpperCase().split(/[\s,|/-]+/).filter(Boolean));
}

function roleFromPositions(value) {
  const roles = [...new Set(positionTokens(value).map(position => POSITION_ROLES[position]).filter(Boolean))];
  return roles.length === 1 ? roles[0] : null;
}

function maybePlayerRole(player) {
  const bodyRole = roleFromPositions(player?.measurements?.position);
  if (bodyRole) return bodyRole;

  const sourcePositions = roleFromPositions(player?.positions ?? player?.position);
  if (sourcePositions) return sourcePositions;

  return canonicalRole(player?.roleGroup);
}

export function getForgePlayerRole(player) {
  return maybePlayerRole(player) || 'Balanced';
}

export function getForgeCompositeRole(picks, group = 'All') {
  if (group === 'Guard') return 'Guard';
  if (group === 'Big') return 'Big';

  const bodyPick = picks?.body;
  const bodyDonor = Number.isFinite(bodyPick?.value) ? bodyPick.player : null;
  const bodyRole = maybePlayerRole(bodyDonor);
  if (bodyRole) return bodyRole;

  const counts = new Map();
  for (const skill of SKILLS) {
    const pick = picks?.[skill.key];
    if (!Number.isFinite(pick?.value)) continue;
    const role = maybePlayerRole(pick?.player);
    if (role) counts.set(role, (counts.get(role) || 0) + 1);
  }
  if (!counts.size) return 'Balanced';

  const maximum = Math.max(...counts.values());
  const leaders = [...counts.entries()].filter(([, count]) => count === maximum).map(([role]) => role);
  return leaders.length === 1 ? leaders[0] : 'Balanced';
}

export function getForgeCompositeOvrContext(picks, group = 'All') {
  const role = getForgeCompositeRole(picks, group);
  return {
    role,
    label: role === 'Guard' ? 'Guard-weighted OVR' : role === 'Big' ? 'Big-weighted OVR' : 'Balanced OVR',
  };
}

function multiplier(role, skillKey) {
  return ROLE_MULTIPLIERS[role]?.[skillKey] ?? 1;
}

function score(values, role, overrides = {}, skills = SKILLS) {
  let weighted = 0;
  let totalWeight = 0;
  for (const skill of skills) {
    const override = overrides[skill.key];
    const weight = Number.isFinite(override) ? Math.max(0, override) : skill.weight * multiplier(role, skill.key);
    weighted += (Number.isFinite(values?.[skill.key]) ? values[skill.key] : 75) * weight;
    totalWeight += weight;
  }
  return totalWeight ? weighted / totalWeight : 75;
}

export function forgeOverallScore(player, weights = {}, roleOverride) {
  const role = canonicalRole(roleOverride) || maybePlayerRole(player) || 'Balanced';
  return score(player, role, weights);
}

export function forgeCompositeOverallScore(picks, group = 'All') {
  const known = SKILLS.filter(skill => Number.isFinite(picks?.[skill.key]?.value));
  if (!known.length) return null;

  const role = getForgeCompositeRole(picks, group);
  const values = Object.fromEntries(known.map(skill => [skill.key, picks[skill.key].value]));
  return score(values, role, {}, known);
}

export function forgeMinutesWeightedOverall(rotation) {
  const minutes = (rotation || []).map(entry => Number.isFinite(entry?.minutes) && entry.minutes > 0 ? entry.minutes : 0);
  const totalMinutes = minutes.reduce((sum, value) => sum + value, 0);
  if (!totalMinutes) return 75;

  return rotation.reduce((sum, entry, index) => sum + forgeOverallScore(entry?.player) * minutes[index], 0) / totalMinutes;
}

export const FORGE_OVR_ROLE_MULTIPLIERS = ROLE_MULTIPLIERS;
