/**
 * Device-quality and accessibility detection. Heavy effects (ripple count,
 * water tessellation, droplet counts, pixel ratio) degrade on low-power
 * devices, and motion that isn't directly scroll-driven is suppressed when
 * the user asks for reduced motion.
 */
import { useEffect, useMemo, useState } from 'react';

export interface QualityProfile {
  readonly reducedMotion: boolean;
  readonly lowPower: boolean;
  /** Water plane tessellation (segments along the long axis). */
  readonly waterSegments: number;
  /** Maximum simultaneous ripple sources fed to the shader. */
  readonly maxRipples: number;
  /** Maximum simultaneous falling droplets. */
  readonly maxDroplets: number;
  /** Pendant-drop sites rendered on the photo's bottom edge. */
  readonly dripSites: number;
  /** Device pixel ratio cap for the canvas. */
  readonly maxDpr: number;
  /** Scale on ambient wave amplitude (0 disables idle water motion). */
  readonly ambientScale: number;
}

function detectLowPower(): boolean {
  if (typeof navigator === 'undefined') return false;
  const nav = navigator as Navigator & { deviceMemory?: number };
  const cores = nav.hardwareConcurrency ?? 8;
  const memory = nav.deviceMemory ?? 8;
  return cores <= 4 || memory <= 4;
}

export function buildQualityProfile(reducedMotion: boolean, lowPower: boolean): QualityProfile {
  return {
    reducedMotion,
    lowPower,
    waterSegments: lowPower ? 64 : 160,
    maxRipples: reducedMotion ? 0 : lowPower ? 6 : 16,
    maxDroplets: reducedMotion ? 4 : lowPower ? 8 : 24,
    dripSites: lowPower ? 5 : 7,
    maxDpr: lowPower ? 1.25 : 2,
    // Reduced motion: water only moves when the user scrolls, never idly.
    ambientScale: reducedMotion ? 0 : lowPower ? 0.7 : 1,
  };
}

export function useQuality(): QualityProfile {
  const [reducedMotion, setReducedMotion] = useState(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const lowPower = useMemo(() => detectLowPower(), []);
  return useMemo(() => buildQualityProfile(reducedMotion, lowPower), [reducedMotion, lowPower]);
}
