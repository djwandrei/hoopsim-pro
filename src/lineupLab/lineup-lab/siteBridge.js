// Lineup Lab data bridge. The tool reads its player pool through the live
// site's window.DJ.remoteCatalog boundary, a read-only Supabase analytics
// client. Inside the studio app this shim serves the same four catalog
// methods straight from the site's public analytics project; site-hosted
// data packages ride the runtime service worker instead.

import { invokeLineupShare } from '@/lineupLab/lineup-lab/runtimeRelay';

const ANALYTICS_URL = "https://fbbmuqbdpgsmvnezowwn.supabase.co";
const ANALYTICS_KEY = "sb_publishable_ZZUUmm65NYHiRtUBHNW0sg_eJXE6KV2";

async function supabaseQuery(table, { select, filters = [], orders = [], limit } = {}) {
  const params = new URLSearchParams();
  if (select) params.set("select", select);
  for (const filter of filters) {
    if (filter.op === "in") {
      params.set(filter.column, `in.(${filter.values.map(value => `"${value}"`).join(",")})`);
    } else {
      params.set(filter.column, `${filter.op}.${filter.value}`);
    }
  }
  const orderParts = orders.map(([column, ascending, nullsFirst]) =>
    `${column}.${ascending ? "asc" : "desc"}.${nullsFirst ? "nullsfirst" : "nullslast"}`);
  if (orderParts.length) params.set("order", orderParts.join(","));
  if (limit) params.set("limit", String(limit));
  let response;
  try {
    response = await fetch(`${ANALYTICS_URL}/rest/v1/${table}?${params}`, {
      headers: { apikey: ANALYTICS_KEY, Authorization: `Bearer ${ANALYTICS_KEY}`, Accept: "application/json" },
      cache: "no-store",
    });
  } catch {
    throw new Error("The Lineup Lab player data connection is not available right now.");
  }
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.message || `The Lineup Lab player data request failed (${response.status}).`);
  }
  return Array.isArray(data) ? data : [];
}

function requireSeasonEndYear(value) {
  const season = Number(value);
  if (!Number.isInteger(season) || season < 1980 || season > 2200) {
    throw new Error("Choose a valid NBA season.");
  }
  return season;
}

function requireTeamCode(value) {
  const code = String(value ?? "").trim().toUpperCase();
  if (!/^[A-Z0-9]{2,8}$/.test(code)) throw new Error("A valid NBA team code is required.");
  return code;
}

function requireSeasonPhase(value) {
  const phase = String(value ?? "regular").trim().toLowerCase();
  if (!["regular", "playoffs"].includes(phase)) throw new Error("Season phase must be regular or playoffs.");
  return phase;
}

const remoteCache = new Map();

function cachedPromise(cacheKey, options, build) {
  const cached = remoteCache.get(cacheKey);
  if (cached && !options.force) return cached;
  const pending = build();
  if (!options.force) remoteCache.set(cacheKey, pending);
  pending.catch(() => { if (!options.force) remoteCache.delete(cacheKey); });
  return pending;
}

function listNbaLineupSeasons(options = {}) {
  const minimumSeason = Number.isInteger(Number(options.minimumSeason)) ? requireSeasonEndYear(options.minimumSeason) : 1980;
  return cachedPromise(`nba-lineup-seasons:${minimumSeason}`, options, async () =>
    supabaseQuery("nba_lineup_available_seasons", {
      select: "season_end_year,season_label",
      filters: [{ column: "season_end_year", op: "gte", value: minimumSeason }],
      orders: [["season_end_year", false, false]],
    }));
}

function listNbaLineupTeams(options = {}) {
  const seasonEndYear = requireSeasonEndYear(options.seasonEndYear);
  const seasonPhase = requireSeasonPhase(options.seasonPhase);
  return cachedPromise(`nba-lineup-teams:${seasonEndYear}:${seasonPhase}`, options, async () =>
    supabaseQuery("nba_lineup_available_teams", {
      select: "team_code,team_name,season_end_year,season_phase",
      filters: [
        { column: "season_end_year", op: "eq", value: seasonEndYear },
        { column: "season_phase", op: "eq", value: seasonPhase },
      ],
      orders: [["team_name", true, false]],
    }));
}

const PLAYER_POOL_COLUMNS = [
  "player_id", "player_name", "player_primary_position", "player_headshot_url",
  "team_logo_url", "season_end_year", "season_label", "season_phase", "team_code",
  "team_name", "listed_position", "player_age", "games_played", "games_started",
  "minutes_played", "field_goals_made", "field_goals_attempted",
  "three_point_field_goals_made", "three_point_field_goals_attempted",
  "free_throws_made", "free_throws_attempted", "offensive_rebounds",
  "defensive_rebounds", "total_rebounds", "assists", "steals", "blocks",
  "turnovers", "personal_fouls", "points", "source_name", "source_url",
  "team_total_minutes", "estimated_team_possessions", "league_points_per_36",
  "league_rebounds_per_36", "league_assists_per_36", "league_steals_per_36",
  "league_blocks_per_36", "league_turnovers_per_36", "league_efg_pct",
  "league_three_pct", "advanced_metrics", "postseason_available",
  "career_profile_positions", "career_profile_position_text", "career_profile_source_url",
].join(",");

function listNbaTeamSeasonPlayers(options = {}) {
  const seasonEndYear = requireSeasonEndYear(options.seasonEndYear);
  const teamCode = requireTeamCode(options.teamCode);
  const seasonPhase = requireSeasonPhase(options.seasonPhase);
  return cachedPromise(`nba-lineup-players:${seasonEndYear}:${teamCode}:${seasonPhase}`, options, async () =>
    supabaseQuery("nba_lineup_player_pool", {
      select: PLAYER_POOL_COLUMNS,
      filters: [
        { column: "season_end_year", op: "eq", value: seasonEndYear },
        { column: "team_code", op: "eq", value: teamCode },
        { column: "season_phase", op: "eq", value: seasonPhase },
      ],
      orders: [["minutes_played", false, false], ["player_name", true, false]],
    }));
}

// Season evidence aggregates complete team-stint rows per player, mirroring
// the site boundary: one absent field poisons the season sum instead of
// silently averaging partial exposure.
const EVIDENCE_FIELDS = [
  "games_played", "games_started", "minutes_played", "field_goals_made",
  "field_goals_attempted", "three_point_field_goals_made",
  "three_point_field_goals_attempted", "free_throws_made", "free_throws_attempted",
  "offensive_rebounds", "defensive_rebounds", "total_rebounds", "assists",
  "steals", "blocks", "turnovers", "personal_fouls", "points",
];

function listNbaPlayerSeasonEvidence(options = {}) {
  const seasonEndYear = requireSeasonEndYear(options.seasonEndYear);
  if (typeof options.seasonPhase !== "string" || !options.seasonPhase.trim()) {
    throw new Error("Season evidence requires an explicit season phase.");
  }
  const seasonPhase = requireSeasonPhase(options.seasonPhase);
  if (!Array.isArray(options.playerIds)) throw new Error("Season evidence requires player IDs.");
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const playerIds = [...new Set(options.playerIds.map(id => {
    if (typeof id !== "string" || !uuid.test(id.trim())) throw new Error("Choose valid NBA player IDs for season evidence.");
    return id.trim().toLowerCase();
  }))].sort();
  if (!playerIds.length) return Promise.resolve([]);
  const columns = ["id", "player_id", "season_end_year", "season_phase", "team_code", "is_multi_team_aggregate", ...EVIDENCE_FIELDS].join(",");
  const cacheKey = `nba-season-evidence-v1:${seasonEndYear}:${seasonPhase}:${playerIds.join(",")}`;
  return cachedPromise(cacheKey, options, async () => {
    const count = value => {
      if (!["number", "string"].includes(typeof value) ||
          (typeof value === "string" && !/^\d+$/.test(value))) return null;
      const number = Number(value);
      return Number.isSafeInteger(number) && number >= 0 ? number : null;
    };
    const byPlayer = new Map();
    const seenRows = new Set();
    const seenTeams = new Set();
    for (let start = 0; start < playerIds.length; start += 50) {
      const batch = playerIds.slice(start, start + 50);
      const allowed = new Set(batch);
      let cursor = 0;
      for (;;) {
        const rows = await supabaseQuery("nba_player_team_season_stats", {
          select: columns,
          filters: [
            { column: "season_end_year", op: "eq", value: seasonEndYear },
            { column: "season_phase", op: "eq", value: seasonPhase },
            { column: "is_multi_team_aggregate", op: "eq", value: false },
            { column: "player_id", op: "in", values: batch },
            { column: "id", op: "gt", value: cursor },
          ],
          orders: [["id", true, false]],
          limit: 100,
        });
        if (!Array.isArray(rows)) throw new Error("Season evidence returned an invalid response.");
        if (!rows.length) break;
        for (const row of rows) {
          const id = count(row?.id);
          const playerId = typeof row?.player_id === "string" ? row.player_id.toLowerCase() : "";
          if (!(id > cursor) || seenRows.has(id) || !allowed.has(playerId) ||
              row.season_end_year !== seasonEndYear || row.season_phase !== seasonPhase ||
              row.is_multi_team_aggregate !== false ||
              typeof row.team_code !== "string" || !/^[A-Z0-9]{2,8}$/.test(row.team_code) ||
              /^(TOT|[2-9]TM)$/.test(row.team_code)) {
            throw new Error("Season evidence has duplicate, out-of-order, or mismatched source rows.");
          }
          const teamKey = `${playerId}:${row.team_code}`;
          if (seenTeams.has(teamKey)) throw new Error("Season evidence contains duplicate team records.");
          seenRows.add(id); seenTeams.add(teamKey); cursor = id;
          const aggregate = byPlayer.get(playerId) || {
            player_id: playerId, season_end_year: seasonEndYear, season_phase: seasonPhase,
            team_stint_count: 0, ...Object.fromEntries(EVIDENCE_FIELDS.map(field => [field, 0])),
          };
          aggregate.team_stint_count += 1;
          for (const field of EVIDENCE_FIELDS) {
            const value = count(row[field]);
            const sum = aggregate[field] === null || value === null ? null : aggregate[field] + value;
            aggregate[field] = Number.isSafeInteger(sum) ? sum : null;
          }
          byPlayer.set(playerId, aggregate);
        }
        if (rows.length < 100) break;
      }
    }
    return playerIds.flatMap(playerId => {
      const row = byPlayer.get(playerId);
      if (!row || !(row.games_played > 0) || !(row.minutes_played > 0)) return [];
      return [{ ...row, evidence_contract: "imported-team-totals-v1" }];
    });
  });
}

export function installLineupLabBridge() {
  if (globalThis.__lineupLabBridgeInstalled) return;
  globalThis.__lineupLabBridgeInstalled = true;
  const DJ = globalThis.DJ = globalThis.DJ || {};
  DJ.remoteCatalog = {
    ...DJ.remoteCatalog,
    isConfigured: () => globalThis.DJ_BACKEND_CONFIG?.enabled === true,
    invokeFunction: invokeLineupShare,
    listNbaLineupSeasons,
    listNbaLineupTeams,
    listNbaTeamSeasonPlayers,
    listNbaPlayerSeasonEvidence,
  };
}