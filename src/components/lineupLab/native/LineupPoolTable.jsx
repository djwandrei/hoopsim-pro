import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Lock, Ban, GitCompare, Eye, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, SlidersHorizontal } from 'lucide-react';
import { Image } from '@/components/ui/image';
import LineupPoolDossier from '@/components/lineupLab/native/LineupPoolDossier';
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
const SCALES = [['game', 'Per game'], ['36', 'Per 36'], ['100', 'Per 100']];
const SCALE_SUB = { game: 'per game', '36': 'per 36 min', '100': 'per 100 poss' };

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
  const [scale, setScale] = useState('game');
  const [drag, setDrag] = useState(0);
  const touchRef = useRef(null);
  const dragRef = useRef(0);
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

  // The loaded team and season, read live from the dataset strip — every
  // dossier card needs them to resolve the player's published season record.
  const [team, setTeam] = useState({ code: '', name: '', season: '', logo: null });
  useEffect(() => {
    const read = () => {
      const bodyCode = (document.body.dataset.courtContextTeam || '').trim().toUpperCase();
      const fallback = (document.getElementById('datasetTeamLogoFallback')?.textContent || '').trim().toUpperCase();
      const code = /^[A-Z]{2,4}$/.test(bodyCode) ? bodyCode : /^[A-Z]{2,4}$/.test(fallback) && fallback !== 'NBA' ? fallback : '';
      const rawName = (document.getElementById('datasetTeam')?.textContent || '').trim();
      const name = rawName && rawName !== '-' && !/\bteams?$/.test(rawName) ? rawName : '';
      const season = (document.getElementById('datasetSeason')?.textContent || '').trim();
      const logo = document.getElementById('datasetTeamLogo');
      const logoSrc = logo && !logo.hidden ? logo.getAttribute('src') : null;
      setTeam(current => (current.code === code && current.name === name && current.season === season && current.logo === logoSrc ? current : { code, name, season, logo: logoSrc }));
    };
    read();
    const observer = new MutationObserver(read);
    observer.observe(document.body, { attributes: true, attributeFilter: ['data-court-context-team'] });
    const strip = document.getElementById('datasetStrip');
    if (strip) observer.observe(strip, { childList: true, subtree: true, attributes: true, characterData: true });
    return () => observer.disconnect();
  }, []);

  // Scale-aware rate: the per-game value converted to per-36 minutes, or to
  // per-100 possessions estimated at league-average pace (~99 per 48 min).
  const rateOf = (row, key) => {
    const raw = parseFloat(row.stats.find(stat => stat.key === key)?.value);
    if (!Number.isFinite(raw)) return null;
    const minutes = parseFloat(row.stats.find(stat => stat.key === 'minutes')?.value);
    if (scale === 'game' || key === 'minutes' || !Number.isFinite(minutes) || minutes <= 0) return raw;
    if (scale === '36') return raw * 36 / minutes;
    return raw * 100 / (minutes * 2.06);
  };
  const displayOf = (row, key) => {
    if (scale === 'game' || key === 'minutes') return row.stats.find(stat => stat.key === key)?.value || '—';
    const rate = rateOf(row, key);
    return rate == null ? '—' : rate.toFixed(1);
  };

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const direction = sort.dir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      if (sort.key === 'name') return a.name.localeCompare(b.name) * direction;
      const value = row => { const parsed = rateOf(row, sort.key); return Number.isFinite(parsed) ? parsed : -Infinity; };
      return (value(a) - value(b)) * direction;
    });
  }, [rows, sort, scale]);

  const onSort = key => setSort(current => (current?.key === key ? { key, dir: current.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'name' ? 'asc' : 'desc' }));
  const onScale = key => { setScale(key); setCardIndex(0); };

  const toggleAction = (name, index) => {
    const row = [...(bodyRef.current?.children || [])]
      .find(candidate => clean(candidate.querySelector('.player-name strong')?.textContent) === name);
    const checkbox = row?.children[index + 9]?.querySelector('input[type="checkbox"]');
    if (checkbox) checkbox.click();
  };

  const openAdvanced = () => { setCardIndex(0); setView('advanced'); };
  const focusIndex = Math.min(cardIndex, Math.max(0, sorted.length - 1));
  const focus = sorted[focusIndex];

  const scaleBar = <div className="pool-scale-bar">
    <span className="pool-scale-bar__label"><SlidersHorizontal size={13} aria-hidden="true" /> Stat scale</span>
    <div className="pool-scale-switch" role="group" aria-label="Stat scale">
      {SCALES.map(([key, label]) => <button key={key} type="button" className={scale === key ? 'is-active' : ''} aria-pressed={scale === key} onClick={() => onScale(key)}>{label}</button>)}
    </div>

  </div>;

  const onTouchStart = event => { const touch = event.touches[0]; touchRef.current = { x: touch.clientX, y: touch.clientY }; dragRef.current = 0; };
  const onTouchMove = event => {
    if (!touchRef.current) return;
    const touch = event.touches[0];
    const dx = touch.clientX - touchRef.current.x;
    if (Math.abs(touch.clientY - touchRef.current.y) > Math.abs(dx)) return;
    dragRef.current = Math.max(-90, Math.min(90, dx));
    setDrag(dragRef.current);
  };
  const endTouch = () => {
    const dx = dragRef.current;
    touchRef.current = null;
    dragRef.current = 0;
    setDrag(0);
    if (dx <= -56 && focusIndex < sorted.length - 1) setCardIndex(focusIndex + 1);
    if (dx >= 56 && focusIndex > 0) setCardIndex(focusIndex - 1);
  };

  const calls = (row, size = '') => <div className={`pool-calls pool-calls--${size}`}>
    {ACTIONS.map(([key, label, Icon], index) => <button key={key} type="button" className={`pool-call pool-call--${key} ${row.actions[index] ? 'is-on' : ''}`} aria-pressed={row.actions[index]} aria-label={`${label} ${row.name}`} title={label} onClick={() => toggleAction(row.name, index)}><Icon size={size === 'lg' ? 15 : 13} /></button>)}
  </div>;

  const ledger = <div className="pool-ledger-shell">
    <p className="pool-scroll-hint" aria-hidden="true">Swipe the table sideways to see all columns</p>
    <div className="pool-ledger" tabIndex="0" role="region" aria-label="Player pool">
    <table className="pool-ledger__table">
      <thead><tr>
        <SortHead label="Player" sortKey="name" sort={sort} onSort={onSort} />
        <th scope="col">Pos</th>
        {STAT_COLUMNS.map(([key, label]) => <SortHead key={label} label={scale === 'game' || label === 'MPG' ? label : `${label}/${scale}`} sortKey={key} sort={sort} onSort={onSort} />)}
        <th scope="col" className="pool-ledger__calls-col">Calls</th>
      </tr></thead>
      <tbody>
        {sorted.map(row => <tr key={row.name} className={`${row.locked ? 'is-locked' : ''} ${row.muted ? 'is-excluded' : ''}`}>
          <td className="pool-ledger__name">
            <span className="pool-avatar pool-avatar--sm" aria-hidden="true">{row.avatar ? <Image src={row.avatar} fittingType="fit" className="pool-avatar__image" alt="" /> : initials(row.name)}</span>
            <span className="pool-ledger__id"><strong>{row.name}</strong><small>{row.detail}</small></span>
          </td>
          <td><span className="pool-pos">{row.position || '—'}</span></td>
          {row.stats.map(stat => <td key={stat.key} className={stat.key === 'points' ? 'pool-lead-stat' : ''}>{displayOf(row, stat.key)}</td>)}
          <td className="pool-ledger__calls-col">{calls(row)}</td>
        </tr>)}
        {!sorted.length && <tr className="pool-ledger__empty"><td colSpan={11}>Load a team and season to see the player pool.</td></tr>}
      </tbody>
    </table>
    </div>
  </div>;

  const advanced = !focus ? <div className="pool-cards-empty">Load a team and season to browse player cards.</div> : <div className="pool-card-stage" aria-label="Player card carousel">
    <div className={`pool-card ${drag ? 'is-dragging' : ''}`} style={drag ? { transform: `translateX(${drag}px)` } : undefined} onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={endTouch} onTouchCancel={endTouch}>
      <LineupPoolDossier
        row={focus}
        team={team}
        strip={STRIP.map(([key, label]) => [label, displayOf(focus, key), SCALE_SUB[scale]])}
        actions={calls(focus, 'lg')}
        pager={<span className="pool-card__count">{focusIndex + 1} of {sorted.length}</span>}
      />
    </div>
    <div className="pool-card-nav">
      <button type="button" aria-label="Previous player" disabled={focusIndex === 0} onClick={() => setCardIndex(focusIndex - 1)}><ChevronLeft size={16} /></button>
      <button type="button" aria-label="Next player" disabled={focusIndex >= sorted.length - 1} onClick={() => setCardIndex(focusIndex + 1)}><ChevronRight size={16} /></button>
      <span className="pool-card-hint" aria-hidden="true">Swipe to browse</span>
    </div>
  </div>;

  return <div className="pool-table-view">
    {view === 'ledger' ? <>{scaleBar}{ledger}</> : <>{scaleBar}{advanced}</>}
  </div>;
}