import React, { useMemo } from 'react';
import { simSingleGame } from '@/lib/season/simEngine';
import TourVisual from '@/components/forge/TourVisual';
import MetricTile from '@/components/studio/MetricTile';

export default function ForgeLeagueTour({ league, buckets, picks }) {
  const composite = useMemo(() => {
    const donors = buckets
      .map(bucket => ({ bucket, player: picks[bucket.key].player, team: league.byCode.get(picks[bucket.key].player.teamCode) }))
      .filter(donor => donor.team);
    const weightSum = donors.reduce((sum, donor) => sum + donor.bucket.weight, 0) || 1;
    const blend = field => donors.reduce((sum, donor) => sum + donor.bucket.weight * (donor.team[field] ?? 0), 0) / weightSum;
    return {
      code: 'CMP',
      name: 'Composite',
      conference: 'EAST',
      off: blend('off') || 112, def: blend('def') || 112, net: blend('off') - blend('def'),
      pace: blend('pace') || 99, efg: blend('efg') || 0.53, ftr: blend('ftr') || 0.25,
      orb: blend('orb') || 0.28, drb: blend('drb') || 0.72,
      tov: blend('tov') || 0.13, oppEfg: blend('oppEfg') || 0.53, oppFtr: blend('oppFtr') || 0.25, oppTov: blend('oppTov') || 0.13,
      roster: donors.map(({ player }) => ({
        playerRef: player.playerRef, name: player.name, positions: player.positions || [],
        games: player.games, minutes: player.minutes, pts: player.pts, reb: player.reb,
        ast: player.ast, stl: player.stl, blk: player.blk,
      })),
    };
  }, [league, buckets, picks]);

  const tour = useMemo(() => {
    let wins = 0; let losses = 0;
    const rows = league.teams.map((team, index) => {
      const game = simSingleGame(league, composite, team, { seed: 41 + index, neutral: true });
      const margin = game.homePts - game.awayPts;
      if (margin > 0) wins += 1; else losses += 1;
      return { code: team.code, margin };
    });
    return { wins, losses, avgMargin: rows.reduce((sum, row) => sum + row.margin, 0) / (rows.length || 1), rows };
  }, [league, composite]);

  return <section className="court-panel relative overflow-hidden p-5" aria-label="Composite league tour">
    <span className="bcast-watermark" aria-hidden="true">CMP</span>
    <header className="relative flex flex-wrap items-center justify-between gap-3">
      <div><p className="bcast-kicker">Forge output</p><h3 className="mt-1 font-display text-2xl">COMPOSITE TOURS THE LEAGUE</h3><p className="mt-1 text-xs text-muted-foreground">The forged profile blends each donor's team ratings by bucket weight, then plays one neutral-court game against every {league.label} team.</p></div>
      <span className="bcast-lowerthird" role="status"><span className="bcast-lowerthird__bar" aria-hidden="true"></span>{tour.wins}–{tour.losses} vs the league</span>
    </header>
    <div className="mt-4 grid gap-3 sm:grid-cols-4">
      <MetricTile label="Offensive rating" value={composite.off.toFixed(1)} detail="points / 100 possessions" />
      <MetricTile label="Defensive rating" value={composite.def.toFixed(1)} detail="allowed / 100 possessions" tone="royal" />
      <MetricTile label="Net rating" value={composite.net.toFixed(1)} detail="offense minus defense" />
      <MetricTile label="Pace" value={composite.pace.toFixed(1)} detail="model pace input" tone="royal" />
    </div>
    <TourVisual tour={tour} />
  </section>;
}