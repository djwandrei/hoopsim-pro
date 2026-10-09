import { SITE_ORIGIN } from '@/lib/deployConfig';
import { PINS as STUDIO_ASSET_PINS } from '@pins';
export const ORIGINAL_ORIGIN = SITE_ORIGIN;
export const ORIGINAL_STUDIO = `${ORIGINAL_ORIGIN}/tools/swishiq-studio/`;
const requests = new Map();
const DATA_ASSET = /^\/tools\/swishiq-studio\/data\/[a-zA-Z0-9_./-]+\.json$/;
const hex = buffer => [...new Uint8Array(buffer)].map(value => value.toString(16).padStart(2, '0')).join('');
// Standalone site build: fetch directly from the site (same-origin) and verify
// each module against the reviewed SHA-256 pins client-side.
async function direct(url) {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`The Studio source is unavailable (${response.status}).`);
  const bytes = await response.arrayBuffer();
  const sha256 = hex(await crypto.subtle.digest('SHA-256', bytes));
  const pathname = new URL(url).pathname;
  if (STUDIO_ASSET_PINS[pathname]) {
    if (STUDIO_ASSET_PINS[pathname] !== sha256) throw new Error('The original gameplay asset failed its integrity check.');
  } else if (!DATA_ASSET.test(pathname)) {
    throw new Error('This is not an approved public Studio asset.');
  }
  return { text: new TextDecoder().decode(bytes), sha256, contentType: response.headers.get('content-type') || 'application/octet-stream' };
}
export function clearStudioDataRequests() {
  for (const path of requests.keys()) {
    if (DATA_ASSET.test(new URL(path, ORIGINAL_ORIGIN).pathname)) requests.delete(path);
  }
}

export function originalAsset(input, base = ORIGINAL_STUDIO) {
  const url = new URL(String(input),base);
  if (url.origin === 'https://www.djshouseofcards-comics.com') url.host = new URL(ORIGINAL_ORIGIN).host;
  url.protocol = new URL(ORIGINAL_ORIGIN).protocol;
  if (url.origin !== ORIGINAL_ORIGIN) throw new Error('The original Studio requested an unsupported external source.');
  const path=url.pathname+url.search;
  if (!requests.has(path)) {
    const promise = direct(url.href);
    requests.set(path,promise);promise.catch(()=>requests.delete(path));
  }
  return requests.get(path);
}
export async function originalFetch(input, init = {}) {
  if (init.method && init.method.toUpperCase() !== 'GET') throw new Error('The Studio source relay is read-only.');
  init.signal?.throwIfAborted();
  const asset=await originalAsset(input instanceof Request ? input.url : input);
  init.signal?.throwIfAborted();
  return new Response(asset.text,{status:200,headers:{'Content-Type':asset.contentType,'X-Studio-Source-Sha256':asset.sha256}});
}