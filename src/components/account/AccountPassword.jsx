import React from 'react';
import { KeyRound } from 'lucide-react';
import { DJHC_ACCOUNT_URL } from '@/lib/AuthContext';

export default function AccountPassword() {
  return (
    <section className="court-panel space-y-3 p-4">
      <div>
        <p className="court-kicker">Sign-in security</p>
        <h2 className="mt-1 font-display text-2xl tracking-wide text-foreground">PASSWORD HELP</h2>
      </div>
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        Sign in, request a password reset, and update your customer account securely on the DJHC storefront.
      </p>
      <a
        href={DJHC_ACCOUNT_URL}
        className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-gold/40 bg-gold/10 px-4 text-xs font-semibold uppercase tracking-widest text-gold transition-colors hover:bg-gold/20"
      >
        <KeyRound className="h-4 w-4" aria-hidden="true" />
        Sign in or reset password
      </a>
    </section>
  );
}
