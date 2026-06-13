/**
 * Runoff sheeting: the liquid film left on the photo drains downward under
 * gravity. Lubrication theory (Jeffreys drainage) for a vertical plate gives
 * the film thickness
 *   h(y, t) = sqrt(mu * y / (rho * g * t))
 * where y is the distance below the top of the wetted region and t the time
 * since that region emerged. The film is thinnest at the top (it drains
 * first) and thins everywhere as 1/sqrt(t).
 */
import { GRAVITY, INITIAL_FILM_THICKNESS } from './constants';

/**
 * Thickness of the draining film (m) at distance `distFromTop` below the
 * top of the wetted region, `time` seconds after emergence. Capped at the
 * initial entrained film thickness `h0` (the film cannot thicken).
 */
export function filmThickness(
  distFromTop: number,
  time: number,
  viscosity: number,
  density: number,
  g: number = GRAVITY,
  h0: number = INITIAL_FILM_THICKNESS,
): number {
  const cappedH0 = Math.max(0, h0);
  if (time <= 0) return cappedH0;
  if (distFromTop <= 0) return 0;
  const denom = Math.max(1e-12, density * g * time);
  const h = Math.sqrt((Math.max(0, viscosity) * distFromTop) / denom);
  return Math.min(cappedH0, h);
}

/**
 * Volumetric drainage flux per unit width of plate (m^2/s) for a gravity-
 * driven film of thickness `h` — the classic Nusselt result q = rho g h^3 / (3 mu).
 * This is what feeds the pendant drops on the bottom edge.
 */
export function drainageFluxPerWidth(
  h: number,
  density: number,
  viscosity: number,
  g: number = GRAVITY,
): number {
  const mu = Math.max(1e-12, viscosity);
  const thickness = Math.max(0, h);
  return (Math.max(0, density) * Math.max(0, g) * thickness ** 3) / (3 * mu);
}

/** Total volumetric flux off the photo's bottom edge (m^3/s). */
export function bottomEdgeFlux(
  h: number,
  photoWidth: number,
  density: number,
  viscosity: number,
  g: number = GRAVITY,
): number {
  return drainageFluxPerWidth(h, density, viscosity, g) * Math.max(0, photoWidth);
}

/**
 * Surface velocity of the draining sheet (m/s, downward positive):
 * u = rho g h^2 / (2 mu). Drives the visible speed of the runoff streaks.
 */
export function sheetSurfaceSpeed(
  h: number,
  density: number,
  viscosity: number,
  g: number = GRAVITY,
): number {
  const mu = Math.max(1e-12, viscosity);
  const thickness = Math.max(0, h);
  return (Math.max(0, density) * Math.max(0, g) * thickness ** 2) / (2 * mu);
}
