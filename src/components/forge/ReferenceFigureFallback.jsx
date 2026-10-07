import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { buildReferenceSculpt } from '@/components/forge/referenceSculpt';
import { createReferenceProjection } from '@/components/forge/referenceProjection';
import { REFERENCE_TURN_SPEED, REFERENCE_FAST_TURN_SPEED } from '@/components/forge/referenceView';

// Without WebGL, turn and project the same 3D geometry at a modest frame rate.
export default function ReferenceFigureFallback({ filled, total, spinning = false, rotating = true, viewAngle = 0, className }) {
  const ref = useRef(null), drawRef = useRef(null), stateRef = useRef({ filled, spinning, rotating });
  stateRef.current = { filled, spinning, rotating };
  useEffect(() => {
    const canvas = ref.current, material = new THREE.MeshBasicMaterial();
    const meshes = [], record = () => ({ mat: material });
    const { ball } = buildReferenceSculpt({ addMesh: (_key, mesh) => { if (!meshes.includes(mesh)) meshes.push(mesh); }, goldRec: record, deepRec: record });
    const basketball = new THREE.Mesh(new THREE.SphereGeometry(.175, 24, 18), material);
    basketball.position.set(...ball); meshes.push(basketball);
    const figure = new THREE.Group(); figure.rotation.y = viewAngle; meshes.forEach(mesh => figure.add(mesh));
    const camera = new THREE.OrthographicCamera(-1.48, 1.48, 1.48, -1.48, .1, 60);
    camera.position.set(-6.8, 1.65, 4.8); camera.lookAt(-.08, 1.48, -.13); camera.updateMatrixWorld();
    const draw = createReferenceProjection(canvas, meshes, camera, figure);
    drawRef.current = () => draw(stateRef.current.filled);
    const observer = new ResizeObserver(() => drawRef.current()); observer.observe(canvas);
    drawRef.current();
    let frame, lastTime, lastPaint = -Infinity;
    const animate = time => {
      frame = requestAnimationFrame(animate);
      if (lastTime != null && stateRef.current.rotating) figure.rotation.y += Math.min((time - lastTime) / 1000, .05) * (stateRef.current.spinning ? REFERENCE_FAST_TURN_SPEED : REFERENCE_TURN_SPEED);
      lastTime = time;
      if (time - lastPaint < 1000 / 15) return;
      drawRef.current(); lastPaint = time;
    };
    if (!window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) frame = requestAnimationFrame(animate);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); drawRef.current = null; meshes.forEach(mesh => mesh.geometry.dispose()); material.dispose(); };
  }, [viewAngle]);
  useEffect(() => { drawRef.current?.(); }, [filled]);
  return <canvas ref={ref} role="img" aria-label={`Reference dunk silhouette, ${filled} of ${total} skills`} className={`h-full w-full ${className}`} />;
}