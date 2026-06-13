import { describe, expect, it } from 'vitest';
import {
  ambientWaveBound,
  ambientWaveHeight,
  type AmbientWaveComponent,
  deepWaterAngularFrequency,
  dropletImpactAmplitude,
  gravityWavePhaseSpeed,
  rippleHeight,
  rippleSourceAmplitude,
} from '../waves';
import { GRAVITY } from '../constants';

describe('deep-water dispersion', () => {
  it('omega = sqrt(g k)', () => {
    const k = 50;
    expect(deepWaterAngularFrequency(k)).toBeCloseTo(Math.sqrt(GRAVITY * k), 12);
  });

  it('longer waves travel faster (phase speed grows with wavelength)', () => {
    expect(gravityWavePhaseSpeed(0.4)).toBeGreaterThan(gravityWavePhaseSpeed(0.1));
  });

  it('phase speed scales as sqrt(lambda)', () => {
    expect(gravityWavePhaseSpeed(0.4) / gravityWavePhaseSpeed(0.1)).toBeCloseTo(2, 12);
  });

  it('handles zero wavenumber/wavelength without NaN', () => {
    expect(deepWaterAngularFrequency(0)).toBe(0);
    expect(Number.isFinite(gravityWavePhaseSpeed(0))).toBe(true);
  });
});

describe('ripple source amplitudes', () => {
  it('a motionless photo excites no ripple', () => {
    expect(rippleSourceAmplitude(0, 0.05, 0.01)).toBe(0);
  });

  it('amplitude grows with pierce speed but saturates at the cap', () => {
    const a1 = rippleSourceAmplitude(0.05, 0.05, 0.01);
    const a2 = rippleSourceAmplitude(0.1, 0.05, 0.01);
    expect(a2).toBeGreaterThan(a1);
    expect(rippleSourceAmplitude(1e6, 0.05, 0.01)).toBe(0.01);
  });

  it('is symmetric in direction of motion (in or out of the water)', () => {
    expect(rippleSourceAmplitude(-0.2, 0.05, 0.01)).toBe(rippleSourceAmplitude(0.2, 0.05, 0.01));
  });

  it('droplet impact amplitude grows sub-linearly (cube root) with mass and saturates', () => {
    const a1 = dropletImpactAmplitude(1e-5, 0.05, 0.01);
    const a8 = dropletImpactAmplitude(8e-5, 0.05, 0.01);
    expect(a8 / a1).toBeCloseTo(2, 9);
    expect(dropletImpactAmplitude(1e9, 0.05, 0.01)).toBe(0.01);
    expect(dropletImpactAmplitude(0, 0.05, 0.01)).toBe(0);
  });
});

describe('rippleHeight', () => {
  const A = 0.004;
  const lambda = 0.05;
  const damping = 1.2;

  it('is bounded by the initial amplitude everywhere, always', () => {
    for (let t = 0; t <= 5; t += 0.1) {
      for (let r = 0; r <= 1; r += 0.02) {
        expect(Math.abs(rippleHeight(r, t, A, lambda, damping))).toBeLessThanOrEqual(A + 1e-15);
      }
    }
  });

  it('decays exponentially in time: envelope at the crest shrinks', () => {
    const c = gravityWavePhaseSpeed(lambda);
    // Track the crest (r = c t) where the packet envelope is maximal.
    const h1 = Math.abs(rippleHeight(c * 0.5, 0.5, A, lambda, damping));
    const h2 = Math.abs(rippleHeight(c * 2.0, 2.0, A, lambda, damping));
    expect(h2).toBeLessThan(h1);
  });

  it('is zero before the excitation (no acausal ripples)', () => {
    expect(rippleHeight(0.1, -0.5, A, lambda, damping)).toBe(0);
  });

  it('the ring expands outward: the crest radius grows with time', () => {
    const crestRadius = (t: number) => {
      let best = 0;
      let bestH = -Infinity;
      for (let r = 0; r <= 2; r += 0.002) {
        const h = rippleHeight(r, t, A, lambda, damping);
        if (h > bestH) {
          bestH = h;
          best = r;
        }
      }
      return best;
    };
    expect(crestRadius(1.0)).toBeGreaterThan(crestRadius(0.3));
  });

  it('geometric spreading: far field is weaker than near field at matched packet phase', () => {
    const c = gravityWavePhaseSpeed(lambda);
    const undamped = (r: number, t: number) => rippleHeight(r, t, A, lambda, 0);
    expect(Math.abs(undamped(c * 4, 4))).toBeLessThan(Math.abs(undamped(c * 1, 1)));
  });

  it('never returns NaN for degenerate parameters', () => {
    expect(Number.isFinite(rippleHeight(0, 0, A, 0, damping))).toBe(true);
    expect(Number.isFinite(rippleHeight(-1, 10, A, lambda, 0))).toBe(true);
  });
});

describe('ambientWaveHeight', () => {
  const components: AmbientWaveComponent[] = [
    { amplitude: 0.001, wavelength: 0.18, direction: 0.3, phase: 0 },
    { amplitude: 0.0006, wavelength: 0.09, direction: 2.1, phase: 1.4 },
    { amplitude: 0.0003, wavelength: 0.05, direction: 4.0, phase: 3.0 },
  ];

  it('is bounded by the sum of component amplitudes (conservative bound)', () => {
    const bound = ambientWaveBound(components);
    for (let t = 0; t <= 10; t += 0.25) {
      for (let x = -0.3; x <= 0.3; x += 0.06) {
        for (let z = -0.2; z <= 0.2; z += 0.05) {
          expect(Math.abs(ambientWaveHeight(x, z, t, components))).toBeLessThanOrEqual(bound + 1e-15);
        }
      }
    }
  });

  it('averages to ~zero over time (no net water creation)', () => {
    let sum = 0;
    const N = 5000;
    for (let i = 0; i < N; i++) sum += ambientWaveHeight(0.05, -0.03, i * 0.137, components);
    expect(Math.abs(sum / N)).toBeLessThan(ambientWaveBound(components) * 0.05);
  });

  it('is flat with no components', () => {
    expect(ambientWaveHeight(0.1, 0.1, 5, [])).toBe(0);
  });

  it('each component obeys the dispersion relation (period matches wavelength)', () => {
    const single: AmbientWaveComponent[] = [
      { amplitude: 0.001, wavelength: 0.1, direction: 0, phase: 0 },
    ];
    const k = (2 * Math.PI) / 0.1;
    const period = (2 * Math.PI) / deepWaterAngularFrequency(k);
    const h0 = ambientWaveHeight(0.02, 0, 1.0, single);
    const h1 = ambientWaveHeight(0.02, 0, 1.0 + period, single);
    expect(h1).toBeCloseTo(h0, 9);
  });
});
