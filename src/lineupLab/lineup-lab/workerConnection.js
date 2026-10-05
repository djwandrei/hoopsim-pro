import { STANDALONE } from '@/lib/deployConfig';
import { installRuntimeRelay } from '@/lineupLab/lineup-lab/runtimeRelay';

let connection = null;

function waitForController(registration, scriptUrl) {
  return new Promise((resolve, reject) => {
    const worker = registration.installing || registration.waiting;
    const cleanup = () => {
      clearTimeout(timer);
      navigator.serviceWorker.removeEventListener('controllerchange', check);
      worker?.removeEventListener('statechange', check);
    };
    const check = () => {
      if (navigator.serviceWorker.controller?.scriptURL === scriptUrl &&
          !registration.installing && !registration.waiting) {
        cleanup(); resolve();
      }
    };
    const timer = setTimeout(() => {
      cleanup(); reject(new Error('The Lineup Lab connection did not activate.'));
    }, 15000);
    navigator.serviceWorker.addEventListener('controllerchange', check);
    worker?.addEventListener('statechange', check);
    check();
  });
}

export default async function workerConnection() {
  // The site build already has same-origin access; it needs no root-scope worker.
  if (STANDALONE) return;
  if (!connection) {
    connection = (async () => {
      if (!('serviceWorker' in navigator)) throw new Error('This browser cannot load the Lineup Lab connection.');
      installRuntimeRelay();
      const scriptUrl = new URL('/sw-lineup-lab.js?v=wiring-v2', window.location.origin).href;
      const registration = await navigator.serviceWorker.register(scriptUrl, { scope: '/', updateViaCache: 'none' });
      await registration.update();
      await waitForController(registration, scriptUrl);

    })().catch(error => { connection = null; throw error; });
  }
  await connection;
  // Reconnect on every mount, including after a service-worker idle restart.
  await new Promise((resolve, reject) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => { channel.port1.close(); reject(new Error('The Lineup Lab connection did not respond.')); }, 10000);
    channel.port1.onmessage = event => {
      clearTimeout(timer); channel.port1.close();
      if (event.data?.ready) resolve();
      else reject(new Error('The Lineup Lab connection is unavailable.'));
    };
    navigator.serviceWorker.controller.postMessage({ type: 'LINEUP_LAB_CONNECT' }, [channel.port2]);
  });
}

export function disconnectWorker() {
  if (!STANDALONE && 'serviceWorker' in navigator) {
    navigator.serviceWorker.controller?.postMessage({ type: 'LINEUP_LAB_DISCONNECT' });
  }
}