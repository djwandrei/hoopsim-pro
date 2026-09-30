// Original DJHC source-bound role taxonomy and eligibility rules.
import { boundedText, finite, isObject, safeInteger } from '@/components/spin/engine/scenarioContract';
export const ROLE_TAXONOMY_VERSION = 'swishiq-role-taxonomy-v1';
const freezeSpec = spec => Object.freeze({ ...spec, positions:Object.freeze([...spec.positions]), aliases:Object.freeze([...spec.aliases]) });
export const ROLE_TAXONOMY = Object.freeze({
  guard:freezeSpec({ key:'guard', label:'Guard', positions:['PG','SG','G'], aliases:['backcourt','guards'] }),
  wing:freezeSpec({ key:'wing', label:'Wing', positions:['SG','SF','G','F'], aliases:['perimeter-wing','wings'] }),
  forward:freezeSpec({ key:'forward', label:'Forward', positions:['SF','PF','F'], aliases:['frontcourt-forward','forwards'] }),
  big:freezeSpec({ key:'big', label:'Big', positions:['PF','C'], aliases:['frontcourt','bigs'] }),
  center:freezeSpec({ key:'center', label:'Center', positions:['C'], aliases:['centers','5'] }),
  leadGuard:freezeSpec({ key:'lead-guard', label:'Lead guard', positions:['PG','G'], aliases:['leadguard','primary-creator'] }),
  twoWayWing:freezeSpec({ key:'two-way-wing', label:'Two-way wing', positions:['SG','SF','G','F'], aliases:['two-way wing','two-way-wings'] }),
  connectorForward:freezeSpec({ key:'connector-forward', label:'Connector forward', positions:['SF','PF','F','C'], aliases:['connector','connector forwards'] }),
  rimBig:freezeSpec({ key:'rim-big', label:'Rim big', positions:['PF','C'], aliases:['rim protector','rim-protector'] }),
  stretchBig:freezeSpec({ key:'stretch-big', label:'Stretch big', positions:['PF','C'], aliases:['stretch','stretch-5'] }),
});
const POSITION_ALIASES = new Map([['PG','PG'],['POINT GUARD','PG'],['POINT-GUARD','PG'],['1','PG'],['SG','SG'],['SHOOTING GUARD','SG'],['SHOOTING-GUARD','SG'],['2','SG'],['SF','SF'],['SMALL FORWARD','SF'],['SMALL-FORWARD','SF'],['3','SF'],['PF','PF'],['POWER FORWARD','PF'],['POWER-FORWARD','PF'],['4','PF'],['C','C'],['CENTER','C'],['CENTRE','C'],['5','C'],['G','G'],['GUARD','G'],['BACKCOURT','G'],['F','F'],['FORWARD','F'],['FRONTCOURT','F']]);
const ROLE_ALIASES = new Map(Object.values(ROLE_TAXONOMY).flatMap(spec => [[spec.key,spec.key],[spec.key.replaceAll('-',''),spec.key],[spec.label.toLowerCase(),spec.key],...spec.aliases.map(alias => [String(alias).toLowerCase().trim(),spec.key])]));
const ROLE_BY_KEY = new Map(Object.values(ROLE_TAXONOMY).map(spec => [spec.key,spec]));
export function normalizePosition(value) { if (typeof value !== 'string') return null; return POSITION_ALIASES.get(value.trim().toUpperCase().replace(/\s+/g,' ')) || null; }
export function normalizeRole(value) { if (typeof value !== 'string') return null; const normalized = value.trim().toLowerCase().replace(/\s+/g,' '); return ROLE_ALIASES.get(normalized) || ROLE_ALIASES.get(normalized.replaceAll(' ','-')) || null; }
export function normalizePositions(values) { if (values === undefined || values === null) return []; if (!Array.isArray(values)) values = [values]; return [...new Set(values.map(normalizePosition).filter(Boolean))]; }
export function normalizeRoles(values) { if (values === undefined || values === null) return []; if (!Array.isArray(values)) values = [values]; return [...new Set(values.map(normalizeRole).filter(Boolean))]; }
function explicitRoleValues(profile) { const values = []; for (const key of ['role','primaryRole','archetype']) if (profile?.[key] != null) values.push(profile[key]); for (const key of ['roles','roleFamilies','eligibleRoles']) { if (Array.isArray(profile?.[key])) values.push(...profile[key]); else if (profile?.[key] != null) values.push(profile[key]); } return normalizeRoles(values); }
function profilePositions(profile) { const values = []; for (const key of ['positions','eligiblePositions']) { if (Array.isArray(profile?.[key])) values.push(...profile[key]); else if (profile?.[key] != null) values.push(profile[key]); } for (const key of ['position','primaryPosition']) if (profile?.[key] != null) values.push(profile[key]); return normalizePositions(values); }
function roleFamiliesFromPositions(positions) { const result = new Set(); for (const spec of Object.values(ROLE_TAXONOMY)) if (positions.some(position => spec.positions.includes(position))) result.add(spec.key); return [...result]; }
export function resolveProfileRoles(profile) {
  const positions = profilePositions(profile), explicitRoles = explicitRoleValues(profile), positionRoles = roleFamiliesFromPositions(positions);
  const roles = [...new Set([...explicitRoles,...positionRoles])];
  return { status:roles.length ? 'available' : 'unavailable', roles, positions, explicitRoles, positionRoles, evidence:[...(explicitRoles.length ? ['explicit-role-label'] : []),...(positions.length ? ['source-position-label'] : [])], reason:roles.length ? null : 'No recognized source position or explicit role label is available.' };
}
function metricValue(profile,key) { for (const candidate of [profile?.metrics?.[key],profile?.components?.[key],profile?.[key]]) { if (finite(candidate)) return candidate; if (isObject(candidate) && finite(candidate.value)) return candidate.value; } return null; }
function metricStatus(profile,key) { for (const candidate of [profile?.metrics?.[key],profile?.components?.[key]]) if (isObject(candidate) && typeof candidate.status === 'string') return candidate.status; return null; }
function normalizeMetricRules(value,label) {
  if (value === undefined || value === null) return [];
  if (!isObject(value)) throw new Error(`${label} must be an object of metric thresholds.`);
  return Object.entries(value).map(([key,raw]) => { const config = finite(raw) ? { minimum:raw } : isObject(raw) ? raw : null; if (!config || (config.minimum !== undefined && !finite(Number(config.minimum))) || (config.maximum !== undefined && !finite(Number(config.maximum)))) throw new Error(`${label}.${key} must declare finite minimum/maximum values.`); const minimum = config.minimum === undefined ? null : Number(config.minimum), maximum = config.maximum === undefined ? null : Number(config.maximum); if (minimum === null && maximum === null) throw new Error(`${label}.${key} needs a minimum or maximum.`); if (minimum !== null && maximum !== null && minimum > maximum) throw new Error(`${label}.${key} has reversed bounds.`); return { key, minimum, maximum, requireObserved:config.requireObserved === true }; });
}
export function compileRoleEligibilityRule(rule = {}) {
  if (!isObject(rule)) throw new Error('Role eligibility rules must be an object.');
  const roles = normalizeRoles(rule.roles ?? rule.role ?? rule.requiredRoles), allRoles = normalizeRoles(rule.allRoles ?? rule.requireAllRoles), anyRoles = normalizeRoles(rule.anyRoles ?? rule.requireAnyRole), positions = normalizePositions(rule.positions ?? rule.position);
  const minMetrics = normalizeMetricRules(rule.minMetrics ?? rule.minimumMetrics,'minMetrics'), maxMetrics = normalizeMetricRules(rule.maxMetrics ?? rule.maximumMetrics,'maxMetrics');
  const teamCodes = rule.teamCodes ?? rule.teams ?? rule.team;
  const teams = teamCodes === undefined || teamCodes === null ? [] : (Array.isArray(teamCodes) ? teamCodes : [teamCodes]).map(value => boundedText(value,40)?.toUpperCase()).filter(Boolean);
  if (teamCodes !== undefined && teams.length !== (Array.isArray(teamCodes) ? teamCodes.length : 1)) throw new Error('Role eligibility teams contain an invalid label.');
  const seasonsRaw = rule.seasonStartYears ?? rule.seasons, seasons = seasonsRaw === undefined || seasonsRaw === null ? [] : (Array.isArray(seasonsRaw) ? seasonsRaw : [seasonsRaw]).map(Number);
  if (seasons.some(year => !safeInteger(year,1947,2200)) || new Set(seasons).size !== seasons.length) throw new Error('Role eligibility seasons are invalid.');
  const phasesRaw = rule.phases ?? rule.phase, phases = phasesRaw === undefined || phasesRaw === null ? [] : (Array.isArray(phasesRaw) ? phasesRaw : [phasesRaw]).map(value => String(value).trim());
  if (phases.some(phase => !phase)) throw new Error('Role eligibility phases are invalid.');
  const minGames = rule.minGames === undefined ? null : Number(rule.minGames), minMinutes = rule.minMinutes === undefined ? null : Number(rule.minMinutes);
  if (minGames !== null && (!finite(minGames) || minGames < 0) || minMinutes !== null && (!finite(minMinutes) || minMinutes < 0)) throw new Error('Role eligibility workload thresholds must be non-negative finite numbers.');
  if (roles.length && allRoles.length && roles.some(role => !allRoles.includes(role))) throw new Error('Role rule aliases conflict.');
  return Object.freeze({ version:ROLE_TAXONOMY_VERSION, roles, allRoles, anyRoles, positions, minMetrics, maxMetrics, teams:[...new Set(teams)], seasons:[...new Set(seasons)].sort((a,b) => a-b), phases:[...new Set(phases)], minGames, minMinutes, requireObserved:rule.requireObserved === true, requireRoleEvidence:rule.requireRoleEvidence === true || Boolean(roles.length || allRoles.length || anyRoles.length || positions.length), uniquePlayerKey:rule.uniquePlayerKey === false ? false : (boundedText(rule.uniquePlayerKey,80) || 'playerRef') });
}
function result(status,reason,details = {}) { return { status, eligible:status === 'eligible', reason, ...details }; }
export function evaluateRoleEligibility(profile,rawRule = {}) {
  const rule = rawRule?.version === ROLE_TAXONOMY_VERSION ? rawRule : compileRoleEligibilityRule(rawRule);
  if (!isObject(profile)) return result('unavailable','Player profile is missing.');
  const roles = resolveProfileRoles(profile), unavailableReasons = [], ineligibleReasons = [];
  if (rule.requireRoleEvidence && roles.status !== 'available') unavailableReasons.push(roles.reason);
  if (rule.roles.length && !rule.roles.some(role => roles.roles.includes(role))) ineligibleReasons.push('profile does not match any required role');
  if (rule.allRoles.length && rule.allRoles.some(role => !roles.roles.includes(role))) ineligibleReasons.push('profile does not match every required role');
  if (rule.anyRoles.length && !rule.anyRoles.some(role => roles.roles.includes(role))) ineligibleReasons.push('profile does not match any accepted role');
  if (rule.positions.length && !rule.positions.some(position => roles.positions.includes(position))) { if (!roles.positions.length) unavailableReasons.push('No recognized source position is available.'); else ineligibleReasons.push('profile does not match any required position'); }
  if (rule.teams.length) { const team = String(profile.team || profile.teamCode || '').trim().toUpperCase(); if (!team) unavailableReasons.push('Team scope is unavailable.'); else if (!rule.teams.includes(team)) ineligibleReasons.push('profile is outside the requested team scope'); }
  if (rule.seasons.length) { const season = Number(profile.seasonStartYear); if (!Number.isSafeInteger(season)) unavailableReasons.push('Season scope is unavailable.'); else if (!rule.seasons.includes(season)) ineligibleReasons.push('profile is outside the requested season scope'); }
  if (rule.phases.length) { const phase = String(profile.phase || '').trim(); if (!phase) unavailableReasons.push('Competition phase is unavailable.'); else if (!rule.phases.includes(phase)) ineligibleReasons.push('profile is outside the requested phase scope'); }
  if (rule.requireObserved && profile.observed !== true && profile.sourceStatus !== 'observed') unavailableReasons.push('Profile is not marked as observed evidence.');
  const games = Number(profile.games ?? profile.knownGames), minutes = Number(profile.minutes);
  if (rule.minGames !== null) { if (!finite(games)) unavailableReasons.push('Games exposure is unavailable.'); else if (games < rule.minGames) ineligibleReasons.push('profile has fewer than the required games'); }
  if (rule.minMinutes !== null) { if (!finite(minutes)) unavailableReasons.push('Minutes exposure is unavailable.'); else if (minutes < rule.minMinutes) ineligibleReasons.push('profile has fewer than the required minutes'); }
  const metricChecks = [];
  for (const check of [...rule.minMetrics,...rule.maxMetrics]) { const value = metricValue(profile,check.key), status = metricStatus(profile,check.key), missing = !finite(value) || (check.requireObserved && !['observed','available','ready'].includes(status)); metricChecks.push({ ...check, value:finite(value) ? value : null, status, missing }); if (missing) unavailableReasons.push(`Metric ${check.key} is unavailable.`); else if (check.minimum !== null && value < check.minimum) ineligibleReasons.push(`Metric ${check.key} is below its minimum.`); else if (check.maximum !== null && value > check.maximum) ineligibleReasons.push(`Metric ${check.key} is above its maximum.`); }
  const status = unavailableReasons.length ? 'unavailable' : ineligibleReasons.length ? 'ineligible' : 'eligible';
  return result(status,status === 'eligible' ? null : [...new Set([...unavailableReasons,...ineligibleReasons])].join(' '),{ roleEvidence:roles, metricChecks, reasons:[...new Set([...unavailableReasons,...ineligibleReasons])] });
}
export function filterEligibleProfiles(profiles,rule = {},{ includeUnavailable = false } = {}) {
  if (!Array.isArray(profiles)) throw new Error('Role eligibility needs a player-profile array.');
  const compiled = rule?.version === ROLE_TAXONOMY_VERSION ? rule : compileRoleEligibilityRule(rule), evaluated = profiles.map(profile => ({ profile, ...evaluateRoleEligibility(profile,compiled) }));
  return { rule:compiled, eligible:evaluated.filter(row => row.status === 'eligible').map(row => row.profile), unavailable:evaluated.filter(row => row.status === 'unavailable').map(row => ({ profile:row.profile, reasons:row.reasons })), ineligible:evaluated.filter(row => row.status === 'ineligible').map(row => ({ profile:row.profile, reasons:row.reasons })), evaluated:includeUnavailable ? evaluated : undefined };
}
export function roleLabel(value) { const key = normalizeRole(value); return key ? ROLE_BY_KEY.get(key).label : null; }