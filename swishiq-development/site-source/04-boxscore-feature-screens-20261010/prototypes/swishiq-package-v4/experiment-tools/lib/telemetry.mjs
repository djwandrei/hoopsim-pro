import { performance } from 'node:perf_hooks';

const MEMORY_FIELDS = Object.freeze([
  ['rssBytes', 'rss'],
  ['heapUsedBytes', 'heapUsed'],
  ['heapTotalBytes', 'heapTotal'],
  ['externalBytes', 'external'],
  ['arrayBuffersBytes', 'arrayBuffers'],
]);

function captureSnapshot() {
  const memory = process.memoryUsage();
  return {
    monotonicMs: performance.now(),
    at: new Date().toISOString(),
    cpu: process.cpuUsage(),
    memory: Object.fromEntries(MEMORY_FIELDS.map(([key, field]) => [key, memory[field] ?? null])),
    resourceUsage: { ...process.resourceUsage() },
  };
}

function cpuDelta(from) {
  const delta = process.cpuUsage(from);
  const totalMicros = delta.user + delta.system;
  return {
    userMicros: delta.user,
    systemMicros: delta.system,
    totalMicros,
    totalMs: totalMicros / 1000,
  };
}

function memoryDelta(before, after) {
  return Object.fromEntries(MEMORY_FIELDS.map(([key]) => [key, (
    before[key] === null || after[key] === null ? null : after[key] - before[key]
  )]));
}

export function createTelemetry() {
  let started = false;
  let finished = false;
  let pendingMeasures = 0;
  let startSnapshot = null;
  let finalSnapshot = null;
  let finalResult = null;
  const stages = [];

  function start() {
    if (finished) throw new Error('Telemetry is already finished.');
    if (started) return false;
    startSnapshot = captureSnapshot();
    started = true;
    return true;
  }

  function recordStage(name, before, status) {
    const after = captureSnapshot();
    const cpu = cpuDelta(before.cpu);
    stages.push({
      name,
      status,
      elapsedMs: after.monotonicMs - before.monotonicMs,
      cpu,
      memoryBefore: before.memory,
      memoryAfter: after.memory,
      memoryDelta: memoryDelta(before.memory, after.memory),
      resourceUsage: {
        maxRSSBefore: before.resourceUsage.maxRSS ?? null,
        maxRSSAfter: after.resourceUsage.maxRSS ?? null,
      },
    });
    pendingMeasures -= 1;
  }

  function measure(name, fn) {
    if (finished) throw new Error('Cannot measure work after telemetry is finished.');
    if (typeof name !== 'string' || name.trim() === '') {
      throw new TypeError('Telemetry measure name must be a nonempty string.');
    }
    if (typeof fn !== 'function') throw new TypeError('Telemetry measure requires a function.');
    if (!started) start();

    const before = captureSnapshot();
    pendingMeasures += 1;
    let result;
    try {
      result = fn();
    } catch (error) {
      recordStage(name, before, 'threw');
      throw error;
    }

    let then;
    try {
      then = result !== null && result !== undefined ? result.then : undefined;
    } catch (error) {
      recordStage(name, before, 'threw');
      throw error;
    }
    if (typeof then === 'function') {
      return Promise.resolve(result).then(value => {
        recordStage(name, before, 'fulfilled');
        return value;
      }, error => {
        recordStage(name, before, 'rejected');
        throw error;
      });
    }
    recordStage(name, before, 'fulfilled');
    return result;
  }

  function finish(extra = {}) {
    if (finalResult) return finalResult;
    if (!extra || typeof extra !== 'object' || Array.isArray(extra)) {
      throw new TypeError('Telemetry finish extra must be an object.');
    }
    if (!started) start();
    if (pendingMeasures !== 0) {
      throw new Error('Cannot finish telemetry while measured work is still pending.');
    }
    finalSnapshot = captureSnapshot();
    const cpu = cpuDelta(startSnapshot.cpu);
    finalResult = {
      format: 'swishiq-v4-experiment-telemetry-v1',
      startedAt: startSnapshot.at,
      finishedAt: finalSnapshot.at,
      elapsedMs: finalSnapshot.monotonicMs - startSnapshot.monotonicMs,
      cpu,
      memory: {
        start: startSnapshot.memory,
        finish: finalSnapshot.memory,
        delta: memoryDelta(startSnapshot.memory, finalSnapshot.memory),
      },
      resourceUsage: {
        ...finalSnapshot.resourceUsage,
        start: startSnapshot.resourceUsage,
        finish: finalSnapshot.resourceUsage,
      },
      stages: stages.slice(),
      extra: { ...extra },
      notes: [
        'RSS and heap are point-in-time snapshots; no background sampling is used.',
        'resourceUsage.maxRSS is Node process resource-usage high-water data, not a stage-only peak.',
        'Concurrent measured promises may overlap in their elapsed and CPU measurements.',
      ],
    };
    finished = true;
    return finalResult;
  }

  return { start, measure, finish };
}
