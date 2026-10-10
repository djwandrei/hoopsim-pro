import { parentPort, workerData } from 'node:worker_threads';
import { readSharedJson } from './shared-input.mjs';
import { computeScreenVariant } from './screen-stage.mjs';
import { createTelemetry } from './telemetry.mjs';

if (!parentPort) throw Error('Screen worker must run in a managed worker thread');
const forecasts = readSharedJson(workerData.forecasts);
const forecastByRef = new Map(forecasts.map(row => [row.gameRef, row]));
parentPort.on('message', message => {
  if (message?.type !== 'task') return;
  const telemetry = createTelemetry(); telemetry.start();
  try {
    const artifact = telemetry.measure('score-or-reuse', () => computeScreenVariant({
      cacheRoot: workerData.cacheRoot, forecasts, forecastByRef, chronology: workerData.chronology,
      signature: message.payload.signature, forceCanonical: message.payload.forceCanonical }));
    parentPort.postMessage({ type: 'result', id: message.id, value: { artifact,
      telemetry: telemetry.finish({ sharedForecastParsesPerWorker: 1, memoryScope: 'worker heap; RSS and CPU include the process' }) } });
  } catch (error) {
    parentPort.postMessage({ type: 'error', id: message.id, error: { message: error.message, stack: error.stack } });
  }
});
