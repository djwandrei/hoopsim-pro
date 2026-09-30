// DJHC seeded-pool-engine-v2: canonical ordering, validation and draw algorithms.
import { createScenarioRandom } from '@/components/spin/engine/scenarioRandom';
import { MODEL_POOL_CONTRACT_VERSION, assertSeed, boundedText, finite, isObject, normalizeModelPackageRef, publicModelPackageRef, rowMatchesModelPackage, stableHash, stableSerialize, unavailable } from '@/components/spin/engine/scenarioContract';
import { ROLE_TAXONOMY_VERSION, compileRoleEligibilityRule, filterEligibleProfiles } from '@/components/spin/engine/roleTaxonomy';
export const SEEDED_POOL_ENGINE_VERSION = 'swishiq-seeded-pool-engine-v2';
export const SEEDED_POOL_LIMITS = Object.freeze({ maxEntries:10000, maxSpins:1000 });
const textCompare = (left,right) => left < right ? -1 : left > right ? 1 : 0;
const sortedUnique = values => [...new Set(values)].sort(textCompare);
const cloneEntry = entry => isObject(entry) ? { ...entry } : entry;
function entryKey(entry,index = 0,uniquePlayerKey = null) {
  if (!isObject(entry)) return null;
  const explicit = uniquePlayerKey && entry[uniquePlayerKey] != null ? entry[uniquePlayerKey] : null;
  const raw = explicit ?? entry.id ?? entry.key ?? entry.playerSeasonRef ?? entry.playerRef ?? entry.playerId;
  if (raw !== undefined && raw !== null && String(raw).trim()) return String(raw).trim();
  const name = entry.player || entry.playerName || entry.displayName, season = entry.seasonStartYear ?? entry.season, team = entry.team || entry.teamCode;
  return name && season != null && team ? `${String(name).trim()}|${season}|${String(team).trim()}` : null;
}
function stableEntryKey(entry,index,uniquePlayerKey) { const key = entryKey(entry,index,uniquePlayerKey); return key ? key.toLowerCase() : null; }
function sortedEntries(entries,uniquePlayerKey) { return entries.map((entry,index) => ({ entry, index, key:stableEntryKey(entry,index,uniquePlayerKey) })).sort((left,right) => { if (!left.key && !right.key) return left.index-right.index; if (!left.key) return 1; if (!right.key) return -1; return textCompare(left.key,right.key) || left.index-right.index; }); }
function derivedSeed(seed,label) { return `pool-v1-${stableHash({ seed,label })}`; }
function randomShuffle(entries,seed,label = 'shuffle') { const random = createScenarioRandom(derivedSeed(seed,label)), result = entries.map(cloneEntry); for (let index = result.length-1; index > 0; index -= 1) { const swap = Math.floor(random()*(index+1)); [result[index],result[swap]] = [result[swap],result[index]]; } return result; }
function normalizeCount(value,label,maximum) { const count = Number(value); if (!Number.isSafeInteger(count) || count < 1 || count > maximum) throw new Error(`${label} must be a bounded positive integer.`); return count; }
function canonicalEligibilityRule(input) {
  const rule = input?.version === ROLE_TAXONOMY_VERSION ? input : compileRoleEligibilityRule(input || {});
  const arrayFields = ['roles','allRoles','anyRoles','positions','teams','seasons','phases','minMetrics','maxMetrics'];
  if (!isObject(rule) || rule.version !== ROLE_TAXONOMY_VERSION || arrayFields.some(field => !Array.isArray(rule[field]))) throw new Error('The role eligibility rule has an unsupported shape.');
  const stringFields = ['roles','allRoles','anyRoles','positions','teams','phases'];
  if (stringFields.some(field => rule[field].some(value => typeof value !== 'string' || !value.trim()))) throw new Error('The role eligibility rule contains an invalid label.');
  const normalizeMetricRules = values => values.map(item => { if (!isObject(item) || typeof item.key !== 'string' || !item.key.trim() || (item.minimum !== null && !finite(item.minimum)) || (item.maximum !== null && !finite(item.maximum))) throw new Error('The role eligibility rule contains an invalid metric threshold.'); return { key:item.key, minimum:item.minimum, maximum:item.maximum, requireObserved:item.requireObserved === true }; }).sort((left,right) => textCompare(left.key,right.key));
  const canonical = { version:ROLE_TAXONOMY_VERSION, roles:sortedUnique(rule.roles), allRoles:sortedUnique(rule.allRoles), anyRoles:sortedUnique(rule.anyRoles), positions:sortedUnique(rule.positions), minMetrics:normalizeMetricRules(rule.minMetrics), maxMetrics:normalizeMetricRules(rule.maxMetrics), teams:sortedUnique(rule.teams), seasons:[...new Set(rule.seasons)].sort((left,right) => left-right), phases:sortedUnique(rule.phases), minGames:rule.minGames ?? null, minMinutes:rule.minMinutes ?? null, requireObserved:rule.requireObserved === true, requireRoleEvidence:rule.requireRoleEvidence === true, uniquePlayerKey:rule.uniquePlayerKey === false ? false : rule.uniquePlayerKey };
  if (canonical.seasons.some(year => !Number.isSafeInteger(year) || year < 1947 || year > 2200) || [canonical.minGames,canonical.minMinutes].some(value => value !== null && (!finite(value) || value < 0)) || (canonical.uniquePlayerKey !== false && !boundedText(canonical.uniquePlayerKey,80))) throw new Error('The role eligibility rule contains invalid values.');
  return canonical;
}
export function canonicalizeSeededEligibility(input = {}) { return canonicalEligibilityRule(input); }
function poolFailure(reason,extra = {}) { return unavailable(reason,{ engineVersion:SEEDED_POOL_ENGINE_VERSION, contractVersion:MODEL_POOL_CONTRACT_VERSION, ...extra }); }
export function buildSeededPool({ entries, packageRef, seed, eligibility = {}, uniquePlayerKey = null, maxEntries = SEEDED_POOL_LIMITS.maxEntries } = {}) {
  if (!Array.isArray(entries)) throw new Error('Seeded pools require an entry array.');
  if (!Number.isSafeInteger(maxEntries) || maxEntries < 1 || maxEntries > SEEDED_POOL_LIMITS.maxEntries) throw new Error('Seeded pool entry limit is out of bounds.');
  if (entries.length > maxEntries || entries.length > SEEDED_POOL_LIMITS.maxEntries) throw new Error('Seeded pool exceeds the bounded entry limit.');
  const replaySeed = assertSeed(seed,'pool seed');
  let scope, canonicalRule;
  try { scope = normalizeModelPackageRef(packageRef); } catch (error) { return poolFailure(error.message); }
  const keyField = uniquePlayerKey === false || uniquePlayerKey == null ? null : boundedText(uniquePlayerKey,80);
  if (uniquePlayerKey !== false && uniquePlayerKey != null && !keyField) return poolFailure('The unique player key field is invalid.');
  try { canonicalRule = canonicalEligibilityRule(eligibility); } catch (error) { return poolFailure(error.message); }
  const rows = sortedEntries(entries,keyField);
  if (rows.some(row => !row.key)) return poolFailure('Pool entries need stable replay keys.');
  const seen = new Set(), excluded = [], candidates = [];
  for (const row of rows) { const entry = row.entry; if (!isObject(entry)) { excluded.push({ key:row.key, reason:'invalid-entry' }); continue; } if (seen.has(row.key)) return poolFailure('Pool entries contain duplicate replay keys.',{ duplicateKey:row.key }); seen.add(row.key); if (!rowMatchesModelPackage(entry,scope,{ allowMissingPins:true })) { excluded.push({ key:row.key, reason:'outside-package-scope' }); continue; } candidates.push(entry); }
  if (!candidates.length) return poolFailure('No entries match the bound package season and phase scope.',{ excluded });
  let eligibilityResult;
  try { eligibilityResult = filterEligibleProfiles(candidates,canonicalRule,{ includeUnavailable:true }); } catch (error) { return poolFailure(error.message,{ excluded }); }
  eligibilityResult.unavailable.forEach(row => excluded.push({ key:entryKey(row.profile), reason:'eligibility-unavailable', reasons:row.reasons }));
  eligibilityResult.ineligible.forEach(row => excluded.push({ key:entryKey(row.profile), reason:'ineligible', reasons:row.reasons }));
  const eligible = sortedEntries(eligibilityResult.eligible,keyField).map(row => cloneEntry(row.entry));
  if (!eligible.length) return poolFailure('No eligible entries have the requested role and evidence.',{ excluded, eligibility:eligibilityResult.rule });
  const canonicalExcluded = excluded.map(item => ({ ...item, ...(Array.isArray(item.reasons) ? { reasons:[...item.reasons].sort(textCompare) } : {}) })).sort((left,right) => textCompare(String(left.key || ''),String(right.key || '')) || textCompare(String(left.reason || ''),String(right.reason || '')));
  const canonical = eligible.map((entry,index) => ({ key:stableEntryKey(entry,index,keyField), entry }));
  const poolHash = stableHash({ contractVersion:MODEL_POOL_CONTRACT_VERSION, engineVersion:SEEDED_POOL_ENGINE_VERSION, package:publicModelPackageRef(scope), eligibility:eligibilityResult.rule, uniquePlayerKey:keyField, entries:canonical });
  const shuffled = randomShuffle(eligible,replaySeed,poolHash);
  const receipt = { engineVersion:SEEDED_POOL_ENGINE_VERSION, contractVersion:MODEL_POOL_CONTRACT_VERSION, seed:replaySeed, poolHash, entryCount:shuffled.length, excludedCount:canonicalExcluded.length, excludedHash:stableHash(canonicalExcluded), scope:publicModelPackageRef(scope) };
  return { status:'ready', engineVersion:SEEDED_POOL_ENGINE_VERSION, contractVersion:MODEL_POOL_CONTRACT_VERSION, seed:replaySeed, packageRef:scope, scope:scope.scope, eligibility:eligibilityResult.rule, uniquePlayerKey:keyField, entries:shuffled, players:shuffled, excluded:canonicalExcluded, poolHash, receipt };
}
export function validateSeededPool(pool,{ packageRef, seed, eligibility } = {}) {
  if (!isObject(pool) || pool.status !== 'ready' || !Array.isArray(pool.entries) || !pool.entries.length) return poolFailure('The supplied seeded pool is not ready.');
  if (pool.engineVersion !== SEEDED_POOL_ENGINE_VERSION || pool.contractVersion !== MODEL_POOL_CONTRACT_VERSION) return poolFailure('The supplied seeded pool uses an unsupported engine or contract version.');
  if (pool.entries.length > SEEDED_POOL_LIMITS.maxEntries || !Array.isArray(pool.excluded) || !isObject(pool.receipt)) return poolFailure('The supplied seeded pool is outside the bounded receipt shape.');
  try {
    const normalizedPoolPackage = normalizeModelPackageRef(pool.packageRef), normalizedSeed = assertSeed(pool.seed,'pool seed');
    if (seed !== undefined && normalizedSeed !== assertSeed(seed,'scenario seed')) return poolFailure('The supplied pool seed does not match the requested replay seed.');
    if (packageRef !== undefined && stableSerialize(publicModelPackageRef(normalizedPoolPackage)) !== stableSerialize(publicModelPackageRef(normalizeModelPackageRef(packageRef)))) return poolFailure('The supplied pool belongs to a different package or package pin.');
    const canonicalRule = canonicalEligibilityRule(pool.eligibility);
    if (eligibility !== undefined && stableSerialize(canonicalRule) !== stableSerialize(canonicalEligibilityRule(eligibility))) return poolFailure('The supplied pool eligibility does not match the requested role and evidence filters.');
    const keyField = pool.uniquePlayerKey === null ? null : boundedText(pool.uniquePlayerKey,80);
    if (pool.uniquePlayerKey !== null && !keyField) return poolFailure('The supplied pool identity field is invalid.');
    const rebuilt = buildSeededPool({ entries:pool.entries, packageRef:normalizedPoolPackage, seed:normalizedSeed, eligibility:canonicalRule, uniquePlayerKey:keyField });
    if (rebuilt.status !== 'ready' || rebuilt.poolHash !== pool.poolHash) return poolFailure('The supplied pool entries do not match their replay hash.');
    const canonicalExcluded = pool.excluded.map(item => ({ ...item, ...(Array.isArray(item?.reasons) ? { reasons:[...item.reasons].sort(textCompare) } : {}) })).sort((left,right) => textCompare(String(left.key || ''),String(right.key || '')) || textCompare(String(left.reason || ''),String(right.reason || '')));
    const receipt = pool.receipt;
    if (receipt.engineVersion !== SEEDED_POOL_ENGINE_VERSION || receipt.contractVersion !== MODEL_POOL_CONTRACT_VERSION || receipt.seed !== normalizedSeed || receipt.poolHash !== rebuilt.poolHash || receipt.entryCount !== rebuilt.entries.length || !Number.isSafeInteger(receipt.excludedCount) || receipt.excludedCount !== pool.excluded.length || receipt.excludedHash !== stableHash(canonicalExcluded) || stableSerialize(receipt.scope) !== stableSerialize(publicModelPackageRef(normalizedPoolPackage))) return poolFailure('The supplied pool receipt does not match its package, entries, or replay seed.');
    stableSerialize(canonicalExcluded);
    return { ...rebuilt, excluded:canonicalExcluded, receipt:{ ...receipt, scope:publicModelPackageRef(normalizedPoolPackage) } };
  } catch (error) { return poolFailure(error.message || 'The supplied seeded pool is invalid.'); }
}
export function seededShuffle(entries,seed,{ keyField = null } = {}) { if (!Array.isArray(entries)) throw new Error('Seeded shuffle requires an entry array.'); const replaySeed = assertSeed(seed,'shuffle seed'), rows = sortedEntries(entries,keyField); if (rows.some(row => !row.key)) throw new Error('Seeded shuffle entries need stable keys.'); if (new Set(rows.map(row => row.key)).size !== rows.length) throw new Error('Seeded shuffle entries need unique keys.'); return randomShuffle(rows.map(row => row.entry),replaySeed,'standalone-shuffle'); }
function weightedValue(entry,weightField) { const raw = weightField ? entry?.[weightField] : entry?.weight; if (raw === undefined || raw === null || raw === '') return 1; const value = Number(raw); return finite(value) && value >= 0 ? value : null; }
function pickIndex(rows,random,weightField) { const weights = rows.map(row => weightedValue(row,weightField)); if (weights.some(value => value === null)) return { index:-1, reason:'A pool weight is not a non-negative finite number.' }; const maximum = Math.max(...weights); if (!(maximum > 0)) return { index:-1, reason:'The pool has no positive selection weight.' }; const scaledWeights = weights.map(value => value/maximum), total = scaledWeights.reduce((sum,value) => sum+value,0); let cursor = random()*total; for (let index = 0; index < scaledWeights.length; index += 1) { cursor -= scaledWeights[index]; if (cursor < 0 || index === weights.length-1) return { index }; } return { index:rows.length-1 }; }
export function spinSeededPool(poolOrInput,{ count = 1, withoutReplacement = true, spinIndex = 0, weightField = null } = {}) {
  const pool = poolOrInput?.status === 'ready' ? validateSeededPool(poolOrInput) : buildSeededPool(poolOrInput || {});
  if (pool.status !== 'ready') return poolFailure(pool.reason || 'The seeded pool is unavailable.',{ pool });
  const requested = normalizeCount(count,'spin count',SEEDED_POOL_LIMITS.maxEntries);
  if (!Number.isSafeInteger(spinIndex) || spinIndex < 0 || spinIndex > SEEDED_POOL_LIMITS.maxSpins) throw new Error('Spin index is out of bounds.');
  if (typeof withoutReplacement !== 'boolean') throw new Error('withoutReplacement must be a boolean.');
  const requestedWeightField = weightField == null ? null : boundedText(weightField,80);
  if (weightField != null && !requestedWeightField) throw new Error('The pool weight field must be a bounded field name.');
  const resolvedWeightField = requestedWeightField || (pool.entries.some(entry => entry?.weight !== undefined && entry.weight !== null && entry.weight !== '') ? 'weight' : null);
  if (withoutReplacement && requested > pool.entries.length) return poolFailure('The requested spin count exceeds the eligible pool.',{ pool });
  const random = createScenarioRandom(derivedSeed(pool.seed,`${pool.poolHash}:${spinIndex}`)), remaining = pool.entries.map(cloneEntry), selected = [];
  for (let index = 0; index < requested; index += 1) { const pick = pickIndex(remaining,random,resolvedWeightField); if (pick.index < 0) return poolFailure(pick.reason,{ pool,selected }); selected.push(remaining[pick.index]); if (withoutReplacement) remaining.splice(pick.index,1); }
  const selectionKeys = selected.map((entry,index) => stableEntryKey(entry,index,pool.uniquePlayerKey));
  const selectionHash = stableHash({ poolHash:pool.poolHash, seed:pool.seed, spinIndex, selectionKeys, withoutReplacement, weightField:resolvedWeightField });
  return { status:'ready', engineVersion:SEEDED_POOL_ENGINE_VERSION, contractVersion:MODEL_POOL_CONTRACT_VERSION, seed:pool.seed, spinIndex, withoutReplacement, weightField:resolvedWeightField, selected, selectionHash, poolHash:pool.poolHash, receipt:{ ...pool.receipt, spinIndex, count:selected.length, withoutReplacement, weightField:resolvedWeightField, selectionHash } };
}
export const spinPool = spinSeededPool;