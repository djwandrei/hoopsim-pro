import { availableParallelism } from 'node:os';
import { isDeepStrictEqual } from 'node:util';
import { Worker } from 'node:worker_threads';

/**
 * Return the usable worker count, bounded by the request, task count, and CPU
 * parallelism reported by the runtime. `value` must be a positive integer.
 */
export function workerLimit(value, taskCount) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new RangeError('maxWorkers must be a positive safe integer');
  }
  if (!Number.isSafeInteger(taskCount) || taskCount < 0) {
    throw new RangeError('taskCount must be a non-negative safe integer');
  }
  return Math.min(value, taskCount, availableParallelism());
}

/**
 * Run `{ id, payload }` tasks in persistent Node workers. Each worker receives
 * the same structured-cloneable `workerData` value and one task at a time.
 * Workers must reply with `{ type: 'result', id, value }` or
 * `{ type: 'error', id, error: { message, stack } }`.
 *
 * `onResult(value, task, index)` is called after each valid result. It may be
 * async; a rejected callback fails the batch. Returned values remain in input
 * order even when workers finish out of order. An optional AbortSignal cancels
 * the batch and terminates every worker before rejection.
 */
export async function runWorkerBatch({
  workerUrl,
  tasks,
  workerData = {},
  maxWorkers = 1,
  onResult,
  signal,
} = {}) {
  if (typeof workerUrl !== 'string' && !(workerUrl instanceof URL)) {
    throw new TypeError('workerUrl must be a string or URL');
  }
  if (!Array.isArray(tasks)) throw new TypeError('tasks must be an array');
  if (onResult !== undefined && typeof onResult !== 'function') {
    throw new TypeError('onResult must be a function when provided');
  }
  if (signal !== undefined && (
    !signal
    || typeof signal.aborted !== 'boolean'
    || typeof signal.addEventListener !== 'function'
    || typeof signal.removeEventListener !== 'function'
  )) {
    throw new TypeError('signal must be an AbortSignal when provided');
  }

  const seenIds = [];
  for (let index = 0; index < tasks.length; index += 1) {
    const task = tasks[index];
    if (!task || typeof task !== 'object' || Array.isArray(task)) {
      throw new TypeError(`tasks[${index}] must be a task record`);
    }
    if (!Object.hasOwn(task, 'id') || !Object.hasOwn(task, 'payload')) {
      throw new TypeError(`tasks[${index}] must have own id and payload properties`);
    }
    if (seenIds.some((id) => isDeepStrictEqual(id, task.id))) {
      throw new TypeError(`duplicate task id at tasks[${index}]`);
    }
    seenIds.push(task.id);
  }

  const workerCount = workerLimit(maxWorkers, tasks.length);
  if (tasks.length === 0) return [];

  const results = new Array(tasks.length);
  const slots = [];
  let nextTaskIndex = 0;
  let completedCount = 0;
  let stopping = false;
  let batchError = null;
  let resolveBatch;
  let rejectBatch;
  const batch = new Promise((resolve, reject) => {
    resolveBatch = resolve;
    rejectBatch = reject;
  });

  const abortBatch = () => {
    const error = new Error('Worker batch was aborted', { cause: signal.reason });
    error.name = 'AbortError';
    fail(error);
  };

  function fail(error) {
    if (batchError || stopping) return;
    batchError = error instanceof Error ? error : new Error(String(error));
    rejectBatch(batchError);
  }

  function assignTask(slot) {
    if (batchError || stopping || nextTaskIndex >= tasks.length) return;
    const index = nextTaskIndex;
    nextTaskIndex += 1;
    const task = tasks[index];
    slot.current = { index, task };
    try {
      slot.worker.postMessage({ type: 'task', id: task.id, payload: task.payload });
    } catch (error) {
      slot.current = null;
      fail(new Error(`Could not send task ${index} to worker ${slot.index}: ${error.message}`, { cause: error }));
    }
  }

  function validateMessage(slot, message) {
    if (!message || typeof message !== 'object' || Array.isArray(message)) {
      throw new Error(`Worker ${slot.index} sent a non-record message`);
    }
    if (!Object.hasOwn(message, 'type') || !Object.hasOwn(message, 'id')) {
      throw new Error(`Worker ${slot.index} sent a message without type or id`);
    }
    if (message.type === 'result') {
      if (!Object.hasOwn(message, 'value')) {
        throw new Error(`Worker ${slot.index} sent a result without value`);
      }
      return;
    }
    if (message.type === 'error') {
      const remoteError = message.error;
      if (
        !Object.hasOwn(message, 'error')
        || !remoteError
        || typeof remoteError !== 'object'
        || Array.isArray(remoteError)
        || !Object.hasOwn(remoteError, 'message')
        || typeof remoteError.message !== 'string'
        || (Object.hasOwn(remoteError, 'stack') && typeof remoteError.stack !== 'string')
      ) {
        throw new Error(`Worker ${slot.index} sent a malformed task error`);
      }
      return;
    }
    throw new Error(`Worker ${slot.index} sent unknown message type ${String(message.type)}`);
  }

  async function handleMessage(slot, message) {
    if (batchError || stopping) return;
    if (slot.handling) {
      fail(new Error(`Worker ${slot.index} sent overlapping messages`));
      return;
    }
    slot.handling = true;
    try {
      validateMessage(slot, message);
      const current = slot.current;
      if (!current) throw new Error(`Worker ${slot.index} sent a message with no assigned task`);
      if (!isDeepStrictEqual(message.id, current.task.id)) {
        throw new Error(`Worker ${slot.index} replied with an unexpected task id`);
      }
      if (message.type === 'error') {
        const error = new Error(message.error.message);
        error.name = 'WorkerTaskError';
        error.taskId = current.task.id;
        if (typeof message.error.stack === 'string') error.stack = message.error.stack;
        throw error;
      }

      results[current.index] = message.value;
      if (onResult) await onResult(message.value, current.task, current.index);
      if (batchError || stopping) return;

      slot.current = null;
      completedCount += 1;
      if (completedCount === tasks.length) {
        stopping = true;
        resolveBatch();
        return;
      }
      assignTask(slot);
    } catch (error) {
      fail(error);
    } finally {
      slot.handling = false;
    }
  }

  try {
    if (signal?.aborted) abortBatch();
    signal?.addEventListener('abort', abortBatch, { once: true });

    for (let index = 0; index < workerCount; index += 1) {
      if (batchError) break;
      const worker = new Worker(workerUrl, { workerData });
      const slot = { index, worker, current: null, handling: false };
      slots.push(slot);
      worker.on('message', (message) => { void handleMessage(slot, message); });
      worker.on('messageerror', (error) => {
        fail(new Error(`Worker ${index} sent a message that could not be deserialized`, { cause: error }));
      });
      worker.on('error', (error) => {
        fail(new Error(`Worker ${index} failed: ${error.message}`, { cause: error }));
      });
      worker.on('exit', (code) => {
        if (!stopping && !batchError) {
          const task = slot.current ? ` while processing task ${slot.current.index}` : '';
          fail(new Error(`Worker ${index} exited unexpectedly with code ${code}${task}`));
        }
      });
    }

    for (const slot of slots) assignTask(slot);
    await batch;
    return results;
  } catch (error) {
    batchError ??= error;
    throw error;
  } finally {
    stopping = true;
    signal?.removeEventListener('abort', abortBatch);
    const terminated = await Promise.allSettled(slots.map(({ worker }) => worker.terminate()));
    const terminationFailure = terminated.find((entry) => entry.status === 'rejected');
    if (terminationFailure && !batchError) {
      throw new Error('One or more workers could not be terminated', { cause: terminationFailure.reason });
    }
  }
}
