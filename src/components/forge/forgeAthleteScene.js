import * as THREE from 'three';
import { frameReferenceCamera, REFERENCE_TURN_SPEED, REFERENCE_FAST_TURN_SPEED } from '@/components/forge/referenceView';

export default function forgeAthleteScene(host, stateRef) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.1;
  renderer.domElement.style.cssText = 'display:block;width:100%;height:100%'; host.appendChild(renderer.domElement);
  const scene = new THREE.Scene(), figure = new THREE.Group(); scene.add(figure);
  const camera = new THREE.OrthographicCamera(-1.5, 1.5, 1.5, -1.5, .1, 60);
  camera.position.set(-8.09, .205, 5.93); camera.lookAt(0, 0, 0);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x283449, 1.5));
  const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(-3, 5, 4); scene.add(key);
  const rim = new THREE.DirectionalLight(0xa4bbff, 1.1); rim.position.set(3, 2, -4); scene.add(rim);
  let fit = null, frame, disposed = false;
  const resize = () => { if (!host.clientWidth || !host.clientHeight) return; renderer.setSize(host.clientWidth, host.clientHeight, false); frameReferenceCamera(camera, host.clientWidth, host.clientHeight, fit); };
  const observer = new ResizeObserver(resize); observer.observe(host); resize();
  const clock = new THREE.Clock(), reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  figure.rotation.y = stateRef.current.viewAngle || 0;
  const animate = () => {
    if (disposed) return;
    frame = requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), .05), state = stateRef.current;
    if (!reduced && state.rotating !== false) figure.rotation.y += dt * (state.spinning ? REFERENCE_FAST_TURN_SPEED : REFERENCE_TURN_SPEED);
    renderer.render(scene, camera);
  }; animate();
  return {
    attach(model, bounds) { figure.add(model); fit = bounds; resize(); },
    dispose() { disposed = true; cancelAnimationFrame(frame); observer.disconnect(); renderer.dispose(); renderer.domElement.remove(); },
  };
}