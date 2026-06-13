/**
 * Frame integration: composes the individual physical models into a single
 * deterministic step the renderer can consume. `stepFrame(prev, input,
 * config)` is pure — given the same previous state, input and config it
 * always returns the same next state — so the entire animation timeline is
 * unit-testable without a GPU or a DOM.
 */
import { FIXER_DENSITY, FIXER_SURFACE_TENSION, FIXER_VISCOSITY, GRAVITY, INITIAL_FILM_THICKNESS } from './constants';
import { saturate } from './math';
import { submergedDepth, submergedFraction } from './buoyancy';
import {
  capillaryLength,
  capillaryNumber,
  dynamicMeniscusRise,
  liquidBridgeFactor,
  meniscusRiseHeight,
} from './meniscus';
import { bottomEdgeFlux, filmThickness } from './runoff';
import {
  createDripSites,
  type DetachedDrop,
  type DripSitesState,
  dripSiteDetachMasses,
  dripSiteWeights,
  stepDrips,
} from './drips';
import { liftProgress, photoBottomY, verticalVelocity, waterlineLocal } from './timeline';

export interface FrameConfig {
  /** Photo dimensions (m). */
  readonly photoWidth: number;
  readonly photoHeight: number;
  /** Bottom-edge rest (submerged) and raised world Y (m). */
  readonly restY: number;
  readonly raisedY: number;
  /** Undisturbed water surface world Y (m). */
  readonly waterLevelY: number;
  /** Number of pendant-drop sites along the bottom edge. */
  readonly dripSiteCount: number;
  /** Contact angle of the bath on the emulsion (rad). */
  readonly contactAngle: number;
  /** Cap for the finite-difference lift speed (m/s). */
  readonly maxLiftSpeed: number;
  readonly fluidDensity: number;
  readonly fluidViscosity: number;
  readonly surfaceTension: number;
  readonly gravity: number;
}

export const DEFAULT_FRAME_CONFIG: FrameConfig = {
  photoWidth: 0.127, // 5x7" print
  photoHeight: 0.178,
  restY: -0.2,
  raisedY: 0.3,
  waterLevelY: 0,
  dripSiteCount: 7,
  contactAngle: (25 * Math.PI) / 180,
  maxLiftSpeed: 1.5,
  fluidDensity: FIXER_DENSITY,
  fluidViscosity: FIXER_VISCOSITY,
  surfaceTension: FIXER_SURFACE_TENSION,
  gravity: GRAVITY,
};

export interface FrameState {
  /** Simulation time (s). */
  readonly time: number;
  /** Eased lift progress in [0, 1]. */
  readonly progress: number;
  /** World Y of the photo's bottom edge (m). */
  readonly photoBottomY: number;
  /** Vertical lift speed (m/s, up positive). */
  readonly liftSpeed: number;
  /** Waterline in photo-local coordinates (m above bottom edge). */
  readonly waterlineLocal: number;
  /** Fraction of the photo under water, [0, 1]. */
  readonly submergedFraction: number;
  /** Depth of the submerged portion (m). */
  readonly submergedDepth: number;
  /** Seconds since the photo's bottom edge cleared the water (0 while wet). */
  readonly timeSinceEmerged: number;
  /** Meniscus rise height where the photo pierces the surface (m). */
  readonly meniscusRise: number;
  /** Capillary length of the bath (m). */
  readonly capillaryLen: number;
  /** Liquid-bridge stretch factor in [0, 1] once the photo clears the surface. */
  readonly bridgeFactor: number;
  /** Draining film thickness at the photo's bottom edge (m). */
  readonly bottomFilmThickness: number;
  /** Volumetric runoff flux off the bottom edge (m^3/s). */
  readonly runoffFlux: number;
  /** Pendant-drop accumulation state. */
  readonly drips: DripSitesState;
  /** Drops that detached during this step. */
  readonly detachedDrops: readonly DetachedDrop[];
}

/** Initial state for a given config (photo at rest in the bath). */
export function createFrameState(config: FrameConfig = DEFAULT_FRAME_CONFIG): FrameState {
  const bottom = photoBottomY(0, config.restY, config.raisedY);
  const wl = waterlineLocal(bottom, config.waterLevelY);
  const lc = capillaryLength(config.surfaceTension, config.fluidDensity, config.gravity);
  return {
    time: 0,
    progress: 0,
    photoBottomY: bottom,
    liftSpeed: 0,
    waterlineLocal: wl,
    submergedFraction: submergedFraction(bottom, config.photoHeight, config.waterLevelY),
    submergedDepth: submergedDepth(bottom, config.photoHeight, config.waterLevelY),
    timeSinceEmerged: 0,
    meniscusRise: meniscusRiseHeight(config.contactAngle, lc),
    capillaryLen: lc,
    bridgeFactor: 1,
    bottomFilmThickness: INITIAL_FILM_THICKNESS,
    runoffFlux: 0,
    drips: createDripSites(config.dripSiteCount),
    detachedDrops: [],
  };
}

export interface FrameInput {
  /** Raw scroll fraction in [0, 1]. */
  readonly scroll: number;
  /** Frame delta time (s). */
  readonly dt: number;
}

/** Advance the simulation by one frame. Pure: no mutation of `prev`. */
export function stepFrame(
  prev: FrameState,
  input: FrameInput,
  config: FrameConfig = DEFAULT_FRAME_CONFIG,
): FrameState {
  const dt = Math.max(0, input.dt);
  const time = prev.time + dt;

  const progress = liftProgress(saturate(input.scroll));
  const bottom = photoBottomY(progress, config.restY, config.raisedY);
  const liftSpeed = verticalVelocity(prev.photoBottomY, bottom, dt, config.maxLiftSpeed);

  const wl = waterlineLocal(bottom, config.waterLevelY);
  const frac = submergedFraction(bottom, config.photoHeight, config.waterLevelY);
  const depth = submergedDepth(bottom, config.photoHeight, config.waterLevelY);

  const lc = capillaryLength(config.surfaceTension, config.fluidDensity, config.gravity);
  // Withdrawal drags extra liquid up the plate: dynamic meniscus.
  const ca = capillaryNumber(config.fluidViscosity, liftSpeed, config.surfaceTension);
  const rise = dynamicMeniscusRise(meniscusRiseHeight(config.contactAngle, lc), ca);

  const emerged = wl < 0;
  const timeSinceEmerged = emerged ? prev.timeSinceEmerged + dt : 0;
  const gap = emerged ? -wl : 0;
  const bridgeFactor = liquidBridgeFactor(gap, lc);

  // Film at the bottom edge: while the edge is submerged the film is fully
  // replenished; once out, it drains per Jeffreys with the wetted length of
  // the photo above it feeding it.
  const wettedLengthAboveBottom = emerged
    ? config.photoHeight
    : Math.max(0, config.photoHeight - wl);
  const bottomFilm = emerged
    ? filmThickness(
        wettedLengthAboveBottom,
        timeSinceEmerged,
        config.fluidViscosity,
        config.fluidDensity,
        config.gravity,
      )
    : INITIAL_FILM_THICKNESS;

  // Runoff only happens on the exposed part of the photo.
  const exposedFraction = 1 - frac;
  const runoffFlux =
    exposedFraction > 0
      ? bottomEdgeFlux(
          bottomFilm,
          config.photoWidth,
          config.fluidDensity,
          config.fluidViscosity,
          config.gravity,
        ) * exposedFraction
      : 0;

  // Pendant drops only grow once the bottom edge is above the surface —
  // below it the runoff just returns to the bath. Sites feed and detach
  // irregularly (deterministic per-site weights and rim radii), so drops
  // never fall in lockstep.
  const detachMasses = dripSiteDetachMasses(
    config.dripSiteCount,
    lc,
    config.surfaceTension,
    config.gravity,
  );
  const massFlux = emerged ? runoffFlux * config.fluidDensity : 0;
  const dripResult = stepDrips(
    prev.drips,
    massFlux,
    dt,
    detachMasses,
    dripSiteWeights(config.dripSiteCount),
  );

  return {
    time,
    progress,
    photoBottomY: bottom,
    liftSpeed,
    waterlineLocal: wl,
    submergedFraction: frac,
    submergedDepth: depth,
    timeSinceEmerged,
    meniscusRise: rise,
    capillaryLen: lc,
    bridgeFactor,
    bottomFilmThickness: bottomFilm,
    runoffFlux,
    drips: dripResult.state,
    detachedDrops: dripResult.detached,
  };
}
