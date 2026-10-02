import React from 'react';
export default function BroadcastTicker({ items = [] }) {
  if (!items.length) return null;
  const strip = [...items, ...items];
  return <div className="broadcast-ticker" aria-hidden="true"><div className="broadcast-ticker__track">{strip.map((item, index) => <span key={index} className="broadcast-ticker__item"><strong className="font-mono text-gold">{item.value}</strong><span>{item.label}</span></span>)}</div></div>;
}