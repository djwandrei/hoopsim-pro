/*
 * Public, non-identifying projection for signed result-share payloads.
 *
 * Callers must first verify the result and its public package reference, then
 * pass this function a purpose-built summary. Do not pass a Result Passport,
 * Scenario Envelope, replay, session, or evaluator response directly. This
 * module only projects fields; it does not sign, authenticate, or verify the
 * source package.
 */

export const PUBLIC_RESULT_SHARE_FORMAT = 'djhc-swishiq-public-result-share-v1';
export const PUBLIC_RESULT_SHARE_VERSION = 1;

export const PUBLIC_RESULT_SHARE_LIMITS = Object.freeze({
  maxInputBytes: 24_000,
  maxOutputBytes: 8_000,
  maxDepth: 6,
  maxArrayLength: 64,
  maxStringLength: 240,
  maxNodes: 2_048,
});

const TOOL_SCENARIOS = Object.freeze({
  'lineup-lab': Object.freeze(['lineup', 'rotation']),
  'fix-the-five': Object.freeze(['fix-the-five', 'fix-the-five-run']),
  'draft-night': Object.freeze(['draft-night']),
  'swishiq-studio': Object.freeze(['game', 'season', 'composite', 'career']),
  'nba-analytics-explorer': Object.freeze(['career', 'composite']),
  'exact-lineup-studies': Object.freeze(['lineup']),
  'pair-fit-lab': Object.freeze(['lineup']),
  'position-lens': Object.freeze(['composite']),
});

const RESULT_STATUSES = new Set(['complete', 'cancelled', 'invalid-input', 'infeasible', 'unavailable']);
const PHASES = new Set(['regular', 'in_season_tournament', 'play_in', 'playoffs']);
const NATIVE_UNITS = new Set([
  'assigned-minutes-estimate',
  'combined-player-profile',
  'points',
  'points-per-100-possessions',
  'per-game',
  'per-36-minutes',
  'fraction',
  'percent',
]);
const HASH_PATTERN = /^[a-f0-9]{64}$/i;
const ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,119}$/i;
const VERSION_PATTERN = /^[a-z0-9][a-z0-9._-]{0,119}$/i;
const REGISTRY_VERSION_PATTERN = /^[a-z0-9][a-z0-9._-]{0,79}$/i;
const BOARD_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/;
const SEED_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/;

const METRIC_LIMITS = Object.freeze({
  points: [0, 1_000_000],
  rebounds: [0, 100_000],
  assists: [0, 100_000],
  steals: [0, 100_000],
  blocks: [0, 100_000],
  turnovers: [0, 100_000],
  games: [0, 200],
  minutes: [0, 20_000],
  pointsPerGame: [0, 200],
  reboundsPerGame: [0, 100],
  assistsPerGame: [0, 100],
  stealsPerGame: [0, 30],
  blocksPerGame: [0, 30],
  turnoversPerGame: [0, 50],
  minutesPerGame: [0, 120],
  fieldGoalPercentage: [0, 2],
  threePointPercentage: [0, 2],
  freeThrowPercentage: [0, 2],
  trueShootingPercentage: [0, 2],
  effectiveFieldGoalPercentage: [0, 2],
  threePointAttemptShare: [0, 1],
  involvementPer36: [0, 100],
});

const METRIC_KEYS = Object.freeze(Object.keys(METRIC_LIMITS));
const GAME_POINTS_RULE_VERSION = 'swishiq-game-points-v2';
const PREVIOUS_GAME_POINTS_RULE_VERSION = 'swishiq-game-points-v1';
const FIX_THE_FIVE_RUN_FORMAT = 'swishiq-fix-the-five-run-v1';

function fail(message) {
  throw new TypeError(`Public result share: ${message}`);
}

function isRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function utf8Size(value) {
  return new TextEncoder().encode(value).byteLength;
}

function normalizeBoundedJson(value) {
  const seen = new WeakSet();
  let nodes = 0;

  function visit(current, depth, path) {
    nodes += 1;
    if (nodes > PUBLIC_RESULT_SHARE_LIMITS.maxNodes) fail('input contains too many values.');
    if (depth > PUBLIC_RESULT_SHARE_LIMITS.maxDepth) fail(`${path} exceeds the maximum nesting depth.`);
    if (current === null || typeof current === 'boolean') return current;
    if (typeof current === 'string') {
      if (current.length > PUBLIC_RESULT_SHARE_LIMITS.maxStringLength) fail(`${path} contains an overlong string.`);
      return current;
    }
    if (typeof current === 'number') {
      if (!Number.isFinite(current)) fail(`${path} must contain only finite numbers.`);
      return current;
    }
    if (!current || typeof current !== 'object') fail(`${path} is not JSON-safe.`);
    if (seen.has(current)) fail(`${path} contains a cycle.`);
    seen.add(current);

    if (Array.isArray(current)) {
      if (Object.getPrototypeOf(current) !== Array.prototype) fail(`${path} must be a plain array.`);
      if (current.length > PUBLIC_RESULT_SHARE_LIMITS.maxArrayLength) fail(`${path} exceeds the maximum array length.`);
      if (Reflect.ownKeys(current).some(key => typeof key === 'symbol')) fail(`${path} cannot contain symbol keys.`);
      const keys = Reflect.ownKeys(current).filter(key => key !== 'length');
      if (keys.length !== current.length || keys.some(key => !/^(0|[1-9]\d*)$/.test(key))) {
        fail(`${path} must be a dense JSON array.`);
      }
      const result = [];
      for (let index = 0; index < current.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(current, String(index));
        if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) {
          fail(`${path}[${index}] must be a plain data value.`);
        }
        result.push(visit(descriptor.value, depth + 1, `${path}[${index}]`));
      }
      seen.delete(current);
      return result;
    }

    if (!isRecord(current)) fail(`${path} must be a plain object.`);
    if (Reflect.ownKeys(current).some(key => typeof key === 'symbol')) fail(`${path} cannot contain symbol keys.`);
    const result = Object.create(null);
    for (const key of Reflect.ownKeys(current)) {
      if (typeof key !== 'string' || key.length > 120) fail(`${path} has an invalid property name.`);
      if (key === '__proto__' || key === 'prototype' || key === 'constructor') fail(`${path} has a prohibited property name.`);
      const descriptor = Object.getOwnPropertyDescriptor(current, key);
      if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) {
        fail(`${path}.${key} must be an enumerable data value.`);
      }
      Object.defineProperty(result, key, {
        value: visit(descriptor.value, depth + 1, `${path}.${key}`),
        enumerable: true,
        configurable: true,
        writable: true,
      });
    }
    seen.delete(current);
    return result;
  }

  const normalized = visit(value, 0, 'input');
  if (!isRecord(normalized)) fail('input must be a plain object.');
  const serialized = JSON.stringify(normalized);
  if (utf8Size(serialized) > PUBLIC_RESULT_SHARE_LIMITS.maxInputBytes) fail('input exceeds the maximum encoded size.');
  return normalized;
}

function requiredString(value, label, pattern, maxLength = 120) {
  if (typeof value !== 'string' || value.length < 1 || value.length > maxLength || !pattern.test(value)) {
    fail(`${label} is invalid.`);
  }
  return value;
}

function requiredHash(value, label) {
  return requiredString(value, label, HASH_PATTERN, 64);
}

function requiredInteger(value, label, minimum, maximum) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) fail(`${label} is invalid.`);
  return value;
}

function projectPackagePin(value) {
  if (!isRecord(value)) fail('packagePin must be an object.');
  if (!isRecord(value.scope)) fail('packagePin.scope must be an object.');
  const scope = value.scope;
  if (scope.kind !== 'exact-season') fail('only exact-season package scopes can be shared.');
  const seasonStartYear = requiredInteger(scope.seasonStartYear, 'scope.seasonStartYear', 1946, 2200);
  const seasonEndYear = requiredInteger(scope.seasonEndYear, 'scope.seasonEndYear', 1947, 2201);
  if (seasonEndYear !== seasonStartYear + 1) fail('scope years must describe one exact season.');
  if (!PHASES.has(scope.phase)) fail('scope.phase is unsupported.');

  const packagePin = {
    packageId: requiredString(value.packageId, 'packagePin.packageId', ID_PATTERN),
    packageVersion: requiredString(value.packageVersion, 'packagePin.packageVersion', VERSION_PATTERN),
    modelId: requiredString(value.modelId, 'packagePin.modelId', ID_PATTERN),
    metricsVersion: requiredString(value.metricsVersion, 'packagePin.metricsVersion', VERSION_PATTERN),
    packageManifestSha256: requiredHash(value.packageManifestSha256, 'packagePin.packageManifestSha256'),
    sourceLockSha256: requiredHash(value.sourceLockSha256, 'packagePin.sourceLockSha256'),
    registryVersion: requiredString(value.registryVersion, 'packagePin.registryVersion', REGISTRY_VERSION_PATTERN, 80),
    registryRevisionSha256: requiredHash(value.registryRevisionSha256, 'packagePin.registryRevisionSha256'),
    scope: { kind: 'exact-season', seasonStartYear, seasonEndYear, phase: scope.phase },
  };
  if (value.sourceManifestSetSha256 !== undefined) {
    packagePin.sourceManifestSetSha256 = requiredHash(value.sourceManifestSetSha256, 'packagePin.sourceManifestSetSha256');
  }
  if (value.projectionContentSha256 !== undefined) {
    packagePin.projectionContentSha256 = requiredHash(value.projectionContentSha256, 'packagePin.projectionContentSha256');
  }
  if (value.normalizer !== undefined) {
    packagePin.normalizer = requiredString(value.normalizer, 'packagePin.normalizer', ID_PATTERN);
  }
  return packagePin;
}

function projectNativeOutcome(value) {
  if (value === undefined || value === null) return undefined;
  if (!isRecord(value)) fail('result.nativeOutcome must be an object.');
  if (!NATIVE_UNITS.has(value.unit)) fail('result.nativeOutcome.unit is unsupported.');
  if (!isRecord(value.metrics)) fail('result.nativeOutcome.metrics must be an object.');
  const metrics = {};
  for (const key of METRIC_KEYS) {
    if (!Object.hasOwn(value.metrics, key)) continue;
    const metric = value.metrics[key];
    if (metric === null) {
      metrics[key] = null;
      continue;
    }
    const [minimum, maximum] = METRIC_LIMITS[key];
    if (typeof metric !== 'number' || !Number.isFinite(metric) || metric < minimum || metric > maximum) {
      fail(`result.nativeOutcome.metrics.${key} is out of range.`);
    }
    metrics[key] = metric;
  }
  if (Object.keys(metrics).length === 0) fail('result.nativeOutcome has no approved aggregate metrics.');
  return { unit: value.unit, metrics };
}

function projectDecision(value) {
  if (value === undefined || value === null) return undefined;
  if (!isRecord(value)) fail('result.decision must be an object.');
  const rank = requiredInteger(value.rank, 'result.decision.rank', 1, 1_000_000);
  const optionCount = requiredInteger(value.optionCount, 'result.decision.optionCount', 1, 1_000_000);
  if (rank > optionCount) fail('result.decision.rank cannot exceed optionCount.');
  if (value.countComplete !== true) fail('rank and count require a complete proof.');
  return { rank, optionCount, countComplete: true };
}

function projectGamePoints(value) {
  if (value === undefined || value === null) return undefined;
  if (!isRecord(value)) fail('result.gamePoints must be an object.');
  const ruleVersion = requiredString(value.ruleVersion, 'result.gamePoints.ruleVersion', /^[a-z0-9][a-z0-9._:-]{0,127}$/i, 128);
  if (![GAME_POINTS_RULE_VERSION, PREVIOUS_GAME_POINTS_RULE_VERSION].includes(ruleVersion)) fail('result.gamePoints.ruleVersion is unsupported.');
  const previous = ruleVersion === PREVIOUS_GAME_POINTS_RULE_VERSION;
  const validChoice = requiredInteger(value.validChoice, 'result.gamePoints.validChoice', 0, 1);
  const ruleCompletion = requiredInteger(value.ruleCompletion, 'result.gamePoints.ruleCompletion', 0, 1);
  const placement = requiredInteger(value.placement, 'result.gamePoints.placement', 0, previous ? 3 : 9);
  const total = requiredInteger(value.total, 'result.gamePoints.total', 0, previous ? 5 : 10);
  const max = requiredInteger(value.max, 'result.gamePoints.max', previous ? 4 : 10, previous ? 5 : 10);
  const expectedTotal = previous
    ? validChoice + ruleCompletion + placement
    : validChoice + placement;
  if ((previous && max === 4 && ruleCompletion !== 0)
    || (!validChoice && (ruleCompletion || placement))
    || total > max || total !== expectedTotal) {
    fail('result.gamePoints components are inconsistent.');
  }
  return { ruleVersion, validChoice, ruleCompletion, placement, total, max };
}

function exactKeys(value, expectedKeys, label) {
  if (!isRecord(value)) fail(`${label} must be an object.`);
  const actualKeys = Object.keys(value).sort();
  const sortedExpected = [...expectedKeys].sort();
  if (actualKeys.length !== sortedExpected.length
    || actualKeys.some((key, index) => key !== sortedExpected[index])) {
    fail(`${label} has unsupported fields.`);
  }
}

function projectFixTheFiveRun(value) {
  exactKeys(value, ['format', 'roundsCompleted', 'roundsTotal', 'gamePoints'], 'result.runSummary');
  if (value.format !== FIX_THE_FIVE_RUN_FORMAT) fail('result.runSummary.format is unsupported.');
  const roundsCompleted = requiredInteger(value.roundsCompleted, 'result.runSummary.roundsCompleted', 5, 5);
  const roundsTotal = requiredInteger(value.roundsTotal, 'result.runSummary.roundsTotal', 5, 5);
  exactKeys(value.gamePoints, ['ruleVersion', 'total', 'max'], 'result.runSummary.gamePoints');
  const ruleVersion = requiredString(value.gamePoints.ruleVersion, 'result.runSummary.gamePoints.ruleVersion', /^[a-z0-9][a-z0-9._:-]{0,127}$/i, 128);
  if (![GAME_POINTS_RULE_VERSION, PREVIOUS_GAME_POINTS_RULE_VERSION].includes(ruleVersion)) {
    fail('result.runSummary.gamePoints.ruleVersion is unsupported.');
  }
  const previous = ruleVersion === PREVIOUS_GAME_POINTS_RULE_VERSION;
  const total = requiredInteger(value.gamePoints.total, 'result.runSummary.gamePoints.total', 0, previous ? 25 : 50);
  const max = requiredInteger(value.gamePoints.max, 'result.runSummary.gamePoints.max', previous ? 20 : 50, previous ? 25 : 50);
  if (total > max) fail('result.runSummary.gamePoints.total cannot exceed max.');
  return {
    format: FIX_THE_FIVE_RUN_FORMAT,
    roundsCompleted,
    roundsTotal,
    gamePoints: { ruleVersion, total, max },
  };
}

function projectBoard(value) {
  if (value === undefined || value === null) return undefined;
  if (!isRecord(value)) fail('board must be an object.');
  const board = {};
  if (value.boardId !== undefined) board.boardId = requiredString(value.boardId, 'board.boardId', BOARD_ID_PATTERN, 120);
  if (value.seed !== undefined) board.seed = requiredString(value.seed, 'board.seed', SEED_PATTERN, 80);
  if (Object.keys(board).length === 0) fail('board must include a public boardId or seed.');
  return board;
}

function freezeDeep(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) freezeDeep(child);
  return Object.freeze(value);
}

/**
 * Project a verified, purpose-built summary into the public-result-share-v1
 * allowlist. Unknown and private fields are intentionally ignored. Input
 * must contain tool, scenarioKind, packagePin, and result fields; a raw
 * passport/session does not satisfy this contract.
 *
 * @param {object} input Verified summary with public package pins and aggregates.
 * @returns {Readonly<object>} Frozen, bounded, non-identifying share projection.
 */
export function projectPublicResultShareV1(input) {
  const safeInput = normalizeBoundedJson(input);
  const tool = requiredString(safeInput.tool, 'tool', ID_PATTERN, 120);
  const scenarioKind = requiredString(safeInput.scenarioKind, 'scenarioKind', ID_PATTERN, 80);
  const supportedScenarios = TOOL_SCENARIOS[tool];
  if (!supportedScenarios || !supportedScenarios.includes(scenarioKind)) {
    fail('tool and scenarioKind are not an approved pair.');
  }
  const packagePin = projectPackagePin(safeInput.packagePin);
  if (!isRecord(safeInput.result)) fail('result must be an object.');
  const status = safeInput.result.status;
  if (!RESULT_STATUSES.has(status)) fail('result.status is unsupported or not final.');

  const result = { status };
  if (scenarioKind === 'fix-the-five-run') {
    if (tool !== 'fix-the-five' || status !== 'complete') {
      fail('Fix the Five run shares require a complete Fix the Five result.');
    }
    if (Object.hasOwn(safeInput.result, 'nativeOutcome')
      || Object.hasOwn(safeInput.result, 'decision')
      || Object.hasOwn(safeInput.result, 'gamePoints')) {
      fail('Fix the Five run shares cannot include per-result values.');
    }
    result.runSummary = projectFixTheFiveRun(safeInput.result.runSummary);
  } else {
    if (Object.hasOwn(safeInput.result, 'runSummary')) fail('result.runSummary is only valid for Fix the Five runs.');
    const nativeOutcome = projectNativeOutcome(safeInput.result.nativeOutcome);
    const decision = projectDecision(safeInput.result.decision);
    const gamePoints = projectGamePoints(safeInput.result.gamePoints);
    if (nativeOutcome) result.nativeOutcome = nativeOutcome;
    if (decision) result.decision = decision;
    if (gamePoints) result.gamePoints = gamePoints;
  }

  const projected = {
    format: PUBLIC_RESULT_SHARE_FORMAT,
    version: PUBLIC_RESULT_SHARE_VERSION,
    tool,
    scenarioKind,
    packagePin,
    result,
  };
  if (scenarioKind === 'fix-the-five-run'
    && (!isRecord(safeInput.board) || safeInput.board.boardId === undefined)) {
    fail('Fix the Five run shares require a public board ID.');
  }
  const board = projectBoard(safeInput.board);
  if (board) projected.board = board;
  if (utf8Size(JSON.stringify(projected)) > PUBLIC_RESULT_SHARE_LIMITS.maxOutputBytes) {
    fail('projected share exceeds the maximum encoded size.');
  }
  return freezeDeep(projected);
}
