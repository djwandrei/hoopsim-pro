import React, { useState } from 'react';
import { Check, Link2 } from 'lucide-react';

// One shared "copy build link" action for the finished forge drafts: the
// encoded picks ride the ?build= param of the page URL.
export default function ForgeShareButton({ encode }) {
  const [copied, setCopied] = useState(false);
  const share = async () => {
    if (!encode) return;
    await navigator.clipboard.writeText(`${window.location.origin}${window.location.pathname}?${encode()}`);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };
  return <button type="button" onClick={share} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-royal/40 bg-royal/10 px-4 text-xs font-semibold uppercase tracking-wider text-royal-ink transition-colors hover:bg-royal/20">
    {copied ? <Check className="h-3.5 w-3.5" /> : <Link2 className="h-3.5 w-3.5" />}{copied ? 'Build link copied' : 'Copy build link'}
  </button>;
}