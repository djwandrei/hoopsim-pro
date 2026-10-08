import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// The authored dunk-pose silhouette (450k triangles: one welded body plus one
// separate basketball, single mesh primitive) drives the composite Forge
// figure. The GLB is a single draw call, so the loader splits it at runtime:
// connected components separate the ball, and vertical anatomy bands with a
// lateral split assign body triangles to the nine forge segments so per-
// segment forge lighting keeps working on the authored geometry. The heavy
// result is cached per session and shared by every figure on the page.

const REFERENCE_MODEL_URL = `${import.meta.env.BASE_URL}studio-assets/forge/basketball-dunk-silhouette.glb`;

const SEGMENT_KEYS = ['shin-l', 'shin-r', 'thigh-l', 'thigh-r', 'shorts', 'torso', 'arm-l', 'arm-r', 'head'];

let partsPromise = null;

export function loadReferenceFigureParts() {
  if (!partsPromise) {
    partsPromise = buildParts().catch(error => {
      partsPromise = null;
      throw error;
    });
  }
  return partsPromise;
}

async function buildParts() {
  const response = await fetch(REFERENCE_MODEL_URL);
  if (!response.ok) throw new Error('Reference model is unavailable.');
  const buffer = await response.arrayBuffer();
  const gltf = await new Promise((resolve, reject) => new GLTFLoader().parse(buffer, '', resolve, reject));
  let source = null;
  gltf.scene.traverse(object => { if (!source && object.isMesh) source = object; });
  if (!source || !source.geometry || !source.geometry.index) throw new Error('Reference model has no indexed mesh.');

  const geometry = source.geometry;
  const index = geometry.index.array;
  const pos = geometry.attributes.position.array;
  const positionAttr = geometry.attributes.position;
  const normalAttr = geometry.attributes.normal;
  const vertexCount = positionAttr.count;
  const triCount = index.length / 3;

  // Weld-aware connected components (union-find over shared vertices): the
  // mesh holds two closed constituents — the body and the ball — and the ball
  // is the small one.
  const parent = new Uint32Array(vertexCount);
  for (let i = 0; i < vertexCount; i += 1) parent[i] = i;
  const find = node => { while (parent[node] !== node) { parent[node] = parent[parent[node]]; node = parent[node]; } return node; };
  for (let t = 0; t < triCount; t += 1) {
    const a = index[t * 3], b = index[t * 3 + 1], c = index[t * 3 + 2];
    let ra = find(a), rb = find(b);
    if (ra !== rb) parent[ra] = rb;
    rb = find(c); ra = find(b);
    if (ra !== rb) parent[ra] = rb;
  }
  const rootOf = new Uint32Array(vertexCount);
  const sizeByRoot = new Map();
  for (let i = 0; i < vertexCount; i += 1) {
    const root = find(i);
    rootOf[i] = root;
    sizeByRoot.set(root, (sizeByRoot.get(root) || 0) + 1);
  }
  const components = [...sizeByRoot.entries()].sort((a, b) => a[1] - b[1]);
  if (components.length < 2) throw new Error('Reference model components are unexpected.');
  const ballRoot = components[0][0];

  const bodyTris = [], ballTris = [];
  for (let t = 0; t < triCount; t += 1) {
    const i0 = index[t * 3], i1 = index[t * 3 + 1], i2 = index[t * 3 + 2];
    if (rootOf[i0] === ballRoot) ballTris.push(i0, i1, i2);
    else bodyTris.push(i0, i1, i2);
  }
  const ballBox = boxOfTris(ballTris, pos);
  const ballDiameter = Math.max(...ballBox.getSize(new THREE.Vector3()).toArray());
  if (!ballTris.length || ballDiameter < 0.16 || ballDiameter > 0.34) {
    throw new Error('Reference ball geometry is unexpected.');
  }

  // Anatomy bands from the body's vertex histogram: a vertical density gap
  // marks each joint line, so the boundaries follow the authored pose instead
  // of hard-coded heights.
  const bodyBox = boxOfTris(bodyTris, pos);
  const H = bodyBox.max.y;
  const BINS = 120;
  const counts = new Float64Array(BINS + 1);
  for (let t = 0; t < bodyTris.length; t += 1) {
    const y = pos[bodyTris[t] * 3 + 1];
    const bin = Math.max(0, Math.min(BINS, Math.round((y / H) * BINS)));
    counts[bin] += 1;
  }
  const pickMinFrac = (fracCenter, fracWindow, fallbackFrac) => {
    const start = Math.max(0, Math.round((fracCenter - fracWindow) * BINS));
    const end = Math.min(BINS, Math.round((fracCenter + fracWindow) * BINS));
    let best = -1, bestCount = Infinity;
    for (let bin = start; bin <= end; bin += 1) {
      if (counts[bin] < bestCount) { bestCount = counts[bin]; best = bin; }
    }
    return best >= 0 ? best / BINS : fallbackFrac;
  };
  const kneeY = pickMinFrac(0.27, 0.08, 0.27) * H;   // knee joint gap
  const hemY = 0.42 * H;                              // garment hem, fixed
  const waistY = pickMinFrac(0.54, 0.07, 0.54) * H;   // waist pinch above shorts
  const neckY = pickMinFrac(0.895, 0.055, 0.895) * H; // neck gap under the head
  const headX = 0.11 * H;
  const armX = 0.125 * H;

  const segments = new Map(SEGMENT_KEYS.map(key => [key, []]));
  const keyFor = (cy, cx) => {
    if (cy > neckY && Math.abs(cx) <= headX) return 'head';
    if (Math.abs(cx) > armX && cy > kneeY) return cx > 0 ? 'arm-l' : 'arm-r';
    if (cy <= kneeY) return cx > 0 ? 'shin-l' : 'shin-r';
    if (cy <= hemY) return cx > 0 ? 'thigh-l' : 'thigh-r';
    if (cy <= waistY) return 'shorts';
    return 'torso';
  };
  for (let t = 0; t < bodyTris.length; t += 3) {
    const i0 = bodyTris[t], i1 = bodyTris[t + 1], i2 = bodyTris[t + 2];
    const cx = (pos[i0 * 3] + pos[i1 * 3] + pos[i2 * 3]) / 3;
    const cy = (pos[i0 * 3 + 1] + pos[i1 * 3 + 1] + pos[i2 * 3 + 1]) / 3;
    segments.get(keyFor(cy, cx)).push(i0, i1, i2);
  }

  const withSharedAttributes = tris => {
    const part = new THREE.BufferGeometry();
    part.setAttribute('position', positionAttr);
    if (normalAttr) part.setAttribute('normal', normalAttr);
    part.setIndex(new THREE.BufferAttribute(new Uint32Array(tris), 1));
    return part;
  };
  const segmentGeometries = [];
  for (const key of SEGMENT_KEYS) {
    const tris = segments.get(key);
    if (tris.length) segmentGeometries.push({ key, geometry: withSharedAttributes(tris) });
  }
  const ballGeometry = withSharedAttributes(ballTris);

  // Camera fit: vertical body span plus the full sweep radius the rotating
  // figure covers around its ground-pivot axis.
  let sweep = 0;
  for (let t = 0; t < triCount; t += 1) {
    const i = index[t * 3];
    const x = pos[i * 3], z = pos[i * 3 + 2];
    const radius = Math.sqrt(x * x + z * z);
    if (radius > sweep) sweep = radius;
  }
  const center = bodyBox.getCenter(new THREE.Vector3());
  const ballCenter = ballBox.getCenter(new THREE.Vector3());

  return {
    segmentGeometries,
    ballGeometry,
    ballCenter,
    ballDiameter,
    center,
    halfY: 0.62 * H,
    sweep,
  };
}

function boxOfTris(tris, pos) {
  const box = new THREE.Box3();
  const vertex = new THREE.Vector3();
  for (let t = 0; t < tris.length; t += 3) {
    for (let corner = 0; corner < 3; corner += 1) {
      const i = tris[t + corner];
      vertex.set(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
      box.expandByPoint(vertex);
    }
  }
  return box;
}