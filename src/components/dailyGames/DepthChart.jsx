import React from 'react';
import { Image } from '@/components/ui/image';
import { playerAsset, teamAsset } from '@/components/studio/teamAssets';
import { paletteForTeam, readableTeamInk } from '@/components/djhc/basketballPalettes';
import { useCourtTheme } from '@/components/djhc/CourtThemeProvider';
import { statDisplay, statNumber } from '@/lib/dailyGames/boardHydration';
import { roleOf, primaryRoles, sortLineup } from '@/components/dailyGames/lineupRoles';

const STAT_COLUMNS = [['MPG', 'minutes'], ['PPG', 'points'], ['RPG', 'rebounds'], ['APG', 'assists']];
const TOTAL_COLUMNS = [['PPG', 'points'], ['RPG', 'rebounds'], ['APG', 'assists']];

// Broadcast-style depth chart: one row per rotation slot, PG to C, with the
// removed starter flagged red, the replacement flagged gold, and every
// player's primary role called out.
export default function DepthChart({ lineup = [], removedPlayerRef = null, incomingPlayer = null, incomingLabel = 'Incoming' }) {
  const { mode } = useCourtTheme();
  const five = sortLineup(lineup.slice(0, 5));
  const totalsFrom = five.map(player => (player.playerRef === removedPlayerRef && incomingPlayer ? incomingPlayer : player));
  const totals = TOTAL_COLUMNS.map(([label, key]) => {
    const values = totalsFrom.map(player => statNumber(player, key)).filter(value => value !== null);
    return { label, value: values.length ? values.reduce((sum, value) => sum + value, 0) : null };
  });

  const rows = [];
  five.forEach((player, depth) => {
    const outgoing = player.playerRef === removedPlayerRef;
    rows.push({ key: player.playerRef, player, depth: depth + 1, outgoing, incoming: false });
    if (outgoing && incomingPlayer) {
      rows.push({ key: `incoming-${player.playerRef}`, player: incomingPlayer, depth: depth + 1, outgoing: false, incoming: true });
    }
  });

  return (
    <div className="dg-depth" role="group" aria-label="Depth chart of the starting five">
      <header className="dg-depth__head">
        <span className="bcast-kicker">Depth chart</span>
        <span className="dg-depth__legend">Rotation depth 1–5 · red = removing · gold = incoming</span>
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
        {rows.map(({ key, player, depth, outgoing, incoming }) => {
          const palette = paletteForTeam(player.teamCode);
          const ink = readableTeamInk(player.teamCode, mode);
          const logo = teamAsset(player.teamCode);
          const headshot = playerAsset(player.headshotPath || null);
          const initials = player.displayName.split(/\s+/).map(part => part[0]).join('').slice(0, 2);
          const role = primaryRoles(player, five)[0];
          const tone = outgoing ? 'out' : incoming ? 'in' : 'starter';
          return (
            <li
              key={key}
              className={`dg-depth__row ${outgoing ? 'is-outgoing' : ''} ${incoming ? 'is-incoming' : ''}`}
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
                  <span>{player.teamCode || '—'} · {(player.positions && player.positions.join('/')) || roleOf(player)} · Rotation #{depth}</span>
                </span>
                <span className="dg-depth__role">{role}</span>
              </span>
              <dl className="dg-depth__stats">
                {STAT_COLUMNS.map(([label, statKey]) => (
                  <div key={statKey} className="dg-depth__stat">
                    <dt>{label}</dt>
                    <dd>{statDisplay(statNumber(player, statKey))}</dd>
                  </div>
                ))}
              </dl>
              <span className={`dg-depth__flag dg-depth__flag--${tone}`}>
                {outgoing ? 'Removing' : incoming ? incomingLabel : 'Starter'}
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