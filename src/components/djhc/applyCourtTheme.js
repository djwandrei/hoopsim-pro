import { hslChannels, luminance, themeFor } from '@/components/djhc/basketballPalettes';
import { SITE, teamLogo } from '@/components/djhc/siteNavigation';
export default function applyCourtTheme(palette,mode,source='default') {
  const root=document.documentElement,body=document.body,tokens=themeFor(palette,mode);
  const set=(name,value)=>root.style.setProperty(name,value);
  Object.entries(tokens).forEach(([key,value])=>{
    const name=key.replace(/[A-Z]/g,letter=>'-'+letter.toLowerCase());
    set(`--djhc-court-${name}`,value);set(`--court-${name}`,hslChannels(value));
  });
  const highlight=[palette.primary,palette.highlight].reduce((best,color)=>mode==='dark' ? luminance(color)>luminance(best)?color:best : luminance(color)<luminance(best)?color:best);
  const colors={'team-primary':palette.primary,'team-secondary':palette.highlight,'team-highlight':highlight,'team-trim':palette.trim,'team-secondary-ink':themeFor({...palette,primary:palette.highlight,highlight:palette.highlight},mode).accent,'palette-primary':palette.primary,'palette-highlight':palette.highlight,'palette-trim':palette.trim};
  Object.entries(colors).forEach(([key,value])=>set(`--djhc-court-${key}`,value));
  const roles={background:tokens.canvas,foreground:tokens.text,card:tokens.surface,'card-foreground':tokens.text,popover:tokens.surface,'popover-foreground':tokens.text,primary:tokens.accent,'primary-foreground':tokens.onAccent,secondary:tokens.raised,'secondary-foreground':tokens.text,muted:tokens.raised,'muted-foreground':tokens.muted,accent:tokens.raised,'accent-foreground':tokens.text,destructive:tokens.error,'destructive-foreground':tokens.onAccent,border:tokens.border,input:tokens.border,ring:tokens.focus,'court-royal':palette.primary,'chart-1':tokens.accent,'chart-2':palette.primary,'chart-3':tokens.positive,'chart-4':palette.trim,'chart-5':tokens.muted,'court-trim-ink':themeFor({...palette,primary:palette.trim,highlight:palette.trim},mode).accent,'sidebar-background':tokens.canvas,'sidebar-foreground':tokens.muted,'sidebar-primary':tokens.accent,'sidebar-primary-foreground':tokens.onAccent,'sidebar-accent':tokens.raised,'sidebar-accent-foreground':tokens.text,'sidebar-border':tokens.border,'sidebar-ring':tokens.focus};
  Object.entries(roles).forEach(([key,value])=>set(`--${key}`,hslChannels(value)));
  const logo=teamLogo(palette),slug=palette.team.toLowerCase().replace(/\s+/g,'-');
  if(logo){set('--djhc-court-team-logo',`url("${logo}")`);set('--djhc-court-team-watermark',`url("${SITE}/assets/nba-logos/${slug}-20-opacity.png")`);}
  else{root.style.removeProperty('--djhc-court-team-logo');root.style.removeProperty('--djhc-court-team-watermark');}
  root.classList.toggle('dark',mode==='dark');body.classList.add('court-themed','fan-tools-page','swishiq-studio-page');body.classList.toggle('dark-mode',mode==='dark');
  Object.assign(body.dataset,{fanToolsNavigation:'true',page:'swishiq-studio',courtPalette:palette.id,courtTeam:palette.id,courtMode:mode,courtPaletteSource:source});
  root.style.colorScheme=mode;body.style.colorScheme=mode;
  document.dispatchEvent(new CustomEvent('djhc-theme-change',{detail:{mode}}));
}