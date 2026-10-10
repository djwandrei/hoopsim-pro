import assert from 'node:assert/strict';
import { build } from 'vite';
import { mkdir, writeFile, readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FORGE_EVIDENCE_RELEASE } from '../src/components/forge/forgeEvidenceRelease.js';
import { FORGE_POSE_RELEASE } from '../src/components/forge/forgePoseRelease.js';

// Compile the existing frontend into an isolated local review directory. This
// does not run unrelated public runtime generators, stage cPanel files or ZIPs.
const project = fileURLToPath(new URL('..', import.meta.url));
const outDir = path.resolve(process.argv[2] || 'C:/Users/djwan/Documents/Codex/2026-10-10/forge-athlete-800k-local-build');
assert.ok(!outDir.startsWith(project + path.sep) && !project.startsWith(outDir + path.sep));
await mkdir(outDir, { recursive: true });
const outputs = await build({ root: project, logLevel: 'warn', build: { outDir, emptyOutDir: false, copyPublicDir: false } });
const chunks = (Array.isArray(outputs) ? outputs : [outputs]).flatMap(output => output.output);
const forge = chunks.find(chunk => chunk.type === 'chunk' && chunk.moduleIds.some(id => id.endsWith('/src/pages/ForgeLab.jsx')));
assert.ok(forge, 'The actual Forge route must be compiled');
const generated = chunks.filter(chunk => chunk.type === 'chunk').map(chunk => chunk.code).join('\n');
const releaseText = await readFile(path.join(project, 'src/components/forge/forgeAthleteRelease.js'), 'utf8');
const release = JSON.parse(releaseText.slice(releaseText.indexOf('=') + 1).trim().replace(/;$/, ''));
for (const item of [release.model, release.rig, release.catalog]) assert.ok(generated.includes(item.path));
assert.ok(generated.includes(FORGE_POSE_RELEASE.path));
const poseBytes = await readFile(path.join(project, 'public/studio-assets/forge/athlete', FORGE_POSE_RELEASE.path));
assert.equal(poseBytes.length, FORGE_POSE_RELEASE.bytes);
assert.equal(createHash('sha256').update(poseBytes).digest('hex'), FORGE_POSE_RELEASE.sha256);
assert.ok(generated.includes('Wheel Draft') && generated.includes('Pick & Spin'));
for (const label of ['Shades of', 'Perimeter Defense', 'Clutch', 'Guard-weighted OVR', 'Big-weighted OVR']) assert.ok(generated.includes(label), `The Forge build must include ${label}`);
const ratingAssets = [];
for (const pin of FORGE_EVIDENCE_RELEASE) {
  assert.ok(generated.includes(pin.sha256), 'Each selected-season evidence pin must be compiled');
  const bytes = await readFile(path.join(project, 'public', pin.url));
  assert.equal(bytes.length, pin.bytes);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), pin.sha256);
  ratingAssets.push(pin.url.slice(1));
}
const files = [];
for (const chunk of chunks) {
  const bytes = await readFile(path.join(outDir, chunk.fileName));
  files.push({ path: chunk.fileName, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
}
await stat(path.join(outDir, 'index.html'));
const report = { status: 'passed', outputDirectory: outDir, compiledForgeChunk: forge.fileName, compiledFiles: files.length,
  currentAthleteRelease: release.version, publicFilesCopied: false, requiredPublicAssets: [release.model.path, release.rig.path, release.catalog.path, FORGE_POSE_RELEASE.path], requiredRatingAssets: ratingAssets,
  scope: 'Isolated production frontend compilation; local Vite preview serves the source public assets', files, deployed: false, archivesRebuilt: false };
await writeFile(path.join(project, 'docs/forge-athlete-800k/build-validation.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ status: report.status, outputDirectory: outDir, compiledForgeChunk: forge.fileName, compiledFiles: files.length, deployed: false }));
