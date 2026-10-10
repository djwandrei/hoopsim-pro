import { createHash } from 'node:crypto';

/**
 * Deterministic circular date-cluster draws for exploratory candidate screens.
 *
 * Each season is resampled independently over its sorted observed game dates.
 * A draw contains the same number of date clusters as its source season, made
 * from circular blocks of `blockLengthDates`; every game on a date inherits
 * that date's integer count. The plan stores counts per replicate/date, not
 * expanded per-game weights, so it can be serialized as compact JSON and
 * reused across paired loss columns.
 *
 * This is explicitly SCREEN ONLY. It has no shared-team resampling or maxT
 * correction, is not formal validity inference, and does not replace the
 * canonical shared-team maxT inference.
 */
export const RESAMPLING_PLAN_VERSION = 'swishiq-screen-circular-date-block-v1';
export const RESAMPLING_PLAN_METHOD = 'same-season circular moving blocks over observed game-date clusters';
export const RESAMPLING_SCREEN_LIMITATION = 'SCREEN ONLY: exploratory date-cluster resampling; no shared-team resampling or maxT correction; not formal validity inference and not a replacement for canonical shared-team maxT inference.';

const IDENTITY_SCHEMA = 'swishiq-resampling-row-identity-v1';
const DEFAULT_SEED = 20261008;
const DEFAULT_REPETITIONS = 1000;
const DEFAULT_BLOCK_LENGTH_DATES = 7;

function fail(message) {
  throw new TypeError(message);
}

function isPlainRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validateGameRef(value, index) {
  if (typeof value === 'string' && value.trim().length > 0) return value;
  if (typeof value === 'number' && Number.isSafeInteger(value)) return value;
  fail(`rows[${index}].gameRef must be a non-empty string or safe integer`);
}

function validateDateKey(value, index) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    fail(`rows[${index}].gameDateLocal must be an exact YYYY-MM-DD date`);
  }
  const milliseconds = Date.parse(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString().slice(0, 10) !== value) {
    fail(`rows[${index}].gameDateLocal is not a valid calendar date`);
  }
  return value;
}

function validateSeasonStartYear(value, index) {
  if (!Number.isSafeInteger(value)) fail(`rows[${index}].seasonStartYear must be a safe integer`);
  return value;
}

function normalizeRows(rows) {
  if (!Array.isArray(rows) || rows.length === 0) fail('A non-empty rows array is required');

  const seenIds = new Set();
  const rowRecords = [];
  const seasonRows = new Map();

  rows.forEach((row, index) => {
    if (!isPlainRecord(row)) fail(`rows[${index}] must be an object`);
    const gameRef = validateGameRef(row.gameRef, index);
    const gameDateLocal = validateDateKey(row.gameDateLocal, index);
    const seasonStartYear = validateSeasonStartYear(row.seasonStartYear, index);
    const idKey = `${typeof gameRef}:${JSON.stringify(gameRef)}`;
    if (seenIds.has(idKey)) fail(`Duplicate gameRef at rows[${index}]`);
    seenIds.add(idKey);

    rowRecords.push([gameRef, gameDateLocal, seasonStartYear]);
    let season = seasonRows.get(seasonStartYear);
    if (!season) {
      season = { seasonStartYear, dateGames: new Map() };
      seasonRows.set(seasonStartYear, season);
    }
    season.dateGames.set(gameDateLocal, (season.dateGames.get(gameDateLocal) ?? 0) + 1);
  });

  const seasons = [...seasonRows.values()]
    .sort((left, right) => left.seasonStartYear - right.seasonStartYear)
    .map(season => {
      const dates = [...season.dateGames.keys()].sort();
      const dateIndices = new Map(dates.map((date, dateIndex) => [date, dateIndex]));
      return {
        seasonStartYear: season.seasonStartYear,
        dates,
        dateGames: dates.map(date => season.dateGames.get(date)),
        dateIndices,
        gameCount: dates.reduce((sum, date) => sum + season.dateGames.get(date), 0),
        dateCount: dates.length,
        dateOffset: 0,
      };
    });

  let dateOffset = 0;
  for (const season of seasons) {
    season.dateOffset = dateOffset;
    dateOffset += season.dateCount;
  }

  const seasonByYear = new Map(seasons.map(season => [season.seasonStartYear, season]));
  const rowDateIndices = rowRecords.map(([, gameDateLocal, seasonStartYear]) => {
    const season = seasonByYear.get(seasonStartYear);
    const dateIndex = season.dateIndices.get(gameDateLocal);
    return season.dateOffset + dateIndex;
  });

  const identityHash = createHash('sha256')
    .update(JSON.stringify([IDENTITY_SCHEMA, rowRecords]), 'utf8')
    .digest('hex');

  return { rowCount: rows.length, rowRecords, rowDateIndices, seasons, dateClusterCount: dateOffset, identityHash };
}

function positiveInteger(value, name) {
  if (!Number.isSafeInteger(value) || value < 1) fail(`${name} must be a positive safe integer`);
  return value;
}

function randomFor(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6D2B79F5;
    let t = value;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function drawCircularDateCounts(dateCount, blockLengthDates, random) {
  const counts = new Array(dateCount).fill(0);
  let sampledDates = 0;
  while (sampledDates < dateCount) {
    const start = Math.floor(random() * dateCount);
    const blockCount = Math.min(blockLengthDates, dateCount - sampledDates);
    for (let offset = 0; offset < blockCount; offset += 1) {
      counts[(start + offset) % dateCount] += 1;
    }
    sampledDates += blockCount;
  }
  return counts;
}

function sourceMetadata(normalized) {
  return {
    rowCount: normalized.rowCount,
    identityHash: normalized.identityHash,
    seasonCount: normalized.seasons.length,
    dateClusterCount: normalized.dateClusterCount,
    seasons: normalized.seasons.map(season => ({
      seasonStartYear: season.seasonStartYear,
      dates: [...season.dates],
      dateCount: season.dateCount,
      gameCount: season.gameCount,
      dateOffset: season.dateOffset,
    })),
  };
}

/**
 * Create a JSON-serializable, deterministic, same-season circular date-block
 * plan. `replicateDateCounts[r][i]` is the integer bootstrap count for the
 * date cluster at flat position `i`; positions follow `source.seasons` order
 * and each season's ascending `dates` list. Games that share a date retain
 * that cluster membership when the plan is applied.
 *
 * @param {Array<{gameRef: string|number, gameDateLocal: string, seasonStartYear: number}>} rows
 * @param {{seed?: number, repetitions?: number, blockLengthDates?: number}} options
 */
export function createResamplingPlan(rows, {
  seed = DEFAULT_SEED,
  repetitions = DEFAULT_REPETITIONS,
  blockLengthDates = DEFAULT_BLOCK_LENGTH_DATES,
} = {}) {
  const normalized = normalizeRows(rows);
  if (!Number.isSafeInteger(seed)) fail('seed must be a safe integer');
  positiveInteger(repetitions, 'repetitions');
  if (repetitions < 2) fail('At least two screening repetitions are required');
  positiveInteger(blockLengthDates, 'blockLengthDates');
  if (normalized.seasons.every(season => season.dateCount <= blockLengthDates)) fail('Date-block design is degenerate: reduce the block length or add observed dates');

  const random = randomFor(seed);
  const replicateDateCounts = new Array(repetitions);
  for (let replicate = 0; replicate < repetitions; replicate += 1) {
    const counts = new Array(normalized.dateClusterCount).fill(0);
    for (const season of normalized.seasons) {
      const seasonCounts = drawCircularDateCounts(season.dateCount, blockLengthDates, random);
      for (let dateIndex = 0; dateIndex < season.dateCount; dateIndex += 1) {
        counts[season.dateOffset + dateIndex] = seasonCounts[dateIndex];
      }
    }
    replicateDateCounts[replicate] = counts;
  }

  return {
    version: RESAMPLING_PLAN_VERSION,
    method: RESAMPLING_PLAN_METHOD,
    inferenceScope: 'SCREEN ONLY',
    limitation: RESAMPLING_SCREEN_LIMITATION,
    seed,
    randomGenerator: 'mulberry32-u32',
    repetitions,
    blockLengthDates,
    weightEncoding: 'replicateDateCounts[replicateIndex][flatDateClusterIndex]',
    source: sourceMetadata(normalized),
    identityHash: normalized.identityHash,
    replicateDateCounts,
  };
}

function sameArray(left, right) {
  return Array.isArray(left) && left.length === right.length
    && left.every((value, index) => value === right[index]);
}

function validatePlan(plan, normalized) {
  if (!isPlainRecord(plan) || plan.version !== RESAMPLING_PLAN_VERSION) {
    fail(`plan.version must be ${RESAMPLING_PLAN_VERSION}`);
  }
  if (plan.method !== RESAMPLING_PLAN_METHOD || plan.inferenceScope !== 'SCREEN ONLY'
      || plan.limitation !== RESAMPLING_SCREEN_LIMITATION) {
    fail('plan screening method metadata is missing or unsupported');
  }
  if (!Number.isSafeInteger(plan.seed)) fail('plan.seed must be a safe integer');
  const repetitions = positiveInteger(plan.repetitions, 'plan.repetitions');
  if (repetitions < 2) fail('At least two screening repetitions are required');
  positiveInteger(plan.blockLengthDates, 'plan.blockLengthDates');
  if (normalized.seasons.every(season => season.dateCount <= plan.blockLengthDates)) fail('Date-block design is degenerate');
  if (plan.randomGenerator !== 'mulberry32-u32') fail('plan.randomGenerator is unsupported');
  if (plan.identityHash !== normalized.identityHash || !isPlainRecord(plan.source)
      || plan.source.identityHash !== normalized.identityHash) {
    fail('The supplied rows do not match the plan identity hash');
  }

  const expectedSource = sourceMetadata(normalized);
  if (plan.source.rowCount !== expectedSource.rowCount
      || plan.source.seasonCount !== expectedSource.seasonCount
      || plan.source.dateClusterCount !== expectedSource.dateClusterCount
      || !Array.isArray(plan.source.seasons)
      || plan.source.seasons.length !== expectedSource.seasons.length) {
    fail('plan source dimensions do not match the supplied rows');
  }
  expectedSource.seasons.forEach((expected, index) => {
    const actual = plan.source.seasons[index];
    if (!isPlainRecord(actual)
        || actual.seasonStartYear !== expected.seasonStartYear
        || actual.dateCount !== expected.dateCount
        || actual.gameCount !== expected.gameCount
        || actual.dateOffset !== expected.dateOffset
        || !sameArray(actual.dates, expected.dates)) {
      fail(`plan source date-cluster layout does not match season ${expected.seasonStartYear}`);
    }
  });

  if (!Array.isArray(plan.replicateDateCounts) || plan.replicateDateCounts.length !== repetitions) {
    fail('plan replicate count dimensions are invalid');
  }
  plan.replicateDateCounts.forEach((counts, replicateIndex) => {
    if (!Array.isArray(counts) || counts.length !== normalized.dateClusterCount) {
      fail(`plan date-weight dimensions are invalid at replicate ${replicateIndex}`);
    }
    for (let i = 0; i < counts.length; i += 1) {
      if (!Number.isSafeInteger(counts[i]) || counts[i] < 0) {
        fail(`plan date weights must be non-negative safe integers at replicate ${replicateIndex}`);
      }
    }
    for (const season of normalized.seasons) {
      let sum = 0;
      for (let i = 0; i < season.dateCount; i += 1) sum += counts[season.dateOffset + i];
      if (sum !== season.dateCount) {
        fail(`plan date weights do not preserve the date-cluster count for season ${season.seasonStartYear}`);
      }
    }
  });
}

function lossColumnEntries(lossColumns) {
  const entries = lossColumns instanceof Map
    ? [...lossColumns.entries()]
    : isPlainRecord(lossColumns) ? Object.entries(lossColumns) : null;
  if (!entries || entries.length === 0) fail('lossColumns must be a non-empty object or Map');
  return entries;
}

function isFiniteNumberVector(value) {
  return Array.isArray(value)
    || (ArrayBuffer.isView(value) && !(value instanceof DataView));
}

function quantile(values, probability) {
  const ordered = Array.from(values).sort((left, right) => left - right);
  const position = (ordered.length - 1) * probability;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  return ordered[lower] + (position - lower) * (ordered[upper] - ordered[lower]);
}

/**
 * Apply one common date-cluster draw matrix to one or more row-aligned loss
 * columns. Each point estimate and replicate is the arithmetic mean over
 * games, so dates with multiple games contribute one value per game. Returned
 * intervals are two-sided 95% bootstrap percentile intervals for SCREEN ONLY.
 *
 * @param {ReturnType<typeof createResamplingPlan>} plan
 * @param {Array<{gameRef: string|number, gameDateLocal: string, seasonStartYear: number}>} rows
 * @param {Record<string, number[]|Float64Array>|Map<string, number[]|Float64Array>} lossColumns
 */
export function applyResamplingPlan(plan, rows, lossColumns) {
  const normalized = normalizeRows(rows);
  validatePlan(plan, normalized);
  const entries = lossColumnEntries(lossColumns);
  const columns = entries.map(([name, values]) => {
    if (typeof name !== 'string' || name.trim().length === 0) fail('loss column names must be non-empty strings');
    if (!isFiniteNumberVector(values) || values.length !== normalized.rowCount) {
      fail(`loss column ${JSON.stringify(name)} must have exactly ${normalized.rowCount} row-aligned values`);
    }
    for (let index = 0; index < values.length; index += 1) {
      if (!Number.isFinite(values[index])) fail(`loss column ${JSON.stringify(name)} has a non-finite value at row ${index}`);
    }
    return { name, values };
  });

  const dateGameCounts = new Float64Array(normalized.dateClusterCount);
  const dateLossSums = columns.map(() => new Float64Array(normalized.dateClusterCount));
  for (let rowIndex = 0; rowIndex < normalized.rowCount; rowIndex += 1) {
    const dateIndex = normalized.rowDateIndices[rowIndex];
    dateGameCounts[dateIndex] += 1;
    for (let columnIndex = 0; columnIndex < columns.length; columnIndex += 1) {
      dateLossSums[columnIndex][dateIndex] += columns[columnIndex].values[rowIndex];
    }
  }

  const pointEstimates = columns.map(column => {
    let total = 0;
    for (const value of column.values) total += value;
    const estimate = total / normalized.rowCount;
    if (!Number.isFinite(estimate)) fail(`point difference for ${JSON.stringify(column.name)} is not finite`);
    return estimate;
  });
  const bootstrapSamples = columns.map(() => new Array(plan.repetitions));

  for (let replicate = 0; replicate < plan.repetitions; replicate += 1) {
    const counts = plan.replicateDateCounts[replicate];
    let gameWeightTotal = 0;
    const weightedTotals = new Float64Array(columns.length);
    for (let dateIndex = 0; dateIndex < normalized.dateClusterCount; dateIndex += 1) {
      const dateWeight = counts[dateIndex];
      if (dateWeight === 0) continue;
      gameWeightTotal += dateWeight * dateGameCounts[dateIndex];
      for (let columnIndex = 0; columnIndex < columns.length; columnIndex += 1) {
        weightedTotals[columnIndex] += dateWeight * dateLossSums[columnIndex][dateIndex];
      }
    }
    if (!Number.isFinite(gameWeightTotal) || gameWeightTotal <= 0) {
      fail(`replicate ${replicate} has no finite positive game weight`);
    }
    for (let columnIndex = 0; columnIndex < columns.length; columnIndex += 1) {
      const value = weightedTotals[columnIndex] / gameWeightTotal;
      if (!Number.isFinite(value)) fail(`replicate ${replicate} for ${JSON.stringify(columns[columnIndex].name)} is not finite`);
      bootstrapSamples[columnIndex][replicate] = value;
    }
  }

  const outputColumns = columns.map((column, index) => ({
    name: column.name,
    estimate: pointEstimates[index],
    lower: quantile(bootstrapSamples[index], 0.025),
    upper: quantile(bootstrapSamples[index], 0.975),
    interval: '95% bootstrap percentile',
  }));

  return {
    version: RESAMPLING_PLAN_VERSION,
    method: RESAMPLING_PLAN_METHOD,
    inferenceScope: 'SCREEN ONLY',
    limitation: RESAMPLING_SCREEN_LIMITATION,
    identityHash: plan.identityHash,
    nGames: normalized.rowCount,
    nDateClusters: normalized.dateClusterCount,
    replicateCount: plan.repetitions,
    commonDrawsAcrossColumns: true,
    weighting: 'game-weighted arithmetic mean; all games in a date cluster share that date count',
    columns: Object.fromEntries(outputColumns.map(column => [column.name, column])),
  };
}
