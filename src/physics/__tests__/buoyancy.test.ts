import { describe, expect, it } from 'vitest';
import {
  buoyancyForce,
  displacedVolume,
  equilibriumDepth,
  netVerticalForce,
  submergedDepth,
  submergedFraction,
  viscousDragForce,
} from '../buoyancy';
import { FIXER_DENSITY, GRAVITY, PHOTO_PAPER_DENSITY } from '../constants';

const H = 0.178; // photo height (m)

describe('submergedDepth', () => {
  it('equals the full height when the photo is entirely below the surface', () => {
    expect(submergedDepth(-0.5, H, 0)).toBe(H);
  });

  it('is zero when the photo is entirely above the surface', () => {
    expect(submergedDepth(0.1, H, 0)).toBe(0);
  });

  it('equals the waterline offset when partially submerged', () => {
    expect(submergedDepth(-0.05, H, 0)).toBeCloseTo(0.05, 12);
  });

  it('is clamped to [0, photoHeight] for any bottom position', () => {
    for (let y = -1; y <= 1; y += 0.01) {
      const d = submergedDepth(y, H, 0);
      expect(d).toBeGreaterThanOrEqual(0);
      expect(d).toBeLessThanOrEqual(H);
    }
  });

  it('is monotonically non-increasing as the photo rises', () => {
    let prev = Infinity;
    for (let y = -0.5; y <= 0.5; y += 0.005) {
      const d = submergedDepth(y, H, 0);
      expect(d).toBeLessThanOrEqual(prev + 1e-12);
      prev = d;
    }
  });

  it('handles a degenerate zero-height photo', () => {
    expect(submergedDepth(-0.1, 0, 0)).toBe(0);
  });
});

describe('submergedFraction', () => {
  it('is 1 fully under, 0 fully out, 0.5 half way', () => {
    expect(submergedFraction(-H - 0.01, H, 0)).toBe(1);
    expect(submergedFraction(0.01, H, 0)).toBe(0);
    expect(submergedFraction(-H / 2, H, 0)).toBeCloseTo(0.5, 12);
  });

  it('never leaves [0, 1]', () => {
    for (let y = -2; y <= 2; y += 0.05) {
      const f = submergedFraction(y, H, 0);
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThanOrEqual(1);
    }
  });

  it('returns 0 for a zero-height photo instead of dividing by zero', () => {
    expect(submergedFraction(-0.1, 0, 0)).toBe(0);
    expect(Number.isFinite(submergedFraction(-0.1, 0, 0))).toBe(true);
  });
});

describe('displacedVolume / buoyancyForce (Archimedes)', () => {
  it('volume is width * thickness * depth', () => {
    expect(displacedVolume(0.127, 0.0003, 0.1)).toBeCloseTo(0.127 * 0.0003 * 0.1, 15);
  });

  it('force equals rho * g * V exactly', () => {
    const V = 1e-5;
    expect(buoyancyForce(V, FIXER_DENSITY, GRAVITY)).toBeCloseTo(FIXER_DENSITY * GRAVITY * V, 12);
  });

  it('is zero with zero displacement and never negative', () => {
    expect(buoyancyForce(0, FIXER_DENSITY)).toBe(0);
    expect(buoyancyForce(-1, FIXER_DENSITY)).toBe(0);
    expect(displacedVolume(-1, 0.0003, 0.1)).toBe(0);
  });

  it('scales linearly with submerged depth (conservation of displaced fluid)', () => {
    const v1 = displacedVolume(0.127, 0.0003, 0.05);
    const v2 = displacedVolume(0.127, 0.0003, 0.1);
    expect(v2 / v1).toBeCloseTo(2, 12);
  });

  it('is monotonically increasing in fluid density', () => {
    expect(buoyancyForce(1e-5, 1100)).toBeGreaterThan(buoyancyForce(1e-5, 1000));
  });
});

describe('viscousDragForce', () => {
  it('opposes the direction of motion', () => {
    expect(viscousDragForce(0.5, 0.02, 10)).toBeLessThan(0); // moving up -> drag down
    expect(viscousDragForce(-0.5, 0.02, 10)).toBeGreaterThan(0); // moving down -> drag up
  });

  it('is zero at rest', () => {
    expect(viscousDragForce(0, 0.02, 10)).toBe(0);
  });

  it('is linear in velocity', () => {
    const f1 = viscousDragForce(0.1, 0.02, 10);
    const f2 = viscousDragForce(0.2, 0.02, 10);
    expect(f2).toBeCloseTo(2 * f1, 12);
  });

  it('vanishes when nothing is wetted', () => {
    expect(viscousDragForce(1, 0, 10)).toBe(0);
  });
});

describe('netVerticalForce', () => {
  it('is zero at neutral buoyancy with no motion', () => {
    const mass = 0.01;
    const buoy = mass * GRAVITY;
    expect(netVerticalForce(mass, buoy, 0)).toBeCloseTo(0, 12);
  });

  it('points up when buoyancy exceeds weight', () => {
    expect(netVerticalForce(0.01, 0.2, 0)).toBeGreaterThan(0);
  });

  it('points down when weight exceeds buoyancy', () => {
    expect(netVerticalForce(0.1, 0.2, 0)).toBeLessThan(0);
  });
});

describe('equilibriumDepth', () => {
  it('puts RC photo paper afloat: equilibrium depth below full height', () => {
    const d = equilibriumDepth(PHOTO_PAPER_DENSITY, FIXER_DENSITY, H);
    expect(d).toBeGreaterThan(0);
    expect(d).toBeLessThan(H);
  });

  it('matches the density ratio (Archimedes for a prism)', () => {
    const d = equilibriumDepth(900, 1000, 1);
    expect(d).toBeCloseTo(0.9, 12);
  });

  it('saturates at full height for a denser-than-bath photo (it sinks)', () => {
    expect(equilibriumDepth(2000, 1000, H)).toBe(H);
  });

  it('is zero for a massless photo', () => {
    expect(equilibriumDepth(0, 1000, H)).toBe(0);
  });

  it('stays finite for zero fluid density', () => {
    expect(Number.isFinite(equilibriumDepth(900, 0, H))).toBe(true);
  });
});
