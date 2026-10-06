import React from 'react';
import { Check } from 'lucide-react';
import TeamMark from '@/components/studio/TeamMark';
import PlayerPortrait from '@/components/players/PlayerPortrait';

// The draft-show stage: spotlight lottery wheel, gold spin CTA, and the
// selected player announced with a broadcast lower-third ride-in.
export default function SpinStage({ pool, latest, spinning, historyCount, onSpin, roleLabel }) {
  const ready = pool?.status === 'ready';
  const eligible = ready ? pool.entries.length : null;
  const remaining = ready ? Math.max(0, eligible - historyCount) : 0;
  const canSpin = ready && remaining > 0 && !spinning;
  const entry = latest?.displayPlayer;
  const status = !ready && pool?.status !== 'dirty' ? pool?.reason || 'The wheel arms when the pool is built.'
    : pool?.status === 'dirty' ? 'Apply the new pool settings before the next spin.'
    : `Pool ready · seed ${pool.seed} · spin ${Math.min(historyCount + 1, 1000)} of ${Math.min(eligible, 1000)}`;
  return <section className="spin-stage" aria-labelledby="spin-stage-title">
    <div className="spin-stage__spot" aria-hidden="true" />
    <header className="spin-stage__head">
      <div className="min-w-0">
        <p className="bcast-kicker">Lottery draw · live from the studio</p>
        <h2 id="spin-stage-title" className="spin-stage__title">BUILD. SPIN. DISCOVER.</h2>
        <p className="spin-stage__intro">One seeded draw at a time — no repeats until the pool is rebuilt.</p>
      </div>
      {ready && <span className="bcast-lowerthird"><span className="bcast-lowerthird__bar" aria-hidden="true" />{eligible} eligible · {roleLabel}</span>}
    </header>
    <div className="spin-stage__grid">
      <div className="spin-stage__rotor">
        <div className={`spin-wheel ${spinning ? 'spin-wheel--spinning' : ''}`} aria-hidden="true"><span>SPIN</span></div>
        <button type="button" onClick={onSpin} disabled={!canSpin} className="spin-stage__cta shine-sweep">
          {spinning ? 'Drawing…' : historyCount ? `Spin next · pick ${String(historyCount + 1).padStart(2, '0')}` : 'Spin first pick'}
        </button>
        <p className="spin-stage__note">{ready ? remaining === 0 ? 'Pool complete. Rebuild to replay from the first pick.' : remaining < eligible ? `${remaining} eligible ${remaining === 1 ? 'player' : 'players'} remain · no repeats.` : 'Every draw is seeded and verifiable — the replay receipt is below.' : 'Build a pool in the control desk to arm the wheel.'}</p>
      </div>
      <div className="spin-stage__outcome" aria-live="polite">
        {latest ? <div key={latest.spinNumber} className="spin-pick broadcast-in-l">
          <p className="spin-pick__kicker"><Check className="h-3.5 w-3.5" aria-hidden="true" />Pick {String(latest.spinNumber).padStart(2, '0')} confirmed</p>
          <div className="spin-pick__row">
            <PlayerPortrait player={entry} className="h-32 w-28 shrink-0" />
            <div className="min-w-0">
              <h3 className="spin-pick__name">{entry.name}</h3>
              <p className="spin-pick__context">{entry.positions.join(' / ')} · {entry.seasonStartYear}–{String(entry.seasonStartYear + 1).slice(-2)} · Source games {entry.games}</p>
              <div className="spin-pick__teams">{(entry.teamCodes || []).map(code => <span key={code} className="spin-pick__team"><TeamMark code={code} className="h-9 w-9" />{code}</span>)}</div>
            </div>
          </div>
        </div> : <div className="spin-pick spin-pick--idle">
          <p className="spin-pick__kicker">On deck</p>
          <h3 className="spin-pick__name">{pool?.status === 'ready' ? 'Ready when you are' : pool?.status === 'dirty' ? 'Pool settings changed' : 'Wheel is idle'}</h3>
          <p className="spin-pick__context">{pool?.status === 'ready' ? 'Spin the wheel to put the first player on stage.' : pool?.reason || 'Your first pick will appear here.'}</p>
        </div>}
        <p className="spin-stage__status" role="status">{status}</p>
      </div>
    </div>
  </section>;
}