import { originalAsset, ORIGINAL_STUDIO } from '@/components/native/nativeTransport';
const modules = new Map();
const imports = /(?:import|export)\s+(?:[\s\S]*?)\sfrom\s*(['"])([^'"]+)\1/g;
async function verifyGraph(url, visited = new Set()) {
  const key = url.split('?')[0];
  if (visited.has(key)) return;
  visited.add(key);
  const asset = await originalAsset(url);
  for (const match of asset.text.matchAll(imports)) {
    if (match[2].startsWith('.')) await verifyGraph(new URL(match[2], url).href, visited);
  }
}
export async function nativeModuleUrl(input, base = ORIGINAL_STUDIO) {
  const url = new URL(String(input), base).href;
  if (!modules.has(url)) {
    const task = verifyGraph(url).then(() => url);
    modules.set(url, task);
    task.catch(() => modules.delete(url));
  }
  return modules.get(url);
}
export async function loadNativeModule(input, base = ORIGINAL_STUDIO) {
  const url = await nativeModuleUrl(input, base);
  return import(/* @vite-ignore */ url);
}
