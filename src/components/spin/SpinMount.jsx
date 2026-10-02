import React, { useEffect, useRef } from 'react';
import { createSpinRoom } from '@/components/spin/createSpinRoom';
import { buildSeededPool, spinSeededPool } from '@/components/spin/engine/seededPool';
import { stableHash } from '@/components/spin/engine/scenarioContract';
import siteSpinContext from '@/components/spin/siteSpinContext';
export default function SpinMount({ source, year, excluded, onSelection, onPool }) {
  const root = useRef(null);
  const settings = useRef({ seed:null,role:'all' });
  useEffect(() => {
    const refs = [...excluded].sort();
    const excludedSet = new Set(refs);
    let context;
    try {
      context = siteSpinContext(source,year);
    } catch (error) {
      onPool({ status:'unavailable',reason:error.message }); onSelection(null);
      root.current.textContent = error.message;
      root.current.setAttribute('role','status');
      return;
    }
    root.current.removeAttribute('role');
    const entries = context.entries.filter(player => !excludedSet.has(player.playerRef));
    const options = context.options;
    let starting = true;
    const controller = createSpinRoom({ root:root.current,entries,packageRef:context.packageRef,seed:settings.current.seed === null ? context.seed : settings.current.seed,eligibilityOptions:[options.find(option => option.value === settings.current.role) || options[0],...options.filter(option => option.value !== settings.current.role)],uniquePlayerKey:'playerRef',
      buildSeededPool:input => {
        const result = buildSeededPool(input);
        if (result.status === 'ready') result.receipt = { ...result.receipt,adapterVersion:'djhc-spin-exclusions-v1',excludedPlayerRefs:refs,exclusionsHash:stableHash(refs) };
        if (starting) { onPool(result); onSelection(null); }
        return result;
      },
      spinSeededPool,
      onSelection:payload => { const image = source.playerSeasons.find(player => player.playerRef === payload.entry.playerRef)?.headshotPath;onSelection({ ...payload,displayPlayer:{ ...payload.entry,name:payload.entry.displayName,headshotPath:image },excludedPlayerRefs:refs,exclusionsHash:stableHash(refs) }); },
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