import React, { useEffect, useRef, useState } from 'react';
import { FastForward } from 'lucide-react';
import { teamAsset } from '@/components/studio/teamAssets';
import AnimatedScore from '@/components/dailyGames/AnimatedScore';

// Broadcast jumbotron: plays the simulated play-by-play back in real time,
// with the score updating (and flashing) as every possession resolves.
export default function LiveScoreboard({ homeCode = '', awayCode = '', result, onComplete }) {
  const pbp = result?.pbp || [];
  const total = pbp.length;
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const timerRef = useRef(null);
  const doneRef = useRef(onComplete);
  doneRef.current = onComplete;

  useEffect(() => {
    if (!total) return;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    if (reduced) {
      setIndex(total);
      setPlaying(false);
      doneRef.current?.();
      return;
    }
    setIndex(0);
    setPlaying(true);
    let step = 0;
    let cancelled = false;
    const tick = () => {
      if (cancelled) return;
      // Accelerate: the reveal starts event-by-event, then speeds up so the
      // whole game plays back in a few seconds.
      step += step < 10 ? 1 : 2 + Math.floor(step / 30);
      if (step >= total) {
        setIndex(total);
        setPlaying(false);
        doneRef.current?.();
        return;
      }
      setIndex(step);
      timerRef.current = setTimeout(tick, step < 8 ? 500 : 80);
    };
    timerRef.current = setTimeout(tick, 450);
    return () => {
      cancelled = true;
      window.clearTimeout(timerRef.current);
    };
  }, [result]);

  const skip = () => {
    window.clearTimeout(timerRef.current);
    setIndex(total);
    setPlaying(false);
    doneRef.current?.();
  };

  const done = index >= total;
  const current = index > 0 ? pbp[index - 1] : null;
  const [homeScore, awayScore] = current?.score || [0, 0];
  const homeLogo = teamAsset(homeCode);
  const awayLogo = teamAsset(awayCode);
  const progress = total ? Math.round((index / total) * 100) : 0;

  return (
    <section className={`dg-live ${done ? 'dg-live--final' : ''}`} aria-label="Live scoreboard">
      <div className="dg-live__board">
        <div className="dg-live__team">
          <span className="dg-live__logo">{homeLogo && <img src={homeLogo} alt="" />}</span>
          <span className="dg-live__code">{homeCode || 'YOUR FIVE'}</span>
          <AnimatedScore value={homeScore} className="dg-live__pts" />
        </div>
        <div className="dg-live__mid">
          <span className={`dg-live__badge ${playing ? 'dg-live__badge--live' : ''}`}>{done ? 'FINAL' : 'LIVE'}</span>
          <span className="dg-live__qtr">{current ? current.q : 'TIP-OFF'}</span>
          <span className="dg-live__clock">{current ? current.clock : '12:00'}</span>
        </div>
        <div className="dg-live__team dg-live__team--away">
          <AnimatedScore value={awayScore} className="dg-live__pts" />
          <span className="dg-live__code">{awayCode || 'AWAY'}</span>
          <span className="dg-live__logo">{awayLogo && <img src={awayLogo} alt="" />}</span>
        </div>
      </div>
      <div className="dg-live__progress" aria-hidden="true"><span style={{ width: `${progress}%` }} /></div>
      <p key={index} className="dg-live__ticker" role="status">
        {current ? `${current.q} ${current.clock} — ${current.text}` : 'Teams are on the floor…'}
      </p>
      {!done && (
        <button type="button" className="dg-live__skip" onClick={skip}>
          <FastForward className="h-3 w-3" /> Skip to final
        </button>
      )}
    </section>
  );
}