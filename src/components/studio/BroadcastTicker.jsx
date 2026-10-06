import React from 'react';
export default function BroadcastTicker({ items = [] }) {
  if (!items.length) return null;
  // News-banner marquee: the loop is rendered twice so the -50% translate
  // wraps seamlessly; the duplicate is hidden from assistive tech.
  return <div className="broadcast-ticker rise-in" aria-label="Studio capabilities"><div className="broadcast-ticker__track">{items.map((item, index) => <span key={`a-${index}`} className="broadcast-ticker__item"><strong className="font-mono text-gold">{item.value}</strong><span>{item.label}</span></span>)}{items.map((item, index) => <span key={`b-${index}`} aria-hidden="true" className="broadcast-ticker__item"><strong className="font-mono text-gold">{item.value}</strong><span>{item.label}</span></span>)}</div></div>;
}