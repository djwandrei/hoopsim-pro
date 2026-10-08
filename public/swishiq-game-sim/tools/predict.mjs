import fs from 'node:fs';
import path from 'node:path';
import { hydrateRuntime, predictGame, observeDate, exportRuntime } from '../game-model/modules/game-lab-candidate100-pruned-total-model-blend090-v1.mjs';

const base = path.resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
if (!args[0] || args.includes('--help')) {
  console.log('Usage: node tools/predict.mjs <request.json> [checkpoint.json] [new-output.json]');
  console.log('Optional request.observeRows seals the complete predicted local-date batch; resulting checkpoint is returned.');
  process.exit(args.includes('--help') ? 0 : 1);
}
const read = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const artifact = read(args[1] ?? path.join(base, 'game-model/state/checkpoint-current.json'));
const request = read(args[0]);
const games = Array.isArray(request) ? request : request.games ?? [request];
if (!games.length || new Set(games.map(g => g.targetDate ?? g.gameDateLocal)).size !== 1) throw Error('Supply a nonempty single local-date prediction batch');
const runtime = await hydrateRuntime({ artifact });
const predictions = games.map(game => predictGame({ runtime,
  inputFeatures: game.inputFeatures ?? game.features,
  targetGameRef: game.targetGameRef ?? game.gameRef,
  targetDate: game.targetDate ?? game.gameDateLocal,
  featureObservedThrough: game.featureObservedThrough ?? game.observedThrough,
  seasonStartYear: game.seasonStartYear }));
const result = { format: 'standalone-candidate100-prediction-batch-v1', predictions };
if (request.observeRows) {
  result.feedback = observeDate({ runtime, date: games[0].targetDate ?? games[0].gameDateLocal,
    rows: request.observeRows, expectedGameRefs: games.map(g => g.targetGameRef ?? g.gameRef) });
  result.nextCheckpoint = exportRuntime({ runtime });
}
const output = JSON.stringify(result, null, 2) + '\n';
if (args[2]) fs.writeFileSync(args[2], output, { flag: 'wx' });
else process.stdout.write(output);
