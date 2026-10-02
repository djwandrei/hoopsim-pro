import { base44 } from '@/api/base44Client';
export const ORIGINAL_ORIGIN = 'https://www.djshouseofcards-comics.com';
export const ORIGINAL_STUDIO = `${ORIGINAL_ORIGIN}/tools/swishiq-studio/`;
const requests = new Map();
const waiters = [];
let active = 0;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function relay(path) {
  if (active >= 3) await new Promise(resolve => waiters.push(resolve));
  active += 1;
  let lastError;
  try {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      if (attempt) await sleep(500 * attempt);
      try {
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
export function originalAsset(input, base = ORIGINAL_STUDIO) {
  const url = new URL(String(input),base);
  if (url.origin !== ORIGINAL_ORIGIN) throw new Error('The original Studio requested an unsupported external source.');
  const path=url.pathname+url.search;
  if (!requests.has(path)) { const promise=relay(path);requests.set(path,promise);promise.catch(()=>requests.delete(path)); }
  return requests.get(path);
}
export async function originalFetch(input, init = {}) {
  if (init.method && init.method.toUpperCase() !== 'GET') throw new Error('The Studio source relay is read-only.');
  init.signal?.throwIfAborted();
  const asset=await originalAsset(input instanceof Request ? input.url : input);
  init.signal?.throwIfAborted();
  return new Response(asset.text,{status:200,headers:{'Content-Type':asset.contentType,'X-Studio-Source-Sha256':asset.sha256}});
}