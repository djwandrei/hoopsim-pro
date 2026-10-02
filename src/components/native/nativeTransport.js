import { STANDALONE, SITE_ORIGIN } from '@/lib/deployConfig';
import { PINS as STUDIO_ASSET_PINS } from '../../base44/shared/studioNativeAssets';
export const ORIGINAL_ORIGIN = SITE_ORIGIN;
export const ORIGINAL_STUDIO = `${ORIGINAL_ORIGIN}/tools/swishiq-studio/`;
const requests = new Map();
const waiters = [];
let active = 0;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const DATA_ASSET = /^\/tools\/swishiq-studio\/data\/[a-zA-Z0-9_./-]+\.json$/;
const hex = buffer => [...new Uint8Array(buffer)].map(value => value.toString(16).padStart(2, '0')).join('');
async function relay(path) {
  if (active >= 3) await new Promise(resolve => waiters.push(resolve));
  active += 1;
  let lastError;
  try {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      if (attempt) await sleep(500 * attempt);
      try {
        const { base44 } = await import('@/api/base44Client');
        const response=await base44.functions.invoke('swishiqSeasonSource',{assetPath:path});
        if(response.data.error)throw new Error(response.data.error);
        return response.data;
      } catch (error) {
        if (String(error?.message).includes('not an approved public Studio asset')) throw error;
        lastError = error;
      }
    }
  } finally { active -= 1;waiters.shift()?.(); }
  throw lastError;
}
// Standalone site build: fetch directly from the site (same-origin) and verify
// each module against the reviewed SHA-256 pins client-side.
async function direct(url) {
  const response = await fetch(url);
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
export function originalAsset(input, base = ORIGINAL_STUDIO) {
  const url = new URL(String(input),base);
  if (url.origin !== ORIGINAL_ORIGIN) throw new Error('The original Studio requested an unsupported external source.');
  const path=url.pathname+url.search;
  if (!requests.has(path)) {
    const promise = STANDALONE ? direct(url.href) : relay(path);
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