import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { buildReferenceSculpt } from '@/components/forge/referenceSculpt';

// Without WebGL, project the SAME 3D geometry, not a different stick figure.
export default function ReferenceFigureFallback({ filled, total, className }) {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current, material = new THREE.MeshBasicMaterial();
    const meshes = [], record = () => ({ mat: material });
    const { ball } = buildReferenceSculpt({ addMesh: (_key, mesh) => meshes.push(mesh), goldRec: record, deepRec: record });
    const basketball = new THREE.Mesh(new THREE.SphereGeometry(.175, 24, 18), material);
    basketball.position.set(...ball);
    meshes.push(basketball);
    const camera = new THREE.OrthographicCamera(-1.48, 1.48, 1.48, -1.48, .1, 60);
    camera.position.set(-4.3, 1.65, 6.6);
    camera.lookAt(-.08, 1.48, -.13);
    camera.updateMatrixWorld();
    const draw = () => {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (!w || !h) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = w * dpr; canvas.height = h * dpr;
      camera.left = -1.48 * w / h; camera.right = 1.48 * w / h; camera.updateProjectionMatrix();
      const ctx = canvas.getContext('2d'); ctx.scale(dpr, dpr); ctx.beginPath();
      for (const mesh of meshes) {
        mesh.updateMatrixWorld();
        const p = mesh.geometry.attributes.position, ids = mesh.geometry.index.array;
        const projected = Array.from({ length: p.count }, (_, i) => new THREE.Vector3().fromBufferAttribute(p, i).applyMatrix4(mesh.matrixWorld).project(camera));
        for (let i = 0; i < ids.length; i += 3) {
          const [a,b,c] = [projected[ids[i]],projected[ids[i+1]],projected[ids[i+2]]];
          if ((b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x) <= 0) continue;
          ctx.moveTo((a.x+1)*w/2,(1-a.y)*h/2); ctx.lineTo((b.x+1)*w/2,(1-b.y)*h/2); ctx.lineTo((c.x+1)*w/2,(1-c.y)*h/2); ctx.closePath();
        }
      }
      ctx.fillStyle = '#070a0e'; ctx.shadowColor = filled ? '#b58c37' : '#71849e'; ctx.shadowBlur = 3; ctx.fill();
    };
    const observer = new ResizeObserver(draw); observer.observe(canvas); draw();
    return () => { observer.disconnect(); meshes.forEach(mesh => mesh.geometry.dispose()); material.dispose(); };
  }, [filled]);
  return <canvas ref={ref} role="img" aria-label={`Reference dunk silhouette, ${filled} of ${total} skills`} className={`h-full w-full ${className}`} />;
}