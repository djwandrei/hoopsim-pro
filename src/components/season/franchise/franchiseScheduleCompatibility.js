// Derived compatibility view only: source bytes, receipts and engines stay unchanged.
const team = row => String(row?.values?.teamCode ?? row?.entities?.teamCode ?? '').trim().toUpperCase();
const date = row => row?.time?.gameDateLocal ?? row?.time?.gameLocalDate ?? row?.values?.localGameDate ?? row?.values?.gameLocalDate;
const reference = row => row?.entities?.gameRef ?? row?.values?.gameRef;
const key = (utc, own, opponent, home) => Number.isFinite(Date.parse(utc)) ? `${Date.parse(utc)}|${own}|${opponent}|${home}` : null;

export default function franchiseScheduleCompatibility(intake, scheduleApi, artifact, part) {
  const year = intake.scenario.seasonStartYear;
  const selected = scheduleApi.selectActualNbaSchedule(scheduleApi.normalizeNbaScheduleArtifact(artifact), {
    seasonStartYear: year, teamIds: scheduleApi.NBA_TEAM_CODES, phases: ['regular'],
  });
  if (selected.status !== 'ready') return intake;
  const index = new Map();
  for (const row of part.records) {
    if ((row.time?.seasonStartYear ?? row.values?.seasonStartYear) !== year || (row.time?.phase ?? row.values?.phase) !== 'regular') continue;
    const opponent = String(row.values?.opponentTeamCode ?? '').trim().toUpperCase();
    const rowKey = key(row.time?.scheduledAtUtc ?? row.values?.scheduledAtUtc, team(row), opponent, row.values?.isHome);
    if (!rowKey || !team(row) || !opponent || typeof row.values?.isHome !== 'boolean') continue;
    index.set(rowKey, [...(index.get(rowKey) ?? []), row]);
  }
  const games = [];
  for (const game of selected.games) {
    const homeRows = index.get(key(game.scheduledAt, game.home, game.away, true)) ?? [];
    const awayRows = index.get(key(game.scheduledAt, game.away, game.home, false)) ?? [];
    // Still fail closed on missing/duplicate rows or conflicting local dates/IDs.
    if (homeRows.length !== 1 || awayRows.length !== 1) return intake;
    const home = homeRows[0], away = awayRows[0], localDate = date(home), gameRef = reference(home);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(localDate ?? '') || localDate !== date(away) || typeof gameRef !== 'string' || !gameRef.trim() || gameRef !== reference(away)) return intake;
    const scheduleSource = intake.schedule.source.scheduleArtifact;
    games.push(Object.freeze({ gameId: game.id, sourceGameCode: game.sourceGameCode ?? null, seasonStartYear: year, phase: 'regular',
      scheduledAtUtc: game.scheduledAt, gameLocalDate: localDate, homeTeamCode: game.home, awayTeamCode: game.away, sourceGameRef: gameRef,
      sourceRecordIds: Object.freeze([home.recordId ?? null, away.recordId ?? null]), sourceArtifacts: Object.freeze([
        Object.freeze({ ...scheduleSource, scheduleGameId: game.id }),
        Object.freeze({ artifactId: 'team-games', sha256: intake.schedule.source.teamGamesPart.sha256, homeRecordId: home.recordId ?? null, awayRecordId: away.recordId ?? null }),
      ]), scoreUseBoundary: 'observed scores intentionally omitted; schedule is fixture only' }));
  }
  const schedule = Object.freeze({ ...intake.schedule, status: 'verified-exact-regular-schedule-with-local-date-crosswalk',
    gameCount: games.length, expectedGameCount: selected.games.length, coverage: selected.coverage, crosswalkErrorCount: 0,
    crosswalkErrors: Object.freeze([]), games: Object.freeze(games), timestampComparison: 'equal-UTC-instant' });
  return Object.freeze({ ...intake, schedule, sourceRows: Object.freeze({ ...intake.sourceRows,
    teamGamesCrosswalkRows: Object.freeze(games.map(({ gameId, gameLocalDate, scheduledAtUtc, homeTeamCode, awayTeamCode, sourceGameRef, sourceRecordIds, scoreUseBoundary }) =>
      Object.freeze({ gameId, gameLocalDate, scheduledAtUtc, homeTeamCode, awayTeamCode, sourceGameRef, sourceRecordIds, scoreUseBoundary }))),
  }) });
}