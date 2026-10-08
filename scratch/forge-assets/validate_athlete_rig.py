"""Independent validation for the redesigned athlete source, rig, and presets.

Uses NumPy plus the shared read-only helpers in validate_pose_rig.py.
It preserves the original dunk asset and its QA reports.
"""
from __future__ import annotations

import argparse
import base64
import copy
import hashlib
import json
from pathlib import Path, PurePosixPath
import re
import zipfile

import numpy as np

import validate_pose_rig as qa


ROOT = Path(__file__).resolve().parent


def serialized_object(path, required_keys):
    source = Path(path).read_text(encoding="utf-8")
    for match in re.finditer(r"(?:globalThis|window)\.[A-Za-z_][A-Za-z_0-9]*\s*=\s*", source):
        try:
            value, _ = json.JSONDecoder().raw_decode(source[match.end():].lstrip())
        except json.JSONDecodeError:
            continue
        if isinstance(value, dict) and all(key in value for key in required_keys):
            return value
    raise AssertionError(f"No serialized object with keys {required_keys} found")


def rig_object(path):
    return serialized_object(path, ("bones", "weightsBase64"))


def inspect_source(root, doc, points, normals, faces, source_bytes):
    qa.require(np.isfinite(points).all() and np.isfinite(normals).all(), "Source has non-finite geometry")
    qa.require(np.abs(np.linalg.norm(normals, axis=1) - 1).max() < 1e-6, "Source normals are not unit")
    qa.require(faces.min() >= 0 and faces.max() < len(points), "Invalid source triangle index")
    parts = []
    for part in doc["meshes"][0]["extras"]["parts"]:
        first, count = part["firstVertex"], part["vertexCount"]
        triangles = faces[((faces >= first) & (faces < first + count)).all(axis=1)]
        qa.require(len(triangles) == part["triangleCount"], "Part triangle count mismatch")
        a, b, c = (points[triangles[:, i]].astype(float) for i in range(3))
        cross = np.cross(b - a, c - a)
        area = np.linalg.norm(cross, axis=1)
        opposing = np.einsum("ij,ij->i", cross, normals[triangles].sum(axis=1)) < 0
        edges = np.concatenate((triangles[:, [0, 1]], triangles[:, [1, 2]], triangles[:, [2, 0]]))
        unique, inverse, counts = np.unique(np.sort(edges, axis=1), axis=0, return_inverse=True, return_counts=True)
        directions = np.bincount(inverse, weights=np.where(edges[:, 0] < edges[:, 1], 1, -1), minlength=len(unique))
        qa.require((counts == 2).all() and (directions == 0).all(), "Source has open, nonmanifold, or inconsistent edges")
        qa.require((area > 0).all() and not opposing.any(), "Source has degenerate or opposing-normal faces")
        volume = float(np.einsum("ij,ij->i", a, np.cross(b, c)).sum() / 6)
        qa.require(volume > 0, "Source has negative signed volume")
        parent = np.arange(count)
        def find(vertex):
            while parent[vertex] != vertex:
                parent[vertex] = parent[parent[vertex]]
                vertex = parent[vertex]
            return vertex
        for edge in unique - first:
            left, right = find(int(edge[0])), find(int(edge[1]))
            if left != right:
                parent[right] = left
        components = len({find(vertex) for vertex in range(count)})
        qa.require(components == 1, "Source part is disconnected")
        euler = count - len(unique) + len(triangles)
        qa.require(euler == 2, "Source part has unexpected closed-surface topology")
        parts.append({"name": part["name"], "vertices": count, "triangles": len(triangles),
                      "connectedComponents": components, "eulerCharacteristic": euler,
                      "boundaryEdges": 0, "nonmanifoldEdges": 0, "sameDirectedEdges": 0,
                      "degenerateTriangles": 0, "opposingAverageNormals": 0,
                      "minimumDoubleArea": float(area.min()), "signedVolumeMetersCubed": volume})
    model_text = (root / "athlete-model-data.js").read_text(encoding="utf-8")
    embedded_match = re.search(r"(?:globalThis|window)\.SILHOUETTE_GLB\s*=\s*", model_text)
    if embedded_match:
        value, _ = json.JSONDecoder().raw_decode(model_text[embedded_match.end():].lstrip())
        qa.require(isinstance(value, str) and base64.b64decode(value) == source_bytes,
                   "Source GLB/offline embedded-file mismatch")
    else:
        model = serialized_object(root / "athlete-model-data.js", ("positionsBase64", "indicesBase64"))
        for key, expected in (("vertexCount", len(points)), ("triangleCount", len(faces))):
            if key in model:
                qa.require(model[key] == expected, "Source offline metadata count mismatch")
        for key, array, dtype in (("positionsBase64", points, "<f4"), ("normalsBase64", normals, "<f4"),
                                  ("indicesBase64", faces, "<u4")):
            qa.require(base64.b64decode(model[key]) == array.astype(dtype).tobytes(), "Source GLB/offline buffer mismatch")
    return {"parts": parts, "offlineBufferParity": "exact", "normalLengthMaximumError":
            float(np.abs(np.linalg.norm(normals, axis=1) - 1).max())}


def inspect_locality(rig, points, joints, weights):
    checks = []
    for label, group, anchor, radius in (("right fingers", range(18, 23), 8, .30),
                                          ("left fingers", range(23, 28), 11, .30),
                                          ("right foot", (14,), 14, .40),
                                          ("left foot", (17,), 17, .40)):
        influence = np.where(np.isin(joints, list(group)), weights, 0).sum(axis=1)
        active = influence >= .1
        qa.require(active.any(), f"No substantial {label} influence")
        positions = points[active]
        maximum_distance = float(np.linalg.norm(positions - np.asarray(rig["bones"][anchor]["pivot"]), axis=1).max())
        qa.require(maximum_distance < radius, f"{label} substantial weights contaminate distant geometry")
        wrong_side = positions[:, 0] > 0 if label.startswith("right") else positions[:, 0] < 0
        qa.require(not wrong_side.any(), f"{label} substantial weights cross into the opposite limb")
        checks.append({"group": label, "minimumWeight": .1, "vertices": int(active.sum()),
                       "maximumAnchorDistanceMeters": maximum_distance,
                       "oppositeSideSubstantialVertices": int(wrong_side.sum()),
                       "bounds": {"min": positions.min(axis=0).tolist(), "max": positions.max(axis=0).tolist()}})
    return checks


def inspect_package(root, package):
    package = Path(package)
    preserved_hash = hashlib.sha256((root / "basketball-dunk-silhouette.glb").read_bytes()).hexdigest()
    qa.require(preserved_hash == qa.SOURCE_SHA256, "Original final450k source was modified after rig QA")
    with zipfile.ZipFile(package) as archive:
        qa.require(archive.testzip() is None, "Package CRC failure")
        names = archive.namelist()
        qa.require(len(names) == len(set(names)), "Package has duplicate members")
        manifests = [name for name in names if name.endswith("manifest.json")]
        qa.require(len(manifests) == 1, "Expected one package manifest")
        manifest_name = manifests[0]
        manifest = json.loads(archive.read(manifest_name))
        qa.require(set(names) == set(manifest["files"]) | {manifest_name}, "Package/manifest member mismatch")
        for name in names:
            path = PurePosixPath(name)
            qa.require(not path.is_absolute() and ".." not in path.parts, "Unsafe ZIP member path")
            qa.require(not any(part in ("__pycache__", ".geometry-runtime", ".build-cache", ".athlete-cache", "versions")
                               for part in path.parts), "Package includes a cache or backup")
            data = archive.read(name)
            qa.require(data == (root / name).read_bytes(), f"Package/local byte mismatch: {name}")
            if name != manifest_name:
                meta = manifest["files"][name]
                qa.require(len(data) == meta["bytes"] and hashlib.sha256(data).hexdigest() == meta["sha256"],
                           f"Package manifest hash mismatch: {name}")
        rig_report = json.loads(archive.read("independent-athlete-rig-validation.json"))
        qa.require(rig_report["status"] == "passed", "Package includes a failed rig report")
        for name, digest in rig_report["verifiedInputs"].items():
            qa.require(name in names and hashlib.sha256(archive.read(name)).hexdigest() == digest,
                       f"Sealed rig report does not match final input: {name}")
    return {"name": package.name, "bytes": package.stat().st_size, "members": len(names),
            "manifestHashesVerified": len(names) - 1, "crc": "passed", "byteParity": "all",
            "sealedRigReportInputHashes": "all", "originalSourcePreservedSha256": preserved_hash,
            "sha256": hashlib.sha256(package.read_bytes()).hexdigest()}


def preset_entries(rig, preset_path=None):
    data = json.loads(Path(preset_path).read_text()) if preset_path else rig.get("presets")
    if isinstance(data, dict) and "presets" in data:
        data = data["presets"]
    qa.require(data is not None, "Preset arrays must be exported for independent validation")
    entries = list(data.items()) if isinstance(data, dict) else [
        (item.get("name", item.get("label", item.get("id", str(index)))), item)
        for index, item in enumerate(data)]
    result = []
    for name, item in entries:
        pose = item.get("pose", item)
        qa.require("rotations" in pose and "translations" in pose and "ballAttached" in pose,
                   f"Preset {name} is missing explicit pose arrays")
        result.append((name, pose))
    return result


def inspect_pose(rig, pose, points, normals, faces, joints, weights, name, gltf_context=None):
    rotations = np.asarray(pose["rotations"], dtype=float)
    translations = np.asarray(pose["translations"], dtype=float)
    qa.require(rotations.shape == translations.shape == (len(rig["bones"]), 3),
               f"Preset {name} has invalid control dimensions")
    qa.require(np.isfinite(rotations).all() and np.isfinite(translations).all(), "Non-finite pose controls")
    # Presets are authored baselines. The rig limits bound user adjustments
    # around a selected baseline, rather than the absolute preset angles.
    qa.require(isinstance(pose["ballAttached"], bool), f"Preset {name} ball attachment is not boolean")
    qa.require(isinstance(pose.get("ballVisible", True), bool), f"Preset {name} ball visibility is not boolean")
    global_matrices, skin_matrices = qa.rig_worlds(rig, pose)
    segment_error = 0.
    for index, bone in enumerate(rig["bones"][:28]):
        parent = bone.get("parent")
        if parent is None or parent < 0:
            continue
        rest_offset = np.asarray(bone["pivot"]) - np.asarray(rig["bones"][parent]["pivot"]) + translations[index]
        posed_offset = global_matrices[index][:3, 3] - global_matrices[parent][:3, 3]
        segment_error = max(segment_error, float(abs(np.linalg.norm(rest_offset) - np.linalg.norm(posed_offset))))
    qa.require(segment_error < 1e-10, f"Preset {name} changes skeletal segment length")
    deformed, deformed_normals = qa.skin_points(points, joints, weights, skin_matrices, normals)
    qa.require(deformed.shape == points.shape and deformed_normals.shape == normals.shape,
               "Deformation changes vertex count")
    qa.require(np.isfinite(deformed).all() and np.isfinite(deformed_normals).all(),
               f"Preset {name} has non-finite geometry")
    normal_error = float(np.abs(np.linalg.norm(deformed_normals, axis=1) - 1).max())
    qa.require(normal_error < 1e-6, f"Preset {name} normals are not normalized")
    triangles = deformed[faces]
    face_cross = np.cross(triangles[:, 1] - triangles[:, 0], triangles[:, 2] - triangles[:, 0])
    area64 = np.linalg.norm(face_cross, axis=1)
    collapsed = int((area64 == 0).sum())
    qa.require(collapsed == 0, f"Preset {name} mathematically collapses {collapsed} triangles")
    average_normals = deformed_normals[faces].sum(axis=1)
    face_cosines = np.einsum("ij,ij->i", face_cross, average_normals) / (area64 * np.linalg.norm(average_normals, axis=1))
    qa.require(np.isfinite(face_cosines).all(), f"Preset {name} has undefined face-normal averages")
    opposed = face_cosines < 0
    worst_face = int(np.argmin(face_cosines))
    opposed_groups = {}
    if opposed.any():
        vertex_joints = joints[np.arange(len(joints)), weights.argmax(axis=1)]
        face_joints = vertex_joints[faces[:, 0]]
        for bone in np.unique(face_joints[opposed]):
            group = opposed & (face_joints == bone)
            opposed_groups[rig["bones"][int(bone)]["name"]] = {
                "triangles": int(group.sum()), "areaMetersSquared": float(area64[group].sum() / 2)}
    triangles32 = deformed.astype("<f4")[faces]
    area32 = np.linalg.norm(np.cross(triangles32[:, 1] - triangles32[:, 0],
                                    triangles32[:, 2] - triangles32[:, 0]), axis=1)
    first_ball = rig["ballRange"]["firstVertex"]
    pivot = np.asarray(rig["bones"][rig["ballIndex"]]["pivot"])
    source_radii = np.linalg.norm(points[first_ball:] - pivot, axis=1)
    center = global_matrices[rig["ballIndex"]][:3, 3]
    posed_radii = np.linalg.norm(deformed[first_ball:] - center, axis=1)
    ball_radius_error = float(np.abs(posed_radii - source_radii).max())
    qa.require(ball_radius_error < 3e-6, f"Preset {name} deforms the ball")
    gltf_error = None
    if gltf_context is not None:
        doc, skin_joints, inverse_binds, ball_node, ball_positions = gltf_context
        posed_doc = copy.deepcopy(doc)
        for index, node_index in enumerate(skin_joints):
            bone = rig["bones"][index]
            parent_index = bone.get("parent")
            parent_pivot = np.zeros(3) if parent_index is None or parent_index < 0 else np.asarray(rig["bones"][parent_index]["pivot"])
            local = qa.translation(np.asarray(bone["pivot"]) - parent_pivot + translations[index])
            for axis, degrees in zip(bone["axes"], rotations[index]):
                local = local @ qa.axis_rotation(axis, degrees)
            node = posed_doc["nodes"][node_index]
            for field in ("translation", "rotation", "scale"):
                node.pop(field, None)
            node["matrix"] = local.T.reshape(-1).tolist()
        for node in posed_doc["nodes"]:
            if ball_node in node.get("children", []):
                node["children"].remove(ball_node)
        ball_parent = rig["handIndex"] if pose["ballAttached"] else 0
        posed_doc["nodes"][skin_joints[ball_parent]].setdefault("children", []).append(ball_node)
        ball_bone = rig["bones"][rig["ballIndex"]]
        ball_local = qa.translation(np.asarray(ball_bone["pivot"]) - np.asarray(rig["bones"][ball_parent]["pivot"]) + translations[rig["ballIndex"]])
        for axis, degrees in zip(ball_bone["axes"], rotations[rig["ballIndex"]]):
            ball_local = ball_local @ qa.axis_rotation(axis, degrees)
        ball_gltf_node = posed_doc["nodes"][ball_node]
        for field in ("translation", "rotation", "scale"):
            ball_gltf_node.pop(field, None)
        ball_gltf_node["matrix"] = ball_local.T.reshape(-1).tolist()
        gltf_world, _ = qa.gltf_worlds(posed_doc)
        gltf_body, _ = qa.skin_points(points[:first_ball], joints[:first_ball], weights[:first_ball],
                                     gltf_world[skin_joints] @ inverse_binds)
        gltf_ball = ball_positions @ gltf_world[ball_node][:3, :3].T + gltf_world[ball_node][:3, 3]
        gltf_error = float(max(np.abs(gltf_body - deformed[:first_ball]).max(),
                               np.abs(gltf_ball - deformed[first_ball:]).max()))
        qa.require(gltf_error < 3e-6, f"Preset {name} GLB/offline weighted deformation mismatch")
    return {"name": name, "vertices": len(deformed), "triangles": len(faces),
            "finite": True, "normalLengthMaximumError": normal_error,
            "trueCollapsedTriangles": collapsed,
            "float32QuantizedCollapsedTriangles": int((area32 == 0).sum()),
            "minimumDoublePrecisionArea2": float(area64.min()),
            "minimumFloat32Area2": float(area32.min()),
            "opposingDeformedAverageNormalTriangles": int((face_cosines < 0).sum()),
            "stronglyOpposingDeformedAverageNormalTriangles": int((face_cosines < -.2).sum()),
            "minimumDeformedFaceNormalCosine": float(face_cosines.min()),
            "opposingDeformedAreaMetersSquared": float(area64[opposed].sum() / 2),
            "opposingDeformedGroups": opposed_groups,
            "worstFaceSourceCenter": points[faces[worst_face]].mean(axis=0).tolist(),
            "worstFaceDeformedCenter": triangles[worst_face].mean(axis=0).tolist(),
            "worstFaceAreaMetersSquared": float(area64[worst_face] / 2),
            "ballAttached": pose["ballAttached"], "ballVisible": pose.get("ballVisible", True),
            "ballCenter": center.tolist(),
            "glbOfflineDeformationMaximumErrorMeters": gltf_error,
            "skeletalSegmentLengthMaximumErrorMeters": segment_error,
            "ballRadiusMaximumErrorMeters": ball_radius_error,
            "bounds": {"min": deformed.min(axis=0).tolist(), "max": deformed.max(axis=0).tolist()}}


def validate(source_path, rig_path, posed_path, presets_path=None, package=None):
    root = Path(source_path).resolve().parent
    protected = root / "basketball-dunk-silhouette.glb"
    qa.require(hashlib.sha256(protected.read_bytes()).hexdigest() == qa.SOURCE_SHA256,
               "Original final450k source was modified")
    source_doc, source_binary, source_bytes = qa.read_glb(source_path)
    primitive = source_doc["meshes"][0]["primitives"][0]
    points = qa.accessor(source_doc, source_binary, primitive["attributes"]["POSITION"])
    normals = qa.accessor(source_doc, source_binary, primitive["attributes"]["NORMAL"])
    faces = qa.accessor(source_doc, source_binary, primitive["indices"]).reshape(-1, 3)
    source_checks = inspect_source(root, source_doc, points, normals, faces, source_bytes)
    source_hash = hashlib.sha256(source_bytes).hexdigest()
    source_validation = json.loads((root / "athlete-model-validation.json").read_text())
    qa.require(source_validation["glbSha256"] == source_hash, "Athlete source validation hash mismatch")
    qa.require(source_validation["vertexCount"] == len(points) and source_validation["triangleCount"] == len(faces),
               "Athlete source validation counts mismatch")
    qa.require(source_validation["parts"] == source_doc["meshes"][0]["extras"]["parts"],
               "Athlete source validation part metadata mismatch")
    if "triangleBudget" in source_validation:
        qa.require(len(faces) <= source_validation["triangleBudget"], "Athlete exceeds its current declared triangle budget")
    rig = rig_object(rig_path)
    qa.require(rig["sourceSha256"] == source_hash and rig["vertexCount"] == len(points),
               "Rig/source provenance or vertex count mismatch")
    bones = rig["bones"]
    qa.require(len(bones) == 29 and rig["ballIndex"] == 28 and rig["handIndex"] == 8,
               "Athlete rig violates the agreed 29-bone contract")
    part = next(part for part in source_doc["meshes"][0]["extras"]["parts"] if part["name"] == "basketball")
    first_ball = part["firstVertex"]
    ball_count = part["vertexCount"]
    qa.require(rig["ballRange"] == {"firstVertex": first_ball, "count": ball_count}
               and first_ball + ball_count == len(points), "Contiguous ball range mismatch")
    body_selector = (faces < first_ball).all(axis=1)
    ball_selector = (faces >= first_ball).all(axis=1)
    qa.require((body_selector | ball_selector).all(), "Source connects the ball into body triangles")
    body_faces, ball_faces = faces[body_selector], faces[ball_selector] - first_ball
    joints = np.frombuffer(base64.b64decode(rig["jointsBase64"]), dtype="u1").reshape(-1, 4)
    weights = np.frombuffer(base64.b64decode(rig["weightsBase64"]), dtype="<f4").reshape(-1, 4)
    qa.require(joints.shape == weights.shape == (len(points), 4), "Packed weight/joint dimensions")
    qa.require(joints.max() < len(bones) and np.isfinite(weights).all()
               and (weights >= 0).all() and (weights <= 1).all(), "Invalid joint indices or weights")
    qa.require(np.allclose(weights.sum(axis=1), 1, atol=1e-6, rtol=0), "Weights are not normalized")
    qa.require((joints[first_ball:][weights[first_ball:] > 0] == 28).all(),
               "Ball has deforming body weights")
    qa.require((joints[:first_ball][weights[:first_ball] > 0] < 28).all(), "Body uses ball weights")
    locality_checks = inspect_locality(rig, points, joints, weights)
    for bone in bones:
        axes = np.asarray(bone["axes"], dtype=float)
        qa.require(axes.shape == (3, 3) and np.isfinite(axes).all()
                   and np.allclose(np.linalg.norm(axes, axis=1), 1, atol=1e-6), "Invalid rotation axes")
    zero = qa.empty_pose(rig)
    bind_globals, bind_matrices = qa.rig_worlds(rig, zero)
    qa.require(np.allclose(bind_matrices, np.eye(4), atol=1e-12), "Zero pose matrices are not identity")
    zero_points, _ = qa.skin_points(points, joints, weights, bind_matrices)
    zero_error = float(np.abs(zero_points - points).max())
    qa.require(zero_error < 3e-6, "Zero interactive pose changes source geometry")

    doc, binary, posed_bytes = qa.read_glb(posed_path)
    posed_hash = hashlib.sha256(posed_bytes).hexdigest()
    qa.require(rig.get("riggedGlbSha256", posed_hash) == posed_hash, "Rigged GLB provenance hash mismatch")
    worlds, parents = qa.gltf_worlds(doc)
    entries = [(index, primitive) for index, node in enumerate(doc["nodes"]) if "mesh" in node
               for primitive in doc["meshes"][node["mesh"]]["primitives"]]
    body_node, body_primitive = next((index, primitive) for index, primitive in entries
                                    if "JOINTS_0" in primitive["attributes"])
    attributes = body_primitive["attributes"]
    gv = qa.accessor(doc, binary, attributes["POSITION"])
    gn = qa.accessor(doc, binary, attributes["NORMAL"])
    gf = qa.accessor(doc, binary, body_primitive["indices"]).reshape(-1, 3)
    gj = qa.accessor(doc, binary, attributes["JOINTS_0"]).astype(int)
    gw = qa.accessor(doc, binary, attributes["WEIGHTS_0"])
    qa.require(np.array_equal(gv, points[:first_ball]) and np.array_equal(gn, normals[:first_ball])
               and np.array_equal(gf, body_faces), "Rigged body geometry is not the unchanged source")
    qa.require(np.array_equal(gj, joints[:first_ball]) and np.array_equal(gw, weights[:first_ball]),
               "Offline rig and GLB weight/joint parity failure")
    skin = doc["skins"][doc["nodes"][body_node]["skin"]]
    skin_joints = skin["joints"]
    qa.require(len(skin_joints) == 28 and len(set(skin_joints)) == 28 and gj.max() < 28,
               "Skin joint list/index mismatch")
    inverse_binds = qa.accessor(doc, binary, skin["inverseBindMatrices"]).reshape(-1, 4, 4).transpose(0, 2, 1)
    qa.require(len(inverse_binds) == 28 and np.isfinite(inverse_binds).all(), "Inverse-bind matrix mismatch")
    skin_bind = worlds[skin_joints] @ inverse_binds
    inverse_error = float(np.abs(skin_bind - np.eye(4)).max())
    qa.require(inverse_error < 3e-6, "Inverse binds change source placement")
    for index, node in enumerate(skin_joints):
        expected_parent = bones[index].get("parent")
        expected_node_parent = -1 if expected_parent is None or expected_parent < 0 else skin_joints[expected_parent]
        qa.require(parents[node] == expected_node_parent, "GLB and offline bone hierarchy disagree")
        qa.require(np.allclose(worlds[node], bind_globals[index], atol=3e-6), "Bone bind transform mismatch")
        qa.require(doc["nodes"][node]["name"] == bones[index]["name"], "Bone semantic names disagree")
        extras = doc["nodes"][node].get("extras", {})
        qa.require(extras.get("poseAxes") == bones[index]["axes"]
                   and extras.get("poseRotationLimitsDegrees") == bones[index]["limits"],
                   "GLB/offline pose-axis or adjustment-limit metadata disagree")
    gltf_zero, _ = qa.skin_points(gv, gj, gw, skin_bind)
    gltf_zero_error = float(np.abs(gltf_zero - points[:first_ball]).max())
    qa.require(gltf_zero_error < 3e-6, "GLB bind pose changes source body placement")
    ball_node, ball_primitive = next((index, primitive) for index, primitive in entries if index != body_node)
    bv = qa.accessor(doc, binary, ball_primitive["attributes"]["POSITION"])
    bn = qa.accessor(doc, binary, ball_primitive["attributes"]["NORMAL"])
    bf = qa.accessor(doc, binary, ball_primitive["indices"]).reshape(-1, 3)
    qa.require(parents[ball_node] == skin_joints[8] and len(bv) == ball_count
               and np.array_equal(bn, normals[first_ball:]) and np.array_equal(bf, ball_faces),
               "Ball source geometry or wrist attachment mismatch")
    ball_world = bv @ worlds[ball_node][:3, :3].T + worlds[ball_node][:3, 3]
    ball_zero_error = float(np.abs(ball_world - points[first_ball:]).max())
    qa.require(ball_zero_error < 3e-6, "Rigged ball bind placement mismatch")

    if presets_path:
        catalog = json.loads(Path(presets_path).read_text())
        expected_ids = {"neutral", "dunk", "layup", "defense", "jump-shot", "dribble"}
        qa.require(catalog["version"] == 1 and catalog["defaultId"] == "dunk", "Catalog metadata mismatch")
        actual_ids = [item["id"] for item in catalog["presets"]]
        qa.require(len(actual_ids) == len(expected_ids) and set(actual_ids) == expected_ids, "Catalog preset IDs mismatch")
        js_catalog = serialized_object(root / "athlete-pose-presets.js", ("presets", "defaultId"))
        qa.require(js_catalog == catalog, "Preset JSON/offline JS parity mismatch")
    poses = preset_entries(rig, presets_path)
    qa.require(len(poses) >= 5, "Fewer than five basketball presets were supplied")
    gltf_context = doc, skin_joints, inverse_binds, ball_node, bv
    preset_results = [inspect_pose(rig, pose, points, normals, faces, joints, weights, name, gltf_context)
                      for name, pose in poses]
    neutral_result = inspect_pose(rig, zero, points, normals, faces, joints, weights, "Neutral bind", gltf_context)
    wrist = qa.empty_pose(rig)
    wrist["rotations"][8][0] = 15.
    held_world, held_matrices = qa.rig_worlds(rig, wrist)
    ball_pivot = np.asarray(bones[28]["pivot"])
    predicted = held_matrices[8][:3, :3] @ ball_pivot + held_matrices[8][:3, 3]
    qa.require(np.allclose(held_world[28][:3, 3], predicted, atol=1e-10), "Held ball does not follow wrist")
    wrist["ballAttached"] = False
    detached_world, _ = qa.rig_worlds(rig, wrist)
    qa.require(np.allclose(detached_world[28][:3, 3], ball_pivot, atol=1e-10),
               "Detached ball still follows wrist")
    target = held_world[28][:3, 3]
    root_inverse = np.linalg.inv(detached_world[0])
    root_pivot = np.asarray(bones[0]["pivot"])
    local = root_inverse[:3, :3] @ target + root_inverse[:3, 3]
    wrist["translations"][28] = (local - ball_pivot + root_pivot).tolist()
    preserved_world, _ = qa.rig_worlds(rig, wrist)
    qa.require(np.allclose(preserved_world[28][:3, 3], target, atol=1e-10), "Detachment changes ball position")
    wrist["ballAttached"] = True
    wrist_inverse = np.linalg.inv(held_world[8])
    local = wrist_inverse[:3, :3] @ target + wrist_inverse[:3, 3]
    wrist["translations"][28] = (local - ball_pivot + np.asarray(bones[8]["pivot"])).tolist()
    reattached_world, _ = qa.rig_worlds(rig, wrist)
    qa.require(np.allclose(reattached_world[28][:3, 3], target, atol=1e-10), "Reattachment changes ball position")
    report = {"status": "passed", "originalSourcePreservedSha256": qa.SOURCE_SHA256,
              "sourceSha256": source_hash, "riggedGlbSha256": posed_hash,
              "vertexCount": len(points), "triangleCount": len(faces), "boneCount": 29,
              "triangleBudget": source_validation.get("triangleBudget"),
              "bodyBindGeometryParity": "exact", "glbOfflineWeightParity": "exact",
              "weightSumMaximumError": float(np.abs(weights.sum(axis=1) - 1).max()),
              "zeroInteractivePositionMaximumErrorMeters": zero_error,
              "gltfInverseBindMaximumError": inverse_error,
              "gltfBodyBindMaximumErrorMeters": gltf_zero_error,
              "gltfBallBindMaximumErrorMeters": ball_zero_error,
              "sourceChecks": source_checks, "handFootWeightLocality": locality_checks,
              "presetLimits": "User adjustments are relative to each authored preset baseline",
              "neutral": neutral_result, "presets": preset_results,
              "ballChecks": ["rigid_in_all_presets", "held_follows_wrist", "detached_ignores_wrist",
                             "detach_preserves_position", "reattach_preserves_position"]}
    verified_paths = [Path(source_path), Path(rig_path), Path(posed_path), protected,
                      root / "athlete-model-data.js", root / "athlete-model-validation.json"]
    if presets_path:
        verified_paths.extend([Path(presets_path), root / "athlete-pose-presets.js"])
    report["verifiedInputs"] = {path.name: hashlib.sha256(path.read_bytes()).hexdigest() for path in verified_paths}
    if package:
        report["package"] = inspect_package(root, package)
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=ROOT / "basketball-athlete.glb")
    parser.add_argument("--rig", type=Path, default=ROOT / "athlete-rig-data.js")
    parser.add_argument("--posed", type=Path, default=ROOT / "basketball-athlete-poseable.glb")
    parser.add_argument("--presets", type=Path)
    parser.add_argument("--package", type=Path)
    parser.add_argument("--package-only", action="store_true", help="Audit an already validated archive without repeating deformation checks")
    parser.add_argument("--report-prefix", default="athlete")
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    output = args.output or args.source.parent / ("independent-athlete-package-validation.json" if args.package_only
                                                else f"{args.report_prefix}-independent-rig-validation.json")
    if args.package:
        with zipfile.ZipFile(args.package) as archive:
            if output.name in archive.namelist():
                print("Refusing to overwrite a report already sealed inside the audited package; choose a separate --output")
                return 1
    try:
        if args.package_only:
            qa.require(args.package is not None, "--package-only requires --package")
            report = {"status": "passed", "package": inspect_package(args.source.parent, args.package)}
        else:
            report = validate(args.source, args.rig, args.posed, args.presets, args.package)
    except Exception as error:
        report = {"status": "failed", "errorType": type(error).__name__, "error": str(error)}
    output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))
    return 0 if report["status"] == "passed" else 1


if __name__ == "__main__":
    raise SystemExit(main())
