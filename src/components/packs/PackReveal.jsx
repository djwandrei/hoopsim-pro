import React, { useEffect, useState } from 'react';
import confetti from 'canvas-confetti';
import { Image } from '@/components/ui/image';
import { TIER_META, formatCardValue } from '@/lib/cards/packEngine';
import './packReveal.css';

const FLIP_STAGGER_MS = 460;
const TIER_RANKS = ['base', 'uncommon', 'rare', 'super_rare', 'legendary'];

// The pack-opening reveal: five cards deal in face-down, then flip one at a
// time; rare-or-better pulls glow and fire a gold burst at their flip, with a
// bigger burst when the best card lands. Reduced-motion users get every card
// face-up immediately.
export default function PackReveal({ drawnCards }) {
  const [revealed, setRevealed] = useState(0);
  const bestIndex = drawnCards.reduce((best, card, index) => (
    TIER_RANKS.indexOf(card.tier || 'base') > (drawnCards[best] ? TIER_RANKS.indexOf(drawnCards[best].tier || 'base') : -1) ? index : best
  ), 0);
  const bestIsRarePlus = TIER_RANKS.indexOf(drawnCards[bestIndex]?.tier || 'base') >= TIER_RANKS.indexOf('rare');

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
        // The star pull gets its own gold burst the moment it flips.
        if (index === bestIndex && bestIsRarePlus) {
          confetti({ particleCount: 60, spread: 60, startVelocity: 30, scalar: 0.8, ticks: 140, origin: { y: 0.55 }, colors: ['#f0c66e', '#ffe49a', '#ffffff'] });
        }
        if (index === drawnCards.length - 1) {
          confetti({ particleCount: 110, spread: 78, startVelocity: 34, scalar: 0.9, ticks: 170, origin: { y: 0.6 }, colors: ['#f0c66e', '#ffe49a', '#4a72d6', '#e4e9ff'] });
        }
      }, 620 + index * FLIP_STAGGER_MS));
    }
    return () => timers.forEach(timer => clearTimeout(timer));
  }, [drawnCards, bestIndex, bestIsRarePlus]);
  return <ul className="pack-reveal" aria-label="Latest pack contents">
    {drawnCards.map((card, index) => {
      const meta = TIER_META[card.tier] || TIER_META.base;
      const value = formatCardValue(card.valueCents);
      const glows = ['rare', 'super_rare', 'legendary'].includes(card.tier);
      return <li
        key={card.id}
        className={`pack-card${index < revealed ? ' pack-card--revealed' : ''}${glows && index === bestIndex && revealed === drawnCards.length ? ' pack-card--star' : ''}`}
        style={{ '--deal-delay': `${index * 110}ms` }}
      >
        <div className="pack-card__flip">
          <div className="pack-card__face pack-card__face--back" aria-hidden="true"><span className="pack-card__brand">SWISHIQ</span></div>
          <div className="pack-card__face pack-card__face--front">
            <div className="pack-card__media">
              {card.imageUrl
                ? <Image src={card.imageUrl} alt={card.name} fittingType="fit" className="h-full w-full object-contain" />
                : <span className="font-display text-2xl text-muted-foreground">CARD</span>}
            </div>
            <p className="pack-card__name">{card.name}</p>
            <p className="mt-1 flex flex-wrap items-center justify-center gap-1.5 font-mono text-[10.4px]">
              <span className={`rounded border px-1.5 py-0.5 font-semibold uppercase tracking-widest ${meta.chip}`}>{meta.label}</span>
              {card.grade && <span className="text-muted-foreground">PSA {card.grade}</span>}
              {value && <span className="font-bold text-gold">{value}</span>}
            </p>
            <p className="mt-0.5 truncate font-mono text-[10.4px] text-muted-foreground">{[card.set, card.cardNumber && `#${card.cardNumber}`].filter(Boolean).join(' · ')}</p>
          </div>
        </div>
      </li>;
    })}
  </ul>;
}