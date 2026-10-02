import React from 'react';
export default function BroadcastTicker({ items = [] }) {
  if (!items.length) return null;
  return <div className="broadcast-ticker" aria-label="Studio capabilities"><div className="broadcast-ticker__track">{items.map((item, index) => <span key={index} className="broadcast-ticker__item"><strong className="font-mono text-gold">{item.value}</strong><span>{item.label}</span></span>)}</div></div>;
}