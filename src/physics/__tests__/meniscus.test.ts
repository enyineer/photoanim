import { describe, expect, it } from 'vitest';
import {
  capillaryLength,
  capillaryNumber,
  contactLinePull,
  dynamicMeniscusRise,
  liquidBridgeFactor,
  meniscusProfile,
  meniscusRiseHeight,
} from '../meniscus';
import {
  FIXER_DENSITY,
  FIXER_SURFACE_TENSION,
  GRAVITY,
  WATER_DENSITY,
  WATER_SURFACE_TENSION,
} from '../constants';

describe('capillaryLength', () => {
  it('is ~2.7 mm for clean water — the textbook value', () => {
    const lc = capillaryLength(WATER_SURFACE_TENSION, WATER_DENSITY, GRAVITY);
    expect(lc).toBeGreaterThan(0.0026);
    expect(lc).toBeLessThan(0.0028);
  });

  it('shrinks when surface tension drops (fixer vs water)', () => {
    const lcWater = capillaryLength(WATER_SURFACE_TENSION, WATER_DENSITY);
    const lcFixer = capillaryLength(FIXER_SURFACE_TENSION, FIXER_DENSITY);
    expect(lcFixer).toBeLessThan(lcWater);
  });

  it('scales as sqrt(sigma)', () => {
    const lc1 = capillaryLength(0.02, 1000);
    const lc2 = capillaryLength(0.08, 1000);
    expect(lc2 / lc1).toBeCloseTo(2, 12);
  });

  it('is finite even for degenerate density/gravity', () => {
    expect(Number.isFinite(capillaryLength(0.07, 0, 0))).toBe(true);
    expect(Number.isFinite(capillaryLength(0, 1000))).toBe(true);
  });
});

describe('meniscusRiseHeight', () => {
  const lc = capillaryLength(WATER_SURFACE_TENSION, WATER_DENSITY);

  it('is zero at a 90° contact angle (no wetting, flat surface)', () => {
    expect(meniscusRiseHeight(Math.PI / 2, lc)).toBeCloseTo(0, 12);
  });

  it('is maximal, lc * sqrt(2), for perfect wetting (theta = 0)', () => {
    expect(meniscusRiseHeight(0, lc)).toBeCloseTo(lc * Math.SQRT2, 12);
  });

  it('decreases monotonically with contact angle', () => {
    let prev = Infinity;
    for (let theta = 0; theta <= Math.PI / 2; theta += 0.05) {
      const h = meniscusRiseHeight(theta, lc);
      expect(h).toBeLessThanOrEqual(prev + 1e-15);
      prev = h;
    }
  });

  it('never exceeds the physical bound lc * sqrt(2), even for clamped angles', () => {
    for (const theta of [-1, 0, 0.4, 1.2, Math.PI / 2, 3]) {
      expect(meniscusRiseHeight(theta, lc)).toBeLessThanOrEqual(lc * Math.SQRT2 + 1e-15);
      expect(meniscusRiseHeight(theta, lc)).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('meniscusProfile', () => {
  const lc = 0.0027;
  const h0 = 0.003;

  it('equals the rise height at the wall', () => {
    expect(meniscusProfile(0, h0, lc)).toBeCloseTo(h0, 12);
  });

  it('decays monotonically away from the wall', () => {
    let prev = Infinity;
    for (let x = 0; x <= 0.05; x += 0.001) {
      const h = meniscusProfile(x, h0, lc);
      expect(h).toBeLessThanOrEqual(prev + 1e-15);
      expect(h).toBeGreaterThanOrEqual(0);
      prev = h;
    }
  });

  it('drops to 1/e of the rise at one capillary length', () => {
    expect(meniscusProfile(lc, h0, lc)).toBeCloseTo(h0 / Math.E, 12);
  });

  it('is effectively zero many capillary lengths away', () => {
    expect(meniscusProfile(20 * lc, h0, lc)).toBeLessThan(h0 * 1e-8);
  });

  it('treats negative distances (inside the wall) as the wall value', () => {
    expect(meniscusProfile(-0.01, h0, lc)).toBeCloseTo(h0, 12);
  });
});

describe('contactLinePull', () => {
  it('equals sigma * perimeter for perfect wetting', () => {
    const p = 2 * (0.127 + 0.0003);
    expect(contactLinePull(FIXER_SURFACE_TENSION, 0, p)).toBeCloseTo(FIXER_SURFACE_TENSION * p, 12);
  });

  it('vanishes at a 90° contact angle', () => {
    expect(contactLinePull(FIXER_SURFACE_TENSION, Math.PI / 2, 0.25)).toBeCloseTo(0, 12);
  });

  it('grows with the wetted perimeter', () => {
    expect(contactLinePull(0.06, 0.3, 0.4)).toBeGreaterThan(contactLinePull(0.06, 0.3, 0.2));
  });

  it('is never negative', () => {
    expect(contactLinePull(0.06, 0.3, -1)).toBe(0);
    expect(contactLinePull(-0.06, 0.3, 1)).toBe(0);
  });
});

describe('capillaryNumber', () => {
  it('is mu U / sigma exactly', () => {
    expect(capillaryNumber(1e-3, 0.1, 0.06)).toBeCloseTo((1e-3 * 0.1) / 0.06, 15);
  });

  it('is zero at rest and symmetric in direction of motion', () => {
    expect(capillaryNumber(1e-3, 0, 0.06)).toBe(0);
    expect(capillaryNumber(1e-3, -0.2, 0.06)).toBe(capillaryNumber(1e-3, 0.2, 0.06));
  });

  it('is small (<< 1) for realistic print-pulling speeds — surface tension dominates', () => {
    expect(capillaryNumber(1.15e-3, 0.3, 0.06)).toBeLessThan(0.01);
  });

  it('stays finite for zero surface tension', () => {
    expect(Number.isFinite(capillaryNumber(1e-3, 0.1, 0))).toBe(true);
  });
});

describe('dynamicMeniscusRise', () => {
  const staticRise = 0.003;

  it('reduces to the static rise at rest (Ca = 0)', () => {
    expect(dynamicMeniscusRise(staticRise, 0)).toBe(staticRise);
  });

  it('increases monotonically with capillary number', () => {
    let prev = 0;
    for (let ca = 0; ca <= 0.1; ca += 0.005) {
      const h = dynamicMeniscusRise(staticRise, ca);
      expect(h).toBeGreaterThanOrEqual(prev);
      prev = h;
    }
  });

  it('follows the Landau-Levich Ca^(2/3) scaling of the enhancement', () => {
    const e1 = dynamicMeniscusRise(staticRise, 0.001) - staticRise;
    const e8 = dynamicMeniscusRise(staticRise, 0.008) - staticRise;
    expect(e8 / e1).toBeCloseTo(4, 6); // (8x Ca)^(2/3) = 4x
  });

  it('is a modest correction at realistic pull speeds (< 25 % extra)', () => {
    const ca = capillaryNumber(1.15e-3, 1.5, 0.06); // fastest allowed lift
    expect(dynamicMeniscusRise(staticRise, ca)).toBeLessThan(staticRise * 1.25);
  });

  it('never returns negative values', () => {
    expect(dynamicMeniscusRise(-1, 0.5)).toBe(0);
    expect(dynamicMeniscusRise(staticRise, -3)).toBe(staticRise);
  });
});

describe('liquidBridgeFactor', () => {
  const lc = 0.0027;

  it('is 1 while the photo still touches the surface', () => {
    expect(liquidBridgeFactor(0, lc)).toBe(1);
    expect(liquidBridgeFactor(-0.01, lc)).toBe(1);
  });

  it('decays monotonically with the gap and reaches 0 at rupture', () => {
    let prev = 1;
    for (let gap = 0; gap <= 4 * lc; gap += lc / 10) {
      const f = liquidBridgeFactor(gap, lc, 3);
      expect(f).toBeLessThanOrEqual(prev + 1e-15);
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThanOrEqual(1);
      prev = f;
    }
    expect(liquidBridgeFactor(3 * lc, lc, 3)).toBeCloseTo(0, 12);
    expect(liquidBridgeFactor(10 * lc, lc, 3)).toBe(0);
  });

  it('is halfway gone at half the rupture gap', () => {
    expect(liquidBridgeFactor(1.5 * lc, lc, 3)).toBeCloseTo(0.5, 9);
  });
});
