import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Lock, Ban, GitCompare, Eye, ChevronUp, ChevronDown } from 'lucide-react';
import { Image } from '@/components/ui/image';

// React-rendered player pool table. The site controller keeps owning the
// data and the hidden source table; this mirror extracts its rows, renders
// them with full design control, and bridges every toggle/sort back to the
// original inputs, so the optimizer stays wired exactly as before.

const STAT_COLUMNS = [['minutes', 'MPG'], ['points', 'PTS'], ['rebounds', 'REB'], ['assists', 'AST'], ['steals', 'STL'], ['blocks', 'BLK'], ['turnovers', 'TOV']];
const ACTIONS = [['lock', 'Lock', Lock], ['ban', 'Exclude', Ban], ['compare', 'Compare', GitCompare], ['watch', 'Watch', Eye]];

const clean = text => (text || '').replace(/\s+/g, ' ').trim();

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
    <button type="button" className="player-table-sort" onClick={() => onSort(sortKey)}>
      <span>{label}</span>
      {active && (sort.dir === 'asc' ? <ChevronUp size={11} /> : <ChevronDown size={11} />)}
    </button>
  </th>;
}

export default function LineupPoolTable() {
  const [rows, setRows] = useState([]);
  const [sort, setSort] = useState(null);
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

  return <div className="table-wrap player-table-wrap" tabIndex="0" role="region" aria-label="Player pool">
    <table className="player-table">
      <thead><tr>
        <SortHead label="Player" sortKey="name" sort={sort} onSort={onSort} />
        <th scope="col">Position</th>
        {STAT_COLUMNS.map(([key, label]) => <SortHead key={key} label={label} sortKey={key} sort={sort} onSort={onSort} />)}
        {ACTIONS.map(([, label]) => <th key={label} scope="col">{label}</th>)}
      </tr></thead>
      <tbody>
        {sorted.map(row => <tr key={row.name} className={`${row.locked ? 'is-locked' : ''} ${row.muted ? 'is-excluded' : ''}`}>
          <td>
            <span className="player-name__identity">
              <span className="player-avatar">
                {row.avatar && <Image src={row.avatar} fittingType="fit" className="player-avatar__image is-loaded" alt="" />}
                {!row.avatar && row.name.split(' ').map(part => part[0]).slice(0, 2).join('')}
              </span>
              <span className="player-name"><strong>{row.name}</strong>{row.detail && <small>{row.detail}</small>}</span>
            </span>
          </td>
          <td>{row.position || '—'}</td>
          {row.stats.map(stat => <td key={stat.key}>{stat.value || '—'}</td>)}
          {row.actions.map((checked, index) => {
            const [key, label, Icon] = ACTIONS[index];
            return <td key={key}>
              <button type="button" className={`pool-toggle is-${key} ${checked ? 'is-on' : ''}`} aria-pressed={checked} aria-label={`${label} ${row.name}`} title={label} onClick={() => toggleAction(row.name, index)}><Icon size={13} /></button>
            </td>;
          })}
        </tr>)}
      </tbody>
    </table>
  </div>;
}