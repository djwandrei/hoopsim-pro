import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { pin, pinModuleClosure, readJson } from '../prototypes/swishiq-package-v4/experiment-tools/lib/artifacts.mjs';

const sourceRoot = path.resolve(import.meta.dirname, '..');
const prefix = 'swishiq-development';

export function prepareMilestone(checkout, id, summaryFile, scope = null) {
  if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(id)) throw Error('A short lowercase milestone ID is required');
  const repository = path.resolve(checkout);
  if (!fs.existsSync(path.join(repository, '.git'))) throw Error('Expected the separate Git checkout');
  const destination = path.join(repository, prefix);
  const milestoneFile = path.join(destination, 'milestones', id + '.json');
  const sourceDestination = path.join(destination, 'site-source', id);
  const evidenceDestination = path.join(destination, 'evidence', id);
  if (fs.existsSync(milestoneFile) || fs.existsSync(sourceDestination) || fs.existsSync(evidenceDestination)) {
    throw Error('Preserve existing milestone or partial source tree: ' + id);
  }
  if (scope && (!Array.isArray(scope.entries) || !scope.entries.length
    || !Array.isArray(scope.documentation) || !Array.isArray(scope.evidence))) {
    throw Error('Explicit milestone scope needs entries, documentation and evidence arrays');
  }
  const sourceFile = file => {
    if (typeof file !== 'string' || path.isAbsolute(file)) throw Error('Expected a relative source path');
    const location = path.resolve(sourceRoot, file);
    const relative = path.relative(sourceRoot, location);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw Error('Source escaped workspace');
    if (!fs.existsSync(location)) throw Error('Missing reviewed source: ' + file);
    return location;
  };
  const defaultEntries = [
    'scripts/swishiq-experiment.mjs',
    'scripts/prepare-hoopsim-milestone.mjs',
    'scripts/benchmark-lineup-workload.mjs',
    'prototypes/swishiq-package-v4/experiment-tools/prepare-candidate100-hustle-screen.mjs',
    'prototypes/swishiq-package-v4/experiment-tools/build-candidate100-hustle-alias-adapter.mjs',
    'prototypes/swishiq-package-v4/experiment-tools/build-candidate100-rotation-alias-adapter.mjs',
    'prototypes/swishiq-package-v4/experiment-tools/prepare-candidate100-rotation-screen.mjs',
    'prototypes/swishiq-package-v4/experiment-tools/summarize-rotation-continuity-pipeline.mjs',
    'prototypes/swishiq-package-v4/models/game-lab-candidate100-pruned-total-model-blend090-v1.mjs',
    'prototypes/lineup-experiment-tools/workload-cache/extract.mjs',
  ];
  const entries = (scope?.entries ?? defaultEntries.filter(file => fs.existsSync(path.join(sourceRoot, file))))
    .map(sourceFile);
  const optional = (scope ? [] : [
    'prototypes/swishiq-package-v4/experiment-tools/summarize-feature-pipeline.mjs',
  ]).filter(file => fs.existsSync(path.join(sourceRoot, file))).map(sourceFile);
  const closure = pinModuleClosure([...entries, ...optional]);
  const defaultDocumentation = [
    'docs/lineup-optimizer-experiment-efficiency-plan-20261008.md',
    'docs/lineup-optimizer-prepared-context-contract-20261010.md',
    'docs/lineup-optimizer-batch-refactor-map-20261010.md',
    'docs/swishiq-implementation-consumer-map-20261010.md',
    'docs/swishiq-implementation-backlog-disposition-20261010.json',
    'docs/swishiq-game-lab-feature-readiness-20261010.md',
    'docs/swishiq-implementation-ledger-20261010.json',
    'docs/candidate100-rotation-screen-plan-review-20261010.md',
    'docs/candidate100-rotation-continuity-redundancy-review-20261010.md',
    'docs/swishiq-milestone-03-rotation-screen-20261010.json',
    'prototypes/lineup-experiment-tools/workload-cache/README.md',
  ];
  const documentation = (scope?.documentation ?? defaultDocumentation.filter(file => fs.existsSync(path.join(sourceRoot, file))))
    .map(file => pin(sourceFile(file)));
  const files = [];
  for (const item of [...closure, ...documentation]) {
    const relative = path.relative(sourceRoot, item.path).replaceAll('\\', '/');
    if (relative.startsWith('..') || path.isAbsolute(relative) || /(^|\/)\.env|(^|\/)runs\/|\.(jsonl|gz|zip)$/i.test(relative)) {
      throw Error('File outside the reviewed code/documentation scope: ' + relative);
    }
    // Each new milestone has its own immutable source directory. Milestone 01
    // predates this layout and retains its legacy site-source paths unchanged.
    const target = path.join(destination, 'site-source', id, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(item.path, target);
    const copied = pin(target);
    if (copied.sha256 !== item.sha256 || copied.bytes !== item.bytes) throw Error('Copy mismatch: ' + relative);
    files.push({ path: 'site-source/' + id + '/' + relative, sha256: copied.sha256, bytes: copied.bytes });
  }
  const evidenceNames = new Set();
  for (const item of scope?.evidence ?? []) {
    if (!item || typeof item.target !== 'string' || !/^[a-z0-9][a-z0-9._-]*\.(json|md)$/i.test(item.target)
      || evidenceNames.has(item.target)) throw Error('Evidence needs unique simple JSON/Markdown filenames');
    evidenceNames.add(item.target);
    const source = sourceFile(item.source), sourcePin = pin(source);
    if (!/\.(json|md)$/i.test(source) || /(^|[\\/])\.env/i.test(source) || sourcePin.bytes > 1024 * 1024) {
      throw Error('Evidence outside the reviewed compact JSON/Markdown scope: ' + item.source);
    }
    const target = path.join(evidenceDestination, item.target);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target, fs.constants.COPYFILE_EXCL);
    const copied = pin(target);
    if (copied.sha256 !== sourcePin.sha256 || copied.bytes !== sourcePin.bytes) throw Error('Evidence copy mismatch');
    files.push({ path: 'evidence/' + id + '/' + item.target, sha256: copied.sha256, bytes: copied.bytes });
  }
  const summary = readJson(summaryFile);
  const manifest = { format: 'swishiq-source-milestone-v1', milestone: id, createdAt: new Date().toISOString(),
    scope: 'development source and documentation; no datasets or credentials', summary, files };
  fs.mkdirSync(path.dirname(milestoneFile), { recursive: true });
  fs.writeFileSync(milestoneFile, JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
  fs.writeFileSync(path.join(destination, 'LATEST.json'), JSON.stringify({ milestone: id,
    manifest: 'milestones/' + id + '.json', files: files.length, summary }, null, 2) + '\n');
  fs.writeFileSync(path.join(destination, '.gitignore'), 'site-source/**/runs/\nsite-source/**/outputs/\nsite-source/**/.env*\n');
  fs.writeFileSync(path.join(destination, 'README.md'), '# SwishIQ model development milestones\n\n'
    + 'This directory contains reviewed code copies from the DJHC site workspace and compact milestone evidence. '
    + 'Read LATEST.json, then its milestone manifest. Paths and hashes bind each copied source file.\n\n'
    + 'The site-source tree preserves relative imports within each milestone directory. Milestone 01 retains its original legacy paths; later milestones are versioned so their file hashes remain immutable. Data packages, player-game archives, credentials, caches and large run outputs are excluded. '
    + 'Diagnostic plans require their separately available source artifacts. The Node experiment launcher is '
    + '`site-source/<milestone>/scripts/swishiq-experiment.mjs`; it is developer tooling and should not be bundled into the browser.\n\n'
    + 'Candidate 100 remains the reference until a milestone explicitly records a selected successor. '
    + 'A development screen or efficiency parity receipt does not establish independent predictive validity. '
    + 'Source publication does not deploy the DJHC site or switch Base44 model selection.\n');
  return { directory: destination, milestone: id, fileCount: files.length,
    bytes: files.reduce((sum, file) => sum + file.bytes, 0), manifest: milestoneFile };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [checkout, id, summary, scopeFile] = process.argv.slice(2);
  if (!checkout || !id || !summary) throw Error('Usage: node prepare-hoopsim-milestone.mjs <checkout> <milestone-id> <summary.json> [scope.json]');
  console.log(JSON.stringify(prepareMilestone(checkout, id, summary, scopeFile ? readJson(scopeFile) : null)));
}
