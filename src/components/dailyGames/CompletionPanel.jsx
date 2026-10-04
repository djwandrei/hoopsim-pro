import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Check, History, Link2, Trophy } from 'lucide-react';
import confetti from 'canvas-confetti';

export default function CompletionPanel({ total, max, entries, otherGamePath, otherGameTitle, onReplay, seed }) {
  const [copied, setCopied] = useState(false);
  const pct = max > 0 ? Math.round((total / max) * 100) : 0;
  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) return;
    const timer = setTimeout(() => {
      confetti({
        particleCount: 90,
        spread: 75,
        startVelocity: 32,
        scalar: 0.8,
        ticks: 160,
        origin: { y: 0.35 },
        colors: ['#E9B949', '#F4D37C', '#4169E1', '#D63A4B', '#80DBB0'],
      });
    }, 250);
    return () => clearTimeout(timer);
  }, []);

  // Daily boards are seed-addressed, so the copied link opens the exact same
  // board for a friend — same rounds, same scoring.
  const shareBoard = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${window.location.pathname}?seed=${seed || ''}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard unavailable */ }
  };

  return (
    <section className="dg-complete" aria-label="Run complete">
      <div className="dg-complete__hero">
        <div className="flex items-center gap-4">
          <span className="dg-complete__trophy"><Trophy className="h-7 w-7 text-gold" /></span>
          <div>
            <span className="bcast-kicker">Run complete</span>
            <h3 className="dg-complete__score mt-1">{total}<em>/{max}</em> <span className="text-[0.45em] tracking-[0.14em] text-muted-foreground">GAME POINTS</span></h3>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {seed && (
            <button type="button" onClick={shareBoard} className="inline-flex items-center gap-2 rounded-lg border border-border/40 bg-transparent px-4 py-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground hover:border-gold/40 hover:text-gold">
              {copied ? <Check className="h-3.5 w-3.5" /> : <Link2 className="h-3.5 w-3.5" />} {copied ? 'Link copied' : 'Copy board link'}
            </button>
          )}
          <button type="button" onClick={onReplay} className="inline-flex items-center gap-2 rounded-lg border border-gold/40 bg-gold/10 px-4 py-2 text-xs font-semibold uppercase tracking-widest text-gold hover:bg-gold/20">
            Replay this board
          </button>
        </div>
      </div>
      <div className="dg-complete__meter mt-4"><span style={{ width: `${pct}%` }} /></div>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2">
        {entries.map((entry, index) => {
          const entryPct = entry.maxPoints > 0 ? Math.round((entry.points / entry.maxPoints) * 100) : 0;
          return (
            <li key={entry.key} className="rounded-lg border border-border/30 bg-canvas/40 px-3 py-2.5">
              <div className="dg-complete__row">
                <span className="dg-complete__row-name">{index + 1}. {entry.title}</span>
                <span className="dg-complete__row-pts">{entry.points}/{entry.maxPoints}</span>
              </div>
              <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-raised/60">
                <span className="block h-full rounded-full bg-gold/80" style={{ width: `${entryPct}%` }} />
              </div>
            </li>
          );
        })}
      </ul>
      <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-border/30 pt-4">
        <p className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground"><History className="h-3.5 w-3.5" />Selections and verified outcomes are saved in this browser for the seed {seed || 'today'}.</p>
        {otherGamePath && (
          <Link to={otherGamePath} className="ml-auto inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-gold">
            Play {otherGameTitle} <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        )}
      </div>
    </section>
  );
}