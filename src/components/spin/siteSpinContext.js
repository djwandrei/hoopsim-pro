import { ROLE_TAXONOMY, normalizePositions } from '@/components/spin/engine/roleTaxonomy';
const PLAYER_REF = /^p_[a-f0-9]{32}$/;
const clean = value => String(value || '').trim();
const normalized = value => clean(value).normalize('NFKC').toLocaleLowerCase('en-US').replace(/\s+/g,' ');
export default function siteSpinContext(source,year) {
  const entry = source.entry;
  if (entry.scope?.kind !== 'exact-season' || entry.scope.seasonStartYears?.length !== 1 || entry.scope.seasonStartYears[0] !== year || !entry.scope.phases.includes('regular')) throw new Error('Spin Room requires the selected exact regular-season package.');
  const packageRef = { packageId:entry.packageId,packageVersion:entry.packageVersion,packageManifestSha256:entry.packageManifestSha256,sourceLockSha256:entry.sourceLockSha256,registryVersion:source.registry.registryVersion,registryRevisionSha256:source.registry.registryRevisionSha256,scope:{ kind:'exact-season',seasonStartYears:[year],phases:['regular'] } };
  const profiles = new Map();
  for(const row of source.players){
    if(!PLAYER_REF.test(row.playerRef || '')) continue;
    const displayName=clean(row.displayName),positions=normalizePositions(row.positions);
    if(!displayName || !positions.length) continue;
    if(profiles.has(row.playerRef)) throw new Error('The players artifact repeats a stable player reference.');
    profiles.set(row.playerRef,{displayName,positions});
  }
  const entriesByRef=new Map();
  for(const row of source.blueprintRows){
    if(row.seasonStartYear !== year || row.phase !== 'regular' || row.observed !== true || !(row.games > 0)) continue;
    if(!PLAYER_REF.test(row.playerRef || '') || !/^[A-Z]{2,3}$/.test(row.teamCode || '')) throw new Error('A player-season row has no valid player or team identity.');
    const profile=profiles.get(row.playerRef),positions=normalizePositions(row.positions),displayName=clean(row.displayName),existing=entriesByRef.get(row.playerRef);
    if(!profile || !displayName || normalized(displayName) !== normalized(profile.displayName) || !positions.length) throw new Error('A player-season row does not join cleanly to its source player profile.');
    if(existing && (normalized(existing.displayName) !== normalized(displayName) || existing.positions.join('|') !== [...positions].sort().join('|'))) throw new Error('A player has conflicting identity or position rows in this season package.');
    const teamCodes=[...new Set([...(existing?.teamCodes || []),row.teamCode])].sort();
    entriesByRef.set(row.playerRef,{ ...(existing || {}),playerRef:row.playerRef,displayName:profile.displayName,player:profile.displayName,positions:[...positions].sort(),seasonStartYear:year,phase:'regular',observed:true,games:Math.max(existing?.games || 0,row.games),teamCodes,teamCode:teamCodes.join('/'),packageId:packageRef.packageId,packageVersion:packageRef.packageVersion,packageManifestSha256:packageRef.packageManifestSha256,sourceLockSha256:packageRef.sourceLockSha256 });
  }
  const base={seasonStartYears:[year],phases:['regular'],requireObserved:true,minGames:1};
  const options=[{value:'all',label:'All source-backed players',eligibility:base},...['guard','wing','forward','big','center'].map(key=>({value:key,label:`${ROLE_TAXONOMY[key].label} · source position`,eligibility:{...base,roles:[key]}}))];
  return { packageRef,entries:[...entriesByRef.values()].sort((a,b)=>a.playerRef.localeCompare(b.playerRef)),options,seed:`${packageRef.packageVersion}-spin-room` };
}