/**
 * Scroll timeline: maps the page scroll fraction (0 = top of page, photo
 * resting in the bath; 1 = bottom, photo held clear of the liquid) onto the
 * photo's vertical position. The only input the whole animation has.
 */
import { clamp, lerp, saturate, smoothstep } from './math';

/**
 * Normalised scroll progress in [0, 1] from raw page metrics.
 * Degenerate pages (no scrollable height) pin to 0.
 */
export function scrollProgress(scrollY: number, maxScroll: number): number {
  if (maxScroll <= 0) return 0;
  return saturate(scrollY / maxScroll);
}

/**
 * Eased lift progress: smooth start (the photo "peels" off the tray bottom
 * slowly) and smooth stop at the top, monotonic throughout.
 */
export function liftProgress(scroll: number): number {
  return smoothstep(0, 1, saturate(scroll));
}

/**
 * World-space Y of the photo's bottom edge for a given eased progress.
 *
 * @param progress  eased lift progress in [0, 1]
 * @param restY     bottom-edge Y when fully submerged (m)
 * @param raisedY   bottom-edge Y when fully lifted (m), must be >= restY
 */
export function photoBottomY(progress: number, restY: number, raisedY: number): number {
  return lerp(restY, Math.max(restY, raisedY), saturate(progress));
}

/**
 * Finite-difference vertical velocity (m/s) between two frames, clamped to
 * a physical bound so a scroll-jump (e.g. keyboard End) cannot inject an
 * absurd impulse into the ripple field.
 */
export function verticalVelocity(
  prevY: number,
  currY: number,
  dt: number,
  maxSpeed: number,
): number {
  if (dt <= 0) return 0;
  const v = (currY - prevY) / dt;
  const cap = Math.max(0, maxSpeed);
  return clamp(v, -cap, cap);
}

/**
 * Waterline expressed in photo-local coordinates (height above the photo's
 * bottom edge, m). Below 0 means the photo is fully clear of the water;
 * above `photoHeight` means fully submerged.
 */
export function waterlineLocal(photoBottomYWorld: number, waterLevelY: number): number {
  return waterLevelY - photoBottomYWorld;
}

/**
 * A subtle pendulum tilt of the photo as it is carried upward — the kind of
 * sway a hand pulling a print with tongs produces. Deterministic in
 * progress, zero at both ends so the photo starts and finishes level.
 */
export function carryTilt(progress: number, maxTiltRad: number): number {
  const p = saturate(progress);
  return Math.sin(p * Math.PI * 2) * Math.max(0, maxTiltRad) * p * (1 - p) * 4;
}
