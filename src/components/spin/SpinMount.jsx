import React, { useEffect, useRef } from 'react';
import { createSpinRoom } from '@/components/spin/createSpinRoom';
import { buildSeededPool, spinSeededPool } from '@/components/spin/engine/seededPool';
import { normalizeModelPackageRef, stableHash } from '@/components/spin/engine/scenarioContract';
import { observedPlayers } from '@/lib/season/labs';
const OPTIONS = [{ value:'eligible', label:'All eligible players', eligibility:{ requireObserved:true } }, ...['guard','wing','forward','big','center'].map(role => ({ value:role,label:role.charAt(0).toUpperCase()+role.slice(1),eligibility:{ roles:[role],requireObserved:true } }))];
export default function SpinMount({ source, year, excluded, onSelection, onPool }) {
  const root = useRef(null);
  const settings = useRef({ seed:'studio-11',role:'eligible' });
  useEffect(() => {
    const refs = [...excluded].sort();
    const excludedSet = new Set(refs);
    const entry = source.entry || {};
    let packageRef;
    try {
      if (entry.scope && (entry.scope.kind !== 'exact-season' || entry.scope.seasonStartYears?.length !== 1 || Number(entry.scope.seasonStartYears[0]) !== year || !entry.scope.phases?.includes('regular'))) throw new Error('Spin Room requires the selected exact-season regular-season package.');
      packageRef = normalizeModelPackageRef({ ...entry, registryVersion:source.registry?.registryVersion || null, registryRevisionSha256:source.registry?.registryRevisionSha256 || null, scope:{ kind:'exact-season',seasonStartYears:[year],phases:['regular'] } });
    } catch (error) {
      onPool({ status:'unavailable',reason:error.message }); onSelection(null);
      root.current.textContent = error.message;
      root.current.setAttribute('role','status');
      return;
    }
    root.current.removeAttribute('role');
    const entries = observedPlayers(source).filter(player => !excludedSet.has(player.playerRef)).map(player => ({ ...player,seasonStartYear:year,phase:'regular',observed:true,adapterExcludedPlayerRefs:refs }));
    let starting = true;
    const controller = createSpinRoom({ root:root.current, entries, packageRef, seed:settings.current.seed, eligibilityOptions:[OPTIONS.find(option => option.value === settings.current.role) || OPTIONS[0], ...OPTIONS.filter(option => option.value !== settings.current.role)], uniquePlayerKey:'playerRef',
      buildSeededPool:input => {
        const result = buildSeededPool(input);
        if (result.status === 'ready') result.receipt = { ...result.receipt,adapterVersion:'djhc-spin-exclusions-v1',excludedPlayerRefs:refs,exclusionsHash:stableHash(refs) };
        if (starting) { onPool(result); onSelection(null); }
        return result;
      },
      spinSeededPool,
      onSelection:payload => { onSelection({ ...payload,excludedPlayerRefs:refs,exclusionsHash:stableHash(refs) }); },
    });
    const form = root.current.querySelector('form');
    const button = root.current.querySelector('.swishiq-spin-room__spin');
    const markRebuild = () => { starting = true; };
    const markDraw = () => { starting = false; };
    const markDirty = () => { onSelection(null); onPool({ status:'dirty' }); };
    form.addEventListener('submit',markRebuild,true);
    form.addEventListener('input',markDirty);
    form.addEventListener('change',markDirty);
    button.addEventListener('click',markDraw,true);
    return () => { settings.current = { seed:form.elements.seed.value,role:form.elements.eligibility.value }; form.removeEventListener('submit',markRebuild,true); form.removeEventListener('input',markDirty); form.removeEventListener('change',markDirty); button.removeEventListener('click',markDraw,true); controller.destroy(); };
  }, [source,year,excluded,onSelection,onPool]);
  return <div ref={root} className="min-w-0" />;
}