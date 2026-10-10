import { createFranchiseOffseasonDraftPhaseExecutorV1 } from './franchise-offseason-draft-phase-executor-v1.mjs';
import { createFranchiseOffseasonPhaseExecutorsV1 } from './franchise-offseason-phase-executors-v1.mjs';

export const FRANCHISE_OFFSEASON_SUPPORTED_PHASES_V1 = Object.freeze([
  'free-agency',
  'trade-window',
  'draft',
]);

/** Compose only the transaction windows with implemented headless executors. */
export function createFranchiseOffseasonPhaseExecutorMapV1({ ruleEngine = null } = {}) {
  const transactionExecutors = createFranchiseOffseasonPhaseExecutorsV1({ ruleEngine });
  return Object.freeze({
    'free-agency': transactionExecutors['free-agency'],
    'trade-window': transactionExecutors['trade-window'],
    draft: createFranchiseOffseasonDraftPhaseExecutorV1({ ruleEngine }),
  });
}

/** Require an explicit supported phase; never fall back to another executor. */
export function selectFranchiseOffseasonPhaseExecutorV1(executorMap, phase) {
  if (typeof phase !== 'string' || phase.length === 0) {
    throw new TypeError('An explicit supported offseason phase is required.');
  }
  if (!FRANCHISE_OFFSEASON_SUPPORTED_PHASES_V1.includes(phase)) {
    throw new RangeError(`Unsupported offseason phase: ${phase}`);
  }
  if (!executorMap || typeof executorMap !== 'object' || Array.isArray(executorMap) ||
      !Object.prototype.hasOwnProperty.call(executorMap, phase) || typeof executorMap[phase] !== 'function') {
    throw new TypeError(`No executor is registered for supported offseason phase: ${phase}`);
  }
  return executorMap[phase];
}
