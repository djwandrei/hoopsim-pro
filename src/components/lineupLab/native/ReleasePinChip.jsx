import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';

// Release-pin chip: verifies the repo's vendored engine pin and the pinned
// registry against the studio's expected pin via the githubReleasePin monitor.
export default function ReleasePinChip() {
  const [pin, setPin] = useState(null);

  useEffect(() => {
    let cancelled = false;
    base44.functions.invoke('githubReleasePin', {})
      .then(res => { if (!cancelled) setPin(res.data || null); })
      .catch(() => { if (!cancelled) setPin({ status: 'unavailable' }); });
    return () => { cancelled = true; };
  }, []);

  if (!pin) return <span className="ll-health is-pending">Checking release pin…</span>;
  const label = {
    in_sync: 'Release pin verified · repo engine matches studio pin',
    drift: 'Release pin drift · repo engine differs from studio pin',
    degraded: 'Release pin partially verified · registry unreachable',
    unavailable: 'Release pin check unavailable',
  }[pin.status] || 'Release pin check unavailable';
  return <span className={`ll-health ${pin.status === 'in_sync' ? 'is-ok' : 'is-warn'}`}>{label}</span>;
}