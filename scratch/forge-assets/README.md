# Basketball athlete pose studio

An independently authored 1.919 m athlete, with 706,786 base triangles after optimization and 738,658 triangles with all optional accessories enabled (800,000 maximum). The neutral A-stance sits beneath the pose controls. The body has revised torso and limb proportions, shaped hands with correctly lateral thumbs, continuous deltoid transitions into the chest, rounded featureless head and neck, and connected ankle-to-shoe transitions. The model has no facial details or skin textures. The shoes have continuous soles, rounded toe and heel volumes, padded collars, tongues, and lace ridges. The jersey and shorts include folds, bindings, waistband gathers, hems, and side seams. The shorts have a shaped pelvic envelope and loose leg panels; the thighs taper into continuous knee transitions, with higher calf bellies and shaped ankle connections into the shoe collars. Jersey, shorts, right shoe, left shoe, exposed head and neck, exposed upper body, and each arm are separate elements. The optional headband and right/left shooting sleeves are separate removable elements.

## Open the studio

Extract the complete archive, then open `index.html`. Keep the accompanying JavaScript data files in the same directory. The studio works directly from disk without installation, a network connection, or a server.

Dribble uses a running stride, with the lead foot planted and the trailing knee bent, and holds the ball near the hip. Layup uses a less horizontal knee drive and a modest whole-body lean; Defense has slightly bent elbows.

Choose **Dunk**, **Layup**, **Defense**, **Jump shot**, **Dribble**, or **Neutral stance** in Basketball presets. Each preset changes joint angles while preserving the skeleton limb lengths. The Dunk preset uses the original reference arm, torso, leg, and foot directions on the new athlete. Each hand has the anatomically correct thumb side. Axial arm rotation is shared through the upper arms and forearms, while authored wrist bending is bounded to 55 degrees. Toggle Sculpted to inspect shoe and fabric detail. Defense and Neutral stance hide the basketball. Spin or drag the view to inspect any pose from another angle.

Select a body part and adjust Bend, Twist, and Side. Controls cover the torso, head, shoulders, elbows, wrists, hips, knees, feet, and individual fingers. Each finger moves as one digit at its base. Whole-model and basketball controls also support position changes. Editing pauses the spin; resume it to inspect the result.

**Reset this part** restores the selected part to the active preset. **Reset pose** restores the complete active preset. Switching presets replaces the current adjustments. **Hold ball in right hand** makes the ball follow the wrist; detaching or reattaching preserves its current position. **Show basketball** controls visibility independently.

## Save and exchange

Save pose exports a JSON file containing the active preset, actual control values, clothing, and accessories. Load pose restores it. JSON version 3 includes the preset base so the controls can reset and clamp adjustments consistently; older version 2 poses remain accepted. Unknown presets, altered bases, and invalid numbers are rejected. A pose JSON contains no mesh.

Player color changes every exposed body element together, including the head, neck, upper chest, arms, hands, and legs. It is independent of clothing and accessories and remains featureless. Saved pose JSON includes `bodyColor`; loading an older file without this field restores the original charcoal color. The styled GLB stores the selected color in all five exposed-body materials. JavaScript integrations can use `SILHOUETTE_VIEWER.getBodyColor()` and `SILHOUETTE_VIEWER.setBodyColor('#446688')`.

- `basketball-athlete-poseable.glb`: the new neutral athlete with skin weights, a skeleton, and a separate basketball parented to the right wrist. It has no baked animation clips or viewer presets.
- `basketball-athlete.glb`: the new neutral static mesh.
- `basketball-athlete-outfit.glb`: the neutral rig with separately named body, clothing, shoes, basketball and accessories, with the textured ball embedded.
- `basketball-athlete-styled.glb`: the same neutral rig with the reviewed body color and uniform, shoe and ball textures embedded. Optional accessories remain present as meshes; their scene visibility follows the saved selection.
- `reviewed-pose.json`: the pose, clothing, body color and accessories selected when the final package was built. Use **Load pose** in the viewer to restore it.
- `basketball-preset-poses.json`: all six authored poses in the viewer joint-coordinate system.
- `basketball-dunk-silhouette.glb` and `index-static.html`: the preserved original dunk model and spinning viewer.

The poseable GLB button exports the neutral rig. The wardrobe GLB button exports the independently named body, clothing, shoes, basketball, and accessory meshes. Save pose stores an adjusted studio pose separately. Importing a GLB into another application does not automatically recreate these viewer presets.

## Geometry and runtime

The source contains 353,397 vertices: a single closed player body and a separate basketball. The wardrobe export partitions the body surface into ten named meshes and adds closed, skinned meshes for a headband and two sleeves. Rigging retains source positions, normals, and triangle indices. Up to four normalized bone influences blend each body and accessory vertex. An ankle-centered weight transition lets the padded collars follow the lower calves while keeping the soles and forefeet rigid. The viewer performs skinning on the GPU with preallocated transform buffers; the wardrobe GLB stores independent player, clothing, shoe, ball, and accessory meshes.

The Uniform controls include 30 teams and three 2025-26 editions per team. All 90 archive pages were reviewed, yielding 83 usable flat fronts and 79 usable backs. Front and rear jersey references from the Basketball Jersey Archive are embedded lazily when a usable flat photograph is available; the original JPEGs remain unchanged. The front and rear artwork is packed into separate atlas regions so it maps consistently around the jersey. Shorts use the original front artwork, clean fabric at the side seams, and matched fabric colors at the rear. Headband visibility/color and shooting sleeve side/color are independent controls, and sleeves can be set to none, right, left, or both. The headband rises slightly at the front; the sleeve cuff stops short of the wrist. The dribbling free arm sits lower and farther from the torso.

The separate basketball uses a reference-derived orange leather texture with dense pebbling, black rubber channels, and Wilson/NBA markings. The generated source is retained separately; a 2048 by 1024 copy supports repeat wrapping and mipmaps on WebGL 1. The viewer and wardrobe GLB share the same texture bytes, with spherical UV seams split for clean mapping. The older neutral/static GLBs retain their original silhouette material. The final archive contains all viewer dependencies and all 90 uniform design files, so its clothing controls work offline.

The shot and dribble defaults were revised using real player photographs recorded in `pose-reference-review.json`. The shot shows the rising phase just before release, with a shooting hand beneath the ball and a guide hand at its side. The dribble brings the ball arm nearer the hip and bends the leading knee. Ball placement is fitted to the deformed palm and fingers in all four ball presets. `ball-contact-validation.json` checks triangle-to-sphere clearance across the entire posed body, including both shooting hands. Shoulder skin weights also blend gradually from chest to deltoid, reducing surface folding in raised-arm poses without changing the source geometry.

These are static basketball pose presets with interactive joint adjustments. The rig has no cloth simulation, automatic collision avoidance, or separate finger-knuckle joints. Strong combined adjustments can still compress a joint or intersect another surface. It is a useful poseable asset rather than a fully tested animation production character.

## Rebuild

Requires the pinned Python dependencies in `requirements.txt`. The geometry authoring script uses the locally available `manifold3d` dependency. Geometry, rig, presets, and validation are separate steps:

```powershell
python -m pip install -r requirements.txt
python build_athlete_model.py
python finalize_athlete_shape.py
python build_athlete_rig.py
python build_basketball_presets.py
python build_basketball_surface.py
python build_outfit_elements.py
python validate_athlete_rig.py --presets basketball-preset-poses.json --output independent-athlete-rig-validation.json
python validate_wardrobe.py
python review_ball_contacts.py
```

The athlete authoring script imports geometry helpers from `build_model.py`, `blend_connections.py`, and `refine_structure.py`; `build_athlete_rig.py` and the validator reuse `build_pose_rig.py` and `validate_pose_rig.py`. These helper files are included for reproducibility. The original authoring scripts are not required merely to open the viewer.

After changing the neutral mesh, rebuild its rig and presets so all vertex counts and source hashes agree. Validation reports and a package manifest accompany the finished archive.

The archive includes geometry authoring helpers, retained basketball texture artwork, and validation utilities. Uniform JPEG and research-image authoring sources remain in the original workspace; the offline viewer uses the embedded design scripts included in `uniform-assets/`. Reports describing the pre-package model review retain their historical state; `basketball-studio-manifest.json` identifies the exact final package contents.
