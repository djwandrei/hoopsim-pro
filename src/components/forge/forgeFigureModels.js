import * as THREE from 'three';

// Sculpt variants for the Forge 3D figure. Every variant fills the same nine
// forge segments (shin-l, shin-r, thigh-l, thigh-r, shorts, torso, arm-l,
// arm-r, head) with meshes using the shared gold/deep materials, and returns
// the ball position so the shared ForgeFigure3D engine can hang the
// basketball on the shooting hand.

export function sphereAt(p, r, material, wSeg = 24, hSeg = 18) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, wSeg, hSeg), material);
  mesh.position.set(...p);
  mesh.castShadow = true;
  return mesh;
}

// Tapered limb segment: cylinder from a (radius rA) to b (radius rB).
export function limbBetween(a, b, rA, rB, material, radial = 20) {
  const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b);
  const dir = end.clone().sub(start);
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rB, rA, Math.max(0.02, dir.length()), radial, 1), material);
  mesh.position.copy(start).add(end).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  mesh.castShadow = true;
  return mesh;
}

// Capsule spanning exactly from a to b (round caps included).
export function capsuleBetween(a, b, r, material, radial = 18) {
  const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b);
  const dir = end.clone().sub(start);
  const length = dir.length();
  const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(r, Math.max(0.02, length - r * 1.1), 7, radial), material);
  mesh.position.copy(start).add(end).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  mesh.castShadow = true;
  return mesh;
}

// Lathe-turned torso volume with an elliptical cross-section.
export function latheMesh(points, material, zScale = 0.72, radial = 28) {
  const mesh = new THREE.Mesh(new THREE.LatheGeometry(points.map(([x, y]) => new THREE.Vector2(x, y)), radial), material);
  mesh.scale.z = zScale;
  mesh.castShadow = true;
  return mesh;
}

// Faceted helpers: icosahedral volumes and stretched muscle/slab shapes.
const icoAt = (p, r, material) => {
  const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), material);
  mesh.position.set(...p);
  mesh.castShadow = true;
  return mesh;
};
const muscleAt = (p, r, scale, material) => {
  const mesh = sphereAt(p, r, material);
  mesh.scale.set(...scale);
  return mesh;
};

export function buildFigureBody(style, api) {
  if (style === 'reference') return buildReference(api);
  if (style === 'natural') return buildNatural(api);
  if (style === 'faceted') return buildFaceted(api);
  return buildCharacter(api);
}

// ─── Stylized athletic character ────────────────────────────────────────────
// Intentionally simplified anatomy with a bold basketball silhouette: big
// rounded head, wide shoulders, deep chest, tucked waist, baggy shorts and
// chunky high-tops. ~6 heads tall, mitten hands.
function buildCharacter({ addMesh, segCache, goldRec, deepRec }) {
  const P = {
    head: [0, 2.18, 0.04],
    neckA: [0, 2.06, 0.03], neckB: [0, 1.94, 0.01],
    shoulderL: [-0.4, 1.86, 0], shoulderR: [0.4, 1.86, 0],
    elbowL: [-0.56, 1.5, 0.04], elbowR: [0.58, 1.62, 0.14],
    wristL: [-0.47, 1.12, 0.12], wristR: [0.66, 2.0, 0.4],
    hipL: [-0.17, 1.12, 0], hipR: [0.17, 1.12, 0],
    kneeL: [-0.2, 0.6, 0.05], kneeR: [0.2, 0.6, -0.04],
    ankleL: [-0.22, 0.16, 0], ankleR: [0.23, 0.16, -0.08],
  };

  // Legs: chunky limbs with quad and calf volumes, high-top shoes
  addMesh('thigh-l', limbBetween(P.kneeL, P.hipL, 0.1, 0.115, goldRec().mat));
  addMesh('thigh-r', limbBetween(P.kneeR, P.hipR, 0.1, 0.115, goldRec().mat));
  addMesh('shin-l', limbBetween(P.ankleL, P.kneeL, 0.06, 0.085, goldRec().mat));
  addMesh('shin-r', limbBetween(P.ankleR, P.kneeR, 0.06, 0.085, goldRec().mat));
  const quadL = muscleAt([P.kneeL[0] - 0.005, 0.9, P.kneeL[2] + 0.035], 0.1, [0.95, 1.3, 0.9], goldRec().mat);
  const quadR = muscleAt([P.kneeR[0] - 0.005, 0.9, P.kneeR[2] + 0.035], 0.1, [0.95, 1.3, 0.9], goldRec().mat);
  addMesh('thigh-l', quadL); addMesh('thigh-r', quadR);
  const calfL = muscleAt([P.kneeL[0] + 0.005, 0.5, P.kneeL[2] - 0.03], 0.08, [1, 1.35, 0.85], goldRec().mat);
  const calfR = muscleAt([P.kneeR[0] + 0.005, 0.5, P.kneeR[2] - 0.03], 0.08, [1, 1.35, 0.85], goldRec().mat);
  addMesh('shin-l', calfL); addMesh('shin-r', calfR);
  const shoeL = muscleAt([P.ankleL[0], 0.09, P.ankleL[2] + 0.12], 0.09, [0.9, 0.62, 2.05], goldRec().mat);
  const shoeR = muscleAt([P.ankleR[0], 0.09, P.ankleR[2] + 0.12], 0.09, [0.9, 0.62, 2.05], goldRec().mat);
  addMesh('shin-l', shoeL); addMesh('shin-r', shoeR);

  // Baggy shorts with a wide waistband
  segCache.shortMat = deepRec().mat;
  addMesh('shorts', latheMesh([[0.02, 0.84], [0.2, 0.88], [0.27, 0.98], [0.27, 1.08], [0.23, 1.18]], segCache.shortMat));
  const waistband = new THREE.Mesh(new THREE.TorusGeometry(0.235, 0.024, 10, 28), segCache.shortMat);
  waistband.position.set(0, 1.19, 0); waistband.rotation.x = Math.PI / 2; waistband.scale.set(1, 0.72, 1); waistband.castShadow = true;
  addMesh('shorts', waistband);

  // Jersey with a deep chest, tucked waist and collar
  segCache.torsoMat = goldRec().mat;
  addMesh('torso', latheMesh([[0.2, 1.17], [0.235, 1.24], [0.225, 1.3], [0.27, 1.42], [0.32, 1.54], [0.345, 1.64], [0.33, 1.74], [0.3, 1.84], [0.2, 1.9], [0.12, 1.94]], segCache.torsoMat));
  const pecL = muscleAt([-0.14, 1.62, 0.1], 0.16, [1, 0.5, 0.5], segCache.torsoMat);
  const pecR = muscleAt([0.14, 1.62, 0.1], 0.16, [1, 0.5, 0.5], segCache.torsoMat);
  addMesh('torso', pecL); addMesh('torso', pecR);
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.115, 0.026, 10, 24), deepRec().mat);
  collar.position.set(0, 1.95, 0.03); collar.rotation.x = Math.PI / 2; collar.scale.set(1.25, 0.72, 1); collar.castShadow = true;
  addMesh('torso', collar);

  // Arms: round deltoids, chunky forearms, mitten hands
  addMesh('arm-l', sphereAt([P.shoulderL[0] - 0.02, P.shoulderL[1] + 0.03, 0], 0.12, goldRec().mat));
  addMesh('arm-r', sphereAt([P.shoulderR[0] + 0.02, P.shoulderR[1] + 0.03, 0], 0.12, goldRec().mat));
  addMesh('arm-l', limbBetween(P.shoulderL, P.elbowL, 0.082, 0.062, goldRec().mat));
  addMesh('arm-r', limbBetween(P.shoulderR, P.elbowR, 0.082, 0.062, goldRec().mat));
  addMesh('arm-l', limbBetween(P.elbowL, P.wristL, 0.062, 0.05, goldRec().mat));
  addMesh('arm-r', limbBetween(P.elbowR, P.wristR, 0.062, 0.05, goldRec().mat));
  const handL = muscleAt(P.wristL, 0.075, [0.9, 1.15, 0.95], goldRec().mat);
  const handR = muscleAt(P.wristR, 0.075, [0.9, 1.15, 0.95], goldRec().mat);
  addMesh('arm-l', handL); addMesh('arm-r', handR);

  // Joints
  addMesh('shin-l', sphereAt(P.ankleL, 0.06, goldRec().mat));
  addMesh('shin-r', sphereAt(P.ankleR, 0.06, goldRec().mat));
  addMesh('thigh-l', sphereAt(P.kneeL, 0.09, goldRec().mat));
  addMesh('thigh-r', sphereAt(P.kneeR, 0.09, goldRec().mat));
  addMesh('arm-l', sphereAt(P.elbowL, 0.06, goldRec().mat));
  addMesh('arm-r', sphereAt(P.elbowR, 0.06, goldRec().mat));
  addMesh('thigh-l', sphereAt(P.hipL, 0.095, deepRec().mat));
  addMesh('thigh-r', sphereAt(P.hipR, 0.095, deepRec().mat));

  // Big rounded head on a short neck
  addMesh('head', capsuleBetween(P.neckA, P.neckB, 0.08, goldRec().mat));
  const head = sphereAt(P.head, 0.235, goldRec().mat);
  head.scale.set(0.95, 1, 0.98);
  addMesh('head', head);

  return { ball: [0.7, 2.24, 0.48] };
}

// ─── Natural human proportions ──────────────────────────────────────────────
// ~7.5-head lifelike build: sculpted hands (palm + thumb), jaw taper, subtle
// nose, trap wedges, defined quads/calves and correctly proportioned joints.
function buildNatural({ addMesh, segCache, goldRec, deepRec }) {
  const P = {
    head: [0, 2.4, 0.03],
    neckA: [0, 2.22, 0.02], neckB: [0, 2.0, 0.02],
    shoulderL: [-0.4, 1.98, 0], shoulderR: [0.4, 1.98, 0],
    elbowL: [-0.52, 1.6, 0.04], elbowR: [0.55, 1.7, 0.15],
    wristL: [-0.43, 1.22, 0.1], wristR: [0.6, 2.04, 0.4],
    hipL: [-0.15, 1.16, 0], hipR: [0.15, 1.16, 0],
    kneeL: [-0.19, 0.6, 0.05], kneeR: [0.19, 0.6, -0.04],
    ankleL: [-0.21, 0.16, 0], ankleR: [0.22, 0.16, -0.08],
  };

  // Legs: tapered limbs with quad and calf sweeps, low-profile shoes + heels
  addMesh('thigh-l', limbBetween(P.kneeL, P.hipL, 0.095, 0.125, goldRec().mat));
  addMesh('thigh-r', limbBetween(P.kneeR, P.hipR, 0.095, 0.125, goldRec().mat));
  addMesh('shin-l', limbBetween(P.ankleL, P.kneeL, 0.052, 0.085, goldRec().mat));
  addMesh('shin-r', limbBetween(P.ankleR, P.kneeR, 0.052, 0.085, goldRec().mat));
  const quadL = muscleAt([P.kneeL[0] - 0.005, 0.92, P.kneeL[2] + 0.035], 0.1, [0.95, 1.3, 0.9], goldRec().mat);
  const quadR = muscleAt([P.kneeR[0] - 0.005, 0.92, P.kneeR[2] + 0.035], 0.1, [0.95, 1.3, 0.9], goldRec().mat);
  addMesh('thigh-l', quadL); addMesh('thigh-r', quadR);
  const calfL = muscleAt([P.kneeL[0] + 0.005, 0.5, P.kneeL[2] - 0.035], 0.075, [1, 1.4, 0.85], goldRec().mat);
  const calfR = muscleAt([P.kneeR[0] + 0.005, 0.5, P.kneeR[2] - 0.035], 0.075, [1, 1.4, 0.85], goldRec().mat);
  addMesh('shin-l', calfL); addMesh('shin-r', calfR);
  const shoeL = muscleAt([P.ankleL[0], 0.09, P.ankleL[2] + 0.12], 0.078, [0.82, 0.58, 2], goldRec().mat);
  const shoeR = muscleAt([P.ankleR[0], 0.09, P.ankleR[2] + 0.12], 0.078, [0.82, 0.58, 2], goldRec().mat);
  addMesh('shin-l', shoeL); addMesh('shin-r', shoeR);
  addMesh('shin-l', sphereAt([P.ankleL[0], 0.1, P.ankleL[2] - 0.02], 0.055, goldRec().mat));
  addMesh('shin-r', sphereAt([P.ankleR[0], 0.1, P.ankleR[2] - 0.02], 0.055, goldRec().mat));

  // Shorts: pelvis wedge + waistband
  segCache.shortMat = deepRec().mat;
  addMesh('shorts', latheMesh([[0.02, 1.04], [0.15, 1.07], [0.235, 1.15], [0.24, 1.23], [0.21, 1.3]], segCache.shortMat));
  const waistband = new THREE.Mesh(new THREE.TorusGeometry(0.215, 0.022, 10, 28), segCache.shortMat);
  waistband.position.set(0, 1.31, 0); waistband.rotation.x = Math.PI / 2; waistband.scale.set(1, 0.72, 1); waistband.castShadow = true;
  addMesh('shorts', waistband);

  // Jersey: continuous lathe silhouette, pec shelves, trap wedges, collar
  segCache.torsoMat = goldRec().mat;
  addMesh('torso', latheMesh([[0.185, 1.28], [0.205, 1.34], [0.22, 1.42], [0.26, 1.54], [0.295, 1.68], [0.31, 1.8], [0.27, 1.92], [0.175, 2.0], [0.095, 2.06]], segCache.torsoMat));
  const pecL = muscleAt([-0.13, 1.74, 0.095], 0.145, [1, 0.55, 0.5], segCache.torsoMat);
  const pecR = muscleAt([0.13, 1.74, 0.095], 0.145, [1, 0.55, 0.5], segCache.torsoMat);
  addMesh('torso', pecL); addMesh('torso', pecR);
  const trapL = muscleAt([-0.19, 1.99, 0], 0.09, [1.1, 0.45, 0.8], segCache.torsoMat);
  const trapR = muscleAt([0.19, 1.99, 0], 0.09, [1.1, 0.45, 0.8], segCache.torsoMat);
  addMesh('torso', trapL); addMesh('torso', trapR);
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.022, 10, 24), deepRec().mat);
  collar.position.set(0, 2.03, 0.02); collar.rotation.x = Math.PI / 2; collar.scale.set(1.25, 0.72, 1); collar.castShadow = true;
  addMesh('torso', collar);

  // Arms: deltoids, tapered limbs, sculpted hands with thumbs
  addMesh('arm-l', sphereAt([P.shoulderL[0] - 0.02, P.shoulderL[1] + 0.03, 0], 0.11, goldRec().mat));
  addMesh('arm-r', sphereAt([P.shoulderR[0] + 0.02, P.shoulderR[1] + 0.03, 0], 0.11, goldRec().mat));
  addMesh('arm-l', limbBetween(P.shoulderL, P.elbowL, 0.078, 0.058, goldRec().mat));
  addMesh('arm-r', limbBetween(P.shoulderR, P.elbowR, 0.078, 0.058, goldRec().mat));
  addMesh('arm-l', limbBetween(P.elbowL, P.wristL, 0.058, 0.04, goldRec().mat));
  addMesh('arm-r', limbBetween(P.elbowR, P.wristR, 0.058, 0.04, goldRec().mat));
  const handL = muscleAt(P.wristL, 0.055, [0.85, 1, 1.1], goldRec().mat);
  const handR = muscleAt(P.wristR, 0.055, [0.85, 1, 1.1], goldRec().mat);
  addMesh('arm-l', handL); addMesh('arm-r', handR);
  addMesh('arm-l', sphereAt([P.wristL[0] + 0.03, P.wristL[1] + 0.03, P.wristL[2] + 0.05], 0.026, goldRec().mat));
  addMesh('arm-r', sphereAt([P.wristR[0] - 0.02, P.wristR[1] - 0.02, P.wristR[2] + 0.05], 0.026, goldRec().mat));

  // Joints
  addMesh('shin-l', sphereAt(P.ankleL, 0.055, goldRec().mat));
  addMesh('shin-r', sphereAt(P.ankleR, 0.055, goldRec().mat));
  addMesh('thigh-l', sphereAt(P.kneeL, 0.085, goldRec().mat));
  addMesh('thigh-r', sphereAt(P.kneeR, 0.085, goldRec().mat));
  addMesh('arm-l', sphereAt(P.elbowL, 0.055, goldRec().mat));
  addMesh('arm-r', sphereAt(P.elbowR, 0.055, goldRec().mat));
  addMesh('thigh-l', sphereAt(P.hipL, 0.085, deepRec().mat));
  addMesh('thigh-r', sphereAt(P.hipR, 0.085, deepRec().mat));

  // Head: egg skull with jaw taper and subtle nose on a natural neck
  addMesh('head', capsuleBetween(P.neckA, P.neckB, 0.055, goldRec().mat));
  const head = sphereAt(P.head, 0.18, goldRec().mat);
  head.scale.set(0.85, 1.05, 0.92);
  addMesh('head', head);
  const jaw = muscleAt([0, 2.32, 0.05], 0.125, [0.78, 0.55, 0.85], goldRec().mat);
  addMesh('head', jaw);
  const nose = muscleAt([0, 2.38, 0.19], 0.04, [0.7, 1.1, 1], goldRec().mat);
  addMesh('head', nose);

  return { ball: [0.64, 2.26, 0.48] };
}

// ─── Faceted sports sculpture ───────────────────────────────────────────────
// Angular low-poly planes: icosahedral volumes, 7-sided limb shells and a
// chiseled 9-sided torso — flat shading comes from the shared materials.
function buildFaceted({ addMesh, segCache, goldRec, deepRec }) {
  const P = {
    head: [0, 2.38, 0.02],
    neckA: [0, 2.2, 0.02], neckB: [0, 2.0, 0.02],
    shoulderL: [-0.42, 1.98, 0], shoulderR: [0.42, 1.98, 0],
    elbowL: [-0.55, 1.62, 0.03], elbowR: [0.56, 1.72, 0.15],
    wristL: [-0.45, 1.26, 0.09], wristR: [0.61, 2.05, 0.4],
    hipL: [-0.16, 1.16, 0], hipR: [0.16, 1.16, 0],
    kneeL: [-0.2, 0.6, 0.05], kneeR: [0.2, 0.6, -0.04],
    ankleL: [-0.22, 0.16, 0], ankleR: [0.23, 0.16, -0.08],
  };

  // Legs: prismatic limbs, slab shoes
  addMesh('thigh-l', limbBetween(P.kneeL, P.hipL, 0.1, 0.125, goldRec().mat, 7));
  addMesh('thigh-r', limbBetween(P.kneeR, P.hipR, 0.1, 0.125, goldRec().mat, 7));
  addMesh('shin-l', limbBetween(P.ankleL, P.kneeL, 0.055, 0.09, goldRec().mat, 7));
  addMesh('shin-r', limbBetween(P.ankleR, P.kneeR, 0.055, 0.09, goldRec().mat, 7));
  addMesh('thigh-l', icoAt([P.kneeL[0] - 0.005, 0.94, P.kneeL[2] + 0.04], 0.1, goldRec().mat));
  addMesh('thigh-r', icoAt([P.kneeR[0] - 0.005, 0.94, P.kneeR[2] + 0.04], 0.1, goldRec().mat));
  addMesh('shin-l', icoAt([P.kneeL[0] + 0.005, 0.52, P.kneeL[2] - 0.04], 0.08, goldRec().mat));
  addMesh('shin-r', icoAt([P.kneeR[0] + 0.005, 0.52, P.kneeR[2] - 0.04], 0.08, goldRec().mat));
  addMesh('shin-l', muscleAt([P.ankleL[0], 0.09, P.ankleL[2] + 0.11], 0.085, [0.9, 0.6, 1.9], goldRec().mat));
  addMesh('shin-r', muscleAt([P.ankleR[0], 0.09, P.ankleR[2] + 0.11], 0.085, [0.9, 0.6, 1.9], goldRec().mat));

  // Shorts: faceted pelvis shell
  segCache.shortMat = deepRec().mat;
  addMesh('shorts', latheMesh([[0.03, 1.02], [0.24, 1.14], [0.25, 1.22], [0.22, 1.3]], segCache.shortMat, 0.78, 9));
  const waistband = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.022, 8, 16), segCache.shortMat);
  waistband.position.set(0, 1.31, 0); waistband.rotation.x = Math.PI / 2; waistband.scale.set(1, 0.78, 1); waistband.castShadow = true;
  addMesh('shorts', waistband);

  // Torso: chiseled 9-sided shell with collar
  segCache.torsoMat = goldRec().mat;
  addMesh('torso', latheMesh([[0.19, 1.26], [0.215, 1.38], [0.28, 1.56], [0.32, 1.74], [0.26, 1.9], [0.13, 2.0]], segCache.torsoMat, 0.78, 9));
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.024, 8, 16), deepRec().mat);
  collar.position.set(0, 2.0, 0.02); collar.rotation.x = Math.PI / 2; collar.scale.set(1.3, 0.78, 1); collar.castShadow = true;
  addMesh('torso', collar);

  // Arms: icosahedral deltoids and joints, prismatic limbs
  addMesh('arm-l', icoAt([P.shoulderL[0] - 0.02, P.shoulderL[1] + 0.03, 0], 0.115, goldRec().mat));
  addMesh('arm-r', icoAt([P.shoulderR[0] + 0.02, P.shoulderR[1] + 0.03, 0], 0.115, goldRec().mat));
  addMesh('arm-l', limbBetween(P.shoulderL, P.elbowL, 0.08, 0.06, goldRec().mat, 7));
  addMesh('arm-r', limbBetween(P.shoulderR, P.elbowR, 0.08, 0.06, goldRec().mat, 7));
  addMesh('arm-l', limbBetween(P.elbowL, P.wristL, 0.06, 0.042, goldRec().mat, 7));
  addMesh('arm-r', limbBetween(P.elbowR, P.wristR, 0.06, 0.042, goldRec().mat, 7));
  addMesh('arm-l', icoAt(P.wristL, 0.06, goldRec().mat));
  addMesh('arm-r', icoAt(P.wristR, 0.06, goldRec().mat));
  addMesh('shin-l', icoAt(P.ankleL, 0.06, goldRec().mat));
  addMesh('shin-r', icoAt(P.ankleR, 0.06, goldRec().mat));
  addMesh('thigh-l', icoAt(P.kneeL, 0.09, goldRec().mat));
  addMesh('thigh-r', icoAt(P.kneeR, 0.09, goldRec().mat));
  addMesh('arm-l', icoAt(P.elbowL, 0.058, goldRec().mat));
  addMesh('arm-r', icoAt(P.elbowR, 0.058, goldRec().mat));
  addMesh('thigh-l', icoAt(P.hipL, 0.09, deepRec().mat));
  addMesh('thigh-r', icoAt(P.hipR, 0.09, deepRec().mat));

  // Head: icosahedral skull on a prismatic neck
  addMesh('head', limbBetween(P.neckB, P.neckA, 0.055, 0.06, goldRec().mat, 7));
  addMesh('head', icoAt(P.head, 0.2, goldRec().mat));

  return { ball: [0.65, 2.27, 0.48] };
}

// ─── Reference silhouette ───────────────────────────────────────────────────
// Modeled on the one-hand dunk reference shot: tank jersey, knee-length
// shorts, lean athletic build, right arm extended straight up with the ball,
// left arm trailing out and down, right knee driving forward, left leg kicked
// back — a leap frozen at takeoff.
function buildReference({ addMesh, segCache, goldRec, deepRec }) {
  const P = {
    head: [0.04, 2.32, 0.05],
    neckA: [0.02, 2.18, 0.04], neckB: [0, 2.02, 0.02],
    shoulderR: [0.32, 2.0, 0.02], shoulderL: [-0.3, 2.0, 0],
    elbowR: [0.42, 2.32, 0.1], wristR: [0.48, 2.6, 0.16],
    elbowL: [-0.52, 1.68, -0.06], wristL: [-0.68, 1.34, -0.12],
    hipR: [0.13, 1.24, 0.02], hipL: [-0.13, 1.22, -0.02],
    kneeR: [0.26, 0.74, 0.22], ankleR: [0.24, 0.24, 0.12],
    kneeL: [-0.2, 0.66, -0.16], ankleL: [-0.32, 0.2, -0.3],
  };

  // Legs: lean limbs, right knee driving forward, left leg trailing back
  addMesh('thigh-r', limbBetween(P.hipR, P.kneeR, 0.125, 0.09, goldRec().mat));
  addMesh('thigh-l', limbBetween(P.hipL, P.kneeL, 0.12, 0.085, goldRec().mat));
  addMesh('shin-r', limbBetween(P.kneeR, P.ankleR, 0.08, 0.05, goldRec().mat));
  addMesh('shin-l', limbBetween(P.kneeL, P.ankleL, 0.075, 0.048, goldRec().mat));
  addMesh('thigh-r', muscleAt([0.2, 1.0, 0.14], 0.095, [1, 1.35, 0.9], goldRec().mat));
  addMesh('thigh-l', muscleAt([-0.17, 0.94, -0.1], 0.09, [1, 1.35, 0.9], goldRec().mat));
  addMesh('shin-r', muscleAt([0.25, 0.48, 0.17], 0.07, [1, 1.4, 0.85], goldRec().mat));
  addMesh('shin-l', muscleAt([-0.27, 0.42, -0.24], 0.065, [1, 1.4, 0.85], goldRec().mat));

  // Shoes: toe forward on the drive leg, trailing back on the kick leg
  addMesh('shin-r', muscleAt([P.ankleR[0], 0.21, P.ankleR[2] + 0.1], 0.08, [0.85, 0.6, 1.9], goldRec().mat));
  addMesh('shin-l', muscleAt([P.ankleL[0] - 0.02, 0.17, P.ankleL[2] - 0.1], 0.08, [0.85, 0.6, 1.9], goldRec().mat));

  // Knee-length shorts
  segCache.shortMat = deepRec().mat;
  addMesh('shorts', latheMesh([[0.02, 0.86], [0.16, 0.9], [0.24, 1.0], [0.245, 1.12], [0.22, 1.24]], segCache.shortMat));
  const waistband = new THREE.Mesh(new THREE.TorusGeometry(0.215, 0.022, 10, 28), segCache.shortMat);
  waistband.position.set(0, 1.25, 0); waistband.rotation.x = Math.PI / 2; waistband.scale.set(1, 0.72, 1); waistband.castShadow = true;
  addMesh('shorts', waistband);

  // Tank jersey with shoulder straps
  segCache.torsoMat = goldRec().mat;
  addMesh('torso', latheMesh([[0.17, 1.2], [0.19, 1.28], [0.21, 1.38], [0.245, 1.5], [0.27, 1.64], [0.28, 1.76], [0.25, 1.9], [0.16, 1.98], [0.09, 2.04]], segCache.torsoMat));
  addMesh('torso', capsuleBetween([0.13, 2.0, 0.07], [0.13, 1.99, -0.06], 0.045, segCache.torsoMat));
  addMesh('torso', capsuleBetween([-0.13, 2.0, 0.07], [-0.13, 1.99, -0.06], 0.045, segCache.torsoMat));
  const pecL = muscleAt([-0.12, 1.72, 0.1], 0.14, [1, 0.55, 0.5], segCache.torsoMat);
  const pecR = muscleAt([0.12, 1.72, 0.1], 0.14, [1, 0.55, 0.5], segCache.torsoMat);
  addMesh('torso', pecL); addMesh('torso', pecR);
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.095, 0.02, 10, 24), deepRec().mat);
  collar.position.set(0, 2.01, 0.02); collar.rotation.x = Math.PI / 2; collar.scale.set(1.3, 0.72, 1); collar.castShadow = true;
  addMesh('torso', collar);

  // Arms: bare, right extended straight up with the ball, left trailing out
  addMesh('arm-r', sphereAt([P.shoulderR[0] + 0.02, P.shoulderR[1] + 0.03, 0], 0.105, goldRec().mat));
  addMesh('arm-l', sphereAt([P.shoulderL[0] - 0.02, P.shoulderL[1] + 0.03, 0], 0.1, goldRec().mat));
  addMesh('arm-r', limbBetween(P.shoulderR, P.elbowR, 0.075, 0.055, goldRec().mat));
  addMesh('arm-l', limbBetween(P.shoulderL, P.elbowL, 0.072, 0.054, goldRec().mat));
  addMesh('arm-r', limbBetween(P.elbowR, P.wristR, 0.055, 0.042, goldRec().mat));
  addMesh('arm-l', limbBetween(P.elbowL, P.wristL, 0.054, 0.04, goldRec().mat));
  addMesh('arm-r', muscleAt(P.wristR, 0.052, [0.85, 1, 1.1], goldRec().mat));
  addMesh('arm-l', muscleAt(P.wristL, 0.05, [0.85, 1, 1.1], goldRec().mat));

  // Joints
  addMesh('thigh-r', sphereAt(P.kneeR, 0.08, goldRec().mat));
  addMesh('thigh-l', sphereAt(P.kneeL, 0.075, goldRec().mat));
  addMesh('shin-r', sphereAt(P.ankleR, 0.05, goldRec().mat));
  addMesh('shin-l', sphereAt(P.ankleL, 0.048, goldRec().mat));
  addMesh('arm-r', sphereAt(P.elbowR, 0.052, goldRec().mat));
  addMesh('arm-l', sphereAt(P.elbowL, 0.05, goldRec().mat));
  addMesh('thigh-r', sphereAt(P.hipR, 0.085, deepRec().mat));
  addMesh('thigh-l', sphereAt(P.hipL, 0.085, deepRec().mat));

  // Head: egg skull with jaw taper on a natural neck, chin lifted slightly
  addMesh('head', capsuleBetween(P.neckA, P.neckB, 0.055, goldRec().mat));
  const head = sphereAt(P.head, 0.185, goldRec().mat);
  head.scale.set(0.85, 1.05, 0.92);
  head.rotation.x = -0.12;
  addMesh('head', head);
  const jaw = muscleAt([0.03, 2.24, 0.07], 0.12, [0.78, 0.55, 0.85], goldRec().mat);
  addMesh('head', jaw);

  return { ball: [0.51, 2.73, 0.19] };
}