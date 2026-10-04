import React, { useEffect, useRef, useState } from 'react';

// Jumbotron digits that tick up through intermediate values when points are
// scored, and pop a floating "+N" chip like a broadcast score bug.
export default function AnimatedScore({ value = 0, className = '' }) {
  const [display, setDisplay] = useState(0);
  const [phase, setPhase] = useState('idle'); // idle | ticking | landed
  const [gain, setGain] = useState(0);
  const frameRef = useRef(null);
  const timeoutRef = useRef(null);
  const gainRef = useRef(null);
  const fromRef = useRef(0);

  useEffect(() => {
    const from = fromRef.current;
    if (value === from) return undefined;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    if (reduced || value < from) {
      // Snap on reset (new game) and for reduced-motion users.
      cancelAnimationFrame(frameRef.current);
      clearTimeout(gainRef.current);
      fromRef.current = value;
      setDisplay(value);
      setPhase('idle');
      setGain(0);
      return undefined;
    }
    if (value - from > 0) {
      setGain(value - from);
      clearTimeout(gainRef.current);
      gainRef.current = setTimeout(() => setGain(0), 950);
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
      clearTimeout(gainRef.current);
    };
  }, [value]);

  return (
    <span className="dg-score-wrap">
      <span className={`${className} ${phase === 'ticking' ? 'is-ticking' : ''} ${phase === 'landed' ? 'is-landed' : ''}`}>
        {display}
      </span>
      {gain > 0 && <span className="dg-score-gain" aria-hidden="true">+{gain}</span>}
    </span>
  );
}