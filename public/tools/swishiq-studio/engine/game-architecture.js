/*
 * Browser-safe orchestration contract for the game-like SwishIQ surfaces.
 *
 * This module does not run a model, load a package, or render a DOM node. It
 * gives the future shell one vocabulary for player verbs, input actions,
 * session transitions, and save/share snapshots while the existing engines
 * remain the source of truth for their current recipe and report contracts.
 */

import {
  normalizeModelPackageRef,
  publicModelPackageRef,
  stableHash,
} from './scenario-contract.js?v=20260920c&rev=swishiq-engine-v1';
import {
  CHALLENGE_STATUSES,
  resolveChallengeDefinition,
} from './challenge-definition-registry.js?v=20260920c&rev=swishiq-engine-v1';
import {
  SEEDED_POOL_LIMITS,
  spinSeededPool,
} from './seeded-pool.js?v=20260920c&rev=swishiq-engine-v1';
import {
  SWISHIQ_REPLAY_LIMITS,
  sanitizeReplayValue,
  stableReplayJson,
} from './replay-share-telemetry.js?v=20260920c&rev=swishiq-game-architecture-v1';

export const SWISHIQ_GAME_ARCHITECTURE_VERSION = 'swishiq-game-architecture-v1';
export const GAME_SESSION_FORMAT = 'djhc-swishiq-game-session-v1';
export const GAME_SESSION_VERSION = 1;

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freeze);
  return Object.freeze(value);
}

function fail(message) {
  throw new Error(message);
}

function text(value, label, maximum = 240) {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum) fail(`${label} is invalid.`);
  return value.trim();
}

function list(value) {
  return Object.freeze(Array.isArray(value) ? [...value] : []);
}

export const GAME_SURFACES = Object.freeze({
  PLAYER_BUILDER: 'player-builder',
  GAME_LAB: 'game-lab',
  SEASON_LAB: 'season-lab',
  CAREER_LAB: 'career-lab',
  FRANCHISE: 'franchise',
});

/**
 * Player-facing verbs are deliberately separate from engine function names.
 * The shell may present these as buttons, keyboard actions, or future canvas
 * affordances without making the model layer depend on either renderer.
 */
export const PLAYER_VERBS = freeze({
  [GAME_SURFACES.PLAYER_BUILDER]: list(['choose-season', 'choose-example', 'shape-profile', 'build-recipe', 'inspect-provenance', 'save-replay', 'share-replay']),
  [GAME_SURFACES.GAME_LAB]: list(['choose-matchup', 'set-controls', 'make-call', 'run-simulation', 'inspect-evidence', 'compare-run', 'replay-seed', 'save-replay', 'share-replay']),
  [GAME_SURFACES.SEASON_LAB]: list(['choose-season', 'configure-league', 'run-simulation', 'inspect-standings', 'compare-run', 'replay-seed', 'save-replay', 'share-replay']),
  [GAME_SURFACES.CAREER_LAB]: list(['choose-player', 'choose-cutoff', 'state-assumptions', 'run-simulation', 'inspect-history', 'compare-run', 'replay-seed', 'save-replay', 'share-replay']),
  [GAME_SURFACES.FRANCHISE]: list(['choose-season', 'set-roster', 'make-transaction', 'advance-calendar', 'run-simulation', 'inspect-history', 'save-state', 'share-replay']),
});

/**
 * Source lanes describe what a surface may consume and what it may produce.
 * A package scope is never widened by the game shell: the exact-season lane
 * stays exact and the pooled career lane stays explicitly pooled.
 */
export const SURFACE_SOURCE_CONTRACTS = freeze({
  [GAME_SURFACES.PLAYER_BUILDER]: {
    inputScopeKinds: ['exact-season'], inputKinds: ['observed-exact'],
    outputKinds: ['synthetic'], resultKind: 'synthetic-profile',
    sourceOwner: 'composite-forge-native.js', engineOwner: 'composite-forge.js',
    adapterOwner: 'advanced-labs.js',
  },
  [GAME_SURFACES.GAME_LAB]: {
    inputScopeKinds: ['exact-season'], inputKinds: ['observed-exact'],
    outputKinds: ['modeled'], resultKind: 'modeled-matchup',
    sourceOwner: 'season-lab.js', engineOwner: 'possession-simulator.js',
    adapterOwner: 'game-lab.js',
  },
  [GAME_SURFACES.SEASON_LAB]: {
    inputScopeKinds: ['exact-season'], inputKinds: ['observed-exact'],
    outputKinds: ['modeled'], resultKind: 'modeled-season',
    sourceOwner: 'season-lab.js', engineOwner: 'season-lab-model.js',
    adapterOwner: 'season-lab.js',
  },
  [GAME_SURFACES.CAREER_LAB]: {
    inputScopeKinds: ['pooled-window'], inputKinds: ['observed-pooled'],
    outputKinds: ['modeled'], resultKind: 'modeled-career',
    sourceOwner: 'career-simulation-model.js', engineOwner: 'career-simulation-model.js',
    adapterOwner: 'advanced-labs.js',
  },
  [GAME_SURFACES.FRANCHISE]: {
    inputScopeKinds: ['exact-season', 'pooled-window'], inputKinds: ['observed-exact', 'observed-pooled'],
    outputKinds: ['modeled'], resultKind: 'modeled-franchise',
    sourceOwner: 'season-lab.js', engineOwner: 'franchise-simulation.js',
    adapterOwner: 'season-lab.js',
  },
});

export const GAME_PHASES = Object.freeze([
  'boot', 'source-loading', 'ready', 'configuring', 'building',
  'running', 'paused', 'result', 'error',
]);

export const GAME_ACTIONS = Object.freeze({
  OPEN: 'open',
  SOURCE_READY: 'source-ready',
  SOURCE_UNAVAILABLE: 'source-unavailable',
  SELECT: 'select',
  CONFIGURE: 'configure',
  BUILD: 'build',
  BUILD_COMPLETE: 'build-complete',
  RUN: 'run',
  PROGRESS: 'progress',
  SIMULATION_COMPLETE: 'simulation-complete',
  CANCEL: 'cancel',
  PAUSE: 'pause',
  RESUME: 'resume',
  RESET: 'reset',
  RESTORE: 'restore',
  OPEN_MENU: 'open-menu',
  CLOSE_MENU: 'close-menu',
  SAVE: 'save',
  SAVE_SUCCESS: 'save-success',
  SAVE_FAILURE: 'save-failure',
  SHARE: 'share',
  SHARE_SUCCESS: 'share-success',
  SHARE_FAILURE: 'share-failure',
  START_CHALLENGE: 'start-challenge',
  SUBMIT_TURN: 'submit-turn',
  REPLAY_CHALLENGE: 'replay-challenge',
  ERROR: 'error',
});

export const GAME_CHALLENGE_RUN_STATUSES = Object.freeze([
  'active', 'suspended', 'complete', 'abandoned',
]);
export const GAME_CHALLENGE_LIMITS = Object.freeze({ maxTurns: 64, maxSuspends: 16 });

export const GAME_SAVE_STATES = Object.freeze([
  'unsaved', 'local-pending', 'local-saved', 'share-pending', 'shared', 'share-failed',
]);

export const GAME_MENU_STATES = Object.freeze(['closed', 'open']);

const SOURCE_KINDS = new Set(['observed-exact', 'observed-pooled', 'synthetic', 'modeled']);
const PHASE_SET = new Set(GAME_PHASES);
const ACTION_SET = new Set(Object.values(GAME_ACTIONS));
const SURFACE_SET = new Set(Object.values(GAME_SURFACES));
const SAVE_SET = new Set(GAME_SAVE_STATES);
const CHALLENGE_RUN_STATUS_SET = new Set(GAME_CHALLENGE_RUN_STATUSES);

/** Normalize a package-bound evidence lane for a session or result receipt. */
export function normalizeSimulationSource(sourceInput = {}) {
  const source = isObject(sourceInput) ? sourceInput : {};
  const rawPackageRef = source.packageRef || source;
  let packageRef;
  try {
    packageRef = normalizeModelPackageRef(rawPackageRef);
  } catch (error) {
    fail(error?.message || 'A valid package-bound simulation source is required.');
  }
  const scopeKind = packageRef.scope.kind;
  const kind = String(source.kind || (scopeKind === 'exact-season' ? 'observed-exact' : 'observed-pooled')).trim().toLowerCase();
  if (!SOURCE_KINDS.has(kind)) fail('Simulation source kind is unsupported.');
  if (kind === 'observed-exact' && scopeKind !== 'exact-season') fail('Observed exact evidence requires an exact-season package.');
  if (kind === 'observed-pooled' && scopeKind !== 'pooled-window') fail('Observed pooled evidence requires an explicitly accepted pooled package.');
  if (scopeKind === 'pooled-window' && packageRef.acceptedPooledPackage !== true) fail('A pooled simulation source requires explicit acceptance.');
  return freeze({
    kind,
    scopeKind,
    exactSeason: scopeKind === 'exact-season',
    pooledWindow: scopeKind === 'pooled-window',
    observed: kind === 'observed-exact' || kind === 'observed-pooled',
    modeled: kind === 'synthetic' || kind === 'modeled',
    evidence: source.evidence == null ? null : text(source.evidence, 'Simulation source evidence'),
    packageRef: publicModelPackageRef(packageRef),
  });
}

/** Check the input or output lane for a named surface without changing it. */
export function assertSurfaceSource(surface, sourceInput, { lane = 'input' } = {}) {
  if (!SURFACE_SET.has(surface)) fail('A supported SwishIQ game surface is required.');
  if (lane !== 'input' && lane !== 'output') fail('Simulation source lane must be input or output.');
  const source = normalizeSimulationSource(sourceInput);
  const contract = SURFACE_SOURCE_CONTRACTS[surface];
  const allowedScopes = lane === 'input' ? contract.inputScopeKinds : contract.inputScopeKinds;
  const allowedKinds = lane === 'input' ? contract.inputKinds : contract.outputKinds;
  if (!allowedScopes.includes(source.scopeKind)) {
    fail(`${surface} requires ${allowedScopes.join(' or ')} source evidence.`);
  }
  if (!allowedKinds.includes(source.kind)) {
    fail(`${surface} cannot use ${source.kind} evidence in its ${lane} lane.`);
  }
  return source;
}

function sourceForState(state, action) {
  if (action.source) return assertSurfaceSource(state.surface, action.source, { lane: 'input' });
  if (state.source) return state.source;
  return null;
}

function actionType(action) {
  if (!isObject(action) || !ACTION_SET.has(action.type)) fail('A supported game action is required.');
  return action.type;
}

function nextState(state, action, patch = {}) {
  return freeze({
    ...state,
    ...patch,
    revision: state.revision + 1,
    lastAction: action.type,
    error: null,
  });
}

function rejected(state, reason) {
  return { status: 'rejected', state, reason };
}

function accepted(state) {
  return { status: 'accepted', state };
}

function payloadObject(action, label) {
  if (action.payload === undefined) return {};
  if (!isObject(action.payload)) fail(`${label} payload must be an object.`);
  return action.payload;
}

function challengeEntryIdentity(entry) {
  for (const field of ['id', 'key', 'playerSeasonRef', 'playerRef', 'playerId']) {
    const value = entry?.[field];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isSafeInteger(value)) return String(value);
  }
  const name = entry?.player || entry?.playerName || entry?.displayName;
  const season = entry?.seasonStartYear ?? entry?.season;
  const team = entry?.team || entry?.teamCode;
  return name && season != null && team ? `${String(name).trim()}|${season}|${String(team).trim()}` : null;
}

function createChallengeRun(state, action) {
  const definitionId = text(action.challengeId, 'Challenge id', 64);
  const definition = resolveChallengeDefinition(action.registry || null, definitionId);
  if (!CHALLENGE_STATUSES.includes(definition.status) || definition.status !== 'active') {
    fail('Only an active challenge definition can start a run.');
  }
  if (!state.source) fail('A verified source package is required before a challenge can start.');
  if (definition.scope.kind !== state.source.scopeKind) fail('Challenge scope does not match the selected source package.');
  const sourcePhases = state.source.packageRef.scope.phases || [];
  if (!sourcePhases.includes(definition.scope.phase) && !sourcePhases.includes('all phases')) {
    fail('Challenge phase does not match the selected source package.');
  }
  const pool = action.pool;
  if (!isObject(pool) || pool.status !== 'ready' || !Array.isArray(pool.entries)) {
    fail('A ready seeded challenge pool is required.');
  }
  const poolPackageRef = publicModelPackageRef(normalizeModelPackageRef(pool.packageRef));
  if (stableReplayJson(poolPackageRef) !== stableReplayJson(state.source.packageRef)) {
    fail('Challenge pool package pins do not match the selected source.');
  }
  const maximum = Math.min(definition.selection.maximum, GAME_CHALLENGE_LIMITS.maxTurns);
  const requestedTurns = action.turnLimit === undefined ? maximum : Number(action.turnLimit);
  if (!Number.isSafeInteger(requestedTurns) || requestedTurns < definition.selection.minimum || requestedTurns > maximum) {
    const allowed = definition.selection.minimum === maximum
      ? `exactly ${maximum}` : `between ${definition.selection.minimum} and ${maximum}`;
    fail(`Challenge turn limit must be ${allowed}.`);
  }
  const spinIndex = action.spinIndex === undefined ? 0 : Number(action.spinIndex);
  if (!Number.isSafeInteger(spinIndex) || spinIndex < 0 || spinIndex > SEEDED_POOL_LIMITS.maxSpins) {
    fail('Challenge spin index is out of bounds.');
  }
  const spin = spinSeededPool(pool, { count: requestedTurns, withoutReplacement: true, spinIndex });
  if (spin.status !== 'ready') fail(spin.reason || 'The challenge pool could not be spun.');
  const selectionReceipts = spin.selected.map((entry, index) => {
    const identity = challengeEntryIdentity(entry);
    if (!identity) fail('Challenge pool entries need stable public identities.');
    return `selection-${stableHash({ challengeId: definition.id, poolHash: spin.poolHash, selectionHash: spin.selectionHash, index, identity })}`;
  });
  const runReceiptCore = {
    challengeId: definition.id,
    definitionHash: stableHash(definition),
    definitionStatus: definition.status,
    definitionSurface: definition.surface,
    resultKind: definition.resultKind,
    sourcePackage: state.source.packageRef,
    poolHash: spin.poolHash,
    seed: spin.seed,
    spinIndex: spin.spinIndex,
    turnLimit: requestedTurns,
    selectionHash: spin.selectionHash,
    selectionReceipts,
  };
  const runReceipt = freeze({ ...runReceiptCore, receiptHash: `run-${stableHash(runReceiptCore)}` });
  return freeze({
    status: 'active',
    challengeId: definition.id,
    definitionHash: stableHash(definition),
    definitionStatus: definition.status,
    definitionSurface: definition.surface,
    resultKind: definition.resultKind,
    turnLimit: requestedTurns,
    currentTurn: 0,
    seed: spin.seed,
    poolHash: spin.poolHash,
    spinIndex: spin.spinIndex,
    selectionHash: spin.selectionHash,
    selectionReceipts,
    turnReceipts: [],
    runReceipt,
    suspensionReceipt: null,
    resumeReceipts: [],
    completionReceipt: null,
    abandonmentReceipt: null,
    replayReceipt: null,
    replayCount: 0,
  });
}

function recordChallengeTurn(state, action) {
  const run = state.challengeRun;
  if (!run || run.status !== 'active' || state.phase !== 'running') return rejected(state, 'A challenge turn can only be submitted during an active run.');
  const turn = Number(action.turn);
  if (!Number.isSafeInteger(turn) || turn !== run.currentTurn + 1 || turn > run.turnLimit) {
    return rejected(state, 'Challenge turns must be submitted once, in order, within the run limit.');
  }
  const selectionReceipt = run.selectionReceipts[turn - 1];
  if (action.selectionReceipt !== selectionReceipt) return rejected(state, 'Challenge turn does not match the seeded selection receipt.');
  if (action.choice === undefined || action.choice === null) return rejected(state, 'A challenge turn choice is required.');
  const choice = sanitizeReplayValue(action.choice, { label: 'challenge turn choice' });
  if (typeof choice === 'string' && !choice.trim()) return rejected(state, 'A challenge turn choice is required.');
  if (stableReplayJson(choice) !== stableReplayJson(action.choice)) return rejected(state, 'Challenge turn choice contains unsupported or private fields.');
  const receiptCore = {
    runReceiptHash: run.runReceipt.receiptHash,
    turn,
    selectionReceipt,
    choiceHash: stableHash(choice),
    priorTurnReceiptHash: run.turnReceipts.at(-1)?.receiptHash || run.runReceipt.receiptHash,
  };
  const turnReceipt = freeze({ ...receiptCore, receiptHash: `turn-${stableHash(receiptCore)}` });
  const turnReceipts = [...run.turnReceipts, turnReceipt];
  const complete = turn === run.turnLimit;
  const completionCore = complete ? {
    runReceiptHash: run.runReceipt.receiptHash,
    turnReceiptHashes: turnReceipts.map(receipt => receipt.receiptHash),
  } : null;
  const challengeRun = freeze({
    ...run,
    status: complete ? 'complete' : 'active',
    currentTurn: turn,
    turnReceipts,
    suspensionReceipt: null,
    completionReceipt: completionCore ? freeze({ ...completionCore, receiptHash: `complete-${stableHash(completionCore)}` }) : null,
  });
  return accepted(nextState(state, action, {
    phase: complete ? 'result' : 'running',
    progress: complete ? 1 : turn / run.turnLimit,
    result: complete ? {
      kind: run.resultKind,
      status: 'complete',
      challengeId: run.challengeId,
      turnCount: turn,
      receiptHash: challengeRun.completionReceipt.receiptHash,
    } : null,
    challengeRun,
    save: { status: 'unsaved' },
  }));
}

function suspendChallengeRun(run) {
  const receiptCore = {
    runReceiptHash: run.runReceipt.receiptHash,
    currentTurn: run.currentTurn,
    turnReceiptHashes: run.turnReceipts.map(receipt => receipt.receiptHash),
  };
  return freeze({
    ...run,
    status: 'suspended',
    suspensionReceipt: freeze({ ...receiptCore, receiptHash: `suspend-${stableHash(receiptCore)}` }),
  });
}

function resumeChallengeRun(run, action) {
  if (action.receiptHash !== run.suspensionReceipt?.receiptHash) {
    return { error: 'The saved suspension receipt does not match this challenge state.' };
  }
  if (run.resumeReceipts.length >= GAME_CHALLENGE_LIMITS.maxSuspends) {
    return { error: 'Challenge resume receipt history reached its bound.' };
  }
  const receiptCore = {
    suspensionReceiptHash: run.suspensionReceipt.receiptHash,
    currentTurn: run.currentTurn,
    resumeNumber: run.resumeReceipts.length + 1,
  };
  return {
    run: freeze({
      ...run,
      status: 'active',
      suspensionReceipt: null,
      resumeReceipts: [...run.resumeReceipts, freeze({ ...receiptCore, receiptHash: `resume-${stableHash(receiptCore)}` })],
    }),
  };
}

function abandonChallengeRun(run) {
  const receiptCore = {
    runReceiptHash: run.runReceipt.receiptHash,
    currentTurn: run.currentTurn,
    turnReceiptHashes: run.turnReceipts.map(receipt => receipt.receiptHash),
  };
  return freeze({
    ...run,
    status: 'abandoned',
    suspensionReceipt: null,
    abandonmentReceipt: freeze({ ...receiptCore, receiptHash: `abandon-${stableHash(receiptCore)}` }),
  });
}

/**
 * Pure session reducer. Model engines are called by the adapter after a
 * `build` or `run` transition; they never receive DOM nodes or renderer refs.
 */
export function transitionGameState(stateInput, actionInput) {
  if (!isObject(stateInput) || !SURFACE_SET.has(stateInput.surface) || !PHASE_SET.has(stateInput.phase)) {
    fail('Game session state is malformed.');
  }
  const action = isObject(actionInput) ? actionInput : {};
  let type;
  try { type = actionType(action); } catch (error) { return rejected(stateInput, error.message); }
  const state = stateInput;
  const hasSource = Boolean(state.source);
  const draft = state.selection || state.config ? true : false;
  const resultState = (phase, patch = {}) => accepted(nextState(state, action, { phase, ...patch }));

  try {
    if (type === GAME_ACTIONS.OPEN) {
      if (!['boot', 'error', 'result', 'ready'].includes(state.phase)) return rejected(state, 'The surface cannot open while it is busy.');
      return resultState('source-loading', { source: null, result: null, progress: null, challengeRun: null, save: { status: 'unsaved' } });
    }
    if (type === GAME_ACTIONS.SOURCE_READY) {
      const source = sourceForState(state, action);
      if (!source) return rejected(state, 'A verified simulation source is required.');
      return resultState('ready', { source, progress: null, result: null, challengeRun: null, save: { status: 'unsaved' } });
    }
    if (type === GAME_ACTIONS.SOURCE_UNAVAILABLE || type === GAME_ACTIONS.ERROR) {
      return resultState('error', { error: action.reason || action.message || 'The surface is unavailable.', progress: null, challengeRun: null });
    }
    if (type === GAME_ACTIONS.SELECT || type === GAME_ACTIONS.CONFIGURE) {
      if (!['ready', 'configuring', 'result'].includes(state.phase)) return rejected(state, 'Selections can only change before or after a run.');
      if (state.challengeRun && ['active', 'suspended'].includes(state.challengeRun.status)) return rejected(state, 'An active challenge run must be resumed or cancelled before changing selections.');
      const payload = payloadObject(action, 'Configuration');
      return resultState('configuring', {
        selection: type === GAME_ACTIONS.SELECT ? { ...(state.selection || {}), ...payload } : state.selection,
        config: type === GAME_ACTIONS.CONFIGURE ? { ...(state.config || {}), ...payload } : state.config,
        result: null, progress: null, challengeRun: null, save: { status: 'unsaved' },
      });
    }
    if (type === GAME_ACTIONS.BUILD) {
      if (state.surface !== GAME_SURFACES.PLAYER_BUILDER) return rejected(state, 'Only Player Builder sessions can enter the build phase.');
      if (state.phase !== 'configuring' || !hasSource) return rejected(state, 'Player Builder needs a ready exact-season source and a configured selection.');
      return resultState('building', { progress: 0, result: null, save: { status: 'unsaved' } });
    }
    if (type === GAME_ACTIONS.BUILD_COMPLETE) {
      if (state.phase !== 'building') return rejected(state, 'A Player Builder result can only complete from the build phase.');
      return resultState('result', { result: action.result ?? action.payload ?? null, progress: 1, save: { status: 'unsaved' } });
    }
    if (type === GAME_ACTIONS.RUN) {
      if (!['ready', 'configuring', 'result'].includes(state.phase) || !hasSource) return rejected(state, 'A configured, source-bound session is required before simulation.');
      if (state.challengeRun) return rejected(state, 'Reset the challenge session before running a separate simulation.');
      return resultState('running', { progress: 0, result: null, save: { status: 'unsaved' } });
    }
    if (type === GAME_ACTIONS.START_CHALLENGE) {
      if (!['ready', 'configuring', 'result'].includes(state.phase) || !hasSource) return rejected(state, 'A source-bound ready session is required before a challenge can start.');
      if (state.challengeRun) return rejected(state, 'Reset the existing challenge run before starting another one.');
      const challengeRun = createChallengeRun(state, action);
      return resultState('running', { challengeRun, seed: challengeRun.seed, progress: 0, result: null, pausedFrom: null, save: { status: 'unsaved' } });
    }
    if (type === GAME_ACTIONS.SUBMIT_TURN) return recordChallengeTurn(state, action);
    if (type === GAME_ACTIONS.REPLAY_CHALLENGE) {
      const prior = state.challengeRun;
      if (!prior || prior.status !== 'complete' || state.phase !== 'result') return rejected(state, 'Only a completed challenge can be replayed.');
      if (prior.replayCount >= GAME_CHALLENGE_LIMITS.maxTurns) return rejected(state, 'Challenge replay history reached its bound.');
      const replay = createChallengeRun(state, {
        ...action,
        challengeId: prior.challengeId,
        turnLimit: prior.turnLimit,
        spinIndex: prior.spinIndex,
      });
      if (replay.seed !== prior.seed || replay.poolHash !== prior.poolHash || replay.selectionHash !== prior.selectionHash
        || replay.runReceipt.receiptHash !== prior.runReceipt.receiptHash) {
        return rejected(state, 'Replay pool or deterministic selection does not match the completed challenge.');
      }
      const replayCore = {
        priorCompletionReceiptHash: prior.completionReceipt?.receiptHash,
        runReceiptHash: replay.runReceipt.receiptHash,
        replayNumber: prior.replayCount + 1,
      };
      const challengeRun = freeze({
        ...replay,
        replayCount: prior.replayCount + 1,
        replayReceipt: freeze({ ...replayCore, receiptHash: `replay-${stableHash(replayCore)}` }),
      });
      return resultState('running', { challengeRun, seed: challengeRun.seed, progress: 0, result: null, pausedFrom: null, save: { status: 'unsaved' } });
    }
    if (type === GAME_ACTIONS.PROGRESS) {
      if (!['running', 'building'].includes(state.phase)) return rejected(state, 'Progress is only valid while the engine is active.');
      if (state.challengeRun?.status === 'active') return rejected(state, 'Challenge progress advances only when a seeded turn is submitted.');
      const progress = Number(action.progress);
      if (!Number.isFinite(progress) || progress < 0 || progress > 1) return rejected(state, 'Progress must be between zero and one.');
      return resultState(state.phase, { progress });
    }
    if (type === GAME_ACTIONS.SIMULATION_COMPLETE) {
      if (state.phase !== 'running') return rejected(state, 'A simulation result can only complete from the running phase.');
      if (state.challengeRun?.status === 'active') return rejected(state, 'An active challenge run must complete through its bounded turns.');
      return resultState('result', { result: action.result ?? action.payload ?? null, progress: 1, save: { status: 'unsaved' } });
    }
    if (type === GAME_ACTIONS.CANCEL) {
      if (!['building', 'running', 'paused'].includes(state.phase)) return rejected(state, 'There is no active run to cancel.');
      const challengeRun = state.challengeRun && ['active', 'suspended'].includes(state.challengeRun.status)
        ? abandonChallengeRun(state.challengeRun) : state.challengeRun;
      return resultState(hasSource && draft ? 'configuring' : 'ready', { progress: null, result: null, challengeRun, save: { status: 'unsaved' } });
    }
    if (type === GAME_ACTIONS.PAUSE) {
      if (state.phase !== 'running') return rejected(state, 'Only a running simulation can be paused.');
      if (state.challengeRun?.status === 'active' && state.challengeRun.resumeReceipts.length >= GAME_CHALLENGE_LIMITS.maxSuspends) {
        return rejected(state, 'Challenge resume receipt history reached its bound.');
      }
      const challengeRun = state.challengeRun?.status === 'active' ? suspendChallengeRun(state.challengeRun) : state.challengeRun;
      return resultState('paused', { pausedFrom: 'running', challengeRun });
    }
    if (type === GAME_ACTIONS.RESUME) {
      if (state.phase !== 'paused') return rejected(state, 'Only a paused simulation can resume.');
      if (state.challengeRun?.status === 'suspended') {
        const resumed = resumeChallengeRun(state.challengeRun, action);
        if (resumed.error) return rejected(state, resumed.error);
        return resultState(state.pausedFrom || 'running', { pausedFrom: null, challengeRun: resumed.run });
      }
      return resultState(state.pausedFrom || 'running', { pausedFrom: null });
    }
    if (type === GAME_ACTIONS.RESET) {
      return resultState(hasSource ? 'ready' : 'boot', { selection: null, config: {}, seed: null, progress: null, result: null, error: null, pausedFrom: null, challengeRun: null, save: { status: 'unsaved' } });
    }
    if (type === GAME_ACTIONS.RESTORE) {
      const snapshot = parseGameSessionSnapshot(action.snapshot, {
        surface: state.surface,
        packageRef: state.source?.packageRef || null,
        challengeRegistry: action.challengeRegistry || null,
      });
      const progress = snapshot.phase === 'result' ? 1
        : snapshot.phase === 'paused' && snapshot.challengeRun ? snapshot.challengeRun.currentTurn / snapshot.challengeRun.turnLimit : null;
      return resultState(snapshot.phase, {
        source: snapshot.source,
        selection: snapshot.selection || null,
        config: snapshot.config || {},
        seed: snapshot.seed || snapshot.challengeRun?.seed || null,
        challengeRun: snapshot.challengeRun || null,
        pausedFrom: snapshot.phase === 'paused' ? 'running' : null,
        result: snapshot.result || null,
        progress,
        save: { status: 'local-saved', replayId: snapshot.save?.replayId || null },
      });
    }
    if (type === GAME_ACTIONS.OPEN_MENU) return accepted(nextState(state, action, { menu: 'open' }));
    if (type === GAME_ACTIONS.CLOSE_MENU) return accepted(nextState(state, action, { menu: 'closed' }));
    if (type === GAME_ACTIONS.SAVE) {
      const suspendedChallenge = state.phase === 'paused' && state.challengeRun?.status === 'suspended';
      if (!['configuring', 'result'].includes(state.phase) && !suspendedChallenge) return rejected(state, 'Only a configured, completed, or suspended challenge session can be saved.');
      return accepted(nextState(state, action, { save: { status: 'local-pending' } }));
    }
    if (type === GAME_ACTIONS.SAVE_SUCCESS) {
      if (state.save?.status !== 'local-pending') return rejected(state, 'A local save is not pending.');
      return accepted(nextState(state, action, { save: { status: 'local-saved', replayId: action.replayId || null } }));
    }
    if (type === GAME_ACTIONS.SAVE_FAILURE) {
      if (state.save?.status !== 'local-pending') return rejected(state, 'A local save failure can only settle a pending save.');
      return accepted(nextState(state, action, { save: { status: 'unsaved', reason: action.reason || 'Local save failed.' } }));
    }
    if (type === GAME_ACTIONS.SHARE) {
      const suspendedChallenge = state.phase === 'paused' && state.challengeRun?.status === 'suspended';
      if (!['configuring', 'result'].includes(state.phase) && !suspendedChallenge) return rejected(state, 'Only a configured, completed, or suspended challenge session can be shared.');
      return accepted(nextState(state, action, { save: { status: 'share-pending' } }));
    }
    if (type === GAME_ACTIONS.SHARE_SUCCESS) {
      if (state.save?.status !== 'share-pending') return rejected(state, 'A share operation is not pending.');
      return accepted(nextState(state, action, { save: { status: 'shared', shareId: action.shareId || null } }));
    }
    if (type === GAME_ACTIONS.SHARE_FAILURE) {
      if (state.save?.status !== 'share-pending') return rejected(state, 'A share failure can only settle a pending share.');
      return accepted(nextState(state, action, { save: { status: 'share-failed', reason: action.reason || 'Share was rejected.' } }));
    }
    return rejected(state, `Unsupported game action: ${type}.`);
  } catch (error) {
    return rejected(state, error?.message || 'Game action was rejected.');
  }
}

export function createGameSessionState({ surface = GAME_SURFACES.PLAYER_BUILDER, source = null } = {}) {
  if (!SURFACE_SET.has(surface)) fail('A supported SwishIQ game surface is required.');
  const normalizedSource = source ? assertSurfaceSource(surface, source, { lane: 'input' }) : null;
  return freeze({
    architectureVersion: SWISHIQ_GAME_ARCHITECTURE_VERSION,
    surface,
    phase: normalizedSource ? 'ready' : 'boot',
    source: normalizedSource,
    selection: null,
    config: {},
    seed: null,
    challengeRun: null,
    progress: null,
    result: null,
    error: null,
    pausedFrom: null,
    menu: 'closed',
    save: { status: 'unsaved' },
    revision: 0,
    lastAction: null,
  });
}

/** Explicit keyboard/pointer/gamepad actions; menus remain DOM-owned. */
export const INPUT_ACTION_MAP = freeze({
  keyboard: {
    Enter: 'confirm', ' ': 'confirm', Space: 'confirm', Spacebar: 'confirm', Escape: 'cancel',
    ArrowLeft: 'previous', ArrowUp: 'previous', ArrowRight: 'next', ArrowDown: 'next',
    p: 'pause', r: 'replay', s: 'save', m: 'toggle-menu', h: 'toggle-help',
  },
  pointer: { primary: 'confirm', secondary: 'cancel' },
  gamepad: { 0: 'confirm', 1: 'cancel', 8: 'reset', 9: 'pause' },
});

export function mapInputToAction(input = {}) {
  if (!isObject(input)) return null;
  if (input.type === 'keydown') {
    const key = String(input.key || '');
    if (input.shiftKey && key.toLowerCase() === 's') return 'share';
    if (input.ctrlKey || input.altKey || input.metaKey) return null;
    return INPUT_ACTION_MAP.keyboard[key] || INPUT_ACTION_MAP.keyboard[key.toLowerCase()] || null;
  }
  if (input.type === 'pointer') return INPUT_ACTION_MAP.pointer[input.button === 2 ? 'secondary' : 'primary'] || null;
  if (input.type === 'gamepad') return INPUT_ACTION_MAP.gamepad[Number(input.button)] || null;
  return null;
}

/**
 * DOM/canvas boundary for the next shell. Existing panels remain DOM-rendered;
 * a future playfield may be canvas, but neither renderer may own simulation
 * state or package evidence.
 */
export const DOM_BOUNDARY = freeze({
  simulation: { owner: 'engine modules', reads: ['source', 'selection', 'config', 'seed'], writes: ['result', 'progress', 'saveable state'] },
  renderer: { owner: 'surface adapter', reads: ['immutable session snapshot'], writes: ['visual nodes only'] },
  hud: {
    owner: 'DOM',
    selectors: {
      status: '[data-swishiq-hud="status"]', progress: '[data-swishiq-hud="progress"]',
      source: '[data-swishiq-hud="source"]', seed: '[data-swishiq-hud="seed"]',
    },
    actions: ['cancel', 'pause', 'resume', 'reset', 'save', 'share'],
  },
  menu: {
    owner: 'DOM',
    selectors: {
      settings: '[data-swishiq-menu="settings"]', save: '[data-swishiq-menu="save"]',
      share: '[data-swishiq-menu="share"]', help: '[data-swishiq-menu="help"]',
    },
    actions: ['open-menu', 'close-menu', 'configure', 'save', 'share'],
  },
  existingRoots: ['#compositeLabPanel', '#gameLabPanel', '#seasonLabPanel', '#careerLabPanel'],
});

function snapshotCore(value) {
  const { snapshotHash, ...core } = value;
  if (core.challengeRun?.runReceipt) core.challengeRun = challengeRunForSnapshot(core.challengeRun);
  return core;
}

function remapProofRecord(value, keyMap) {
  if (value == null) return null;
  const output = {};
  Object.entries(value).forEach(([key, entry]) => { output[keyMap[key] || key] = entry; });
  return output;
}

function challengeRunForSnapshot(run) {
  if (!run) return null;
  const {
    selectionReceipts, turnReceipts, runReceipt, suspensionReceipt,
    resumeReceipts, completionReceipt, abandonmentReceipt, replayReceipt,
    ...core
  } = run;
  const proofNames = {
    receiptHash: 'proofHash',
    runReceiptHash: 'runProofHash',
    priorTurnReceiptHash: 'priorTurnProofHash',
    selectionReceipt: 'selectionProof',
    turnReceiptHashes: 'turnProofHashes',
    suspensionReceiptHash: 'suspensionProofHash',
    priorCompletionReceiptHash: 'priorCompletionProofHash',
    selectionReceipts: 'selectionProofs',
  };
  return {
    ...core,
    selectionProofs: selectionReceipts,
    turnProofs: turnReceipts.map(receipt => remapProofRecord(receipt, proofNames)),
    runProof: remapProofRecord(runReceipt, proofNames),
    suspensionProof: remapProofRecord(suspensionReceipt, proofNames),
    resumeProofs: resumeReceipts.map(receipt => remapProofRecord(receipt, proofNames)),
    completionProof: remapProofRecord(completionReceipt, proofNames),
    abandonmentProof: remapProofRecord(abandonmentReceipt, proofNames),
    replayProof: remapProofRecord(replayReceipt, proofNames),
  };
}

function challengeRunFromSnapshot(run) {
  if (run == null) return null;
  const {
    selectionProofs, turnProofs, runProof, suspensionProof,
    resumeProofs, completionProof, abandonmentProof, replayProof,
    ...core
  } = run;
  const proofNames = {
    proofHash: 'receiptHash',
    runProofHash: 'runReceiptHash',
    priorTurnProofHash: 'priorTurnReceiptHash',
    selectionProof: 'selectionReceipt',
    turnProofHashes: 'turnReceiptHashes',
    suspensionProofHash: 'suspensionReceiptHash',
    priorCompletionProofHash: 'priorCompletionReceiptHash',
    selectionProofs: 'selectionReceipts',
  };
  return {
    ...core,
    selectionReceipts: selectionProofs,
    turnReceipts: (turnProofs || []).map(receipt => remapProofRecord(receipt, proofNames)),
    runReceipt: remapProofRecord(runProof, proofNames),
    suspensionReceipt: remapProofRecord(suspensionProof, proofNames),
    resumeReceipts: (resumeProofs || []).map(receipt => remapProofRecord(receipt, proofNames)),
    completionReceipt: remapProofRecord(completionProof, proofNames),
    abandonmentReceipt: remapProofRecord(abandonmentProof, proofNames),
    replayReceipt: remapProofRecord(replayProof, proofNames),
  };
}

function receiptMatches(value, prefix) {
  if (!isObject(value) || typeof value.receiptHash !== 'string') return false;
  const { receiptHash, ...core } = value;
  return receiptHash === `${prefix}-${stableHash(core)}`;
}

function normalizeChallengeRunSnapshot(value, source, phase, challengeRegistry = null) {
  if (!isObject(value) || !CHALLENGE_RUN_STATUS_SET.has(value.status)) fail('Game challenge run status is unsupported.');
  const definition = resolveChallengeDefinition(challengeRegistry || null, value.challengeId);
  if (!CHALLENGE_STATUSES.includes(value.definitionStatus) || value.definitionStatus !== 'active'
    || definition.status !== value.definitionStatus || definition.surface !== value.definitionSurface
    || definition.resultKind !== value.resultKind || stableHash(definition) !== value.definitionHash) {
    fail('Game challenge run definition is no longer active or does not match its receipt.');
  }
  if (!source || definition.scope.kind !== source.scopeKind) fail('Game challenge run scope does not match its source.');
  if (!Array.isArray(source.packageRef.scope.phases)
    || (!source.packageRef.scope.phases.includes(definition.scope.phase) && !source.packageRef.scope.phases.includes('all phases'))) {
    fail('Game challenge run phase does not match its source package.');
  }
  const turnLimit = Number(value.turnLimit);
  const currentTurn = Number(value.currentTurn);
  if (!Number.isSafeInteger(turnLimit) || turnLimit < definition.selection.minimum
    || turnLimit > Math.min(definition.selection.maximum, GAME_CHALLENGE_LIMITS.maxTurns)
    || !Number.isSafeInteger(currentTurn) || currentTurn < 0 || currentTurn > turnLimit) {
    fail('Game challenge run turn bounds are invalid.');
  }
  if (value.status === 'complete' ? currentTurn !== turnLimit : currentTurn >= turnLimit) {
    fail('Game challenge run status does not match its turn count.');
  }
  if (!isObject(value.runReceipt) || !receiptMatches(value.runReceipt, 'run')
    || value.runReceipt.challengeId !== value.challengeId || value.runReceipt.definitionHash !== value.definitionHash
    || value.runReceipt.turnLimit !== turnLimit
    || value.runReceipt.seed !== value.seed || value.runReceipt.spinIndex !== value.spinIndex
    || value.runReceipt.poolHash !== value.poolHash || value.runReceipt.selectionHash !== value.selectionHash
    || stableReplayJson(value.runReceipt.sourcePackage) !== stableReplayJson(source.packageRef)
    || !Array.isArray(value.selectionReceipts) || value.selectionReceipts.length !== turnLimit
    || stableReplayJson(value.runReceipt.selectionReceipts) !== stableReplayJson(value.selectionReceipts)) {
    fail('Game challenge run receipt is invalid.');
  }
  if (!/^[A-Za-z0-9:._-]{1,80}$/.test(value.seed || '') || !/^[a-f0-9]{16}$/i.test(value.poolHash || '')
    || !/^[a-f0-9]{16}$/i.test(value.selectionHash || '')
    || !Number.isSafeInteger(value.spinIndex) || value.spinIndex < 0 || value.spinIndex > SEEDED_POOL_LIMITS.maxSpins
    || value.selectionReceipts.some(receipt => !/^selection-[a-f0-9]{16}$/i.test(receipt))) {
    fail('Game challenge run replay pins are invalid.');
  }
  if (!Array.isArray(value.turnReceipts) || value.turnReceipts.length !== currentTurn || value.turnReceipts.length > GAME_CHALLENGE_LIMITS.maxTurns) {
    fail('Game challenge turn receipts are invalid.');
  }
  let previousReceiptHash = value.runReceipt.receiptHash;
  value.turnReceipts.forEach((receipt, index) => {
    if (!receiptMatches(receipt, 'turn') || receipt.turn !== index + 1
      || receipt.runReceiptHash !== value.runReceipt.receiptHash
      || receipt.selectionReceipt !== value.selectionReceipts[index]
      || receipt.priorTurnReceiptHash !== previousReceiptHash
      || !/^[a-f0-9]{16}$/i.test(receipt.choiceHash || '')) fail('Game challenge turn receipt chain is invalid.');
    previousReceiptHash = receipt.receiptHash;
  });
  if ((value.status === 'complete') !== receiptMatches(value.completionReceipt, 'complete')) fail('Game challenge completion receipt is invalid.');
  if ((value.status === 'suspended') !== receiptMatches(value.suspensionReceipt, 'suspend')) fail('Game challenge suspension receipt is invalid.');
  if ((value.status === 'abandoned') !== receiptMatches(value.abandonmentReceipt, 'abandon')) fail('Game challenge abandonment receipt is invalid.');
  const turnReceiptHashes = value.turnReceipts.map(receipt => receipt.receiptHash);
  if (value.status === 'complete'
    && (value.completionReceipt.runReceiptHash !== value.runReceipt.receiptHash
      || stableReplayJson(value.completionReceipt.turnReceiptHashes) !== stableReplayJson(turnReceiptHashes))) {
    fail('Game challenge completion receipt does not cover every turn.');
  }
  if (value.status === 'suspended'
    && (value.suspensionReceipt.runReceiptHash !== value.runReceipt.receiptHash
      || value.suspensionReceipt.currentTurn !== currentTurn
      || stableReplayJson(value.suspensionReceipt.turnReceiptHashes) !== stableReplayJson(turnReceiptHashes))) {
    fail('Game challenge suspension receipt does not match the saved turn state.');
  }
  if (value.status === 'abandoned'
    && (value.abandonmentReceipt.runReceiptHash !== value.runReceipt.receiptHash
      || value.abandonmentReceipt.currentTurn !== currentTurn
      || stableReplayJson(value.abandonmentReceipt.turnReceiptHashes) !== stableReplayJson(turnReceiptHashes))) {
    fail('Game challenge abandonment receipt does not match the saved turn state.');
  }
  if (!Array.isArray(value.resumeReceipts) || value.resumeReceipts.length > GAME_CHALLENGE_LIMITS.maxSuspends
    || value.resumeReceipts.some((receipt, index) => !receiptMatches(receipt, 'resume') || receipt.resumeNumber !== index + 1)) {
    fail('Game challenge resume receipts are invalid.');
  }
  if (value.replayReceipt !== null && !receiptMatches(value.replayReceipt, 'replay')) fail('Game challenge replay receipt is invalid.');
  if (!Number.isSafeInteger(value.replayCount) || value.replayCount < 0 || value.replayCount > GAME_CHALLENGE_LIMITS.maxTurns
    || (value.replayCount > 0) !== Boolean(value.replayReceipt)) fail('Game challenge replay count is invalid.');
  if (value.replayReceipt && (value.replayReceipt.runReceiptHash !== value.runReceipt.receiptHash
    || value.replayReceipt.replayNumber !== value.replayCount)) fail('Game challenge replay receipt does not match the active replay.');
  const phaseMatches = (value.status === 'suspended' && phase === 'paused')
    || (value.status === 'complete' && phase === 'result')
    || (value.status === 'abandoned' && ['ready', 'configuring'].includes(phase));
  if (!phaseMatches) fail('Game challenge run phase does not match its status.');
  return freeze(value);
}

/** Build a bounded serializable state for local replay or a signed share. */
export function buildGameSessionSnapshot({
  surface,
  source,
  phase = 'result',
  selection = null,
  config = {},
  seed = null,
  result = null,
  challengeRun = null,
  challengeRegistry = null,
  save = { status: 'unsaved' },
} = {}) {
  if (!SURFACE_SET.has(surface)) fail('A supported SwishIQ game surface is required.');
  if (!['ready', 'configuring', 'result', 'paused'].includes(phase)) fail('Only a ready, configuring, completed, or suspended session can be saved.');
  const normalizedSource = assertSurfaceSource(surface, source, { lane: 'input' });
  const normalizedChallengeRun = challengeRun == null ? null : normalizeChallengeRunSnapshot(challengeRun, normalizedSource, phase, challengeRegistry);
  if (phase === 'paused' && normalizedChallengeRun?.status !== 'suspended') fail('Only a suspended challenge run can be saved while paused.');
  if (normalizedChallengeRun && phase === 'result' && normalizedChallengeRun.status !== 'complete') fail('Only a completed challenge result can be saved.');
  if (!isObject(save) || !SAVE_SET.has(save.status || 'unsaved')) fail('Game session save state is unsupported.');
  const raw = {
    format: GAME_SESSION_FORMAT,
    version: GAME_SESSION_VERSION,
    architectureVersion: SWISHIQ_GAME_ARCHITECTURE_VERSION,
    surface,
    phase,
    source: normalizedSource,
    selection: selection || null,
    config: config || {},
    seed: seed || null,
    result: result || null,
    ...(normalizedChallengeRun ? { challengeRun: challengeRunForSnapshot(normalizedChallengeRun) } : {}),
    save: { status: save.status || 'unsaved', replayId: save.replayId || null, shareId: save.shareId || null },
  };
  const cleaned = sanitizeReplayValue(raw, { label: 'game session snapshot' });
  if (stableReplayJson(cleaned).length > SWISHIQ_REPLAY_LIMITS.maxRecordBytes) fail('Game session snapshot exceeds the bounded replay size.');
  const snapshotHash = `replay-${stableHash(cleaned)}`;
  return freeze({ ...cleaned, snapshotHash });
}

/** Parse and verify a local/share snapshot before it reaches a surface. */
export function parseGameSessionSnapshot(value, { surface = null, packageRef = null, challengeRegistry = null } = {}) {
  let parsed = value;
  if (typeof value === 'string') {
    try { parsed = JSON.parse(value); } catch { fail('Game session snapshot is not valid JSON.'); }
  }
  if (!isObject(parsed) || parsed.format !== GAME_SESSION_FORMAT || parsed.version !== GAME_SESSION_VERSION
    || parsed.architectureVersion !== SWISHIQ_GAME_ARCHITECTURE_VERSION) fail('Game session snapshot format is unsupported.');
  const sanitizedCore = sanitizeReplayValue(snapshotCore(parsed), { label: 'game session snapshot' });
  const serializedCore = stableReplayJson(sanitizedCore);
  if (serializedCore.length > SWISHIQ_REPLAY_LIMITS.maxRecordBytes) fail('Game session snapshot exceeds the bounded replay size.');
  if (serializedCore !== stableReplayJson(snapshotCore(parsed))) {
    fail('Game session snapshot contains private or unsupported fields.');
  }
  parsed = { ...sanitizedCore, snapshotHash: parsed.snapshotHash };
  if (!SURFACE_SET.has(parsed.surface) || (surface && surface !== parsed.surface)) fail('Game session snapshot surface does not match.');
  if (!['ready', 'configuring', 'result', 'paused'].includes(parsed.phase)) fail('Game session snapshot phase is unsupported.');
  if (!isObject(parsed.save) || !SAVE_SET.has(parsed.save.status || 'unsaved')) fail('Game session snapshot save state is unsupported.');
  const expectedHash = `replay-${stableHash(snapshotCore(parsed))}`;
  if (parsed.snapshotHash !== expectedHash) fail('Game session snapshot integrity hash does not match.');
  const source = assertSurfaceSource(parsed.surface, parsed.source, { lane: 'input' });
  if (packageRef) {
    const expected = publicModelPackageRef(normalizeModelPackageRef(packageRef));
    if (stableReplayJson(expected) !== stableReplayJson(source.packageRef)) fail('Game session snapshot package pins do not match.');
  }
  const challengeRun = parsed.challengeRun == null ? null
    : normalizeChallengeRunSnapshot(challengeRunFromSnapshot(parsed.challengeRun), source, parsed.phase, challengeRegistry);
  if (parsed.phase === 'paused' && challengeRun?.status !== 'suspended') fail('Only a suspended challenge run can be restored while paused.');
  if (challengeRun && parsed.phase === 'result' && challengeRun.status !== 'complete') fail('A result snapshot needs a completed challenge run.');
  return freeze({ ...parsed, source, ...(challengeRun ? { challengeRun } : {}) });
}
