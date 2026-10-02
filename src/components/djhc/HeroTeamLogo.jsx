import React from 'react';
import { Image } from '@/components/ui/image';
import { STUDIO_EMBLEM } from '@/components/studio/teamAssets';
import { useCourtTheme } from '@/components/djhc/CourtThemeProvider';
export default function HeroTeamLogo() {
  const {palette}=useCourtTheme();
  const slug=palette.team.toLowerCase().replace(/\s+/g,'-');
  const src=palette.id==='djhc'?STUDIO_EMBLEM:`/studio-assets/nba-logos/modern-opaque/${slug}.png?v=full-opacity`;
  return <Image src={src} alt={palette.id==='djhc'?'SwishIQ Studio emblem from DJHC':`${palette.team} logo at 20% opacity`} fittingType="fit" className="hidden h-44 w-44 shrink-0 object-contain opacity-20 lg:block" />;
}