/**
 * The single interaction: scroll. Exposes a mutable ref holding the
 * normalised scroll fraction so the render loop can read it every frame
 * without re-rendering React.
 */
import { useEffect, useRef, type RefObject } from 'react';
import { scrollProgress } from '../physics';

export function useScrollProgress(): RefObject<number> {
  const progress = useRef(0);

  useEffect(() => {
    const read = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      progress.current = scrollProgress(window.scrollY, max);
    };
    read();
    window.addEventListener('scroll', read, { passive: true });
    window.addEventListener('resize', read);
    return () => {
      window.removeEventListener('scroll', read);
      window.removeEventListener('resize', read);
    };
  }, []);

  return progress;
}
