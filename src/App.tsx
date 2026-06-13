import { useEffect, useMemo, useRef } from 'react';
import { Scene } from './scene/Scene';
import { useQuality } from './hooks/useQuality';
import { useScrollProgress } from './hooks/useScrollProgress';
import { resolvePhotoUrl } from './photoUrl';

export default function App() {
  const quality = useQuality();
  const scrollRef = useScrollProgress();
  const photoUrl = useMemo(() => resolvePhotoUrl(), []);
  const overlayRef = useRef<HTMLDivElement>(null);

  // Fade the overlay out as the lift begins; pure presentation, so it
  // writes styles directly instead of re-rendering React per scroll tick.
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const el = overlayRef.current;
      if (el) {
        const p = scrollRef.current ?? 0;
        el.style.opacity = String(Math.max(0, 1 - p * 3.5));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [scrollRef]);

  return (
    <>
      <Scene quality={quality} photoUrl={photoUrl} scrollRef={scrollRef} />
      <div className="scroll-track" aria-label="Scroll to lift the photo out of the fixing bath" />
      <div className="overlay" ref={overlayRef}>
        <header>
          <h1>The Fixing Bath</h1>
          <p className="tagline">
            A print rests in the fixer. Scroll to lift it out — slowly, like you mean it.
          </p>
          <p className="tagline" style={{ fontSize: '0.72em', opacity: 0.75 }}>
            Bring your own print: append <code>?photo=&lt;image-url&gt;</code>
          </p>
        </header>
        <div className="scroll-hint">scroll</div>
      </div>
    </>
  );
}
