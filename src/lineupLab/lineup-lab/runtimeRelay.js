import { base44 } from '@/api/base44Client';
import { STANDALONE, SITE_ORIGIN } from '@/lib/deployConfig';

let installed = false;
const waiters = [];
let active = 0;

// Transient upstream failures on one relay page (site hiccup, cold backend
// function) are retryable; a mid-stream page failure otherwise aborts the
// whole streamed response, which Safari surfaces as "Fetch is aborted."
const RETRYABLE_PAGE_ERROR = /unavailable \(5\d\d\)|temporarily unavailable|timed out|status code|relay failed/i;

export async function requestSourceChunk(path, offset = 0, totalBytes = null) {
  if (active >= 4) await new Promise(resolve => waiters.push(resolve));
  active += 1;
  let lastError;
  try {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      if (attempt) await new Promise(resolve => setTimeout(resolve, 500 * attempt));
      try {
        const { data } = await base44.functions.invoke('swishiqLineupLabSource', {
          path, offset, totalBytes, responseFormat: 'base64',
        });
        if (typeof data?.dataB64 !== 'string' || !Number.isSafeInteger(data.nextOffset)) {
          throw new Error(data?.error || 'The Lineup Lab source response was incomplete.');
        }
        return data;
      } catch (error) {
        lastError = error;
        if (!RETRYABLE_PAGE_ERROR.test(String(error?.message))) throw error;
      }
    }
    throw lastError;
  } finally {
    active -= 1;
    waiters.shift()?.();
  }
}

export function installRuntimeRelay() {
  if (installed) return;
  installed = true;
  navigator.serviceWorker.addEventListener('message', event => {
    const port = event.ports[0];
    if (event.data?.type !== 'LINEUP_LAB_SOURCE' || !port ||
        event.source?.scriptURL !== navigator.serviceWorker.controller?.scriptURL) return;
    requestSourceChunk(event.data.path, event.data.offset, event.data.totalBytes).then(
      data => { port.postMessage({ data }); port.close(); },
      error => { port.postMessage({ error: error.message }); port.close(); },
    );
  });
}

export async function readSourceText(path) {
  if (STANDALONE) {
    const response = await fetch(SITE_ORIGIN + path, { cache: 'no-store' });
    if (!response.ok) throw new Error('The Lineup Lab source could not be loaded.');
    return response.text();
  }
  const decoder = new TextDecoder();
  let text = '', offset = 0, totalBytes = null;
  for (;;) {
    const page = await requestSourceChunk(path, offset, totalBytes);
    totalBytes = page.totalBytes;
    const bytes = Uint8Array.from(atob(page.dataB64), character => character.charCodeAt(0));
    text += decoder.decode(bytes, { stream: page.hasMore });
    if (!page.hasMore) return text;
    if (page.nextOffset <= offset) throw new Error('The Lineup Lab source stopped loading.');
    offset = page.nextOffset;
  }
}

export async function invokeLineupShare(functionName, body) {
  if (functionName !== 'swishiq-result-share') throw new Error('Unsupported Lineup Lab share operation.');
  if (STANDALONE) {
    const config = globalThis.DJ_BACKEND_CONFIG;
    const response = await fetch(`${config.supabaseUrl}/functions/v1/swishiq-result-share`, {
      method: 'POST', headers: { 'content-type': 'application/json', apikey: config.supabasePublishableKey, Authorization: `Bearer ${config.supabasePublishableKey}` },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data?.error || 'The verified result could not be shared.');
    return data;
  }
  const { data } = await base44.functions.invoke('swishiqLineupLabSource', { action: 'share', body });
  return data;
}