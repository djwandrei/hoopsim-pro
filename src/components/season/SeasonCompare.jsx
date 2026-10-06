import React, { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { loadSeasonSource, AVAILABLE_YEARS } from '@/lib/season/dataClient';
import { buildLeague } from '@/lib/season/simEngine';
import { actualRecordsFrom } from '@/lib/season/seasonRecords';

const seasonLabel = value => `${value}–${String(value + 1).slice(2)}`;

function ConferenceTable({ conference, rows, focusCode, onFocusChange }) {
  return (
    <div>
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--myna-accent)]">{conference} CONFERENCE</p>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-[9px] uppercase tracking-[0.14em] text-[var(--myna-muted)]">
            <th className="py-1.5 font-semibold">Team</th>
            <th className="py-1.5 text-right font-semibold">W</th>
            <th className="py-1.5 text-right font-semibold">L</th>
            <th className="py-1.5 text-right font-semibold">PCT</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ team, rec }) => (
            <tr key={team.code} className={`border-t border-[var(--myna-border)]/40 ${team.code === focusCode ? 'bg-[var(--myna-accent)]/10' : ''}`}>
              <td className="py-1.5">
                <button type="button" onClick={() => onFocusChange?.(team.code)} className="text-left text-[11px] font-medium text-[var(--myna-text)] transition-colors hover:text-[var(--myna-accent)]">{team.name}</button>
              </td>
              <td className="py-1.5 text-right myna-mono">{rec.w}</td>
              <td className="py-1.5 text-right myna-mono">{rec.l}</td>
              <td className="py-1.5 text-right myna-mono text-[var(--myna-muted)]">{(rec.w + rec.l ? rec.w / (rec.w + rec.l) : 0).toFixed(3).slice(1)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SeasonColumn({ title, seasonValue, years, onValueChange, data, focusCode, onFocusChange }) {
  return (
    <div className="myna-panel p-4">
      <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--myna-muted)]">{title}</p>
          <p className="myna-display text-xl">{seasonLabel(seasonValue)}</p>
        </div>
        {onValueChange && (
          <select
            value={seasonValue}
            onChange={event => onValueChange(Number(event.target.value))}
            className="min-h-9 rounded-lg bg-[var(--myna-raised)] px-2 text-[11px] font-semibold tracking-[0.1em] text-[var(--myna-text)]"
            aria-label="Season to compare against"
          >
            {years.map(item => <option key={item} value={item}>{seasonLabel(item)}</option>)}
          </select>
        )}
      </header>
      {!data.league ? (
        <p className="flex items-center gap-2 py-8 text-xs text-[var(--myna-muted)]"><Loader2 className="h-4 w-4 animate-spin" />Loading {seasonLabel(seasonValue)}…</p>
      ) : data.error ? (
        <p className="py-8 text-xs text-trim-ink">{data.error}</p>
      ) : (
        <div className="grid gap-4">
          {['EAST', 'WEST'].map(conference => {
            const rows = data.league.teams
              .filter(team => team.conference === conference)
              .map(team => ({ team, rec: data.records.get(team.code) || { w: 0, l: 0 } }))
              .sort((x, y) => y.rec.w - x.rec.w);
            return <ConferenceTable key={conference} conference={conference} rows={rows} focusCode={focusCode} onFocusChange={onFocusChange} />;
          })}
        </div>
      )}
    </div>
  );
}

// Season-compare mode: the page's season on the left, any other published
// season on the right, observed standings side by side. The comparison
// season loads independently (and reuses the page's data when both sides
// point at the same year).
export default function SeasonCompare({ year, source, league, focusCode, onFocusChange }) {
  const [bYear, setBYear] = useState(() => {
    const index = AVAILABLE_YEARS.indexOf(year);
    return AVAILABLE_YEARS[index - 1] ?? AVAILABLE_YEARS[index + 1] ?? year;
  });
  const [bData, setBData] = useState(null);

  useEffect(() => {
    if (bYear === year) { setBData({ source, league }); return undefined; }
    let cancelled = false;
    setBData(null);
    (async () => {
      try {
        const data = await loadSeasonSource(bYear);
        if (cancelled) return;
        setBData({ source: data, league: buildLeague(data) });
      } catch (e) {
        if (!cancelled) setBData({ error: e?.response?.data?.error || e?.message || 'The season source could not be loaded.' });
      }
    })();
    return () => { cancelled = true; };
  }, [bYear, year, source, league]);

  const aRecords = useMemo(() => actualRecordsFrom(source?.schedule || []), [source]);
  const bRecords = useMemo(
    () => (bYear === year ? aRecords : actualRecordsFrom(bData?.source?.schedule || [])),
    [bData, bYear, year, aRecords]
  );

  return (
    <div className="space-y-3">
      <div className="grid gap-3 lg:grid-cols-2">
        <SeasonColumn
          title="Season A"
          seasonValue={year}
          data={{ league, records: aRecords }}
          focusCode={focusCode}
          onFocusChange={onFocusChange}
        />
        <SeasonColumn
          title="Season B"
          seasonValue={bYear}
          years={AVAILABLE_YEARS}
          onValueChange={setBYear}
          data={{ league: bData?.league, error: bData?.error, records: bRecords }}
          focusCode={focusCode}
          onFocusChange={onFocusChange}
        />
      </div>
      <p className="text-[10px] text-muted-foreground">Observed results from each published season package. Select a team to make it the page's focus team.</p>
    </div>
  );
}