import React, { useEffect, useState } from 'react';
import { Loader2, Save, Eraser } from 'lucide-react';
import { base44 } from '@/api/base44Client';

// Account details, ported from the site's account page profile card and tied
// to this app's own account: name, contact preferences and a saved shipping
// address persist on the signed-in user record.
export default function AccountDetailsForm({ me, onSaved }) {
  const [values, setValues] = useState(() => ({
    fullName: me?.full_name || '',
    phone: me?.phone || '',
    preferredContact: me?.preferredContact || '',
    addressLine1: me?.addressLine1 || '',
    addressLine2: me?.addressLine2 || '',
    addressCity: me?.addressCity || '',
    addressState: me?.addressState || '',
    addressPostalCode: me?.addressPostalCode || '',
    addressCountry: me?.addressCountry || 'United States',
  }));
  const [savedAt, setSavedAt] = useState(me?.details_saved_at ? new Date(me.details_saved_at) : null);
  const [status, setStatus] = useState('Save the details DJ may need when following up on an order.');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setValues(current => ({ ...current, fullName: me?.full_name || current.fullName }));
  }, [me?.full_name]);
  const change = (field, value) => setValues(current => ({ ...current, [field]: value }));

  const save = async event => {
    event.preventDefault();
    setBusy(true);
    try {
      const updated = await base44.auth.updateMe({ ...values, details_saved_at: new Date().toISOString() });
      setSavedAt(new Date());
      if (onSaved) onSaved(updated);
      setStatus('Details saved to your account.');
    } catch (error) {
      setStatus(error?.message || 'The details could not be saved. Try again shortly.');
    } finally {
      setBusy(false);
    }
  };

  const clearDetails = async () => {
    setBusy(true);
    try {
      const updated = await base44.auth.updateMe({ phone: '', preferredContact: '', addressLine1: '', addressLine2: '', addressCity: '', addressState: '', addressPostalCode: '', addressCountry: '', details_saved_at: new Date().toISOString() });
      setValues(current => ({ ...current, ...updated, fullName: me?.full_name || current.fullName }));
      if (onSaved) onSaved(updated);
      setStatus('Saved details cleared. Your name and email stay on the account.');
    } catch (error) {
      setStatus(error?.message || 'The details could not be cleared. Try again shortly.');
    } finally {
      setBusy(false);
    }
  };

  return <section className="court-panel space-y-4 p-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="court-kicker">Account details</p>
        <h2 className="mt-1 font-display text-2xl tracking-wide text-foreground">KEEP CONTACT DETAILS HANDY</h2>
        <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">Save the information DJ may need when following up on an order or an item you asked about. Signed in as {me?.email}.</p>
      </div>
      <span className="rounded-full border border-gold/30 bg-gold/5 px-3 py-1 font-mono text-[10px] text-gold">{savedAt ? `Saved ${savedAt.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}` : 'Not saved yet'}</span>
    </div>
    <form onSubmit={save} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block"><span className="studio-control-label">Full name</span><input type="text" value={values.fullName} onChange={event => change('fullName', event.target.value)} autoComplete="name" className="studio-select" /></label>
        <label className="block"><span className="studio-control-label">Email (sign-in email, read only)</span><input type="email" value={me?.email || ''} readOnly disabled className="studio-select" /></label>
        <label className="block"><span className="studio-control-label">Phone</span><input type="tel" value={values.phone} onChange={event => change('phone', event.target.value)} autoComplete="tel" className="studio-select" /></label>
        <label className="block"><span className="studio-control-label">Preferred contact</span><select value={values.preferredContact} onChange={event => change('preferredContact', event.target.value)} className="studio-select"><option value="">Choose one</option><option value="Email">Email</option><option value="Phone">Phone</option><option value="Facebook">Facebook</option></select></label>
      </div>
      <fieldset className="rounded-xl border border-border/40 p-3">
        <legend className="px-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Saved shipping address</legend>
        <p className="mb-2 text-[11px] text-muted-foreground">Keep an address on file to make secure checkout faster. You can update or clear it any time.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block sm:col-span-2"><span className="studio-control-label">Street address</span><input type="text" value={values.addressLine1} onChange={event => change('addressLine1', event.target.value)} autoComplete="shipping address-line1" className="studio-select" /></label>
          <label className="block sm:col-span-2"><span className="studio-control-label">Apt, suite, etc. <span className="text-muted-foreground/70">(optional)</span></span><input type="text" value={values.addressLine2} onChange={event => change('addressLine2', event.target.value)} autoComplete="shipping address-line2" className="studio-select" /></label>
          <label className="block"><span className="studio-control-label">City</span><input type="text" value={values.addressCity} onChange={event => change('addressCity', event.target.value)} autoComplete="shipping address-level2" className="studio-select" /></label>
          <label className="block"><span className="studio-control-label">State</span><input type="text" value={values.addressState} onChange={event => change('addressState', event.target.value)} autoComplete="shipping address-level1" className="studio-select" /></label>
          <label className="block"><span className="studio-control-label">ZIP code</span><input type="text" value={values.addressPostalCode} onChange={event => change('addressPostalCode', event.target.value)} autoComplete="shipping postal-code" className="studio-select" /></label>
          <label className="block"><span className="studio-control-label">Country</span><input type="text" value={values.addressCountry} onChange={event => change('addressCountry', event.target.value)} autoComplete="shipping country-name" placeholder="United States" className="studio-select" /></label>
        </div>
      </fieldset>
      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" disabled={busy} className="inline-flex items-center gap-2 rounded-lg border border-gold/40 bg-gold/10 px-4 py-2 text-xs font-semibold uppercase tracking-widest text-gold transition-colors hover:bg-gold/20 disabled:cursor-not-allowed disabled:opacity-40">{busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}Save details</button>
        <button type="button" onClick={clearDetails} disabled={busy} className="inline-flex items-center gap-2 rounded-lg border border-border/50 px-4 py-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground transition-colors hover:border-trim/50 hover:text-trim-ink disabled:cursor-not-allowed disabled:opacity-40"><Eraser className="h-4 w-4" aria-hidden="true" />Clear saved details</button>
        <p role="status" aria-live="polite" className="text-[11px] text-muted-foreground">{status}</p>
      </div>
    </form>
  </section>;
}