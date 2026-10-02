import React, { useEffect, useRef, useState } from 'react';
import { useCourtTheme } from '@/components/djhc/CourtThemeProvider';
import { palettes } from '@/components/djhc/basketballPalettes';
import PaletteIdentity from '@/components/djhc/PaletteIdentity';
import PaletteOptions from '@/components/djhc/PaletteOptions';
export default function TeamPalettePicker() {
  const {palette,selectPalette}=useCourtTheme(),ref=useRef(null),summary=useRef(null);
  const [opened,setOpened]=useState(false);
  const close=()=>{ref.current.open=false;summary.current?.focus();};
  const select=id=>{selectPalette(id);close();};
  useEffect(()=>{
    const outside=event=>{if(!ref.current?.contains(event.target)&&ref.current)ref.current.open=false;};
    document.addEventListener('pointerdown',outside);return()=>document.removeEventListener('pointerdown',outside);
  },[]);
  return <details ref={ref} className="court-team-picker court-team-picker--hero" data-team-palette-slot="" data-team-palette-ready="true" onToggle={event=>{if(event.currentTarget.open)setOpened(true);}} onKeyDown={event=>{if(event.key==='Escape'){event.stopPropagation();close();}}}>
    <summary ref={summary} data-court-palette-summary="" aria-label={`Choose team colors. Current palette: ${palette.team}, ${palette.name}`} title={`${palette.team} · ${palette.name}`}><PaletteIdentity palette={palette} /></summary>
    <div className="court-team-picker__panel"><strong data-court-palette-name="">{palette.name}</strong><span className="court-team-picker__team" data-court-team-name="">{palette.team}</span><span className="court-team-picker__preview" aria-hidden="true"><span className="court-team-picker__preview-chip court-team-picker__preview-chip--primary" /><span className="court-team-picker__preview-chip court-team-picker__preview-chip--highlight" /><span className="court-team-picker__preview-chip court-team-picker__preview-chip--trim" /></span>
      {opened&&<PaletteOptions palette={palette} onSelect={select} />}
      <p className="court-team-picker__note">Choose accent colors for the fan tools. This does not change the roster or result.</p><label className="court-team-picker__label">Palette<select data-court-team-select="" aria-label={`Choose team colors; current palette is ${palette.team}`} value={palette.id} onChange={event=>select(event.target.value)}>{palettes.map(option=><option key={option.id} value={option.id}>{option.team} · {option.name}</option>)}</select></label>
    </div>
  </details>;
}