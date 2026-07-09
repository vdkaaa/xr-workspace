/**
 * Minimal column-major 4x4 matrix helpers used to convert WebXR's matrices
 * (as returned by the browser, column-major `Float32Array(16)`) into the
 * layout Unity's `WebXRMatrixUtil.NumbersToMatrix` expects.
 *
 * This intentionally avoids adding `gl-matrix` as a dependency — the actual
 * math needed here is just a transpose plus a couple of axis sign flips,
 * ported 1:1 from the original `webxr.js` (Assets/WebGLTemplates/WebXR/webxr.js)
 * that shipped with the Mozilla WebXR Exporter package.
 */

export const IDENTITY_MATRIX_16: readonly number[] = [
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
  0, 0, 0, 1,
];

function transpose16(m: ArrayLike<number>): number[] {
  return [
    m[0], m[4], m[8], m[12],
    m[1], m[5], m[9], m[13],
    m[2], m[6], m[10], m[14],
    m[3], m[7], m[11], m[15],
  ];
}

/** WebGL projection matrix -> Unity projection matrix. */
export function glProjectionToUnity(m: ArrayLike<number>): number[] {
  return transpose16(m);
}

/** WebGL view matrix (camera-to-world inverse) -> Unity view matrix. */
export function glViewToUnity(m: ArrayLike<number>): number[] {
  const out = transpose16(m);
  out[2] *= -1;
  out[6] *= -1;
  out[10] *= -1;
  out[14] *= -1;
  return out;
}

/** WebGL/right-handed Vector3 -> Unity/left-handed Vector3. */
export function glVec3ToUnity(v: ArrayLike<number>): [number, number, number] {
  return [v[0], v[1], -v[2]];
}

/** WebGL/right-handed Quaternion -> Unity/left-handed Quaternion. */
export function glQuaternionToUnity(q: ArrayLike<number>): [number, number, number, number] {
  return [-q[0], -q[1], q[2], q[3]];
}
