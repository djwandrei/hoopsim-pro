import React from 'react';
import { Image } from '@/components/ui/image';
import TeamPalettePicker from '@/components/djhc/TeamPalettePicker';

export default function LineupToolbar() {
  return <>
    <header className="ll-native-hero">
      <div><p className="court-kicker">Lineup Lab · Historical NBA</p><h1>Your team. Your calls.<br /><span className="text-gold">Find your best five.</span></h1><p>Choose a historical roster, call the game plan, and inspect the best eligible group.</p></div>
      <Image src="https://www.djshouseofcards-comics.com/assets/games/lineup-lab-emblem-20260911.png" alt="Lineup Lab emblem" className="h-28 w-28 shrink-0" fittingType="fit" />
    </header>
    <div className="ll-native-toolbar">
      <nav className="tool-nav" aria-label="Lineup Lab views" role="tablist">
        {[['optimizer', 'Build'], ['compare', 'Compare'], ['watchlist', 'Watchlist']].map(([key, label]) => <button key={key} id={`${key}Tab`} type="button" role="tab" className={key === 'optimizer' ? 'is-active' : 'detailed-only'} data-view-target={key} aria-controls={`${key}View`} aria-selected={key === 'optimizer'}>{label}{['compare', 'watchlist'].includes(key) && <span id={`${key}Count`}>0</span>}</button>)}
      </nav>
      <div className="experience-switcher" aria-label="Level of detail"><button id="simpleModeButton" type="button" aria-pressed="false">Simple</button><button id="detailedModeButton" type="button" aria-pressed="true" className="is-active">Detailed</button></div>
      <button id="tourReplayButton" type="button" onClick={() => window.dispatchEvent(new CustomEvent('ll-open-tour'))}>Game guide</button>
      <TeamPalettePicker />
    </div>
  </>;
}