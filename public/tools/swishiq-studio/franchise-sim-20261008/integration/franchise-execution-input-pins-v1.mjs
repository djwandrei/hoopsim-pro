export const FRANCHISE_EXECUTION_INPUT_PINS_FORMAT = 'djhc-franchise-execution-input-pins-v1';
export const FRANCHISE_EXECUTION_INPUT_PINS_VERSION = '1.0.0';
export const FRANCHISE_EXECUTION_INPUT_PINS_ALGORITHM = 'SHA-256';
export const FRANCHISE_EXECUTION_INPUT_PINS_CANONICALIZATION = 'djhc-stable-json-v1';

const encoder = new TextEncoder();
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const plain = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));

function validatePlainJson(value, path = '$', ancestors = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') {
    assert(Number.isFinite(value), `Execution inputs contain a nonfinite number at ${path}.`);
    return;
  }
  assert(typeof value === 'object', `Execution inputs contain a non-JSON value at ${path}.`);
  assert(!ancestors.has(value), `Execution inputs contain a circular value at ${path}.`);
  const prototype = Object.getPrototypeOf(value);
  assert(Array.isArray(value) ? prototype === Array.prototype : prototype === Object.prototype || prototype === null,
    `Execution inputs contain a non-plain object at ${path}.`);
  ancestors.add(value);
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      assert(Object.hasOwn(value, index), `Execution inputs contain a sparse array at ${path}[${index}].`);
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      assert(descriptor?.enumerable && Object.hasOwn(descriptor, 'value'), `Execution inputs contain an accessor or hidden array value at ${path}[${index}].`);
      validatePlainJson(descriptor.value, `${path}[${index}]`, ancestors);
    }
    const keys = Reflect.ownKeys(value);
    assert(keys.length === value.length + 1 && keys.includes('length'), `Execution inputs contain array properties outside dense indices at ${path}.`);
  } else {
    const keys = Reflect.ownKeys(value);
    const enumerableKeys = Object.keys(value);
    assert(keys.length === enumerableKeys.length, `Execution inputs contain symbol or hidden properties at ${path}.`);
    for (const key of enumerableKeys) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      assert(descriptor?.enumerable && Object.hasOwn(descriptor, 'value'), `Execution inputs contain an accessor at ${path}.${key}.`);
      validatePlainJson(descriptor.value, `${path}.${key}`, ancestors);
    }
  }
  ancestors.delete(value);
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (plain(value)) return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

async function sha256StableJson(value) {
  const cryptoProvider = globalThis.crypto;
  assert(typeof cryptoProvider?.subtle?.digest === 'function', 'Execution input pins require Web Crypto SHA-256.');
  const digest = await cryptoProvider.subtle.digest('SHA-256', encoder.encode(stableJson(value)));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function scheduleValue(row, primary, alternate) {
  const first = row[primary], second = alternate ? row[alternate] : undefined;
  if (first !== undefined && second !== undefined) assert(first === second, `Schedule fields ${primary} and ${alternate} disagree.`);
  return first === undefined ? second : first;
}

function normalizeSchedule(schedule) {
  assert(Array.isArray(schedule) && schedule.length > 0, 'Execution input pins require a nonempty schedule.');
  const seen = new Set();
  return schedule.map((row, index) => {
    assert(plain(row), `Schedule row ${index} must be a plain record.`);
    const gameId = row.gameId;
    assert(typeof gameId === 'string' && gameId.trim(), `Schedule row ${index} requires a nonempty game ID.`);
    assert(!seen.has(gameId), `Schedule game ID ${gameId} is duplicated.`);
    seen.add(gameId);
    const date = scheduleValue(row, 'gameLocalDate', 'date');
    assert(typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)
      && Number.isFinite(Date.parse(`${date}T00:00:00Z`))
      && new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date,
    `Schedule game ${gameId} requires a valid local date.`);
    const year = scheduleValue(row, 'seasonStartYear', 'year');
    assert(Number.isInteger(year), `Schedule game ${gameId} requires an integer season year.`);
    const rawHome = scheduleValue(row, 'homeTeamCode', 'home');
    const rawAway = scheduleValue(row, 'awayTeamCode', 'away');
    const home = String(rawHome ?? '').trim().toUpperCase();
    const away = String(rawAway ?? '').trim().toUpperCase();
    assert(home && away && home !== away, `Schedule game ${gameId} requires distinct home and away teams.`);
    return { gameId, gameLocalDate: date, seasonStartYear: year, homeTeamCode: home,
      awayTeamCode: away, sourceRef: typeof row.sourceRef === 'string' ? row.sourceRef : null };
  }).sort((a, b) => a.gameLocalDate.localeCompare(b.gameLocalDate) || a.gameId.localeCompare(b.gameId));
}

function ruleMetadata(cbaProfile) {
  if (cbaProfile === null) return null;
  assert(plain(cbaProfile) && cbaProfile.format === 'djhc-cba-rule-profile-v1',
    'An executable CBA profile must use the djhc-cba-rule-profile-v1 format.');
  return {
    format: cbaProfile.format,
    schemaVersion: cbaProfile.schemaVersion ?? null,
    seasonStartYear: Number.isInteger(cbaProfile.seasonStartYear) ? cbaProfile.seasonStartYear : null,
    ruleVersionId: cbaProfile.ruleVersionId ?? null,
    sourceRefs: cbaProfile.sourceRefs ?? null,
  };
}

/**
 * Pin every value that can affect an initialized Franchise run beyond the game
 * and player-production artifacts. The schedule projection mirrors the worker
 * session's executed whitelist and canonical date/game-ID order. Game inputs
 * are hashed whole, with sorted object keys and array order preserved.
 */
export async function createFranchiseExecutionInputPinsV1({ cbaProfile = null, schedule, gameInputs } = {}) {
  validatePlainJson(cbaProfile, '$.cbaProfile');
  validatePlainJson(schedule, '$.schedule');
  validatePlainJson(gameInputs, '$.gameInputs');
  assert(plain(gameInputs), 'Execution input pins require a plain gameInputs object.');
  const normalizedSchedule = normalizeSchedule(schedule);
  for (const game of normalizedSchedule) {
    assert(Object.hasOwn(gameInputs, game.gameId), `Missing prepared game input for ${game.gameId}.`);
  }
  const metadata = ruleMetadata(cbaProfile);
  const [rulesSha256, scheduleSha256, gameInputsSha256] = await Promise.all([
    cbaProfile === null ? null : sha256StableJson(cbaProfile),
    sha256StableJson(normalizedSchedule),
    sha256StableJson(gameInputs),
  ]);
  return {
    format: FRANCHISE_EXECUTION_INPUT_PINS_FORMAT,
    version: FRANCHISE_EXECUTION_INPUT_PINS_VERSION,
    algorithm: FRANCHISE_EXECUTION_INPUT_PINS_ALGORITHM,
    canonicalization: FRANCHISE_EXECUTION_INPUT_PINS_CANONICALIZATION,
    cbaRules: { sha256: rulesSha256, profileMetadata: metadata },
    schedule: {
      sha256: scheduleSha256,
      gameCount: normalizedSchedule.length,
      fields: ['gameId', 'gameLocalDate', 'seasonStartYear', 'homeTeamCode', 'awayTeamCode', 'sourceRef'],
      order: 'date-then-gameId',
    },
    gameInputs: {
      sha256: gameInputsSha256,
      entryCount: Object.keys(gameInputs).length,
      semantics: 'all-object-fields-and-values; sorted-object-keys; preserved-array-order',
    },
  };
}
