import React from 'react';
import { ArrowUpRight, ArrowDownRight, Check, Lock } from 'lucide-react';
import { Image } from '@/components/ui/image';
import { playerAsset, teamAsset } from '@/components/studio/teamAssets';
import { paletteForTeam, readableTeamInk } from '@/components/djhc/basketballPalettes';
import { useCourtTheme } from '@/components/djhc/CourtThemeProvider';
import { hasPublicStats, statDisplay, statNumber } from '@/lib/dailyGames/boardHydration';

const STAT_LABELS = [['PTS', 'points'], ['REB', 'rebounds'], ['AST', 'assists'], ['MPG', 'minutes']];

function candidateDeltas(player, outgoing) {
  if (!outgoing) return [];
  return STAT_LABELS.map(([label, key]) => {
    const candidateValue = statNumber(player, key);
    const outgoingValue = statNumber(outgoing, key);
    if (candidateValue === null || outgoingValue === null) return null;
    const change = candidateValue - outgoingValue;
    if (Math.abs(change) < 0.05) return { label, change: 0 };
    return { label, change };
  }).filter(Boolean);
}

export default function CandidateCard({ player, outgoing, disabled = false, selected = false, revealed = false, ctaLabel = 'Swap in', onSelect }) {
  const logo = teamAsset(player.teamCode);
  const palette = paletteForTeam(player.teamCode);
  const { mode } = useCourtTheme();
  const ink = readableTeamInk(player.teamCode, mode);
  const headshot = playerAsset(player.headshotPath || null);
  const deltas = candidateDeltas(player, outgoing);
  const locked = selected || revealed;
  return (
    <article
      className={`dg-card ${selected ? 'is-selected' : ''} ${disabled && !selected ? 'is-disabled' : ''}`}
      style={{ '--dg-team': palette.primary }}
      aria-label={player.displayName}
    >
      <header className="dg-card__head">
        <div className="min-w-0 flex-1">
          <h3 className="dg-card__name">{player.displayName}</h3>
          <p className="dg-card__meta" style={{ color: ink }}>
            {logo && <img src={logo} alt="" loading="lazy" className="dg-card__logo" />}
            <span className="truncate">{player.positions.join('/')} {player.age ? `· Age ${player.age}` : ''}</span>
          </p>
        </div>
        {headshot && <Image src={headshot} alt="" fittingType="fit" className="dg-card__headshot" />}
      </header>
      {hasPublicStats(player) && (
        <dl className="dg-card__stats">
          {STAT_LABELS.map(([label, key]) => (
            <div key={key} className="dg-card__stat">
              <dt className="dg-card__stat-label">{label}</dt>
              <dd className="dg-card__stat-value">{statDisplay(statNumber(player, key))}</dd>
            </div>
          ))}
        </dl>
      )}
      {deltas.length > 0 && (
        <div className="dg-card__delta">
          {deltas.map(({ label, change }) => (
            <span key={label} className={`dg-delta ${change > 0 ? 'dg-delta--up' : change < 0 ? 'dg-delta--down' : ''}`}>
              {change > 0 ? <ArrowUpRight className="h-2.5 w-2.5" /> : change < 0 ? <ArrowDownRight className="h-2.5 w-2.5" /> : null}
              {change > 0 ? '+' : ''}{change.toFixed(1)} {label}
            </span>
          ))}
        </div>
      )}
      {onSelect ? (
        <button
          type="button"
          onClick={() => onSelect(player)}
          disabled={disabled || revealed}
          className={`dg-card__cta ${locked ? 'dg-card__cta--locked' : 'dg-card__cta--open'}`}
        >
          {revealed ? <Check className="h-3.5 w-3.5" /> : disabled ? <Lock className="h-3.5 w-3.5" /> : <ArrowUpRight className="h-3.5 w-3.5" />}
          {revealed ? 'Locked' : ctaLabel}
        </button>
      ) : (
        selected && <span className="dg-card__pickflag"><Check className="h-3 w-3" /> Your pick</span>
      )}
    </article>
  );
}

export function StatDeltaRow({ label, value, outgoingValue }) {
  const change = value - outgoingValue;
  const Icon = change >= 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={`dg-delta ${change > 0 ? 'dg-delta--up' : 'dg-delta--down'}`}>
      <Icon className="h-2.5 w-2.5" /> {change >= 0 ? '+' : ''}{change.toFixed(1)} {label}
    </span>
  );
}