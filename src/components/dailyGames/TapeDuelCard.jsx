import React from 'react';
import { ArrowUpRight, ArrowDownRight, Check, Lock } from 'lucide-react';
import { Image } from '@/components/ui/image';
import { playerAsset, teamAsset } from '@/components/studio/teamAssets';
import { paletteForTeam, readableTeamInk } from '@/components/djhc/basketballPalettes';
import { hasPublicStats, statNumber, statDisplay } from '@/lib/dailyGames/boardHydration';

const TAPE_STATS = [['PTS', 'points'], ['REB', 'rebounds'], ['AST', 'assists'], ['MIN', 'minutes']];
const EFFICIENCY_CHIPS = [['PTS/36', 'points'], ['REB/36', 'rebounds'], ['AST/36', 'assists']];

// Per-36 pace-adjusted values, derived from the same observed per-game totals.
function per36(player, key) {
  const value = statNumber(player, key);
  const minutes = statNumber(player, 'minutes');
  if (value === null || !minutes) return null;
  return (value / minutes) * 36;
}

// Per-stat maximum across a set of players — the shared bar scale when a
// comparison has no single reference player (Draft Night rounds).
export function tapeMaxes(players) {
  const maxes = {};
  for (const [, key] of TAPE_STATS) {
    const values = players.map(player => statNumber(player, key)).filter(value => value !== null);
    maxes[key] = values.length ? Math.max(...values) : null;
  }
  return maxes;
}

export default function TapeDuelCard({ player, reference = null, scale = null, selected = false, disabled = false, ctaLabel = 'Swap in', onSelect }) {
  const logo = teamAsset(player.teamCode);
  const palette = paletteForTeam(player.teamCode);
  const ink = readableTeamInk(player.teamCode);
  const headshot = playerAsset(player.headshotPath || null);
  const stats = hasPublicStats(player);
  let net = null;
  if (reference && stats && hasPublicStats(reference)) {
    net = ['points', 'rebounds', 'assists'].reduce((sum, key) => {
      const mine = statNumber(player, key);
      const theirs = statNumber(reference, key);
      return mine !== null && theirs !== null ? sum + (mine - theirs) : sum;
    }, 0);
    if (Math.abs(net) < 0.05) net = 0;
  }
  return (
    <article
      className={`dg-duel ${selected ? 'is-selected' : ''} ${disabled && !selected ? 'is-disabled' : ''}`}
      style={{ '--dg-team': palette.primary }}
      aria-label={player.displayName}
    >
      <header className="dg-duel__head">
        {headshot && <Image src={headshot} alt="" fittingType="fit" className="dg-duel__shot" />}
        <div className="min-w-0 flex-1">
          <h3 className="dg-duel__name">{player.displayName}</h3>
          <p className="dg-duel__meta" style={{ color: ink }}>
            {logo && <img src={logo} alt="" loading="lazy" className="dg-duel__logo" />}
            <span className="truncate">{player.positions.join('/')}{player.age ? ` · Age ${player.age}` : ''}</span>
          </p>
        </div>
        <span className={`dg-duel__radio ${selected ? 'is-on' : ''}`} aria-hidden="true">{selected && <Check className="h-3 w-3" />}</span>
      </header>
      {stats && (
        <dl className="dg-duel__tape">
          {TAPE_STATS.map(([label, key]) => {
            const value = statNumber(player, key);
            const refValue = reference ? statNumber(reference, key) : null;
            const base = Math.max(value ?? 0, refValue ?? 0, scale?.[key] ?? 0) || 1;
            return (
              <div key={key} className="dg-duel__row">
                <dt className="dg-duel__label">{label}</dt>
                <dd className="dg-duel__bars">
                  <span className="dg-duel__bar dg-duel__bar--mine"><span style={{ width: `${Math.min(100, (value / base) * 100)}%` }} /></span>
                  {refValue !== null && (
                    <span className="dg-duel__bar dg-duel__bar--ref"><span style={{ width: `${Math.min(100, (refValue / base) * 100)}%` }} /></span>
                  )}
                </dd>
                <span className="dg-duel__value">{statDisplay(value)}</span>
              </div>
            );
          })}
        </dl>
      )}
      <div className="dg-duel__foot">
        <div className="dg-duel__eff">
          {EFFICIENCY_CHIPS.map(([label, key]) => {
            const value = per36(player, key);
            return <span key={label} className="dg-duel__chip">{label} <strong>{value === null ? '—' : value.toFixed(1)}</strong></span>;
          })}
        </div>
        {net !== null && (
          <span className={`dg-duel__net ${net > 0 ? 'dg-duel__net--up' : net < 0 ? 'dg-duel__net--down' : ''}`}>
            {net > 0 ? <ArrowUpRight className="h-3 w-3" /> : net < 0 ? <ArrowDownRight className="h-3 w-3" /> : null}
            Net {net > 0 ? '+' : ''}{net.toFixed(1)} PTS/REB/AST
          </span>
        )}
      </div>
      {onSelect ? (
        <button
          type="button"
          onClick={() => onSelect(player)}
          disabled={disabled || selected}
          className={`dg-card__cta ${selected ? 'dg-card__cta--locked' : 'dg-card__cta--open'}`}
        >
          {selected ? <><Check className="h-3.5 w-3.5" /> Locked in</> : disabled ? <><Lock className="h-3.5 w-3.5" /> Locked</> : <><ArrowUpRight className="h-3.5 w-3.5" /> {ctaLabel}</>}
        </button>
      ) : null}
    </article>
  );
}