import React, { useEffect, useRef, useState } from 'react';

// Jumbotron digits that tick up through intermediate values when points are
// scored, instead of jumping straight to the new total.
export default function AnimatedScore({ value = 0, className = '' }) {
  const [display, setDisplay] = useState(0);
  const [phase, setPhase] = useState('idle'); // idle | ticking | landed
  const frameRef = useRef(null);
  const timeoutRef = useRef(null);
  const fromRef = useRef(0);

  useEffect(() => {
    const from = fromRef.current;
    if (value === from) return undefined;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    if (reduced || value < from) {
      // Snap on reset (new game) and for reduced-motion users.
      cancelAnimationFrame(frameRef.current);
      fromRef.current = value;
      setDisplay(value);
      setPhase('idle');
      return undefined;
    }
    const start = performance.now();
    const duration = Math.min(220 + (value - from) * 60, 560);
    setPhase('ticking');
    const step = now => {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(from + (value - from) * eased));
      if (t < 1) {
        frameRef.current = requestAnimationFrame(step);
      } else {
        fromRef.current = value;
        setPhase('landed');
        timeoutRef.current = setTimeout(() => setPhase('idle'), 500);
      }
    };
    frameRef.current = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(frameRef.current);
      clearTimeout(timeoutRef.current);
    };
  }, [value]);

  return (
    <span className={`${className} ${phase === 'ticking' ? 'is-ticking' : ''} ${phase === 'landed' ? 'is-landed' : ''}`}>
      {display}
    </span>
  );
}