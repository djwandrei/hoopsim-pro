import {
  loadSwishIqExactPackageProof,
  loadSwishIqPublicPart,
} from "../swishiq-static-projection.js?v=20261001&rev=swishiq-v3-helper-typed-v4-cutover-gate-v1";
import {
  CANONICAL_V4_STUDIO_RUNTIME_RELEASE_PIN,
  loadCanonicalV4StudioExactSeasonData,
} from "../swishiq-studio/engine/canonical-v4-studio-runtime-adapter.js?v=20261002e&rev=canonical-v4-studio-runtime-adapter-v4-dependency-cache-closure";
import {
  filterPositionLensRows,
  POSITION_LENS_COLUMNS,
  prepareCanonicalV4PositionLensDataset,
  preparePositionLensDataset,
  sortPositionLensRows,
  summarizePositionAssignments,
} from "./position-lens-model.js?v=20261005a&rev=v4-exact-regular-scope-provenance-v3";

const form = document.querySelector("[data-lens-form]");
const seasonInput = document.querySelector("[data-lens-season]");
const verifyButton = document.querySelector("[data-lens-verify]");
const status = document.querySelector("[data-lens-status]");
const results = document.querySelector("[data-lens-results]");
const resultNote = document.querySelector("[data-lens-result-note]");
const teamSelect = document.querySelector("[data-lens-team]");
const positionSelect = document.querySelector("[data-lens-position]");
const searchInput = document.querySelector("[data-lens-search]");
const summaryBody = document.querySelector("[data-lens-summary-body]");
const summaryCaption = document.querySelector("[data-lens-summary-caption]");
const rosterBody = document.querySelector("[data-lens-roster-body]");
const rosterCaption = document.querySelector("[data-lens-roster-caption]");
const rowCount = document.querySelector("[data-lens-row-count]");

const state = {
  requestId: 0,
  dataset: null,
  sortKey: "points",
  sortDirection: "desc",
};

function element(tag, className = "", text = undefined) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = String(text);
  return node;
}

function setStatus(message, kind = "info") {
  status.textContent = message;
  status.dataset.state = kind;
}

function clearView() {
  results.hidden = true;
  summaryBody.replaceChildren();
  rosterBody.replaceChildren();
  teamSelect.replaceChildren(element("option", "", "Verify a season first"));
  teamSelect.disabled = true;
  positionSelect.replaceChildren(element("option", "", "Choose a team first"));
  positionSelect.disabled = true;
  searchInput.value = "";
  searchInput.disabled = true;
}

function formatNumber(value, maximumFractionDigits = 0) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "Unavailable";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits }).format(value);
}

function formatSeason(source) {
  return `${source.seasonStartYear}–${String(source.seasonEndYear).slice(-2)}`;
}

function currentTeamRows() {
  if (!state.dataset?.status || !teamSelect.value) return [];
  return state.dataset.rows.filter((row) => row.teamCode === teamSelect.value);
}

function updateSortHeaders() {
  for (const header of document.querySelectorAll("[data-lens-roster-scroll] th")) {
    const button = header.querySelector("button[data-sort]");
    if (!button) continue;
    const active = button.dataset.sort === state.sortKey;
    header.setAttribute("aria-sort", active ? state.sortDirection === "asc" ? "ascending" : "descending" : "none");
    const definition = POSITION_LENS_COLUMNS.find((item) => item.key === button.dataset.sort);
    if (definition) button.setAttribute("aria-label", active
      ? `Sort by ${definition.label} ${state.sortDirection === "asc" ? "descending" : "ascending"}`
      : `Sort by ${definition.label} ${definition.kind === "text" ? "ascending" : "descending"}`);
  }
}

function renderPositionSummary() {
  const rows = currentTeamRows();
  const groups = summarizePositionAssignments(rows);
  summaryCaption.textContent = `Observed ${formatSeason(state.dataset.source)} regular-season totals by position assignment for ${teamSelect.value}`;
  summaryBody.replaceChildren(...groups.map((group) => {
    const row = document.createElement("tr");
    row.append(
      element("th", "", group.position),
      element("td", "position-lens-number", formatNumber(group.rosterMembers)),
      element("td", "position-lens-number", formatNumber(group.minutes, 1)),
      element("td", "position-lens-number", formatNumber(group.points)),
    );
    return row;
  }));
}

function renderRoster() {
  const currentRows = filterPositionLensRows(state.dataset, {
    teamCode: teamSelect.value,
    positionKey: positionSelect.value,
    search: searchInput.value,
  });
  const sortedRows = sortPositionLensRows(currentRows, state.sortKey, state.sortDirection);
  rosterCaption.textContent = `Observed ${formatSeason(state.dataset.source)} regular-season player-season rows for ${teamSelect.value}`;
  rowCount.textContent = `${sortedRows.length} of ${currentTeamRows().length} roster rows shown · observed totals`;
  rosterBody.replaceChildren(...sortedRows.map((player) => {
    const row = document.createElement("tr");
    row.append(
      element("th", "", player.displayName),
      element("td", "", player.positionKey),
      element("td", "position-lens-number", formatNumber(player.games)),
      element("td", "position-lens-number", formatNumber(player.minutes, 1)),
      element("td", "position-lens-number", formatNumber(player.points)),
      element("td", "position-lens-number", formatNumber(player.rebounds)),
      element("td", "position-lens-number", formatNumber(player.assists)),
    );
    return row;
  }));
  if (!sortedRows.length) {
    const empty = document.createElement("tr");
    const cell = element("td", "position-lens-empty", "No player rows match these filters.");
    cell.colSpan = POSITION_LENS_COLUMNS.length;
    empty.append(cell);
    rosterBody.append(empty);
  }
  updateSortHeaders();
}

function renderTeamView() {
  const rows = currentTeamRows();
  const positionKeys = [...new Set(rows.map((row) => row.positionKey))].sort((left, right) => left.localeCompare(right, "en"));
  const selectedPosition = positionSelect.value;
  positionSelect.replaceChildren(element("option", "", "All positions"));
  positionSelect.options[0].value = "";
  for (const key of positionKeys) {
    const option = element("option", "", key);
    option.value = key;
    positionSelect.append(option);
  }
  positionSelect.disabled = rows.length === 0;
  positionSelect.value = positionKeys.includes(selectedPosition) ? selectedPosition : "";
  searchInput.disabled = rows.length === 0;
  resultNote.textContent = `${teamSelect.value}: ${rows.length} player rows for ${formatSeason(state.dataset.source)} regular season. Position assignments and totals reflect this team and season.`;
  renderPositionSummary();
  renderRoster();
}

function renderDataset(dataset) {
  state.dataset = dataset;
  state.sortKey = "points";
  state.sortDirection = "desc";
  const options = [element("option", "", "Choose a team…")];
  options[0].value = "";
  for (const team of dataset.teams) {
    const option = element("option", "", team);
    option.value = team;
    options.push(option);
  }
  teamSelect.replaceChildren(...options);
  teamSelect.disabled = false;
  positionSelect.replaceChildren(element("option", "", "Choose a team first"));
  positionSelect.disabled = true;
  searchInput.value = "";
  searchInput.disabled = true;
  results.hidden = false;
  setStatus(`Loaded ${dataset.rosterCount} observed player rows for the ${formatSeason(dataset.source)} regular season. Choose a team to view its position assignments.`, "success");
}

function errorMessage(error) {
  if (error?.code === "exact-package-unavailable") return "Observed data are unavailable for that regular season. Pooled and neighboring seasons are not used.";
  if (error?.code === "capability-unavailable") return "Regular-season roster and player data are not both available for that season.";
  if (error?.code === "integrity-failed") return "The season data are unavailable. No player rows were displayed.";
  if (error?.code === "network-unavailable") return "Season data could not be loaded. Check your connection and try again.";
  return "The selected season is unavailable. No other season's roster was substituted.";
}

async function verifySelectedSeason(event) {
  event?.preventDefault();
  const endYear = Number(seasonInput.value);
  const requestId = ++state.requestId;
  clearView();
  state.dataset = null;
  if (!Number.isInteger(endYear) || endYear < 1949 || endYear > 2200) {
    setStatus("Enter a valid season-ending year.", "warning");
    return;
  }

  form.setAttribute("aria-busy", "true");
  verifyButton.disabled = true;
  setStatus(`Loading observed data for the ${endYear - 1}–${String(endYear).slice(-2)} regular season…`, "info");
  try {
    if (CANONICAL_V4_STUDIO_RUNTIME_RELEASE_PIN.status !== "unconfigured") {
      const data = await loadCanonicalV4StudioExactSeasonData({
        seasonStartYear: endYear - 1,
        phases: ["regular"],
        capabilityId: "franchiseInputs",
        additionalArtifactIds: ["player-seasons"],
      });
      if (requestId !== state.requestId) return;
      const dataset = prepareCanonicalV4PositionLensDataset(data, endYear);
      if (dataset.status !== "ready") {
        setStatus("Complete, matching V4 player and roster data are unavailable for this season. No player rows were displayed.", "warning");
        return;
      }
      renderDataset(dataset);
      return;
    }
    const proof = await loadSwishIqExactPackageProof({
      seasonEndYear: endYear,
      seasonPhase: "regular",
      requiredCapabilities: ["historicalSeason"],
    });
    if (requestId !== state.requestId) return;
    const [playerPart, rosterPart] = await Promise.all([
      loadSwishIqPublicPart(proof, { artifactId: "player-seasons", kind: "player-seasons", capability: "historicalSeason" }),
      loadSwishIqPublicPart(proof, { artifactId: "roster-memberships", kind: "roster-memberships", capability: "historicalSeason" }),
    ]);
    if (requestId !== state.requestId) return;
    const dataset = preparePositionLensDataset(proof, playerPart.value, rosterPart.value, endYear);
    if (dataset.status !== "ready") {
      setStatus("Complete, matching player and roster data are unavailable for this season. No player rows were displayed.", "warning");
      return;
    }
    renderDataset(dataset);
  } catch (error) {
    if (requestId !== state.requestId) return;
    setStatus(errorMessage(error), "warning");
  } finally {
    if (requestId === state.requestId) {
      form.removeAttribute("aria-busy");
      verifyButton.disabled = false;
    }
  }
}

function bindKeyboardScroll(region) {
  region.addEventListener("keydown", (event) => {
    if (event.target !== region || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const max = Math.max(0, region.scrollWidth - region.clientWidth);
    if (event.key === "ArrowRight") region.scrollLeft = Math.min(max, region.scrollLeft + 48);
    else if (event.key === "ArrowLeft") region.scrollLeft = Math.max(0, region.scrollLeft - 48);
    else if (event.key === "Home") region.scrollLeft = 0;
    else if (event.key === "End") region.scrollLeft = max;
    else return;
    event.preventDefault();
  });
}

form.addEventListener("submit", verifySelectedSeason);
seasonInput.addEventListener("input", () => {
  state.requestId += 1;
  state.dataset = null;
  clearView();
  form.removeAttribute("aria-busy");
  verifyButton.disabled = false;
  setStatus("Season changed. Load its data to view roster rows.", "info");
});
teamSelect.addEventListener("change", renderTeamView);
positionSelect.addEventListener("change", renderRoster);
searchInput.addEventListener("input", renderRoster);
document.querySelector("[data-lens-roster-scroll]").addEventListener("click", (event) => {
  const button = event.target.closest?.("button[data-sort]");
  if (!button) return;
  const key = button.dataset.sort;
  if (state.sortKey === key) state.sortDirection = state.sortDirection === "asc" ? "desc" : "asc";
  else {
    state.sortKey = key;
    state.sortDirection = key === "name" || key === "position" ? "asc" : "desc";
  }
  renderRoster();
});
bindKeyboardScroll(document.querySelector("[data-lens-summary-scroll]"));
bindKeyboardScroll(document.querySelector("[data-lens-roster-scroll]"));

clearView();
void verifySelectedSeason();
