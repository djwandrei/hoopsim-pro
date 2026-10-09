import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { lstat, mkdir, readdir, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST_ROOT = path.join(PROJECT_ROOT, 'dist');
const OUTPUT_STAGE = path.join('stage', 'tools', 'swishiq-studio');
const ALLOWED_TOP_FILES = ['.htaccess', 'djhc-chrome.css', 'index.html'];
const ALLOWED_TOP_DIRECTORIES = ['assets', 'djhc-runtime', 'playbook', 'studio-assets', 'swishiq-game-sim'];
const TEXT_EXTENSIONS = new Set([
  '.cjs', '.conf', '.css', '.csv', '.html', '.htaccess', '.js', '.json', '.map', '.md',
  '.mjs', '.svg', '.toml', '.txt', '.xml', '.yaml', '.yml',
]);
const FORBIDDEN_PATH_SEGMENT = /^(?:\.env(?:\..*)?|\.git|\.deploy|credentials?(?:\..*)?|secrets?(?:\..*)?|.*(?:private[-_. ]?key|access[-_. ]?token|client[-_. ]?secret).*)$/i;
const SECRET_PATTERNS = [
  /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}\b/,
  /\bwhsec_[A-Za-z0-9]{16,}\b/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bgh[pousr]_[A-Za-z0-9]{30,}\b/,
  /\bnpm_[A-Za-z0-9]{30,}\b/,
  /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\b(?:postgres(?:ql)?|mysql):\/\/[^:\s/]+:[^@\s/]{8,}@/i,
  /\b(?:SUPABASE_SERVICE_ROLE_KEY|STRIPE_SECRET_KEY|OPENAI_API_KEY|CLIENT_SECRET)\b\s*[:=]\s*["']?[A-Za-z0-9_./+=-]{24,}/i,
];
const SECRET_SCAN_OVERLAP = 1024;

function isWithin(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function comparePaths(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function toPosixPath(value) {
  return value.split(path.sep).join('/');
}

function parseOutputArgument(argv) {
  if (argv.length === 1 && argv[0] === '--help') {
    console.log('Usage: node scripts/prepare-cpanel-release.mjs --output <new absolute directory>');
    return null;
  }

  if (argv.length !== 2 || argv[0] !== '--output') {
    throw new Error('Expected --output <new absolute directory>.');
  }

  const outputArgument = argv[1];
  if (!path.isAbsolute(outputArgument)) {
    throw new Error('--output must be an absolute path.');
  }

  return path.resolve(outputArgument);
}

async function resolveNewOutputDirectory(outputPath, projectRoot, distRoot) {
  const parentPath = path.dirname(outputPath);
  const parentInfo = await lstat(parentPath).catch(() => null);
  if (!parentInfo?.isDirectory() || parentInfo.isSymbolicLink()) {
    throw new Error('The --output parent must be an existing, non-symlink directory.');
  }

  const parentReal = await realpath(parentPath);
  const canonicalOutput = path.join(parentReal, path.basename(outputPath));
  if (path.parse(canonicalOutput).root === canonicalOutput) {
    throw new Error('The filesystem root cannot be used as --output.');
  }

  const existingOutput = await lstat(canonicalOutput).catch(error => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  if (existingOutput) throw new Error(`--output already exists: ${canonicalOutput}`);

  if (isWithin(projectRoot, canonicalOutput) || isWithin(canonicalOutput, projectRoot)) {
    throw new Error('--output must be outside the application repository.');
  }
  if (isWithin(distRoot, canonicalOutput) || isWithin(canonicalOutput, distRoot)) {
    throw new Error('--output must not overlap dist.');
  }

  return canonicalOutput;
}

function assertSafePathSegments(relativePath) {
  const segments = relativePath.split(path.sep);
  for (const segment of segments) {
    if (segment.startsWith('.') || FORBIDDEN_PATH_SEGMENT.test(segment)) {
      throw new Error(`Refusing hidden or secret-like staged path: ${toPosixPath(relativePath)}`);
    }
  }
}

async function scanForSecretPatterns(sourcePath, relativePath) {
  if (relativePath !== '.htaccess' && !TEXT_EXTENSIONS.has(path.extname(relativePath).toLowerCase())) return;

  let tail = '';
  for await (const chunk of createReadStream(sourcePath)) {
    const text = tail + chunk.toString('utf8');
    if (SECRET_PATTERNS.some(pattern => pattern.test(text))) {
      throw new Error(`Refusing secret-like content in staged file: ${toPosixPath(relativePath)}`);
    }
    tail = text.slice(-SECRET_SCAN_OVERLAP);
  }
}

async function collectFiles(distRoot) {
  const collected = [];
  const allowedEntries = [
    ...ALLOWED_TOP_FILES.map(name => ({ name, kind: 'file' })),
    ...ALLOWED_TOP_DIRECTORIES.map(name => ({ name, kind: 'directory' })),
  ];

  for (const entry of allowedEntries) {
    const sourcePath = path.join(distRoot, entry.name);
    const info = await lstat(sourcePath).catch(error => {
      if (error.code === 'ENOENT') throw new Error(`Required dist entry is missing: ${entry.name}`);
      throw error;
    });
    if (info.isSymbolicLink()) throw new Error(`Refusing symlink in dist allowlist: ${entry.name}`);

    if (entry.kind === 'file') {
      if (!info.isFile()) throw new Error(`Expected a regular file in dist: ${entry.name}`);
      collected.push({ sourcePath, relativePath: entry.name, bytes: info.size });
      continue;
    }

    if (!info.isDirectory()) throw new Error(`Expected a directory in dist: ${entry.name}`);
    const rootReal = await realpath(sourcePath);
    if (!isWithin(distRoot, rootReal)) throw new Error(`Dist directory resolves outside dist: ${entry.name}`);

    async function walk(directoryPath, relativeDirectory) {
      const names = await readdir(directoryPath);
      names.sort(comparePaths);
      for (const name of names) {
        const childPath = path.join(directoryPath, name);
        const relativePath = path.join(relativeDirectory, name);
        assertSafePathSegments(relativePath);
        const childInfo = await lstat(childPath);
        if (childInfo.isSymbolicLink()) throw new Error(`Refusing symlink in dist allowlist: ${toPosixPath(relativePath)}`);
        if (childInfo.isDirectory()) {
          const childReal = await realpath(childPath);
          if (!isWithin(rootReal, childReal)) throw new Error(`Dist path resolves outside its allowlisted root: ${toPosixPath(relativePath)}`);
          await walk(childPath, relativePath);
        } else if (childInfo.isFile()) {
          collected.push({ sourcePath: childPath, relativePath, bytes: childInfo.size });
        } else {
          throw new Error(`Refusing non-regular dist entry: ${toPosixPath(relativePath)}`);
        }
      }
    }

    await walk(sourcePath, entry.name);
  }

  for (const file of collected) await scanForSecretPatterns(file.sourcePath, file.relativePath);
  collected.sort((left, right) => comparePaths(left.relativePath, right.relativePath));
  return collected;
}

async function copyAndHash(sourcePath, destinationPath) {
  const hash = createHash('sha256');
  let bytes = 0;
  const hashTransform = new Transform({
    transform(chunk, _encoding, callback) {
      bytes += chunk.length;
      hash.update(chunk);
      callback(null, chunk);
    },
  });

  await mkdir(path.dirname(destinationPath), { recursive: true });
  await pipeline(
    createReadStream(sourcePath),
    hashTransform,
    createWriteStream(destinationPath, { flags: 'wx' }),
  );
  return { bytes, sha256: hash.digest('hex') };
}

function makeManifest(paths) {
  const content = paths.length ? `${paths.join('\n')}\n` : '';
  const bytes = Buffer.byteLength(content, 'utf8');
  return {
    content,
    bytes,
    sha256: createHash('sha256').update(content, 'utf8').digest('hex'),
  };
}

async function main() {
  const outputPath = parseOutputArgument(process.argv.slice(2));
  if (outputPath === null) return;

  const projectRoot = await realpath(PROJECT_ROOT);
  const distInfo = await lstat(DIST_ROOT).catch(() => null);
  if (!distInfo?.isDirectory() || distInfo.isSymbolicLink()) {
    throw new Error('dist must be an existing, non-symlink directory.');
  }
  const distRoot = await realpath(DIST_ROOT);
  if (!isWithin(projectRoot, distRoot)) throw new Error('dist resolves outside the application repository.');

  const outputRoot = await resolveNewOutputDirectory(outputPath, projectRoot, distRoot);
  const files = await collectFiles(distRoot);
  const stageRoot = path.join(outputRoot, OUTPUT_STAGE);
  await mkdir(stageRoot, { recursive: true });

  const stagedFiles = [];
  for (const file of files) {
    const stageFilePath = path.join(stageRoot, file.relativePath);
    const copied = await copyAndHash(file.sourcePath, stageFilePath);
    if (copied.bytes !== file.bytes) {
      throw new Error(`Source size changed while staging: ${toPosixPath(file.relativePath)}`);
    }
    stagedFiles.push({
      path: `tools/swishiq-studio/${toPosixPath(file.relativePath)}`,
      bytes: copied.bytes,
      sha256: copied.sha256,
    });
  }

  const deploymentPaths = stagedFiles.map(file => file.path).sort(comparePaths);
  const httpVerificationPaths = deploymentPaths.filter(filePath => path.posix.basename(filePath) !== '.htaccess');
  const deploymentManifest = makeManifest(deploymentPaths);
  const httpVerificationManifest = makeManifest(httpVerificationPaths);

  const deploymentManifestPath = path.join(outputRoot, 'deployment-manifest.txt');
  const httpManifestPath = path.join(outputRoot, 'http-verification-manifest.txt');
  await writeFile(deploymentManifestPath, deploymentManifest.content, { flag: 'wx', encoding: 'utf8' });
  await writeFile(httpManifestPath, httpVerificationManifest.content, { flag: 'wx', encoding: 'utf8' });

  const receipt = {
    format: 'djhc-cpanel-release-stage-v1',
    createdAt: new Date().toISOString(),
    sourceDist: distRoot,
    stagePath: toPosixPath(OUTPUT_STAGE),
    deployPrefix: 'tools/swishiq-studio',
    manifests: {
      deployment: {
        path: path.basename(deploymentManifestPath),
        fileCount: deploymentPaths.length,
        bytes: deploymentManifest.bytes,
        sha256: deploymentManifest.sha256,
      },
      httpVerification: {
        path: path.basename(httpManifestPath),
        fileCount: httpVerificationPaths.length,
        bytes: httpVerificationManifest.bytes,
        sha256: httpVerificationManifest.sha256,
      },
    },
    totals: {
      fileCount: stagedFiles.length,
      bytes: stagedFiles.reduce((total, file) => total + file.bytes, 0),
    },
    files: stagedFiles,
  };
  await writeFile(path.join(outputRoot, 'receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`, {
    flag: 'wx',
    encoding: 'utf8',
  });

  console.log(`Staged ${stagedFiles.length} files (${receipt.totals.bytes} bytes) under ${path.join(outputRoot, OUTPUT_STAGE)}.`);
  console.log(`Deployment manifest: ${deploymentPaths.length} paths; HTTP verification manifest: ${httpVerificationPaths.length} paths.`);
  console.log(`Receipt: ${path.join(outputRoot, 'receipt.json')}`);
}

main().catch(error => {
  console.error(`cPanel release staging failed: ${error.message}`);
  process.exitCode = 1;
});
