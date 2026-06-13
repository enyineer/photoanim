/**
 * Physical constants for the photo-fixing-bath simulation.
 * SI units throughout: meters, kilograms, seconds, newtons.
 */

/** Gravitational acceleration (m/s^2). */
export const GRAVITY = 9.81;

/** Density of water at ~20 °C (kg/m^3). */
export const WATER_DENSITY = 998;

/**
 * Density of a working-strength sodium-thiosulfate fixer solution (kg/m^3).
 * Slightly denser than plain water because of the dissolved salts.
 */
export const FIXER_DENSITY = 1060;

/** Surface tension of water at ~20 °C (N/m). */
export const WATER_SURFACE_TENSION = 0.0728;

/**
 * Surface tension of fixer solution (N/m). Wetting agents and salts lower
 * it slightly relative to pure water.
 */
export const FIXER_SURFACE_TENSION = 0.06;

/** Dynamic viscosity of water at ~20 °C (Pa·s). */
export const WATER_VISCOSITY = 1.0e-3;

/** Dynamic viscosity of fixer solution (Pa·s) — marginally above water. */
export const FIXER_VISCOSITY = 1.15e-3;

/**
 * Density of resin-coated photo paper (kg/m^3). RC paper is a cellulose
 * core laminated in polyethylene; it is close to neutrally buoyant but
 * slightly less dense than the bath, so it floats up gently.
 */
export const PHOTO_PAPER_DENSITY = 900;

/**
 * Contact angle of fixer on wet gelatin emulsion (radians). Gelatin is
 * hydrophilic, so the liquid climbs the photo: a small contact angle.
 */
export const EMULSION_CONTACT_ANGLE = (25 * Math.PI) / 180;

/** Initial thickness of the liquid film clinging to a just-lifted photo (m). */
export const INITIAL_FILM_THICKNESS = 3.0e-4;

/** Liquid film thickness below which a surface reads as visually dry (m). */
export const DRY_FILM_THICKNESS = 5.0e-6;
