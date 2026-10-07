export const REFERENCE_TURN_SPEED = .36;
export const REFERENCE_FAST_TURN_SPEED = .9;

// Fit both the body height and the swept radius of the kicked-back shoe, so
// the entire silhouette remains visible through a complete turn on narrow stages.
export function frameReferenceCamera(camera, width, height) {
  const halfHeight = Math.max(1.48, 1.26 * height / width);
  const halfWidth = halfHeight * width / height;
  camera.left = -halfWidth;
  camera.right = halfWidth;
  camera.top = halfHeight;
  camera.bottom = -halfHeight;
  camera.updateProjectionMatrix();
}