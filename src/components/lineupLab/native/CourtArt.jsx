import React from 'react';

// Decorative half-court line art in the court palette. Purely presentational.
export default function CourtArt({ className = '' }) {
  return <svg className={className} viewBox="0 0 120 64" fill="none" aria-hidden="true" focusable="false">
    <rect x="1" y="1" width="118" height="62" rx="4" stroke="currentColor" strokeOpacity=".4" />
    <line x1="60" y1="1" x2="60" y2="11" stroke="currentColor" strokeOpacity=".3" />
    <line x1="60" y1="53" x2="60" y2="63" stroke="currentColor" strokeOpacity=".3" />
    <rect x="44" y="1" width="32" height="20" stroke="currentColor" strokeOpacity=".3" />
    <circle cx="60" cy="21" r="5" stroke="currentColor" strokeOpacity=".45" />
    <circle cx="60" cy="32" r="13" stroke="currentColor" strokeOpacity=".3" />
    <path d="M38 63a22 22 0 0 1 44 0" stroke="currentColor" strokeOpacity=".3" />
    <line x1="1" y1="32" x2="14" y2="32" stroke="currentColor" strokeOpacity=".2" />
    <line x1="106" y1="32" x2="119" y2="32" stroke="currentColor" strokeOpacity=".2" />
  </svg>;
}