import React from 'react';
const SECTIONS = {
  chemistry:[['Comparison','.swishiq-chemistry-lab__view-chooser'],['Combinations','.swishiq-chemistry-combination-explorer__heading'],['Evidence','.swishiq-chemistry-combination__provenance']],
  composite:[['Build steps','.swishiq-builder-hud'],['Skill donors','.swishiq-composite-controls'],['Build review','.swishiq-composite-results'],['Source map','.swishiq-composite-source-map']],
  game:[['Matchup','.gl-controls'],['Results','.gl-results-column'],['Scoreboard','.gl-scoreboard'],['History','.gl-history']],
  season:[['Setup','.sl-source-panel'],['Results','.sl-results-shell'],['Standings','.sl-conference'],['History','.sl-history-list']],
};
export default function NativeSectionLinks({ kind, root }) {
  const jump = selector => {
    const panel = root.current?.shadowRoot?.querySelector('.swishiq-native-panel');
    const target = [...(panel?.querySelectorAll(selector) || [])].find(node => node.getClientRects().length);
    if (target) { target.scrollIntoView({ block:'start' }); target.setAttribute('tabindex','-1');target.focus({ preventScroll:true }); }
  };
  const available = selector => [...(root.current?.shadowRoot?.querySelectorAll(selector) || [])].some(node => node.getClientRects().length);
  return <nav aria-label="Workbench sections" className="studio-command-bar mb-4 flex flex-wrap items-center gap-2"><span className="mr-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Jump to</span>{SECTIONS[kind].map(([label,selector]) => <button key={label} type="button" disabled={!available(selector)} onClick={() => jump(selector)} className="min-h-10 rounded-lg border border-border/30 px-3 text-xs text-foreground hover:border-gold/40 hover:text-gold disabled:cursor-not-allowed disabled:opacity-40">{label}</button>)}<span className="ml-auto text-[10px] text-muted-foreground">Sections unlock as you progress</span></nav>;
}