import React, { useEffect, useRef, useState } from 'react';
import { RefreshCcw } from 'lucide-react';
import usePageMeta from '@/hooks/usePageMeta';
import { mountLineupLab, unmountLineupLab } from '@/lineupLab/lineup-lab/pageBoot';

export default function LineupLab() {
  const hostRef = useRef(null);
  const [bootError, setBootError] = useState('');
  const [retryToken, setRetryToken] = useState(0);
  usePageMeta({
    title: "NBA Lineup Lab | DJ's House of Cards",
    description: 'Build historical NBA lineups and rotations with an exact optimizer, then explore each group\u2019s Lineup DNA, role coverage, and one-player tradeoffs.',
  });

  useEffect(() => {
    let active = true;
    setBootError('');
    mountLineupLab(hostRef.current).catch((error) => {
      if (active) setBootError(error?.message || 'The Lineup Lab could not be loaded right now.');
    });
    return () => {
      active = false;
      unmountLineupLab();
    };
  }, [retryToken]);

  return (
    <div className="min-h-screen">
      {bootError && (
        <div className="mx-auto max-w-2xl px-4 py-16 text-center">
          <h1 className="font-display text-3xl tracking-wide">NBA Lineup Lab</h1>
          <p className="mt-3 text-sm text-muted-foreground">{bootError}</p>
          <button
            type="button"
            onClick={() => setRetryToken(token => token + 1)}
            className="mt-6 inline-flex items-center gap-2 rounded-lg border border-gold/40 bg-gold/10 px-4 py-2 text-xs font-semibold uppercase tracking-widest text-gold hover:bg-gold/20"
          >
            <RefreshCcw className="h-3.5 w-3.5" /> Retry
          </button>
        </div>
      )}
      <div ref={hostRef} hidden={Boolean(bootError)} />
    </div>
  );
}