import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, LogOut, UserRound, Dice5 } from 'lucide-react';
import StudioShell from '@/components/studio/StudioShell';
import WorkbenchHeader from '@/components/studio/WorkbenchHeader';
import usePageMeta from '@/hooks/usePageMeta';
import AccountDetailsForm from '@/components/account/AccountDetailsForm';
import AccountPassword from '@/components/account/AccountPassword';
import AccountActivity from '@/components/account/AccountActivity';
import { base44 } from '@/api/base44Client';

// Account — the studio's native version of the site's account.html: contact
// details and saved address on the app account, password reset link, wishlist
// link-out to the site, and sportsbook checkout activity.
export default function Account() {
  usePageMeta({ title: 'Your Account — SwishIQ Studio', description: 'Manage your account details, saved shipping address, password and sportsbook checkout activity.' });
  const [state, setState] = useState('loading'); // loading | anonymous | ready
  const [me, setMe] = useState(null);

  useEffect(() => {
    let active = true;
    base44.auth.me()
      .then(user => { if (active) { setMe(user); setState('ready'); } })
      .catch(() => { if (active) setState('anonymous'); });
    return () => { active = false; };
  }, []);

  const signOut = async () => {
    await base44.auth.logout('/account');
  };

  return <StudioShell active="/account">
    <WorkbenchHeader
      title="YOUR ACCOUNT"
      description="Manage the few details that help with checkout, keep an eye on saved items, and review sportsbook checkout activity."
      state={state === 'loading' ? 'loading' : 'ready'}
      status={state === 'ready' ? `Signed in as ${me?.email}` : state === 'anonymous' ? 'Not signed in' : 'Checking your account'}
    />
    <main className="mx-auto min-w-0 max-w-4xl space-y-5 px-4 py-6 sm:px-6">
      {state === 'loading' && <div className="court-panel grid place-items-center p-14 text-sm text-muted-foreground"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" aria-hidden="true" />Loading your account…</div>}
      {state === 'anonymous' && <section className="court-panel mx-auto max-w-md space-y-4 p-6 text-center">
        <UserRound className="mx-auto h-10 w-10 text-gold" aria-hidden="true" />
        <h2 className="font-display text-2xl tracking-wide text-foreground">SIGN IN TO YOUR ACCOUNT</h2>
        <p className="text-xs leading-relaxed text-muted-foreground">Sign in to review checkout orders tied to your email, save contact details, and manage your sportsbook wallet.</p>
        <button type="button" onClick={() => base44.auth.redirectToLogin('/account')} className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-gold to-goldSoft px-5 py-2.5 text-xs font-bold uppercase tracking-widest text-canvas shadow-lg shadow-gold/20 transition-all hover:brightness-110">Sign in</button>
        <p className="flex flex-wrap justify-center gap-3 text-[11px] text-muted-foreground"><Link to="/book" className="inline-flex items-center gap-1.5 text-gold hover:underline"><Dice5 className="h-3 w-3" aria-hidden="true" />Back to the Sportsbook</Link></p>
      </section>}
      {state === 'ready' && <div className="space-y-5">
        <AccountDetailsForm me={me} onSaved={setMe} />
        <div className="grid items-start gap-5 lg:grid-cols-2">
          <AccountPassword email={me?.email} />
          <section className="court-panel space-y-3 p-4">
            <div>
              <p className="court-kicker">Session</p>
              <h2 className="mt-1 font-display text-2xl tracking-wide text-foreground">SIGN OUT</h2>
            </div>
            <p className="text-[11px] leading-relaxed text-muted-foreground">End this browser session. Your saved details, wallet and bet history stay on your account.</p>
            <button type="button" onClick={signOut} className="inline-flex items-center gap-2 rounded-lg border border-trim/50 bg-trim/10 px-4 py-2 text-xs font-semibold uppercase tracking-widest text-trim-ink transition-colors hover:bg-trim/20"><LogOut className="h-4 w-4" aria-hidden="true" />Sign out</button>
          </section>
        </div>
        <AccountActivity />
      </div>}
    </main>
  </StudioShell>;
}