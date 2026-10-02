import React, { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import nativeHost from '@/components/native/nativeHost';
import nativeStyles from '@/components/native/nativeStyles';
import { loadNativeModule } from '@/components/native/nativeModules';
import { originalFetch, ORIGINAL_STUDIO } from '@/components/native/nativeTransport';
import nativeReadiness from '@/components/native/nativeReadiness';
import NativeSectionLinks from '@/components/native/NativeSectionLinks';
const BOOT={chemistry:['chemistry-lab.js','startSwishIqChemistryLab'],composite:['advanced-labs.js','startSwishIqAdvancedLabs'],game:['react-game-lab-bridge.js','startSwishIqGameLab'],season:['react-season-lab-bridge.js','startNativeSeasonLab']};
export default function NativeSurface({ kind,entry,onYearChange,onStateChange }) {
  const root=useRef(null),[error,setError]=useState(''),[retry,setRetry]=useState(0),[loading,setLoading]=useState(true);
  const [,refreshSections]=useState(0);
  useEffect(()=>{
    let live=true,controller=null;
    const host=nativeHost(root.current,kind,entry,onYearChange);
    setError('');setLoading(true);onStateChange('loading');
    let frame=0,lastState='loading';
    const sync=()=>{if(!live)return;const state=nativeReadiness(host,kind);setLoading(state==='loading');if(state!==lastState){lastState=state;onStateChange(state);}refreshSections(value=>value+1);};
    const observer=new MutationObserver(()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(sync);});
    observer.observe(host.scope,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['class','data-state','aria-busy','hidden']});
    (async()=>{
      try {
        const [file,start]=BOOT[kind];
        const [module]=await Promise.all([loadNativeModule(file),nativeStyles(host.shadow)]);
        if(!live)return;
        controller=module[start]({documentRef:host.facade,fetchImpl:originalFetch,registryUrl:ORIGINAL_STUDIO+'data/registry.json'});
        if(!controller)throw new Error('The original workbench could not start.');
        await controller.activate?.();
        if(!live)return;
        sync();
      }catch(failure){if(live){setLoading(false);setError(failure.message || 'Original gameplay could not be loaded.');onStateChange('error');}}
    })();
    return()=>{live=false;observer.disconnect();cancelAnimationFrame(frame);controller?.destroy?.();if(!controller?.destroy)controller?.unmount?.();host.dispose();};
  },[kind,entry.packageId,entry.packageVersion,retry]);
  return <section className="min-w-0">{!loading&&!error&&<NativeSectionLinks kind={kind} root={root}/>} {loading&&<div role="status" className="court-panel mb-4 flex items-center gap-3 p-5 text-sm text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin text-gold" />Loading verified original gameplay…</div>}{error&&<div role="alert" className="court-panel mb-4 border-trim/40 p-5"><p className="text-sm text-foreground">{error}</p><Button onClick={()=>setRetry(value=>value+1)} variant="outline" className="mt-3">Retry original workbench</Button></div>}<div ref={root} className="min-w-0" /></section>;
}