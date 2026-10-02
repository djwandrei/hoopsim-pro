import React, { useEffect, useMemo, useRef, useState } from 'react';

const ROW = 44;
const VISIBLE = 5;
const REPEATS = 12;

// Vertical slot-machine reel: spins through the item strip and lands on the target row.
export default function ForgeReel({ label, items, getKey, getPrimary, getSub, spinRequest, spinning }) {
  const strip = useMemo(() => Array.from({ length: REPEATS }, () => items).flat(), [items]);
  const targetIndex = useMemo(() => (
    spinRequest?.targetKey == null ? -1 : items.findIndex(item => getKey(item) === spinRequest.targetKey)
  ), [items, spinRequest, getKey]);
  const [offset, setOffset] = useState(() => 2 * Math.max(items.length, 1) + Math.max(0, targetIndex));
  const [animate, setAnimate] = useState(false);
  const offsetRef = useRef(offset);
  offsetRef.current = offset;
  const lastToken = useRef(null);

  useEffect(() => {
    const token = spinRequest?.token ?? null;
    if (token == null || token === lastToken.current || targetIndex < 0 || !items.length) return;
    lastToken.current = token;
    const count = items.length;
    const current = ((offsetRef.current % count) + count) % count;
    setAnimate(false);
    setOffset(2 * count + current);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const delta = ((targetIndex - current) % count + count) % count;
      setAnimate(true);
      setOffset(2 * count + current + count * (REPEATS - 4) + delta);
    }));
  }, [spinRequest?.token, targetIndex, items.length]);

  return <div className={`forge-reel${spinning ? ' forge-reel--spinning' : ''}`} aria-label={`${label} reel`}>
    <p className="forge-reel-label">{label}</p>
    <div className="forge-reel-window" style={{ height: ROW * VISIBLE }}>
      <div className="forge-reel-selector" />
      <div className="forge-reel-track" style={{
        transform: `translateY(${ROW * (VISIBLE - 1) / 2 - offset * ROW}px)`,
        transition: animate ? 'transform 1.15s cubic-bezier(.1,.6,.15,1)' : 'none',
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