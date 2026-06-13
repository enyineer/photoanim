/**
 * Meniscus / contact-line physics: the water surface clings to and climbs
 * the hydrophilic gelatin face of the photo where it pierces the surface.
 *
 * The static meniscus against a vertical wall has the classic solution
 *   h0 = lc * sqrt(2 * (1 - sin(theta)))        (rise at the wall)
 *   h(x) ~ h0 * exp(-x / lc)                    (decay away from the wall)
 * where lc = sqrt(sigma / (rho * g)) is the capillary length.
 */
import { clamp, saturate } from './math';
import { GRAVITY } from './constants';

/** Capillary length lc = sqrt(sigma / (rho g)) (m). */
export function capillaryLength(
  surfaceTension: number,
  fluidDensity: number,
  g: number = GRAVITY,
): number {
  const sigma = Math.max(0, surfaceTension);
  const denom = Math.max(1e-12, fluidDensity * g);
  return Math.sqrt(sigma / denom);
}

/**
 * Height the meniscus climbs a vertical wall above the flat surface (m).
 * Zero for a 90° contact angle, maximal (lc * sqrt(2)) for perfect wetting.
 *
 * @param contactAngle contact angle in radians, clamped to [0, pi/2]
 */
export function meniscusRiseHeight(contactAngle: number, capLength: number): number {
  const theta = clamp(contactAngle, 0, Math.PI / 2);
  return Math.max(0, capLength) * Math.sqrt(2 * (1 - Math.sin(theta)));
}

/**
 * Meniscus elevation at horizontal distance `dist` from the wall (m).
 * Exponential decay with the capillary length as the decay scale.
 */
export function meniscusProfile(
  dist: number,
  riseHeight: number,
  capLength: number,
): number {
  const lc = Math.max(1e-12, capLength);
  return Math.max(0, riseHeight) * Math.exp(-Math.max(0, dist) / lc);
}

/**
 * Vertical capillary force the contact line exerts on the photo (N).
 * Pulls the photo *down* (resists lifting) while the gelatin is wetted:
 *   F = sigma * cos(theta) * wetted perimeter.
 * Returned as a magnitude; the caller applies it downward.
 */
export function contactLinePull(
  surfaceTension: number,
  contactAngle: number,
  wettedPerimeter: number,
): number {
  const theta = clamp(contactAngle, 0, Math.PI / 2);
  return Math.max(0, surfaceTension) * Math.cos(theta) * Math.max(0, wettedPerimeter);
}

/**
 * As the photo's bottom edge approaches the surface from above, the liquid
 * neck stretches before the contact line ruptures. This returns the
 * stretch factor in [0, 1]: 1 while touching, decaying to 0 once the gap
 * exceeds the rupture height (a few capillary lengths).
 *
 * @param gap         vertical gap between photo bottom and surface (m), >= 0 means detached
 * @param capLength   capillary length (m)
 * @param ruptureMultiple gap (in capillary lengths) at which the bridge breaks
 */
export function liquidBridgeFactor(
  gap: number,
  capLength: number,
  ruptureMultiple: number = 3,
): number {
  if (gap <= 0) return 1;
  const ruptureGap = Math.max(1e-12, capLength * ruptureMultiple);
  return saturate(1 - gap / ruptureGap);
}
