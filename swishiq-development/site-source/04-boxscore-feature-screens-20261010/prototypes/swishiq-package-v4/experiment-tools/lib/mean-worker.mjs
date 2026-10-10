import { parentPort, workerData } from 'node:worker_threads';
import { fitMeanCache } from './mean-batch.mjs';
import { readSharedDesign } from './shared-input.mjs';
import { createTelemetry } from './telemetry.mjs';

if (!parentPort) throw Error('Mean worker must run in a managed worker thread');
const sharedDesigns = new Map(workerData.designs.map(design => [design.key, design])), designs = new Map();
parentPort.on('message', message => {
  if (message?.type !== 'task') return;
  const telemetry = createTelemetry(), counters = {}; telemetry.start();
  try {
    const { config, designKey, fullRefits, resumeCheckpoint, resumeDesignProof } = message.payload;
    if (!designs.has(designKey) && sharedDesigns.has(designKey)) designs.set(designKey, readSharedDesign(sharedDesigns.get(designKey)));
    const design = designs.get(designKey);
    if (!design) throw Error('Unknown shared design: ' + designKey);
    const artifact = telemetry.measure('fit-or-reuse', () => fitMeanCache({ design, config,
      cacheRoot: workerData.cacheRoot, codePins: workerData.codePins, counters, fullRefits, resumeCheckpoint, resumeDesignProof }));
    parentPort.postMessage({ type: 'result', id: message.id,
      value: { artifact, counters, telemetry: telemetry.finish({ counters, memoryScope: 'worker heap; RSS and CPU include the process' }) } });
  } catch (error) {
    parentPort.postMessage({ type: 'error', id: message.id, error: { message: error.message, stack: error.stack } });
  }
});
