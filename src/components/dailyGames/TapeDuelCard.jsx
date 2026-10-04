import React from 'react';
import { ArrowUpRight, ArrowDownRight, Check, Lock } from 'lucide-react';
import { Image } from '@/components/ui/image';
import { playerAsset, teamAsset } from '@/components/studio/teamAssets';
import { paletteForTeam, readableTeamInk } from '@/components/djhc/basketballPalettes';
import { useCourtTheme } from '@/components/djhc/CourtThemeProvider';
import { hasPublicStats, statNumber, statDisplay } from '@/lib/dailyGames/boardHydration';

const STRIP_STATS = [['PPG', 'points'], ['RPG', 'rebounds'], ['APG', 'assists']];
const EFFICIENCY_CHIPS = [['MPG', 'minutes'], ['PTS/36', 'points'], ['REB/36', 'rebounds'], ['AST/36', 'assists']];

// Per-36 pace-adjusted values, derived from the same observed per-game totals.
function per36(player, key) {
  const value = statNumber(player, key);
  const minutes = statNumber(player, 'minutes');
  if (value === null || !minutes) return null;
  return (value / minutes) * 36;
}

// Blueprint-faithful player card: identity band with the portrait seated on
// its edge, a divided per-game strip, and delta chips — no bar charts.
export default function TapeDuelCard({ player, reference = null, selected = false, disabled = false, ctaLabel = 'Swap in', onSelect }) {
  const logo = teamAsset(player.teamCode);
  const palette = paletteForTeam(player.teamCode);
  const { mode } = useCourtTheme();
  const ink = readableTeamInk(player.teamCode, mode);
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
      <header className="dg-duel__band">
        {logo && <img src={logo} alt="" loading="lazy" aria-hidden="true" className="dg-duel__logo-bg" />}
        <div className="dg-duel__band-row">
          {headshot && <Image src={headshot} alt="" fittingType="fit" className="dg-duel__shot" />}
          <div className="dg-duel__band-text">
            <h3 className="dg-duel__name">{player.displayName}</h3>
            <span className="hero-rule dg-duel__rule" aria-hidden="true" />
            <p className="dg-duel__meta" style={{ color: ink }}>
              <span className="truncate">{player.positions.join('/')}{player.age ? ` · Age ${player.age}` : ''}</span>
            </p>
          </div>
          <span className={`dg-duel__radio ${selected ? 'is-on' : ''}`} aria-hidden="true">{selected && <Check className="h-3 w-3" />}</span>
        </div>
      </header>
      <dl className="dg-duel__strip">
        {STRIP_STATS.map(([label, key]) => (
          <div key={key} className="dg-duel__stat">
            <dt className="dg-duel__stat-label">{label}</dt>
            <dd className="dg-duel__stat-value">{statDisplay(statNumber(player, key))}</dd>
            <span className="dg-duel__stat-sub">per game</span>
          </div>
        ))}
      </dl>
      <div className="dg-duel__body">
        <div className="dg-duel__row2">
          {EFFICIENCY_CHIPS.map(([label, key]) => {
            const value = key === 'minutes' ? statNumber(player, 'minutes') : per36(player, key);
            return <span key={label} className="dg-duel__chip">{label} <strong>{value === null ? '—' : value.toFixed(1)}</strong></span>;
          })}
        </div>
        {reference && stats && hasPublicStats(reference) && (
          <div className="dg-duel__deltas">
            {STRIP_STATS.map(([label, key]) => {
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
        {net !== null && (
          <span className={`dg-duel__net ${net > 0 ? 'dg-duel__net--up' : net < 0 ? 'dg-duel__net--down' : ''}`}>
            {net > 0 ? <ArrowUpRight className="h-3 w-3" /> : net < 0 ? <ArrowDownRight className="h-3 w-3" /> : null}
            Net {net > 0 ? '+' : ''}{net.toFixed(1)} PTS/REB/AST
          </span>
        )}
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
      </div>
    </article>
  );
}