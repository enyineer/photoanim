/**
 * The 3D scene: fixer tray, water surface, photo print, droplets. All
 * motion is computed by the pure physics core (src/physics) each frame —
 * this layer only poses meshes and feeds shader uniforms.
 */
import { useMemo, useRef } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import * as THREE from 'three';
import {
  carryTilt,
  createFrameState,
  DEFAULT_FRAME_CONFIG,
  dropletImpactAmplitude,
  dropletRadius,
  fallDistance,
  type FrameConfig,
  type FrameState,
  hash01,
  lerp,
  rippleSourceAmplitude,
  sheetSurfaceSpeed,
  stepFrame,
  terminalVelocity,
  DRY_FILM_THICKNESS,
  INITIAL_FILM_THICKNESS,
} from '../physics';
import type { QualityProfile } from '../hooks/useQuality';
import {
  MAX_RIPPLES,
  photoFragmentShader,
  photoVertexShader,
  waterFragmentShader,
  waterVertexShader,
} from './shaders';
import { DEFAULT_PHOTO_URL } from '../photoUrl';

const PHOTO_Z = 0.015;
const TRAY_INNER_W = 0.47;
const TRAY_INNER_D = 0.34;
const TRAY_DEPTH = 0.26;
const TRAY_RIM_Y = 0.045;
const LIGHT_DIR = new THREE.Vector3(0.35, 0.9, 0.55);

/** Irregular but deterministic x position of a drip site along the edge. */
function pendantSiteX(site: number, siteCount: number, photoWidth: number): number {
  const base = siteCount > 1 ? (site / (siteCount - 1) - 0.5) * photoWidth * 0.85 : 0;
  const spacing = siteCount > 1 ? (photoWidth * 0.85) / (siteCount - 1) : photoWidth * 0.5;
  return base + (hash01(site + 17) - 0.5) * spacing * 0.7;
}

interface FallingDrop {
  x: number;
  z: number;
  startY: number;
  startTime: number;
  radius: number;
  vTerminal: number;
  mass: number;
}

function usePhotoTexture(url: string): { texture: THREE.Texture; aspect: number } {
  // useLoader suspends; the URL has already been validated and falls back
  // to the bundled default through the error boundary in Scene.tsx.
  const texture = useLoader(THREE.TextureLoader, url, (loader) => {
    loader.setCrossOrigin('anonymous');
  });
  return useMemo(() => {
    // Clone so the configuration below doesn't mutate the loader's cache.
    const configured = texture.clone();
    configured.colorSpace = THREE.SRGBColorSpace;
    configured.anisotropy = 4;
    configured.needsUpdate = true;
    const img = texture.image as { width?: number; height?: number } | undefined;
    const aspect = img && img.width && img.height ? img.width / img.height : 0.8;
    return { texture: configured, aspect };
  }, [texture]);
}

export function Experience({ quality, photoUrl, scrollRef }: {
  quality: QualityProfile;
  photoUrl: string;
  scrollRef: React.RefObject<number>;
}) {
  const config = useMemo<FrameConfig>(
    () => ({ ...DEFAULT_FRAME_CONFIG, dripSiteCount: quality.dripSites }),
    [quality.dripSites],
  );

  const { texture, aspect } = usePhotoTexture(photoUrl || DEFAULT_PHOTO_URL);

  const sim = useRef<FrameState>(createFrameState(config));
  const liftRefSpeed = useRef(0.05);
  const stillTime = useRef(0);
  const streakOffset = useRef(0);
  const lastRippleTime = useRef(0);
  const rippleCursor = useRef(0);
  const rippleSide = useRef(0);
  const falling = useRef<FallingDrop[]>([]);

  const photoGroup = useRef<THREE.Group>(null);
  const photoMaterial = useRef<THREE.ShaderMaterial>(null);
  const waterMaterial = useRef<THREE.ShaderMaterial>(null);
  const pendantMesh = useRef<THREE.InstancedMesh>(null);
  const fallingMesh = useRef<THREE.InstancedMesh>(null);

  const dummy = useMemo(() => new THREE.Object3D(), []);

  const waterUniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uGravity: { value: config.gravity },
      uAmbient: {
        value: [
          new THREE.Vector4(0.0012 * quality.ambientScale, 0.17, 0.4, 0.0),
          new THREE.Vector4(0.0007 * quality.ambientScale, 0.08, 2.3, 1.7),
          new THREE.Vector4(0.00045 * quality.ambientScale, 0.045, 4.2, 3.9),
        ],
      },
      uRipples: {
        value: Array.from({ length: MAX_RIPPLES }, () => new THREE.Vector4(0, 0, -1e9, 0)),
      },
      uRippleWavelength: { value: 0.045 },
      uRippleDamping: { value: 1.1 },
      uMeniscus: { value: new THREE.Vector4(config.photoWidth / 2, PHOTO_Z, 0, 0.0024) },
      uPierce: { value: 0 },
      uDeepColor: { value: new THREE.Color('#241a10') },
      uShallowColor: { value: new THREE.Color('#4a3a22') },
      uSkyColor: { value: new THREE.Color('#8a7a5e') },
      uLightDir: { value: LIGHT_DIR.clone() },
      uSpecStrength: { value: quality.lowPower ? 0.6 : 1.0 },
    }),
    [config, quality],
  );

  const photoUniforms = useMemo(
    () => ({
      uMap: { value: texture },
      uMapAspect: { value: aspect },
      uSize: { value: new THREE.Vector2(config.photoWidth, config.photoHeight) },
      uWaterline: { value: config.photoHeight + 0.05 },
      uLiftRef: { value: 0.05 },
      uStillTime: { value: 0 },
      uMeniscusRise: { value: 0 },
      uPierce: { value: 0 },
      uFilmH0: { value: INITIAL_FILM_THICKNESS },
      uDryH: { value: DRY_FILM_THICKNESS },
      uViscosity: { value: config.fluidViscosity },
      uDensity: { value: config.fluidDensity },
      uGravity: { value: config.gravity },
      uStreakOffset: { value: 0 },
      uLightDir: { value: LIGHT_DIR.clone() },
      uBorder: { value: 0.055 },
    }),
    [texture, aspect, config],
  );

  const addRipple = (x: number, z: number, amp: number) => {
    if (quality.maxRipples === 0 || amp <= 0) return;
    const slot = rippleCursor.current % Math.min(quality.maxRipples, MAX_RIPPLES);
    const v = waterUniforms.uRipples.value[slot];
    v.set(x, z, sim.current.time, amp);
    rippleCursor.current += 1;
  };

  useFrame((_, delta) => {
    const dt = Math.min(Math.max(delta, 0), 0.05);
    const state = stepFrame(sim.current, { scroll: scrollRef.current ?? 0, dt }, config);
    sim.current = state;

    // --- photo pose -------------------------------------------------------
    if (photoGroup.current) {
      photoGroup.current.position.set(0, state.photoBottomY, PHOTO_Z);
      const sway = quality.reducedMotion ? 0 : carryTilt(state.progress, 0.05);
      photoGroup.current.rotation.set(-0.05 - state.progress * 0.07, 0, sway);
    }

    // --- wetting / drying uniforms ---------------------------------------
    const fullyOut = state.waterlineLocal <= 0;
    const holdingStill = Math.abs(state.liftSpeed) < 0.005;
    if (state.submergedFraction === 1) {
      stillTime.current = 0;
    } else if (holdingStill) {
      stillTime.current += dt;
    }
    liftRefSpeed.current = Math.max(
      0.02,
      lerp(liftRefSpeed.current, Math.max(state.liftSpeed, 0), 1 - Math.exp(-dt * 3)),
    );

    const pierce =
      state.waterlineLocal > 0 && state.waterlineLocal < config.photoHeight
        ? 1
        : fullyOut
          ? state.bridgeFactor
          : 0;

    streakOffset.current +=
      (sheetSurfaceSpeed(
        state.bottomFilmThickness,
        config.fluidDensity,
        config.fluidViscosity,
        config.gravity,
      ) /
        config.photoHeight) *
      dt;

    if (photoMaterial.current) {
      const u = photoMaterial.current.uniforms;
      u.uWaterline.value = state.waterlineLocal;
      u.uLiftRef.value = liftRefSpeed.current;
      u.uStillTime.value = stillTime.current;
      u.uMeniscusRise.value = state.meniscusRise;
      u.uPierce.value = pierce;
      u.uStreakOffset.value = streakOffset.current;
    }

    // --- water uniforms + ripples from the moving print -------------------
    if (waterMaterial.current) {
      const u = waterMaterial.current.uniforms;
      u.uTime.value = state.time;
      u.uMeniscus.value.set(config.photoWidth / 2, PHOTO_Z, state.meniscusRise, state.capillaryLen);
      u.uPierce.value = pierce;
    }

    if (
      pierce > 0.5 &&
      Math.abs(state.liftSpeed) > 0.02 &&
      state.time - lastRippleTime.current > 0.16
    ) {
      const amp = rippleSourceAmplitude(state.liftSpeed, 0.02, 0.005);
      rippleSide.current = (rippleSide.current + 1) % 5;
      const x = ((rippleSide.current - 2) / 2) * config.photoWidth * 0.45;
      addRipple(x, PHOTO_Z, amp);
      lastRippleTime.current = state.time;
    }

    // --- pendant drops on the bottom edge ---------------------------------
    // Sites are spread irregularly (deterministic jitter) and a drop only
    // becomes visible once it has gathered enough liquid to bulge below
    // the edge — a real edge shows two or three growing beads, not a row.
    if (pendantMesh.current) {
      const n = state.drips.pendantMasses.length;
      for (let i = 0; i < n; i++) {
        const mass = state.drips.pendantMasses[i];
        const r = dropletRadius(mass, config.fluidDensity);
        const x = pendantSiteX(i, n, config.photoWidth);
        const visible = fullyOut && r > 8e-4;
        dummy.position.set(x, state.photoBottomY - r * 0.9, PHOTO_Z + 0.001);
        const s = visible ? r : 1e-6;
        // Pendant drops sag: narrow at the rim, bulbous below.
        dummy.scale.set(s * 0.8, s * 1.45, s * 0.8);
        dummy.updateMatrix();
        pendantMesh.current.setMatrixAt(i, dummy.matrix);
      }
      pendantMesh.current.instanceMatrix.needsUpdate = true;
    }

    // --- falling drops -----------------------------------------------------
    for (const d of state.detachedDrops) {
      if (falling.current.length >= quality.maxDroplets) break;
      const n = state.drips.pendantMasses.length;
      const x = pendantSiteX(d.site, n, config.photoWidth);
      const r = dropletRadius(d.mass, config.fluidDensity);
      falling.current.push({
        x,
        z: PHOTO_Z + 0.001,
        startY: state.photoBottomY - r,
        startTime: state.time,
        radius: r,
        vTerminal: terminalVelocity(r, config.gravity),
        mass: d.mass,
      });
    }

    falling.current = falling.current.filter((d) => {
      const y = d.startY - fallDistance(state.time - d.startTime, d.vTerminal, config.gravity);
      if (y - d.radius <= config.waterLevelY) {
        addRipple(d.x, d.z, dropletImpactAmplitude(d.mass, 0.16, 0.004));
        return false;
      }
      return true;
    });

    if (fallingMesh.current) {
      for (let i = 0; i < quality.maxDroplets; i++) {
        const d = falling.current[i];
        if (d) {
          const y = d.startY - fallDistance(state.time - d.startTime, d.vTerminal, config.gravity);
          dummy.position.set(d.x, y, d.z);
          // Drops stretch slightly as they accelerate.
          dummy.scale.set(d.radius * 0.85, d.radius * 1.35, d.radius * 0.85);
        } else {
          dummy.position.set(0, -10, 0);
          dummy.scale.setScalar(1e-6);
        }
        dummy.updateMatrix();
        fallingMesh.current.setMatrixAt(i, dummy.matrix);
      }
      fallingMesh.current.instanceMatrix.needsUpdate = true;
    }
  });

  const segX = quality.waterSegments;
  const segZ = Math.round(quality.waterSegments * (TRAY_INNER_D / TRAY_INNER_W));

  return (
    <group>
      {/* fixer bath surface */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <planeGeometry args={[TRAY_INNER_W, TRAY_INNER_D, segX, segZ]} />
        <shaderMaterial
          ref={waterMaterial}
          vertexShader={waterVertexShader}
          fragmentShader={waterFragmentShader}
          uniforms={waterUniforms}
          transparent
        />
      </mesh>

      {/* the print */}
      <group ref={photoGroup} position={[0, -0.2, PHOTO_Z]}>
        <mesh position={[0, config.photoHeight / 2, 0]}>
          <planeGeometry args={[config.photoWidth, config.photoHeight]} />
          <shaderMaterial
            ref={photoMaterial}
            vertexShader={photoVertexShader}
            fragmentShader={photoFragmentShader}
            uniforms={photoUniforms}
          />
        </mesh>
        {/* paper back */}
        <mesh position={[0, config.photoHeight / 2, -0.0004]} rotation={[0, Math.PI, 0]}>
          <planeGeometry args={[config.photoWidth, config.photoHeight]} />
          <meshStandardMaterial color="#ded8cb" roughness={0.85} metalness={0} />
        </mesh>
      </group>

      {/* droplets */}
      <instancedMesh ref={pendantMesh} args={[undefined, undefined, quality.dripSites]} frustumCulled={false}>
        <sphereGeometry args={[1, 16, 16]} />
        <DropletMaterial lowPower={quality.lowPower} />
      </instancedMesh>
      <instancedMesh ref={fallingMesh} args={[undefined, undefined, quality.maxDroplets]} frustumCulled={false}>
        <sphereGeometry args={[1, 12, 12]} />
        <DropletMaterial lowPower={quality.lowPower} />
      </instancedMesh>

      <Tray />
      <Lights quality={quality} />
    </group>
  );
}

/**
 * Clear water, not beads: high transmission with a glassy highlight where
 * supported; a barely-tinted translucent fallback on low-power devices.
 */
function DropletMaterial({ lowPower }: { lowPower: boolean }) {
  return (
    <meshPhysicalMaterial
      color="#dfe7e4"
      transmission={lowPower ? 0 : 0.92}
      opacity={lowPower ? 0.45 : 1}
      transparent
      roughness={0.04}
      metalness={0}
      ior={1.33}
      thickness={0.0035}
      specularIntensity={1}
      clearcoat={0.6}
    />
  );
}

function Tray() {
  const wall = '#3d2018';
  const wallProps = { color: wall, roughness: 0.45, metalness: 0.05 } as const;
  const t = 0.018; // wall thickness
  return (
    <group>
      {/* bottom */}
      <mesh position={[0, TRAY_RIM_Y - TRAY_DEPTH, 0]}>
        <boxGeometry args={[TRAY_INNER_W + 2 * t, t, TRAY_INNER_D + 2 * t]} />
        <meshStandardMaterial {...wallProps} />
      </mesh>
      {/* long walls */}
      <mesh position={[0, TRAY_RIM_Y - TRAY_DEPTH / 2, (TRAY_INNER_D + t) / 2]}>
        <boxGeometry args={[TRAY_INNER_W + 2 * t, TRAY_DEPTH, t]} />
        <meshStandardMaterial {...wallProps} />
      </mesh>
      <mesh position={[0, TRAY_RIM_Y - TRAY_DEPTH / 2, -(TRAY_INNER_D + t) / 2]}>
        <boxGeometry args={[TRAY_INNER_W + 2 * t, TRAY_DEPTH, t]} />
        <meshStandardMaterial {...wallProps} />
      </mesh>
      {/* short walls */}
      <mesh position={[(TRAY_INNER_W + t) / 2, TRAY_RIM_Y - TRAY_DEPTH / 2, 0]}>
        <boxGeometry args={[t, TRAY_DEPTH, TRAY_INNER_D + 2 * t]} />
        <meshStandardMaterial {...wallProps} />
      </mesh>
      <mesh position={[-(TRAY_INNER_W + t) / 2, TRAY_RIM_Y - TRAY_DEPTH / 2, 0]}>
        <boxGeometry args={[t, TRAY_DEPTH, TRAY_INNER_D + 2 * t]} />
        <meshStandardMaterial {...wallProps} />
      </mesh>
      {/* work bench below */}
      <mesh position={[0, TRAY_RIM_Y - TRAY_DEPTH - 0.02, 0]}>
        <boxGeometry args={[1.6, 0.025, 1.0]} />
        <meshStandardMaterial color="#241a14" roughness={0.9} />
      </mesh>
    </group>
  );
}

function Lights({ quality }: { quality: QualityProfile }) {
  return (
    <>
      <ambientLight intensity={0.55} color="#ffe8cf" />
      <directionalLight
        position={[LIGHT_DIR.x, LIGHT_DIR.y, LIGHT_DIR.z]}
        intensity={1.6}
        color="#fff1dc"
      />
      {/* darkroom safelight glow */}
      {!quality.lowPower && (
        <pointLight position={[-0.45, 0.35, -0.25]} intensity={0.35} color="#ff3b1f" distance={2} />
      )}
    </>
  );
}
