"""Bounded derivative of the reviewed athlete; originals and head stay intact.

Correctives preserve the elbow's radial volume under the existing linear skin
blend. They use the same joint centers, weights and poses, rather than changing
limb lengths or concealing the crease with an accessory.
"""
import os
for name in ('OPENBLAS_NUM_THREADS', 'OMP_NUM_THREADS', 'MKL_NUM_THREADS'):
    os.environ[name] = '1'
import copy
import hashlib
import json
from pathlib import Path
import struct
import sys
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / 'public/studio-assets/forge/athlete'
SOURCE = Path('C:/Users/djwan/Documents/Codex/2026-10-07/basketball-silhouette')
BASE_MODEL = 'basketball-athlete-outfit-2e4b44a67c3c.glb'
BASE_RIG = 'dunk-rig-fb2458832ae9.json'
BASE_POSES = 'pose-cycle-ba931473eeb5.json'
EXPECTED_SHA = '2e4b44a67c3c610d7e831bed8b973b835cde3fe11529b51a9269ca46e82078c0'
sys.path.insert(0, str(SOURCE))
from build_basketball_presets import Pose, axis_rotation


def sha(raw): return hashlib.sha256(raw).hexdigest()
def encoded(doc): return (json.dumps(doc, indent=2) + '\n').encode()
def smooth(t):
    t = np.clip(t, 0, 1)
    return t * t * (3 - 2 * t)


raw = (ASSETS / BASE_MODEL).read_bytes()
assert sha(raw) == EXPECTED_SHA
size = struct.unpack_from('<I', raw, 12)[0]
doc = json.loads(raw[20:20 + size])
binary = bytearray(raw[28 + size:])
original = copy.deepcopy(doc)
binding = json.loads((ASSETS / BASE_RIG).read_text())
catalog = json.loads((ASSETS / BASE_POSES).read_text())
text = (SOURCE / 'athlete-rig-data.js').read_text()
rig = json.loads(text.split('=', 1)[1].strip().rstrip(';'))
anatomy = json.loads((SOURCE / 'athlete-anatomy.json').read_text())
assert binding['bones'] == [{key: bone[key] for key in ('name', 'parent', 'pivot', 'axes')} for bone in rig['bones']]


def read(index):
    item = doc['accessors'][index]; view = doc['bufferViews'][item['bufferView']]
    width = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}[item['type']]
    dtype = {5126: '<f4', 5125: '<u4', 5123: '<u2', 5121: 'u1'}[item['componentType']]
    return np.frombuffer(binary, dtype=dtype, count=item['count'] * width,
                         offset=view.get('byteOffset', 0) + item.get('byteOffset', 0)).reshape(-1, width).copy()


def replace(index, data):
    item = doc['accessors'][index]; view = doc['bufferViews'][item['bufferView']]
    start = view.get('byteOffset', 0) + item.get('byteOffset', 0)
    raw_array = np.asarray(data, dtype='<f4').tobytes()
    assert len(raw_array) == item['count'] * 12
    binary[start:start + len(raw_array)] = raw_array
    if 'min' in item: item['min'] = np.min(data, axis=0).tolist()
    if 'max' in item: item['max'] = np.max(data, axis=0).tolist()


def append(data, kind='VEC3', component=5126):
    while len(binary) % 4: binary.append(0)
    array = np.asarray(data, dtype={5126: '<f4', 5125: '<u4', 5121: 'u1'}[component]); start = len(binary)
    binary.extend(array.tobytes())
    view = len(doc['bufferViews'])
    doc['bufferViews'].append({'buffer': 0, 'byteOffset': start, 'byteLength': array.nbytes, 'target': 34962})
    index = len(doc['accessors'])
    doc['accessors'].append({'bufferView': view, 'componentType': component, 'count': len(array), 'type': kind,
                             'min': array.min(0).tolist(), 'max': array.max(0).tolist()})
    return index


def normals(points, faces):
    cross = np.cross(points[faces[:, 1]] - points[faces[:, 0]], points[faces[:, 2]] - points[faces[:, 0]])
    result = np.zeros_like(points)
    for slot in range(3): np.add.at(result, faces[:, slot], cross)
    return result / np.maximum(np.linalg.norm(result, axis=1)[:, None], 1e-20)


def actor(pose):
    result = Pose(rig, anatomy); result.pose = copy.deepcopy(pose)
    return result


# A modestly lower base, more hip hinge, and hands slightly ahead of the body.
defender = Pose(rig, anatomy)
defender.pose['ballVisible'] = False
defender.pose['rotations'][2][0] = 11
defender.pose['rotations'][3][0] = 9
defender.pose['rotations'][5][0] = -16
for side, sign, upper, fore in [('right', -1, 6, 7), ('left', 1, 9, 10)]:
    defender.aim(upper, fore, (sign * .78, -.57, .22))
    defender.aim(fore, fore + 1, (sign * .60, -.70, .38))
    defender.enforce_arm_flex(side)
    defender.hand(side, (sign * .52, -.79, .29), (0, 0, 1))
    defender.leg(side, (sign * .53, -.65, .54), (sign * .10, -.97, -.22), (sign * .20, -.025, .98))
    defender.planted_foot(side, (sign * .20, 0, .98))
defender.validate_joints()
catalog['poses'][2]['pose'] = defender.pose

inverse_bind = read(doc['skins'][0]['inverseBindMatrices']).reshape(-1, 4, 4).transpose(0, 2, 1)
skin_nodes = doc['skins'][0]['joints']
bone_indices = [next(i for i, bone in enumerate(rig['bones']) if bone['name'] == doc['nodes'][node]['name']) for node in skin_nodes]


def skin_matrices(pose):
    return actor(pose).matrices()[bone_indices] @ inverse_bind


def deform(points, joints, weights, matrices):
    transforms = np.einsum('nq,nqij->nij', weights, matrices[joints])
    result = np.einsum('nij,nj->ni', transforms, np.column_stack((points, np.ones(len(points)))))[:, :3]
    return result, transforms


# Keep the sole plane at ground level after changing the knee and hip angles.
defense_matrices = skin_matrices(defender.pose)
sole_min = []
for mesh in doc['meshes']:
    if mesh['name'] not in ('right-shoe', 'left-shoe'): continue
    attrs = mesh['primitives'][0]['attributes']
    posed, _ = deform(read(attrs['POSITION']), read(attrs['JOINTS_0']).astype(int), read(attrs['WEIGHTS_0']), defense_matrices)
    sole_min.append(float(posed[:, 1].min()))
defender.pose['translations'][0][1] = -min(sole_min)
for key in ('rotations', 'translations'): defender.pose[key] = np.round(defender.pose[key], 6).tolist()
catalog['poses'][2]['pose'] = defender.pose
catalog['additionalPoses'] = [copy.deepcopy(catalog['poses'][2])]
# Preserve the authored running dribble and its ball/hand clearance. Represent
# the ball's free world transform in wrist-local space so the existing cycle
# can interpolate it without reparenting the prop during a pose transition.
presets = json.loads((SOURCE / 'basketball-preset-poses.json').read_text())
dribble = copy.deepcopy(next(item for item in presets['presets'] if item['id'] == 'dribble'))
dribbler = actor(dribble['pose']); ball_world = dribbler.matrices()[rig['ballIndex']].copy()
dribbler.pose['ballAttached'] = True
dribbler.set_world_rotation(rig['ballIndex'], ball_world[:3, :3])
parent = dribbler.matrices()[8]
local = parent[:3, :3].T @ (ball_world[:3, 3] - parent[:3, 3])
rest = np.subtract(rig['bones'][rig['ballIndex']]['pivot'], rig['bones'][8]['pivot'])
dribbler.pose['translations'][rig['ballIndex']] = (local - rest).tolist()
assert np.max(np.abs(dribbler.matrices()[rig['ballIndex']] - ball_world)) < 1e-6
for key in ('rotations', 'translations'): dribbler.pose[key] = np.round(dribbler.pose[key], 6).tolist()
dribbler.validate_joints()
catalog['poses'][2] = {'id': 'dribble', 'label': 'Dribble', 'pose': dribbler.pose}
pose_ids = [item['id'] for item in catalog['poses']]
pose_matrices = [skin_matrices(item['pose']) for item in catalog['poses']]
changes = []


def volume_rotation(matrix):
    # Polar rotation removes shrinkage from a blend of rotations. It retains
    # the original centerline trajectory, avoiding a bulging DQ joint center.
    u, _, v = np.linalg.svd(matrix)
    rotation = u @ v
    negative = np.linalg.det(rotation) < 0
    u[negative, :, -1] *= -1
    return u @ v


for mesh in doc['meshes']:
    if mesh['name'] not in ('right-arm', 'left-arm', 'right-sleeve', 'left-sleeve'): continue
    primitive = mesh['primitives'][0]; attrs = primitive['attributes']
    points = read(attrs['POSITION']).astype(float); original_points = points.copy()
    joints = read(attrs['JOINTS_0']).astype(int); weights = read(attrs['WEIGHTS_0']).astype(float)
    faces = read(primitive['indices']).reshape(-1, 3).astype(int)
    right = mesh['name'].startswith('right'); upper, fore, hand = (6, 7, 8) if right else (9, 10, 11)
    elbow = np.asarray(rig['bones'][fore]['pivot'])
    axis = np.asarray(rig['bones'][hand]['pivot']) - elbow; axis /= np.linalg.norm(axis)
    along = (points - elbow) @ axis
    centers = elbow + along[:, None] * axis
    radial = points - centers
    ownership = np.sum(weights * ((joints == upper) | (joints == fore)), axis=1)
    region = ownership > .97
    # Soften the abrupt biceps/forearm swell, fading to zero at both shoulder
    # and wrist joins; the hand and torso boundaries retain exact positions.
    taper = 1 - .065 * np.exp(-((along + .15) / .075) ** 4) - .045 * np.exp(-((along - .105) / .055) ** 4)
    taper = 1 + (taper - 1) * smooth((along + .29) / .055) * smooth((.235 - along) / .04)
    points[region] = centers[region] + radial[region] * taper[region, None]
    base_normals = normals(points, faces)
    replace(attrs['POSITION'], points); replace(attrs['NORMAL'], base_normals)
    targets = []; metrics = []
    radial = points - centers
    local = region & (np.abs(along) < .13) & (np.linalg.norm(radial, axis=1) < .095)
    ids = np.flatnonzero(local)
    fade = 1 - smooth((np.abs(along[ids]) - .035) / .095)
    for matrices in pose_matrices:
        posed, transforms = deform(points, joints, weights, matrices)
        linear = transforms[ids, :3, :3]
        rot = volume_rotation(linear)
        center_pos = np.einsum('nij,nj->ni', transforms[ids], np.column_stack((centers[ids], np.ones(len(ids)))))[:, :3]
        restored = center_pos + np.einsum('nij,nj->ni', rot, radial[ids])
        desired = posed.copy()
        desired[ids] += (restored - posed[ids]) * (.90 * fade[:, None])
        delta = np.zeros_like(points)
        delta[ids] = np.linalg.solve(linear, (desired[ids] - posed[ids])[:, :, None])[:, :, 0]
        desired_normals = normals(desired, faces)
        normal_delta = np.zeros_like(points)
        # Only the corrected band changes normals. Boundaries fade to the
        # existing normal so sleeve joins remain smooth in every pose.
        recovered = np.linalg.solve(linear, desired_normals[ids, :, None])[:, :, 0]
        recovered /= np.maximum(np.linalg.norm(recovered, axis=1)[:, None], 1e-20)
        normal_delta[ids] = (recovered - base_normals[ids]) * fade[:, None]
        assert np.isfinite(delta).all() and np.max(np.linalg.norm(delta, axis=1)) < .10
        targets.append({'POSITION': append(delta), 'NORMAL': append(normal_delta)})
        metrics.append({'maxWorldCorrectionMeters': float(np.max(np.linalg.norm(desired - posed, axis=1))),
                        'minimumElbowBlendDeterminant': float(np.linalg.det(linear).min())})
    primitive['targets'] = targets
    mesh['weights'] = [1, 0, 0]
    mesh.setdefault('extras', {})['targetNames'] = pose_ids
    changes.append({'mesh': mesh['name'], 'correctedVertices': len(ids), 'maxTaperMeters': float(np.linalg.norm(points - original_points, axis=1).max()), 'poses': metrics})

# One conforming Loop subdivision pass on the jersey. Original armhole and
# neckline boundary vertices stay exact. Interior smoothing is deliberately
# partial, retaining fabric folds and keeping UV and donor-design placement.
jersey = next(mesh for mesh in doc['meshes'] if mesh['name'] == 'jersey')
primitive = jersey['primitives'][0]; attrs = primitive['attributes']
p = read(attrs['POSITION']).astype(float); uv = read(attrs['TEXCOORD_0'])
j = read(attrs['JOINTS_0']).astype(int); w = read(attrs['WEIGHTS_0'])
f = read(primitive['indices']).reshape(-1, 3).astype(int)
edge_rows = np.stack((f[:, [0, 1]], f[:, [1, 2]], f[:, [2, 0]]), axis=1).reshape(-1, 2)
edges, inverse, counts = np.unique(np.sort(edge_rows, axis=1), axis=0, return_inverse=True, return_counts=True)
opposites = np.zeros((len(edges), 3)); np.add.at(opposites, inverse, p[f[:, [2, 0, 1]].reshape(-1)])
midpoint = (p[edges[:, 0]] + p[edges[:, 1]]) * .5
interior_edges = counts == 2
midpoint[interior_edges] += .6 * (.375 * (p[edges[interior_edges, 0]] + p[edges[interior_edges, 1]]) + .125 * opposites[interior_edges] - midpoint[interior_edges])
boundary = np.zeros(len(p), dtype=bool); boundary[edges[counts != 2].ravel()] = True
degree = np.bincount(edges.ravel(), minlength=len(p)); neighbors = np.zeros_like(p)
np.add.at(neighbors, edges[:, 0], p[edges[:, 1]]); np.add.at(neighbors, edges[:, 1], p[edges[:, 0]])
beta = (5 / 8 - (3 / 8 + .25 * np.cos(2 * np.pi / np.maximum(degree, 1))) ** 2) / np.maximum(degree, 1)
smooth_p = p + .5 * (beta[:, None] * neighbors - (degree * beta)[:, None] * p)
smooth_p[boundary] = p[boundary]
displacement = smooth_p - p
displacement *= np.minimum(1, .004 / np.maximum(np.linalg.norm(displacement, axis=1), 1e-20))[:, None]
new_p = np.concatenate((p + displacement, midpoint))
new_uv = np.concatenate((uv, uv[edges].mean(1)))
dense = np.zeros((len(edges), len(skin_nodes)))
for end in range(2):
    for slot in range(4): np.add.at(dense, (np.arange(len(edges)), j[edges[:, end], slot]), w[edges[:, end], slot] * .5)
new_j = np.argsort(dense, axis=1)[:, -4:][:, ::-1]
new_w = np.take_along_axis(dense, new_j, axis=1); new_w /= new_w.sum(1)[:, None]
ab, bc, ca = (inverse.reshape(-1, 3) + len(p)).T
a, b, c = f.T
new_f = np.stack((np.column_stack((a, ab, ca)), np.column_stack((ab, b, bc)), np.column_stack((ca, bc, c)), np.column_stack((ab, bc, ca))), axis=1).reshape(-1, 3)
primitive['attributes'] = {'POSITION': append(new_p), 'NORMAL': append(normals(new_p, new_f)), 'TEXCOORD_0': append(new_uv, 'VEC2'),
                           'JOINTS_0': append(np.concatenate((j, new_j)), 'VEC4', 5121), 'WEIGHTS_0': append(np.concatenate((w, new_w)), 'VEC4')}
primitive['indices'] = append(new_f.reshape(-1, 1), 'SCALAR', 5125)
jersey_report = {'beforeTriangles': len(f), 'afterTriangles': len(new_f), 'boundaryVerticesPreserved': int(boundary.sum()),
                 'maximumOriginalVertexShiftMeters': float(np.linalg.norm(displacement, axis=1).max()), 'method': 'Partial Loop smoothing; conforming 4-way subdivision; fixed neckline and armhole boundaries'}
triangles = sum(doc['accessors'][mesh['primitives'][0]['indices']]['count'] // 3 for mesh in doc['meshes'])
assert triangles == 967181 and triangles <= 1000000

# Accessors outside the four arm/sleeve shells and jersey are byte-identical, including
# every head attribute, UV, index and skin weight. No triangles are added.
for mesh in original['meshes']:
    if mesh['name'] in ('right-arm', 'left-arm', 'right-sleeve', 'left-sleeve', 'jersey'): continue
    for index in [mesh['primitives'][0]['indices'], *mesh['primitives'][0]['attributes'].values()]:
        item = original['accessors'][index]; view = original['bufferViews'][item['bufferView']]
        start = view.get('byteOffset', 0); length = view['byteLength']
        assert binary[start:start + length] == raw[28 + size + start:28 + size + start + length]
doc['buffers'][0]['byteLength'] = len(binary)
json_bytes = json.dumps(doc, separators=(',', ':')).encode()
json_bytes += b' ' * ((-len(json_bytes)) % 4)
model_bytes = struct.pack('<III', 0x46546c67, 2, 12 + 8 + len(json_bytes) + 8 + len(binary)) + struct.pack('<II', len(json_bytes), 0x4e4f534a) + json_bytes + struct.pack('<II', len(binary), 0x004e4942) + binary
model_sha = sha(model_bytes)
binding['modelSha256'] = model_sha
catalog['modelSha256'] = model_sha
catalog['provenance']['method'] = 'Original dunk/shot/dribble joint centers and hand contact retained; centerline-preserving elbow correctives; athletic defense retained separately'
catalog['provenance']['basePoseAssetSha256'] = sha((ASSETS / BASE_POSES).read_bytes())
report = {'status': 'passed', 'baseModelSha256': EXPECTED_SHA, 'modelSha256': model_sha, 'triangles': triangles, 'triangleCap': 1000000,
          'headHandsAndOtherElementsPreserved': True, 'originalArmSkinWeightsAndJointAxesPreserved': True, 'changes': changes, 'jersey': jersey_report,
          'defenseJointFlexionDegrees': defender.validate_joints(), 'appUsed': False, 'deployed': False, 'archivesRebuilt': False}


def asset(prefix, suffix, data):
    value = {'path': f'{prefix}-{sha(data)[:12]}.{suffix}', 'bytes': len(data), 'sha256': sha(data)}
    dest = ASSETS / value['path']
    if dest.exists(): assert dest.read_bytes() == data
    else: dest.write_bytes(data)
    return value


release = json.loads((ASSETS / 'asset-receipt.json').read_text())
release['version'] = 'arm-cloth967k-20261010'
release['triangles'] = triangles
release['atlasSha256'] = sha((ROOT / 'src/components/forge/forgeUniformAtlas.js').read_bytes())
release['model'] = asset('basketball-athlete-outfit', 'glb', model_bytes)
release['rig'] = asset('dunk-rig', 'json', encoded(binding))
pose_pin = asset('pose-cycle', 'json', encoded(catalog))
pose_pin.update({'modelSha256': model_sha, 'rotationsPerPose': 2, 'poses': [item['id'] for item in catalog['poses']]})
release['armRefinement'] = {'baseModelSha256': EXPECTED_SHA, 'correctives': pose_pin['poses'], 'method': catalog['provenance']['method']}
(ASSETS / 'asset-receipt.json').write_bytes(encoded(release))
release['jerseyRefinement'] = jersey_report
release_fields = {key: release[key] for key in ('version', 'triangles', 'controls', 'skinJoints', 'elements', 'sourceSha256', 'model', 'rig', 'atlasSha256', 'catalog', 'armRefinement', 'jerseyRefinement')}
(ROOT / 'src/components/forge/forgeAthleteRelease.js').write_text('// Generated by scripts/refine-forge-arms.py; original authored assets are preserved.\nexport const FORGE_ATHLETE_RELEASE = ' + json.dumps(release_fields, indent=2) + ';\n')
(ROOT / 'src/components/forge/forgePoseRelease.js').write_text('// Generated by scripts/refine-forge-arms.py; matched to the elbow-corrected derivative.\nexport const FORGE_POSE_RELEASE = ' + json.dumps(pose_pin, indent=2) + ';\n')
output = ROOT / 'docs/forge-arm-refinement'; output.mkdir(parents=True, exist_ok=True)
(output / 'geometry-validation.json').write_bytes(encoded(report))
print(json.dumps(report), flush=True)
