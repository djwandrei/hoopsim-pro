import React from 'react';
import { ArrowUpRight, ArrowDownRight, Check, Lock } from 'lucide-react';
import { Image } from '@/components/ui/image';
import { playerAsset, teamAsset } from '@/components/studio/teamAssets';
import { paletteForTeam, readableTeamInk } from '@/components/djhc/basketballPalettes';
import { hasPublicStats, statNumber, statDisplay } from '@/lib/dailyGames/boardHydration';

const TAPE_STATS = [['PPG', 'points'], ['RPG', 'rebounds'], ['APG', 'assists'], ['MPG', 'minutes']];
const GOLD_TILES = new Set(['points', 'rebounds', 'assists']);
const EFFICIENCY_CHIPS = [['PTS/36', 'points'], ['REB/36', 'rebounds'], ['AST/36', 'assists']];

// Per-36 pace-adjusted values, derived from the same observed per-game totals.
function per36(player, key) {
  const value = statNumber(player, key);
  const minutes = statNumber(player, 'minutes');
  if (value === null || !minutes) return null;
  return (value / minutes) * 36;
}

// Blueprint-style player card: big display identity, faint team watermark,
// stat tile grid, and delta chips against the outgoing reference — no bars.
export default function TapeDuelCard({ player, reference = null, selected = false, disabled = false, ctaLabel = 'Swap in', onSelect }) {
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
      {logo && <img src={logo} alt="" loading="lazy" aria-hidden="true" className="dg-duel__watermark" />}
      <header className="dg-duel__head">
        {headshot && <Image src={headshot} alt="" fittingType="fit" className="dg-duel__shot" />}
        <div className="min-w-0 flex-1">
          <h3 className="dg-duel__name">{player.displayName}</h3>
          <p className="dg-duel__meta" style={{ color: ink }}>
            <span className="truncate">{player.positions.join('/')}{player.age ? ` · Age ${player.age}` : ''}</span>
          </p>
        </div>
        <span className={`dg-duel__radio ${selected ? 'is-on' : ''}`} aria-hidden="true">{selected && <Check className="h-3 w-3" />}</span>
      </header>
      <span className="hero-rule dg-duel__rule" aria-hidden="true" />
      {stats && (
        <dl className="dg-duel__strip">
          {TAPE_STATS.map(([label, key]) => (
            <div key={key} className={`dg-duel__tile ${GOLD_TILES.has(key) ? 'dg-duel__tile--gold' : ''}`}>
              <dt className="dg-duel__tile-label">{label}</dt>
              <dd className="dg-duel__tile-value">{statDisplay(statNumber(player, key))}</dd>
            </div>
          ))}
        </dl>
      )}
      {reference && stats && hasPublicStats(reference) && (
        <div className="dg-duel__deltas">
          {TAPE_STATS.filter(([, key]) => GOLD_TILES.has(key)).map(([label, key]) => {
            const mine = statNumber(player, key);
            const theirs = statNumber(reference, key);
            if (mine === null || theirs === null) return null;
            const diff = mine - theirs;
            const state = diff > 0.05 ? 'up' : diff < -0.05 ? 'down' : 'flat';
            return (
              <span key={key} className={`dg-delta-chip ${state === 'up' ? 'dg-delta-chip--up' : state === 'down' ? 'dg-delta-chip--down' : ''}`}>
                {state === 'up' ? <ArrowUpRight className="h-2.5 w-2.5" /> : state === 'down' ? <ArrowDownRight className="h-2.5 w-2.5" /> : null}
                {label} {diff > 0 ? '+' : ''}{diff.toFixed(1)} vs out
              </span>
            );
          })}
        </div>
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