import React from 'react';
import { teamAsset } from '@/components/studio/teamAssets';
import { paletteForTeam } from '@/components/djhc/basketballPalettes';

const COLUMNS = [['MIN', 'min'], ['PTS', 'pts'], ['REB', 'reb'], ['AST', 'ast'], ['STL', 'stl'], ['BLK', 'blk']];
const LEADER_KEYS = ['pts', 'reb', 'ast'];

// Broadcast-styled box score: team-colored header, per-column leader
// highlighting, team totals footer, and a shooting summary strip.
export default function BoxScore({ title, code = '', box, teamStats, teamPoints }) {
  const lines = box?.lines || [];
  const logo = teamAsset(code);
  const palette = paletteForTeam(code);
  const leaders = {};
  for (const key of LEADER_KEYS) leaders[key] = Math.max(0, ...lines.map(line => line[key] || 0));
  const round = value => Math.round(Number(value) || 0);
  return (
    <div className="dg-box" style={{ '--dg-team': palette?.primary }}>
      <header className="dg-box__head">
        {logo && <img className="dg-box__logo" src={logo} alt="" />}
        <span className="dg-box__title">{title}</span>
        {teamPoints != null && <span className="dg-box__pts">{teamPoints} PTS</span>}
      </header>
      <div className="dg-box__scroll">
        <table>
          <thead>
            <tr>
              <th>Player</th>
              {COLUMNS.map(([label]) => <th key={label}>{label}</th>)}
            </tr>
          </thead>
          <tbody>
            {lines.map(line => (
              <tr key={line.name}>
                <td>
                  {line.name}
                  {Array.isArray(line.positions) && line.positions.length > 0 &&
                    <span className="dg-box__pos">{line.positions.join('/')}</span>}
                </td>
                {COLUMNS.map(([, key]) => (
                  <td key={key} className={line[key] === leaders[key] && leaders[key] > 0 ? 'dg-box__lead' : undefined}>
                    {line[key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          {teamStats && (
            <tfoot>
              <tr>
                <td>Team</td>
                <td>240</td>
                <td>{teamPoints ?? '—'}</td>
                <td>{teamStats.reb ?? '—'}</td>
                <td>{teamStats.ast ?? '—'}</td>
                <td>{teamStats.stl ?? '—'}</td>
                <td>{teamStats.blk ?? '—'}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {teamStats && (
        <footer className="dg-box__strip">
          <span>FG <b>{round(teamStats.fgm)}–{round(teamStats.fga)}</b></span>
          <span>FT <b>{round(teamStats.ftm)}–{round(teamStats.fta)}</b></span>
          <span>eFG <b>{(Math.round((teamStats.efg || 0) * 1000) / 10).toFixed(1)}%</b></span>
          <span>TOV <b>{round(teamStats.tov)}</b></span>
        </footer>
      )}
    </div>
  );
}