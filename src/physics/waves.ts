/**
 * Water-surface waves: ambient lapping in the tray plus damped radial
 * ripples excited by the photo moving through the surface and by droplet
 * impacts. The GPU shader evaluates the same formulas per-vertex; these
 * pure functions are the source of truth and compute the shader uniforms
 * (amplitudes, wavenumbers, phase speeds, damping).
 */
import { GRAVITY } from './constants';

/** Deep-water dispersion: angular frequency for wavenumber k (rad/s). */
export function deepWaterAngularFrequency(k: number, g: number = GRAVITY): number {
  return Math.sqrt(Math.max(0, g) * Math.max(0, k));
}

/** Phase speed of a deep-water gravity wave of wavelength `lambda` (m/s). */
export function gravityWavePhaseSpeed(lambda: number, g: number = GRAVITY): number {
  const wavelength = Math.max(1e-12, lambda);
  return Math.sqrt((Math.max(0, g) * wavelength) / (2 * Math.PI));
}

/**
 * Initial ripple amplitude excited by the photo moving vertically through
 * the surface (m). Linear coupling to the piercing speed, saturating at
 * `maxAmplitude` so violent scrolling cannot blow up the surface.
 */
export function rippleSourceAmplitude(
  pierceSpeed: number,
  coupling: number,
  maxAmplitude: number,
): number {
  const a = Math.abs(pierceSpeed) * Math.max(0, coupling);
  return Math.min(a, Math.max(0, maxAmplitude));
}

/** Initial ripple amplitude from a droplet impact, scaling with drop mass (m). */
export function dropletImpactAmplitude(
  dropMass: number,
  coupling: number,
  maxAmplitude: number,
): number {
  const a = Math.cbrt(Math.max(0, dropMass)) * Math.max(0, coupling);
  return Math.min(a, Math.max(0, maxAmplitude));
}

/**
 * Height of a single expanding, damped ripple ring at radial distance `r`
 * from its source, `t` seconds after excitation (m).
 *
 * amplitude * exp(-damping t) — viscous decay in time
 *           / sqrt(1 + r/lambda) — geometric spreading of the ring
 *           * cos(k (r - c t)) — outward-travelling crest
 *           * exp(-(r - c t)^2 / (2 lambda^2)) — localised wave packet
 */
export function rippleHeight(
  r: number,
  t: number,
  amplitude: number,
  wavelength: number,
  damping: number,
  g: number = GRAVITY,
): number {
  if (t < 0) return 0;
  const lambda = Math.max(1e-12, wavelength);
  const k = (2 * Math.PI) / lambda;
  const c = gravityWavePhaseSpeed(lambda, g);
  const radius = Math.max(0, r);
  const packet = radius - c * t;
  const envelope =
    Math.max(0, amplitude) *
    Math.exp(-Math.max(0, damping) * t) *
    Math.exp(-(packet * packet) / (2 * lambda * lambda)) /
    Math.sqrt(1 + radius / lambda);
  return envelope * Math.cos(k * packet);
}

export interface AmbientWaveComponent {
  readonly amplitude: number;
  readonly wavelength: number;
  /** Direction of travel in the horizontal plane (radians). */
  readonly direction: number;
  readonly phase: number;
}

/**
 * Sum of directional sinusoidal components — the gentle ambient motion of
 * liquid in a tray (m). Each component obeys the deep-water dispersion
 * relation, so longer waves travel faster, as in reality.
 */
export function ambientWaveHeight(
  x: number,
  z: number,
  t: number,
  components: readonly AmbientWaveComponent[],
  g: number = GRAVITY,
): number {
  let h = 0;
  for (const c of components) {
    const lambda = Math.max(1e-12, c.wavelength);
    const k = (2 * Math.PI) / lambda;
    const omega = deepWaterAngularFrequency(k, g);
    const along = x * Math.cos(c.direction) + z * Math.sin(c.direction);
    h += c.amplitude * Math.sin(k * along - omega * t + c.phase);
  }
  return h;
}

/** Worst-case |height| of an ambient wave sum — bound for stability tests. */
export function ambientWaveBound(components: readonly AmbientWaveComponent[]): number {
  let bound = 0;
  for (const c of components) bound += Math.abs(c.amplitude);
  return bound;
}
