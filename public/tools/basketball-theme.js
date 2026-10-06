import { palettes, paletteForTeam, themeFor } from './basketball-palettes.js?v=20260920c-annotations3';

// Appearance is a one-way consumer. It never changes rosters, rules, or scores.
const root = document.body;
export const COURT_TEAM_STORAGE_KEY = 'djhc-court-team-v1';
// Palette preference and the team a page happens to be discussing are two
// deliberately separate pieces of state. A visitor owns `paletteTeam`; a
// tool may update `contextualTeam` for labels without recolouring the suite.
let paletteTeam = '';
let paletteSource = 'default';
let contextualTeam = '';
let previous = '';
let headerTeamMark = null;

// Approximate home-court coordinates used only for the first-run visual
// default. A location is consulted only when this origin already has an
// explicit geolocation permission; the theme never triggers a permission
// prompt and the result never affects rosters, scoring, or optimizer inputs.
const TEAM_LOCATIONS = Object.freeze({
  atl: [33.7573, -84.3963],
  bos: [42.3662, -71.0621],
  bkn: [40.6826, -73.9754],
  cha: [35.2251, -80.8392],
  chi: [41.8807, -87.6742],
  cle: [41.4965, -81.6882],
  dal: [32.7905, -96.8103],
  den: [39.7487, -105.0077],
  det: [42.3410, -83.0550],
  gsw: [37.7680, -122.3877],
  hou: [29.7508, -95.3621],
  ind: [39.7640, -86.1555],
  lac: [33.9535, -118.3392],
  lal: [34.0430, -118.2673],
  mem: [35.1382, -90.0505],
  mia: [25.7814, -80.1870],
  mil: [43.0451, -87.9170],
  min: [44.9795, -93.2760],
  nop: [29.9490, -90.0820],
  nyk: [40.7505, -73.9934],
  okc: [35.4634, -97.5151],
  orl: [28.5392, -81.3839],
  phi: [39.9012, -75.1719],
  phx: [33.4457, -112.0712],
  por: [45.5316, -122.6668],
  sac: [38.5802, -121.4997],
  sas: [29.4270, -98.4375],
  tor: [43.6435, -79.3791],
  uta: [40.7683, -111.9011],
  was: [38.8981, -77.0209],
});

// The shared fan-tool shell uses the local, transparent team marks for its
// ambient watermark. Keeping this mapping beside the palette resolver means
// every page uses the same reviewed asset path instead of inventing a logo
// URL in each page module.
const TEAM_WATERMARK_SLUGS = Object.freeze({
  atl: 'atlanta-hawks',
  bos: 'boston-celtics',
  bkn: 'brooklyn-nets',
  cha: 'charlotte-hornets',
  chi: 'chicago-bulls',
  cle: 'cleveland-cavaliers',
  dal: 'dallas-mavericks',
  den: 'denver-nuggets',
  det: 'detroit-pistons',
  gsw: 'golden-state-warriors',
  hou: 'houston-rockets',
  ind: 'indiana-pacers',
  lac: 'los-angeles-clippers',
  lal: 'los-angeles-lakers',
  mem: 'memphis-grizzlies',
  mia: 'miami-heat',
  mil: 'milwaukee-bucks',
  min: 'minnesota-timberwolves',
  nop: 'new-orleans-pelicans',
  nyk: 'new-york-knicks',
  okc: 'oklahoma-city-thunder',
  orl: 'orlando-magic',
  phi: 'philadelphia-76ers',
  phx: 'phoenix-suns',
  por: 'portland-trail-blazers',
  sac: 'sacramento-kings',
  sas: 'san-antonio-spurs',
  tor: 'toronto-raptors',
  uta: 'utah-jazz',
  was: 'washington-wizards',
});

// Fourteen teams have reviewed retro marks that should lead the shared fan
// suite header. Other teams keep the current full-colour logo so every page
// still has a visible team identity when a palette is selected.
const TEAM_RETRO_LOGO_SLUGS = Object.freeze({
  atl: 'atlanta-hawks',
  cha: 'charlotte-hornets',
  cle: 'cleveland-cavaliers',
  den: 'denver-nuggets',
  det: 'detroit-pistons',
  hou: 'houston-rockets',
  mem: 'memphis-grizzlies',
  min: 'minnesota-timberwolves',
  orl: 'orlando-magic',
  phx: 'phoenix-suns',
  sas: 'san-antonio-spurs',
  tor: 'toronto-raptors',
  uta: 'utah-jazz',
  was: 'washington-wizards',
});

function teamWatermarkUrl(teamId) {
  const slug = TEAM_WATERMARK_SLUGS[paletteForTeam(teamId).id];
  return slug
    ? new URL(`../assets/nba-logos/${slug}-20-opacity.png`, import.meta.url).toString()
    : '';
}

function teamHeaderLogoUrl(teamId) {
  const paletteId = paletteForTeam(teamId).id;
  const retroSlug = TEAM_RETRO_LOGO_SLUGS[paletteId];
  const currentSlug = TEAM_WATERMARK_SLUGS[paletteId];
  if (retroSlug) return new URL(`../assets/nba-logos/retro-opaque/${retroSlug}.png`, import.meta.url).toString();
  return currentSlug ? new URL(`../assets/nba-logos/${currentSlug}.png`, import.meta.url).toString() : '';
}

function readStoredTeam() {
  try {
    const stored = String(localStorage.getItem(COURT_TEAM_STORAGE_KEY) || '').trim();
    if (!stored) return '';
    const palette = paletteForTeam(stored);
    // Unknown or historical codes stay neutral rather than making an
    // arbitrary palette appear to be a supported team.
    return palette.id === 'djhc' && stored.toLowerCase() !== 'djhc' ? '' : palette.id;
  } catch {
    return '';
  }
}

function saveTeam(code) {
  try { localStorage.setItem(COURT_TEAM_STORAGE_KEY, code); } catch { /* appearance still works for this page */ }
}

function nearestTeamForCoordinates(latitude, longitude) {
  const lat = Number(latitude);
  const lon = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return '';

  // Equirectangular distance is sufficient at city scale and keeps geography
  // isolated from the roster, source, and optimizer modules.
  const radians = value => value * Math.PI / 180;
  const referenceLat = radians(lat);
  let nearest = '';
  let nearestDistance = Number.POSITIVE_INFINITY;
  Object.entries(TEAM_LOCATIONS).forEach(([id, [teamLat, teamLon]]) => {
    const deltaLat = radians(teamLat - lat);
    const deltaLon = radians(teamLon - lon) * Math.cos(referenceLat);
    const distance = deltaLat * deltaLat + deltaLon * deltaLon;
    if (distance < nearestDistance) {
      nearest = id;
      nearestDistance = distance;
    }
  });
  return nearest;
}

async function readGrantedLocation() {
  if (!navigator?.geolocation || !navigator.permissions?.query) return null;
  try {
    const permission = await navigator.permissions.query({ name: 'geolocation' });
    // Do not call getCurrentPosition for a prompt/denied state. This keeps the
    // fan tools quiet unless the visitor is already sharing their location.
    if (permission.state !== 'granted') return null;
    return await new Promise(resolve => {
      navigator.geolocation.getCurrentPosition(
        position => resolve(position.coords),
        () => resolve(null),
        { enableHighAccuracy: false, maximumAge: 6 * 60 * 60 * 1000, timeout: 4000 },
      );
    });
  } catch {
    return null;
  }
}

async function applyGeographicDefault() {
  // Location is only a first-visit presentation default. It must never
  // replace a palette the visitor chose (including one selected in another
  // tab while the permission query was in flight).
  if (paletteSource === 'manual' || paletteTeam || readStoredTeam()) return;
  const coordinates = await readGrantedLocation();
  if (!coordinates || paletteSource === 'manual' || paletteTeam || readStoredTeam()) return;
  const nearest = nearestTeamForCoordinates(coordinates.latitude, coordinates.longitude);
  if (!nearest) return;
  // Keep the geographic default in memory only. Saving it would make an
  // automatic choice look like a visitor-owned palette on future visits.
  paletteTeam = nearest;
  paletteSource = 'geolocation';
  previous = '';
  applyAppearance();
}

// This is intentionally private: only the palette picker below may change or
// persist the visual palette. Feature pages receive `setCourtContextTeam()`
// instead, which cannot affect theme state.
function selectCourtPalette(code = '') {
  const supplied = typeof code === 'string' ? code.trim() : '';
  if (!supplied) return;
  const palette = paletteForTeam(supplied);
  // Ignore an invalid programmatic value rather than silently turning it into
  // the neutral palette and overwriting a deliberate selection.
  if (palette.id === 'djhc' && supplied.toLowerCase() !== 'djhc') return;
  paletteTeam = palette.id;
  paletteSource = 'manual';
  saveTeam(palette.id);
  previous = '';
  applyAppearance();
}

function ensureHeaderTeamFallback() {
  if (!headerTeamMark) return null;
  let fallback = headerTeamMark.querySelector('.fan-suite-team-mark__fallback');
  if (!fallback) {
    fallback = document.createElement('span');
    fallback.className = 'fan-suite-team-mark__fallback';
    fallback.hidden = true;
    fallback.setAttribute('aria-hidden', 'true');
    headerTeamMark.append(fallback);
  }
  return fallback;
}

function ensureHeaderTeamImage() {
  if (!headerTeamMark) return null;
  let image = headerTeamMark.querySelector('img');
  const fallback = ensureHeaderTeamFallback();
  if (!image) {
    image = document.createElement('img');
    image.decoding = 'async';
    image.loading = 'eager';
    headerTeamMark.insertBefore(image, fallback);
  }
  if (image.dataset.fallbackBound !== 'true') {
    image.dataset.fallbackBound = 'true';
    const matchesExpectedSource = () => !image.dataset.expectedSrc
      || image.getAttribute('src') === image.dataset.expectedSrc;
    image.addEventListener('load', () => {
      if (!matchesExpectedSource()) return;
      image.hidden = false;
      if (fallback) fallback.hidden = true;
      delete headerTeamMark.dataset.mediaState;
    });
    image.addEventListener('error', () => {
      if (!matchesExpectedSource()) return;
      const teamCode = String(headerTeamMark.dataset.team || '').trim().toUpperCase();
      image.remove();
      delete image.dataset.expectedSrc;
      if (fallback) {
        fallback.textContent = teamCode || 'NBA';
        fallback.hidden = false;
      }
      headerTeamMark.dataset.mediaState = 'fallback';
    });
  }
  return image;
}

export function setCourtContextTeam(code = '') {
  // Context is session-only and exists for feature-specific labels or future
  // context-aware components. It does not call `applyAppearance`, write
  // storage, or otherwise mutate the visitor's palette choice.
  contextualTeam = typeof code === 'string' ? code.trim().toUpperCase() : '';
  if (!root) return;
  if (contextualTeam) root.dataset.courtContextTeam = contextualTeam;
  else delete root.dataset.courtContextTeam;
  root.dispatchEvent(new CustomEvent('djhc-court-context-change', {
    detail: { team: contextualTeam || null },
  }));
}

function applyAppearance() {
  if (!root?.classList.contains('court-themed')) return;
  const palette = paletteForTeam(paletteTeam);
  const mode = root.classList.contains('dark-mode') ? 'dark' : 'light';
  const key = `${palette.id}:${mode}`;
  const paletteChanged = Boolean(root.dataset.courtPalette && root.dataset.courtPalette !== palette.id);
  root.dataset.courtPaletteSource = paletteSource;
  if (key !== previous) {
    previous = key;
    for (const [name, value] of Object.entries(themeFor(palette, mode))) {
      root.style.setProperty(`--court-${name.replace(/[A-Z]/g, letter => '-' + letter.toLowerCase())}`, value);
    }
    const teamColors = [palette.primary, palette.highlight];
    // A hero needs a different emphasis color on each canvas: use the
    // darkest team color on light backgrounds and the lightest on dark ones.
    // This remains presentation-only and never changes source data or scoring.
    const compareByLightness = (left, right) => {
      const luminance = color => {
        const channels = color.slice(1).match(/../g).map(value => parseInt(value, 16) / 255);
        const linear = channels.map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
        return linear[0] * .2126 + linear[1] * .7152 + linear[2] * .0722;
      };
      return luminance(left) - luminance(right);
    };
    const teamHighlight = teamColors.reduce((best, color) => (
      mode === 'dark'
        ? compareByLightness(color, best) > 0 ? color : best
        : compareByLightness(color, best) < 0 ? color : best
    ));
    // Keep the raw secondary seed available for state accents, while exposing
    // a readable version for text on either canvas.
    const secondaryTokens = themeFor({ ...palette, primary: palette.highlight, highlight: palette.highlight }, mode);
    root.style.setProperty('--court-team-primary', palette.primary);
    root.style.setProperty('--court-team-secondary', palette.highlight);
    root.style.setProperty('--court-team-highlight', teamHighlight);
    root.style.setProperty('--court-team-trim', palette.trim);
    root.style.setProperty('--court-team-secondary-ink', secondaryTokens.accent);
    // Keep the source palette colors available for swatches and previews while
    // --court-team-highlight remains the mode-aware emphasis token used by
    // text and borders.
    root.style.setProperty('--court-palette-primary', palette.primary);
    root.style.setProperty('--court-palette-highlight', palette.highlight);
    root.style.setProperty('--court-palette-trim', palette.trim);
    root.dataset.courtPalette = palette.id;
    root.dataset.courtTeam = palette.id;
    root.dataset.courtMode = mode;
    // Keep both reviewed variants available: the opaque retro mark is used by
    // headers and Studio's hero, while the 20%-opacity mark remains available
    // for ambient page watermarks.
    const logoUrl = teamHeaderLogoUrl(palette.id);
    const watermarkUrl = teamWatermarkUrl(palette.id);
    if (logoUrl) {
      root.style.setProperty('--court-team-logo', `url("${logoUrl}")`);
      root.dataset.courtTeamLogo = palette.id;
    } else {
      root.style.removeProperty('--court-team-logo');
      delete root.dataset.courtTeamLogo;
    }
    if (watermarkUrl) root.style.setProperty('--court-team-watermark', `url("${watermarkUrl}")`);
    else root.style.removeProperty('--court-team-watermark');
    root.style.colorScheme = mode;
  }
  const headerImage = ensureHeaderTeamImage();
  const headerFallback = ensureHeaderTeamFallback();
  const headerLogoUrl = teamHeaderLogoUrl(palette.id);
  if (headerTeamMark && headerImage) {
    if (headerLogoUrl) {
      headerTeamMark.dataset.team = palette.id;
      headerImage.alt = `${palette.team} team logo`;
      headerTeamMark.title = `${palette.team} team logo`;
      headerImage.hidden = false;
      if (headerFallback) headerFallback.hidden = true;
      headerTeamMark.hidden = false;
      headerImage.dataset.expectedSrc = headerLogoUrl;
      delete headerTeamMark.dataset.mediaState;
      headerImage.src = headerLogoUrl;
    } else {
      headerImage.removeAttribute('src');
      delete headerImage.dataset.expectedSrc;
      headerImage.alt = '';
      headerImage.hidden = true;
      if (headerFallback) headerFallback.hidden = true;
      headerTeamMark.removeAttribute('title');
      delete headerTeamMark.dataset.team;
      delete headerTeamMark.dataset.mediaState;
      headerTeamMark.hidden = true;
    }
  }
  document.querySelectorAll('[data-court-palette-summary]').forEach(node => {
    node.setAttribute('aria-label', `Choose team colors. Current palette: ${palette.team}, ${palette.name}`);
    node.title = `${palette.team} · ${palette.name}`;
    if (paletteChanged && typeof node.animate === 'function' && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      node.animate(
        [{ transform: 'translateY(-2px)', opacity: 0.82 }, { transform: 'none', opacity: 1 }],
        { duration: 260, easing: 'ease-out' },
      );
    }
  });
  document.querySelectorAll('[data-court-palette-name]').forEach(node => { node.textContent = palette.name; });
  document.querySelectorAll('[data-court-team-name]').forEach(node => { node.textContent = palette.team; });
  document.querySelectorAll('[data-court-team-select]').forEach(select => {
    select.value = palette.id;
    select.setAttribute('aria-label', `Choose team colors; current palette is ${palette.team}`);
  });
  // Keep the visual menu in sync with the native select.  The option rows are
  // intentionally presentation-only; the select remains the semantic source
  // of truth for keyboard and assistive-technology users.
  document.querySelectorAll('.court-team-picker__option').forEach(option => {
    const selected = option.dataset.teamId === palette.id;
    option.classList.toggle('is-selected', selected);
    option.setAttribute('aria-selected', String(selected));
    const check = option.querySelector('.court-team-picker__option-check');
    if (check) check.textContent = selected ? '✓' : '';
  });
}

function mountFanSuiteHeader() {
  const header = document.querySelector('.site-header');
  const headerInner = header?.querySelector('.header-inner');
  const rails = [...document.querySelectorAll('.fan-suite-nav')];
  const destinationRail = rails[0];
  if (!header || !headerInner || !destinationRail) return;

  rails.slice(1).forEach(node => node.remove());
  if (!headerInner.contains(destinationRail)) headerInner.append(destinationRail);

  headerTeamMark = headerInner.querySelector('.fan-suite-team-mark');
  if (!headerTeamMark) {
    headerTeamMark = document.createElement('span');
    headerTeamMark.className = 'fan-suite-team-mark';
    headerTeamMark.setAttribute('aria-hidden', 'true');
    headerInner.insertBefore(headerTeamMark, destinationRail);
  }
  ensureHeaderTeamImage();

  // nav.js replaces the storefront list with fan-tool destinations and owns
  // the drawer's hidden/inert state. Do not reset that state after moving the
  // visual rail into the header; doing so exposed closed links to keyboard
  // users on wide fan-suite pages.
  header.classList.add('fan-suite-header');
  root.dataset.fanHeaderReady = 'true';
}

function mountCourtToolbar() {
  const main = document.querySelector('main');
  if (!main || main.querySelector('.court-team-picker--hero[data-team-palette-ready="true"]')) return;
  document.querySelectorAll('.court-toolbar').forEach(node => node.remove());
  document.querySelectorAll('.game-navigation').forEach(node => node.remove());
  const hero = main.querySelector('[data-fan-hero]');
  if (!hero) return;

  const style = hero.querySelector(':scope > details.court-team-picker--hero[data-team-palette-slot]')
    || document.createElement('details');
  style.className = 'court-team-picker court-team-picker--hero';
  style.dataset.teamPaletteSlot = '';
  const summary = style.querySelector(':scope > summary') || document.createElement('summary');
  summary.dataset.courtPaletteSummary = '';
  summary.setAttribute('aria-label', 'Choose team colors');
  const panel = style.querySelector(':scope > .court-team-picker__panel') || document.createElement('div');
  panel.className = 'court-team-picker__panel';
  const name = panel.querySelector('[data-court-palette-name]') || document.createElement('strong'); name.dataset.courtPaletteName = '';
  const teamName = panel.querySelector('[data-court-team-name]') || document.createElement('span'); teamName.className = 'court-team-picker__team'; teamName.dataset.courtTeamName = '';
  const note = panel.querySelector('.court-team-picker__note') || document.createElement('p');
  note.className = 'court-team-picker__note';
  note.textContent = 'Choose accent colors for the fan tools. This does not change the roster or result.';
  const preview = panel.querySelector('.court-team-picker__preview') || document.createElement('span');
  preview.className = 'court-team-picker__preview';
  preview.setAttribute('aria-hidden', 'true');
  for (const color of ['primary', 'highlight', 'trim']) {
    const chip = document.createElement('span');
    chip.className = `court-team-picker__preview-chip court-team-picker__preview-chip--${color}`;
    preview.append(chip);
  }
  const label = panel.querySelector('.court-team-picker__label') || document.createElement('label');
  label.className = 'court-team-picker__label';
  label.textContent = 'Palette';
  const select = label.querySelector('[data-court-team-select]') || document.createElement('select');
  select.dataset.courtTeamSelect = '';
  select.setAttribute('aria-label', 'Choose team colors');
  palettes.forEach(palette => {
    if (select.querySelector(`option[value="${palette.id}"]`)) return;
    const option = document.createElement('option');
    option.value = palette.id;
    option.textContent = `${palette.team} · ${palette.name}`;
    select.append(option);
  });
  select.addEventListener('change', () => {
    selectCourtPalette(select.value);
    style.open = false;
    summary.focus();
  });
  label.append(select);

  // The compact native select is the semantic keyboard and screen-reader
  // fallback. Build the larger searchable swatch list only when the details
  // chooser opens; most visitors never use it, so keeping it out of first
  // paint avoids 31 buttons and their listeners on every fan page.
  let options = null;
  let customOptionsMounted = false;
  const mountCustomOptions = () => {
    if (customOptionsMounted) return;
    customOptionsMounted = true;
    const searchLabel = document.createElement('label');
    searchLabel.className = 'court-team-picker__search';
    searchLabel.textContent = 'Search teams';
    const search = document.createElement('input');
    search.type = 'search';
    search.placeholder = 'Search teams…';
    search.autocomplete = 'off';
    searchLabel.append(search);
    options = document.createElement('div');
    options.className = 'court-team-picker__options';
    options.setAttribute('role', 'listbox');
    options.setAttribute('aria-label', 'Team palettes');
    palettes.forEach(palette => {
      const option = document.createElement('button');
      option.type = 'button';
      option.className = 'court-team-picker__option';
      option.dataset.teamId = palette.id;
      option.setAttribute('role', 'option');
      option.setAttribute('aria-label', `${palette.team} · ${palette.name}`);
      const swatch = document.createElement('span');
      swatch.className = 'court-team-picker__option-swatch';
      swatch.style.background = `linear-gradient(135deg,${palette.primary} 0 50%,${palette.highlight} 50%)`;
      swatch.setAttribute('aria-hidden', 'true');
      const code = document.createElement('strong');
      code.className = 'court-team-picker__option-code';
      code.textContent = palette.id.toUpperCase();
      const copy = document.createElement('span');
      copy.className = 'court-team-picker__option-copy';
      copy.textContent = palette.team;
      const check = document.createElement('span');
      check.className = 'court-team-picker__option-check';
      check.setAttribute('aria-hidden', 'true');
      option.append(swatch, code, copy, check);
      option.addEventListener('click', () => {
        select.value = palette.id;
        selectCourtPalette(palette.id);
        style.open = false;
        summary.focus();
      });
      options.append(option);
    });
    search.addEventListener('input', () => {
      const query = search.value.trim().toLowerCase();
      options.querySelectorAll('.court-team-picker__option').forEach(option => {
        const match = !query || option.textContent.toLowerCase().includes(query);
        option.hidden = !match;
      });
    });
    panel.insertBefore(searchLabel, note);
    panel.insertBefore(options, note);
    applyAppearance();
  };
  panel.append(name, teamName, preview, note, label);
  style.addEventListener('keydown', event => {
    if (event.key === 'Escape') { style.open = false; summary.focus(); }
  });
  style.addEventListener('toggle', () => { if (style.open) mountCustomOptions(); });
  document.addEventListener('pointerdown', event => { if (!style.contains(event.target)) style.open = false; });
  const identity = summary.querySelector('.court-team-identity') || document.createElement('span');
  identity.className = 'court-team-identity';
  identity.setAttribute('aria-hidden', 'true');
  const swatch = identity.querySelector('.court-team-identity__swatch') || document.createElement('span');
  swatch.className = 'court-team-identity__swatch';
  swatch.setAttribute('aria-hidden', 'true');
  const copy = identity.querySelector('.court-team-identity__copy') || document.createElement('span');
  copy.className = 'court-team-identity__copy';
  const eyebrow = copy.querySelector('.court-team-identity__eyebrow') || document.createElement('small');
  eyebrow.className = 'court-team-identity__eyebrow';
  eyebrow.textContent = 'Team palette';
  const paletteName = copy.querySelector('.court-team-identity__name') || document.createElement('strong');
  paletteName.className = 'court-team-identity__name';
  paletteName.dataset.courtPaletteName = '';
  const selectedTeam = copy.querySelector('.court-team-identity__team') || document.createElement('span');
  selectedTeam.className = 'court-team-identity__team';
  selectedTeam.dataset.courtTeamName = '';
  copy.append(eyebrow, paletteName, selectedTeam);
  const chips = identity.querySelector('.court-team-identity__chips') || document.createElement('span');
  chips.className = 'court-team-identity__chips';
  chips.setAttribute('aria-hidden', 'true');
  for (const color of ['primary', 'highlight', 'trim']) {
    const chip = document.createElement('span');
    chip.className = `court-team-identity__chip court-team-identity__chip--${color}`;
    chips.append(chip);
  }
  identity.append(swatch, copy, chips);
  summary.append(identity);
  style.append(summary, panel);
  if (!style.isConnected) hero.append(style);
  style.removeAttribute('inert');
  style.removeAttribute('aria-busy');
  style.dataset.teamPaletteReady = 'true';
  root.dataset.fanHeroReady = 'true';
}

function accessibleTableName(table) {
  return table.getAttribute('aria-label')
    || table.querySelector('caption')?.textContent?.replace(/\s+/g, ' ').trim()
    || 'data table';
}

function enhanceScrollableDataRegions() {
  const main = document.querySelector('main');
  if (!main) return;
  main.querySelectorAll('table,[role="table"],[role="grid"]').forEach(table => {
    let region = table.parentElement;
    while (region && region !== main) {
      const overflow = getComputedStyle(region).overflowX;
      if (/^(auto|scroll|overlay)$/.test(overflow)) break;
      region = region.parentElement;
    }
    if (!region || region === main || region.scrollWidth <= region.clientWidth + 1) return;
    region.classList.add('fan-a11y-scroll-region');
    if (!region.hasAttribute('tabindex')) region.tabIndex = 0;
    if (!region.hasAttribute('role')) region.setAttribute('role', 'region');
    if (!region.hasAttribute('aria-label')) region.setAttribute('aria-label', `Scrollable ${accessibleTableName(table)}`);
  });
}

function watchScrollableDataRegions() {
  const main = document.querySelector('main');
  if (!main) return;
  let queued = false;
  const queue = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      enhanceScrollableDataRegions();
    });
  };
  new MutationObserver(queue).observe(main, { childList:true, subtree:true });
  window.addEventListener('resize', queue, { passive:true });
  queue();
}

if (root?.classList.contains('court-themed')) {
  paletteTeam = readStoredTeam();
  // Existing saved values predate the explicit source field. Preserve them as
  // a visitor preference rather than resetting a palette the visitor may have
  // chosen before this update.
  paletteSource = paletteTeam ? 'manual' : 'default';
  mountFanSuiteHeader();
  mountCourtToolbar();
  applyAppearance();
  void applyGeographicDefault();
  watchScrollableDataRegions();
  document.addEventListener('djhc-theme-change', applyAppearance);
  new MutationObserver(applyAppearance).observe(root, { attributes: true, attributeFilter: ['class'] });
  window.addEventListener('storage', event => {
    if (event.key === COURT_TEAM_STORAGE_KEY) {
      paletteTeam = readStoredTeam();
      paletteSource = paletteTeam ? 'manual' : 'default';
      previous = '';
      applyAppearance();
      if (!paletteTeam) void applyGeographicDefault();
    }
    if (event.key === 'theme' && !document.getElementById('themeToggle')) {
      root.classList.toggle('dark-mode', event.newValue !== 'light');
      applyAppearance();
    }
  });
}
