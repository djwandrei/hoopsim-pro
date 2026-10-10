import React, { useEffect, useState } from 'react';
import { BadgeDollarSign, FileCheck2, ShieldAlert, UserRoundX } from 'lucide-react';
import { goldButton, ghostButton, pillClass } from './franchiseUi';

const money = value => Number.isFinite(value)
  ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value)
  : 'Unknown';

const outcomeKind = outcome => outcome === 'confirmed-legal' ? 'green'
  : outcome === 'scenario-compliant' ? 'amber' : outcome === 'illegal' ? 'error' : 'slate';

export default function FranchiseRosterContracts({ sim, view }) {
  const contracts = view.contracts;
  const [selectedPlayer, setSelectedPlayer] = useState('');
  const [allowProvisionalSandbox, setAllowProvisionalSandbox] = useState(false);
  const waiverChoices = contracts?.roster?.filter(row => row.availableForWaiver) ?? [];
  const selectedWaiverPlayer = waiverChoices.some(row => row.name === selectedPlayer)
    ? selectedPlayer : waiverChoices[0]?.name ?? '';

  useEffect(() => {
    setAllowProvisionalSandbox(false);
  }, [contracts?.evaluation?.status, contracts?.evaluation?.playerName, contracts?.evaluation?.stale]);

  if (contracts?.empty) {
    return (
      <section className="court-panel frx-panel space-y-2 p-4" aria-labelledby="frx-contracts-title">
        <div className="flex items-center gap-2.5">
          <span className="frx-head-icon"><BadgeDollarSign className="h-4 w-4" aria-hidden="true" /></span>
          <div><p className="bcast-kicker">Contracts &amp; payroll</p><h3 className="frx-title" id="frx-contracts-title">Roster state</h3></div>
        </div>
        <p className="frx-note">{contracts.text}</p>
      </section>
    );
  }

  const { payroll, roster, evaluation } = contracts;
  return (
    <section className="court-panel frx-panel space-y-3 p-4" aria-labelledby="frx-contracts-title" aria-busy={view.busy}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className="frx-head-icon"><BadgeDollarSign className="h-4 w-4" aria-hidden="true" /></span>
          <div><p className="bcast-kicker">Front office</p><h3 className="frx-title" id="frx-contracts-title">Contracts &amp; payroll</h3></div>
        </div>
        <span className={pillClass(payroll.status === 'reconciled' ? 'green' : 'amber')}>{payroll.status}</span>
      </div>
      <p className="frx-note">{contracts.teamName} · {contracts.seasonStartYear}–{String(contracts.seasonStartYear + 1).slice(-2)} · {contracts.transactionWindow} window · {contracts.mode} state</p>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-border/50 bg-raised/30 p-2.5"><small className="frx-note">Total team salary</small><strong className="block text-sm">{money(payroll.totalTeamSalaryUsd)}</strong></div>
        <div className="rounded-lg border border-border/50 bg-raised/30 p-2.5"><small className="frx-note">Apron salary</small><strong className="block text-sm">{money(payroll.apronTeamSalaryUsd)}</strong></div>
        <div className="rounded-lg border border-border/50 bg-raised/30 p-2.5"><small className="frx-note">Tax salary</small><strong className="block text-sm">{money(payroll.taxTeamSalaryUsd)}</strong></div>
        <div className="rounded-lg border border-border/50 bg-raised/30 p-2.5"><small className="frx-note">Payroll evidence</small><strong className="block text-sm">{payroll.sourceCount} source refs</strong></div>
      </div>
      <p className="frx-note">Rules: {contracts.rulesReferenceStatus}{payroll.rulesVersionId ? ` · ${payroll.rulesVersionId}` : ''}{payroll.unresolvedLiabilityCount !== null ? ` · ${payroll.unresolvedLiabilityCount} unresolved liabilities` : ''}</p>

      <div className="frx-roster -mx-1 overflow-x-auto">
        <table className="w-full min-w-[36rem]">
          <caption>Current-season contract terms · values show only resolved inputs</caption>
          <thead><tr><th scope="col">Player</th><th scope="col">Term status</th><th scope="col">Salary</th><th scope="col">Cap hit</th></tr></thead>
          <tbody>
            {roster.map(row => (
              <tr key={row.name}>
                <td className="font-medium">{row.name}</td>
                <td>{row.contractStatus}</td>
                <td>{money(row.salaryUsd)}</td>
                <td>{money(row.capHitUsd)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="bcast-divider" aria-hidden="true" />
      <div className="flex items-center gap-2.5">
        <span className="frx-head-icon"><UserRoundX className="h-4 w-4" aria-hidden="true" /></span>
        <div><p className="bcast-kicker">Roster move</p><h4 className="text-sm font-semibold">Evaluate a player waiver</h4></div>
      </div>
      <p className="frx-note">Evaluation reads the current worker state and does not change the roster. Approval commits the move at the current session revision and returns a roster-transition receipt.</p>
      <p className="frx-note" role="status">{contracts.transactionMessage}</p>
      {contracts.canEvaluateTransaction && (
        <div className="flex flex-wrap items-end gap-2">
          <label className="min-w-[14rem] flex-1 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Player
            <select className="mt-1 block w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-normal normal-case tracking-normal text-foreground"
              value={selectedWaiverPlayer} disabled={view.busy} onChange={event => setSelectedPlayer(event.target.value)}>
              {waiverChoices.map(row => <option key={row.name} value={row.name}>{row.name}</option>)}
            </select>
          </label>
          <button type="button" className={goldButton} disabled={view.busy || !selectedWaiverPlayer}
            onClick={() => sim.evaluateWaiverTransaction(selectedWaiverPlayer)}>
            Evaluate waiver
          </button>
        </div>
      )}

      {evaluation?.stale && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3" role="status">
          <p className="frx-note">The {evaluation.playerName} evaluation was for revision {evaluation.evaluatedRevision}; the current session is revision {evaluation.currentRevision}. Re-evaluate before approval.</p>
        </div>
      )}
      {evaluation && !evaluation.stale && (
        <div className="space-y-2 rounded-lg border border-border/60 bg-raised/25 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <FileCheck2 className="h-4 w-4 text-gold" aria-hidden="true" />
            <strong className="text-sm">{evaluation.playerName} · {evaluation.legalityOutcome.replaceAll('-', ' ')}</strong>
            <span className={pillClass(outcomeKind(evaluation.legalityOutcome))}>{evaluation.status}</span>
            <span className="frx-pill frx-pill--slate">{evaluation.evidenceBasis}</span>
          </div>
          {evaluation.violations?.length > 0 && <ul className="list-disc space-y-1 pl-5 text-xs text-destructive">{evaluation.violations.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul>}
          {evaluation.blockedReasons?.length > 0 && <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">{evaluation.blockedReasons.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul>}
          {evaluation.missingInputs?.length > 0 && <div className="rounded-md border border-amber-500/20 bg-amber-500/5 p-2"><p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-amber-200"><ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />Missing or unresolved inputs</p><ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">{evaluation.missingInputs.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul></div>}
          {contracts.needsSandboxApproval && (
            <label className="flex items-start gap-2 text-xs text-amber-100">
              <input type="checkbox" checked={allowProvisionalSandbox} disabled={view.busy}
                onChange={event => setAllowProvisionalSandbox(event.target.checked)} />
              <span>Allow this provisional move to update the local Provisional Sandbox state with unresolved legal or payroll inputs.</span>
            </label>
          )}
          <button type="button" className={ghostButton} disabled={view.busy || !contracts.canApproveTransaction
            || evaluation.playerName !== selectedWaiverPlayer || (contracts.needsSandboxApproval && !allowProvisionalSandbox)}
            onClick={() => sim.approveWaiverTransaction(allowProvisionalSandbox)}>
            Approve &amp; commit waiver
          </button>
        </div>
      )}
      {contracts.latestTransaction && (
        <p className="frx-note">Latest committed transaction: {contracts.latestTransaction.kind} · {contracts.latestTransaction.status} · LeagueState revision {contracts.latestTransaction.revisionAfter}.</p>
      )}
    </section>
  );
}
