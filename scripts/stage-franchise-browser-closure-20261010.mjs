import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const SCRIPT_NAME = 'scripts/stage-franchise-browser-closure-20261010.mjs';
const MANIFEST_NAME = 'franchise-runtime-closure-manifest.json';
const MANIFEST_FORMAT = 'swishiq-franchise-browser-runtime-closure-v2';
const PREVIOUS_MANIFEST_FORMAT = 'swishiq-franchise-browser-runtime-closure-v1';
const DEFAULT_SOURCE_ROOT = 'C:/Users/djwan/Downloads/djshouseofcards-next-fixes-applied';
const DEFAULT_COPY_PREFIX = 'prototypes/djhc-player-game-sim';
const DEFAULT_TARGET = 'public/tools/swishiq-studio/franchise-sim-20261010';
const DEFAULT_GROUPS = [
  {
    name: 'app-bridge',
    entrypoints: [
      `${DEFAULT_COPY_PREFIX}/lib/franchise-browser-store-v1.mjs`,
      `${DEFAULT_COPY_PREFIX}/lib/franchise-controls-v1.mjs`,
      `${DEFAULT_COPY_PREFIX}/integration/v4-franchise-intake-v1.mjs`,
      `${DEFAULT_COPY_PREFIX}/integration/v4-snapshot-worker-payload-v1.mjs`,
      `${DEFAULT_COPY_PREFIX}/integration/franchise-contract-source-loader-v1.mjs`,
    ],
  },
  {
    name: 'standalone-worker',
    entrypoints: [
      `${DEFAULT_COPY_PREFIX}/integration/franchise-worker-client-v1.mjs`,
      `${DEFAULT_COPY_PREFIX}/integration/franchise-worker-v1.mjs`,
    ],
  },
];
const DEFAULT_ASSETS = [
  `${DEFAULT_COPY_PREFIX}/checkpoints/2026-10-06-v4-parametric-age-frozen/model.json`,
  `${DEFAULT_COPY_PREFIX}/models/shared-player-production-v1-candidate-20261007b.json`,
  `${DEFAULT_COPY_PREFIX}/data/season-age-anchor-index-v1.json`,
  `${DEFAULT_COPY_PREFIX}/data/franchise-contract-source-v1.json`,
  `${DEFAULT_COPY_PREFIX}/data/cba-salary-scale-baselines-2023-v1.json`,
];
const DEFAULT_EXTERNAL_MODULE_ROOTS = [
  {
    sourcePrefix: 'tools/swishiq-studio/engine',
    browserUrlPrefix: '/tools/swishiq-studio/engine',
    reason: 'Canonical V4 Studio engine is owned and served by the existing site runtime.',
  },
];
const DEFAULT_EXTERNAL_RESOURCES = [
  {
    sourcePath: 'tools/swishiq-studio/data/nba-actual-schedules-v1.json',
    browserUrl: '/tools/swishiq-studio/data/nba-actual-schedules-v1.json',
    expectedSha256: '522ed031595601aff75b26d5f3d3cc8022525c0e8b29d072baa0b626d54d4e3e',
    purpose: 'Pinned V4 franchise schedule input. The new app bridge must pass this absolute URL as scheduleUrl because the prototype-relative default changes when staged.',
  },
];

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const posixPath = value => value.split(path.sep).join('/');
const comparePaths = (left, right) => left < right ? -1 : left > right ? 1 : 0;

function isWithin(root, filename) {
  const relative = path.relative(root, filename);
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

function normalizedRelative(value) {
  return String(value).replaceAll('\\', '/').replace(/^\.\//, '').replace(/\/$/, '');
}

function isJavaScriptPath(filename) {
  return /\.(?:m?js|cjs)$/i.test(filename);
}

function sourceRelativePath(filename, sourceRoot) {
  const relative = path.relative(sourceRoot, filename);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`Source path is outside the declared source root: ${filename}`);
  }
  return normalizedRelative(posixPath(relative));
}

function splitSpecifier(specifier) {
  const index = specifier.search(/[?#]/);
  return index < 0
    ? { pathname: specifier, suffix: '' }
    : { pathname: specifier.slice(0, index), suffix: specifier.slice(index) };
}

// Match literal static imports, re-exports, and literal dynamic imports. This
// intentionally mirrors the project's existing browser-closure audit parser.
const importPattern = /(?:\b(?:import|export)\s+(?:[^;]*?\sfrom\s*)?["']([^"']+)["']|\bimport\s*\(\s*["']([^"']+)["']\s*\))/g;

function findModuleSpecifiers(source, sourcePath) {
  const rows = [];
  for (const match of source.matchAll(importPattern)) {
    const specifier = match[1] ?? match[2];
    if (!specifier) continue;
    const offset = match.index + match[0].lastIndexOf(specifier);
    rows.push({ specifier, start: offset, end: offset + specifier.length });
  }
  const dynamicPattern = /\bimport\s*\(\s*([^\s"'`][^)]*)\)/g;
  for (const match of source.matchAll(dynamicPattern)) {
    throw new Error(`Non-literal dynamic import cannot be closed safely: ${sourcePath}: ${match[0]}`);
  }
  return rows;
}

function parseExternalRule(value) {
  const separator = value.indexOf('=');
  if (separator < 1 || separator === value.length - 1) {
    throw new Error(`External module root must be source/path=/browser/path: ${value}`);
  }
  return {
    sourcePrefix: normalizedRelative(value.slice(0, separator)),
    browserUrlPrefix: value.slice(separator + 1).replace(/\/+$/, ''),
    reason: 'Explicit command-line external module root.',
  };
}

function parseArgs(argv) {
  const options = {
    sourceRoot: DEFAULT_SOURCE_ROOT,
    target: DEFAULT_TARGET,
    copyPrefix: DEFAULT_COPY_PREFIX,
    groups: structuredClone(DEFAULT_GROUPS),
    assets: [...DEFAULT_ASSETS],
    externalModuleRoots: structuredClone(DEFAULT_EXTERNAL_MODULE_ROOTS),
    write: false,
    force: false,
    summary: false,
    verify: false,
    entrypointOverrides: false,
  };
  const nextValue = index => {
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`Expected a value after ${argv[index]}.`);
    return value;
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--source-root') {
      options.sourceRoot = nextValue(index); index += 1;
    } else if (arg === '--target') {
      options.target = nextValue(index); index += 1;
    } else if (arg === '--copy-prefix') {
      options.copyPrefix = normalizedRelative(nextValue(index)); index += 1;
    } else if (arg === '--entrypoint') {
      const value = nextValue(index); index += 1;
      const separator = value.indexOf('=');
      if (separator < 1 || separator === value.length - 1) {
        throw new Error(`Entrypoint must be group-name=source/relative/path.mjs: ${value}`);
      }
      if (!options.entrypointOverrides) {
        options.groups = [];
        options.entrypointOverrides = true;
      }
      const groupName = value.slice(0, separator);
      const sourcePath = normalizedRelative(value.slice(separator + 1));
      let group = options.groups.find(row => row.name === groupName);
      if (!group) {
        group = { name: groupName, entrypoints: [] };
        options.groups.push(group);
      }
      group.entrypoints.push(sourcePath);
    } else if (arg === '--asset') {
      options.assets.push(normalizedRelative(nextValue(index))); index += 1;
    } else if (arg === '--external-module-root') {
      options.externalModuleRoots.push(parseExternalRule(nextValue(index))); index += 1;
    } else if (arg === '--write') {
      options.write = true;
    } else if (arg === '--dry-run') {
      options.write = false;
    } else if (arg === '--force') {
      options.force = true;
    } else if (arg === '--summary') {
      options.summary = true;
    } else if (arg === '--verify') {
      options.verify = true;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }
  if (options.force && !options.write) throw new Error('--force is valid only with --write.');
  if (options.verify && (options.write || options.force)) throw new Error('--verify cannot be combined with --write or --force.');
  if (!options.groups.length || options.groups.some(group => !group.entrypoints.length)) {
    throw new Error('At least one declared entrypoint is required.');
  }
  if (new Set(options.groups.map(group => group.name)).size !== options.groups.length) {
    throw new Error('Entrypoint group names must be unique.');
  }
  return options;
}

function printHelp() {
  process.stdout.write(`Stage a pinned browser dependency closure for the versioned SwishIQ Franchise runtime.\n\n` +
    `Usage (dry-run is the default):\n` +
    `  node .\\${SCRIPT_NAME} [--dry-run] [options]\n` +
    `  node .\\${SCRIPT_NAME} --write [--force] [options]\n\n` +
    `Options:\n` +
    `  --source-root PATH          Source project root (default: ${DEFAULT_SOURCE_ROOT})\n` +
    `  --target PATH               Target under this hoopsim-pro worktree\n` +
    `  --copy-prefix PATH          Only copy source files under this prefix\n` +
    `  --entrypoint GROUP=PATH     Replace default roots; repeat to add roots\n` +
    `  --asset PATH                Add a copied non-JS asset to the declared defaults\n` +
    `  --external-module-root S=U  Allow and record relative imports under source path S, served at URL U\n` +
    `  --write                     Copy files and write ${MANIFEST_NAME}\n` +
    `  --force                     Permit overwriting any target file (requires --write)\n` +
    `  --verify                    Verify exact staged files, hashes, and manifest without writing\n` +
    `  --summary                   Print counts instead of the full dry-run manifest\n\n` +
    `Default entrypoint groups are app-bridge and standalone-worker. The worker group is reported separately; no preview UI files are included.\n`);
}

function getExternalRule(filename, sourceRoot, rules) {
  const sourceRelative = normalizedRelative(posixPath(path.relative(sourceRoot, filename)));
  return rules.find(rule => sourceRelative === rule.sourcePrefix || sourceRelative.startsWith(`${rule.sourcePrefix}/`)) ?? null;
}

function externalBrowserUrl(filename, sourceRoot, rule, suffix = '') {
  const sourceRelative = normalizedRelative(posixPath(path.relative(sourceRoot, filename)));
  const suffixPath = sourceRelative === rule.sourcePrefix ? '' : sourceRelative.slice(rule.sourcePrefix.length + 1);
  return `${rule.browserUrlPrefix}${suffixPath ? `/${suffixPath}` : ''}${suffix}`;
}

function resolveJsImport(importer, specifier) {
  const { pathname, suffix } = splitSpecifier(specifier);
  if (!pathname || !pathname.startsWith('.')) return null;
  return { resolved: path.resolve(path.dirname(importer), pathname), suffix, pathname };
}

async function resolveExistingJsFile(importer, specifier) {
  const resolvedInfo = resolveJsImport(importer, specifier);
  if (!resolvedInfo) return null;
  const { resolved } = resolvedInfo;
  const candidates = path.extname(resolved)
    ? [resolved]
    : [`${resolved}.mjs`, `${resolved}.js`, `${resolved}.cjs`];
  for (const candidate of candidates) {
    try {
      const stat = await fs.stat(candidate);
      if (stat.isFile()) return { ...resolvedInfo, resolved: candidate };
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }
  throw new Error(`Relative JavaScript import was not found: ${path.relative(path.dirname(importer), resolvedInfo.resolved)} (from ${importer})`);
}

function mapOutputPath(filename, copyRoot) {
  if (!isWithin(copyRoot, filename)) throw new Error(`Refusing to stage a file outside the declared copy prefix: ${filename}`);
  const relative = path.relative(copyRoot, filename);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`Invalid staged output path: ${filename}`);
  }
  return posixPath(relative);
}

function moduleOutputSpecifier(importedSourcePath, importerOutputPath, copyRoot, sourceRoot, rules, suffix) {
  const rule = getExternalRule(importedSourcePath, sourceRoot, rules);
  if (rule) return externalBrowserUrl(importedSourcePath, sourceRoot, rule, suffix);
  const importedOutputPath = mapOutputPath(importedSourcePath, copyRoot);
  let relative = path.posix.relative(path.posix.dirname(importerOutputPath), importedOutputPath);
  if (!relative.startsWith('.')) relative = `./${relative}`;
  return `${relative}${suffix}`;
}

async function readSourceFile(filename, sourceRoot) {
  if (!isWithin(sourceRoot, filename)) throw new Error(`Relative import escapes the declared source root: ${filename}`);
  const bytes = await fs.readFile(filename);
  return { bytes, text: bytes.toString('utf8'), sha256: hash(bytes) };
}

async function buildPlan(options) {
  const sourceRoot = path.resolve(options.sourceRoot);
  const copyRoot = path.resolve(sourceRoot, options.copyPrefix);
  const targetRoot = path.resolve(workspaceRoot, options.target);
  if (!isWithin(sourceRoot, copyRoot)) throw new Error('--copy-prefix must remain inside --source-root.');
  if (!isWithin(workspaceRoot, targetRoot)) throw new Error('--target must remain inside this hoopsim-pro worktree.');
  if (sourceRoot === targetRoot || isWithin(sourceRoot, targetRoot) || isWithin(targetRoot, sourceRoot)) {
    throw new Error('Source root and target root must be separate trees.');
  }
  const copyPrefixStat = await fs.stat(copyRoot);
  if (!copyPrefixStat.isDirectory()) throw new Error(`Copy prefix is not a directory: ${copyRoot}`);

  const externalRules = options.externalModuleRoots.map(rule => ({
    ...rule,
    sourcePrefix: normalizedRelative(rule.sourcePrefix),
    browserUrlPrefix: rule.browserUrlPrefix.replace(/\/+$/, ''),
  }));
  for (const rule of externalRules) {
    const ruleRoot = path.resolve(sourceRoot, rule.sourcePrefix);
    if (!isWithin(sourceRoot, ruleRoot)) throw new Error(`External module root escapes source root: ${rule.sourcePrefix}`);
    if (isWithin(copyRoot, ruleRoot)) throw new Error(`External module root overlaps the copied runtime: ${rule.sourcePrefix}`);
    if (!rule.browserUrlPrefix.startsWith('/')) throw new Error(`External browser URL must be an absolute same-origin path: ${rule.browserUrlPrefix}`);
  }

  const sourceCache = new Map();
  const moduleRows = new Map();
  const externalRows = new Map();
  const externalEdges = new Map();
  const nonJavaScriptImports = new Map();
  const groupRows = [];
  const getFile = async filename => {
    const absolute = path.resolve(filename);
    if (!sourceCache.has(absolute)) sourceCache.set(absolute, await readSourceFile(absolute, sourceRoot));
    return sourceCache.get(absolute);
  };

  async function walkGroup(group) {
    const internal = new Set();
    const external = new Set();
    const edges = [];
    const visiting = new Set();
    async function visit(filename) {
      filename = path.resolve(filename);
      if (!isWithin(sourceRoot, filename)) throw new Error(`Relative import escapes the declared source root: ${filename}`);
      const isExternal = Boolean(getExternalRule(filename, sourceRoot, externalRules));
      if (!isExternal && !isWithin(copyRoot, filename)) {
        throw new Error(`Import is outside the copied runtime and was not explicitly externalized: ${filename}`);
      }
      const key = filename.toLowerCase();
      if (visiting.has(key)) return;
      if (isExternal ? external.has(key) : internal.has(key)) return;
      visiting.add(key);
      const source = await getFile(filename);
      const rows = findModuleSpecifiers(source.text, filename);
      const fileRows = [];
      for (const row of rows) {
        if (!row.specifier.startsWith('.')) {
          throw new Error(`Non-relative import is not part of this self-contained browser closure: ${filename} imports ${row.specifier}`);
        }
        const { pathname } = splitSpecifier(row.specifier);
        const extension = path.extname(pathname);
        if (extension && !isJavaScriptPath(pathname)) {
          nonJavaScriptImports.set(`${filename}\0${row.specifier}`, {
            fromSourcePath: filename,
            specifier: row.specifier,
            note: 'Not traversed as JavaScript; include and pin separately if the staged runtime needs this resource.',
          });
          continue;
        }
        const resolvedInfo = await resolveExistingJsFile(filename, row.specifier);
        if (!resolvedInfo) {
          if (isJavaScriptPath(pathname)) throw new Error(`Unable to resolve relative JavaScript import ${row.specifier} from ${filename}`);
          continue;
        }
        if (!isJavaScriptPath(resolvedInfo.resolved)) continue;
        if (!isWithin(sourceRoot, resolvedInfo.resolved)) {
          throw new Error(`Relative import escapes the declared source root: ${filename} -> ${resolvedInfo.resolved}`);
        }
        const targetRule = getExternalRule(resolvedInfo.resolved, sourceRoot, externalRules);
        if (!targetRule && !isWithin(copyRoot, resolvedInfo.resolved)) {
          throw new Error(`Relative import escapes the copied runtime and is not an allowed external module: ${filename} -> ${resolvedInfo.resolved}`);
        }
        const edge = {
          fromSourcePath: filename,
          specifier: row.specifier,
          resolvedSourcePath: resolvedInfo.resolved,
          kind: targetRule ? 'external-relative-js-import' : 'copied-relative-js-import',
          ...(targetRule ? { browserUrl: externalBrowserUrl(resolvedInfo.resolved, sourceRoot, targetRule, resolvedInfo.suffix) } : {}),
        };
        edges.push(edge);
        fileRows.push({ ...row, resolved: resolvedInfo.resolved, suffix: resolvedInfo.suffix, externalRule: targetRule });
        await visit(resolvedInfo.resolved);
      }
      if (isExternal) {
        external.add(key);
        externalRows.set(key, { filename, source, rule: getExternalRule(filename, sourceRoot, externalRules) });
      } else {
        internal.add(key);
        moduleRows.set(key, { filename, source, specifiers: rows, imports: fileRows });
      }
      for (const edge of edges) externalEdges.set(`${edge.fromSourcePath}\0${edge.specifier}`, edge);
      visiting.delete(key);
    }

    const resolvedEntrypoints = [];
    for (const sourcePath of group.entrypoints) {
      const absolute = path.resolve(sourceRoot, sourcePath);
      if (!isWithin(copyRoot, absolute)) throw new Error(`Declared entrypoint is outside the copied runtime: ${sourcePath}`);
      if (!isJavaScriptPath(absolute)) throw new Error(`Declared entrypoint must be a JavaScript module: ${sourcePath}`);
      await fs.access(absolute);
      await visit(absolute);
      resolvedEntrypoints.push({ sourcePath: sourceRelativePath(absolute, sourceRoot), outputPath: mapOutputPath(absolute, copyRoot) });
    }
    groupRows.push({
      name: group.name,
      entrypoints: resolvedEntrypoints,
      copiedModules: [...internal].map(key => moduleRows.get(key)).filter(Boolean).map(row => mapOutputPath(row.filename, copyRoot)).sort(),
      externalModules: [...external].map(key => externalRows.get(key)).filter(Boolean)
        .map(row => externalBrowserUrl(row.filename, sourceRoot, row.rule)).sort(),
    });
  }

  for (const group of options.groups) await walkGroup(group);

  const assetOwners = new Map();
  const assetOwner = options.groups.find(group => group.name === 'app-bridge')?.name ?? options.groups[0].name;
  for (const asset of options.assets) {
    const absolute = path.resolve(sourceRoot, asset);
    if (!isWithin(copyRoot, absolute)) throw new Error(`Declared asset is outside the copied runtime: ${asset}`);
    if (!assetOwners.has(absolute.toLowerCase())) assetOwners.set(absolute.toLowerCase(), { absolute, owners: new Set() });
    assetOwners.get(absolute.toLowerCase()).owners.add(assetOwner);
  }

  const files = new Map();
  for (const row of moduleRows.values()) {
    const outputPath = mapOutputPath(row.filename, copyRoot);
    const replacements = row.imports.map(importRow => ({
      start: importRow.start,
      end: importRow.end,
      value: moduleOutputSpecifier(importRow.resolved, outputPath, copyRoot, sourceRoot, externalRules, importRow.suffix),
    })).sort((left, right) => right.start - left.start);
    let text = row.source.text;
    for (const replacement of replacements) {
      text = `${text.slice(0, replacement.start)}${replacement.value}${text.slice(replacement.end)}`;
    }
    const outputBytes = Buffer.from(text, 'utf8');
    files.set(outputPath, {
      path: outputPath,
      kind: 'module',
      sourcePath: sourceRelativePath(row.filename, sourceRoot),
      sourceSha256: row.source.sha256,
      sha256: hash(outputBytes),
      bytes: outputBytes.length,
      outputBytes,
    });
  }
  for (const { absolute, owners } of assetOwners.values()) {
    const source = await getFile(absolute);
    const outputPath = mapOutputPath(absolute, copyRoot);
    if (files.has(outputPath)) throw new Error(`Asset output collides with a module: ${outputPath}`);
    files.set(outputPath, {
      path: outputPath,
      kind: 'asset',
      owners: [...owners].sort(),
      sourcePath: sourceRelativePath(absolute, sourceRoot),
      sourceSha256: source.sha256,
      sha256: source.sha256,
      bytes: source.bytes.length,
      outputBytes: source.bytes,
    });
  }

  const externalResources = [];
  for (const resource of DEFAULT_EXTERNAL_RESOURCES) {
    const sourcePath = path.resolve(sourceRoot, resource.sourcePath);
    if (!isWithin(sourceRoot, sourcePath)) throw new Error(`External resource escapes source root: ${resource.sourcePath}`);
    const source = await getFile(sourcePath);
    if (source.sha256 !== resource.expectedSha256) {
      throw new Error(`Pinned external resource changed: ${resource.sourcePath} expected ${resource.expectedSha256} actual ${source.sha256}`);
    }
    externalResources.push({
      sourcePath: normalizedRelative(resource.sourcePath),
      browserUrl: resource.browserUrl,
      sha256: source.sha256,
      bytes: source.bytes.length,
      purpose: resource.purpose,
    });
  }

  const externalModules = [...externalRows.values()].map(({ filename, source, rule }) => ({
    sourcePath: sourceRelativePath(filename, sourceRoot),
    sourceSha256: source.sha256,
    bytes: source.bytes.length,
    browserUrl: externalBrowserUrl(filename, sourceRoot, rule),
    sourceRoot: rule.sourcePrefix,
    owner: rule.reason,
  })).sort((left, right) => left.browserUrl.localeCompare(right.browserUrl));
  const targetRelative = posixPath(path.relative(workspaceRoot, targetRoot));
  const manifest = {
    format: MANIFEST_FORMAT,
    version: 2,
    generatedBy: SCRIPT_NAME,
    runtimePath: targetRelative,
    sourceRoot: path.basename(sourceRoot),
    sourcePathsRelativeTo: 'sourceRoot',
    copyPrefix: options.copyPrefix,
    manifestPath: MANIFEST_NAME,
    entrypointGroups: groupRows,
    files: [...files.values()].sort((left, right) => left.path.localeCompare(right.path)).map(({ outputBytes, ...row }) => row),
    externalModuleRoots: externalRules,
    externalModules,
    externalEdges: [...externalEdges.values()].map(edge => ({
      fromSourcePath: sourceRelativePath(edge.fromSourcePath, sourceRoot),
      specifier: edge.specifier,
      sourcePath: sourceRelativePath(edge.resolvedSourcePath, sourceRoot),
      browserUrl: edge.browserUrl,
    })).sort((left, right) => `${left.fromSourcePath}\0${left.specifier}`.localeCompare(`${right.fromSourcePath}\0${right.specifier}`)),
    nonJavaScriptImports: [...nonJavaScriptImports.values()].map(row => ({
      ...row,
      fromSourcePath: sourceRelativePath(row.fromSourcePath, sourceRoot),
    })).sort((left, right) => `${left.fromSourcePath}\0${left.specifier}`.localeCompare(`${right.fromSourcePath}\0${right.specifier}`)),
    externalResources,
    limitations: [
      'Only literal relative JavaScript import/export specifiers are traversed. Non-JavaScript assets must be declared explicitly.',
      'The worker URL constructed with new URL() is represented by the standalone-worker declared entrypoint group.',
      'The app bridge must pass the declared absolute scheduleUrl; the original module-relative schedule pin is not rewritten.',
      'This manifest records source and output hashes; it does not prove deployment or browser acceptance.',
      'Source paths are relative to the named project root; machine-specific absolute paths are omitted.',
    ],
  };
  const outputFiles = [...files.values()].sort((left, right) => left.path.localeCompare(right.path));
  return { sourceRoot, copyRoot, targetRoot, manifest, outputFiles };
}

async function preflightTarget(targetRoot, outputFiles, force) {
  if (force) return;
  const manifestPath = path.join(targetRoot, MANIFEST_NAME);
  let priorManifest = null;
  try {
    const text = await fs.readFile(manifestPath, 'utf8');
    priorManifest = JSON.parse(text);
    if (![MANIFEST_FORMAT, PREVIOUS_MANIFEST_FORMAT].includes(priorManifest?.format) || priorManifest?.generatedBy !== SCRIPT_NAME || !Array.isArray(priorManifest.files)) {
      throw new Error(`Target manifest is not recognized as generated by this tool: ${manifestPath}`);
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  if (priorManifest?.localAmendments?.length) {
    throw new Error('This runtime includes reviewed local amendments. Merge them into the source before staging again, or explicitly use --force to replace them.');
  }
  for (const row of outputFiles) {
    const destination = path.resolve(targetRoot, ...row.path.split('/'));
    if (!isWithin(targetRoot, destination)) throw new Error(`Output path escapes target: ${row.path}`);
    try {
      const existing = await fs.readFile(destination);
      const previous = priorManifest?.files.find(file => file.path === row.path);
      if (!previous || previous.sha256 !== hash(existing)) {
        throw new Error(`Refusing to overwrite an untracked or modified target file without --force: ${destination}`);
      }
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }
  try {
    await fs.access(manifestPath);
    if (!priorManifest) throw new Error(`Refusing to overwrite an unrecognized target manifest without --force: ${manifestPath}`);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}

async function writePlan(plan, force) {
  await preflightTarget(plan.targetRoot, plan.outputFiles, force);
  await fs.mkdir(plan.targetRoot, { recursive: true });
  for (const row of plan.outputFiles) {
    const destination = path.resolve(plan.targetRoot, ...row.path.split('/'));
    if (!isWithin(plan.targetRoot, destination)) throw new Error(`Output path escapes target: ${row.path}`);
    try {
      const existing = await fs.readFile(destination);
      if (existing.length === row.bytes && hash(existing) === row.sha256) continue;
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.writeFile(destination, row.outputBytes);
  }
  const manifestPath = path.join(plan.targetRoot, MANIFEST_NAME);
  await fs.writeFile(manifestPath, `${JSON.stringify(plan.manifest, null, 2)}\n`, 'utf8');
  return manifestPath;
}

async function collectTargetFiles(targetRoot) {
  let rootInfo;
  try {
    rootInfo = await fs.lstat(targetRoot);
  } catch (error) {
    if (error?.code === 'ENOENT') throw new Error(`Staged runtime directory is missing: ${targetRoot}`);
    throw error;
  }
  if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) {
    throw new Error(`Staged runtime target must be a regular directory: ${targetRoot}`);
  }

  const files = [];
  async function walk(directory) {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const filename = path.join(directory, entry.name);
      const info = await fs.lstat(filename);
      if (info.isSymbolicLink()) throw new Error(`Refusing symlink in staged runtime: ${filename}`);
      if (info.isDirectory()) await walk(filename);
      else if (info.isFile()) files.push(filename);
      else throw new Error(`Refusing non-regular staged entry: ${filename}`);
    }
  }
  await walk(targetRoot);
  return files.sort((left, right) => comparePaths(sourceRelativePath(left, targetRoot), sourceRelativePath(right, targetRoot)));
}

async function verifyPlan(plan) {
  const actualFiles = await collectTargetFiles(plan.targetRoot);
  const actualPaths = actualFiles.map(filename => sourceRelativePath(filename, plan.targetRoot));
  const expectedPaths = [...plan.outputFiles.map(row => row.path), MANIFEST_NAME].sort(comparePaths);
  const missing = expectedPaths.filter(filename => !actualPaths.includes(filename));
  const extra = actualPaths.filter(filename => !expectedPaths.includes(filename));
  if (missing.length || extra.length) {
    throw new Error(`Staged runtime file set differs from the current closure plan. Missing: ${missing.join(', ') || '(none)'}. Extra: ${extra.join(', ') || '(none)'}.`);
  }

  const expectedManifest = `${JSON.stringify(plan.manifest, null, 2)}\n`;
  const actualManifest = await fs.readFile(path.join(plan.targetRoot, MANIFEST_NAME), 'utf8');
  if (actualManifest !== expectedManifest) {
    throw new Error(`Staged closure manifest is stale or differs from the current plan: ${path.join(plan.targetRoot, MANIFEST_NAME)}`);
  }
  for (const row of plan.outputFiles) {
    const filename = path.resolve(plan.targetRoot, ...row.path.split('/'));
    if (!isWithin(plan.targetRoot, filename)) throw new Error(`Output path escapes target: ${row.path}`);
    const bytes = await fs.readFile(filename);
    if (bytes.length !== row.bytes || hash(bytes) !== row.sha256) {
      throw new Error(`Staged file differs from the current source closure: ${row.path}`);
    }
  }
  return { fileCount: plan.outputFiles.length, manifestBytes: Buffer.byteLength(expectedManifest, 'utf8') };
}

function printSummary(plan, mode) {
  const moduleCount = plan.manifest.files.filter(row => row.kind === 'module').length;
  const assetCount = plan.manifest.files.filter(row => row.kind === 'asset').length;
  process.stdout.write(`${mode}: ${plan.manifest.runtimePath}\n` +
    `declared groups: ${plan.manifest.entrypointGroups.map(group => `${group.name} [${group.entrypoints.map(row => row.outputPath).join(', ')}] (${group.copiedModules.length} copied modules, ${group.externalModules.length} external modules)`).join('; ')}\n` +
    `unique files: ${plan.manifest.files.length} (${moduleCount} modules, ${assetCount} assets)\n` +
    `external canonical V4 modules: ${plan.manifest.externalModules.length}\n` +
    `external module URLs: ${plan.manifest.externalModules.map(row => row.browserUrl).join(', ') || '(none)'}\n` +
    `external resources: ${plan.manifest.externalResources.length}\n` +
    `assets: ${plan.manifest.files.filter(row => row.kind === 'asset').map(row => `${row.path} (${row.sha256})`).join(', ') || '(none)'}\n` +
    `non-JavaScript imports left explicit: ${plan.manifest.nonJavaScriptImports.length}\n` +
    `manifest: ${MANIFEST_NAME}\n`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) { printHelp(); return; }
  const plan = await buildPlan(options);
  if (options.verify) {
    const result = await verifyPlan(plan);
    printSummary(plan, `verified ${result.fileCount} files + manifest (${result.manifestBytes} manifest bytes)`);
    return;
  }
  if (options.write) {
    const manifestPath = await writePlan(plan, options.force);
    printSummary(plan, `staged to ${manifestPath}`);
    return;
  }
  await preflightTarget(plan.targetRoot, plan.outputFiles, false);
  if (options.summary) printSummary(plan, 'dry-run');
  else process.stdout.write(`${JSON.stringify({ mode: 'dry-run', manifest: plan.manifest }, null, 2)}\n`);
}

main().catch(error => {
  process.stderr.write(`${error?.stack ?? error}\n`);
  process.exitCode = 1;
});
