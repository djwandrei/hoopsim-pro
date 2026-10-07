export const REFERENCE_TURN_SPEED = .36;
export const REFERENCE_FAST_TURN_SPEED = .9;

// Fit both the body height and the swept radius of the pose, so the entire
// silhouette remains visible through a complete turn on narrow stages. An
// optional authored-model fit (vertical span + sweep radius) replaces the
// legacy procedural-sculpt constants.
export function frameReferenceCamera(camera, width, height, fit) {
  const halfY = fit?.halfY || 1.48;
  const sweep = fit?.sweep || 1.26;
  const halfHeight = Math.max(halfY, sweep * height / width);
  const halfWidth = halfHeight * width / height;
  camera.left = -halfWidth;
  camera.right = halfWidth;
  camera.top = halfHeight;
  camera.bottom = -halfHeight;
  camera.updateProjectionMatrix();
}