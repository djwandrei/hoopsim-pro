import React, { useEffect, useState } from 'react';
import ReleasePinChip from '@/components/lineupLab/native/ReleasePinChip';

// Source health check: verifies the vendored solver module graph is present
// on this origin (the same files the background search worker imports). A
// republish that misses these files would otherwise only surface as a
// "Search issue" at the run stage.
const LINEUP_RUNTIME_PREFIX = '/tools/swishiq-studio/studio-runtime/lineup-lab';
const MODULES = [
  LINEUP_RUNTIME_PREFIX + '/app.js',
  LINEUP_RUNTIME_PREFIX + '/fixtures/timberwolves-2021-22.json',
  LINEUP_RUNTIME_PREFIX + '/data/swishiq-all-games-player-seasons-v1.json',
  LINEUP_RUNTIME_PREFIX + '/optimizer-worker.js',
  LINEUP_RUNTIME_PREFIX + '/optimizer-core.js',
  LINEUP_RUNTIME_PREFIX + '/optimizer-config.js',
  LINEUP_RUNTIME_PREFIX + '/projection-parameters.js',
  LINEUP_RUNTIME_PREFIX + '/player-projection.js',
  LINEUP_RUNTIME_PREFIX + '/workload-model.js',
  LINEUP_RUNTIME_PREFIX + '/projection-evidence.js',
  LINEUP_RUNTIME_PREFIX + '/lineup-role-model.js',
  LINEUP_RUNTIME_PREFIX + '/swishiq-impact.js',
  LINEUP_RUNTIME_PREFIX + '/rotation-unit-planner.js',
  LINEUP_RUNTIME_PREFIX + '/workload-calibration.js',
  '/tools/swishiq-studio/studio-runtime/modules/team-assets.js',
  '/tools/swishiq-studio/studio-runtime/modules/result-passport.js',
  '/tools/swishiq-studio/studio-runtime/modules/result-visuals.js',
  '/tools/swishiq-studio/studio-runtime/modules/swishiq-static-projection.js',
  '/tools/swishiq-studio/player-metadata.js',
  '/tools/swishiq-studio/engine/canonical-v4-player-name-identity.js',
  '/tools/swishiq-studio/engine/canonical-v4-impact-lineup-adapter.js',
  '/tools/swishiq-studio/engine/public-result-share-client.js',
  '/tools/swishiq-studio/engine/public-result-share.js',
  '/tools/swishiq-studio/engine/public-result-share-v4.js',
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
