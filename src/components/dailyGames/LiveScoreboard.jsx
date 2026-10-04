import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FastForward } from 'lucide-react';
import { teamAsset } from '@/components/studio/teamAssets';
import { paletteForTeam } from '@/components/djhc/basketballPalettes';
import { TEAM_NAMES } from '@/lib/season/simEngine';
import AnimatedScore from '@/components/dailyGames/AnimatedScore';

const cityName = (code, name) => name || TEAM_NAMES[code] || (code || '').toUpperCase();

// Arena LED jumbotron: plays the simulated play-by-play back in real time,
// with the score updating (and flashing) as every possession resolves and a
// quarter-by-quarter line building underneath, like a real scoreboard.
export default function LiveScoreboard({ homeCode = '', awayCode = '', homeName, awayName, result, onComplete }) {
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
  const homePalette = paletteForTeam(homeCode);
  const awayPalette = paletteForTeam(awayCode);
  const progress = total ? Math.round((index / total) * 100) : 0;
  const quarters = useMemo(() => {
    const byQuarter = new Map();
    for (const event of pbp) {
      if (!event?.q || event.q === 'FINAL') continue;
      const slot = byQuarter.get(event.q) || { home: 0, away: 0 };
      if (event.side === 'home') slot.home += event.pts || 0;
      else if (event.side === 'away') slot.away += event.pts || 0;
      byQuarter.set(event.q, slot);
    }
    return [...byQuarter.entries()];
  }, [pbp]);
  const gridColumns = `4.75rem repeat(${Math.max(quarters.length, 4)}, minmax(0, 1fr))`;

  return (
    <section className={`dg-live ${done ? 'dg-live--final' : ''}`} aria-label="Live scoreboard">
      <div className="dg-live__masthead" aria-hidden="true">
        <span>SwishIQ simulation feed</span>
        <span>Neutral court</span>
      </div>
      <div className="dg-live__board">
        <div className="dg-live__club" style={{ '--dg-team': homePalette?.primary }}>
          <span className="dg-live__logo">{homeLogo && <img src={homeLogo} alt="" />}</span>
          <span className="dg-live__identity">
            <span className="dg-live__city">{cityName(homeCode, homeName) || 'Your Five'}</span>
            <span className="dg-live__code">{homeCode || 'FIVE'}</span>
          </span>
          <AnimatedScore value={homeScore} className="dg-live__pts" />
        </div>
        <div className="dg-live__mid">
          <span className={`dg-live__badge ${playing ? 'dg-live__badge--live' : ''}`}>{done ? 'FINAL' : 'LIVE'}</span>
          <span className="dg-live__period">
            <span className="dg-live__qtr">{current ? current.q : 'Q1'}</span>
            <span className="dg-live__clock">{current ? current.clock : '12:00'}</span>
          </span>
        </div>
        <div className="dg-live__club dg-live__club--away" style={{ '--dg-team': awayPalette?.primary }}>
          <AnimatedScore value={awayScore} className="dg-live__pts" />
          <span className="dg-live__identity">
            <span className="dg-live__city">{cityName(awayCode, awayName) || 'Away'}</span>
            <span className="dg-live__code">{awayCode || 'AWAY'}</span>
          </span>
          <span className="dg-live__logo">{awayLogo && <img src={awayLogo} alt="" />}</span>
        </div>
      </div>
      {quarters.length > 0 && (
        <div className="dg-live__quarters" aria-hidden="true">
          <div className="dg-live__qhead" style={{ display: 'grid', gridTemplateColumns: gridColumns, gap: '.25rem' }}>
            <span></span>
            {quarters.map(([label]) => <span key={label}>{label.replace('Q', '')}</span>)}
          </div>
          <div className="dg-live__qrow" style={{ display: 'grid', gridTemplateColumns: gridColumns, gap: '.25rem' }}>
            <span>{homeCode || 'FIVE'}</span>
            {quarters.map(([label, slot]) => <span key={label}>{slot.home}</span>)}
          </div>
          <div className="dg-live__qrow" style={{ display: 'grid', gridTemplateColumns: gridColumns, gap: '.25rem' }}>
            <span>{awayCode || 'AWAY'}</span>
            {quarters.map(([label, slot]) => <span key={label}>{slot.away}</span>)}
          </div>
        </div>
      )}
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