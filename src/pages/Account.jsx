import React from 'react';
import { UserRound } from 'lucide-react';
import StudioShell from '@/components/studio/StudioShell';
import WorkbenchHeader from '@/components/studio/WorkbenchHeader';
import usePageMeta from '@/hooks/usePageMeta';
import AccountDetailsForm from '@/components/account/AccountDetailsForm';
import AccountPassword from '@/components/account/AccountPassword';
import AccountActivity from '@/components/account/AccountActivity';
import { useAuth } from '@/lib/AuthContext';

export default function Account() {
  usePageMeta({
    title: 'Your Account — SwishIQ Studio',
    description: 'Use the existing DJHC storefront for customer sign-in and account management. Studio saves remain local to this browser.',
  });
  const { isAuthenticated, user } = useAuth();
  const status = isAuthenticated && user?.email ? `Signed in as ${user.email}` : 'Guest mode — public Studio';

  return (
    <StudioShell active="/account">
      <WorkbenchHeader
        title="YOUR ACCOUNT"
        description="SwishIQ Studio is public. Customer identity and account actions stay with the existing DJHC storefront; Studio saves remain local to this browser."
        state="ready"
        status={status}
      />
      <main className="mx-auto min-w-0 max-w-4xl space-y-5 px-4 py-6 sm:px-6">
        <section className="court-panel flex items-start gap-4 p-4" aria-label="Studio account status">
          <UserRound className="mt-1 h-7 w-7 shrink-0 text-gold" aria-hidden="true" />
          <div>
            <h2 className="font-display text-2xl tracking-wide text-foreground">PUBLIC STUDIO ACCESS</h2>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              This page does not create a second customer identity or collect sign-in details. Use the DJHC account page for your store profile, wishlist, orders, sign-in, and password help.
            </p>
          </div>
        </section>
        <div className="grid items-start gap-5 lg:grid-cols-2">
          <AccountDetailsForm />
          <AccountPassword />
        </div>
        <AccountActivity />
      </main>
    </StudioShell>
  );
}
