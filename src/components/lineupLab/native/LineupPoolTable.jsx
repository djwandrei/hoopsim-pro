import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Lock, Ban, GitCompare, Eye, ChevronUp, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { Image } from '@/components/ui/image';
import '@/components/lineupLab/native/poolTable.css';

// React-rendered player pool table. The site controller keeps owning the
// data and the hidden source table; this mirror extracts its rows, renders
// them with full design control, and bridges every toggle/sort back to the
// original inputs, so the optimizer stays wired exactly as before.
// Two looks: the broadcast ledger (default) and an advanced player-card
// carousel styled after the SwishIQ Studio player dossier profile.

const STAT_COLUMNS = [['minutes', 'MPG'], ['points', 'PTS'], ['rebounds', 'REB'], ['assists', 'AST'], ['steals', 'STL'], ['blocks', 'BLK'], ['turnovers', 'TOV']];
const ACTIONS = [['lock', 'Lock', Lock], ['ban', 'Exclude', Ban], ['compare', 'Compare', GitCompare], ['watch', 'Watch', Eye]];
const STRIP = [['points', 'PPG'], ['rebounds', 'RPG'], ['assists', 'APG']];

const clean = text => (text || '').replace(/\s+/g, ' ').trim();
const initials = name => name.split(' ').map(part => part[0]).slice(0, 2).join('');

function extractRows(body) {
  return [...body.querySelectorAll('tr')].map(tr => {
    const cells = tr.children;
    const nameNode = tr.querySelector('.player-name strong');
    return {
      name: clean(nameNode?.textContent),
      detail: clean(tr.querySelector('.player-name small')?.textContent),
      position: clean(cells[1]?.textContent),
      avatar: tr.querySelector('img')?.getAttribute('src') || null,
      stats: STAT_COLUMNS.map(([key, label], index) => ({ key, label, value: clean(cells[index + 2]?.textContent) })),
      actions: ACTIONS.map((_, index) => Boolean(cells[index + 9]?.querySelector('input[type="checkbox"]')?.checked)),
      locked: tr.classList.contains('is-locked'),
      muted: tr.classList.contains('is-excluded') || tr.classList.contains('is-ineligible'),
    };
  }).filter(row => row.name);
}

function SortHead({ label, sortKey, sort, onSort }) {
  const active = sort?.key === sortKey;
  return <th scope="col">
    <button type="button" className="pool-sort" onClick={() => onSort(sortKey)}>
      <span>{label}</span>
      {active && (sort.dir === 'asc' ? <ChevronUp size={11} /> : <ChevronDown size={11} />)}
    </button>
  </th>;
}

export default function LineupPoolTable() {
  const [rows, setRows] = useState([]);
  const [sort, setSort] = useState(null);
  const [view, setView] = useState('ledger');
  const [cardIndex, setCardIndex] = useState(0);
  const bodyRef = useRef(null);
  const signatureRef = useRef('');

  useEffect(() => {
    let observer = null;
    let timer = null;
    const applyRows = body => {
      const next = extractRows(body);
      const signature = next.map(row => [row.name, row.position, row.detail, ...row.stats.map(stat => stat.value), ...row.actions, row.locked, row.muted].join('|')).join('#');
      if (signatureRef.current === signature) return;
      signatureRef.current = signature;
      setRows(next);
    };
    const attach = () => {
      const body = document.getElementById('playerTableBody');
      if (!body) { timer = setTimeout(attach, 250); return; }
      bodyRef.current = body;
      applyRows(body);
      observer = new MutationObserver(() => applyRows(body));
      observer.observe(body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    };
    attach();
    return () => { clearTimeout(timer); observer?.disconnect(); };
  }, []);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const direction = sort.dir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      if (sort.key === 'name') return a.name.localeCompare(b.name) * direction;
      const value = row => { const parsed = parseFloat(row.stats.find(stat => stat.key === sort.key)?.value); return Number.isFinite(parsed) ? parsed : -Infinity; };
      return (value(a) - value(b)) * direction;
    });
  }, [rows, sort]);

  const onSort = key => setSort(current => (current?.key === key ? { key, dir: current.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'name' ? 'asc' : 'desc' }));

  const toggleAction = (name, index) => {
    const row = [...(bodyRef.current?.children || [])]
      .find(candidate => clean(candidate.querySelector('.player-name strong')?.textContent) === name);
    const checkbox = row?.children[index + 9]?.querySelector('input[type="checkbox"]');
    if (checkbox) checkbox.click();
  };

  const openAdvanced = () => { setCardIndex(0); setView('advanced'); };
  const focusIndex = Math.min(cardIndex, Math.max(0, sorted.length - 1));
  const focus = sorted[focusIndex];
  const statOf = (row, key) => row?.stats.find(stat => stat.key === key)?.value || '—';

  const calls = (row, size = '') => <div className={`pool-calls pool-calls--${size}`}>
    {ACTIONS.map(([key, label, Icon], index) => <button key={key} type="button" className={`pool-call pool-call--${key} ${row.actions[index] ? 'is-on' : ''}`} aria-pressed={row.actions[index]} aria-label={`${label} ${row.name}`} title={label} onClick={() => toggleAction(row.name, index)}><Icon size={size === 'lg' ? 15 : 13} /></button>)}
  </div>;

  const ledger = <div className="pool-ledger" tabIndex="0" role="region" aria-label="Player pool">
    <table className="pool-ledger__table">
      <thead><tr>
        <SortHead label="Player" sortKey="name" sort={sort} onSort={onSort} />
        <th scope="col">Pos</th>
        {STAT_COLUMNS.map(([, label]) => <th key={label}>{label}</th>)}
        <th scope="col" className="pool-ledger__calls-col">Calls</th>
      </tr></thead>
      <tbody>
        {sorted.map(row => <tr key={row.name} className={`${row.locked ? 'is-locked' : ''} ${row.muted ? 'is-excluded' : ''}`}>
          <td className="pool-ledger__name">
            <span className="pool-avatar pool-avatar--sm" aria-hidden="true">{row.avatar ? <Image src={row.avatar} fittingType="fit" className="pool-avatar__image" alt="" /> : initials(row.name)}</span>
            <span className="pool-ledger__id"><strong>{row.name}</strong><small>{row.detail}</small></span>
          </td>
          <td><span className="pool-pos">{row.position || '—'}</span></td>
          {row.stats.map(stat => <td key={stat.key} className={stat.key === 'points' ? 'pool-lead-stat' : ''}>{stat.value || '—'}</td>)}
          <td className="pool-ledger__calls-col">{calls(row)}</td>
        </tr>)}
        {!sorted.length && <tr className="pool-ledger__empty"><td colSpan={11}>Load a team and season to see the player pool.</td></tr>}
      </tbody>
    </table>
  </div>;

  const advanced = !focus ? <div className="pool-cards-empty">Load a team and season to browse player cards.</div> : <div className="pool-card-stage" aria-label="Player card carousel">
    <div className="pool-card">
      <div className="pool-card__band">
        <span className="bcast-lowerthird"><span className="bcast-lowerthird__bar" aria-hidden="true"></span>Player profile</span>
        <div className="pool-card__id">
          <span className="pool-avatar pool-avatar--lg" aria-hidden="true">{focus.avatar ? <Image src={focus.avatar} fittingType="fit" className="pool-avatar__image" alt="" /> : initials(focus.name)}</span>
          <div className="pool-card__identity">
            <h3>{focus.name}</h3>
            <span className="hero-rule" aria-hidden="true"></span>
            <p>{focus.detail || focus.position || '—'}</p>
          </div>
          <span className="pool-pos pool-pos--lg">{focus.position || '—'}</span>
          {(focus.locked || focus.muted) && <span className={`pool-flag ${focus.locked ? 'pool-flag--lock' : 'pool-flag--muted'}`}>{focus.locked ? 'Locked' : 'Excluded'}</span>}
        </div>
      </div>
      <div className="pool-card__strip">
        {STRIP.map(([key, label]) => <div key={key} className="pool-card__strip-cell"><p>{label}</p><p className="pool-card__strip-value">{statOf(focus, key)}</p><p>per game</p></div>)}
      </div>
      <div className="pool-card__grid">
        {['minutes', 'steals', 'blocks', 'turnovers'].map(key => <div key={key} className="pool-card__grid-cell"><p>{statOf(focus, key)}</p><small>{STAT_COLUMNS.find(([statKey]) => statKey === key)[1]}</small></div>)}
      </div>
      <div className="pool-card__foot">
        {calls(focus, 'lg')}
        <span className="pool-card__count">{focusIndex + 1} of {sorted.length}</span>
      </div>
    </div>
    <div className="pool-card-nav">
      <button type="button" aria-label="Previous player" disabled={focusIndex === 0} onClick={() => setCardIndex(focusIndex - 1)}><ChevronLeft size={16} /></button>
      <button type="button" aria-label="Next player" disabled={focusIndex >= sorted.length - 1} onClick={() => setCardIndex(focusIndex + 1)}><ChevronRight size={16} /></button>
    </div>
  </div>;

  return <div className="pool-table-view">
    <div className="pool-view-switch" role="group" aria-label="Pool table view">
      <button type="button" className={view === 'ledger' ? 'is-active' : ''} aria-pressed={view === 'ledger'} onClick={() => setView('ledger')}>Ledger</button>
      <button type="button" className={view === 'advanced' ? 'is-active' : ''} aria-pressed={view === 'advanced'} onClick={openAdvanced}>Player cards</button>
    </div>
    {view === 'ledger' ? ledger : advanced}
  </div>;
}