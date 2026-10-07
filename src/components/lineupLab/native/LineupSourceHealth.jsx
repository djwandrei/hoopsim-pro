import React, { useEffect, useState } from 'react';
import ReleasePinChip from '@/components/lineupLab/native/ReleasePinChip';

// Source health check: verifies the vendored solver module graph is present
// on this origin (the same files the background search worker imports). A
// republish that misses these files would otherwise only surface as a
// "Search issue" at the run stage.
const MODULES = [
  '/lineup-lab/optimizer-worker.js',
  '/lineup-lab/optimizer-core.js',
  '/lineup-lab/optimizer-config.js',
  '/lineup-lab/projection-parameters.js',
  '/lineup-lab/player-projection.js',
  '/lineup-lab/workload-model.js',
  '/lineup-lab/projection-evidence.js',
  '/lineup-lab/lineup-role-model.js',
  '/lineup-lab/swishiq-impact.js',
  '/lineup-lab/rotation-unit-planner.js',
  '/lineup-lab/workload-calibration.js',
  '/tools/swishiq-studio/engine/canonical-v4-lineup-model-gate.js',
  '/tools/swishiq-studio/engine/canonical-v4-site-consumer-policy.js',
  '/tools/swishiq-studio/engine/canonical-v4-studio-runtime-adapter.js',
  '/tools/swishiq-studio/engine/canonical-v4-descriptive-source-consumer.js',
  '/tools/swishiq-studio/engine/canonical-v4-public-network-loader.js',
  '/tools/swishiq-studio/engine/canonical-v4-studio-runtime-release-pin.js',
  '/tools/swishiq-studio/engine/canonical-v4-projection-resolver.js',
  '/tools/swishiq-studio/engine/canonical-v4-identity.js',
  '/tools/swishiq-studio/engine/canonical-v4-projection-capability-map.js',
];

export default function LineupSourceHealth() {
  const [health, setHealth] = useState(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all(MODULES.map(async (path) => {
      try {
        const response = await fetch(path, { method: 'HEAD' });
        return response.ok ? null : path;
      } catch {
        return path;
      }
    })).then((missing) => {
      if (!cancelled) setHealth({ total: MODULES.length, missing: missing.filter(Boolean) });
    });
    return () => { cancelled = true; };
  }, []);

  if (!health) return <span className="ll-health is-pending">Checking solver files…</span>;
  return (
    <span className="flex flex-wrap items-center gap-2">
      {health.missing.length
        ? <span className="ll-health is-warn">Solver check: {health.total - health.missing.length}/{health.total} files ready — republish to restore the rest.</span>
        : <span className="ll-health is-ok">Solver files verified · {health.total}/{health.total} ready</span>}
      <ReleasePinChip />
    </span>
  );
}