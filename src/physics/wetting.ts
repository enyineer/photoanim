/**
 * Wet-to-dry transition on the photo's emulsion. A point on the photo is
 * fully wet while submerged; once it emerges, its liquid film both drains
 * (runoff.ts) and evaporates. Perceived "wetness" — the gloss/darkening the
 * renderer applies — follows the residual film thickness, normalised so it
 * is 1 when saturated and 0 at the visually-dry threshold.
 */
import { saturate } from './math';
import { DRY_FILM_THICKNESS, INITIAL_FILM_THICKNESS } from './constants';

/**
 * Time (s) a point at photo-local height `yLocal` has been above the water,
 * given the photo's lift state. Pure kinematics: the waterline sweeps down
 * the photo at the lift speed, so a point `d` metres above the current
 * waterline emerged `d / liftSpeed` seconds ago.
 *
 * @param yLocal          height of the point above the photo's bottom edge (m)
 * @param waterlineLocal  current waterline in the same local coordinates (m)
 * @param liftSpeed       upward speed of the photo (m/s); values <= 0 mean
 *                        "not rising", so only points already out count, with
 *                        exposure time unknowable from kinematics alone — we
 *                        return 0 and let the caller integrate real time.
 */
export function exposureTimeFromKinematics(
  yLocal: number,
  waterlineLocal: number,
  liftSpeed: number,
): number {
  const heightAbove = yLocal - waterlineLocal;
  if (heightAbove <= 0) return 0;
  if (liftSpeed <= 0) return 0;
  return heightAbove / liftSpeed;
}

/**
 * Remaining film thickness (m) after evaporation alone: linear mass loss at
 * `evapRate` (m/s of film thickness) from an initial thickness `h`.
 */
export function evaporatedThickness(h: number, exposureTime: number, evapRate: number): number {
  return Math.max(0, Math.max(0, h) - Math.max(0, evapRate) * Math.max(0, exposureTime));
}

/**
 * Perceived wetness in [0, 1] for a film of thickness `h`:
 * 0 at/below the dry threshold, 1 at/above the saturated initial film, and
 * a smooth (square-root, optically motivated) ramp in between — thin films
 * lose their gloss faster than their volume.
 */
export function wetnessFromFilm(
  h: number,
  dryThreshold: number = DRY_FILM_THICKNESS,
  saturatedThickness: number = INITIAL_FILM_THICKNESS,
): number {
  const lo = Math.max(0, dryThreshold);
  const hi = Math.max(lo + 1e-12, saturatedThickness);
  const t = saturate((Math.max(0, h) - lo) / (hi - lo));
  return Math.sqrt(t);
}

/**
 * Exponential drying curve: wetness after `t` seconds of exposure with a
 * drying time constant `tau`. Used for the slow late-stage drying once the
 * film has mostly drained and evaporation dominates.
 */
export function wetnessExponential(exposureTime: number, tau: number): number {
  if (exposureTime <= 0) return 1;
  const safeTau = Math.max(1e-12, tau);
  return Math.exp(-exposureTime / safeTau);
}

/**
 * Visible gloss for a given wetness, in [0, 1]. A liquid film keeps a
 * mirror-like sheen until it is almost gone — gloss is governed by the
 * presence of a continuous film, not its volume — so the curve saturates
 * early: g = 1 - (1 - w)^3. Monotonic, fixed points at 0 and 1, and always
 * >= the raw wetness.
 */
export function glossFromWetness(wetness: number): number {
  const w = saturate(wetness);
  return 1 - (1 - w) ** 3;
}

/**
 * Fraction of the photo's area that still reads as wet, given the waterline
 * and a drying front descending from the top. Useful as a single scalar for
 * LOD decisions (e.g. how many runoff streaks to draw).
 */
export function wetCoverage(
  waterlineLocal: number,
  dryFrontLocal: number,
  photoHeight: number,
): number {
  const height = Math.max(1e-12, photoHeight);
  const wetTop = Math.min(Math.max(dryFrontLocal, waterlineLocal), height);
  return saturate(wetTop / height);
}
