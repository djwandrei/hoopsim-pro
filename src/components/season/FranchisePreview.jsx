import React, { useEffect, useState } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { STANDALONE } from '@/lib/deployConfig';
import workerConnection from '@/lineupLab/lineup-lab/workerConnection';

// The vendored site release runs in its own same-origin frame so its module
// graph, dedicated worker, and relative data fetches resolve exactly as they
// do on the live site. On the Base44 preview, the V4 release data (registry +
// packages) still relays through the app's source connection.
const PREVIEW_PATH = '/tools/swishiq-studio/franchise-sim-20261008/integration/season-lab-preview/index.html?rev=franchise-ui-redesign-v12';

export default function FranchisePreview() {
  const [relayState, setRelayState] = useState(STANDALONE ? 'ready' : 'connecting');
  const [error, setError] = useState(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (STANDALONE) return undefined;
    let live = true;
    setRelayState('connecting');
    setError(null);
    workerConnection()
      .then(() => { if (live) setRelayState('ready'); })
      .catch(connectError => { if (live) { setRelayState('failed'); setError(connectError.message); } });
    return () => { live = false; };
  }, [attempt]);

  return (
    <div className="season-view-enter space-y-3">
      {relayState !== 'ready' && (
        <div className="court-panel flex flex-wrap items-center gap-3 p-4 text-sm">
          {relayState === 'connecting' ? (
            <span className="text-muted-foreground">Connecting the franchise data source…</span>
          ) : (
            <>
              <AlertTriangle className="h-4 w-4 text-trim" aria-hidden="true" />
              <span>The franchise data source is unavailable: {error}</span>
              <button
                type="button"
                onClick={() => setAttempt(value => value + 1)}
                className="ml-auto inline-flex items-center gap-2 rounded-lg border border-gold/50 bg-gold/10 px-3 py-1.5 text-xs font-semibold text-gold hover:bg-gold/20"
              >
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                Retry connection
              </button>
            </>
          )}
        </div>
      )}
      {relayState === 'ready' && (
        <iframe
          title="Franchise simulation preview"
          src={PREVIEW_PATH}
          className="h-[80vh] min-h-[720px] w-full rounded-xl border border-border/40 bg-raised/40"
        />
      )}
    </div>
  );
}