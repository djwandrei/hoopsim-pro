import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const source = fileURLToPath(new URL('../../src/', import.meta.url));
export function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@/')) return { url: pathToFileURL(path.join(source, specifier.slice(2) + (path.extname(specifier) ? '' : '.js'))).href, shortCircuit: true };
  return nextResolve(specifier, context);
}
