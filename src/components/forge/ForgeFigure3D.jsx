import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

// Real-time 3D player figure rendered with three.js: a sculpted statue built
// from capsule limbs, spherical joints and elliptical torso volumes standing
// on a slowly rotating display pedestal. Physically-lit molten-gold materials
// (metalness + emissive glow) with a warm key light, cool rim light, soft fill
// and live cast shadows onto the forge floor. Every locked skill lights its
// segment — cold brushed steel at zero picks, molten gold with an emissive
// flash per lock, ember particles, an igniting basketball and a rotating halo
// ring once the composite is complete. Shared by the ForgeStage center art and
// the ForgeBuildWheel hub; falls back to a static silhouette when WebGL is
// unavailable. Props stay identical to the previous SVG model.

const GOLD = new THREE.Color('#E9B949');
const GOLD_DEEP = new THREE.Color('#B4761B');
const GOLD_RIM = new THREE.Color('#FFE9AE');
const STEEL = new THREE.Color('#4A5872');
const STEEL_DARK = new THREE.Color('#39455E');
const BALL_HIDE = new THREE.Color('#3A4763');
const BALL_LIT = new THREE.Color('#D2571E');

// Skeleton landmarks: x right, y up, z toward the viewer. A relaxed athletic
// stance — soft knee bend, left arm low and slightly across, right arm raised
// holding the ball — reads cleanly from every rotation angle.
// Heroic statue proportions (~7.5 heads tall): broad shoulders, deep chest,
// tapered waist, long legs. The right arm is a true shooting pose — ball
// resting on the hand directly above the wrist.
const P = {
  neckA: [0, 2.24, 0.02], neckB: [0, 2.02, 0.02],
  head: [0, 2.4, 0.02],
  shoulderL: [-0.4, 1.97, 0], shoulderR: [0.4, 1.97, 0],
  elbowL: [-0.53, 1.6, 0.04], elbowR: [0.55, 1.72, 0.16],
  wristL: [-0.44, 1.24, 0.1], wristR: [0.62, 2.02, 0.42],
  hipL: [-0.15, 1.18, 0], hipR: [0.15, 1.18, 0],
  kneeL: [-0.19, 0.62, 0.05], kneeR: [0.19, 0.62, -0.04],
  ankleL: [-0.21, 0.16, 0], ankleR: [0.22, 0.16, -0.09],
  ball: [0.66, 2.24, 0.5],
};

// Segment order drives the forge state: shins, thighs, shorts, torso, arms,
// then the head as the ninth. The ball is segment 10 and only ignites on
// completion.
const SEGMENT_ORDER = ['shin-l', 'shin-r', 'thigh-l', 'thigh-r', 'shorts', 'torso', 'arm-l', 'arm-r', 'head'];

// Capsule spanning exactly from a to b (round caps included), oriented along
// the joint direction.
function capsuleBetween(a, b, r, material) {
  const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b);
  const dir = end.clone().sub(start);
  const length = dir.length();
  const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(r, Math.max(0.02, length - r * 1.1), 7, 18), material);
  mesh.position.copy(start).add(end).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  mesh.castShadow = true;
  return mesh;
}

function sphereAt(p, r, material) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 18), material);
  mesh.position.set(...p);
  mesh.castShadow = true;
  return mesh;
}

// Tapered limb segment: cylinder from a (radius rA) to b (radius rB) — reads
// as a real muscle limb rather than a constant-width tube.
function limbBetween(a, b, rA, rB, material) {
  const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b);
  const dir = end.clone().sub(start);
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rB, rA, Math.max(0.02, dir.length()), 20, 1), material);
  mesh.position.copy(start).add(end).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  mesh.castShadow = true;
  return mesh;
}

// Lathe-turned torso volumes: a continuous revolved profile gives the smooth
// athletic silhouette (shoulders → chest → waist taper → hips) that stacked
// capsules can't. Elliptical cross-section via z-scale.
const SLEEVE_ELLIPSE = 0.72;
function latheMesh(points, material) {
  const mesh = new THREE.Mesh(new THREE.LatheGeometry(points.map(([x, y]) => new THREE.Vector2(x, y)), 28), material);
  mesh.scale.z = SLEEVE_ELLIPSE;
  mesh.castShadow = true;
  return mesh;
}
// Jersey: waist seam up over the pec shelf, shoulder slope and trapezius
// into the collar. Shorts: pelvis wedge from the crotch to the waistband.
const JERSEY_PROFILE = [
  [0.185, 1.3], [0.205, 1.36], [0.225, 1.44], [0.265, 1.56],
  [0.3, 1.7], [0.31, 1.8], [0.27, 1.91], [0.19, 1.985], [0.105, 2.05],
];
const SHORTS_PROFILE = [
  [0.02, 1.05], [0.15, 1.08], [0.235, 1.16], [0.24, 1.24], [0.215, 1.31],
];

// Soft radial glow texture for the forge aura sprite.
function glowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(64, 64, 4, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,220,150,0.9)');
  grad.addColorStop(0.45, 'rgba(233,185,73,0.28)');
  grad.addColorStop(1, 'rgba(233,185,73,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(canvas);
}

export default function ForgeFigure3D({ filled = 0, total = 9, spinning = false, complete = false, className = '' }) {
  const hostRef = useRef(null);
  const stateRef = useRef({ filled, total, spinning, complete });
  stateRef.current = { filled, total, spinning, complete };
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      setFailed(true);
      return undefined;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.06;
    renderer.domElement.style.cssText = 'display:block;width:100%;height:100%';
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 60);
    camera.position.set(0.55, 1.55, 6.1);
    camera.lookAt(0.16, 1.32, 0);

    // Lighting rig: warm upper-left key with shadows, cool rim from behind,
    // gentle frontal fill and a low hemisphere base.
    scene.add(new THREE.HemisphereLight(0xffe4bb, 0x141b2e, 0.5));
    const key = new THREE.DirectionalLight(0xffd9a0, 1.7);
    key.position.set(-3.2, 5, 3.6);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -2.4; key.shadow.camera.right = 2.4;
    key.shadow.camera.top = 3.4; key.shadow.camera.bottom = -0.4;
    key.shadow.camera.near = 0.5; key.shadow.camera.far = 14;
    key.shadow.bias = -0.0004;
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x7ea2ff, 1.15);
    rim.position.set(2.6, 3.4, -4.2);
    scene.add(rim);
    const fill = new THREE.DirectionalLight(0xffffff, 0.3);
    fill.position.set(2.8, 1.4, 3.2);
    scene.add(fill);
    const auraLight = new THREE.PointLight(0xe9b949, 0.25, 6, 1.8);
    auraLight.position.set(0, 1.5, 0.9);
    scene.add(auraLight);

    // Per-segment material records: each animates independently between cold
    // steel and molten gold (color, emissive intensity, metalness, roughness).
    const makeMat = (litColor, unlitColor, metalLit, roughLit) => {
      const mat = new THREE.MeshStandardMaterial({ color: unlitColor.clone(), metalness: 0.85, roughness: 0.42, emissive: litColor.clone(), emissiveIntensity: 0.04 });
      return { mat, litColor: litColor.clone(), unlitColor: unlitColor.clone(), metalLit, roughLit, wasLit: false, flashT: null };
    };
    const goldMat = () => makeMat(GOLD, STEEL, 0.55, 0.28);
    const deepMat = () => makeMat(GOLD_DEEP, STEEL_DARK, 0.6, 0.34);

    const figure = new THREE.Group();
    const segments = SEGMENT_ORDER.map(key => ({ key, mats: [], meshes: [] }));
    const seg = key => segments.find(item => item.key === key);
    const addMesh = (key, mesh) => { figure.add(mesh); const s = seg(key); s.meshes.push(mesh); s.mats.push(...(Array.isArray(mesh.material) ? mesh.material : [mesh.material]).map(mat => recOf(mat))); };
    const recsByKey = new Map();
    const recOf = mat => {
      if (!recsByKey.has(mat)) recsByKey.set(mat, mat === segCache.shortMat ? deepRec() : goldRec());
      return recsByKey.get(mat);
    };
    let goldRecStore = null, deepRecStore = null;
    const goldRec = () => (goldRecStore ||= goldMat());
    const deepRec = () => (deepRecStore ||= deepMat());
    const segCache = {};

    // Legs: tapered thighs and shins with quad and calf muscle volumes,
    // sculpted shoes with a distinct heel
    addMesh('thigh-l', limbBetween(P.kneeL, P.hipL, 0.095, 0.125, goldRec().mat));
    addMesh('thigh-r', limbBetween(P.kneeR, P.hipR, 0.095, 0.125, goldRec().mat));
    addMesh('shin-l', limbBetween(P.ankleL, P.kneeL, 0.055, 0.085, goldRec().mat));
    addMesh('shin-r', limbBetween(P.ankleR, P.kneeR, 0.055, 0.085, goldRec().mat));
    const quadL = sphereAt([P.kneeL[0] - 0.005, 0.94, P.kneeL[2] + 0.035], 0.105, goldRec().mat); quadL.scale.set(0.95, 1.35, 0.9);
    const quadR = sphereAt([P.kneeR[0] - 0.005, 0.94, P.kneeR[2] + 0.035], 0.105, goldRec().mat); quadR.scale.set(0.95, 1.35, 0.9);
    addMesh('thigh-l', quadL); addMesh('thigh-r', quadR);
    const calfL = sphereAt([P.kneeL[0] + 0.005, 0.5, P.kneeL[2] - 0.035], 0.08, goldRec().mat); calfL.scale.set(1, 1.4, 0.85);
    const calfR = sphereAt([P.kneeR[0] + 0.005, 0.5, P.kneeR[2] - 0.035], 0.08, goldRec().mat); calfR.scale.set(1, 1.4, 0.85);
    addMesh('shin-l', calfL); addMesh('shin-r', calfR);
    const shoeL = sphereAt([P.ankleL[0], 0.095, P.ankleL[2] + 0.12], 0.08, goldRec().mat); shoeL.scale.set(0.85, 0.6, 2);
    const shoeR = sphereAt([P.ankleR[0], 0.095, P.ankleR[2] + 0.12], 0.08, goldRec().mat); shoeR.scale.set(0.85, 0.6, 2);
    addMesh('shin-l', shoeL); addMesh('shin-r', shoeR);
    // Shorts: lathe pelvis wedge with a waistband
    segCache.shortMat = deepRec().mat;
    addMesh('shorts', latheMesh(SHORTS_PROFILE, segCache.shortMat));
    const waistband = new THREE.Mesh(new THREE.TorusGeometry(0.215, 0.022, 10, 28), segCache.shortMat);
    waistband.position.set(0, 1.33, 0); waistband.rotation.x = Math.PI / 2; waistband.scale.set(1, SLEEVE_ELLIPSE, 1); waistband.castShadow = true;
    addMesh('shorts', waistband);
    // Torso jersey: single lathe silhouette with subtle pec shelves and collar
    segCache.torsoMat = goldRec().mat;
    addMesh('torso', latheMesh(JERSEY_PROFILE, segCache.torsoMat));
    const pecL = sphereAt([-0.135, 1.72, 0.1], 0.15, segCache.torsoMat); pecL.scale.set(1, 0.55, 0.5);
    const pecR = sphereAt([0.135, 1.72, 0.1], 0.15, segCache.torsoMat); pecR.scale.set(1, 0.55, 0.5);
    addMesh('torso', pecL); addMesh('torso', pecR);
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.105, 0.024, 10, 24), deepRec().mat);
    collar.position.set(0, 2.02, 0.02); collar.rotation.x = Math.PI / 2; collar.scale.set(1.25, SLEEVE_ELLIPSE, 1); collar.castShadow = true;
    addMesh('torso', collar);
    // Arms: deltoid cap, tapered upper arm and forearm, sculpted hand
    addMesh('arm-l', sphereAt([P.shoulderL[0] - 0.02, P.shoulderL[1] + 0.03, 0], 0.115, goldRec().mat));
    addMesh('arm-r', sphereAt([P.shoulderR[0] + 0.02, P.shoulderR[1] + 0.03, 0], 0.115, goldRec().mat));
    addMesh('arm-l', limbBetween(P.shoulderL, P.elbowL, 0.082, 0.06, goldRec().mat));
    addMesh('arm-r', limbBetween(P.shoulderR, P.elbowR, 0.082, 0.06, goldRec().mat));
    addMesh('arm-l', limbBetween(P.elbowL, P.wristL, 0.06, 0.042, goldRec().mat));
    addMesh('arm-r', limbBetween(P.elbowR, P.wristR, 0.06, 0.042, goldRec().mat));
    const handL = sphereAt(P.wristL, 0.058, goldRec().mat); handL.scale.set(1, 0.85, 1.15);
    const handR = sphereAt(P.wristR, 0.058, goldRec().mat); handR.scale.set(1, 0.85, 1.15);
    addMesh('arm-l', handL); addMesh('arm-r', handR);
    // Joints: knees, ankles, elbows, hips
    addMesh('shin-l', sphereAt(P.ankleL, 0.06, goldRec().mat));
    addMesh('shin-r', sphereAt(P.ankleR, 0.06, goldRec().mat));
    addMesh('thigh-l', sphereAt(P.kneeL, 0.088, goldRec().mat));
    addMesh('thigh-r', sphereAt(P.kneeR, 0.088, goldRec().mat));
    addMesh('arm-l', sphereAt(P.elbowL, 0.058, goldRec().mat));
    addMesh('arm-r', sphereAt(P.elbowR, 0.058, goldRec().mat));
    addMesh('thigh-l', sphereAt(P.hipL, 0.088, deepRec().mat));
    addMesh('thigh-r', sphereAt(P.hipR, 0.088, deepRec().mat));
    // Neck + head: egg-shaped skull with a narrower jaw taper
    addMesh('head', capsuleBetween(P.neckA, P.neckB, 0.062, goldRec().mat));
    const head = sphereAt(P.head, 0.185, goldRec().mat);
    head.scale.set(0.88, 1.02, 0.96);
    addMesh('head', head);

    scene.add(figure);

    // Basketball: hidden steel until completion, then ignited with seams and a
    // warm point light.
    const ballGroup = new THREE.Group();
    ballGroup.position.set(...P.ball);
    const ballMat = makeMat(BALL_LIT, BALL_HIDE, 0.35, 0.5);
    const ballMesh = new THREE.Mesh(new THREE.SphereGeometry(0.175, 28, 22), ballMat.mat);
    ballMesh.castShadow = true;
    ballGroup.add(ballMesh);
    const seamMat = new THREE.MeshStandardMaterial({ color: 0x6b2a10, roughness: 0.6, metalness: 0.1 });
    [[Math.PI / 2, 0, 0], [0.4, 0, Math.PI / 2], [Math.PI / 2.6, Math.PI / 3, 0.3]].forEach((rot, i) => {
      const seam = new THREE.Mesh(new THREE.TorusGeometry(0.175, 0.007, 8, 40), seamMat);
      seam.rotation.set(...rot);
      if (i === 2) seam.scale.set(1, 1, 1);
      ballGroup.add(seam);
    });
    const ballLight = new THREE.PointLight(0xffa04a, 0, 3.4, 1.6);
    ballGroup.add(ballLight);
    figure.add(ballGroup);

    // Display pedestal the statue rotates on, with a gold trim ring.
    const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.92, 1.02, 0.09, 48), new THREE.MeshStandardMaterial({ color: 0x1d2434, metalness: 0.65, roughness: 0.35 }));
    pedestal.position.y = -0.045;
    pedestal.receiveShadow = true;
    const trim = new THREE.Mesh(new THREE.TorusGeometry(0.92, 0.016, 10, 60), new THREE.MeshStandardMaterial({ color: 0xE9B949, metalness: 0.8, roughness: 0.25, emissive: 0xE9B949, emissiveIntensity: 0.25 }));
    trim.rotation.x = Math.PI / 2;
    trim.position.y = 0.005;
    figure.add(pedestal, trim);

    // Forge floor: shadow catcher plus a molten contact glow under the figure.
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(7, 7), new THREE.ShadowMaterial({ opacity: 0.32 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.09;
    floor.receiveShadow = true;
    scene.add(floor);
    const contactGlow = new THREE.Mesh(new THREE.CircleGeometry(0.95, 40), new THREE.MeshBasicMaterial({ color: 0xE9B949, transparent: true, opacity: 0, depthWrite: false }));
    contactGlow.rotation.x = -Math.PI / 2;
    contactGlow.position.y = -0.085;
    scene.add(contactGlow);

    // Aura sprite + ember particles
    const aura = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xE9B949, transparent: true, opacity: 0.08, depthWrite: false }));
    aura.scale.set(5.6, 5.6, 1);
    aura.position.set(0, 1.5, -1.4);
    scene.add(aura);

    const EMBER_COUNT = 42;
    const emberGeo = new THREE.BufferGeometry();
    const emberPos = new Float32Array(EMBER_COUNT * 3);
    const emberSpeed = new Float32Array(EMBER_COUNT);
    for (let i = 0; i < EMBER_COUNT; i += 1) {
      emberPos[i * 3] = (Math.random() - 0.5) * 1.9;
      emberPos[i * 3 + 1] = Math.random() * 2.5;
      emberPos[i * 3 + 2] = (Math.random() - 0.5) * 1.2;
      emberSpeed[i] = 0.25 + Math.random() * 0.5;
    }
    emberGeo.setAttribute('position', new THREE.BufferAttribute(emberPos, 3));
    const emberMat = new THREE.PointsMaterial({ color: 0xF5C563, size: 0.045, transparent: true, opacity: 0, depthWrite: false, sizeAttenuation: true });
    const embers = new THREE.Points(emberGeo, emberMat);
    scene.add(embers);

    // Completion halo: two thin rings orbiting the figure.
    const haloMat = new THREE.MeshBasicMaterial({ color: 0xE9B949, transparent: true, opacity: 0, depthWrite: false });
    const haloA = new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.012, 8, 70), haloMat);
    haloA.rotation.x = Math.PI / 2;
    const haloB = new THREE.Mesh(new THREE.TorusGeometry(1.3, 0.008, 8, 70), haloMat);
    haloB.rotation.set(Math.PI / 2.5, 0, 0.4);
    scene.add(haloA, haloB);

    // Sizing
    const resize = () => {
      const width = host.clientWidth, height = host.clientHeight;
      if (!width || !height) return;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();

    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;
    const clock = new THREE.Clock();
    const prevLit = { count: -1 };
    let frame;

    const animate = () => {
      frame = requestAnimationFrame(animate);
      const dt = Math.min(clock.getDelta(), 0.05);
      const t = clock.elapsedTime;
      const s = stateRef.current;
      const progress = Math.max(0, Math.min(1, s.filled / s.total));

      // Motion: slow display rotation (faster + emissive pulse while spinning),
      // gentle idle bob — none for reduced-motion users.
      if (!reducedMotion) {
        figure.rotation.y += (s.spinning ? 0.055 : 0.006);
        figure.position.y = Math.sin(t * 1.3) * 0.014;
      }
      const pulse = s.spinning ? 0.22 * (0.5 + 0.5 * Math.sin(t * 7)) : 0;

      // Forge state: light segments up to progress (head is the ninth), flash
      // each newly lit volume, lerp every material toward its target.
      const litCount = s.complete ? SEGMENT_ORDER.length + 1 : Math.round(progress * (SEGMENT_ORDER.length + 1));
      if (litCount !== prevLit.count) {
        segments.forEach((segment, index) => {
          const lit = index < litCount;
          if (lit && !segment.mats[0]?.wasLit) segment.mats.forEach(rec => { rec.flashT = t; });
          segment.mats.forEach(rec => { rec.wasLit = lit; });
        });
        prevLit.count = litCount;
      }
      for (const segment of segments) {
        for (const rec of segment.mats) {
          const flash = rec.flashT != null ? Math.max(0, 1 - (t - rec.flashT) * 2.2) : 0;
          const targetEmissive = (rec.wasLit ? 0.3 + 0.55 * progress + flash * 1.5 : 0.04) + pulse;
          rec.mat.emissiveIntensity += (targetEmissive - rec.mat.emissiveIntensity) * 0.12;
          rec.mat.color.lerp(rec.wasLit ? rec.litColor : rec.unlitColor, 0.09);
          rec.mat.metalness += ((rec.wasLit ? rec.metalLit : 0.85) - rec.mat.metalness) * 0.09;
          rec.mat.roughness += ((rec.wasLit ? rec.roughLit : 0.42) - rec.mat.roughness) * 0.09;
        }
      }

      // Ball ignition on completion
      const ballLit = s.complete;
      ballMat.wasLit = ballLit;
      ballMat.mat.emissiveIntensity += ((ballLit ? 0.75 + pulse : 0.05) - ballMat.mat.emissiveIntensity) * 0.08;
      ballMat.mat.color.lerp(ballLit ? BALL_LIT : BALL_HIDE, 0.08);
      ballMat.mat.emissive.lerp(ballLit ? new THREE.Color('#ff9147') : GOLD, 0.08);
      ballLight.intensity += ((ballLit ? 1.15 : 0) - ballLight.intensity) * 0.08;
      ballGroup.rotation.y += 0.008;

      // Aura, embers, halo
      auraLight.intensity += ((0.12 + 0.75 * progress + (s.complete ? 0.4 : 0)) - auraLight.intensity) * 0.08;
      aura.material.opacity += ((0.06 + 0.3 * progress) - aura.material.opacity) * 0.08;
      contactGlow.material.opacity += ((0.05 + 0.22 * progress) - contactGlow.material.opacity) * 0.08;
      emberMat.opacity += ((progress > 0 || s.complete ? 0.3 + 0.45 * progress : 0) - emberMat.opacity) * 0.08;
      const positions = emberGeo.attributes.position;
      for (let i = 0; i < EMBER_COUNT; i += 1) {
        let y = positions.getY(i) + emberSpeed[i] * dt;
        if (y > 2.6) y = 0.12;
        positions.setY(i, y);
        positions.setX(i, positions.getX(i) + Math.sin(t * 1.2 + i) * 0.0006);
      }
      positions.needsUpdate = true;
      const haloTarget = s.complete ? 0.5 : 0;
      haloMat.opacity += (haloTarget - haloMat.opacity) * 0.06;
      if (!reducedMotion) { haloA.rotation.z += 0.012; haloB.rotation.z -= 0.009; }

      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      scene.traverse(object => {
        if (object.geometry) object.geometry.dispose();
        if (object.material) (Array.isArray(object.material) ? object.material : [object.material]).forEach(mat => { if (mat.map) mat.map.dispose(); mat.dispose(); });
      });
      renderer.dispose();
      host.removeChild(renderer.domElement);
    };
  }, []);

  if (failed) return <FallbackFigure filled={filled} total={total} className={className} />;
  return <div ref={hostRef} role="img" aria-label={`Composite player forged ${filled} of ${total} skills`} className={`forge-figure ${className}`} />;
}

// Static silhouette for environments without WebGL.
function FallbackFigure({ filled, total, className }) {
  return <svg viewBox="0 0 200 260" preserveAspectRatio="xMidYMid meet" role="img" aria-label={`Composite player forged ${filled} of ${total} skills`} className={className}>
    <defs>
      <radialGradient id="ff-fallback-body" cx="38%" cy="30%" r="85%">
        <stop offset="0%" stopColor="#FFE9AE" />
        <stop offset="55%" stopColor="#E9B949" />
        <stop offset="100%" stopColor="#8F5410" />
      </radialGradient>
    </defs>
    <ellipse cx="100" cy="248" rx="52" ry="8" fill="#241402" opacity=".45" />
    <circle cx="98" cy="36" r="17" fill="url(#ff-fallback-body)" />
    <path d="M76,60 L122,60 L130,86 L122,118 L108,140 L88,140 L74,118 L66,86 Z" fill="url(#ff-fallback-body)" />
    <path d="M80,136 L118,136 L124,172 L106,172 L99,156 L92,172 L74,172 Z" fill="url(#ff-fallback-body)" opacity=".9" />
    <g stroke="url(#ff-fallback-body)" strokeLinecap="round">
      <line x1="86" y1="164" x2="78" y2="212" strokeWidth="17" />
      <line x1="112" y1="164" x2="118" y2="212" strokeWidth="17" />
      <line x1="80" y1="210" x2="86" y2="244" strokeWidth="13" />
      <line x1="118" y1="210" x2="112" y2="244" strokeWidth="13" />
      <line x1="82" y1="72" x2="62" y2="106" strokeWidth="14" />
      <line x1="114" y1="70" x2="136" y2="46" strokeWidth="14" />
      <circle cx="150" cy="36" r="12" fill="#C2410C" stroke="#7C2D12" strokeWidth="2" />
    </g>
  </svg>;
}