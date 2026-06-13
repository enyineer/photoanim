import { describe, expect, it } from 'vitest';
import {
  beadSlideVelocity,
  createRunnersState,
  defaultBeadMass,
  EMULSION_COS_HYSTERESIS,
  nearestDripSite,
  retentionForce,
  type RunnersParams,
  type RunnersState,
  stepRunners,
  totalRunnerMass,
} from '../runners';
import { FIXER_DENSITY, FIXER_SURFACE_TENSION, FIXER_VISCOSITY, GRAVITY, INITIAL_FILM_THICKNESS } from '../constants';

const TILT = 0.15;
const G_PLATE = GRAVITY * Math.sin(TILT);

const params: RunnersParams = {
  spawnSpacing: 0.02,
  beadMass: defaultBeadMass(FIXER_DENSITY, INITIAL_FILM_THICKNESS, 0.02, 0.0076),
  photoWidth: 0.127,
  photoHeight: 0.178,
  gAlongPlate: G_PLATE,
  viscosity: FIXER_VISCOSITY,
  surfaceTension: FIXER_SURFACE_TENSION,
  fluidDensity: FIXER_DENSITY,
  maxBeads: 16,
};

describe('retentionForce (Furmidge)', () => {
  it('is w * sigma * delta-cos exactly', () => {
    expect(retentionForce(0.003, 0.06, 0.06)).toBeCloseTo(0.003 * 0.06 * 0.06, 18);
  });

  it('grows with contact width and never goes negative', () => {
    expect(retentionForce(0.004, 0.06)).toBeGreaterThan(retentionForce(0.002, 0.06));
    expect(retentionForce(-1, 0.06)).toBe(0);
  });
});

describe('beadSlideVelocity', () => {
  const r = 1.8e-3;
  const ret = retentionForce(2 * r, FIXER_SURFACE_TENSION, EMULSION_COS_HYSTERESIS);

  it('is pinned (zero) below the Furmidge threshold', () => {
    const tinyMass = ret / G_PLATE / 2; // weight is half the retention
    expect(beadSlideVelocity(tinyMass, G_PLATE, ret, FIXER_VISCOSITY, r)).toBe(0);
  });

  it('slides once the along-plate weight beats retention', () => {
    const mass = (ret / G_PLATE) * 2;
    expect(beadSlideVelocity(mass, G_PLATE, ret, FIXER_VISCOSITY, r)).toBeGreaterThan(0);
  });

  it('a typical bead creeps at cm/s, not m/s', () => {
    const v = beadSlideVelocity(params.beadMass, G_PLATE, ret, FIXER_VISCOSITY, r);
    expect(v).toBeGreaterThan(0.002);
    expect(v).toBeLessThan(0.3);
  });

  it('heavier beads slide faster', () => {
    const v1 = beadSlideVelocity(2e-5, G_PLATE, ret, FIXER_VISCOSITY, r);
    const v2 = beadSlideVelocity(4e-5, G_PLATE, ret, FIXER_VISCOSITY, r);
    expect(v2).toBeGreaterThan(v1);
  });

  it('steeper plates make beads run faster', () => {
    const flat = beadSlideVelocity(params.beadMass, GRAVITY * Math.sin(0.1), ret, FIXER_VISCOSITY, r);
    const steep = beadSlideVelocity(params.beadMass, GRAVITY * Math.sin(0.5), ret, FIXER_VISCOSITY, r);
    expect(steep).toBeGreaterThan(flat);
  });
});

/** Sweep the waterline down the plate, then keep stepping after emergence. */
function sweep(
  seconds: number,
  waterlineAt: (t: number) => number,
  onStep?: (s: RunnersState, deposits: number) => void,
): { state: RunnersState; depositedMass: number } {
  const dt = 1 / 60;
  let state = createRunnersState(waterlineAt(0));
  let depositedMass = 0;
  for (let t = 0; t < seconds; t += dt) {
    const res = stepRunners(state, waterlineAt(t), dt, params);
    for (const d of res.deposits) depositedMass += d.mass;
    state = res.state;
    onStep?.(state, res.deposits.length);
  }
  return { state, depositedMass };
}

// Waterline sweeps from above the plate top to fully emerged in 4 s.
const sweepDown = (t: number) => 0.2 - 0.08 * t;

describe('stepRunners', () => {
  it('spawns beads only while the contact line crosses the plate', () => {
    const state = createRunnersState(0.3);
    // Fully submerged: nothing spawns.
    let res = stepRunners(state, 0.3, 0.1, params);
    expect(res.state.beads).toHaveLength(0);
    // Fully clear and never pierced: nothing spawns either.
    res = stepRunners(createRunnersState(-0.05), -0.05, 0.1, params);
    expect(res.state.beads).toHaveLength(0);
  });

  it('leaves a trail of beads as the waterline sweeps the plate', () => {
    const { state } = sweep(2, sweepDown);
    expect(state.beads.length).toBeGreaterThan(2);
  });

  it('beads slide monotonically toward the low edge', () => {
    const positions = new Map<number, number>();
    sweep(5, sweepDown, (s) => {
      for (const b of s.beads) {
        const prev = positions.get(b.id);
        if (prev !== undefined) expect(b.p).toBeLessThanOrEqual(prev + 1e-12);
        positions.set(b.id, b.p);
      }
    });
    expect(positions.size).toBeGreaterThan(0);
  });

  it('beads eventually reach the low edge and deposit their full mass', () => {
    const { state, depositedMass } = sweep(60, sweepDown);
    expect(depositedMass).toBeGreaterThan(0);
    // Conservation: everything spawned is either still in flight or deposited
    // (none lost — the bath-rejoin path needs a *rising* waterline).
    const spawned = state.spawnCount * params.beadMass;
    expect(totalRunnerMass(state) + depositedMass).toBeCloseTo(spawned, 12);
  });

  it('beads overtaken by a rising waterline rejoin the bath silently', () => {
    // Sweep down for 2 s, then push the waterline back up above the plate.
    const wl = (t: number) => (t < 2 ? 0.2 - 0.08 * t : 0.2);
    const { state, depositedMass } = sweep(3, wl);
    expect(state.beads).toHaveLength(0);
    expect(depositedMass).toBe(0);
  });

  it('respects the bead cap', () => {
    sweep(60, sweepDown, (s) => {
      expect(s.beads.length).toBeLessThanOrEqual(params.maxBeads);
    });
  });

  it('is deterministic', () => {
    const a = sweep(10, sweepDown);
    const b = sweep(10, sweepDown);
    expect(a.state).toEqual(b.state);
    expect(a.depositedMass).toBe(b.depositedMass);
  });

  it('zero/negative dt is a no-op', () => {
    const s = createRunnersState(0.1);
    expect(stepRunners(s, 0.1, 0, params).state).toBe(s);
  });
});

describe('nearestDripSite', () => {
  it('maps the plate centre to the middle site and clamps the edges', () => {
    expect(nearestDripSite(0, 5, 0.127)).toBe(2);
    expect(nearestDripSite(-1, 5, 0.127)).toBe(0);
    expect(nearestDripSite(1, 5, 0.127)).toBe(4);
  });

  it('handles a single site', () => {
    expect(nearestDripSite(0.03, 1, 0.127)).toBe(0);
  });
});

describe('defaultBeadMass', () => {
  it('is the film volume over the catchment times the density', () => {
    expect(defaultBeadMass(1000, 3e-4, 0.02, 0.01)).toBeCloseTo(1000 * 3e-4 * 0.02 * 0.01, 15);
  });

  it('yields a tens-of-milligrams bead — visible but droplet-scale', () => {
    expect(params.beadMass).toBeGreaterThan(5e-6);
    expect(params.beadMass).toBeLessThan(2e-4);
  });
});
