import React, { useEffect, useMemo, useRef, useState } from 'react';

const ROW = 44;
const VISIBLE = 5;
const REPEATS = 12;
// Two-phase slot-machine spin. The total (1250ms) matches the SPIN_MS
// reveal timers in the forge games, so the player data lands as the reels settle.
const WIND_MS = 500;   // phase 1: accelerate into the blurred cruise
const SETTLE_MS = 750; // phase 2: decelerate onto the target with a tick-back bounce

// Vertical slot-machine reel: spins through the item strip and lands on the target row.
export default function ForgeReel({ label, items, getKey, getPrimary, getSub, spinRequest, spinning, fast = false }) {
  const strip = useMemo(() => Array.from({ length: REPEATS }, () => items).flat(), [items]);
  const targetIndex = useMemo(() => (
    spinRequest?.targetKey == null ? -1 : items.findIndex(item => getKey(item) === spinRequest.targetKey)
  ), [items, spinRequest, getKey]);
  const [offset, setOffset] = useState(() => 2 * Math.max(items.length, 1) + Math.max(0, targetIndex));
  const [animate, setAnimate] = useState(false);
  const [transition, setTransition] = useState('');
  const [winding, setWinding] = useState(false);
  const offsetRef = useRef(offset);
  offsetRef.current = offset;
  const lastToken = useRef(null);
  const settleTimer = useRef(null);

  useEffect(() => {
    const token = spinRequest?.token ?? null;
    if (token == null || token === lastToken.current || targetIndex < 0 || !items.length) return;
    lastToken.current = token;
    window.clearTimeout(settleTimer.current);
    const count = items.length;
    const current = ((offsetRef.current % count) + count) % count;
    const delta = ((targetIndex - current) % count + count) % count;
    setAnimate(false);
    setWinding(false);
    setOffset(2 * count + current);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (fast) {
        // Long-session mode: skip the wind-up cruise and settle in one step.
        setWinding(false);
        setAnimate(true);
        setTransition(`transform ${SETTLE_MS}ms cubic-bezier(.15,.8,.1,1.12)`);
        setOffset(2 * count + current + delta);
        return;
      }
      // Phase 1 — wind-up: accelerate hard into a long blurred cruise.
      setWinding(true);
      setAnimate(true);
      setTransition(`transform ${WIND_MS}ms cubic-bezier(.3,0,.85,.4)`);
      setOffset(2 * count + current + count * (REPEATS - 6));
      // Phase 2 — settle: decelerate onto the target row, overshooting a touch.
      settleTimer.current = window.setTimeout(() => {
        setWinding(false);
        setTransition(`transform ${SETTLE_MS}ms cubic-bezier(.15,.8,.1,1.12)`);
        setOffset(2 * count + current + count * (REPEATS - 6) + delta);
      }, WIND_MS);
    }));
  }, [spinRequest?.token, targetIndex, items.length, fast]);

  useEffect(() => () => window.clearTimeout(settleTimer.current), []);

  return <div className={`forge-reel${spinning ? ' forge-reel--spinning' : ''}${winding ? ' forge-reel--winding' : ''}`} aria-label={`${label} reel`}>
    <p className="forge-reel-label">{label}</p>
    <div className="forge-reel-window" style={{ height: ROW * VISIBLE }}>
      <div className="forge-reel-selector" />
      <div className="forge-reel-track" style={{
        transform: `translateY(${ROW * (VISIBLE - 1) / 2 - offset * ROW}px)`,
        transition: animate ? transition : 'none',
      }}>
        {strip.map((item, index) => <div key={index} className="forge-reel-row" style={{ height: ROW }}>
          <span className="forge-reel-primary">{getPrimary(item)}</span>
          <span className="forge-reel-sub">{getSub(item)}</span>
        </div>)}
      </div>
      <div className="forge-reel-fade" />
    </div>
  </div>;
}