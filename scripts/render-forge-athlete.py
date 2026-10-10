"""Local CPU review of actual Three.js pose matrices and wardrobe atlases.

Use after FORGE_REVIEW_DIR=docs/forge-athlete-800k/runtime-review node --test
tests/forge-athlete-upgrade.test.js. No browser or app window is used.
"""
import os
for name in ('OPENBLAS_NUM_THREADS', 'OMP_NUM_THREADS', 'MKL_NUM_THREADS'):
    os.environ[name] = '1'
import hashlib
import json
import math
from pathlib import Path
import struct
import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'docs/forge-athlete-800k'
CAPTURES = OUT / 'runtime-review'


def matrix(values):
    return np.array(values, dtype=float).reshape(4, 4).T


def load():
    release = json.loads((ROOT / 'public/studio-assets/forge/athlete/asset-receipt.json').read_text())
    path = ROOT / 'public/studio-assets/forge/athlete' / release['model']['path']
    raw = path.read_bytes()
    assert hashlib.sha256(raw).hexdigest() == release['model']['sha256']
    length = struct.unpack_from('<I', raw, 12)[0]
    doc = json.loads(raw[20:20 + length]); binary = raw[28 + length:]
    def read(index):
        item = doc['accessors'][index]; view = doc['bufferViews'][item['bufferView']]
        width = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}[item['type']]
        dtype = {5126: '<f4', 5125: '<u4', 5123: '<u2', 5121: 'u1'}[item['componentType']]
        return np.frombuffer(binary, dtype=dtype, count=item['count'] * width,
                             offset=view.get('byteOffset', 0) + item.get('byteOffset', 0)).reshape(-1, width)
    return release, doc, read


def posed(label, doc, read):
    records = json.loads((CAPTURES / (label + '.json')).read_text())
    rows = []
    for rec in records['meshes']:
        if not rec['visible']: continue
        if rec.get('geometryData'):
            geometry = rec['geometryData']
            points = np.array(geometry['position']).reshape(-1, 3)
            normals = np.array(geometry['normal']).reshape(-1, 3)
            joints = np.array(geometry['skinIndex'], dtype=int).reshape(-1, 4)
            weights = np.array(geometry['skinWeight']).reshape(-1, 4)
            faces = np.arange(len(points)).reshape(-1, 3)
            uv = np.zeros((len(points), 2))
        else:
            node = next(node for node in doc['nodes'] if node.get('name') == rec['geometryName'])
            mesh = doc['meshes'][node['mesh']]; primitive = mesh['primitives'][0]; attr = primitive['attributes']
            points = read(attr['POSITION']).astype(float); normals = read(attr['NORMAL']).astype(float)
            for weight, target in zip(rec.get('morphTargetInfluences', []), primitive.get('targets', [])):
                points += weight * read(target['POSITION'])
                if 'NORMAL' in target: normals += weight * read(target['NORMAL'])
            if 'boneMatrices' in rec:
                joints, weights = read(attr['JOINTS_0']), read(attr['WEIGHTS_0'])
            faces = read(primitive['indices']).reshape(-1, 3)
            uv = read(attr['TEXCOORD_0']) if 'TEXCOORD_0' in attr else np.zeros((len(points), 2))
        world = matrix(rec['matrixWorld'])
        if 'boneMatrices' in rec:
            bones = np.array(rec['boneMatrices']).reshape(-1, 4, 4).transpose(0, 2, 1)
            bind, inverse = matrix(rec['bindMatrix']), matrix(rec['bindMatrixInverse'])
            transform = np.einsum('nq,nqij->nij', weights, bones[joints])
            transform = np.einsum('ab,nbc,cd->nad', inverse, transform, bind)
            points = np.einsum('nij,nj->ni', transform, np.column_stack((points, np.ones(len(points)))))[:, :3]
            normals = np.einsum('nij,nj->ni', transform[:, :3, :3], normals)
        points = np.column_stack((points, np.ones(len(points)))) @ world.T
        normals = normals @ world[:3, :3].T
        normals /= np.maximum(np.linalg.norm(normals, axis=1)[:, None], 1e-20)
        color = np.array(rec['color']); color = np.where(color <= .0031308, color * 12.92, 1.055 * np.power(color, 1 / 2.4) - .055) * 255
        texture = np.array(Image.open(CAPTURES / rec['texture']).convert('RGB')) if rec.get('texture') else None
        rows.append((points[:, :3], normals, faces, uv, color, texture, rec['silhouette']))
    return rows


def render(rows, yaw, fit):
    width, height = 840, 1160
    half_y = max(fit['halfY'], fit['sweep'] * height / width)
    scale = height / (2 * half_y)
    c, s = math.cos(yaw), math.sin(yaw); rotate = np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])
    polys, depths, colors = [], [], []
    for points, normals, faces, uv, tone, texture, silhouette in rows:
        points = points @ rotate.T; normals = normals @ rotate.T
        tri = points[faces]; cross = np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0]); visible = cross[:, 2] > 0
        faces, tri = faces[visible], tri[visible]
        normal = normals[faces].mean(1); normal /= np.maximum(np.linalg.norm(normal, axis=1)[:, None], 1e-20)
        if silhouette:
            edge = (1 - np.abs(normal[:, 2])) ** 7
            color = np.tile((7, 9, 13), (len(faces), 1)) + edge[:, None] * np.array((25, 28, 33))
        else:
            light = np.array((-.32, .45, .85)); light /= np.linalg.norm(light)
            shade = .55 + .45 * np.maximum(0, normal @ light)
            if texture is None: color = np.tile(tone, (len(faces), 1))
            else:
                sample = uv[faces].mean(1)
                x = np.clip((sample[:, 0] * texture.shape[1]).astype(int), 0, texture.shape[1] - 1)
                y = np.clip((sample[:, 1] * texture.shape[0]).astype(int), 0, texture.shape[0] - 1)
                color = texture[y, x].astype(float) * (tone / 255)
            color *= shade[:, None]
        xy = tri[:, :, :2] * scale; xy[:, :, 0] += width / 2; xy[:, :, 1] = height / 2 - xy[:, :, 1]
        inside = (xy[:, :, 0].max(1) >= 0) & (xy[:, :, 0].min(1) <= width) & (xy[:, :, 1].max(1) >= 0) & (xy[:, :, 1].min(1) <= height)
        polys.append(xy[inside]); depths.append(tri[inside, :, 2].mean(1)); colors.append(color[inside])
    poly, depth, color = np.concatenate(polys), np.concatenate(depths), np.clip(np.concatenate(colors), 0, 255).astype('uint8')
    image = Image.new('RGB', (width, height), (244, 247, 246)); draw = ImageDraw.Draw(image)
    for index in np.argsort(depth): draw.polygon([tuple(p) for p in poly[index]], fill=tuple(color[index]))
    return image.resize((420, 580), Image.Resampling.LANCZOS)


def main():
    release, doc, read = load()
    # Read the same camera bounds independently from the actual posed model.
    sample = posed('complete', doc, read); p = np.concatenate([row[0] for row in sample]); size = np.ptp(p, axis=0)
    fit = {'halfY': float(size[1] * .57), 'sweep': float(np.hypot(size[0], size[2]) * .57)}
    sheet = Image.new('RGB', (1680, 1830), (244, 247, 246)); draw = ImageDraw.Draw(sheet)
    for row, label in enumerate(('empty', 'partial', 'complete')):
        model = posed(label, doc, read)
        for col, (yaw, name) in enumerate(((0, 'Front'), (-.65, 'Three-quarter'), (math.pi / 2, 'Side'), (math.pi, 'Rear'))):
            sheet.paste(render(model, yaw, fit), (420 * col, 610 * row))
            draw.text((420 * col + 14, 610 * row + 587), label.title() + ' / ' + name, fill=(30, 50, 60))
        print('CPU rendered Forge state: ' + label, flush=True)
    sheet.save(OUT / 'forge-athlete-800k-review.png')
    report = {'status': 'passed', 'modelSha256': release['model']['sha256'], 'rigSha256': release['rig']['sha256'], 'fit': fit,
              'states': ['empty', 'partial', 'complete'], 'views': ['front', 'three-quarter', 'side', 'rear'],
              'method': 'CPU triangle raster of actual Three.js matrices and real runtime canvas textures',
              'limitations': 'Approximate local lighting and centroid texture sampling; browser GPU shading and complete game clicking not exercised',
              'appUsed': False, 'deployed': False}
    (OUT / 'render-validation.json').write_text(json.dumps(report, indent=2) + '\n')


if __name__ == '__main__': main()
