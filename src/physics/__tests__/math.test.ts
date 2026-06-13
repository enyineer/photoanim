import { describe, expect, it } from 'vitest';
import { clamp, isFiniteNumber, lerp, saturate, smoothstep } from '../math';

describe('clamp / saturate', () => {
  it('clamps below, inside and above the range', () => {
    expect(clamp(-1, 0, 1)).toBe(0);
    expect(clamp(0.5, 0, 1)).toBe(0.5);
    expect(clamp(2, 0, 1)).toBe(1);
  });

  it('saturate is clamp to [0, 1]', () => {
    expect(saturate(-3)).toBe(0);
    expect(saturate(0.25)).toBe(0.25);
    expect(saturate(42)).toBe(1);
  });
});

describe('lerp', () => {
  it('hits the endpoints and the midpoint', () => {
    expect(lerp(2, 6, 0)).toBe(2);
    expect(lerp(2, 6, 1)).toBe(6);
    expect(lerp(2, 6, 0.5)).toBe(4);
  });
});

describe('smoothstep', () => {
  it('is 0 below edge0 and 1 above edge1', () => {
    expect(smoothstep(0, 1, -2)).toBe(0);
    expect(smoothstep(0, 1, 3)).toBe(1);
  });

  it('is 0.5 at the midpoint and monotonic', () => {
    expect(smoothstep(0, 1, 0.5)).toBeCloseTo(0.5, 12);
    let prev = -1;
    for (let x = -0.2; x <= 1.2; x += 0.01) {
      const v = smoothstep(0, 1, x);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });

  it('has (approximately) zero slope at both edges', () => {
    const eps = 1e-4;
    expect((smoothstep(0, 1, eps) - smoothstep(0, 1, 0)) / eps).toBeLessThan(0.001);
    expect((smoothstep(0, 1, 1) - smoothstep(0, 1, 1 - eps)) / eps).toBeLessThan(0.001);
  });
});

describe('isFiniteNumber', () => {
  it('rejects NaN and infinities', () => {
    expect(isFiniteNumber(NaN)).toBe(false);
    expect(isFiniteNumber(Infinity)).toBe(false);
    expect(isFiniteNumber(-Infinity)).toBe(false);
    expect(isFiniteNumber(0)).toBe(true);
  });
});
