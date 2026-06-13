import { describe, expect, it } from 'vitest';
import {
  createFrameState,
  DEFAULT_FRAME_CONFIG,
  type FrameState,
  stepFrame,
} from '../frame';
import { INITIAL_FILM_THICKNESS } from '../constants';

/** Drive the simulation along a scroll trajectory at 60 fps. */
function simulate(
  scrollAt: (t: number) => number,
  seconds: number,
  onFrame?: (s: FrameState) => void,
): FrameState {
  const dt = 1 / 60;
  let state = createFrameState();
  for (let t = 0; t < seconds; t += dt) {
    state = stepFrame(state, { scroll: scrollAt(t), dt });
    onFrame?.(state);
  }
  return state;
}

describe('initial state', () => {
  it('starts fully submerged, at rest, with no drips', () => {
    const s = createFrameState();
    expect(s.submergedFraction).toBe(1);
    expect(s.liftSpeed).toBe(0);
    expect(s.timeSinceEmerged).toBe(0);
    expect(s.detachedDrops).toHaveLength(0);
    expect(s.drips.pendantMasses.every((m) => m === 0)).toBe(true);
  });

  it('places the waterline above the photo top while submerged', () => {
    const s = createFrameState();
    expect(s.waterlineLocal).toBeGreaterThanOrEqual(DEFAULT_FRAME_CONFIG.photoHeight);
  });
});

describe('end-to-end lift', () => {
  it('scroll 0 keeps the photo submerged indefinitely', () => {
    const s = simulate(() => 0, 5);
    expect(s.submergedFraction).toBe(1);
    expect(s.runoffFlux).toBe(0);
    expect(s.timeSinceEmerged).toBe(0);
  });

  it('scroll 1 ends with the photo fully clear of the bath', () => {
    const s = simulate((t) => Math.min(1, t / 4), 8);
    expect(s.submergedFraction).toBe(0);
    expect(s.photoBottomY).toBeGreaterThan(DEFAULT_FRAME_CONFIG.waterLevelY);
    expect(s.waterlineLocal).toBeLessThan(0);
  });

  it('submerged fraction decreases monotonically during a monotonic lift', () => {
    let prev = 1;
    simulate((t) => Math.min(1, t / 4), 8, (s) => {
      expect(s.submergedFraction).toBeLessThanOrEqual(prev + 1e-12);
      prev = s.submergedFraction;
    });
  });

  it('scrolling back down re-submerges and re-wets the photo', () => {
    // Up for 3 s, back down for 3 s.
    const s = simulate((t) => (t < 3 ? t / 3 : Math.max(0, 1 - (t - 3) / 3)), 6.5);
    expect(s.submergedFraction).toBe(1);
    expect(s.timeSinceEmerged).toBe(0);
    expect(s.bottomFilmThickness).toBe(INITIAL_FILM_THICKNESS);
  });

  it('every state field stays finite through an erratic scroll', () => {
    const erratic = (t: number) => 0.5 + 0.5 * Math.sin(t * 7.3) * Math.sin(t * 1.7);
    simulate(erratic, 10, (s) => {
      for (const [k, v] of Object.entries(s)) {
        if (typeof v === 'number') {
          expect(Number.isFinite(v), `field ${k} must stay finite`).toBe(true);
        }
      }
      expect(s.submergedFraction).toBeGreaterThanOrEqual(0);
      expect(s.submergedFraction).toBeLessThanOrEqual(1);
      expect(s.bridgeFactor).toBeGreaterThanOrEqual(0);
      expect(s.bridgeFactor).toBeLessThanOrEqual(1);
      expect(s.bottomFilmThickness).toBeGreaterThanOrEqual(0);
      expect(s.bottomFilmThickness).toBeLessThanOrEqual(INITIAL_FILM_THICKNESS);
      expect(s.runoffFlux).toBeGreaterThanOrEqual(0);
    });
  });
});

describe('emergence physics', () => {
  it('runoff only begins once part of the photo is exposed', () => {
    let sawSubmergedRunoff = false;
    simulate((t) => Math.min(1, t / 4), 8, (s) => {
      if (s.submergedFraction === 1 && s.runoffFlux > 0) sawSubmergedRunoff = true;
    });
    expect(sawSubmergedRunoff).toBe(false);
  });

  it('the draining film thins after full emergence', () => {
    const thicknesses: number[] = [];
    simulate((t) => Math.min(1, t / 2), 12, (s) => {
      if (s.timeSinceEmerged > 0) thicknesses.push(s.bottomFilmThickness);
    });
    expect(thicknesses.length).toBeGreaterThan(0);
    expect(thicknesses[thicknesses.length - 1]).toBeLessThan(thicknesses[0]);
    expect(thicknesses[thicknesses.length - 1]).toBeGreaterThanOrEqual(0);
  });

  it('drops eventually detach and fall after the photo is held out', () => {
    let totalDrops = 0;
    simulate((t) => Math.min(1, t / 2), 40, (s) => {
      totalDrops += s.detachedDrops.length;
    });
    expect(totalDrops).toBeGreaterThan(0);
  });

  it('drips slow down over time as the film drains (increasing gaps)', () => {
    const dropTimes: number[] = [];
    simulate((t) => Math.min(1, t / 2), 90, (s) => {
      if (s.detachedDrops.length > 0) dropTimes.push(s.time);
    });
    expect(dropTimes.length).toBeGreaterThanOrEqual(3);
    const firstGap = dropTimes[1] - dropTimes[0];
    const lastGap = dropTimes[dropTimes.length - 1] - dropTimes[dropTimes.length - 2];
    expect(lastGap).toBeGreaterThanOrEqual(firstGap);
  });

  it('the liquid bridge ruptures shortly after lift-off and stays broken', () => {
    let ruptured = false;
    simulate((t) => Math.min(1, t / 2), 12, (s) => {
      if (s.bridgeFactor === 0) ruptured = true;
      if (ruptured) expect(s.bridgeFactor).toBe(0);
    });
    expect(ruptured).toBe(true);
  });

  it('meniscus rise stays within the physical bound lc * sqrt(2)', () => {
    simulate((t) => Math.min(1, t / 4), 8, (s) => {
      expect(s.meniscusRise).toBeGreaterThan(0);
      expect(s.meniscusRise).toBeLessThanOrEqual(s.capillaryLen * Math.SQRT2 + 1e-15);
    });
  });
});

describe('determinism and purity', () => {
  it('two identical runs produce byte-identical final states', () => {
    const a = simulate((t) => Math.min(1, t / 3), 10);
    const b = simulate((t) => Math.min(1, t / 3), 10);
    expect(a).toEqual(b);
  });

  it('stepFrame does not mutate its input state', () => {
    const s0 = createFrameState();
    const snapshot = JSON.parse(JSON.stringify(s0));
    stepFrame(s0, { scroll: 0.7, dt: 1 / 60 });
    expect(JSON.parse(JSON.stringify(s0))).toEqual(snapshot);
  });

  it('a zero-dt step advances nothing but still tracks scroll pose', () => {
    const s0 = createFrameState();
    const s1 = stepFrame(s0, { scroll: 1, dt: 0 });
    expect(s1.time).toBe(s0.time);
    expect(s1.progress).toBe(1);
    expect(s1.liftSpeed).toBe(0); // no time elapsed -> no velocity spike
  });

  it('caps the lift speed even when scroll teleports within one frame', () => {
    const s0 = createFrameState();
    const s1 = stepFrame(s0, { scroll: 1, dt: 1 / 60 });
    expect(Math.abs(s1.liftSpeed)).toBeLessThanOrEqual(DEFAULT_FRAME_CONFIG.maxLiftSpeed);
  });
});
