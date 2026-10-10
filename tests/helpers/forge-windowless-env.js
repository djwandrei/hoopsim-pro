import { register, createRequire } from 'node:module';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

register('./forge-source-loader.mjs', import.meta.url);
export const project = fileURLToPath(new URL('../../', import.meta.url));
export const assetRoot = path.join(project, 'public/studio-assets/forge/athlete');
const require = createRequire(import.meta.url);
const canvas = require(require.resolve('@napi-rs/canvas', { paths: [project, 'C:/Users/djwan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules'] }));
export const digest = bytes => createHash('sha256').update(bytes).digest('hex');
export function windowlessEnvironment() {
  const original = { fetch: globalThis.fetch, self: globalThis.self, ProgressEvent: globalThis.ProgressEvent, createImageBitmap: globalThis.createImageBitmap, Image: globalThis.Image, document: globalThis.document };
  const requests = [], fail = new Set(); let slow = '';
  globalThis.self = globalThis;
  globalThis.ProgressEvent = class { constructor(type, data) { this.type = type; Object.assign(this, data); } };
  globalThis.createImageBitmap = async blob => canvas.loadImage(Buffer.from(await blob.arrayBuffer()));
  globalThis.document = { createElement: type => { if (type !== 'canvas') throw new Error(`Unexpected windowless element ${type}`); return canvas.createCanvas(1024, 1024); } };
  globalThis.Image = class extends canvas.Image {
    set src(url) {
      const file = path.join(assetRoot, String(url).split('studio-assets/forge/athlete/')[1]);
      void new Promise(resolve => setTimeout(resolve, slow && file.includes(slow) ? 30 : 0)).then(() => readFile(file)).then(bytes => { super.src = bytes; }).catch(error => this.onerror?.(error));
    }
  };
  globalThis.fetch = async input => {
    const url = String(input);
    if (!url.includes('studio-assets/forge/athlete/')) return original.fetch(input);
    const relative = url.split('studio-assets/forge/athlete/')[1]; requests.push(relative);
    const bytes = await readFile(path.join(assetRoot, relative));
    if (fail.has(relative)) bytes[bytes.length - 1] ^= 1;
    return new Response(bytes, { status: 200 });
  };
  return { requests, corrupt: name => fail.add(name), recover: name => fail.delete(name), slowImages: value => { slow = value; }, restore() { Object.assign(globalThis, original); } };
}

// Save actual runtime matrices, material choices and atlases for a CPU visual
// review. This exercises no browser, app window or mock WebGL renderer.
export async function saveRuntimeReview(model, label, directory) {
  await mkdir(directory, { recursive: true });
  model.updateMatrixWorld(true);
  const meshes = [];
  model.traverse(mesh => {
    if (!mesh.isMesh) return;
    if (mesh.isSkinnedMesh) mesh.skeleton.update();
    const material = mesh.material;
    const record = { name: material.name || mesh.geometry.name, geometryName: mesh.userData.name || mesh.name,
      visible: mesh.visible, color: material.color.toArray(), matrixWorld: mesh.matrixWorld.toArray(),
      silhouette: material.customProgramCacheKey() === 'forge-reference-silhouette-v2' };
    if (mesh.morphTargetInfluences) record.morphTargetInfluences = [...mesh.morphTargetInfluences];
    if (mesh.userData.forgeAccessory) {
      const geometry = mesh.geometry;
      record.geometryData = Object.fromEntries(['position', 'normal', 'skinIndex', 'skinWeight'].map(key => [key, Array.from(geometry.attributes[key].array)]));
    }
    if (mesh.isSkinnedMesh) Object.assign(record, { bindMatrix: mesh.bindMatrix.toArray(), bindMatrixInverse: mesh.bindMatrixInverse.toArray(), boneMatrices: Array.from(mesh.skeleton.boneMatrices) });
    if (material.map) {
      const image = material.map.image, surface = canvas.createCanvas(image.width, image.height);
      surface.getContext('2d').drawImage(image, 0, 0); record.texture = `${label}-${mesh.name}.png`;
      record.textureBytes = surface.toBuffer('image/png');
    }
    meshes.push(record);
  });
  for (const item of meshes) if (item.textureBytes) { await writeFile(path.join(directory, item.texture), item.textureBytes); delete item.textureBytes; }
  await writeFile(path.join(directory, label + '.json'), JSON.stringify({ label, meshes }, null, 2) + '\n');
}
