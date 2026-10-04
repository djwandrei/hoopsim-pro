import React from 'react';
import { Image } from '@/components/ui/image';
import { playerAsset, teamAsset } from '@/components/studio/teamAssets';
import { paletteForTeam, readableTeamInk } from '@/components/djhc/basketballPalettes';
import { useCourtTheme } from '@/components/djhc/CourtThemeProvider';
import { statDisplay, statNumber } from '@/lib/dailyGames/boardHydration';

const STAT_COLUMNS = [['MPG', 'minutes'], ['PPG', 'points'], ['RPG', 'rebounds'], ['APG', 'assists']];
const TOTAL_COLUMNS = [['PPG', 'points'], ['RPG', 'rebounds'], ['APG', 'assists']];
const ROLE_ORDER = { G: 0, F: 1, C: 2 };
const roleOf = player => {
  const positions = (player.positions || []).map(position => String(position).toUpperCase());
  if (positions.some(p => p === 'C' || p === 'CENTER')) return 'C';
  if (positions.some(p => ['F', 'PF', 'SF', 'FORWARD'].includes(p))) return 'F';
  return 'G';
};

// Broadcast-style depth chart: one centered row per position, from the point
// guard down to the center, with the outgoing starter flagged for the swap.
export default function DepthChart({ lineup = [], removedPlayerRef = null, incomingPlayer = null, incomingLabel = 'Incoming' }) {
  const { mode } = useCourtTheme();
  const rows = lineup.slice(0, 5)
    .map(player => {
      const outgoing = player.playerRef === removedPlayerRef;
      return { player: outgoing && incomingPlayer ? incomingPlayer : player, outgoing };
    })
    .sort((a, b) => ROLE_ORDER[roleOf(a.player)] - ROLE_ORDER[roleOf(b.player)]);
  const totals = TOTAL_COLUMNS.map(([label, key]) => {
    const values = rows.map(({ player }) => statNumber(player, key)).filter(value => value !== null);
    return { label, value: values.length ? values.reduce((sum, value) => sum + value, 0) : null };
  });
  return (
    <div className="dg-depth" role="group" aria-label="Depth chart of the starting five">
      <header className="dg-depth__head">
        <span className="bcast-kicker">Depth chart</span>
        <span className="dg-depth__legend">Starting five · PG to C</span>
      </header>
      <div className="dg-depth__cols" aria-hidden="true">
        <span>Pos</span>
        <span className="dg-depth__spacer" />
        <span>Player</span>
        <div className="dg-depth__stats dg-depth__stats--head">
          {STAT_COLUMNS.map(([label]) => <span key={label} className="dg-depth__col-label">{label}</span>)}
        </div>
      </div>
      <ol className="dg-depth__rows">
        {rows.map(({ player, outgoing }) => {
          const palette = paletteForTeam(player.teamCode);
          const ink = readableTeamInk(player.teamCode, mode);
          const logo = teamAsset(player.teamCode);
          const headshot = playerAsset(player.headshotPath || null);
          const initials = player.displayName.split(/\s+/).map(part => part[0]).join('').slice(0, 2);
          return (
            <li
              key={player.playerRef}
              className={`dg-depth__row ${outgoing ? (incomingPlayer ? 'is-incoming' : 'is-outgoing') : ''}`}
              style={{ '--dg-team': palette.primary }}
            >
              <span className="dg-depth__pos">{(player.positions && player.positions[0]) || roleOf(player)}</span>
              <span className="dg-depth__shot">
                {headshot
                  ? <Image src={headshot} alt="" fittingType="fit" loading="lazy" className="dg-depth__portrait" />
                  : <span className="dg-depth__initials" aria-hidden="true">{initials}</span>}
              </span>
              <span className="dg-depth__identity">
                <span className="dg-depth__name">{player.displayName}</span>
                <span className="dg-depth__meta" style={{ color: ink }}>
                  {logo && <img src={logo} alt="" aria-hidden="true" className="dg-depth__logo" />}
                  <span>{player.teamCode || '—'}{(player.positions || []).join('/') ? ` · ${(player.positions || []).join('/')}` : ''}{player.age ? ` · Age ${player.age}` : ''}</span>
                </span>
              </span>
              <dl className="dg-depth__stats">
                {STAT_COLUMNS.map(([label, key]) => (
                  <div key={key} className="dg-depth__stat">
                    <dt>{label}</dt>
                    <dd>{statDisplay(statNumber(player, key))}</dd>
                  </div>
                ))}
              </dl>
              <span className={`dg-depth__flag ${outgoing && !incomingPlayer ? 'dg-depth__flag--out' : 'dg-depth__flag--in'}`}>
                {outgoing ? (incomingPlayer ? incomingLabel : 'Outgoing') : 'Starter'}
              </span>
            </li>
          );
        })}
      </ol>
      <footer className="dg-depth__totals">
        <span className="dg-depth__spacer" />
        <span className="dg-depth__totals-label">Five-man totals</span>
        <dl className="dg-depth__stats dg-depth__stats--totals">
          {totals.map(({ label, value }) => (
            <div key={label} className="dg-depth__stat">
              <dt>{label}</dt>
              <dd>{statDisplay(value)}</dd>
            </div>
          ))}
        </dl>
      </footer>
    </div>
  );
}