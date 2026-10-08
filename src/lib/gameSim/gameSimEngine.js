// SwishIQ game-lab engine bridge: the vendored exact site copy drives both
// Candidate100 pregame predictions and the player-game Monte Carlo /
// coherent / live simulators. Inputs follow each module's own contract; the
// studio never substitutes its own model for these engines.
import { gameSimJson, gameSimModule } from './gameSimSource';

export const GAME_MODEL_VERSION = 'swishiq-v4-game-lab-candidate100-pruned-total-model-blend090-v1';
export const GAME_MODEL_MODULE = 'game-model/modules/game-lab-candidate100-pruned-total-model-blend090-v1.mjs';
export const GAME_MODEL_CHECKPOINTS = [
  'checkpoint-current', 'checkpoint-2021', 'checkpoint-2022', 'checkpoint-2023', 'checkpoint-2024', 'checkpoint-2025',
];
export const PLAYER_SIM_MODEL = 'simulation/models/game-sim-v4-parametric-age-fatigue-guard-candidate-20261006.json';
export const SHARED_PRODUCTION_MODEL = 'simulation/models/shared-player-production-v1-candidate-20261007b.json';

let modelModulePromise = null;
function gameModelModule() {
  if (!modelModulePromise) {
    modelModulePromise = gameSimModule(GAME_MODEL_MODULE);
    modelModulePromise.catch(() => { modelModulePromise = null; });
  }
  return modelModulePromise;
}

// One hydrated runtime per checkpoint per session (fitting state is heavy).
const runtimes = new Map();
export function hydrateGameModelRuntime(checkpointName = 'checkpoint-current') {
  if (!GAME_MODEL_CHECKPOINTS.includes(checkpointName)) throw new Error('Unknown SwishIQ game-model checkpoint.');
  if (!runtimes.has(checkpointName)) {
    const task = (async () => {
      const [module, artifact] = await Promise.all([
        gameModelModule(),
        gameSimJson(`game-model/state/${checkpointName}.json`).then(result => result.data),
      ]);
      return { runtime: module.hydrateRuntime({ artifact }), module };
    })();
    runtimes.set(checkpointName, task);
    task.catch(() => runtimes.delete(checkpointName));
  }
  return runtimes.get(checkpointName);
}

// Prediction batch for one local date — the same contract the site's
// standalone predict runner enforces (nonempty, single targetDate).
export async function predictGameLabGames(request, { checkpointName = 'checkpoint-current' } = {}) {
  const games = Array.isArray(request) ? request : request.games ?? [request];
  if (!games.length || new Set(games.map(game => game.targetDate ?? game.gameDateLocal)).size !== 1) {
    throw new Error('Supply a nonempty single local-date prediction batch.');
  }
  const { runtime, module } = await hydrateGameModelRuntime(checkpointName);
  const predictions = games.map(game => module.predictGame({
    runtime,
    inputFeatures: game.inputFeatures ?? game.features,
    targetGameRef: game.targetGameRef ?? game.gameRef,
    targetDate: game.targetDate ?? game.gameDateLocal,
    featureObservedThrough: game.featureObservedThrough ?? game.observedThrough,
    seasonStartYear: game.seasonStartYear,
  }));
  const result = { format: 'standalone-candidate100-prediction-batch-v1', predictions };
  if (request.observeRows) {
    result.feedback = module.observeDate({
      runtime, date: games[0].targetDate ?? games[0].gameDateLocal,
      rows: request.observeRows, expectedGameRefs: games.map(game => game.targetGameRef ?? game.gameRef),
    });
    result.nextCheckpoint = module.exportRuntime({ runtime });
  }
  return result;
}

const SIMULATORS = {
  base: ['simulation/lib/game-simulator-v2.mjs', 'simulateGame'],
  coherent: ['simulation/lib/coherent-game-simulator-v1.mjs', 'simulateCoherentGame'],
  live: ['simulation/lib/live-game-simulator-v1.mjs', 'simulateGameLive'],
};

let simulatorsPromise = null;
function simulators() {
  if (!simulatorsPromise) {
    simulatorsPromise = Promise.all(SIMULATORS.map(async ([path, name]) => {
      const module = await gameSimModule(path);
      return module[name];
    })).then(list => ({ base: list[0], coherent: list[1], live: list[2] }));
    simulatorsPromise.catch(() => { simulatorsPromise = null; });
  }
  return simulatorsPromise;
}

// Player-game simulation in the site's three modes. `request` is
// { input, options?, mode?, sharedProduction? } — identical to the standalone
// simulate-player-game runner, with the model artifacts resolved locally.
export async function runPlayerGameSimulation(request) {
  if (!request?.input) throw new Error('The simulation scenario input is required.');
  const mode = request.mode ?? 'base';
  const simulator = (await simulators())[mode];
  if (!simulator) throw new Error('Unknown simulation mode.');
  const model = (await gameSimJson(PLAYER_SIM_MODEL)).data;
  const options = { ...request.options };
  if (request.sharedProduction) {
    options.playerProductionCandidate = (await gameSimJson(SHARED_PRODUCTION_MODEL)).data;
  }
  return simulator(model, request.input, options);
}