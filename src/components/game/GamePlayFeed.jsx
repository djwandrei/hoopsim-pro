import React, { useEffect, useRef, useState } from 'react';
import { Play, Pause, SkipForward } from 'lucide-react';

const SPEEDS = [300, 140, 60];
const SPEED_LABELS = ['1x', '2x', '4x'];
const btn = 'inline-flex items-center gap-1.5 rounded-lg border border-gold/40 bg-gold/10 px-3 py-1.5 text-xs font-semibold text-gold transition-colors hover:bg-gold/20 disabled:opacity-40 disabled:cursor-not-allowed';

export default function GamePlayFeed({ game, home, away, onComplete }) {
  const events = game.pbp || [];
  const [count, setCount] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speedIdx, setSpeedIdx] = useState(0);
  const listRef = useRef(null);
  const doneRef = useRef(false);

  useEffect(() => {
    if (!events.length && !doneRef.current) { doneRef.current = true; onComplete?.(); }
  }, [events.length, onComplete]);

  useEffect(() => {
    if (!playing || count >= events.length) return undefined;
    const timer = setTimeout(() => setCount(c => c + 1), SPEEDS[speedIdx]);
    return () => clearTimeout(timer);
  }, [playing, count, speedIdx, events.length]);

  useEffect(() => {
    if (count >= events.length && events.length && !doneRef.current) {
      doneRef.current = true;
      onComplete?.();
    }
  }, [count, events.length, onComplete]);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [count]);

  if (!events.length) return null;

  const current = events[count - 1];
  const score = current ? current.score : [0, 0];
  const visible = events.slice(Math.max(0, count - 16), count);
  const live = count < events.length;
  const pct = Math.round((count / events.length) * 100);

  return (
    <section className="myna-panel p-4" aria-label="Live play-by-play feed">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className={`h-2.5 w-2.5 rounded-full ${live ? 'bg-trim animate-pulse' : 'bg-positive'}`} />
          <span className="court-kicker">{live ? 'Live simulation' : 'Simulation complete'}</span>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" className={btn} onClick={() => setPlaying(p => !p)} disabled={!live} aria-label={playing ? 'Pause feed' : 'Resume feed'}>
            {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
            {playing ? 'PAUSE' : 'RESUME'}
          </button>
          <button type="button" className={btn} onClick={() => setSpeedIdx(i => (i + 1) % SPEEDS.length)} disabled={!live}>{SPEED_LABELS[speedIdx]}</button>
          <button type="button" className={btn} onClick={() => setCount(events.length)} disabled={!live}>
            <SkipForward className="h-3.5 w-3.5" /> SKIP
          </button>
        </div>
      </div>

      <div className="my-3 flex items-center justify-center gap-4">
        <span className="myna-display text-xl">{away.code}</span>
        <span className="myna-mono text-4xl font-semibold">{score[1]}</span>
        <span className="myna-muted text-xs tracking-[0.2em]">{current ? `${current.q} · ${live ? current.clock : 'FINAL'}` : 'PREGAME'}</span>
        <span className="myna-mono text-4xl font-semibold">{score[0]}</span>
        <span className="myna-display text-xl">{home.code}</span>
      </div>
      <div className="myna-bar"><span style={{ width: `${pct}%`, background: 'linear-gradient(90deg, hsl(var(--court-accent)), hsl(var(--court-royal)))' }} /></div>

      <div ref={listRef} className="mt-3 h-64 space-y-1.5 overflow-y-auto pr-1">
        {visible.map((event, i) => {
          const isHome = event.side === 'home';
          const newest = i === visible.length - 1;
          return (
            <div key={count - visible.length + i} className={`flex items-center gap-2 rounded-lg border border-border/25 bg-canvas/50 px-2.5 py-1.5 text-xs ${newest && event.side ? (isHome ? 'broadcast-in-l' : 'broadcast-in-r') : ''}`}>
              <span className="myna-mono w-14 shrink-0 text-[10px] myna-muted">{event.q} {event.clock}</span>
              <span className="h-6 w-1 shrink-0 rounded-full bg-gold" />
              <span className="min-w-0 flex-1 truncate" title={event.text} style={event.type === 'period' || event.type === 'final' ? { color: 'hsl(var(--court-accent))' } : undefined}>{event.text}</span>
              {event.pts > 0 && <span className="myna-mono shrink-0 rounded-md bg-gold/15 px-1.5 py-0.5 text-[10px] text-gold">+{event.pts} · {event.score[1]}–{event.score[0]}</span>}
            </div>
          );
        })}
      </div>
    </section>
  );
}