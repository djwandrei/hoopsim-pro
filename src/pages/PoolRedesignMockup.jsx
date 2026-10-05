import React, { useState } from 'react';
import { Lock, Ban, GitCompare, Eye } from 'lucide-react';
import '@/pages/poolRedesignMockup.css';

// Temporary design mockup: three looks for the Lineup Lab player pool table.
// Sample data stands in for the live pool until a variant is chosen.

const SAMPLE = [
  { name: 'Larry Bird', detail: 'BOS · Forward', position: 'F', minutes: '36.3', points: '24.3', rebounds: '10.0', assists: '6.3', steals: '1.7', blocks: '0.9', turnovers: '2.9', actions: [true, false, true, false], avatar: null },
  { name: 'Magic Johnson', detail: 'LAL · Guard', position: 'G', minutes: '36.7', points: '19.6', rebounds: '7.3', assists: '11.4', steals: '1.9', blocks: '0.3', turnovers: '3.6', actions: [false, false, true, true], avatar: null },
  { name: 'Hakeem Olajuwon', detail: 'HOU · Center', position: 'C', minutes: '35.5', points: '21.9', rebounds: '11.2', assists: '2.5', steals: '1.7', blocks: '3.2', turnovers: '3.0', actions: [false, false, false, false], avatar: null },
  { name: 'Michael Jordan', detail: 'CHI · Guard', position: 'G', minutes: '38.3', points: '30.1', rebounds: '6.2', assists: '5.3', steals: '2.5', blocks: '0.9', turnovers: '2.7', actions: [false, false, false, false], avatar: null },
  { name: 'Dennis Rodman', detail: 'DET · Forward', position: 'F', minutes: '34.2', points: '8.7', rebounds: '13.0', assists: '2.0', steals: '0.7', blocks: '0.5', turnovers: '1.8', actions: [false, true, false, false], avatar: null },
  { name: 'John Stockton', detail: 'UTA · Guard', position: 'G', minutes: '33.7', points: '13.5', rebounds: '2.7', assists: '11.1', steals: '2.4', blocks: '0.2', turnovers: '2.8', actions: [false, false, false, false], avatar: null },
  { name: 'Charles Barkley', detail: 'PHX · Forward', position: 'F', minutes: '37.6', points: '23.1', rebounds: '11.5', assists: '4.3', steals: '1.6', blocks: '0.9', turnovers: '2.9', actions: [false, false, false, false], avatar: null },
];

const STAT_COLUMNS = [['minutes', 'MPG'], ['points', 'PTS'], ['rebounds', 'REB'], ['assists', 'AST'], ['steals', 'STL'], ['blocks', 'BLK'], ['turnovers', 'TOV']];
const ACTIONS = [['lock', 'Lock', Lock], ['ban', 'Exclude', Ban], ['compare', 'Compare', GitCompare], ['watch', 'Watch', Eye]];

const initials = name => name.split(' ').map(part => part[0]).slice(0, 2).join('');

function Avatar({ player, size = 'md' }) {
  return <span className={`mk-avatar mk-avatar--${size}`}>{initials(player.name)}</span>;
}

function ActionRow({ player, size = 'sm' }) {
  return <div className={`mk-actions mk-actions--${size}`}>
    {ACTIONS.map(([key, label, Icon], index) => <button key={key} type="button" className={`mk-action mk-action--${key} ${player.actions[index] ? 'is-on' : ''}`} aria-label={`${label} ${player.name}`} title={label}><Icon size={size === 'sm' ? 13 : 15} /></button>)}
  </div>;
}

/* Variant A — Player cards */
function CardsVariant() {
  return <div className="mk-cards">
    {SAMPLE.map(player => <div key={player.name} className="mk-card">
      <div className="mk-card__top">
        <Avatar player={player} />
        <div className="mk-card__id">
          <strong>{player.name}</strong>
          <span>{player.detail}</span>
        </div>
        <ActionRow player={player} />
      </div>
      <div className="mk-card__stats">
        {STAT_COLUMNS.map(([key, label]) => <span key={key} className={`mk-chip ${key === 'points' ? 'mk-chip--hero' : ''}`}><small>{label}</small>{player[key]}</span>)}
      </div>
    </div>)}
  </div>;
}

/* Variant B — Broadcast ledger */
function LedgerVariant() {
  return <div className="mk-ledger">
    <table className="mk-ledger__table">
      <thead><tr>
        <th>Player</th><th>Pos</th>
        {STAT_COLUMNS.map(([, label]) => <th key={label}>{label}</th>)}
        <th className="mk-ledger__actions-col">Calls</th>
      </tr></thead>
      <tbody>
        {SAMPLE.map(player => <tr key={player.name}>
          <td className="mk-ledger__name">
            <span className="mk-avatar mk-avatar--sm" aria-hidden="true">{initials(player.name)}</span>
            <span><strong>{player.name}</strong><small>{player.detail}</small></span>
          </td>
          <td><span className="mk-pos">{player.position}</span></td>
          {STAT_COLUMNS.map(([key]) => <td key={key} className={key === 'points' ? 'mk-lead-stat' : ''}>{player[key]}</td>)}
          <td className="mk-ledger__actions-col"><ActionRow player={player} size="xs" /></td>
        </tr>)}
      </tbody>
    </table>
  </div>;
}

/* Variant C — Hybrid: ledger alignment with card-style rows */
function HybridVariant() {
  return <div className="mk-hybrid">
    <div className="mk-hybrid__head">
      <span className="mk-hybrid__col mk-hybrid__col--id">Player</span>
      {STAT_COLUMNS.map(([key, label]) => <span key={key} className={`mk-hybrid__col mk-hybrid__col--stat ${key === 'points' ? 'is-lead' : ''}`}>{label}</span>)}
      <span className="mk-hybrid__col mk-hybrid__col--calls">Calls</span>
    </div>
    {SAMPLE.map(player => <div key={player.name} className="mk-hybrid__row">
      <div className="mk-hybrid__cell mk-hybrid__cell--id">
        <Avatar player={player} />
        <span><strong>{player.name}</strong><small>{player.detail}</small></span>
      </div>
      <div className="mk-hybrid__cell mk-hybrid__cell--stats">
        {STAT_COLUMNS.map(([key, label]) => <span key={key} className={`mk-stat ${key === 'points' ? 'mk-stat--hero' : ''}`}><small>{label}</small>{player[key]}</span>)}
      </div>
      <div className="mk-hybrid__cell mk-hybrid__cell--calls">
        <span className="mk-pos">{player.position}</span>
        <ActionRow player={player} size="xs" />
      </div>
    </div>)}
  </div>;
}

const VIEWS = [
  { key: 'cards', label: 'A · Player cards', node: <CardsVariant /> },
  { key: 'ledger', label: 'B · Broadcast ledger', node: <LedgerVariant /> },
  { key: 'hybrid', label: 'C · Hybrid', node: <HybridVariant /> },
];

export default function PoolRedesignMockup() {
  const [active, setActive] = useState('cards');
  const current = VIEWS.find(view => view.key === active);
  return <div className="mk-page">
    <header className="mk-header">
      <p className="court-kicker">Lineup Lab · Page 04 redesign</p>
      <h1 className="court-display text-3xl">Player pool — three looks</h1>
      <div className="mk-switch">
        {VIEWS.map(view => <button key={view.key} type="button" className={view.key === active ? 'is-active' : ''} onClick={() => setActive(view.key)}>{view.label}</button>)}
      </div>
    </header>
    {current?.node}
  </div>;
}