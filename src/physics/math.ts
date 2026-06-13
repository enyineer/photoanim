/** Small, dependency-free numeric helpers shared by the physics core. */

/** Clamp `x` into the closed interval [lo, hi]. */
export function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

/** Clamp into [0, 1]. */
export function saturate(x: number): number {
  return clamp(x, 0, 1);
}

/** Linear interpolation between `a` and `b` by `t`, exact at both endpoints. */
export function lerp(a: number, b: number, t: number): number {
  return (1 - t) * a + t * b;
}

/** Hermite smoothstep: 0 below `edge0`, 1 above `edge1`, smooth in between. */
export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = saturate((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

/** True if `x` is a finite number (guards against NaN/Infinity escapes). */
export function isFiniteNumber(x: number): boolean {
  return Number.isFinite(x);
}
