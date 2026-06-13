import { describe, expect, it } from 'vitest';
import {
  createDripSites,
  dropletRadius,
  fallDistance,
  HARKINS_BROWN_FRACTION,
  stepDrips,
  tateDetachmentMass,
  terminalVelocity,
  totalPendantMass,
} from '../drips';
import { FIXER_SURFACE_TENSION, GRAVITY, WATER_DENSITY } from '../constants';

describe('tateDetachmentMass', () => {
  it('matches 2 pi r sigma / g exactly', () => {
    const r = 0.0024;
    expect(tateDetachmentMass(r, FIXER_SURFACE_TENSION, GRAVITY)).toBeCloseTo(
      (2 * Math.PI * r * FIXER_SURFACE_TENSION) / GRAVITY,
      18,
    );
  });

  it('yields a tens-of-milligrams drop for capillary-scale rims — like real drips', () => {
    const m = tateDetachmentMass(0.0024, FIXER_SURFACE_TENSION, GRAVITY);
    expect(m).toBeGreaterThan(1e-5); // > 10 mg
    expect(m).toBeLessThan(3e-4); // < 300 mg
  });

  it('grows with rim radius and surface tension', () => {
    expect(tateDetachmentMass(0.003, 0.07)).toBeGreaterThan(tateDetachmentMass(0.002, 0.07));
    expect(tateDetachmentMass(0.002, 0.08)).toBeGreaterThan(tateDetachmentMass(0.002, 0.05));
  });
});

describe('dropletRadius', () => {
  it('inverts the sphere volume: m = 4/3 pi r^3 rho', () => {
    const r = dropletRadius(5e-5, WATER_DENSITY);
    expect((4 / 3) * Math.PI * r ** 3 * WATER_DENSITY).toBeCloseTo(5e-5, 12);
  });

  it('produces millimetre-scale drops for Tate-mass drips', () => {
    const m = tateDetachmentMass(0.0024, FIXER_SURFACE_TENSION, GRAVITY) * HARKINS_BROWN_FRACTION;
    const r = dropletRadius(m, WATER_DENSITY);
    expect(r).toBeGreaterThan(0.5e-3);
    expect(r).toBeLessThan(5e-3);
  });

  it('is zero for zero mass and monotonic in mass', () => {
    expect(dropletRadius(0, WATER_DENSITY)).toBe(0);
    expect(dropletRadius(2e-5, WATER_DENSITY)).toBeGreaterThan(dropletRadius(1e-5, WATER_DENSITY));
  });
});

describe('fallDistance', () => {
  it('is ballistic (g t^2 / 2) before reaching terminal velocity', () => {
    const vt = terminalVelocity(0.002);
    const t = 0.01; // well before the terminal crossover
    expect(fallDistance(t, vt)).toBeCloseTo(0.5 * GRAVITY * t * t, 12);
  });

  it('grows linearly at terminal velocity', () => {
    const vt = 1.0;
    const tCross = vt / GRAVITY;
    const d1 = fallDistance(tCross + 1, vt);
    const d2 = fallDistance(tCross + 2, vt);
    expect(d2 - d1).toBeCloseTo(vt, 12);
  });

  it('is continuous at the crossover', () => {
    const vt = 1.0;
    const tc = vt / GRAVITY;
    expect(fallDistance(tc - 1e-9, vt)).toBeCloseTo(fallDistance(tc + 1e-9, vt), 6);
  });

  it('is zero at t = 0 and monotonically increasing', () => {
    const vt = terminalVelocity(0.002);
    expect(fallDistance(0, vt)).toBe(0);
    let prev = 0;
    for (let t = 0; t <= 2; t += 0.01) {
      const d = fallDistance(t, vt);
      expect(d).toBeGreaterThanOrEqual(prev - 1e-15);
      prev = d;
    }
  });
});

describe('stepDrips', () => {
  const detachMass = 1e-4;

  it('starts empty and accumulates the influx', () => {
    const s0 = createDripSites(5);
    expect(totalPendantMass(s0)).toBe(0);
    const { state, detached } = stepDrips(s0, 1e-5, 1, detachMass);
    expect(detached).toHaveLength(0);
    expect(totalPendantMass(state)).toBeCloseTo(1e-5, 15);
  });

  it('conserves mass: influx = delta pendant + detached', () => {
    let state = createDripSites(7);
    const flux = 4e-5;
    const dt = 0.25;
    let detachedTotal = 0;
    for (let i = 0; i < 400; i++) {
      const res = stepDrips(state, flux, dt, detachMass);
      for (const d of res.detached) detachedTotal += d.mass;
      state = res.state;
    }
    const influx = flux * dt * 400;
    expect(totalPendantMass(state) + detachedTotal).toBeCloseTo(influx, 10);
  });

  it('never detaches below the Tate threshold', () => {
    const state = createDripSites(3);
    // Total influx stays below one site's threshold share.
    const res = stepDrips(state, 1e-6, 1, detachMass);
    expect(res.detached).toHaveLength(0);
    for (const m of res.state.pendantMasses) expect(m).toBeLessThan(detachMass);
  });

  it('detaches exactly when a site crosses the threshold, carrying the Harkins-Brown fraction', () => {
    const s0 = { pendantMasses: [detachMass * 0.99] };
    const res = stepDrips(s0, detachMass * 0.02, 1, detachMass);
    expect(res.detached).toHaveLength(1);
    const pendantAtDetach = detachMass * 0.99 + detachMass * 0.02;
    expect(res.detached[0].mass).toBeCloseTo(pendantAtDetach * HARKINS_BROWN_FRACTION, 15);
    expect(res.state.pendantMasses[0]).toBeCloseTo(
      pendantAtDetach * (1 - HARKINS_BROWN_FRACTION),
      15,
    );
  });

  it('is deterministic: identical inputs give identical drop timelines', () => {
    const run = () => {
      let state = createDripSites(7);
      const events: number[] = [];
      for (let i = 0; i < 1000; i++) {
        const res = stepDrips(state, 3e-5, 0.1, detachMass);
        if (res.detached.length > 0) events.push(i);
        state = res.state;
      }
      return events;
    };
    expect(run()).toEqual(run());
  });

  it('produces a periodic drip once fed by a steady flux', () => {
    let state = createDripSites(1);
    const flux = 2e-5;
    const dt = 0.05;
    const dropSteps: number[] = [];
    for (let i = 0; i < 2000; i++) {
      const res = stepDrips(state, flux, dt, detachMass);
      if (res.detached.length > 0) dropSteps.push(i);
      state = res.state;
    }
    expect(dropSteps.length).toBeGreaterThan(2);
    // After the first drop the residual is constant, so intervals equalise.
    const gaps = dropSteps.slice(2).map((s, i) => s - dropSteps[i + 1]);
    for (const g of gaps) expect(Math.abs(g - gaps[0])).toBeLessThanOrEqual(1);
  });

  it('distributes influx by site weights', () => {
    const s0 = createDripSites(2);
    const res = stepDrips(s0, 3e-6, 1, detachMass, [2, 1]);
    expect(res.state.pendantMasses[0]).toBeCloseTo(2e-6, 15);
    expect(res.state.pendantMasses[1]).toBeCloseTo(1e-6, 15);
  });

  it('does not mutate the previous state (purity)', () => {
    const s0 = createDripSites(3);
    const before = [...s0.pendantMasses];
    stepDrips(s0, 1e-5, 1, detachMass);
    expect([...s0.pendantMasses]).toEqual(before);
  });

  it('handles zero sites, zero dt and negative flux gracefully', () => {
    const empty = createDripSites(0);
    expect(stepDrips(empty, 1e-5, 1, detachMass).detached).toHaveLength(0);
    const s = createDripSites(2);
    expect(stepDrips(s, 1e-5, 0, detachMass).state).toBe(s);
    const res = stepDrips(s, -5, 1, detachMass);
    expect(totalPendantMass(res.state)).toBe(0);
  });
});
