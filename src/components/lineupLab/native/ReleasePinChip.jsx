import React, { useEffect, useState } from 'react';
import { DATA_PINS } from '@/lib/site/dataPins';
import { verifiedJson } from '@/lib/site/verifiedAssets';
const PATH = 'v4/releases/v4-site-12ad90dc8710/registry.json';
export default function ReleasePinChip() {
  const [state, setState] = useState('pending');
  useEffect(() => {
    let cancelled = false;
    verifiedJson(`/tools/swishiq-studio/data/${PATH}`, DATA_PINS[PATH], 'Studio registry')
      .then(() => { if (!cancelled) setState('ok'); })
      .catch(() => { if (!cancelled) setState('warn'); });
    return () => { cancelled = true; };
  }, []);
  return <span className={`ll-health is-${state}`}>{state === 'ok' ? 'Published data registry verified' : state === 'warn' ? 'Registry verification unavailable' : 'Checking published data registry…'}</span>;
}
