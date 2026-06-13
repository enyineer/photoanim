import { describe, expect, it } from 'vitest';
import {
  carryTilt,
  liftProgress,
  photoBottomY,
  scrollProgress,
  verticalVelocity,
  waterlineLocal,
} from '../timeline';

describe('scrollProgress', () => {
  it('maps the scroll range onto [0, 1]', () => {
    expect(scrollProgress(0, 3000)).toBe(0);
    expect(scrollProgress(1500, 3000)).toBeCloseTo(0.5, 12);
    expect(scrollProgress(3000, 3000)).toBe(1);
  });

  it('clamps overscroll (rubber-banding) and negative values', () => {
    expect(scrollProgress(-50, 3000)).toBe(0);
    expect(scrollProgress(9000, 3000)).toBe(1);
  });

  it('pins to 0 on an unscrollable page instead of dividing by zero', () => {
    expect(scrollProgress(100, 0)).toBe(0);
    expect(scrollProgress(100, -5)).toBe(0);
  });
});

describe('liftProgress', () => {
  it('hits both endpoints exactly', () => {
    expect(liftProgress(0)).toBe(0);
    expect(liftProgress(1)).toBe(1);
  });

  it('is strictly monotonic on (0, 1)', () => {
    let prev = -1;
    for (let s = 0; s <= 1.0001; s += 0.01) {
      const p = liftProgress(s);
      expect(p).toBeGreaterThanOrEqual(prev);
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(1);
      prev = p;
    }
  });

  it('eases: starts and ends slower than the middle', () => {
    const dStart = liftProgress(0.05) - liftProgress(0);
    const dMid = liftProgress(0.525) - liftProgress(0.475);
    const dEnd = liftProgress(1) - liftProgress(0.95);
    expect(dMid).toBeGreaterThan(dStart);
    expect(dMid).toBeGreaterThan(dEnd);
  });

  it('clamps out-of-range scroll', () => {
    expect(liftProgress(-3)).toBe(0);
    expect(liftProgress(7)).toBe(1);
  });
});

describe('photoBottomY', () => {
  it('interpolates between rest and raised', () => {
    expect(photoBottomY(0, -0.16, 0.3)).toBe(-0.16);
    expect(photoBottomY(1, -0.16, 0.3)).toBe(0.3);
    expect(photoBottomY(0.5, -0.16, 0.3)).toBeCloseTo(0.07, 12);
  });

  it('never dips below rest or above raised', () => {
    expect(photoBottomY(-1, -0.16, 0.3)).toBe(-0.16);
    expect(photoBottomY(2, -0.16, 0.3)).toBe(0.3);
  });

  it('tolerates an inverted raised < rest configuration by clamping', () => {
    expect(photoBottomY(1, 0.3, -0.16)).toBe(0.3);
  });
});

describe('verticalVelocity', () => {
  it('is the finite difference for sane frames', () => {
    expect(verticalVelocity(0.0, 0.01, 1 / 60, 10)).toBeCloseTo(0.6, 9);
  });

  it('is signed: descending gives negative velocity', () => {
    expect(verticalVelocity(0.05, 0.0, 0.1, 10)).toBeLessThan(0);
  });

  it('clamps scroll-jump spikes to the configured cap', () => {
    expect(verticalVelocity(0, 5, 1 / 60, 1.5)).toBe(1.5);
    expect(verticalVelocity(5, 0, 1 / 60, 1.5)).toBe(-1.5);
  });

  it('returns 0 for zero or negative dt instead of dividing by zero', () => {
    expect(verticalVelocity(0, 1, 0, 10)).toBe(0);
    expect(verticalVelocity(0, 1, -0.1, 10)).toBe(0);
  });
});

describe('waterlineLocal', () => {
  it('is the photo height under water when resting deep', () => {
    expect(waterlineLocal(-0.2, 0)).toBeCloseTo(0.2, 12);
  });

  it('goes negative once the photo clears the surface', () => {
    expect(waterlineLocal(0.05, 0)).toBeCloseTo(-0.05, 12);
  });

  it('moves down the photo as it is lifted', () => {
    expect(waterlineLocal(-0.1, 0)).toBeGreaterThan(waterlineLocal(-0.05, 0));
  });
});

describe('carryTilt', () => {
  it('is level at the start and end of the lift', () => {
    expect(carryTilt(0, 0.05)).toBeCloseTo(0, 12);
    expect(carryTilt(1, 0.05)).toBeCloseTo(0, 12);
  });

  it('never exceeds the configured maximum tilt', () => {
    for (let p = 0; p <= 1; p += 0.005) {
      expect(Math.abs(carryTilt(p, 0.05))).toBeLessThanOrEqual(0.05 + 1e-12);
    }
  });

  it('is deterministic in progress (same input, same sway)', () => {
    expect(carryTilt(0.37, 0.05)).toBe(carryTilt(0.37, 0.05));
  });
});
