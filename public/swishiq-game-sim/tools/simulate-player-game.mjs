import fs from 'node:fs';
import path from 'node:path';
import { simulateGame } from '../simulation/lib/game-simulator-v2.mjs';
import { simulateCoherentGame } from '../simulation/lib/coherent-game-simulator-v1.mjs';
import { simulateGameLive } from '../simulation/lib/live-game-simulator-v1.mjs';

const args = process.argv.slice(2);
if (!args[0] || args.includes('--help')) {
  console.log('Usage: node tools/simulate-player-game.mjs <scenario.json> [base|coherent|live] [new-output.json]');
  console.log('scenario = { input, options?, modelFile?, playerProductionModelFile? }; seed/sampleCount are options.');
  process.exit(args.includes('--help') ? 0 : 1);
}
const base = path.resolve(import.meta.dirname, '..');
const read = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const request = read(args[0]);
if (!request.input) throw Error('scenario.input is required');
const model = read(request.modelFile ?? path.join(base, 'simulation/models/game-sim-v4-parametric-age-fatigue-guard-candidate-20261006.json'));
const options = { ...request.options };
if (request.playerProductionModelFile) options.playerProductionCandidate = read(request.playerProductionModelFile);
const mode = args[1] ?? 'base';
const simulator = { base: simulateGame, coherent: simulateCoherentGame, live: simulateGameLive }[mode];
if (!simulator) throw Error('Unknown simulation mode');
const result = simulator(model, request.input, options);
const output = JSON.stringify(result, null, 2) + '\n';
if (args[2]) fs.writeFileSync(args[2], output, { flag: 'wx' });
else process.stdout.write(output);
