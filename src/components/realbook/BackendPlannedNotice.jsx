import React from 'react';
import { ArrowRight, Banknote, UserRound } from 'lucide-react';
import { Link } from 'react-router-dom';
import { DJHC_ACCOUNT_URL } from '@/lib/AuthContext';

export default function BackendPlannedNotice() {
  return (
    <section className="court-panel relative mx-auto max-w-3xl overflow-hidden p-5 sm:p-8" aria-labelledby="real-book-planned-title">
      <div className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-gold/5 blur-3xl" aria-hidden="true" />
      <div className="relative">
        <span className="inline-flex items-center gap-2 rounded-full border border-gold/30 bg-gold/5 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-gold">
          <Banknote className="h-3.5 w-3.5" aria-hidden="true" />
          Planned feature
        </span>
        <h2 id="real-book-planned-title" className="mt-4 font-display text-3xl tracking-wide text-foreground sm:text-4xl">
          BACKEND NOT CONNECTED
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Real-money sportsbook services are planned for a later Studio release. This page does not show live odds or provide eligibility checks, deposits, wallet balances, withdrawals, or wager placement.
        </p>
        <p className="mt-3 max-w-2xl text-xs leading-relaxed text-muted-foreground">
          No money or account data is being processed by this page. Use the connected BookRoom for its available Studio tools, or open your existing DJHC customer account.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            to="/book"
            className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-gradient-to-r from-gold to-goldSoft px-5 text-xs font-bold uppercase tracking-widest text-canvas shadow-lg shadow-gold/20 transition-all hover:brightness-110"
          >
            Open BookRoom
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
          <a
            href={DJHC_ACCOUNT_URL}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border/50 bg-raised/40 px-5 text-xs font-semibold uppercase tracking-widest text-foreground transition-colors hover:border-gold/40 hover:text-gold"
          >
            <UserRound className="h-4 w-4" aria-hidden="true" />
            DJHC customer account
          </a>
        </div>
      </div>
    </section>
  );
}
