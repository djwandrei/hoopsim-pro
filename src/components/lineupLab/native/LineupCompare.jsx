import React, { useEffect, useRef, useState } from 'react';
import { GitCompare } from 'lucide-react';
import { Image } from '@/components/ui/image';
import CourtArt from '@/components/lineupLab/native/CourtArt';
import '@/components/lineupLab/native/lineupCompare.css';

// Native player comparison in the SwishIQ Studio blueprint's compare design.
// The site controller keeps owning the math: it renders the comparison into
// the hidden #compareContent whenever the Compare checkboxes change, and this
// mirror re-renders that content — profile cards per player, then a
// side-by-side stat table where every cell pairs the value with its pool
// percentile bar and the row leader reads in gold.

const SLOTS = ['A', 'B', 'C', 'D'];
const FALLBACK_EMPTY = {
  heading: 'Head-to-head comparison',
  copy: 'Tick Compare on two to four players in the ledger above to chart them side by side.',
};

const clean = text => (text || '').replace(/\s+/g, ' ').trim();
const initials = name => name.split(' ').map(part => part[0]).slice(0, 2).join('');

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

export default function LineupCompare() {
  const [data, setData] = useState(null);
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

  if (!data) return null;

  const leaderForRow = row => {
    let best = 0, pick = -1, tie = false;
    row.lines.forEach((line, index) => {
      const pct = line.pct || 0;
      if (pct > best) { best = pct; pick = index; tie = false; }
      else if (pct === best && best > 0) tie = true;
    });
    return best > 0 && !tie ? pick : -1;
  };

  return <section className="cmp-panel court-panel" aria-label="Player comparison">
    <header className="cmp-header">
      <CourtArt className="cmp-court" />
      <div className="cmp-header__copy">
        <p className="cmp-kicker">Player comparison</p>
        <h3 className="cmp-title">Head-to-head stat comparison</h3>
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
                </tr></thead>
                <tbody>
                  {data.rows.map((row, rowIndex) => {
                    const leader = leaderForRow(row);
                    return <tr key={rowIndex}>
                      <th scope="row">{row.label}</th>
                      {row.lines.map((line, index) => <td key={index} className={leader === index ? 'cmp-leader' : ''} style={{ '--cmp-color': line.color || data.players[index]?.color }}>
                        <span className="cmp-cell">
                          <span className="cmp-cell-value">{line.value}</span>
                          <span className="cmp-track"><span style={{ width: `${Math.max(2, line.pct || 0)}%` }} /></span>
                          <span className="cmp-cell-pct">{line.pct ? `${Math.round(line.pct)}th pctile` : 'n/a'}</span>
                        </span>
                      </td>)}
                    </tr>;
                  })}
                </tbody>
              </table>
            </div>
            {data.note && <p className="cmp-note">{data.note}</p>}
          </>}
    </div>
  </section>;
}