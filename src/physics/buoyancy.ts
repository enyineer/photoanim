/**
 * Buoyancy and displacement for a thin rectangular photo print partially
 * submerged in the fixing bath. Archimedes' principle plus simple viscous
 * drag — everything a renderer needs to pose the photo and to scale the
 * displacement waves it pushes into the water surface.
 */
import { clamp } from './math';
import { GRAVITY } from './constants';

/**
 * Vertical extent of the photo below the water surface (m).
 *
 * @param photoBottomY world-space height of the photo's bottom edge (m)
 * @param photoHeight  full height of the photo (m), must be >= 0
 * @param waterLevelY  world-space height of the undisturbed water surface (m)
 */
export function submergedDepth(
  photoBottomY: number,
  photoHeight: number,
  waterLevelY: number,
): number {
  const height = Math.max(0, photoHeight);
  return clamp(waterLevelY - photoBottomY, 0, height);
}

/** Fraction of the photo's height that is under water, in [0, 1]. */
export function submergedFraction(
  photoBottomY: number,
  photoHeight: number,
  waterLevelY: number,
): number {
  const height = Math.max(0, photoHeight);
  if (height === 0) return 0;
  return submergedDepth(photoBottomY, height, waterLevelY) / height;
}

/** Volume of fluid displaced by the submerged part of the photo (m^3). */
export function displacedVolume(
  photoWidth: number,
  photoThickness: number,
  depth: number,
): number {
  return Math.max(0, photoWidth) * Math.max(0, photoThickness) * Math.max(0, depth);
}

/** Archimedes buoyant force, straight up (N). */
export function buoyancyForce(
  displacedVol: number,
  fluidDensity: number,
  g: number = GRAVITY,
): number {
  return Math.max(0, displacedVol) * Math.max(0, fluidDensity) * Math.max(0, g);
}

/**
 * Stokes-like viscous drag opposing vertical motion through the bath (N).
 * Signed: positive force for downward motion (pushes up), negative for
 * upward motion (pulls down). Linear in velocity, valid for the slow,
 * deliberate pull of a print out of a tray.
 *
 * @param velocityY    vertical velocity of the photo (m/s, up positive)
 * @param wettedArea   submerged surface area of the photo (m^2)
 * @param dragCoeff    empirical drag coefficient (N·s/m^3)
 */
export function viscousDragForce(
  velocityY: number,
  wettedArea: number,
  dragCoeff: number,
): number {
  const force = -velocityY * Math.max(0, wettedArea) * Math.max(0, dragCoeff);
  return force === 0 ? 0 : force; // normalise -0 from a zero factor
}

/**
 * Net vertical force on the photo (N, up positive): buoyancy minus weight
 * plus drag. The capillary pull of the contact line (see meniscus.ts) is
 * added separately by the caller because it depends on wetting state.
 */
export function netVerticalForce(
  photoMass: number,
  buoyancy: number,
  drag: number,
  g: number = GRAVITY,
): number {
  return buoyancy - Math.max(0, photoMass) * Math.max(0, g) + drag;
}

/**
 * Equilibrium submerged depth at which buoyancy exactly balances weight,
 * for a free-floating photo (m). Clamped to [0, photoHeight]; a photo
 * denser than the bath returns photoHeight (it would sink).
 */
export function equilibriumDepth(
  photoDensity: number,
  fluidDensity: number,
  photoHeight: number,
): number {
  const height = Math.max(0, photoHeight);
  if (fluidDensity <= 0) return height;
  return clamp((Math.max(0, photoDensity) / fluidDensity) * height, 0, height);
}
