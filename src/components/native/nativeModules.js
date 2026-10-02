import { originalAsset, ORIGINAL_STUDIO } from '@/components/native/nativeTransport';
const modules = new Map();
const imports = /^\s*(?:import|export)\s+(?:(?:[\w$]+\s*,?\s*)?\{[\s\S]*?\}|\*\s*(?:as\s+[\w$]+)?|[\w$]+)\s*from\s*(['"])([^'"]+)\1/gm;
export async function nativeModuleUrl(input, base = ORIGINAL_STUDIO) {
  const url=new URL(String(input),base).href;
  if (modules.has(url)) return modules.get(url);
  const task=(async()=>{
    const asset=await originalAsset(url);
    const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(asset.text));
    const hash=[...new Uint8Array(digest)].map(value=>value.toString(16).padStart(2,'0')).join('');
    if(hash!==asset.sha256) throw new Error('The original gameplay response failed its integrity check.');
    let text=asset.text;
    const pathname=new URL(url).pathname;
    // Preserve the native timeline function while breaking the optional
    // career modules' static ESM cycle for immutable Blob module URLs.
    if(pathname.endsWith('/career-simulation-model.js')) text=text.replace(/^import\s*\{\s*buildCareerTimeline\s*\}\s*from\s*['"][^'"]+['"];?/m,'function buildCareerTimeline(...args) { return globalThis.__djhcOriginalCareerTimeline(...args); }');
    if(pathname.endsWith('/career-simulator.js')) text+='\nglobalThis.__djhcOriginalCareerTimeline = buildCareerTimeline;\n';
    const matches=[...text.matchAll(imports)];
    const resolved=await Promise.all(matches.map(match=>nativeModuleUrl(match[2],url)));
    for(let i=matches.length-1;i>=0;i-=1){const match=matches[i];const start=match.index,end=start+match[0].length;text=text.slice(0,start)+match[0].replace(`${match[1]}${match[2]}${match[1]}`,JSON.stringify(resolved[i]))+text.slice(end);}
    text=text.replace(/\bimport\.meta\.url\b/g,JSON.stringify(url)).replace(/\bimport\s*\(/g,'__djhcNativeImport(');
    // The native Chemistry loader has a cooperative, cancelable main-thread
    // path for environments without same-origin workers. Do not create an
    // original-origin worker that cannot fetch through this app's relay.
    if(new URL(url).pathname.endsWith('/chemistry-lab.js')) text=text.replace("if (typeof globalThis.Worker !== 'function') return Promise.resolve(undefined);","return Promise.resolve(undefined);");
    const prelude=`const __djhcNativeImport = input => globalThis.__djhcOriginalModuleLoader(input, ${JSON.stringify(url)});\n`;
    return URL.createObjectURL(new Blob([prelude,text],{type:'text/javascript'}));
  })();
  modules.set(url,task);task.catch(()=>modules.delete(url));return task;
}
export async function loadNativeModule(input,base=ORIGINAL_STUDIO) { return import(/* @vite-ignore */ await nativeModuleUrl(input,base)); }
globalThis.__djhcOriginalModuleLoader=loadNativeModule;