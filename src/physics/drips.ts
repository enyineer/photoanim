/**
 * Droplet formation on the photo's bottom edge. Drained liquid accumulates
 * in pendant drops at discrete sites along the edge; a drop detaches when
 * its weight beats the surface-tension retention at the rim (Tate's law):
 *   m_detach * g = 2 * pi * r_rim * sigma
 * Only part of the pendant liquid leaves with the drop (the Harkins-Brown
 * correction); the rest stays and keeps growing. Falling drops are ballistic
 * with a terminal-velocity clamp.
 *
 * Everything here is pure: `stepDrips(state, ...) -> newState` so the same
 * inputs always produce the same droplet timeline.
 */
import { GRAVITY } from './constants';
import { hash01 } from './math';

/** Pendant-drop mass at which detachment occurs, per Tate's law (kg). */
export function tateDetachmentMass(
  rimRadius: number,
  surfaceTension: number,
  g: number = GRAVITY,
): number {
  const safeG = Math.max(1e-12, g);
  return (2 * Math.PI * Math.max(0, rimRadius) * Math.max(0, surfaceTension)) / safeG;
}

/**
 * Harkins-Brown: fraction of the pendant mass actually carried away by the
 * detaching drop. Empirically ~0.6 for rims comparable to the capillary
 * length; we expose it as a constant for the tests to pin down.
 */
export const HARKINS_BROWN_FRACTION = 0.6;

/** Radius of a spherical droplet of the given mass and density (m). */
export function dropletRadius(mass: number, density: number): number {
  const rho = Math.max(1e-12, density);
  return Math.cbrt((3 * Math.max(0, mass)) / (4 * Math.PI * rho));
}

/** Terminal fall velocity for a small droplet (m/s) — capped Stokes-ish model. */
export function terminalVelocity(radius: number, g: number = GRAVITY): number {
  // For millimetre-scale drops over a ~10 cm fall, drag barely matters;
  // we use a generous cap purely to keep the visual speed plausible.
  return Math.sqrt(2 * Math.max(0, g) * Math.max(0, radius) * 400);
}

/** Fall distance after `t` seconds, ballistic with terminal-velocity clamp (m). */
export function fallDistance(t: number, vTerminal: number, g: number = GRAVITY): number {
  const time = Math.max(0, t);
  const vt = Math.max(0, vTerminal);
  const safeG = Math.max(0, g);
  if (safeG === 0) return 0;
  const tCross = vt / Math.max(1e-12, safeG);
  if (time <= tCross) return 0.5 * safeG * time * time;
  return 0.5 * safeG * tCross * tCross + vt * (time - tCross);
}

export interface DetachedDrop {
  /** Index of the edge site the drop fell from. */
  readonly site: number;
  /** Mass of the falling drop (kg). */
  readonly mass: number;
}

export interface DripSitesState {
  /** Pendant mass currently hanging at each site (kg). */
  readonly pendantMasses: readonly number[];
}

export interface DripStepResult {
  readonly state: DripSitesState;
  /** Drops that detached during this step. */
  readonly detached: readonly DetachedDrop[];
}

/** Initial drip state with `siteCount` empty pendant sites. */
export function createDripSites(siteCount: number): DripSitesState {
  return { pendantMasses: new Array(Math.max(0, Math.floor(siteCount))).fill(0) };
}

/**
 * Deterministic, irregular share of the drainage each edge site receives.
 * Surface tension gathers the draining film into a handful of rivulets, so
 * the distribution must be strongly concentrated, not merely uneven: a
 * cubic skew on the hash gives a couple of dominant sites that drip
 * steadily while the rest accumulate slowly — a real edge shows two or
 * three active drip points, never a uniform row of beads.
 */
export function dripSiteWeights(siteCount: number): number[] {
  const n = Math.max(0, Math.floor(siteCount));
  const weights = new Array<number>(n);
  for (let i = 0; i < n; i++) weights[i] = 0.08 + 1.5 * hash01(i) ** 3;
  return weights;
}

/**
 * Per-site detachment masses: the local rim radius each pendant drop hangs
 * from varies along the edge, so Tate thresholds vary too. Spread is
 * ±35 % around the base rim radius, deterministic per site.
 */
export function dripSiteDetachMasses(
  siteCount: number,
  baseRimRadius: number,
  surfaceTension: number,
  g: number = GRAVITY,
): number[] {
  const n = Math.max(0, Math.floor(siteCount));
  const masses = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    const rim = Math.max(0, baseRimRadius) * (0.65 + 0.7 * hash01(i + 31));
    masses[i] = tateDetachmentMass(rim, surfaceTension, g);
  }
  return masses;
}

/**
 * Advance all pendant drops by `dt` seconds. `totalMassFlux` (kg/s) is the
 * drainage arriving at the bottom edge, split across sites by `siteWeights`
 * (un-normalised; defaults to uniform). `detachMass` may be a single Tate
 * threshold or one per site. Deterministic: detachment happens exactly when
 * a site's pendant mass crosses its threshold.
 *
 * Mass is conserved: influx = delta(pendant) + sum(detached masses).
 */
export function stepDrips(
  state: DripSitesState,
  totalMassFlux: number,
  dt: number,
  detachMass: number | readonly number[],
  siteWeights?: readonly number[],
): DripStepResult {
  const n = state.pendantMasses.length;
  if (n === 0 || dt <= 0) return { state, detached: [] };

  const weights =
    siteWeights && siteWeights.length === n ? siteWeights : new Array<number>(n).fill(1);
  let weightSum = 0;
  for (const w of weights) weightSum += Math.max(0, w);
  if (weightSum <= 0) return { state, detached: [] };

  const influx = Math.max(0, totalMassFlux) * dt;
  const masses = new Array<number>(n);
  const detached: DetachedDrop[] = [];

  for (let i = 0; i < n; i++) {
    const threshold = Math.max(
      1e-15,
      typeof detachMass === 'number' ? detachMass : (detachMass[i] ?? detachMass[0] ?? 0),
    );
    let m = state.pendantMasses[i] + (influx * Math.max(0, weights[i])) / weightSum;
    if (m >= threshold) {
      const dropMass = m * HARKINS_BROWN_FRACTION;
      detached.push({ site: i, mass: dropMass });
      m -= dropMass;
    }
    masses[i] = m;
  }

  return { state: { pendantMasses: masses }, detached };
}

/** Total pendant mass across all sites (kg) — handy for conservation tests. */
export function totalPendantMass(state: DripSitesState): number {
  let sum = 0;
  for (const m of state.pendantMasses) sum += m;
  return sum;
}
