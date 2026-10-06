import {
  CANONICAL_V4_STUDIO_RUNTIME_RELEASE_PIN,
} from './engine/canonical-v4-studio-runtime-adapter.js?v=20261002e&rev=canonical-v4-studio-runtime-adapter-v4-dependency-cache-closure';
import {
  canonicalV4PlayerBaseConsumerAvailability,
  loadCanonicalV4PlayerBaseObservations,
} from './engine/canonical-v4-descriptive-source-consumer.js?v=20261002e&rev=v4-player-base-descriptive-consumer-v2-dependency-cache-closure';

const exactSeason = document.getElementById('exactSeason');
const acceptPooled = document.getElementById('acceptPooled');
const pooledButton = document.getElementById('loadPooled');
const exactButton = document.getElementById('loadExact');
const status = document.getElementById('loadStatus');
const summary = document.getElementById('resultSummary');
const tableBody = document.getElementById('observationsBody');
const releasePin = CANONICAL_V4_STUDIO_RUNTIME_RELEASE_PIN;
const availability = canonicalV4PlayerBaseConsumerAvailability(releasePin);

function setBusy(busy) {
  exactButton.disabled = busy || !availability.enabled;
  pooledButton.disabled = busy || !availability.enabled || !acceptPooled.checked;
  exactSeason.disabled = busy || !availability.enabled;
  acceptPooled.disabled = busy || !availability.enabled;
}

function updatePooledButton() {
  pooledButton.disabled = !availability.enabled || !acceptPooled.checked;
}

function clearRows() {
  tableBody.replaceChildren();
  summary.textContent = '';
}

function renderObservations(result) {
  clearRows();
  const visible = result.observations.slice(0, 100);
  const fragment = document.createDocumentFragment();
  for (const row of visible) {
    const tr = document.createElement('tr');
    const values = [
      row.displayName || 'Name unavailable',
      row.entityLevel,
      row.sourceReportedTeamCode || '—',
      row.seasonLabel,
      row.phase,
      ...['PTS', 'REB', 'AST', 'GP'].map(key => row.metrics[key] ?? '—'),
    ];
    for (const value of values) {
      const td = document.createElement('td');
      td.textContent = String(value);
      tr.append(td);
    }
    fragment.append(tr);
  }
  tableBody.append(fragment);
  const seasons = result.scope.seasonStartYears.map(year => `${year}–${String(year + 1).slice(-2)}`).join(', ');
  summary.textContent = `${result.rowCount.toLocaleString()} verified descriptive source rows for ${seasons}. Showing ${visible.length.toLocaleString()} rows. Player identity is unresolved; team is source-reported context only.`;
  status.textContent = `Verified descriptive data from ${result.package.packageId} ${result.package.packageVersion}. Registry SHA-256: ${result.source.registrySha256}; index SHA-256: ${result.source.indexSha256}.`;
}

async function load({ pooled = false } = {}) {
  setBusy(true);
  clearRows();
  status.textContent = 'Loading and verifying the pinned V4 release…';
  try {
    const result = await loadCanonicalV4PlayerBaseObservations({
      ...(pooled ? { acceptPooled: true } : { seasonStartYear: Number(exactSeason.value) }),
      releasePin,
    });
    renderObservations(result);
  } catch (error) {
    status.textContent = error?.message || 'The V4 descriptive source could not be verified.';
  } finally {
    setBusy(false);
    updatePooledButton();
  }
}

exactButton.addEventListener('click', () => load());
pooledButton.addEventListener('click', () => load({ pooled: true }));
acceptPooled.addEventListener('change', updatePooledButton);

setBusy(false);
updatePooledButton();
status.textContent = availability.enabled
  ? 'A reviewed V4 release pin is present. Data will still be withheld until its registry, indexes, capability map, and artifact hashes verify.'
  : availability.reason;
