import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { ShieldCheck } from 'lucide-react';

const TERMS_VERSION = '2026-10-06';
const ELIGIBLE_STATES = [
  ['AZ', 'Arizona'], ['CO', 'Colorado'], ['CT', 'Connecticut'], ['DC', 'Washington, D.C.'],
  ['IL', 'Illinois'], ['IN', 'Indiana'], ['IA', 'Iowa'], ['KS', 'Kansas'], ['KY', 'Kentucky'],
  ['LA', 'Louisiana'], ['MD', 'Maryland'], ['MA', 'Massachusetts'], ['MI', 'Michigan'],
  ['NH', 'New Hampshire'], ['NJ', 'New Jersey'], ['NC', 'North Carolina'], ['OH', 'Ohio'],
  ['PA', 'Pennsylvania'], ['RI', 'Rhode Island'], ['TN', 'Tennessee'], ['VA', 'Virginia'],
  ['VT', 'Vermont'], ['WV', 'West Virginia'], ['WY', 'Wyoming'],
];

const ageFromDob = dob => {
  const birth = new Date(`${dob}T00:00:00Z`);
  if (Number.isNaN(birth.getTime())) return null;
  // Exact calendar age (same math the server enforces), never the
  // average-year approximation that can round someone up a day early.
  const now = new Date();
  let age = now.getUTCFullYear() - birth.getUTCFullYear();
  const monthDelta = now.getUTCMonth() - birth.getUTCMonth();
  if (monthDelta < 0 || (monthDelta === 0 && now.getUTCDate() < birth.getUTCDate())) age -= 1;
  return age;
};

// The eligibility gate for the real-money book: 21+ attestation backed by a
// date of birth, licensed-state selection, house-rule terms and the
// responsible-gaming acknowledgement — all stored server-side with the
// account and enforced by every real-money function.
export default function RealMoneyGate({ onAccepted }) {
  const [dob, setDob] = useState('');
  const [state, setState] = useState('');
  const [ageOk, setAgeOk] = useState(false);
  const [termsOk, setTermsOk] = useState(false);
  const [rgOk, setRgOk] = useState(false);
  const [fundsOk, setFundsOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const age = dob ? ageFromDob(dob) : null;
  const valid = age !== null && age >= 21 && Boolean(state) && ageOk && termsOk && rgOk && fundsOk;

  const submit = async event => {
    event.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    setError('');
    try {
      await base44.functions.invoke('realBookEnroll', { dob, state });
      onAccepted();
    } catch (caught) {
      setError(caught?.response?.data?.error || caught?.message || 'Could not save your eligibility details. Try again.');
    }
    setBusy(false);
  };

  return <section className="court-panel mx-auto max-w-2xl p-6" aria-label="Real-money eligibility gate">
    <p className="bcast-kicker mb-2"><ShieldCheck className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />Restricted access</p>
    <h2 className="font-display text-2xl tracking-wide text-foreground">REAL-MONEY ELIGIBILITY</h2>
    <p className="mt-2 text-xs leading-relaxed text-muted-foreground">Real-money wagering is heavily restricted. Every detail below is recorded with your account, enforced server-side, and may be re-verified. You must be at least 21 and physically located in a state where online sports betting is licensed.</p>
    <form onSubmit={submit} className="mt-5 space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block"><span className="studio-control-label">Date of birth</span>
          <input type="date" required value={dob} onChange={event => setDob(event.target.value)} className="studio-select" /></label>
        <label className="block"><span className="studio-control-label">State of residence</span>
          <select required value={state} onChange={event => setState(event.target.value)} className="studio-select">
            <option value="">Select your state</option>
            {ELIGIBLE_STATES.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
          </select></label>
      </div>
      {dob && age !== null && age < 21 && <p className="text-xs font-semibold text-trim-ink">Based on that date of birth you are under 21 and cannot enter the real-money book.</p>}
      <div className="space-y-2.5 text-xs leading-relaxed text-foreground">
        <label className="flex items-start gap-2.5"><input type="checkbox" checked={ageOk} onChange={event => setAgeOk(event.target.checked)} className="mt-0.5" /><span>I am at least 21 years old and will be physically located in my selected state whenever I wager.</span></label>
        <label className="flex items-start gap-2.5"><input type="checkbox" checked={termsOk} onChange={event => setTermsOk(event.target.checked)} className="mt-0.5" /><span>I accept the real-money house rules: official finals settle every wager, correlated same-game parlays are refused, maximum $500 staked per combo, and withdrawal requests are paid out within five business days.</span></label>
        <label className="flex items-start gap-2.5"><input type="checkbox" checked={rgOk} onChange={event => setRgOk(event.target.checked)} className="mt-0.5" /><span>I understand wagering carries a risk of loss. Daily deposit and loss limits apply and self-exclusion is available at any time. Problem gambling help: 1-800-GAMBLER.</span></label>
        <label className="flex items-start gap-2.5"><input type="checkbox" checked={fundsOk} onChange={event => setFundsOk(event.target.checked)} className="mt-0.5" /><span>The funds I deposit are my own and from a lawful source; I am not wagering with or on behalf of any third party.</span></label>
      </div>
      {error && <p className="text-xs font-semibold text-trim-ink" role="alert">{error}</p>}
      <button type="submit" disabled={!valid || busy} className="w-full rounded-lg bg-gradient-to-r from-gold to-goldSoft py-2.5 text-xs font-bold uppercase tracking-widest text-canvas shadow-lg shadow-gold/20 transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none">{busy ? 'Verifying…' : 'Enter the real-money book'}</button>
    </form>
  </section>;
}