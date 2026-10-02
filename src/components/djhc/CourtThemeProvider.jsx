import React, { createContext, useContext, useLayoutEffect, useState } from 'react';
import { paletteForTeam } from '@/components/djhc/basketballPalettes';
import applyCourtTheme from '@/components/djhc/applyCourtTheme';
const CourtThemeContext=createContext(null);
const stored=(key,fallback)=>{try{return localStorage.getItem(key)||fallback;}catch{return fallback;}};
export const useCourtTheme=()=>useContext(CourtThemeContext);
export default function CourtThemeProvider({children}) {
  const [team,setTeam]=useState(()=>paletteForTeam(stored('djhc-court-team-v1','djhc')).id);
  const [mode,setMode]=useState(()=>stored('theme','dark')==='light'?'light':'dark');
  const palette=paletteForTeam(team);
  useLayoutEffect(()=>applyCourtTheme(palette,mode,stored('djhc-court-team-v1','')?'manual':'default'),[palette,mode]);
  useLayoutEffect(()=>{
    const sync=event=>{if(event.key==='djhc-court-team-v1')setTeam(paletteForTeam(event.newValue).id);if(event.key==='theme')setMode(event.newValue==='light'?'light':'dark');};
    window.addEventListener('storage',sync);return()=>window.removeEventListener('storage',sync);
  },[]);
  const selectPalette=id=>{setTeam(paletteForTeam(id).id);try{localStorage.setItem('djhc-court-team-v1',paletteForTeam(id).id);}catch{/* appearance still works */}};
  const toggleMode=()=>{const next=mode==='dark'?'light':'dark';setMode(next);try{localStorage.setItem('theme',next);}catch{/* appearance still works */}};
  return <CourtThemeContext.Provider value={{palette,mode,selectPalette,toggleMode}}>{children}</CourtThemeContext.Provider>;
}