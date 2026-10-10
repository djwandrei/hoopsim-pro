import { CONDITIONAL_LINEUP_PUBLICATION } from './conditional-lineup-model-pin-cb942ed193111248.js';
import { normalizeCanonicalV4PlayerNameKey as nameKey } from '../../engine/canonical-v4-player-name-identity.js?v=20261001d&rev=canonical-v4-player-name-identity-v1';

const models = new Map();
const indexes = new WeakMap();
const require = (condition, message) => { if (!condition) throw new Error(message); };
export const CONDITIONAL_LINEUP_MODEL_VERSION = 'native-v4-conditional-lineup-od-v1';

export function conditionalLineupModelEntry(seasonEndYear, phase = 'regular') {
  return CONDITIONAL_LINEUP_PUBLICATION.entries.find(entry => entry.seasonEndYear === Number(seasonEndYear)
    && entry.phase === phase) || null;
}

export function validatePublishedLineupModel(model, entry) {
  require(model?.format === 'djhc-public-conditional-lineup-model-v1'
    && model.modelVersion === CONDITIONAL_LINEUP_MODEL_VERSION, 'Unsupported conditional lineup model.');
  require(model.seasonEndYear === entry.seasonEndYear && model.phase === entry.phase
    && model.modelSha256 === entry.modelSha256
    && model.observedThroughLocalDate === entry.observedThroughLocalDate,
    'The lineup model does not match the pinned exact season.');
  require(Number.isFinite(model.baselineOffensiveRatingPer100) && Number.isFinite(model.homeCourtEffectPer100),
    'The lineup model has invalid scoring coefficients.');
  require(model.validation?.checksPassed === 12 && model.validation?.checksTotal === 12
    && model.scope === 'conditional-on-specified-paired-lineups', 'The conditional validation contract is unavailable.');
  require(Array.isArray(model.players) && model.players.length > 0 && Array.isArray(model.roster), 'The lineup model has no player coverage.');
  const keys = new Set();
  for (const player of model.players) {
    require(player.playerNameKey === nameKey(player.displayName) && !keys.has(player.playerNameKey), 'Ambiguous lineup player identity.');
    require(Number.isFinite(player.offensiveRapmPer100) && Number.isFinite(player.defensiveRapmPer100)
      && Number.isFinite(player.pairedPossessions) && player.pairedPossessions > 0, 'Invalid lineup player effects.');
    keys.add(player.playerNameKey);
  }
  require(model.nameAliases && Object.values(model.nameAliases).every(key => keys.has(key)), 'Invalid lineup name crosswalk.');
  return model;
}

export async function loadConditionalLineupModel(seasonEndYear, phase = 'regular', { fetchImpl = fetch } = {}) {
  const entry = conditionalLineupModelEntry(seasonEndYear, phase);
  if (!entry) throw new Error('The conditional model is available only for 2022–23 through 2025–26 regular seasons. No other season is substituted.');
  if (!models.has(entry.sha256)) models.set(entry.sha256, (async () => {
    const response = await fetchImpl(new URL(`../${entry.path}`, import.meta.url).toString());
    require(response.ok, 'The pinned conditional model could not be loaded.');
    const bytes = await response.arrayBuffer();
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    const hex = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
    require(hex === entry.sha256 && bytes.byteLength === entry.bytes, 'The conditional model failed its integrity check.');
    return validatePublishedLineupModel(JSON.parse(new TextDecoder().decode(bytes)), entry);
  })().catch(error => { models.delete(entry.sha256); throw error; }));
  return models.get(entry.sha256);
}

function modelIndex(model) {
  if (!indexes.has(model)) indexes.set(model, new Map(model.players.map(player => [player.playerNameKey, player])));
  return indexes.get(model);
}

/** A documented zero prior is allowed only for a named roster player without
 * fitting history. An unrecognized or ambiguous identity never becomes zero. */
export function resolveConditionalLineupPlayer(model, player) {
  const displayName = String(player?.name ?? player?.displayName ?? player ?? '').trim();
  const key = nameKey(displayName), alias = model.nameAliases[key];
  const effect = modelIndex(model).get(alias);
  const roster = model.roster.filter(row => (row.playerNameKey === key || row.sourcePlayerNameKey === key)
    && (!player?.team || row.teamCode === player.team));
  require(effect || roster.length > 0, `${displayName || 'This player'} is not registered for this exact season.`);
  const rosterIdentities = new Set(roster.map(row => row.sourcePlayerNameKey || row.playerNameKey));
  require(effect || rosterIdentities.size === 1, `${displayName} has an ambiguous exact-season identity.`);
  return { displayName, playerNameKey: alias || [...rosterIdentities][0], effect: effect || null,
    fittedHistoryAvailable: Boolean(effect), limitedHistory: Boolean(effect && !effect.displayEligible) };
}

/** Same scoring equations and full-precision effects as the frozen runner. */
export function predictPublishedConditionalLineup(model, ownFive, opponentFive, { venue = 'home' } = {}) {
  require(venue === 'home' || venue === 'away', 'Choose home or away court.');
  require(Array.isArray(ownFive) && ownFive.length === 5 && Array.isArray(opponentFive)
    && opponentFive.length === 5, 'Choose exactly five players for each side.');
  const own = ownFive.map(player => resolveConditionalLineupPlayer(model, player));
  const opponent = opponentFive.map(player => resolveConditionalLineupPlayer(model, player));
  require(new Set([...own, ...opponent].map(player => player.playerNameKey)).size === 10,
    'Each side needs five distinct players, with no player on both sides.');
  const sum = (players, field) => players.reduce((total, player) => total + (player.effect?.[field] ?? 0), 0);
  const court = (venue === 'home' ? 1 : -1) * model.homeCourtEffectPer100;
  const ownRate = model.baselineOffensiveRatingPer100 + court
    + sum(own, 'offensiveRapmPer100') - sum(opponent, 'defensiveRapmPer100');
  const opponentRate = model.baselineOffensiveRatingPer100 - court
    + sum(opponent, 'offensiveRapmPer100') - sum(own, 'defensiveRapmPer100');
  return { ownRate, opponentRate, netRate: ownRate - opponentRate, venue,
    players: { own, opponent }, unknownPlayers: [...own, ...opponent].filter(player => !player.effect).map(player => player.displayName),
    limitedHistoryPlayers: [...own, ...opponent].filter(player => player.limitedHistory).map(player => player.displayName),
    modelSha256: model.modelSha256, observedThroughLocalDate: model.observedThroughLocalDate,
    unit: 'points-per-100-matched-offensive-possessions' };
}
