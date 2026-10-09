import React, { useEffect, useRef, useState } from 'react';
import { Crown, GitCompare } from 'lucide-react';
import { Image } from '@/components/ui/image';
import CourtArt from '@/components/lineupLab/native/CourtArt';
import '@/components/lineupLab/native/lineupCompare.css';

// Native player comparison for the pool stage. The site controller keeps
// owning the comparison math (it renders the hidden #compareContent); this
// mirror re-renders it as a head-to-head table: per-player leader badges and
// gap-to-leader chips, plus a per-row difference meter that plots every
// player between the row's best and worst mark. A scale switch converts the
// raw per-game lines to per-36 minutes or estimated per-100 possessions
// (same math the ledger uses); player minutes are read from the pool table.

const SLOTS = ['A', 'B', 'C', 'D'];
const FALLBACK_EMPTY = {
  heading: 'Head-to-head comparison',
  copy: 'Tick Compare on two to four players in the ledger above to chart them side by side.',
};
const SCALES = [['game', 'Raw', 'per game'], ['36', 'Per 36', 'per 36 min'], ['100', 'Per 100', 'per 100 poss']];
const LOWER_IS_BETTER = /TOV|turnover/i;
const isMinutesRow = label => /\bMPG\b|minutes|\bMIN\b/i.test(label);

import { clean } from '@/lineupLab/lineup-lab/domText';
const initials = name => name.split(' ').map(part => part[0]).slice(0, 2).join('');
const num = text => {
  const parsed = parseFloat(String(text ?? '').replace(/[^0-9.+-]/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
};

function extractCompare(source) {
  if (!source.children.length) return null;
  const empty = source.querySelector('.empty-state');
  if (empty) {
    return {
      empty: true,
      heading: clean(empty.querySelector('h3')?.textContent) || FALLBACK_EMPTY.heading,
      copy: clean(empty.querySelector('p')?.textContent) || FALLBACK_EMPTY.copy,
    };
  }
  const players = [...source.querySelectorAll('.compare-legend > span')].map((item, index) => {
    const avatar = item.querySelector('img')?.getAttribute('src') || null;
    return {
      slot: SLOTS[index] || String(index + 1),
      name: clean(item.lastChild?.textContent) || `Player ${SLOTS[index]}`,
      color: item.querySelector('i')?.style?.background || '',
      avatar,
      initials: clean(item.querySelector('.compare-legend__avatar__fallback')?.textContent) || initials(clean(item.lastChild?.textContent) || '?'),
    };
  });
  const rows = [...source.querySelectorAll('.compare-bars > .compare-row')].map(row => ({
    label: clean(row.querySelector('strong')?.textContent),
    lines: [...row.querySelectorAll('.compare-player-line')].map(line => {
      const bar = line.querySelector('.compare-player-bar');
      return {
        pct: parseFloat(bar?.style?.width) || 0,
        color: bar?.style?.background || '',
        value: clean(line.querySelector('.compare-player-value')?.textContent) || '—',
      };
    }),
  }));
  if (!players.length || !rows.length) return null;
  return {
    empty: false,
    players,
    rows,
    note: clean(source.querySelector('.compare-pool-note')?.textContent),
  };
}

const Avatar = ({ src, text, className }) => src
  ? <Image src={src} fittingType="fit" className={className} alt="" />
  : <span>{text}</span>;

function HeadCell({ player }) {
  return <span className="cmp-head">
    <span className="cmp-head__avatar"><Avatar src={player.avatar} text={player.initials} /></span>
    <span className="cmp-head__name">{player.name}</span>
  </span>;
}

const scaleValue = (base, minutes, scale) => {
  if (base == null) return null;
  if (scale === 'game') return base;
  if (!Number.isFinite(minutes) || minutes <= 0) return null;
  if (scale === '36') return base * 36 / minutes;
  return base * 100 / (minutes * 2.06);
};

export default function LineupCompare() {
  const [data, setData] = useState(null);
  const [minutes, setMinutes] = useState({});
  const [scale, setScale] = useState('game');
  const signatureRef = useRef('');

  useEffect(() => {
    let observer = null;
    let timer = null;
    const sync = () => {
      const source = document.getElementById('compareContent');
      if (!source) return;
      const next = extractCompare(source);
      const signature = next ? JSON.stringify(next) : '';
      if (signatureRef.current === signature) return;
      signatureRef.current = signature;
      setData(next);
    };
    const attach = () => {
      const source = document.getElementById('compareContent');
      if (!source) { timer = setTimeout(attach, 250); return; }
      observer = new MutationObserver(sync);
      observer.observe(source, { childList: true, subtree: true, attributes: true });
      sync();
    };
    attach();
    return () => { clearTimeout(timer); observer?.disconnect(); };
  }, []);

  // Per-player minutes, read live from the hidden pool table so the scale
  // switch can convert the comparison to per-36 and per-100 rates.
  useEffect(() => {
    let observer = null;
    let timer = null;
    const apply = body => {
      const next = {};
      [...body.querySelectorAll('tr')].forEach(tr => {
        const name = clean(tr.querySelector('.player-name strong')?.textContent);
        const value = num(tr.children[2]?.textContent);
        if (name && value != null) next[name] = value;
      });
      setMinutes(current => (JSON.stringify(current) === JSON.stringify(next) ? current : next));
    };
    const attach = () => {
      const body = document.getElementById('playerTableBody');
      if (!body) { timer = setTimeout(attach, 250); return; }
      apply(body);
      observer = new MutationObserver(() => apply(body));
      observer.observe(body, { childList: true, subtree: true, attributes: true });
    };
    attach();
    return () => { clearTimeout(timer); observer?.disconnect(); };
  }, []);

  if (!data) return null;

  const scaleReady = !data.empty && Array.isArray(data.players) && data.players.every(player => minutes[player.name] != null);
  const scaleBar = <div className="cmp-scale" role="group" aria-label="Comparison stat scale">
    {SCALES.map(([key, label, sub]) => <button key={key} type="button" className={scale === key ? 'is-active' : ''} disabled={key !== 'game' && !scaleReady} title={key !== 'game' && !scaleReady ? 'Load the roster to convert rates' : sub} aria-pressed={scale === key} onClick={() => setScale(key)}>{label}</button>)}
  </div>;

  // The controller intentionally emits an empty-state object until two
  // players are selected. Keep the derived table empty for that shape; the
  // empty-state branch below still renders the useful guidance copy.
  const rows = data.empty || !Array.isArray(data.rows) ? [] : data.rows.map(row => {
    const fixed = isMinutesRow(row.label);
    const lines = row.lines.map((line, index) => {
      const base = num(line.value);
      const value = fixed && scale !== 'game' ? base : scaleValue(base, minutes[data.players[index]?.name], scale);
      return { ...line, raw: line.value, base, value };
    });
    const numeric = lines.map((line, index) => ({ index, v: line.value })).filter(entry => entry.v != null);
    let leaderValue = null;
    if (numeric.length) {
      const values = numeric.map(entry => entry.v);
      leaderValue = LOWER_IS_BETTER.test(row.label) ? Math.min(...values) : Math.max(...values);
    }
    const leaders = numeric.filter(entry => Math.abs(entry.v - leaderValue) < 1e-9).map(entry => entry.index);
    const distinct = [...new Set(numeric.map(entry => entry.v))].sort((a, b) => b - a);
    const gap = distinct.length > 1 ? Math.abs(distinct[0] - distinct[1]) : null;
    const span = distinct.length > 1 ? distinct[0] - distinct[distinct.length - 1] : 0;
    const dots = span > 0 ? numeric.map(entry => ({
      index: entry.index,
      pos: 6 + (LOWER_IS_BETTER.test(row.label) ? (distinct[0] - entry.v) : (entry.v - distinct[distinct.length - 1])) / span * 88,
    })) : [];
    return { ...row, fixed, lines, leaders, gap, dots };
  });

  return <section className="cmp-panel court-panel" aria-label="Player comparison">
    <header className="cmp-header">
      <CourtArt className="cmp-court" />
      <div className="cmp-header__copy cmp-head-row">
        <div>
          <p className="cmp-kicker">Player comparison</p>
          <h3 className="cmp-title">Head-to-head stat comparison</h3>
        </div>
        {!data.empty && scaleBar}
      </div>
    </header>
    <div className="cmp-body">
      {data.empty
        ? <div className="cmp-empty">
            <span className="cmp-empty__icon"><GitCompare size={22} aria-hidden="true" /></span>
            <p className="cmp-empty__title">{data.heading}</p>
            <p className="cmp-empty__copy">{data.copy}</p>
          </div>
        : <>
            <div className="cmp-cards">
              {data.players.map((player, index) => <article key={index} className="cmp-card" style={{ '--cmp-color': player.color }}>
                <span className="cmp-card__chip">Player {player.slot}</span>
                <span className="cmp-card__id">
                  <span className="cmp-card__avatar"><Avatar src={player.avatar} text={player.initials} /></span>
                  <span className="cmp-card__name">{player.name}</span>
                </span>
              </article>)}
            </div>
            <p className="cmp-scroll-hint" aria-hidden="true">Swipe the table sideways to see all columns</p>
            <div className="cmp-table-wrap" tabIndex="0" role="region" aria-label="Head-to-head stat comparison">
              <table className="cmp-table">
                <thead><tr>
                  <th scope="col">Stat</th>
                  {data.players.map((player, index) => <th key={index} scope="col"><HeadCell player={player} /></th>)}
                  <th scope="col" className="cmp-gap-col">Difference</th>
                </tr></thead>
                <tbody>
                  {rows.map((row, rowIndex) => <tr key={rowIndex}>
                    <th scope="row">{row.label}</th>
                    {row.lines.map((line, index) => {
                      const leading = row.leaders.includes(index);
                      const behind = !leading && line.value != null && row.leaders.length ? Math.abs(line.value - row.lines[row.leaders[0]].value) : null;
                      return <td key={index} className={leading ? 'cmp-leader' : ''} style={{ '--cmp-color': line.color || data.players[index]?.color }}>
                        <span className="cmp-cell">
                          <span className="cmp-value">{row.fixed && scale !== 'game' ? line.raw : scale === 'game' ? line.raw : line.value != null ? line.value.toFixed(1) : '—'}</span>
                          {row.fixed && scale !== 'game'
                            ? null
                            : leading
                              ? <span className="cmp-lead-chip">{row.leaders.length > 1 ? 'Tied lead' : <><Crown size={10} aria-hidden="true" /> Leads</>}</span>
                              : behind != null && <span className="cmp-delta" title={`${behind.toFixed(1)} behind the leader`}>−{behind.toFixed(1)}</span>}
                          {scale === 'game' && !row.fixed && line.pct ? <span className="cmp-pct">{Math.round(line.pct)}th pctile</span> : null}
                        </span>
                      </td>;
                    })}
                    <td className="cmp-gap-cell">
                      {row.fixed && scale !== 'game'
                        ? <span className="cmp-gap__na">—</span>
                        : row.gap != null
                          ? <span className="cmp-gap">
                              <span className="cmp-gap__delta">+{row.gap.toFixed(1)}</span>
                              <span className="cmp-gap__sub">{row.leaders.length > 1 ? 'tied at the top' : LOWER_IS_BETTER.test(row.label) ? 'fewest vs next' : 'top vs next'}</span>
                              {row.dots.length > 1 && <span className="cmp-dots" aria-hidden="true">
                                <span className="cmp-dots__track" />
                                {row.dots.map(dot => <span key={dot.index} className={`cmp-dot${row.leaders.includes(dot.index) ? ' is-lead' : ''}`} style={{ left: `${dot.pos}%`, '--cmp-color': row.lines[dot.index].color || data.players[dot.index]?.color }} title={data.players[dot.index]?.name} />)}
                              </span>}
                            </span>
                          : <span className="cmp-gap__na">—</span>}
                    </td>
                  </tr>)}
                </tbody>
              </table>
            </div>
            {scale !== 'game' && <p className="cmp-scale-note">Rates converted from the raw per-game lines — per-36 divides by each player's minutes, per-100 estimates possessions at a league-average pace, exactly like the ledger above.</p>}
            {data.note && <p className="cmp-note">{data.note}</p>}
          </>}
    </div>
  </section>;
}
