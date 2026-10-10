/* Candidate57-only uncertainty tuning. Original frozen sources are preserved. */
export const VERSION = 'swishiq-candidate57-configurable-paired-uncertainty-v7';
const mean = values => values.reduce((s, v) => s + v, 0) / values.length;
const finite = Number.isFinite;
const day = date => Date.parse(date + 'T00:00:00Z') / 86400000;
const validDate = date => typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)
  && Number.isFinite(day(date)) && new Date(day(date) * 86400000).toISOString().slice(0, 10) === date;
export const DEFAULT_SETTINGS = Object.freeze({ residualWindowGames: 1500, poolMode: 'stratified', regimeThreshold: 6,
  minimumStratumResiduals: 100, stratumPriorGames: 0, kernelBandwidthMargin: 6, residualAgeHalfLifeDays: null,
  totalResidualScale: 1, marginResidualScale: 1, totalMarginCorrelationRetention: 1,
  varianceAdaptationBlend: 0, varianceWindowGames: 200, gaussianBlend: 0, conditionalVarianceBlend: 0, conditionalVarianceRidge: 500, conditionalVarianceHeads: 'scores', totalBiasRetention: 0, marginBiasRetention: 0, biasWindowGames: 500, integerScoreSupport: false, integerTieMode: 'split-point', residualCalendarMode: 'rolling' });

export function buildCandidate57ConfiguredDistribution({ prediction: originalPrediction, residualPool, targetDate, targetSeasonStartYear, settings = {} }) {
  const s = { ...DEFAULT_SETTINGS, ...settings };
  let prediction=originalPrediction;
  if (!['stratified', 'full', 'kernel'].includes(s.poolMode) || !Number.isSafeInteger(s.residualWindowGames) || s.residualWindowGames < 100
    || !finite(s.regimeThreshold) || s.regimeThreshold <= 0 || s.minimumStratumResiduals !== 100
    || !finite(s.stratumPriorGames) || s.stratumPriorGames < 0 || !finite(s.kernelBandwidthMargin) || s.kernelBandwidthMargin <= 0
    || (s.residualAgeHalfLifeDays !== null && (!finite(s.residualAgeHalfLifeDays) || s.residualAgeHalfLifeDays <= 0))
    || !finite(s.totalResidualScale) || s.totalResidualScale <= 0 || !finite(s.marginResidualScale) || s.marginResidualScale <= 0
    || !finite(s.totalMarginCorrelationRetention) || s.totalMarginCorrelationRetention < 0 || s.totalMarginCorrelationRetention > 1
    || !finite(s.varianceAdaptationBlend) || s.varianceAdaptationBlend < 0 || s.varianceAdaptationBlend > 1
    || !Number.isSafeInteger(s.varianceWindowGames) || s.varianceWindowGames < 100
    || !finite(s.gaussianBlend) || s.gaussianBlend < 0 || s.gaussianBlend > 1
    || !finite(s.conditionalVarianceBlend) || s.conditionalVarianceBlend < 0 || s.conditionalVarianceBlend > 1
    || !finite(s.conditionalVarianceRidge) || s.conditionalVarianceRidge <= 0 || !['scores','total-margin'].includes(s.conditionalVarianceHeads)
    || !finite(s.totalBiasRetention) || s.totalBiasRetention < 0 || s.totalBiasRetention > 1
    || !finite(s.marginBiasRetention) || s.marginBiasRetention < 0 || s.marginBiasRetention > 1
    || !Number.isSafeInteger(s.biasWindowGames) || s.biasWindowGames < 100
    || !['split-point','condition-no-tie'].includes(s.integerTieMode)
    || typeof s.integerScoreSupport !== 'boolean' || (s.integerScoreSupport && s.gaussianBlend!==0)
    || !['rolling','prior-season'].includes(s.residualCalendarMode)
    || (s.residualCalendarMode==='prior-season'&&!Number.isSafeInteger(targetSeasonStartYear))
    || !finite(prediction.total) || !finite(prediction.margin)) throw TypeError('Invalid Candidate57 uncertainty settings');
  if (!validDate(targetDate) || !Array.isArray(residualPool)) throw TypeError('Valid target date and chronological residual array required');
  const eligible = s.residualCalendarMode==='prior-season'?residualPool.filter(r=>r.seasonStartYear===targetSeasonStartYear-1):residualPool;
  const window = eligible.slice(-s.residualWindowGames);
  if (window.length < 100 || window.some((r, i) => !validDate(r.gameDateLocal) || r.gameDateLocal >= targetDate
    || (i > 0 && window[i - 1].gameDateLocal > r.gameDateLocal) || !finite(r.total) || !finite(r.margin) || !finite(r.predictedMargin))) throw TypeError('Residuals must be finite, chronologically ordered, and strictly prior-date');
  const biasRows=window.slice(-s.biasWindowGames);
  const bias={total:s.totalBiasRetention*mean(biasRows.map(r=>r.total)),margin:s.marginBiasRetention*mean(biasRows.map(r=>r.margin)),observedThrough:biasRows.at(-1).gameDateLocal,n:biasRows.length};
  prediction={...originalPrediction,total:originalPrediction.total+bias.total,margin:originalPrediction.margin+bias.margin};
  const regime = Math.abs(prediction.margin) < s.regimeThreshold ? 'close' : 'blowout';
  const matched = window.map(r => (Math.abs(r.predictedMargin) < s.regimeThreshold ? 'close' : 'blowout') === regime);
  const count = matched.filter(Boolean).length;
  const fallback = count < 100;
  const fraction = count / (count + s.stratumPriorGames);
  let weighted = window.map((r, i) => {
    let weight = 1;
    if (s.poolMode === 'stratified' && !fallback) weight = s.stratumPriorGames ? (matched[i] ? fraction / count : 0) + (1 - fraction) / window.length : Number(matched[i]);
    if (s.poolMode === 'kernel') weight = Math.exp(-0.5 * ((Math.abs(r.predictedMargin) - Math.abs(prediction.margin)) / s.kernelBandwidthMargin) ** 2);
    if (s.residualAgeHalfLifeDays !== null) weight *= 2 ** (-(day(targetDate) - day(r.gameDateLocal)) / s.residualAgeHalfLifeDays);
    return { r, weight };
  }).filter(x => x.weight > 1e-14);
  const totalWeight = weighted.reduce((v, x) => v + x.weight, 0);
  if (!finite(totalWeight) || totalWeight <= 0) throw TypeError('Empty weighted residual support');
  weighted = weighted.map(x => ({ ...x, weight: x.weight / totalWeight }));
  const expected = get => weighted.reduce((v, x) => v + x.weight * get(x.r), 0);
  const totalCenter = expected(r => r.total), marginCenter = expected(r => r.margin);
  const totalVariance = expected(r => (r.total - totalCenter) ** 2), marginVariance = expected(r => (r.margin - marginCenter) ** 2);
  if ((s.varianceAdaptationBlend > 0 || s.totalMarginCorrelationRetention < 1) && (totalVariance <= 1e-12 || marginVariance <= 1e-12)) throw TypeError('Variance adaptation requires nondegenerate prior residual variance');
  let totalScale = s.totalResidualScale, marginScale = s.marginResidualScale;
  if (s.varianceAdaptationBlend > 0) {
    const recent = window.slice(-s.varianceWindowGames);
    const recentMeanT = mean(recent.map(r => r.total)), recentMeanM = mean(recent.map(r => r.margin));
    const vt = mean(recent.map(r => (r.total - recentMeanT) ** 2)), vm = mean(recent.map(r => (r.margin - recentMeanM) ** 2));
    // Global chronological variance updates are shrunk toward the selected
    // matchup pool; no target residual participates in adaptation.
    totalScale *= Math.sqrt((1 - s.varianceAdaptationBlend) + s.varianceAdaptationBlend * vt / totalVariance);
    marginScale *= Math.sqrt((1 - s.varianceAdaptationBlend) + s.varianceAdaptationBlend * vm / marginVariance);
  }
  let rho = 0, targetRho = 0;
  if (s.totalMarginCorrelationRetention < 1) {
    rho = expected(r => (r.total - totalCenter) * (r.margin - marginCenter)) / Math.sqrt(totalVariance * marginVariance);
    if (Math.abs(rho) > 1 - 1e-10) throw TypeError('Correlation retention requires non-collinear paired residuals');
    targetRho = s.totalMarginCorrelationRetention * rho;
  }
  let pairs = weighted.map(({ r, weight }) => {
    const rt = r.total - totalCenter;
    let rm = r.margin - marginCenter;
    if (s.totalMarginCorrelationRetention < 1) rm = targetRho * Math.sqrt(marginVariance / totalVariance) * rt
      + Math.sqrt((1 - targetRho ** 2) / (1 - rho ** 2)) * (rm - rho * Math.sqrt(marginVariance / totalVariance) * rt);
    const total = prediction.total + totalScale * rt, margin = prediction.margin + marginScale * rm;
    return { total, margin, home: (total + margin) / 2, away: (total - margin) / 2, weight };
  });
  const conditional = {};
  if (s.conditionalVarianceBlend > 0) {
    if (weighted.some(({r})=>!finite(r.predictedTotal))) throw TypeError('Conditional variance requires strictly prior expected totals');
    const cx=expected(r=>r.predictedTotal/10), cy=expected(r=>Math.abs(r.predictedMargin)/5);
    const xs=weighted.map(({r})=>[r.predictedTotal/10-cx,Math.abs(r.predictedMargin)/5-cy]);
    const query=[prediction.total/10-cx,Math.abs(prediction.margin)/5-cy];
    const effectiveN=1/weighted.reduce((sum,x)=>sum+x.weight*x.weight,0);
    const prior=s.conditionalVarianceRidge/effectiveN;
    let a=prior,b=0,d=prior;
    weighted.forEach((p,i)=>{a+=p.weight*xs[i][0]**2;b+=p.weight*xs[i][0]*xs[i][1];d+=p.weight*xs[i][1]**2;});
    const fields=s.conditionalVarianceHeads==='scores'?['home','away']:['total','margin'];
    for (const field of fields) {
      const center=pairs.reduce((sum,p)=>sum+p.weight*p[field],0);
      const variance=pairs.reduce((sum,p)=>sum+p.weight*(p[field]-center)**2,0);
      if(!finite(variance)||variance<=1e-12||!finite(a*d-b*b)||a*d-b*b<=1e-12)throw TypeError('Conditional variance requires a nondegenerate head and ridge system');
      let u=0,v=0;
      pairs.forEach((p,i)=>{const sq=(p[field]-center)**2;u+=p.weight*xs[i][0]*(sq-variance);v+=p.weight*xs[i][1]*(sq-variance);});
      const slopes=[(d*u-b*v)/(a*d-b*b),(a*v-b*u)/(a*d-b*b)];
      const ratio=Math.max(.5,Math.min(2,1+s.conditionalVarianceBlend*(query[0]*slopes[0]+query[1]*slopes[1])/variance));
      conditional[field]={scale:Math.sqrt(ratio),slopes,variance,query,predictorCenter:[cx,cy],effectiveN};
    }
    pairs=pairs.map(p=>{
      if(s.conditionalVarianceHeads==='scores'){
        const home=prediction.total/2+prediction.margin/2 + conditional.home.scale*(p.home-(prediction.total+prediction.margin)/2);
        const away=prediction.total/2-prediction.margin/2 + conditional.away.scale*(p.away-(prediction.total-prediction.margin)/2);
        return {home,away,total:home+away,margin:home-away,weight:p.weight};
      }
      const total=prediction.total+conditional.total.scale*(p.total-prediction.total);
      const margin=prediction.margin+conditional.margin.scale*(p.margin-prediction.margin);
      return {total,margin,home:(total+margin)/2,away:(total-margin)/2,weight:p.weight};
    });
  }
  if(s.integerScoreSupport) {
    pairs=pairs.flatMap(p=>{
      const h=Math.max(0,Math.round(p.home)),a=Math.max(0,Math.round(p.away));
      const make=(home,away,weight)=>({home,away,total:home+away,margin:home-away,weight});
      // The final NBA score cannot tie. A deliberately simple equal-mass
      // one-point resolution keeps probability and final score support aligned.
      return h===a?(s.integerTieMode==='condition-no-tie'?[]:[make(h+1,a,p.weight/2),make(h,a+1,p.weight/2)]):[make(h,a,p.weight)];
    });
    const mass=pairs.reduce((sum,p)=>sum+p.weight,0);if(mass<=0)throw TypeError('Integer support has no final-score outcomes');
    pairs=pairs.map(p=>({...p,weight:p.weight/mass}));
  }
  const distribution = field => {
    const masses = new Map();
    for (const p of pairs) masses.set(p[field], (masses.get(p[field]) ?? 0) + p.weight);
    const support = s.gaussianBlend===1 ? [{value:prediction.total/2+(field==='home'?prediction.margin/2:field==='away'?-prediction.margin/2:0),probability:1}] : [...masses].sort((a, b) => a[0] - b[0]).map(([value, probability]) => ({ value, probability }));
    const center = pairs.reduce((v, p) => v + p[field] * p.weight, 0);
    const variance = pairs.reduce((v, p) => v + (p[field] - center) ** 2 * p.weight, 0);
    if(s.gaussianBlend===1)support[0].value=center;
    if (s.gaussianBlend > 0 && variance <= 1e-12) throw TypeError('Gaussian regularization requires positive variance');
    return { mean: center, support, gaussianBlend: s.gaussianBlend, normal: { mean: center, sd: Math.sqrt(variance) } };
  };
  const home = distribution('home'), away = distribution('away'), margin = distribution('margin');
  return { home, away, margin,
    homeWinProbability: (1-s.gaussianBlend) * pairs.reduce((v,p) => v + Number(p.margin > 0)*p.weight,0) + s.gaussianBlend * normalCdf(margin.mean / margin.normal.sd),
    tieProbability: (1-s.gaussianBlend) * pairs.reduce((v,p) => v + Number(p.margin === 0)*p.weight,0),
    residualPoolCount: weighted.length, outcomeDrawCount: pairs.length, residualObservedThrough: window.at(-1).gameDateLocal, regime,
    settings: s, adaptations: { bias, conditional, totalScale, marginScale, totalCenter, marginCenter, effectiveSampleSize: 1 / weighted.reduce((v, x) => v + x.weight ** 2, 0) },
    coherence: { probabilityUsesSamePairedScoreSupport: true, meanPreserved: !s.integerScoreSupport, integerFinalScores: s.integerScoreSupport, tiesResolvedByEqualMassSinglePoint: s.integerScoreSupport && s.integerTieMode==='split-point', conditionalOnNonTiedFinalScore: s.integerScoreSupport && s.integerTieMode==='condition-no-tie' } };
}

export function scoreCandidate57Distribution(distribution, actual) {
  let prefixMass = 0, prefixValue = 0, pairHalf = 0, absolute = 0;
  for (const x of distribution.support) {
    absolute += x.probability * Math.abs(x.value - actual);
    pairHalf += x.probability * (x.value * prefixMass - prefixValue);
    prefixMass += x.probability; prefixValue += x.probability * x.value;
  }
  const empiricalQuantile = q => { let mass = 0; for (const x of distribution.support) { mass += x.probability; if (mass + 1e-12 >= q) return x.value; } return distribution.support.at(-1).value; };
  const blend = distribution.gaussianBlend ?? 0;
  const normal = distribution.normal;
  const normalAbs = (location,sd) => { const z = location/sd; return 2*sd*normalPdf(z) + location*(2*normalCdf(z)-1); };
  let crps = absolute - pairHalf;
  if (blend > 0) {
    const gaussianAbsolute = normalAbs(normal.mean-actual,normal.sd);
    const crossAbsolute = distribution.support.reduce((sum,x)=>sum+x.probability*normalAbs(normal.mean-x.value,normal.sd),0);
    crps = (1-blend)*absolute + blend*gaussianAbsolute - ((1-blend)**2*pairHalf + blend*(1-blend)*crossAbsolute + blend**2*normal.sd/Math.sqrt(Math.PI));
  }
  const cumulative=[]; let mass=0; for(const p of distribution.support){mass+=p.probability;cumulative.push(mass);}
  const empiricalCdf=x=>{let lo=0,hi=distribution.support.length;while(lo<hi){const mid=(lo+hi)>>1;if(distribution.support[mid].value<=x)lo=mid+1;else hi=mid;}return lo?cumulative[lo-1]:0;};
  const cdf=x=> (blend===1?0:(1-blend)*empiricalCdf(x)) + blend*normalCdf((x-normal.mean)/normal.sd);
  const quantile = q => {
    if (!blend) return empiricalQuantile(q);
    let lo=Math.min(distribution.support[0].value,normal.mean-10*normal.sd), hi=Math.max(distribution.support.at(-1).value,normal.mean+10*normal.sd);
    for(let i=0;i<55;i++){ const mid=(lo+hi)/2; if(cdf(mid)<q)lo=mid;else hi=mid; }
    return hi;
  };
  const intervals = Object.fromEntries([0.5, 0.8, 0.9, 0.95].map(level => {
    const alpha = 1 - level, lower = quantile(alpha / 2), upper = quantile(1 - alpha / 2);
    return [String(level), { lower, upper, width: upper - lower, covered: actual >= lower && actual <= upper,
      score: upper - lower + 2 / alpha * Math.max(0, lower - actual) + 2 / alpha * Math.max(0, actual - upper) }];
  }));
  return { error: distribution.mean - actual, crps, intervals,
    equalWeightIntervalScore: mean(Object.values(intervals).map(x => x.score)) };
}

export function normalPdf(z) { return Math.exp(-z*z/2)/Math.sqrt(2*Math.PI); }
export function normalCdf(z) {
  if(z===0)return 0.5; const x=Math.abs(z),t=1/(1+0.2316419*x);
  const upper=normalPdf(x)*t*(0.319381530+t*(-0.356563782+t*(1.781477937+t*(-1.821255978+t*1.330274429))));
  return z>0?1-upper:upper;
}
