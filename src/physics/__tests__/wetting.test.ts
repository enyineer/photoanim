import { describe, expect, it } from 'vitest';
import {
  evaporatedThickness,
  exposureTimeFromKinematics,
  glossFromWetness,
  wetCoverage,
  wetnessExponential,
  wetnessFromFilm,
} from '../wetting';
import { DRY_FILM_THICKNESS, INITIAL_FILM_THICKNESS } from '../constants';

describe('exposureTimeFromKinematics', () => {
  it('is zero at and below the waterline (still submerged)', () => {
    expect(exposureTimeFromKinematics(0.05, 0.05, 0.1)).toBe(0);
    expect(exposureTimeFromKinematics(0.02, 0.05, 0.1)).toBe(0);
  });

  it('equals heightAbove / liftSpeed above the waterline', () => {
    expect(exposureTimeFromKinematics(0.15, 0.05, 0.1)).toBeCloseTo(1, 12);
  });

  it('increases with height above the waterline (top emerged first)', () => {
    const tLow = exposureTimeFromKinematics(0.08, 0.05, 0.1);
    const tHigh = exposureTimeFromKinematics(0.16, 0.05, 0.1);
    expect(tHigh).toBeGreaterThan(tLow);
  });

  it('returns 0 for a stationary or descending photo instead of dividing by zero', () => {
    expect(exposureTimeFromKinematics(0.15, 0.05, 0)).toBe(0);
    expect(exposureTimeFromKinematics(0.15, 0.05, -0.2)).toBe(0);
  });
});

describe('evaporatedThickness', () => {
  it('returns the initial thickness at t = 0', () => {
    expect(evaporatedThickness(3e-4, 0, 1e-6)).toBe(3e-4);
  });

  it('loses thickness linearly with time', () => {
    expect(evaporatedThickness(3e-4, 100, 1e-6)).toBeCloseTo(2e-4, 15);
  });

  it('never goes negative (cannot evaporate more than exists)', () => {
    expect(evaporatedThickness(3e-4, 1e9, 1e-6)).toBe(0);
  });
});

describe('wetnessFromFilm', () => {
  it('is 1 for a saturated film and 0 at/below the dry threshold', () => {
    expect(wetnessFromFilm(INITIAL_FILM_THICKNESS)).toBe(1);
    expect(wetnessFromFilm(INITIAL_FILM_THICKNESS * 2)).toBe(1);
    expect(wetnessFromFilm(DRY_FILM_THICKNESS)).toBe(0);
    expect(wetnessFromFilm(0)).toBe(0);
  });

  it('is monotonically non-decreasing in film thickness', () => {
    let prev = -1;
    for (let h = 0; h <= INITIAL_FILM_THICKNESS * 1.5; h += INITIAL_FILM_THICKNESS / 50) {
      const w = wetnessFromFilm(h);
      expect(w).toBeGreaterThanOrEqual(prev - 1e-15);
      expect(w).toBeGreaterThanOrEqual(0);
      expect(w).toBeLessThanOrEqual(1);
      prev = w;
    }
  });

  it('loses gloss faster than volume (concave ramp: half film > half wetness... actually sqrt)', () => {
    const mid = (DRY_FILM_THICKNESS + INITIAL_FILM_THICKNESS) / 2;
    expect(wetnessFromFilm(mid)).toBeCloseTo(Math.sqrt(0.5), 9);
  });

  it('survives a degenerate threshold ordering without NaN', () => {
    expect(Number.isFinite(wetnessFromFilm(1e-4, 1e-4, 1e-4))).toBe(true);
  });
});

describe('wetnessExponential', () => {
  it('is exactly 1 with no exposure', () => {
    expect(wetnessExponential(0, 30)).toBe(1);
    expect(wetnessExponential(-5, 30)).toBe(1);
  });

  it('decays monotonically with exposure time', () => {
    let prev = 1;
    for (let t = 0; t <= 300; t += 5) {
      const w = wetnessExponential(t, 60);
      expect(w).toBeLessThanOrEqual(prev + 1e-15);
      expect(w).toBeGreaterThan(0);
      expect(w).toBeLessThanOrEqual(1);
      prev = w;
    }
  });

  it('reaches 1/e at one time constant', () => {
    expect(wetnessExponential(60, 60)).toBeCloseTo(1 / Math.E, 12);
  });

  it('dries faster with a smaller tau', () => {
    expect(wetnessExponential(30, 10)).toBeLessThan(wetnessExponential(30, 100));
  });

  it('does not blow up for tau = 0', () => {
    expect(Number.isFinite(wetnessExponential(1, 0))).toBe(true);
    expect(wetnessExponential(1, 0)).toBeCloseTo(0, 9);
  });
});

describe('glossFromWetness', () => {
  it('has fixed points at fully dry and fully wet', () => {
    expect(glossFromWetness(0)).toBe(0);
    expect(glossFromWetness(1)).toBe(1);
  });

  it('saturates early: a half-drained film still looks nearly mirror-wet', () => {
    expect(glossFromWetness(0.5)).toBeGreaterThan(0.85);
  });

  it('is monotonic, bounded and always >= the raw wetness', () => {
    let prev = 0;
    for (let w = 0; w <= 1.0001; w += 0.01) {
      const g = glossFromWetness(w);
      expect(g).toBeGreaterThanOrEqual(prev - 1e-15);
      expect(g).toBeGreaterThanOrEqual(Math.min(w, 1) - 1e-15);
      expect(g).toBeLessThanOrEqual(1);
      prev = g;
    }
  });

  it('clamps out-of-range wetness', () => {
    expect(glossFromWetness(-2)).toBe(0);
    expect(glossFromWetness(5)).toBe(1);
  });
});

describe('wetCoverage', () => {
  const H = 0.178;

  it('is 1 while the photo is fully submerged', () => {
    expect(wetCoverage(H + 0.05, H + 0.05, H)).toBe(1);
  });

  it('tracks the waterline while no drying has started', () => {
    expect(wetCoverage(H / 2, H / 2, H)).toBeCloseTo(0.5, 12);
  });

  it('is 0 once both waterline and drying front are below the photo', () => {
    expect(wetCoverage(-0.1, 0, H)).toBe(0);
  });

  it('uses the wetter of waterline and drying front (water keeps it wet)', () => {
    expect(wetCoverage(0.1, 0.05, H)).toBeCloseTo(0.1 / H, 12);
    expect(wetCoverage(0.05, 0.1, H)).toBeCloseTo(0.1 / H, 12);
  });

  it('stays in [0, 1] for arbitrary inputs', () => {
    for (const wl of [-1, 0, 0.05, 0.2, 1]) {
      for (const df of [-1, 0, 0.05, 0.2, 1]) {
        const c = wetCoverage(wl, df, H);
        expect(c).toBeGreaterThanOrEqual(0);
        expect(c).toBeLessThanOrEqual(1);
      }
    }
  });
});
