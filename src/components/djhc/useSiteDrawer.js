import { useEffect, useState } from 'react';
import { useMobileView } from '@/components/mobile/MobileViewContext';
export default function useSiteDrawer(headerRef, navRef, toggleRef) {
  const [open,setOpen]=useState(false);
  const { active } = useMobileView();
  useEffect(()=>{
    if (!active) return;
    const measure=()=>{const height=headerRef.current?.offsetHeight||0;document.documentElement.style.setProperty('--djhc-header-h',`${height}px`);headerRef.current?.style.setProperty('--header-h',`${height}px`);};
    measure();const observer=new ResizeObserver(measure);if(headerRef.current)observer.observe(headerRef.current);
    return ()=>observer.disconnect();
  },[active,headerRef]);
  useEffect(()=>{
    if (!active) { setOpen(false); return; }
    document.body.classList.toggle('menu-open',open);
    if(!open)return;
    navRef.current?.querySelector('a[href]')?.focus();
    const handleKey=event=>{
      if(event.key==='Escape'){setOpen(false);toggleRef.current?.focus();}
      if(event.key!=='Tab')return;
      const nodes=[toggleRef.current,...(navRef.current?.querySelectorAll('a[href],button')||[])].filter(Boolean),first=nodes[0],last=nodes[nodes.length-1];
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
    };
    document.addEventListener('keydown',handleKey);
    return ()=>{document.body.classList.remove('menu-open');document.removeEventListener('keydown',handleKey);};
  },[active,open,navRef,toggleRef]);
  const close=()=>{setOpen(false);toggleRef.current?.focus();};
  return {open,close,toggle:()=>setOpen(value=>!value)};
}