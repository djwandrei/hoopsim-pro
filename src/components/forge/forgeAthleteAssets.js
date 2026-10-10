import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { applyForgeDunk } from '@/components/forge/forgeAthleteBinding';
import { FORGE_ATHLETE_RELEASE } from '@/components/forge/forgeAthleteRelease';
import { FORGE_POSE_RELEASE } from './forgePoseRelease.js';

export const ATHLETE_ASSET_ROOT = `${import.meta.env?.BASE_URL || '/tools/swishiq-studio/'}studio-assets/forge/athlete/`;
let modelPromise, catalogPromise;
const images = new Map();
async function read(path, binary = false) {
  const response = await fetch(ATHLETE_ASSET_ROOT + path);
  if (!response.ok) throw new Error('The athlete assets could not be loaded.');
  return binary ? response.arrayBuffer() : response.json();
}
export function loadUniformCatalog() {
  if (!catalogPromise) catalogPromise = verifiedAsset(FORGE_ATHLETE_RELEASE.catalog).then(bytes => JSON.parse(new TextDecoder().decode(bytes))).catch(error => { catalogPromise = null; throw error; });
  return catalogPromise;
}
async function verifiedAsset(item) {
  const bytes = await read(item.path, true);
  const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), byte => byte.toString(16).padStart(2, '0')).join('');
  if (digest !== item.sha256) throw new Error('The athlete assets failed their integrity check. Retry to load the matching model and pose.');
  return bytes;
}
export async function loadForgeAthlete() {
  if (!modelPromise) modelPromise = Promise.all([verifiedAsset(FORGE_ATHLETE_RELEASE.model), verifiedAsset(FORGE_ATHLETE_RELEASE.rig), verifiedAsset(FORGE_POSE_RELEASE)]).then(async ([bytes, rigBytes, poseBytes]) => {
    const rig = JSON.parse(new TextDecoder().decode(rigBytes));
    const poses = JSON.parse(new TextDecoder().decode(poseBytes));
    const gltf = await new GLTFLoader().parseAsync(bytes, ATHLETE_ASSET_ROOT);
    return { template: gltf.scene, rig, poses, fit: applyForgeDunk(gltf.scene, rig, FORGE_ATHLETE_RELEASE) };
  }).catch(error => { modelPromise = null; throw error; });
  const { template, fit, rig, poses } = await modelPromise;
  const model = clone(template);
  model.traverse(mesh => { if (mesh.isMesh) { mesh.material = mesh.material.clone(); mesh.frustumCulled = false; } });
  return { model, fit, rig, poses };
}
export async function loadUniformImages(item) {
  if (!images.has(item.id)) {
    const decode = path => path ? new Promise((resolve, reject) => {
      const image = new Image(); image.onload = () => resolve(image); image.onerror = () => reject(new Error('The uniform artwork could not be loaded.')); image.src = ATHLETE_ASSET_ROOT + path;
    }) : Promise.resolve(null);
    images.set(item.id, Promise.all([decode(item.image), decode(item.front), decode(item.back)]).then(([image, front, back]) => ({ image, front, back, layout: item.layout })).catch(error => { images.delete(item.id); throw error; }));
    if (images.size > 4) images.delete(images.keys().next().value);
  }
  return images.get(item.id);
}
