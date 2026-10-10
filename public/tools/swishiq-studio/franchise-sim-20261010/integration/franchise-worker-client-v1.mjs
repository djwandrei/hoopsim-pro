/** Each preview owns one worker. Requests and progress messages are correlated
 * by commandId; cancellation is cooperative and never retries a state change. */
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
    const message = event.data ?? {};
    const entry = pending.get(message.commandId);
    if (!entry) return;
    if (message.type === 'progress') {
      try { entry.onProgress?.(message.progress); }
      catch (error) { entry.onProgressError = error; }
      return;
    }
    pending.delete(message.commandId);
    if (message.type === 'error') {
      entry.reject(Object.assign(new Error(message.error?.message ?? 'Simulation worker failed.'), message.error));
    } else if (message.type === 'result' || message.type === 'approval-required' || message.type === 'cancelled') {
      entry.resolve(message.result);
    } else {
      entry.reject(new Error(`Simulation worker returned an unsupported response: ${String(message.type ?? 'missing type')}.`));
    }
  });
  worker.addEventListener('error', () => close(new Error('Simulation worker failed. The last verified save is preserved.')));
  worker.addEventListener('messageerror', () => close(new Error('Simulation worker message could not be decoded.')));

  function command(commandName, payload = {}, options = {}) {
    if (disposed) return Promise.reject(new Error('The franchise simulation worker is closed.'));
    if (typeof commandName !== 'string' || !commandName.trim()) return Promise.reject(new Error('A worker command name is required.'));
    const id = ++sequence;
    const commandId = String(options.commandId ?? `franchise-command-${id}`);
    if (!commandId.trim() || pending.has(commandId)) return Promise.reject(new Error('Worker commandId must be unique and non-empty.'));
    const { expectedRevision = Number.isInteger(payload?.expectedRevision) ? payload.expectedRevision : null,
      onProgress = null } = options;
    return new Promise((resolve, reject) => {
      const entry = { resolve, reject, onProgress };
      pending.set(commandId, entry);
      try {
        worker.postMessage({ type: 'command', commandId, command: commandName,
          payload, expectedRevision });
      } catch (error) {
        pending.delete(commandId);
        reject(error);
      }
    });
  }

  function cancel(commandId) {
    if (disposed) return false;
    const id = String(commandId ?? '');
    if (!id || !pending.has(id)) return false;
    worker.postMessage({ type: 'cancel', commandId: id });
    return true;
  }

  return {
    initialize: payload => command('initialize', payload),
    command,
    cancel,
    dispose: () => close(new Error('Simulation worker was closed.')),
  };
}
