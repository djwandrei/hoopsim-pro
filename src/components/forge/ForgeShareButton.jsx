import React, { useEffect, useRef, useState } from 'react';
import { Check, Link2 } from 'lucide-react';

// One shared "copy build link" action for the finished forge drafts: the
// encoded picks ride the ?build= param of the page URL.
export default function ForgeShareButton({ encode }) {
  const [copied, setCopied] = useState(false);
  const [fallback, setFallback] = useState('');
  const timer = useRef(null);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const share = async () => {
    if (!encode) return;
    const url = `${window.location.origin}${window.location.pathname}?${encode()}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true); setFallback(''); window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), 1800);
    } catch { setFallback(url); }
  };
  return <div><button type="button" onClick={share} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-royal/40 bg-royal/10 px-4 text-xs font-semibold uppercase tracking-wider text-royal-ink transition-colors hover:bg-royal/20">
    {copied ? <Check className="h-3.5 w-3.5" /> : <Link2 className="h-3.5 w-3.5" />}{copied ? 'Build link copied' : 'Copy build link'}
  </button>{fallback && <label className="mt-2 block text-xs">Copy this build link:<input readOnly value={fallback} onFocus={event => event.target.select()} className="studio-input mt-1 w-full" /></label>}</div>;
}
