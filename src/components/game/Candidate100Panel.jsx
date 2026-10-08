import React, { useEffect, useState } from 'react';
import { Loader2, Sparkles, Target } from 'lucide-react';
import { candidate100Season, predictCandidate100Target } from '@/lib/gameSim/candidate100Source';
import { trackGa4 } from '@/lib/gaBridge';

// Candidate100 pregame forecast panel: the site's owner-manual release serves
// published pregame feature targets for the selected season; the vendored
// model predicts the selected matchup's distribution from its own verified
// checkpoint — with no target labels and features observed before the tip.
const pct = value => value == null ? '—' : `${(value * 100).toFixed(1)}%`;
const score = value => value == null ? '—' : Number(value).toFixed(1);

export default function Candidate100Panel({ year, home, away, sourceEntry }) {
  const [release, setRelease] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [predicting, setPredicting] = useState(false);
  const [prediction, setPrediction] = useState(null);
  const [predictError, setPredictError] = useState('');

  useEffect(() => {
    let active = true;
    setRelease(null);
    setPrediction(null);
    setPredictError('');
    setLoading(true);
    setError('');
    candidate100Season(year)
      .then(data => { if (active) setRelease(data); })
      .catch(e => { if (active) setError(e?.message || 'The Candidate100 release could not load.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [year]);

  if (loading) {
    return <section className="myna-panel p-4 text-xs myna-muted">Loading the Candidate100 pregame release…</section>;
  }
  if (error) {
    return <section className="myna-panel p-4 text-xs text-trim-ink">{error}</section>;
  }

  const selectedRow = release.rows.find(row =>
    (row.homeTeamRef === home?.code && row.awayTeamRef === away?.code)
    || (row.homeTeamRef === away?.code && row.awayTeamRef === home?.code)) || null;
  const entryPackage = sourceEntry?.packageId && sourceEntry?.packageVersion ? sourceEntry : null;
  const packageMatches = entryPackage
    ? entryPackage.packageId === release.snapshot.packageId && entryPackage.packageVersion === release.snapshot.packageVersion
    : null;

  const runForecast = async row => {
    if (predicting) return;
    setPredicting(true);
    setPredictError('');
    setPrediction(null);
    try {
      const result = await predictCandidate100Target(row, year);
      setPrediction(result);
      trackGa4('candidate100_forecast', { game: row.gameRef, season: year });
    } catch (e) {
      setPredictError(e?.message || 'The pregame forecast could not run.');
    } finally {
      setPredicting(false);
    }
  };

  const dist = prediction?.distribution || {};
  const homeMean = prediction?.expectedHomeScore ?? dist.home?.mean;
  const awayMean = prediction?.expectedAwayScore ?? dist.away?.mean;
  const margin = prediction?.expectedMargin ?? dist.margin?.mean;
  const winProb = prediction?.homeWinProbability ?? dist.homeWinProbability;
  const tieProb = dist.tieProbability;

  return <section className="myna-panel p-4 space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div>
        <p className="cmp-kicker myna-accent-text font-mono text-[10.4px] font-semibold uppercase tracking-[0.2em]">Candidate100 pregame forecast</p>
        <h3 className="myna-display text-lg">Published release forecast</h3>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-[10.4px] myna-muted">
        <span className="bcast-lowerthird">{release.release.predictiveReleaseStatus || release.release.releaseStatus}</span>
        <span className="bcast-lowerthird">Checkpoint {release.snapshot.checkpoint.lastObservedDate}</span>
        <span className="bcast-lowerthird">{release.snapshot.rowCount} targets · {release.snapshot.targetMode}</span>
        {packageMatches === false && <span className="bcast-lowerthird text-trim-ink">Season package advanced beyond the release snapshot</span>}
      </div>
    </div>
    <p className="text-xs myna-muted leading-relaxed">
      Historical pregame forecast: the release snapshot's features were observed through each game's
      pregame date (no target labels), and the model's independent validity confirmation is still
      pending — the owner approved predictive use by manual override on {release.release.approvalDateLocal}.
    </p>
    {selectedRow ?
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <span className="bcast-lowerthird"><span className="bcast-lowerthird__bar" />{selectedRow.awayTeamRef} @ {selectedRow.homeTeamRef} · {selectedRow.gameDateLocal}</span>
          <button type="button" onClick={() => runForecast(selectedRow)} disabled={predicting}
            className="inline-flex items-center gap-2 rounded-lg border border-gold/60 bg-gold/10 px-3 py-2 font-display text-sm tracking-wide text-gold transition hover:bg-gold/20 disabled:opacity-55">
            {predicting ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <Sparkles size={14} aria-hidden="true" />}
            {prediction ? 'Re-run forecast' : 'Run forecast'}
          </button>
        </div>
        {predictError && <p className="text-xs text-trim-ink">{predictError}</p>}
        {prediction &&
        <div className="grid gap-3 sm:grid-cols-4">
          <div className="metric-tile">
            <p className="chart-frame__kicker">{selectedRow.homeTeamRef} expected</p>
            <p className="font-display text-2xl">{score(homeMean)}</p>
          </div>
          <div className="metric-tile">
            <p className="chart-frame__kicker">{selectedRow.awayTeamRef} expected</p>
            <p className="font-display text-2xl">{score(awayMean)}</p>
          </div>
          <div className="metric-tile">
            <p className="chart-frame__kicker">Expected margin</p>
            <p className="font-display text-2xl">{margin == null ? '—' : `${margin > 0 ? '+' : ''}${Number(margin).toFixed(1)}`}</p>
          </div>
          <div className="metric-tile">
            <p className="chart-frame__kicker">{selectedRow.homeTeamRef} win probability</p>
            <p className="font-display text-2xl">{pct(winProb)}</p>
            {tieProb > 0 && <p className="mt-1 text-[10.4px] myna-muted">Tie probability {pct(tieProb)}</p>}
            <div className="myna-bar mt-2" role="presentation"><span style={{ width: `${Math.round((winProb || 0) * 100)}%`, background: 'var(--myna-accent)' }} /></div>
          </div>
        </div>}
      </div>
    :
      <div className="space-y-2">
        <p className="flex items-center gap-2 text-xs myna-muted"><Target size={13} aria-hidden="true" /> No published pregame target for this matchup — the release covers these {release.snapshot.rowCount} games:</p>
        <div className="max-h-56 overflow-y-auto rounded-xl border border-border/35">
          <table className="w-full text-xs">
            <thead><tr>
              <th scope="col" className="px-3 py-2 text-left font-mono text-[10.4px] uppercase tracking-wider">Date</th>
              <th scope="col" className="px-3 py-2 text-left font-mono text-[10.4px] uppercase tracking-wider">Matchup</th>
              <th scope="col" className="px-3 py-2 text-right font-mono text-[10.4px] uppercase tracking-wider">Forecast</th>
            </tr></thead>
            <tbody>
              {release.rows.map(row =>
                <tr key={row.gameRef}>
                  <td className="px-3 py-1.5 myna-mono">{row.gameDateLocal}</td>
                  <td className="px-3 py-1.5">{row.awayTeamRef} @ {row.homeTeamRef}</td>
                  <td className="px-3 py-1.5 text-right">
                    <button type="button" onClick={() => runForecast(row)} disabled={predicting}
                      className="rounded-lg border border-gold/50 bg-gold/10 px-2.5 py-1 font-display text-xs tracking-wide text-gold transition hover:bg-gold/20 disabled:opacity-55">
                      {predicting ? <Loader2 size={12} className="inline animate-spin" aria-hidden="true" /> : 'Run'}
                    </button>
                  </td>
                </tr>)}
            </tbody>
          </table>
        </div>
      </div>}
  </section>;
}