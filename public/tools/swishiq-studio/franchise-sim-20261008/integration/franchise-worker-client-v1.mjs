/** Each preview owns one worker. Disposing or a worker failure rejects every
 * pending call; no hidden retry can execute the same state transition twice. */
export function createFranchiseWorkerClient({ WorkerConstructor = globalThis.Worker,
  workerUrl = new URL('./franchise-worker-v1.mjs', import.meta.url) } = {}) {
  if (typeof WorkerConstructor !== 'function') throw new Error('This browser does not support simulation workers.');
  const worker = new WorkerConstructor(workerUrl, { type: 'module', name: 'swishiq-player-franchise-v1' });
  const pending = new Map();
  let sequence = 0, disposed = false;
  function close(error) {
    if (disposed) return;
    disposed = true;
    worker.terminate();
    for (const entry of pending.values()) entry.reject(error);
    pending.clear();
  }
  worker.addEventListener('message', event => {
    const message = event.data ?? {}, entry = pending.get(message.id);
    if (!entry) return;
    pending.delete(message.id);
    if (message.ok) entry.resolve(message.result);
    else entry.reject(Object.assign(new Error(message.error?.message ?? 'Simulation worker failed.'), message.error));
  });
  worker.addEventListener('error', () => close(new Error('Simulation worker failed. The last verified save is preserved.')));
  worker.addEventListener('messageerror', () => close(new Error('Simulation worker message could not be decoded.')));
  function command(type, payload = {}) {
    if (disposed) return Promise.reject(new Error('The franchise simulation worker is closed.'));
    const id = ++sequence;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      try { worker.postMessage({ id, type, payload }); }
      catch (error) { pending.delete(id); reject(error); }
    });
  }
  return { initialize: payload => command('initialize', payload), command,
    dispose: () => close(new Error('Simulation worker was closed.')) };
}
