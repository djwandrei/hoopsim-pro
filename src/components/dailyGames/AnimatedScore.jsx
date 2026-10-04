import React, { useEffect, useRef, useState } from 'react';

// Jumbotron digits: tick from whatever is currently on screen up to the new
// value, retargeting safely when the playback accelerates, and pop a floating
// "+N" chip like a broadcast score bug. Interrupt-safe: a new value always
// animates from the last displayed value, so scores never jump backwards.
export default function AnimatedScore({ value = 0, className = '', instant = false }) {
  const [display, setDisplay] = useState(0);
  const [phase, setPhase] = useState('idle'); // idle | ticking | landed
  const [gain, setGain] = useState(null); // { amount, id }
  const frameRef = useRef(null);
  const timeoutRef = useRef(null);
  const gainRef = useRef(null);
  const displayRef = useRef(0);
  const gainSeqRef = useRef(0);

  useEffect(() => {
    cancelAnimationFrame(frameRef.current);
    clearTimeout(timeoutRef.current);
    const from = displayRef.current;
    if (value === from) return undefined;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    if (reduced || instant) {
      displayRef.current = value;
      setDisplay(value);
      setPhase('idle');
      setGain(null);
      return undefined;
    }
    if (value > from) {
      gainSeqRef.current += 1;
      setGain({ amount: value - from, id: gainSeqRef.current });
      clearTimeout(gainRef.current);
      gainRef.current = setTimeout(() => setGain(null), 950);
    } else {
      setGain(null);
    }
    // Fast ticks stay readable: short distance = short roll, long gains get
    // a little more time, but never long enough to lag the live feed.
    const duration = Math.max(140, Math.min(240 + Math.abs(value - from) * 45, 420));
    const start = performance.now();
    setPhase('ticking');
    const step = now => {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 2);
      const current = Math.round(from + (value - from) * eased);
      displayRef.current = current;
      setDisplay(current);
      if (t < 1) {
        frameRef.current = requestAnimationFrame(step);
      } else {
        setPhase('landed');
        timeoutRef.current = setTimeout(() => setPhase('idle'), 400);
      }
    };
    frameRef.current = requestAnimationFrame(step);
  }, [value, instant]);

  useEffect(() => () => {
    cancelAnimationFrame(frameRef.current);
    clearTimeout(timeoutRef.current);
    clearTimeout(gainRef.current);
  }, []);

  return (
    <span className="dg-score-wrap">
      <span className={`${className} ${phase === 'ticking' ? 'is-ticking' : ''} ${phase === 'landed' ? 'is-landed' : ''}`}>
        {instant ? value : display}
      </span>
      {!instant && gain && <span key={gain.id} className="dg-score-gain" aria-hidden="true">+{gain.amount}</span>}
    </span>
  );
}