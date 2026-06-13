/**
 * Runner beads: the entrained liquid left on the print breaks into beads
 * that slide down the tilted face, visibly feeding the pendant drops on
 * the low edge.
 *
 * A bead on an inclined plate is pinned by contact-angle hysteresis until
 * its weight component along the plate exceeds the Furmidge retention
 * force F = w * sigma * (cos(theta_r) - cos(theta_a)); beyond that it
 * slides at a speed set by viscous drag in the wedge:
 *   v = (m g_plate - F) / (k * mu * r)
 * with k an empirical dimensionless drag factor for the contact-line
 * wedge region (~300 gives the few-cm/s creep seen on real wet prints).
 */
import { hash01 } from './math';

/** cos(theta_receding) - cos(theta_advancing) for wet gelatin emulsion. */
export const EMULSION_COS_HYSTERESIS = 0.06;

/** Empirical wedge drag factor for bead sliding. */
export const BEAD_DRAG_FACTOR = 300;

/** Furmidge contact-line retention force (N). */
export function retentionForce(
  contactWidth: number,
  surfaceTension: number,
  cosHysteresis: number = EMULSION_COS_HYSTERESIS,
): number {
  return Math.max(0, contactWidth) * Math.max(0, surfaceTension) * Math.max(0, cosHysteresis);
}

/**
 * Quasi-static sliding speed of a bead down the plate (m/s). Zero while
 * pinned (retention exceeds the along-plate weight).
 */
export function beadSlideVelocity(
  mass: number,
  gAlongPlate: number,
  retention: number,
  viscosity: number,
  radius: number,
  dragFactor: number = BEAD_DRAG_FACTOR,
): number {
  const driving = Math.max(0, mass) * Math.max(0, gAlongPlate) - Math.max(0, retention);
  if (driving <= 0) return 0;
  const drag = Math.max(1e-12, dragFactor * Math.max(0, viscosity) * Math.max(1e-9, radius));
  return driving / drag;
}

export interface RunnerBead {
  /** Stable id for renderers. */
  readonly id: number;
  /** Lateral position on the plate (m, 0 = centre). */
  readonly x: number;
  /** Distance along the plate above the low edge (m). */
  readonly p: number;
  /** Bead mass (kg). */
  readonly mass: number;
  /** Bead radius (m), cached from mass. */
  readonly radius: number;
}

export interface RunnersState {
  readonly beads: readonly RunnerBead[];
  /** Monotonic spawn counter — drives the deterministic spawn pattern. */
  readonly spawnCount: number;
  /** Plate-coordinate waterline at the last spawn (m). */
  readonly lastSpawnWaterline: number;
}

export function createRunnersState(initialWaterline: number): RunnersState {
  return { beads: [], spawnCount: 0, lastSpawnWaterline: initialWaterline };
}

export interface RunnerDeposit {
  /** Lateral position where the bead reached the low edge (m). */
  readonly x: number;
  readonly mass: number;
}

export interface RunnersStepResult {
  readonly state: RunnersState;
  /** Beads that reached the low edge this step. */
  readonly deposits: readonly RunnerDeposit[];
}

export interface RunnersParams {
  /** Plate length the waterline must sweep between spawns (m). */
  readonly spawnSpacing: number;
  /** Mass of a freshly spawned bead (kg). */
  readonly beadMass: number;
  /** Print width (m), bounds the lateral spawn positions. */
  readonly photoWidth: number;
  /** Print height along the plate (m). */
  readonly photoHeight: number;
  readonly gAlongPlate: number;
  readonly viscosity: number;
  readonly surfaceTension: number;
  readonly fluidDensity: number;
  /** Hard cap on simultaneous beads. */
  readonly maxBeads: number;
}

function beadRadius(mass: number, density: number): number {
  return Math.cbrt((3 * Math.max(0, mass)) / (4 * Math.PI * Math.max(1e-12, density)));
}

/**
 * Advance the runner beads by `dt`. While the print is piercing the
 * surface (`waterline` descending through (0, photoHeight)), a new bead is
 * left behind each time the contact line sweeps `spawnSpacing` of plate.
 * Beads slide toward the low edge; a bead reaching the waterline while the
 * low edge is still submerged rejoins the bath silently, one reaching the
 * low edge after emergence becomes a deposit for the pendant drops.
 * Pure and deterministic.
 */
export function stepRunners(
  prev: RunnersState,
  waterline: number,
  dt: number,
  params: RunnersParams,
): RunnersStepResult {
  if (dt <= 0) return { state: prev, deposits: [] };

  let spawnCount = prev.spawnCount;
  let lastSpawnWaterline = prev.lastSpawnWaterline;
  const beads: RunnerBead[] = [];
  const deposits: RunnerDeposit[] = [];

  // Spawn while the contact line sweeps down the plate.
  const piercing = waterline > 0 && waterline < params.photoHeight;
  if (piercing) {
    while (
      lastSpawnWaterline - waterline >= params.spawnSpacing &&
      prev.beads.length + (spawnCount - prev.spawnCount) < params.maxBeads
    ) {
      lastSpawnWaterline -= params.spawnSpacing;
      spawnCount += 1;
      beads.push({
        id: spawnCount,
        x: (hash01(spawnCount * 3 + 1) - 0.5) * params.photoWidth * 0.8,
        p: Math.max(lastSpawnWaterline, 0),
        mass: params.beadMass,
        radius: beadRadius(params.beadMass, params.fluidDensity),
      });
    }
  } else if (waterline >= params.photoHeight) {
    // Fully submerged again: reset the spawn line to the top of the plate.
    lastSpawnWaterline = waterline;
  }

  // Advance existing beads.
  for (const b of prev.beads) {
    const retention = retentionForce(2 * b.radius, params.surfaceTension);
    const v = beadSlideVelocity(
      b.mass,
      params.gAlongPlate,
      retention,
      params.viscosity,
      b.radius,
    );
    const p = b.p - v * dt;
    if (waterline > 0 && p <= waterline) continue; // rejoined the bath
    if (p <= 0) {
      deposits.push({ x: b.x, mass: b.mass });
      continue;
    }
    beads.push({ ...b, p });
  }

  return {
    state: { beads, spawnCount, lastSpawnWaterline },
    deposits,
  };
}

/** Total mass in flight (kg) — for conservation tests. */
export function totalRunnerMass(state: RunnersState): number {
  let sum = 0;
  for (const b of state.beads) sum += b.mass;
  return sum;
}

/** Map a deposit's lateral position onto the nearest drip site index. */
export function nearestDripSite(x: number, siteCount: number, photoWidth: number): number {
  const n = Math.max(1, Math.floor(siteCount));
  if (n === 1) return 0;
  const t = x / (Math.max(1e-9, photoWidth) * 0.85) + 0.5;
  return Math.min(n - 1, Math.max(0, Math.round(t * (n - 1))));
}

/** Default bead spawn parameters derived from the entrained film. */
export function defaultBeadMass(
  fluidDensity: number,
  filmThickness: number,
  spawnSpacing: number,
  catchmentWidth: number,
): number {
  return (
    Math.max(0, fluidDensity) *
    Math.max(0, filmThickness) *
    Math.max(0, spawnSpacing) *
    Math.max(0, catchmentWidth)
  );
}
