import * as THREE from 'three';
import { frameReferenceCamera, REFERENCE_TURN_SPEED, REFERENCE_FAST_TURN_SPEED } from '@/components/forge/referenceView';
import { createForgeAnchorProjector } from '@/components/forge/forgeStageConnections';
import { createForgePoseCycle } from './forgePoseCycle.js';
import { FORGE_ATHLETE_RELEASE } from './forgeAthleteRelease.js';

export default function forgeAthleteScene(host, stateRef) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.1;
  renderer.domElement.style.cssText = 'display:block;width:100%;height:100%'; host.appendChild(renderer.domElement);
  const scene = new THREE.Scene(), figure = new THREE.Group(); scene.add(figure);
  const camera = new THREE.OrthographicCamera(-1.5, 1.5, 1.5, -1.5, .1, 60);
  camera.position.set(-8.09, .205, 5.93); camera.lookAt(0, 0, 0);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x283449, 1.5));
  const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(-3, 5, 4); scene.add(key);
  const rim = new THREE.DirectionalLight(0xa4bbff, 1.1); rim.position.set(3, 2, -4); scene.add(rim);
  let fit = null, frame = null, projector = null, poseCycle = null, poseId = '', lastProjection = 0, disposed = false, pageVisible = !document.hidden, inView = true, contextLost = false;
  const canRender = () => !disposed && pageVisible && inView && !contextLost;
  const suspend = () => { if (frame !== null) cancelAnimationFrame(frame); frame = null; };
  const clock = new THREE.Clock(), reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  figure.rotation.y = stateRef.current.viewAngle || 0;
  const animate = () => {
    frame = null;
    if (!canRender()) return;
    const dt = Math.min(clock.getDelta(), .05), state = stateRef.current;
    if (!reduced && state.rotating !== false) {
      const delta = dt * (state.spinning ? REFERENCE_FAST_TURN_SPEED : REFERENCE_TURN_SPEED);
      figure.rotation.y += delta;
      poseCycle?.advance(delta, dt);
      if (poseCycle && poseCycle.id !== poseId) { poseId = poseCycle.id; state.onPose?.(poseCycle.label); }
    }
    renderer.render(scene, camera);
    const now = performance.now();
    if (projector && state.onProject && now - lastProjection > 1000 / 30) { state.onProject(projector(camera)); lastProjection = now; }
    frame = requestAnimationFrame(animate);
  };
  const wake = () => { if (frame === null && canRender()) frame = requestAnimationFrame(animate); };
  const resize = () => {
    if (!host.clientWidth || !host.clientHeight) return;
    renderer.setSize(host.clientWidth, host.clientHeight, false);
    frameReferenceCamera(camera, host.clientWidth, host.clientHeight, fit);
    wake();
  };
  const observer = new ResizeObserver(resize); observer.observe(host); resize();
  const intersectionObserver = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(entries => {
    inView = entries.some(entry => entry.isIntersecting);
    if (inView) wake(); else suspend();
  }, { rootMargin: '120px' });
  intersectionObserver?.observe(host);
  const onVisibilityChange = () => { pageVisible = !document.hidden; if (pageVisible) wake(); else suspend(); };
  const onContextLost = event => { event.preventDefault(); contextLost = true; suspend(); };
  const onContextRestored = () => { contextLost = false; resize(); wake(); };
  document.addEventListener('visibilitychange', onVisibilityChange);
  renderer.domElement.addEventListener('webglcontextlost', onContextLost, false);
  renderer.domElement.addEventListener('webglcontextrestored', onContextRestored, false);
  wake();
  return {
    attach(model, bounds, rig, poses) {
      poseCycle = createForgePoseCycle(model, rig, poses, FORGE_ATHLETE_RELEASE);
      figure.add(model);
      if (stateRef.current.onProject) projector = createForgeAnchorProjector(model);
      fit = poseCycle.fit || bounds; poseId = poseCycle.id; stateRef.current.onPose?.(poseCycle.label);
      resize(); wake();
    },
    dispose() {
      disposed = true; suspend(); observer.disconnect(); intersectionObserver?.disconnect();
      document.removeEventListener('visibilitychange', onVisibilityChange);
      renderer.domElement.removeEventListener('webglcontextlost', onContextLost, false);
      renderer.domElement.removeEventListener('webglcontextrestored', onContextRestored, false);
      renderer.dispose(); renderer.domElement.remove();
    },
  };
}
