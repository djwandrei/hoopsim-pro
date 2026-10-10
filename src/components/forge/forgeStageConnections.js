import { Vector3 } from 'three';
import { FORGE_EQUIPMENT_CALLOUTS } from './forgeStageMapping.js';

// Sample actual skinned vertices rather than scanning the 800k mesh per frame.
export function createForgeAnchorProjector(model) {
  const targets = FORGE_EQUIPMENT_CALLOUTS.map(item => {
    const mesh = model.getObjectByName(item.element);
    const count = mesh?.geometry?.attributes.position.count || 0;
    const length = Math.min(count, 8);
    const samples = Array.from({ length }, (_, index) => Math.floor((index + .5) * count / length));
    return { key: item.skill, mesh, samples };
  });
  const point = new Vector3(), center = new Vector3();
  return camera => {
    const anchors = {};
    for (const { key, mesh, samples } of targets) {
      if (!mesh || !samples.length) continue;
      center.set(0, 0, 0);
      for (const index of samples) center.add(mesh.getVertexPosition(index, point));
      center.divideScalar(samples.length).applyMatrix4(mesh.matrixWorld).project(camera);
      anchors[key] = { x: (center.x + 1) / 2, y: (1 - center.y) / 2, visible: Math.abs(center.x) <= 1 && Math.abs(center.y) <= 1 && Math.abs(center.z) <= 1 };
    }
    return anchors;
  };
}
