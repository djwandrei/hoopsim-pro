import React from 'react';
import { ArrowRight, Crosshair, Sparkles } from 'lucide-react';
import { Image } from '@/components/ui/image';
import { playerAsset, teamAsset } from '@/components/studio/teamAssets';
import { roleOf } from '@/components/dailyGames/lineupRoles';
import { DESK_CATEGORIES, deskTotals } from '@/components/dailyGames/draftDesk';

// Live draft desk: pick slots fill in as rounds are chosen, the side panel
// tracks combined output, unfilled roles, stat gaps, and a best-fit suggestion
// for the round currently on the board.
export default function DraftDesk({ rounds = [], picks = {}, roster = [], needs = [], fit = null, activeRound = null, onSelectRound, complete = false }) {
  const totals = deskTotals(roster);
  const filled = rounds.filter(round => picks[round.roundId]).length;

  return (
    <section className="dg-desk" aria-label="Draft desk — your picks and remaining needs">
      <div className="dg-desk__roster">
        <header className="dg-desk__head">
          <div>
            <span className="bcast-kicker">Draft desk</span>
            <h3 className="dg-desk__title">Your five, live</h3>
          </div>
          <span className="dg-desk__count">{filled}/5 drafted</span>
        </header>
        <ul className="dg-desk__slots">
          {rounds.map(round => {
            const ref = picks[round.roundId];
            const player = ref ? round.candidates.find(candidate => candidate.playerRef === ref) : null;
            const isActive = activeRound?.roundId === round.roundId && !player;
            const logo = teamAsset(round.teamCode);
            const headshot = player ? playerAsset(player.headshotPath || null) : null;
            return (
              <li key={round.roundId} className={`dg-desk__slot ${player ? 'is-filled' : 'is-open'} ${isActive ? 'is-active' : ''}`}>
                {player ? (
                  <>
                    {headshot ? <Image src={headshot} alt="" fittingType="fit" className="dg-desk__shot" /> : <span className="dg-desk__initials" aria-hidden="true">{(player.displayName || '?').slice(0, 1)}</span>}
                    <span className="min-w-0">
                      <span className="dg-desk__name block truncate">{player.displayName}</span>
                      <span className="dg-desk__meta">
                        {logo && <img src={logo} alt="" className="dg-desk__logo" />}
                        <span>R{round.roundNumber} · {round.teamCode}</span>
                        <span className="dg-desk__role">{roleOf(player)}</span>
                      </span>
                    </span>
                    <span className="dg-desk__stat">
                      {DESK_CATEGORIES.map(cat => {
                        const value = player.publicStats?.[cat.key];
                        return Number.isFinite(value) ? <span key={cat.key}>{value.toFixed(1)} <b>{cat.label}</b></span> : null;
                      })}
                    </span>
                  </>
                ) : (
                  <button type="button" className="dg-desk__open" onClick={() => onSelectRound?.(round)}>
                    <span className="dg-desk__round">R{round.roundNumber} · {round.teamCode} — open slot</span>
                    <span className="dg-desk__open-hint"><ArrowRight className="h-3 w-3" /> Go to this round</span>
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </div>
      <aside className="dg-desk__side">
        <div className="dg-desk__totals">
          {DESK_CATEGORIES.map(cat => (
            <div key={cat.key} className="dg-tile">
              <span className="dg-tile-label">Combined {cat.label}</span>
              <span className="dg-tile-value">{totals[cat.key].toFixed(1)}</span>
            </div>
          ))}
        </div>
        <div className="dg-desk__needs">
          <h4 className="dg-desk__needs-title"><Crosshair className="h-3 w-3" /> Still needed</h4>
          {complete ? (
            <p className="dg-desk__empty">All five slots are filled — lock in the draft to score it.</p>
          ) : needs.length ? (
            <ul className="dg-desk__need-list">
              {needs.map(need => (
                <li key={`${need.kind}-${need.label}`} className={`dg-desk__need ${need.kind === 'stat' ? 'dg-desk__need--stat' : ''}`} title={need.detail}>
                  <strong>{need.label}</strong>
                  <span>{need.kind === 'role' ? need.role : need.detail}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="dg-desk__empty">Your five covers every role — draft the best producer left on the board.</p>
          )}
        </div>
        {fit && activeRound && !complete && (
          <div className="dg-desk__fit">
            <h4 className="dg-desk__fit-title"><Sparkles className="h-3 w-3" /> Suggestion · Round {activeRound.roundNumber} ({activeRound.teamCode})</h4>
            <p className="dg-desk__fit-player">{fit.candidate.displayName}</p>
            <ul className="dg-desk__fit-reasons">
              {fit.reasons.map(reason => (
                <li key={reason} className="dg-desk__need dg-desk__need--stat"><strong>{reason}</strong></li>
              ))}
            </ul>
          </div>
        )}
      </aside>
    </section>
  );
}