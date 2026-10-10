import path from 'node:path';
import fs from 'node:fs';

const repo = path.resolve(import.meta.dirname, '../../../..');
const experimentRoot = path.resolve(repo, 'prototypes/swishiq-package-v4/experiment-tools');
function within(root, location) {
  const relative = path.relative(root, location);
  return !relative || !relative.startsWith('..') && !path.isAbsolute(relative);
}
function physicalPath(location) {
  let ancestor = location;
  while (!fs.existsSync(ancestor)) {
    const parent = path.dirname(ancestor);
    if (parent === ancestor) throw Error('No existing ancestor for experiment output');
    ancestor = parent;
  }
  return path.resolve(fs.realpathSync.native(ancestor), path.relative(ancestor, location));
}
export function assertDiagnosticOutput(directory) {
  const absolute = path.resolve(directory);
  const physical = physicalPath(absolute), physicalRepo = fs.realpathSync.native(repo), physicalExperiments = fs.realpathSync.native(experimentRoot);
  if (within(repo, absolute) && !within(experimentRoot, absolute)
    || within(physicalRepo, physical) && !within(physicalExperiments, physical)) throw Error('Workspace outputs must stay inside the isolated experiment tooling folder: ' + absolute);
  return absolute;
}
