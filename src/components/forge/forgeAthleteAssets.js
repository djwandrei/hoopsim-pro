import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';

export const ATHLETE_ASSET_ROOT = `${import.meta.env.BASE_URL}studio-assets/forge/athlete/`;
const MODEL_SHA = '85a6251a2adc36c3992845076fd6b2464f88ad6a4ad358a8176098b08e61b2b7';
let modelPromise, catalogPromise;
const images = new Map();
async function read(path, binary = false) {
  const response = await fetch(ATHLETE_ASSET_ROOT + path);
  if (!response.ok) throw new Error('The athlete assets could not be loaded.');
  return binary ? response.arrayBuffer() : response.json();
}
export function loadUniformCatalog() {
  if (!catalogPromise) catalogPromise = read('uniform-catalog.json').catch(error => { catalogPromise = null; throw error; });
  return catalogPromise;
}
function applyDunk(root, rig) {
  const axis = new THREE.Vector3(), turn = new THREE.Quaternion();
  rig.bones.forEach((bone, index) => {
    const node = root.getObjectByName(bone.name);
    if (!node) throw new Error(`The athlete joint ${bone.name} is missing.`);
    node.position.add(new THREE.Vector3(...rig.pose.translations[index]));
    node.quaternion.identity();
    bone.axes.forEach((direction, slot) => node.quaternion.multiply(turn.setFromAxisAngle(axis.fromArray(direction), THREE.MathUtils.degToRad(rig.pose.rotations[index][slot]))));
  });
  root.updateMatrixWorld(true);
  root.traverse(mesh => { if (mesh.isSkinnedMesh) mesh.skeleton.update(); });
  const box = new THREE.Box3().setFromObject(root, true), center = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
  root.position.sub(center);
  root.updateMatrixWorld(true);
  return { halfY: size.y * .57, sweep: Math.hypot(size.x, size.z) * .57 };
}
export async function loadForgeAthlete() {
  if (!modelPromise) modelPromise = Promise.all([read('basketball-athlete-outfit.glb', true), read('dunk-rig.json')]).then(async ([bytes, rig]) => {
    const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), byte => byte.toString(16).padStart(2, '0')).join('');
    if (digest !== MODEL_SHA) throw new Error('The athlete model failed its integrity check.');
    const gltf = await new GLTFLoader().parseAsync(bytes, ATHLETE_ASSET_ROOT);
    return { template: gltf.scene, fit: applyDunk(gltf.scene, rig) };
  }).catch(error => { modelPromise = null; throw error; });
  const { template, fit } = await modelPromise;
  const model = clone(template);
  model.traverse(mesh => { if (mesh.isMesh) { mesh.material = mesh.material.clone(); mesh.frustumCulled = false; } });
  return { model, fit };
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