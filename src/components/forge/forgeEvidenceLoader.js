import { verifiedJson } from '../../lib/site/verifiedAssets.js';
import { FORGE_EVIDENCE_RELEASE } from './forgeEvidenceRelease.js';

const cache = new Map();
const assetBase = import.meta.env?.BASE_URL || '/tools/swishiq-studio/';
export async function loadForgeEvidence(year, packageVersion) {
  const pin = FORGE_EVIDENCE_RELEASE.find(item => item.year === year && item.packageVersion === packageVersion);
  if (!pin) throw new Error('Forge ratings do not match the selected season package.');
  if (!cache.has(year)) {
    const pending = verifiedJson(assetBase + pin.url.slice(1), pin, 'Forge season evidence').then(doc => {
      if (doc.format !== 'djhc-forge-season-evidence-v1' || doc.year !== year || doc.packageVersion !== packageVersion) throw new Error('Forge evidence has the wrong season identity.');
      return doc;
    });
    cache.set(year, pending); pending.catch(() => cache.delete(year));
    if (cache.size > 3) cache.delete(cache.keys().next().value);
  }
  return cache.get(year);
}
