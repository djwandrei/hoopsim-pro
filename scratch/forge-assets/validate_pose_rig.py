"""Independent GLB/rig checks for the interactive dunk silhouette.

Uses NumPy and Python's standard library. It never changes model or viewer files.
Run after authoring:
  python validate_pose_rig.py --output independent-pose-rig-validation.json
Optionally add --package PATH to verify the distributable and its manifest.
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import json
from pathlib import Path, PurePosixPath
import re
import struct
import zipfile

import numpy as np


SOURCE_SHA256 = "3e2c595d11023a4d34b412c9a7db8975996df16e57bf6d7ba55f3cd247e0e4f7"
ROOT = Path(__file__).resolve().parent


def require(condition, message):
    if not bool(condition):
        raise AssertionError(message)


def read_glb(path):
    blob = Path(path).read_bytes()
    require(len(blob) >= 20, "GLB is truncated")
    magic, version, length = struct.unpack_from("<4sII", blob)
    require((magic, version, length) == (b"glTF", 2, len(blob)), "GLB header mismatch")
    chunks = {}
    offset = 12
    while offset < len(blob):
        size, kind = struct.unpack_from("<II", blob, offset)
        require(size % 4 == 0 and offset + 8 + size <= len(blob), "GLB chunk range/alignment")
        require(kind not in chunks, "Duplicate GLB chunk")
        chunks[kind] = blob[offset + 8:offset + 8 + size]
        offset += 8 + size
    require(offset == len(blob), "GLB trailing bytes")
    return json.loads(chunks[0x4E4F534A]), chunks[0x004E4942], blob


def accessor(doc, binary, number):
    a = doc["accessors"][number]
    require("sparse" not in a, "Sparse accessors are outside this export contract")
    view = doc["bufferViews"][a["bufferView"]]
    require(view.get("buffer", 0) == 0, "Accessor does not use embedded buffer")
    dtype = np.dtype({5120: "i1", 5121: "u1", 5122: "<i2", 5123: "<u2",
                      5125: "<u4", 5126: "<f4"}[a["componentType"]])
    width = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}[a["type"]]
    stride = view.get("byteStride", dtype.itemsize * width)
    start = view.get("byteOffset", 0) + a.get("byteOffset", 0)
    end = start + max(0, a["count"] - 1) * stride + dtype.itemsize * width
    require(start % dtype.itemsize == 0 and stride >= dtype.itemsize * width,
            "Accessor alignment/stride mismatch")
    require(end <= view.get("byteOffset", 0) + view["byteLength"] <= len(binary),
            "Accessor exceeds its buffer view")
    data = np.ndarray((a["count"], width), dtype=dtype, buffer=binary,
                      offset=start, strides=(stride, dtype.itemsize)).copy()
    if a.get("normalized"):
        require(dtype.kind in "ui", "Invalid normalized accessor component type")
        data = data.astype(float) / np.iinfo(dtype).max
        if dtype.kind == "i":
            data = np.maximum(data, -1)
    return data


def js_object(path, symbol):
    text = Path(path).read_text(encoding="utf-8")
    match = re.search(r"(?:globalThis|window)\." + re.escape(symbol) + r"\s*=\s*", text)
    require(match is not None, f"Missing JavaScript data symbol {symbol}")
    result, _ = json.JSONDecoder().raw_decode(text[match.end():].lstrip())
    return result


def translation(point):
    matrix = np.eye(4)
    matrix[:3, 3] = point
    return matrix


def axis_rotation(axis, degrees):
    axis = np.asarray(axis, dtype=float)
    axis /= np.linalg.norm(axis)
    x, y, z = axis
    angle = np.deg2rad(degrees)
    c, s = np.cos(angle), np.sin(angle)
    cross = np.array([[0, -z, y], [z, 0, -x], [-y, x, 0]])
    result = np.eye(4)
    result[:3, :3] = c * np.eye(3) + (1 - c) * np.outer(axis, axis) + s * cross
    return result


def gltf_local(node):
    if "matrix" in node:
        require(not any(key in node for key in ("translation", "rotation", "scale")),
                "Node combines a matrix and TRS")
        return np.asarray(node["matrix"], dtype=float).reshape(4, 4).T
    x, y, z, w = node.get("rotation", [0, 0, 0, 1])
    require(np.isclose(x*x + y*y + z*z + w*w, 1, atol=1e-5), "Non-unit node quaternion")
    rot = np.array([[1-2*(y*y+z*z), 2*(x*y-z*w), 2*(x*z+y*w)],
                    [2*(x*y+z*w), 1-2*(x*x+z*z), 2*(y*z-x*w)],
                    [2*(x*z-y*w), 2*(y*z+x*w), 1-2*(x*x+y*y)]])
    matrix = translation(node.get("translation", [0, 0, 0]))
    matrix[:3, :3] = rot @ np.diag(node.get("scale", [1, 1, 1]))
    return matrix


def gltf_worlds(doc):
    nodes = doc["nodes"]
    parents = [-1] * len(nodes)
    for parent, node in enumerate(nodes):
        for child in node.get("children", []):
            require(0 <= child < len(nodes) and parents[child] == -1,
                    "Invalid child index or multiple parents")
            parents[child] = parent
    worlds, visiting = {}, set()

    def world(index):
        if index in worlds:
            return worlds[index]
        require(index not in visiting, "Cyclic node hierarchy")
        visiting.add(index)
        local = gltf_local(nodes[index])
        worlds[index] = local if parents[index] < 0 else world(parents[index]) @ local
        visiting.remove(index)
        return worlds[index]

    for index in range(len(nodes)):
        world(index)
    return np.asarray([worlds[i] for i in range(len(nodes))]), parents


def rig_worlds(rig, pose):
    bones = rig["bones"]
    pivots = np.asarray([bone["pivot"] for bone in bones], dtype=float)
    parents = [(-1 if bone.get("parent") is None else int(bone["parent"])) for bone in bones]
    if not pose["ballAttached"]:
        parents[rig["ballIndex"]] = 0
    rotations = np.asarray(pose["rotations"], dtype=float)
    offsets = np.asarray(pose["translations"], dtype=float)
    require(rotations.shape == offsets.shape == (len(bones), 3), "Pose vector dimensions")
    worlds, visiting = {}, set()

    def world(index):
        if index in worlds:
            return worlds[index]
        require(index not in visiting, "Cyclic rig hierarchy")
        visiting.add(index)
        parent = parents[index]
        require(-1 <= parent < len(bones) and parent != index, "Invalid rig parent")
        relative = pivots[index] - (pivots[parent] if parent >= 0 else 0) + offsets[index]
        local = translation(relative)
        for axis, angle in zip(bones[index]["axes"], rotations[index]):
            local = local @ axis_rotation(axis, angle)
        worlds[index] = local if parent < 0 else world(parent) @ local
        visiting.remove(index)
        return worlds[index]

    global_matrices = np.asarray([world(i) for i in range(len(bones))])
    skin_matrices = np.asarray([global_matrices[i] @ translation(-pivots[i])
                                for i in range(len(bones))])
    return global_matrices, skin_matrices


def skin_points(points, joints, weights, matrices, normals=None):
    output = np.zeros_like(points, dtype=float)
    normal_output = None if normals is None else np.zeros_like(normals, dtype=float)
    for slot in range(joints.shape[1]):
        selected = matrices[joints[:, slot]]
        changed = np.einsum("nij,nj->ni", selected[:, :3, :3], points) + selected[:, :3, 3]
        output += changed * weights[:, slot, None]
        if normals is not None:
            normal_output += np.einsum("nij,nj->ni", selected[:, :3, :3], normals) * weights[:, slot, None]
    if normals is not None:
        lengths = np.linalg.norm(normal_output, axis=1)
        require((lengths > 1e-8).all(), "Representative pose cancels a vertex normal")
        normal_output /= lengths[:, None]
    return output, normal_output


def empty_pose(rig):
    count = len(rig["bones"])
    return {"rotations": [[0., 0., 0.] for _ in range(count)],
            "translations": [[0., 0., 0.] for _ in range(count)], "ballAttached": True}


def bone_descendants(rig, bone_index):
    selected = {bone_index}
    changed = True
    while changed:
        changed = False
        for index, bone in enumerate(rig["bones"]):
            if bone.get("parent") in selected and index not in selected:
                selected.add(index)
                changed = True
    return selected


def validate(root, package=None):
    source_doc, source_bin, source_bytes = read_glb(root / "basketball-dunk-silhouette.glb")
    source_hash = hashlib.sha256(source_bytes).hexdigest()
    require(source_hash == SOURCE_SHA256, "Original final450k model was modified")
    primitive = source_doc["meshes"][0]["primitives"][0]
    positions = accessor(source_doc, source_bin, primitive["attributes"]["POSITION"])
    normals = accessor(source_doc, source_bin, primitive["attributes"]["NORMAL"])
    faces = accessor(source_doc, source_bin, primitive["indices"]).reshape(-1, 3)
    source_parts = source_doc["meshes"][0]["extras"]["parts"]
    ball_part = next(part for part in source_parts if part["name"] == "basketball")
    first_ball, ball_count = ball_part["firstVertex"], ball_part["vertexCount"]
    body_faces = faces[:sum(part["triangleCount"] for part in source_parts if part["name"] != "basketball")]
    rig = js_object(root / "rig-data.js", "SILHOUETTE_RIG")
    require(rig["sourceSha256"] == source_hash and rig["vertexCount"] == len(positions),
            "Rig provenance or vertex count mismatch")
    bones, bone_count = rig["bones"], len(rig["bones"])
    require(rig["ballRange"] == {"firstVertex": first_ball, "count": ball_count}, "Ball range mismatch")
    joints = np.frombuffer(base64.b64decode(rig["jointsBase64"]), dtype="u1").reshape(-1, 4)
    weights = np.frombuffer(base64.b64decode(rig["weightsBase64"]), dtype="<f4").reshape(-1, 4)
    require(joints.shape == weights.shape == (len(positions), 4), "Packed rig array dimensions")
    require(joints.max() < bone_count, "Joint index exceeds bone array")
    require(np.isfinite(weights).all() and (weights >= 0).all() and (weights <= 1).all(),
            "Invalid skin weights")
    require(np.allclose(weights.sum(axis=1), 1, atol=1e-6, rtol=0), "Weights do not sum to one")
    require(np.isfinite(np.asarray([bone["pivot"] for bone in bones])).all(), "Non-finite rig pivot")
    for bone in bones:
        axes = np.asarray(bone["axes"], dtype=float)
        require(axes.shape == (3, 3) and np.isfinite(axes).all(), "Invalid bone axes")
        require(np.allclose(np.linalg.norm(axes, axis=1), 1, atol=1e-6), "Non-unit bone axis")
    ball_index = rig["ballIndex"]
    ball_active_joints = joints[first_ball:][weights[first_ball:] > 0]
    require((ball_active_joints == ball_index).all(), "Ball contains deforming body weights")
    require((joints[:first_ball][weights[:first_ball] > 0] < ball_index).all(),
            "Body is influenced by ball joint")
    zero = empty_pose(rig)
    require(rig["defaultPose"] == zero, "Default pose is not the source bind pose")
    zero_globals, zero_skin = rig_worlds(rig, zero)
    require(np.allclose(zero_skin, np.eye(4), atol=1e-12), "Zero rig skin matrices are not identity")
    zero_points, zero_normals = skin_points(positions, joints, weights, zero_skin, normals)
    zero_error = float(np.abs(zero_points - positions).max())
    require(zero_error < 2e-6, "Zero interactive pose changes original geometry")

    doc, binary, rigged_bytes = read_glb(root / "basketball-dunk-poseable.glb")
    worlds, parents = gltf_worlds(doc)
    primitives = [(node_index, primitive) for node_index, node in enumerate(doc["nodes"])
                  if "mesh" in node for primitive in doc["meshes"][node["mesh"]]["primitives"]]
    body_node, body_primitive = next((node, primitive) for node, primitive in primitives
                                    if "JOINTS_0" in primitive["attributes"])
    body_attributes = body_primitive["attributes"]
    gv = accessor(doc, binary, body_attributes["POSITION"])
    gn = accessor(doc, binary, body_attributes["NORMAL"])
    gf = accessor(doc, binary, body_primitive["indices"]).reshape(-1, 3)
    gj = accessor(doc, binary, body_attributes["JOINTS_0"]).astype(int)
    gw = accessor(doc, binary, body_attributes["WEIGHTS_0"])
    require(np.array_equal(gv, positions[:first_ball]), "Rigged GLB changes original body positions")
    require(np.array_equal(gn, normals[:first_ball]), "Rigged GLB changes original body normals")
    require(np.array_equal(gf, body_faces), "Rigged GLB changes original body triangles")
    require(np.array_equal(gj, joints[:first_ball]) and np.array_equal(gw, weights[:first_ball]),
            "GLB and offline viewer disagree on skin weights or joints")
    skin = doc["skins"][doc["nodes"][body_node]["skin"]]
    skin_joints = skin["joints"]
    require(len(skin_joints) == ball_index and len(set(skin_joints)) == len(skin_joints),
            "Skin joint list is invalid")
    require(gj.max() < len(skin_joints), "GLB joint indices exceed skin joints")
    binds = accessor(doc, binary, skin["inverseBindMatrices"]).reshape(-1, 4, 4).transpose(0, 2, 1)
    require(len(binds) == len(skin_joints), "Inverse-bind count mismatch")
    bind_skin = worlds[skin_joints] @ binds
    inverse_bind_error = float(np.abs(bind_skin - np.eye(4)).max())
    require(inverse_bind_error < 2e-6, "GLB inverse binds do not restore source geometry")
    for index, node_index in enumerate(skin_joints):
        expected_parent = bones[index].get("parent")
        require(parents[node_index] == (-1 if expected_parent is None or expected_parent < 0
                                       else skin_joints[expected_parent]), "Bone hierarchy disagrees with rig")
        require(np.allclose(worlds[node_index], zero_globals[index], atol=2e-6), "Bone bind transforms disagree")
    gltf_points, gltf_normals = skin_points(gv, gj, gw, bind_skin, gn)
    gltf_zero_error = float(np.abs(gltf_points - positions[:first_ball]).max())
    require(gltf_zero_error < 3e-6, "GLB zero-pose world geometry mismatch")
    ball_node, ball_primitive = next((node, primitive) for node, primitive in primitives
                                    if node != body_node)
    require(parents[ball_node] == skin_joints[rig["handIndex"]], "Ball is not attached to raised wrist")
    bv = accessor(doc, binary, ball_primitive["attributes"]["POSITION"])
    bn = accessor(doc, binary, ball_primitive["attributes"]["NORMAL"])
    bf = accessor(doc, binary, ball_primitive["indices"]).reshape(-1, 3)
    require(len(bv) == ball_count and np.array_equal(bn, normals[first_ball:]),
            "Rigged ball vertex or normal mismatch")
    require(np.array_equal(bf, faces[len(body_faces):] - first_ball), "Rigged ball triangles mismatch")
    world_ball = bv @ worlds[ball_node][:3, :3].T + worlds[ball_node][:3, 3]
    ball_bind_error = float(np.abs(world_ball - positions[first_ball:]).max())
    require(ball_bind_error < 3e-6, "Ball zero-pose placement changes source")

    fixtures = json.loads((root / "pose-qa-fixtures.json").read_text())
    locality = []
    for group in fixtures.get("localityGroups", []):
        for index in group["bones"]:
            active = ((joints == index) & (weights > 0)).any(axis=1)
            require(active.any(), f"Expected localized bone {index} has no vertex influence")
            supported = positions[active]
            pivot_distances = np.linalg.norm(supported - bones[index]["pivot"], axis=1)
            require((supported >= np.asarray(group["minimum"])).all()
                    and (supported <= np.asarray(group["maximum"])).all(),
                    f"Bone {index} influences geometry outside {group['name']}")
            require(pivot_distances.max() <= group["maximumPivotDistanceMeters"],
                    f"Bone {index} has distant unrelated influence")
            locality.append({"group": group["name"], "bone": index, "vertices": int(active.sum()),
                             "maximumPivotDistanceMeters": float(pivot_distances.max())})
    results = []
    for fixture in fixtures["bends"]:
        index = fixture["bone"]
        limits = np.asarray(bones[index]["limits"])
        axis = next(axis for axis in fixture["preferredAxes"] if np.abs(limits[axis]).max() > 0)
        degrees = float(np.clip(fixture["degrees"], *limits[axis]))
        if abs(degrees) < 1e-4:
            degrees = float(np.clip(-fixture["degrees"], *limits[axis]))
        require(abs(degrees) > 0, f"Fixture {fixture['name']} has no allowed motion")
        pose = empty_pose(rig)
        pose["rotations"][index][axis] = degrees
        globals_, matrices = rig_worlds(rig, pose)
        moved, moved_normals = skin_points(positions, joints, weights, matrices, normals)
        require(np.isfinite(moved).all() and np.isfinite(moved_normals).all(),
                f"Non-finite representative bend {fixture['name']}")
        require(np.allclose(np.linalg.norm(moved_normals, axis=1), 1, atol=1e-6),
                "Representative normals are not unit length")
        affected = np.isin(joints, list(bone_descendants(rig, index))) & (weights > 0)
        unaffected = ~affected.any(axis=1)
        fixed_error = float(np.abs(moved[unaffected] - zero_points[unaffected]).max()) if unaffected.any() else 0.
        require(fixed_error < 1e-8, f"Bend {fixture['name']} moves unrelated vertices")
        movement = np.linalg.norm(moved - zero_points, axis=1)
        require((movement > 1e-5).any(), f"Bend {fixture['name']} moves no geometry")
        ball_points = moved[first_ball:]
        center = globals_[ball_index][:3, 3]
        radii = np.linalg.norm(ball_points - center, axis=1)
        source_radii = np.linalg.norm(positions[first_ball:] - bones[ball_index]["pivot"], axis=1)
        require(np.allclose(radii, source_radii, atol=2e-6), "Ball deforms during representative bend")
        results.append({"name": fixture["name"], "bone": index, "axis": axis, "degrees": degrees,
                        "movingVertices": int((movement > 1e-5).sum()),
                        "maximumMovementMeters": float(movement.max()),
                        "unaffectedMaximumErrorMeters": fixed_error})

    extremes = []
    for index in fixtures.get("limitExtremeBones", []):
        for axis, limits in enumerate(bones[index]["limits"]):
            if axis > 0 and max(abs(value) for value in limits) < 8:
                continue
            for degrees in sorted(set(limits)):
                if degrees == 0:
                    continue
                pose = empty_pose(rig)
                pose["rotations"][index][axis] = degrees
                _, matrices = rig_worlds(rig, pose)
                moved, moved_normals = skin_points(positions, joints, weights, matrices, normals)
                require(np.isfinite(moved).all() and np.isfinite(moved_normals).all(),
                        f"Non-finite limit pose at bone {index}, axis {axis}, angle {degrees}")
                normal_error = float(np.abs(np.linalg.norm(moved_normals, axis=1) - 1).max())
                require(normal_error < 1e-6, "Limit pose normals are not normalized")
                triangle = moved[faces]
                area64 = np.linalg.norm(np.cross(triangle[:, 1] - triangle[:, 0],
                                                 triangle[:, 2] - triangle[:, 0]), axis=1)
                true_collapsed = int((area64 == 0).sum())
                require(true_collapsed == 0, f"True collapsed triangle in bone {index} limit pose")
                triangle32 = moved.astype("<f4")[faces]
                area32 = np.linalg.norm(np.cross(triangle32[:, 1] - triangle32[:, 0],
                                                 triangle32[:, 2] - triangle32[:, 0]), axis=1)
                extremes.append({"bone": index, "name": bones[index]["name"], "axis": axis,
                                 "degrees": degrees, "trueCollapsedTriangles": true_collapsed,
                                 "float32QuantizedCollapsedTriangles": int((area32 == 0).sum()),
                                 "minimumDoublePrecisionArea2": float(area64.min()),
                                 "minimumFloat32Area2": float(area32.min()),
                                 "normalLengthMaximumError": normal_error})

    wrist_pose = empty_pose(rig)
    wrist_pose["rotations"][rig["handIndex"]][0] = fixtures["ballWristDegrees"]
    held_globals, held_skin = rig_worlds(rig, wrist_pose)
    ball_pivot = np.asarray(bones[ball_index]["pivot"], dtype=float)
    wrist_skin = held_skin[rig["handIndex"]]
    expected_held_center = wrist_skin[:3, :3] @ ball_pivot + wrist_skin[:3, 3]
    require(np.allclose(held_globals[ball_index][:3, 3], expected_held_center, atol=1e-10),
            "Held ball does not follow wrist transform")
    detached_pose = json.loads(json.dumps(wrist_pose))
    detached_pose["ballAttached"] = False
    detached_globals, _ = rig_worlds(rig, detached_pose)
    require(np.allclose(detached_globals[ball_index][:3, 3], ball_pivot, atol=1e-10),
            "Detached ball is still driven by wrist")
    target = held_globals[ball_index][:3, 3]
    root_pivot = np.asarray(bones[0]["pivot"], dtype=float)
    root_inverse = np.linalg.inv(detached_globals[0])
    detached_local_center = root_inverse[:3, :3] @ target + root_inverse[:3, 3]
    detached_pose["translations"][ball_index] = (detached_local_center - ball_pivot + root_pivot).tolist()
    detached_preserved, _ = rig_worlds(rig, detached_pose)
    require(np.allclose(detached_preserved[ball_index][:3, 3], target, atol=1e-10),
            "Translation-preserving detach changes ball placement")
    wrist_pose["ballAttached"] = True
    wrist_inverse = np.linalg.inv(held_globals[rig["handIndex"]])
    held_local_center = wrist_inverse[:3, :3] @ target + wrist_inverse[:3, 3]
    wrist_pivot = np.asarray(bones[rig["handIndex"]]["pivot"], dtype=float)
    wrist_pose["translations"][ball_index] = (held_local_center - ball_pivot + wrist_pivot).tolist()
    reattached_globals, _ = rig_worlds(rig, wrist_pose)
    require(np.allclose(reattached_globals[ball_index][:3, 3], target, atol=1e-10),
            "Translation-preserving reattach changes ball placement")

    report = {"status": "passed", "sourceSha256": source_hash,
              "riggedGlbSha256": hashlib.sha256(rigged_bytes).hexdigest(),
              "sourceVertices": len(positions), "sourceTriangles": len(faces),
              "boneCount": bone_count, "skinBoneCount": len(skin_joints),
              "weightSumMaximumError": float(np.abs(weights.sum(axis=1) - 1).max()),
              "zeroPoseMaximumPositionErrorMeters": zero_error,
              "gltfInverseBindMaximumError": inverse_bind_error,
              "gltfZeroPoseMaximumPositionErrorMeters": gltf_zero_error,
              "gltfBallBindMaximumErrorMeters": ball_bind_error,
              "bodyGeometryAndViewerWeightParity": "exact",
              "localizedHandAndFootWeights": locality,
              "representativeBends": results,
              "singleAxisLimitExtremes": extremes,
              "limitExtremeSummary": {"testedPoses": len(extremes), "trueCollapsedTriangles": 0,
                                      "float32QuantizedCollapsedTriangles":
                                      sum(item["float32QuantizedCollapsedTriangles"] for item in extremes),
                                      "posesWithFloat32QuantizedCollapse":
                                      sum(item["float32QuantizedCollapsedTriangles"] > 0 for item in extremes)},
              "ballChecks": ["rigid", "held_follows_wrist", "detached_ignores_wrist",
                             "detach_preserves_translation", "reattach_preserves_translation"]}
    if package:
        package = Path(package)
        with zipfile.ZipFile(package) as archive:
            require(archive.testzip() is None, "Package CRC failure")
            names = archive.namelist()
            manifests = [name for name in names if name.endswith("manifest.json")]
            require(len(manifests) == 1, "Package must have one file manifest")
            manifest_name = manifests[0]
            manifest = json.loads(archive.read(manifest_name))
            require(set(names) == set(manifest["files"]) | {manifest_name}, "Package member/manifest mismatch")
            for name in names:
                path = PurePosixPath(name)
                require(not path.is_absolute() and ".." not in path.parts, "Unsafe archive path")
                require(not any(part in ("__pycache__", ".geometry-runtime", ".build-cache", "versions")
                                for part in path.parts), "Package includes a cache/dependency/backup")
                data = archive.read(name)
                require(data == (root / name).read_bytes(), f"Package/local mismatch: {name}")
                if name != manifest_name:
                    meta = manifest["files"][name]
                    require(len(data) == meta["bytes"] and hashlib.sha256(data).hexdigest() == meta["sha256"],
                            f"Package manifest mismatch: {name}")
        report["package"] = {"name": package.name, "members": len(names), "byteParity": "all",
                             "sha256": hashlib.sha256(package.read_bytes()).hexdigest()}
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=ROOT)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--package", type=Path)
    parser.add_argument("--summary", action="store_true", help="Print concise results; output file remains complete")
    args = parser.parse_args()
    try:
        report = validate(args.root, args.package)
    except Exception as error:
        report = {"status": "failed", "errorType": type(error).__name__, "error": str(error)}
    text = json.dumps(report, indent=2) + "\n"
    if args.summary and report["status"] == "passed":
        selected = {key: value for key, value in report.items()
                    if key not in ("localizedHandAndFootWeights", "representativeBends", "singleAxisLimitExtremes")}
        selected["representativePoseCount"] = len(report["representativeBends"])
        selected["localizedWeightBoneCount"] = len(report["localizedHandAndFootWeights"])
        print(json.dumps(selected, indent=2))
    else:
        print(text, end="")
    if args.output:
        args.output.write_text(text, encoding="utf-8")
    return 0 if report["status"] == "passed" else 1


if __name__ == "__main__":
    raise SystemExit(main())
