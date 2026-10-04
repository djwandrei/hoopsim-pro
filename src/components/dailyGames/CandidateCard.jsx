import React from 'react';
import { ArrowUpRight, ArrowDownRight, Check, Lock } from 'lucide-react';
import { Image } from '@/components/ui/image';
import TeamMark from '@/components/studio/TeamMark';
import { playerAsset, teamAsset } from '@/components/studio/teamAssets';
import { paletteForTeam, readableTeamInk } from '@/components/djhc/basketballPalettes';
import { hasPublicStats, statDisplay, statNumber } from '@/lib/dailyGames/boardHydration';

const STAT_LABELS = [['PTS', 'points'], ['REB', 'rebounds'], ['AST', 'assists'], ['MPG', 'minutes']];

function candidateDelta(player, outgoing) {
  if (!outgoing) return null;
  const changes = STAT_LABELS.map(([label, key]) => {
    const candidateValue = statNumber(player, key);
    const outgoingValue = statNumber(outgoing, key);
    if (candidateValue === null || outgoingValue === null) return '';
    const change = candidateValue - outgoingValue;
    if (Math.abs(change) < 0.05) return `0.0 ${label}`;
    return `${change > 0 ? '+' : ''}${change.toFixed(1)} ${label}`;
  }).filter(Boolean);
  if (!changes.length) return null;
  return `Vs. outgoing: ${changes.join(' · ')}`;
}

export default function CandidateCard({ player, outgoing, disabled = false, selected = false, revealed = false, compact = false, ctaLabel = 'Swap in', onSelect }) {
  const logo = teamAsset(player.teamCode);
  const ink = readableTeamInk(player.teamCode);
  const palette = paletteForTeam(player.teamCode);
  const headshot = playerAsset(player.headshotPath || null);
  const delta = candidateDelta(player, outgoing);
  return (
    <article
      className={`court-panel court-panel-hover relative flex min-w-0 flex-col gap-3 p-4 ${selected ? 'border-gold/60' : ''} ${disabled && !selected ? 'opacity-50' : ''}`}
      style={selected ? { boxShadow: `0 10px 30px ${palette.primary}44` } : undefined}
      aria-label={player.displayName}
    >
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {logo && <img src={logo} alt="" loading="lazy" className="h-6 w-6 shrink-0 object-contain" />}
            <h3 className="truncate font-display text-lg tracking-wide">{player.displayName}</h3>
          </div>
          <p className="mt-0.5 text-[10px] uppercase tracking-widest text-muted-foreground" style={{ color: ink }}>
            {player.positions.join('/')} {player.age ? `· Age ${player.age}` : ''}
          </p>
        </div>
        {headshot && <Image src={headshot} alt="" fittingType="fit" className="h-14 w-14 shrink-0 object-contain" />}
      </div>
      {hasPublicStats(player) && (
        <dl className="grid grid-cols-4 gap-1 rounded-lg border border-border/30 bg-canvas/40 p-2 text-center">
          {STAT_LABELS.map(([label, key]) => (
            <div key={key}>
              <dt className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground">{label}</dt>
              <dd className="font-mono text-sm tabular-nums">{statDisplay(statNumber(player, key))}</dd>
            </div>
          ))}
        </dl>
      )}
      {delta && <p className="text-[10px] text-muted-foreground">{delta}</p>}
      {onSelect ? (
        <button
          type="button"
          onClick={() => onSelect(player)}
          disabled={disabled || revealed}
          className={selected || revealed
            ? 'inline-flex items-center justify-center gap-1.5 rounded-lg bg-gold px-3 py-2 text-[11px] font-semibold uppercase tracking-widest text-canvas'
            : 'inline-flex items-center justify-center gap-1.5 rounded-lg border border-gold/40 bg-gold/10 px-3 py-2 text-[11px] font-semibold uppercase tracking-widest text-gold'}
        >
          {revealed ? <Check className="h-3.5 w-3.5" /> : disabled ? <Lock className="h-3.5 w-3.5" /> : <ArrowUpRight className="h-3.5 w-3.5" />}
          {revealed ? 'Locked' : ctaLabel}
        </button>
      ) : (
        selected && <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-widest text-gold"><Check className="h-3 w-3" /> Your pick</span>
      )}
    </article>
  );
}

export function StatDeltaRow({ label, value, outgoingValue }) {
  const change = value - outgoingValue;
  const Icon = change >= 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
      <Icon className="h-3 w-3" /> {change >= 0 ? '+' : ''}{change.toFixed(1)} {label}
    </span>
  );
}