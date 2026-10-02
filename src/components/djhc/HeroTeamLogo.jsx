import React, { useState } from 'react';
import { Image } from '@/components/ui/image';
import { STUDIO_EMBLEM } from '@/components/studio/teamAssets';
import { useCourtTheme } from '@/components/djhc/CourtThemeProvider';
import { SITE, teamLogo } from '@/components/djhc/siteNavigation';
export default function HeroTeamLogo() {
  const {palette}=useCourtTheme();
  const slug=palette.team.toLowerCase().replace(/\s+/g,'-');
  const opaque=`${SITE}/assets/nba-logos/retro-opaque/${slug}.png`;
  const standard=teamLogo(palette);
  const [failed,setFailed]=useState('');
  const src=opaque&&failed!==opaque?opaque:standard&&failed!==standard?standard:STUDIO_EMBLEM;
  return <Image src={src} alt={src===STUDIO_EMBLEM?'SwishIQ Studio emblem from DJHC':`${palette.team} team logo`} fittingType="fit" className="hidden h-44 w-44 shrink-0 object-contain lg:block" onError={()=>setFailed(src)} />;
}