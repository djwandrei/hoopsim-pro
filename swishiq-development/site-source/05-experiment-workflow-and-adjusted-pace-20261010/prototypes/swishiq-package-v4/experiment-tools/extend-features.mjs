import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { readJson } from './lib/artifacts.mjs';
import { extendFeatureArtifact } from './lib/feature-extension.mjs';

export { extendFeatureArtifact } from './lib/feature-extension.mjs';

export function runFeatureExtensionPlan(plan, { baseDirectory = process.cwd(), entryFile = import.meta.filename } = {}) {
  return extendFeatureArtifact(plan, { baseDirectory, entryFile });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  if (!process.argv[2] || process.argv.includes('--help')) {
    console.log('Usage: node extend-features.mjs <plan.json>\nBuilds an immutable append-only raw feature artifact under experiment-tools cache.');
    process.exit(process.argv.includes('--help') ? 0 : 1);
  }
  const planPath = path.resolve(process.argv[2]);
  const result = runFeatureExtensionPlan(readJson(planPath), { baseDirectory: path.dirname(planPath) });
  console.log(JSON.stringify({ outputDirectory: result.outputDirectory, featureRowsFile: result.featureRowsFile,
    featureExtensionFile: result.featureExtensionFile, rowCount: result.rowCount, cacheHit: result.cacheHit }));
}
