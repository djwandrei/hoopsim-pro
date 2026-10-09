import { createHash } from 'node:crypto';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_SITE_ROOT = 'C:\\Users\\djwan\\Downloads\\djshouseofcards-next-fixes-applied';
const SITE_ROOT = path.resolve(process.env.DJHC_SITE_ROOT || DEFAULT_SITE_ROOT);
const SOURCE_PATH = path.join(SITE_ROOT, 'lineup-lab', 'app.js');
const OUTPUT_PATH = path.join(PROJECT_ROOT, 'public', 'djhc-runtime', 'lineup-controller.js');
const IMPORT_BASE = 'https://djhc-local.invalid/lineup-lab/app.js';

const STATIC_IMPORT_PATTERN = /^import\s[\s\S]*?\bfrom\s+("([^"\r\n]+)"|'([^'\r\n]+)')\s*;[\t ]*(?:\r?\n|$)/gm;
const FINAL_INITIALIZE_PATTERN = /\ninitialize\(\);\s*$/;
const FIXTURE_ASSIGNMENT_PATTERN = /^const FIXTURE_URL = "\.\/fixtures\/timberwolves-2021-22\.json\?v=20261002c";$/m;
const WORKER_ASSIGNMENT_PATTERN = /^const OPTIMIZER_WORKER_URL = new URL\("\.\/optimizer-worker\.js\?v=20261008n&rev=lineup-role-range-worker-v3", import\.meta\.url\);$/m;

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function extractStaticImports(source) {
  const statements = [...source.matchAll(STATIC_IMPORT_PATTERN)];
  const importStarts = [...source.matchAll(/^import\s/gm)];
  if (!statements.length || statements.length !== importStarts.length) {
    throw new Error(`Expected every top-level import to be a from-import; found ${importStarts.length} start(s) and ${statements.length} complete statement(s).`);
  }

  return statements.map(match => {
    const specifier = match[2] || match[3];
    if (!specifier.startsWith('./') && !specifier.startsWith('../')) {
      throw new Error(`Unexpected non-relative Lineup Lab import: ${specifier}`);
    }
    const resolved = new URL(specifier, IMPORT_BASE);
    if (resolved.origin !== new URL(IMPORT_BASE).origin) {
      throw new Error(`Lineup Lab import resolves outside the local site: ${specifier}`);
    }
    return {
      start: match.index,
      end: match.index + match[0].length,
      source: match[0],
      specifier,
      resolvedSpecifier: `${resolved.pathname}${resolved.search}${resolved.hash}`,
    };
  });
}

function makeGeneratedModule(inputBytes) {
  const originalText = inputBytes.toString('utf8').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const sourceHash = sha256(inputBytes);
  const imports = extractStaticImports(originalText);
  const removedImportPatterns = [
    { name: 'createWorkflowView', path: './workflow-view.js' },
    { name: 'setCourtContextTeam', path: '../tools/basketball-theme.js' },
  ];
  for (const expected of removedImportPatterns) {
    const matches = imports.filter(item => item.specifier.startsWith(expected.path) && item.source.includes(expected.name));
    if (matches.length !== 1) {
      throw new Error(`Expected exactly one ${expected.name} import from ${expected.path}; found ${matches.length}.`);
    }
  }

  if (!FIXTURE_ASSIGNMENT_PATTERN.test(originalText)) {
    throw new Error('The expected fixture URL assignment was not found; review the source update before regenerating.');
  }
  if (!WORKER_ASSIGNMENT_PATTERN.test(originalText)) {
    throw new Error('The expected optimizer worker URL assignment was not found; review the source update before regenerating.');
  }
  if (!FINAL_INITIALIZE_PATTERN.test(originalText)) {
    throw new Error('The expected final initialize(); call was not found; review the source update before regenerating.');
  }
  for (const functionName of ['invalidateDatasetLoad', 'cancelCurrentOptimization']) {
    if (!new RegExp(`function\\s+${functionName}\\s*\\(`).test(originalText)) {
      throw new Error(`The expected ${functionName} cleanup function was not found.`);
    }
  }
  if (!/state\.toastTimer/.test(originalText)) {
    throw new Error('The expected toast timer cleanup state was not found.');
  }

  let body = originalText;
  for (const item of [...imports].sort((left, right) => right.start - left.start)) {
    body = body.slice(0, item.start) + body.slice(item.end);
  }

  const retainedImports = imports
    .filter(item => !removedImportPatterns.some(expected => item.specifier.startsWith(expected.path) && item.source.includes(expected.name)))
    .map(item => item.source.replace(item.specifier, item.resolvedSpecifier).trimEnd());

  body = body.replace(
    FIXTURE_ASSIGNMENT_PATTERN,
    'const FIXTURE_URL = "/lineup-lab/fixtures/timberwolves-2021-22.json?v=20261002c";',
  );
  body = body.replace(
    WORKER_ASSIGNMENT_PATTERN,
    'const OPTIMIZER_WORKER_URL = new URL("/lineup-lab/optimizer-worker.js?v=20261008n&rev=lineup-role-range-worker-v3", window.location.origin);',
  );
  body = body.replace(FINAL_INITIALIZE_PATTERN, `
  return {
    ready: initialize(),
    dispose() {
      invalidateDatasetLoad();
      cancelCurrentOptimization();
      window.clearTimeout(state.toastTimer);
    },
  };
}`);

  if (/^import\s/gm.test(body) || /\ninitialize\(\);\s*$/.test(body)) {
    throw new Error('Generation left a top-level import or auto-initialize call in the controller body.');
  }

  // Keep the checked-in generated fallback stable and diff-check clean while
  // preserving the reviewed source hash above.
  body = body.replace(/[ \t]+$/gm, '');

  const wrappedBody = body
    .trim()
    .split('\n')
    .map(line => line ? `  ${line}` : '')
    .join('\n');

  return [
    '// Generated by scripts/prepare-lineup-runtime.mjs from the reviewed DJHC public controller.',
    `export const LINEUP_CONTROLLER_SOURCE_SHA256 = "${sourceHash}";`,
    ...retainedImports,
    '',
    'export function mountLineupController(createWorkflowView, setCourtContextTeam) {',
    wrappedBody,
    '',
  ].join('\n');
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  if (!(await exists(SOURCE_PATH))) {
    if (await exists(OUTPUT_PATH)) {
      console.log('Lineup runtime source is unavailable; using the checked-in generated controller.');
      return;
    }
    throw new Error(`Lineup runtime source is unavailable and the generated fallback is missing: ${OUTPUT_PATH}`);
  }

  const inputBytes = await readFile(SOURCE_PATH);
  const generated = makeGeneratedModule(inputBytes);
  const current = (await exists(OUTPUT_PATH)) ? await readFile(OUTPUT_PATH, 'utf8') : null;
  if (current === generated) {
    console.log('Lineup runtime controller is already current.');
    return;
  }

  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, generated, 'utf8');
  console.log(`Updated checked-in Lineup runtime controller from DJHC source SHA-256 ${sha256(inputBytes)}.`);
}

main().catch(error => {
  console.error(`Lineup runtime preparation failed: ${error.message}`);
  process.exitCode = 1;
});
