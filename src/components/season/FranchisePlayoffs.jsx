import React from 'react';
import { Crown, Trophy } from 'lucide-react';
import TeamMark from '@/components/studio/TeamMark';
import { codeOf, num } from '@/lib/scalars';


function seriesSides(series) {
  const a = codeOf(series.aId ?? series.teamAId ?? series.higher ?? series.home ?? series.a);
  const b = codeOf(series.bId ?? series.teamBId ?? series.lower ?? series.away ?? series.b);
  return { a, b };
}

function seriesWinner(series) {
  const winner = codeOf(series.winnerId ?? series.winner);
  if (winner) return winner;
  return null;
}

function SeriesCard({ series }) {
  const { a, b } = seriesSides(series);
  if (!a || !b) return null;
  const winner = seriesWinner(series, a, b);
  const label = series.round ?? series.roundName ?? series.name ?? 'Series';
  const games = (series.games || []).map((game, index) => ({
    game: num(game.game, index + 1),
    home: codeOf(game.homeTeamId ?? game.home) || a,
    away: codeOf(game.awayTeamId ?? game.away) || b,
    homePts: num(game.scoreHome ?? game.homeScore ?? game.homePts),
    awayPts: num(game.scoreAway ?? game.awayScore ?? game.awayPts),
  }));
  const winsA = num(series.winsA, games.filter(game => (game.home === a ? game.homePts : game.awayPts) > (game.home === a ? game.awayPts : game.homePts)).length);
  const winsB = num(series.winsB, games.length - winsA);
  return (
    <div className="rounded-xl border border-[var(--myna-border)] p-2">
      <p className="text-[9px] font-bold uppercase tracking-[0.16em] myna-muted">{label}</p>
      <div className="mt-1 space-y-0.5">
        {[[a, winsA], [b, winsB]].map(([code, wins]) => (
          <div key={code} className="flex items-center gap-2 rounded px-1 py-0.5">
            <TeamMark code={code} name={code} className="h-6 w-6" />
            <span className="myna-display min-w-0 flex-1 truncate text-sm">{code}</span>
            <span className="myna-mono text-[10px] font-bold" style={{ color: winner === code ? 'var(--myna-accent)' : 'var(--myna-muted)' }}>{wins}</span>
            {winner === code && <Crown className="h-3 w-3" style={{ color: 'var(--myna-accent)' }} />}
          </div>
        ))}
      </div>
      {games.length > 0 && (
        <ul className="mt-1 space-y-0.5 border-t border-[var(--myna-border)] pt-1">
          {games.map(game => (
            <li key={game.game} className="myna-mono flex items-center justify-between gap-2 text-[10px]">
              <span className="myna-muted">G{game.game}</span>
              <span>{game.away} {game.awayPts} @ {game.home} {game.homePts}</span>
              <span className="myna-muted">+{Math.abs(game.homePts - game.awayPts)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Native franchise postseason: grouped series plus the champion banner.
export default function FranchisePlayoffs({ playoffs }) {
  if (!playoffs) return null;
  const seriesList = Array.isArray(playoffs.series) ? playoffs.series : [];
  const rounds = [...new Set(seriesList.map(series => series.round ?? series.roundName ?? series.name ?? 'Series').filter(Boolean))];
  const championId = codeOf(playoffs.championId);
  const structure = String(playoffs.structure || 'generic');
  return (
    <section className="space-y-3" aria-label="Franchise postseason">
      <div className="myna-panel p-4">
        <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: 'var(--myna-accent)' }}><Trophy className="h-4 w-4" />Postseason</p>
        <p className="myna-muted mt-1 text-[11px]">
          {structure === 'conference-aware' ? 'East and West conference brackets feeding the Finals' : 'Generic seeded bracket'} · {seriesList.length} series.
        </p>
        {championId && (
          <p className="myna-display mt-3 flex items-center justify-center gap-2 rounded-lg border py-2 text-xl" style={{ borderColor: 'color-mix(in srgb, var(--myna-accent) 45%, transparent)', background: 'color-mix(in srgb, var(--myna-accent) 10%, transparent)', color: 'var(--myna-accent)' }}>
            <Crown className="h-5 w-5" />{championId} WIN THE TITLE
          </p>
        )}
      </div>
      {rounds.map(label => (
        <div key={label} className="myna-panel p-3">
          <p className="mb-2 text-[9px] font-bold uppercase tracking-[0.16em]" style={{ color: 'var(--myna-accent)' }}>{label}</p>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {seriesList.filter(series => (series.round ?? series.roundName ?? series.name) === label).map((series, index) => (
              <SeriesCard key={`${label}-${index}`} series={series} />
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}