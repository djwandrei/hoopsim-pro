import { siteUrl } from '@/lib/deployConfig';
export async function readSourceText(path) {
  if (!path.startsWith('/lineup-lab/')) throw new Error('Unsupported Lineup Lab asset.');
  const response = await fetch(siteUrl(path), { cache: 'no-cache' });
  if (!response.ok) throw new Error('The Lineup Lab source could not be loaded.');
  return response.text();
}
export async function invokeLineupShare(functionName, body) {
  if (functionName !== 'swishiq-result-share') throw new Error('Unsupported share operation.');
  const invoke = globalThis.DJ?.remoteCatalog?.invokeFunction;
  if (typeof invoke !== 'function') throw new Error('Verified public sharing is not connected. You can save this result locally.');
  return invoke(functionName, body);
}
