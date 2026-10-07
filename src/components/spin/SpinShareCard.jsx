import React, { useState } from 'react';
import { Check, Copy, Dices } from 'lucide-react';

const encode = value => btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const decode = text => {
  const padded = text.replace(/-/g, '+').replace(/_/g, '/');
  return JSON.parse(atob(padded + '='.repeat((4 - (padded.length % 4)) % 4)));
};

// A ?draw= link from a friend: the shared draw's verification essentials.
export function readSharedDraw(search) {
  try {
    const raw = new URLSearchParams(search).get('draw');
    if (!raw) return null;
    const draw = decode(raw);
    if (draw?.v !== 1) return null;
    return { seed: draw.s || '', poolHash: draw.p || '', selectionHash: draw.h || '' };
  } catch { return null; }
}

const short = value => (value ? `${String(value).slice(0, 12)}…` : '—');

// Compact draw card: the replay seed and pool/selection hashes with a one-tap
// copy link, plus a strip for a draw received from a shared link.
export default function SpinShareCard({ latest, pool, received, onClearReceived }) {
  const [copied, setCopied] = useState(false);
  const receipt = latest?.pool?.receipt || pool?.receipt;
  const poolHash = latest?.spin?.poolHash || receipt?.poolHash;
  const selectionHash = latest?.spin?.selectionHash;
  const seed = receipt?.seed;
  const share = async () => {
    const query = new URLSearchParams({ draw: encode({ v: 1, s: seed ?? '', p: poolHash || '', h: selectionHash || '' }) }).toString();
    await navigator.clipboard.writeText(`${window.location.origin}${window.location.pathname}?${query}`);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };
  return <div className="court-panel p-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="court-kicker flex items-center gap-2"><Dices className="h-4 w-4" />Draw share card</p>
      <button type="button" onClick={share} disabled={!seed && !poolHash} className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-gold/40 bg-gold/10 px-3 text-[10.4px] font-semibold uppercase tracking-widest text-gold transition-colors hover:bg-gold/20 disabled:cursor-not-allowed disabled:opacity-40">
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}{copied ? 'Link copied' : 'Copy draw link'}
      </button>
    </div>
    {received && <div className="mt-3 rounded-xl border border-royal/40 bg-royal/10 p-3">
      <p className="text-xs font-semibold text-foreground">Shared draw received</p>
      <p className="mt-1 break-all font-mono text-[11px] text-muted-foreground">Seed {received.seed || '—'} · pool {short(received.poolHash)} · selection {short(received.selectionHash)}</p>
      <p className="mt-1 text-[10.4px] text-muted-foreground">Compare these against your own receipt below.</p>
      {onClearReceived && <button type="button" onClick={onClearReceived} className="mt-2 text-[10.4px] font-semibold uppercase tracking-widest text-royal transition-colors hover:underline">Clear</button>}
    </div>}
    <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
      <div className="rounded-lg border border-border/35 bg-raised/30 px-2 py-2"><dt className="text-[10px] uppercase tracking-widest text-muted-foreground">Replay seed</dt><dd className="mt-0.5 truncate font-mono text-xs text-foreground">{seed ?? '—'}</dd></div>
      <div className="rounded-lg border border-border/35 bg-raised/30 px-2 py-2"><dt className="text-[10px] uppercase tracking-widest text-muted-foreground">Pool hash</dt><dd className="mt-0.5 truncate font-mono text-xs text-foreground">{short(poolHash)}</dd></div>
      <div className="rounded-lg border border-border/35 bg-raised/30 px-2 py-2"><dt className="text-[10px] uppercase tracking-widest text-muted-foreground">Selection hash</dt><dd className="mt-0.5 truncate font-mono text-xs text-foreground">{short(selectionHash)}</dd></div>
    </dl>
  </div>;
}