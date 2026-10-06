import React, { useState } from 'react';
import { KeyRound, Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';

// Password, ported from the site's account card: the platform owns the auth
// backend, so updates go through the emailed reset link.
export default function AccountPassword({ email }) {
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const send = async () => {
    setBusy(true);
    try {
      await base44.auth.resetPasswordRequest(email);
    } catch {
      // Always show the generic success regardless.
    } finally {
      setBusy(false);
      setSent(true);
    }
  };
  return <section className="court-panel space-y-3 p-4">
    <div>
      <p className="court-kicker">Password</p>
      <h2 className="mt-1 font-display text-2xl tracking-wide text-foreground">UPDATE YOUR PASSWORD</h2>
    </div>
    <p className="text-[11px] leading-relaxed text-muted-foreground">We email a secure password-reset link to {email || 'your sign-in email'} — the password itself is never shown or stored in the app.</p>
    {sent
      ? <p role="status" className="text-xs text-positive">If an account exists with that email, you'll receive a password reset link shortly.</p>
      : <button type="button" onClick={send} disabled={busy || !email} className="inline-flex items-center gap-2 rounded-lg border border-gold/40 bg-gold/10 px-4 py-2 text-xs font-semibold uppercase tracking-widest text-gold transition-colors hover:bg-gold/20 disabled:cursor-not-allowed disabled:opacity-40">{busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <KeyRound className="h-4 w-4" aria-hidden="true" />}{busy ? 'Sending…' : 'Email me a reset link'}</button>}
  </section>;
}