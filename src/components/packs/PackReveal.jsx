import React, { useEffect, useState } from 'react';
import confetti from 'canvas-confetti';
import { Image } from '@/components/ui/image';
import './packReveal.css';

const FLIP_STAGGER_MS = 460;

// The pack-opening reveal: cards deal in face-down, then flip one at a time
// with a gold glow; the final flip fires a confetti burst. Reduced-motion
// users get every card face-up immediately.
export default function PackReveal({ drawnCards }) {
  const [revealed, setRevealed] = useState(0);
  useEffect(() => {
    setRevealed(0);
    if (!drawnCards.length) return undefined;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setRevealed(drawnCards.length);
      return undefined;
    }
    const timers = [];
    for (let index = 0; index < drawnCards.length; index += 1) {
      timers.push(setTimeout(() => {
        setRevealed(value => Math.max(value, index + 1));
        if (index === drawnCards.length - 1) {
          confetti({ particleCount: 110, spread: 78, startVelocity: 34, scalar: 0.9, ticks: 170, origin: { y: 0.6 }, colors: ['#f0c66e', '#ffe49a', '#4a72d6', '#e4e9ff'] });
        }
      }, 620 + index * FLIP_STAGGER_MS));
    }
    return () => timers.forEach(timer => clearTimeout(timer));
  }, [drawnCards]);
  return <ul className="pack-reveal" aria-label="Latest simulated pack contents">
    {drawnCards.map((card, index) => <li
      key={card.product.id}
      className={`pack-card${index < revealed ? ' pack-card--revealed' : ''}`}
      style={{ '--deal-delay': `${index * 110}ms` }}
    >
      <div className="pack-card__flip">
        <div className="pack-card__face pack-card__face--back" aria-hidden="true"><span className="pack-card__brand">SWISHIQ</span></div>
        <div className="pack-card__face pack-card__face--front">
          <div className="pack-card__media">
            {card.product.image
              ? <Image src={card.product.image} alt={card.product.name} fittingType="fit" className="h-full w-full object-contain" />
              : <span className="font-display text-2xl text-muted-foreground">CARD</span>}
          </div>
          <p className="pack-card__name">{card.product.name}</p>
        </div>
      </div>
    </li>)}
  </ul>;
}