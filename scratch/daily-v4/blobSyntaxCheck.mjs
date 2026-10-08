// Reproduces src/components/native/nativeModules.js's transform on the live
// vendor module graph, then syntax-checks the resulting blob text as an ES
// module with esbuild — the same parser family Safari chokes on.
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SITE = 'https://www.djshouseofcards-comics.com';
const imports = /^\s*(?:import|export)\s+(?:(?:[\w$]+\s*,?\s*)?\{[\s\S]*?\}|\*\s*(?:as\s+[\w$]+)?|[\w$]+)\s*from\s*(['"])([^'"]+)\1/gm;

async function fetchText(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} for ${url}`);
  return response.text();
}

const cache = new Map();
async function nativeModuleUrl(input, base) {
  const url = new URL(String(input), base).href;
  if (cache.has(url)) return cache.get(url);
  const task = (async () => {
    let text = await fetchText(url);
    const matches = [...text.matchAll(imports)];
    const resolved = await Promise.all(matches.map(match => nativeModuleUrl(match[2], url)));
    for (let i = matches.length - 1; i >= 0; i -= 1) {
      const match = matches[i]; const start = match.index, end = start + match[0].length;
      text = text.slice(0, start) + match[0].replace(`${match[1]}${match[2]}${match[1]}`, JSON.stringify(resolved[i])) + text.slice(end);
    }
    text = text.replace(/\bimport\.meta\.url\b/g, JSON.stringify(url)).replace(/\bimport\s*\(/g, '__djhcNativeImport(');
    const prelude = `const __djhcNativeImport = input => globalThis.__djhcOriginalModuleLoader(input, ${JSON.stringify(url)});\n`;
    return { blob: prelude + text, raw: text, url };
  })();
  cache.set(url, task); task.catch(() => cache.delete(url));
  return task;
}

const root = mkdtempSync(join(tmpdir(), 'daily-client-'));
const entry = await nativeModuleUrl('/tools/swishiq-daily-game-client.js?v=20261001g&rev=swishiq-daily-game-v5-name-identity-cache-closure-v1', `${SITE}/tools/`);
console.log('module graph:', [...cache.keys()]);
try {
  await build({
    stdin: { contents: entry.blob, resolveDir: root, sourcefile: 'blob.js', loader: 'js' },
    bundle: false, write: false, format: 'esm', target: 'safari15',
    logLevel: 'silent',
  });
  console.log('PARSE OK as ESM');
} catch (error) {
  console.log('PARSE FAILED:', error.message);
}
// Show every remaining import-ish token in the raw text for manual review.
const leftovers = [...entry.raw.matchAll(/import[({"' *]/g)].map(m => entry.raw.slice(Math.max(0, m.index - 40), m.index + 80));
console.log('import occurrences in transformed text:', leftovers.length);
leftovers.slice(0, 5).forEach(sample => console.log('…', sample.replace(/\n/g, '\\n')));