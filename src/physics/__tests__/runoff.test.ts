import { describe, expect, it } from 'vitest';
import {
  bottomEdgeFlux,
  drainageFluxPerWidth,
  filmThickness,
  sheetSurfaceSpeed,
} from '../runoff';
import {
  FIXER_DENSITY,
  FIXER_VISCOSITY,
  GRAVITY,
  INITIAL_FILM_THICKNESS,
} from '../constants';

const mu = FIXER_VISCOSITY;
const rho = FIXER_DENSITY;

describe('filmThickness (Jeffreys drainage)', () => {
  it('starts at the entrained thickness h0 at t = 0', () => {
    expect(filmThickness(0.1, 0, mu, rho)).toBe(INITIAL_FILM_THICKNESS);
  });

  it('never exceeds h0 at any position or time', () => {
    for (let t = 0; t <= 30; t += 0.5) {
      for (let y = 0; y <= 0.2; y += 0.02) {
        expect(filmThickness(y, t, mu, rho)).toBeLessThanOrEqual(INITIAL_FILM_THICKNESS);
      }
    }
  });

  it('thins monotonically over time at a fixed position', () => {
    let prev = Infinity;
    for (let t = 0.1; t <= 60; t += 0.5) {
      const h = filmThickness(0.1, t, mu, rho);
      expect(h).toBeLessThanOrEqual(prev + 1e-15);
      expect(h).toBeGreaterThanOrEqual(0);
      prev = h;
    }
  });

  it('thickens with distance below the top of the wetted region', () => {
    const t = 5;
    let prev = -1;
    for (let y = 0; y <= 0.2; y += 0.01) {
      const h = filmThickness(y, t, mu, rho);
      expect(h).toBeGreaterThanOrEqual(prev - 1e-15);
      prev = h;
    }
  });

  it('follows the 1/sqrt(t) law once below the cap', () => {
    const h1 = filmThickness(0.1, 10, mu, rho);
    const h4 = filmThickness(0.1, 40, mu, rho);
    expect(h1 / h4).toBeCloseTo(2, 6);
  });

  it('follows the sqrt(y) law in position', () => {
    const t = 20;
    const hA = filmThickness(0.04, t, mu, rho);
    const hB = filmThickness(0.16, t, mu, rho);
    expect(hB / hA).toBeCloseTo(2, 6);
  });

  it('is zero exactly at the top of the wetted region', () => {
    expect(filmThickness(0, 5, mu, rho)).toBe(0);
  });

  it('stays finite under degenerate inputs', () => {
    expect(Number.isFinite(filmThickness(0.1, 1e-9, mu, rho))).toBe(true);
    expect(Number.isFinite(filmThickness(0.1, 5, mu, 0))).toBe(true);
    expect(Number.isFinite(filmThickness(0.1, 5, 0, rho))).toBe(true);
  });
});

describe('drainageFluxPerWidth (Nusselt film)', () => {
  it('matches rho g h^3 / (3 mu) exactly', () => {
    const h = 2e-4;
    expect(drainageFluxPerWidth(h, rho, mu, GRAVITY)).toBeCloseTo(
      (rho * GRAVITY * h ** 3) / (3 * mu),
      18,
    );
  });

  it('is zero for a dry surface', () => {
    expect(drainageFluxPerWidth(0, rho, mu)).toBe(0);
  });

  it('scales cubically with film thickness', () => {
    const q1 = drainageFluxPerWidth(1e-4, rho, mu);
    const q2 = drainageFluxPerWidth(2e-4, rho, mu);
    expect(q2 / q1).toBeCloseTo(8, 9);
  });

  it('is monotonically increasing in thickness and never negative', () => {
    let prev = -1;
    for (let h = 0; h <= 5e-4; h += 1e-5) {
      const q = drainageFluxPerWidth(h, rho, mu);
      expect(q).toBeGreaterThanOrEqual(Math.max(0, prev));
      prev = q;
    }
  });

  it('decreases with viscosity (honey sheets slower than water)', () => {
    expect(drainageFluxPerWidth(2e-4, rho, 1e-3)).toBeGreaterThan(
      drainageFluxPerWidth(2e-4, rho, 1e-1),
    );
  });
});

describe('bottomEdgeFlux', () => {
  it('is the per-width flux times the photo width', () => {
    const h = 2e-4;
    const w = 0.127;
    expect(bottomEdgeFlux(h, w, rho, mu)).toBeCloseTo(drainageFluxPerWidth(h, rho, mu) * w, 18);
  });

  it('vanishes for a zero-width photo', () => {
    expect(bottomEdgeFlux(2e-4, 0, rho, mu)).toBe(0);
  });
});

describe('sheetSurfaceSpeed', () => {
  it('matches rho g h^2 / (2 mu)', () => {
    const h = 2e-4;
    expect(sheetSurfaceSpeed(h, rho, mu, GRAVITY)).toBeCloseTo((rho * GRAVITY * h * h) / (2 * mu), 15);
  });

  it('scales quadratically with thickness', () => {
    expect(sheetSurfaceSpeed(2e-4, rho, mu) / sheetSurfaceSpeed(1e-4, rho, mu)).toBeCloseTo(4, 9);
  });

  it('is physically plausible for the initial film: cm/s, not m/s', () => {
    const u = sheetSurfaceSpeed(INITIAL_FILM_THICKNESS, rho, mu);
    expect(u).toBeGreaterThan(0.01);
    expect(u).toBeLessThan(1);
  });
});
