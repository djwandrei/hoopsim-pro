import React, { useEffect, useState } from 'react';
import confetti from 'canvas-confetti';
import { Image } from '@/components/ui/image';
import './packReveal.css';

const FLIP_STAGGER_MS = 460;

// Reveal a deterministic local draw. Every card has equal weight; the reveal
// has no rarity, value, or ownership signal.
export default function PackReveal({ drawnCards }) {
  const [revealed, setRevealed] = useState(0);

  useEffect(() => {
    setRevealed(0);
    if (!drawnCards.length) return undefined;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setRevealed(drawnCards.length);
      return undefined;
    }
    const timers = drawnCards.map((_, index) => setTimeout(() => {
      setRevealed(value => Math.max(value, index + 1));
      if (index === drawnCards.length - 1) {
        confetti({ particleCount: 90, spread: 72, startVelocity: 30, scalar: 0.85, ticks: 150, origin: { y: 0.58 }, colors: ['#f0c66e', '#ffe49a', '#ffffff'] });
      }
    }, 620 + index * FLIP_STAGGER_MS));
    return () => timers.forEach(timer => clearTimeout(timer));
  }, [drawnCards]);

  return <ul className="pack-reveal" aria-label="Latest simulated draw">
    {drawnCards.map((card, index) => {
      const product = card.product || card;
      const id = product.id ?? card.id ?? index;
      const mappings = Array.isArray(card.mappings) ? card.mappings : [];
      const players = [...new Set(mappings.map(mapping => mapping.player?.name).filter(Boolean))];
      const details = [product.team, product.condition, product.year].filter(Boolean).join(' · ');
      return <li
        key={`${id}-${index}`}
        className={`pack-card${index < revealed ? ' pack-card--revealed' : ''}`}
        style={{ '--deal-delay': `${index * 110}ms` }}
      >
        <div className="pack-card__flip">
          <div className="pack-card__face pack-card__face--back" aria-hidden="true">
            <span className="pack-card__brand">DJHC</span>
            <span className="pack-card__mystery">?</span>
          </div>
          <div className="pack-card__face pack-card__face--front">
            <div className="pack-card__media">
              {product.image
                ? <a href={product.productUrl} target="_blank" rel="noopener noreferrer" aria-label={`View ${product.name} in the DJHC shop`}><Image src={product.image} alt={product.name} fittingType="fit" className="h-full w-full object-contain" /></a>
                : <span className="font-display text-2xl text-muted-foreground">CARD</span>}
            </div>
            <p className="pack-card__name">
              {product.productUrl
                ? <a href={product.productUrl} target="_blank" rel="noopener noreferrer" className="underline-offset-4 hover:underline">{product.name}</a>
                : product.name}
            </p>
            {players.length > 0 && <p className="mt-1 text-center text-[10.4px] text-gold">Verified match · {players.join(', ')}</p>}
            {details && <p className="mt-1 text-center font-mono text-[10.4px] text-muted-foreground">{details}</p>}
            {product.displayPrice && <p className="mt-1 text-center font-mono text-[10.4px] text-muted-foreground">Shop listing · {product.displayPrice}</p>}
          </div>
        </div>
      </li>;
    })}
  </ul>;
}
