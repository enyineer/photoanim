/**
 * Canvas shell: camera, quality-aware renderer settings, and a fallback
 * boundary so a broken/CORS-blocked `?photo=` URL degrades to the bundled
 * default print instead of a blank page.
 */
import { Component, type ReactNode, Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { AdaptiveDpr } from '@react-three/drei';
import { Experience } from './Experience';
import type { QualityProfile } from '../hooks/useQuality';
import { DEFAULT_PHOTO_URL } from '../photoUrl';

class PhotoFallbackBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export function Scene({ quality, photoUrl, scrollRef }: {
  quality: QualityProfile;
  photoUrl: string;
  scrollRef: React.RefObject<number>;
}) {
  return (
    <div className="canvas-wrap" aria-hidden="true">
      <Canvas
        dpr={[1, quality.maxDpr]}
        camera={{ position: [0, 0.42, 0.46], fov: 38, near: 0.01, far: 10 }}
        gl={{ antialias: !quality.lowPower, powerPreference: 'low-power' }}
        onCreated={({ camera }) => camera.lookAt(0, 0.03, 0)}
      >
        <color attach="background" args={['#16100c']} />
        <fog attach="fog" args={['#16100c', 0.8, 2.2]} />
        <AdaptiveDpr pixelated={false} />
        <Suspense fallback={null}>
          <PhotoFallbackBoundary
            fallback={
              <Suspense fallback={null}>
                <Experience quality={quality} photoUrl={DEFAULT_PHOTO_URL} scrollRef={scrollRef} />
              </Suspense>
            }
          >
            <Experience quality={quality} photoUrl={photoUrl} scrollRef={scrollRef} />
          </PhotoFallbackBoundary>
        </Suspense>
      </Canvas>
    </div>
  );
}
