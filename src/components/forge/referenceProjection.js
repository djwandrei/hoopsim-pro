import * as THREE from 'three';
import { frameReferenceCamera } from '@/components/forge/referenceView';

// Lightweight CPU projection for the existing no-WebGL fallback. Reuse the
// vertex buffers while turning; don't rebuild the sculpt on each frame or pick.
export function createReferenceProjection(canvas, meshes, camera, figure) {
  const surfaces = meshes.map(mesh => ({ mesh, positions: mesh.geometry.attributes.position, indices: mesh.geometry.index.array, projected: Array.from({ length: mesh.geometry.attributes.position.count }, () => new THREE.Vector3()) }));
  return filled => {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.round(w * dpr), height = Math.round(h * dpr);
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
    frameReferenceCamera(camera, w, h);
    figure.updateMatrixWorld(true);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.beginPath();
    for (const { mesh, positions, indices, projected } of surfaces) {
      for (let i = 0; i < positions.count; i += 1) projected[i].fromBufferAttribute(positions, i).applyMatrix4(mesh.matrixWorld).project(camera);
      for (let i = 0; i < indices.length; i += 3) {
        const a = projected[indices[i]], b = projected[indices[i + 1]], c = projected[indices[i + 2]];
        if ((b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x) <= 0) continue;
        ctx.moveTo((a.x+1)*w/2, (1-a.y)*h/2);
        ctx.lineTo((b.x+1)*w/2, (1-b.y)*h/2);
        ctx.lineTo((c.x+1)*w/2, (1-c.y)*h/2);
        ctx.closePath();
      }
    }
    ctx.fillStyle = '#070a0e';
    ctx.shadowColor = filled ? '#b58c37' : '#71849e';
    ctx.shadowBlur = 3;
    ctx.fill();
  };
}