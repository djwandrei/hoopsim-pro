// Shape-preserving cubic interpolation: muscle and garment contours flow
// through stations without the repeated flat spots of per-station smoothstep.
export function referenceSection(rows, index, f, column, fallback) {
  const value = i => rows[i][column] ?? (typeof fallback === 'function' ? fallback(rows[i]) : fallback);
  const a = value(index), b = value(index + 1), delta = b - a;
  const before = index ? a - value(index - 1) : delta;
  const after = index + 2 < rows.length ? value(index + 2) - b : delta;
  const slope = (x, y) => x * y > 0 ? 2 * x * y / (x + y) : 0;
  const m0 = slope(before, delta), m1 = slope(delta, after);
  const f2 = f * f, f3 = f2 * f;
  return (2*f3 - 3*f2 + 1)*a + (f3 - 2*f2 + f)*m0 + (-2*f3 + 3*f2)*b + (f3 - f2)*m1;
}

export function referenceContour(angle, rx, front, back, power, profile) {
  const c = Math.cos(angle), s = Math.sin(angle);
  // Polar sampling of the superellipse avoids the infinite parameter slope
  // and visible ridges produced by sign(cos) * abs(cos)^power at the axes.
  const exponent = 2 / power;
  const radius = Math.pow(Math.pow(Math.abs(c), exponent) + Math.pow(Math.abs(s), exponent), -1 / exponent);
  const x = c * radius * rx;
  let depth = s * radius * (s < 0 ? front : back);
  // A shoe has a flatter sole and a rounded upper, not a spherical toe cap.
  if (profile === 'shoe' && s < 0) depth = Math.max(depth, -front * .72);
  return [x, depth];
}