import { useState, useEffect } from 'react';

export function useSettings() {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('jarvis-reduced-motion');
    if (saved) {
      setReducedMotion(saved === 'true');
    } else {
      const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      setReducedMotion(prefersReduced);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('jarvis-reduced-motion', String(reducedMotion));
    if (reducedMotion) {
      document.documentElement.classList.add('reduced-motion');
    } else {
      document.documentElement.classList.remove('reduced-motion');
    }
  }, [reducedMotion]);

  return { reducedMotion, setReducedMotion };
}
