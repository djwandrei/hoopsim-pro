import React, { useId } from 'react';
import CourtHoop from '@/components/dailyGames/CourtHoop';
import { courtArc, courtRect, courtPoints, projectCourt } from '@/components/dailyGames/courtGeometry';
import { paletteForTeam, luminance, mix } from '@/components/djhc/basketballPalettes';
import { teamLogo } from '@/components/djhc/siteNavigation';

// Team-themed floor, following the classic NBA court-design formula: a
// team-colored apron around the boundary, team-primary paint, a highlight
// center circle carrying the team logo, wordmarks on the aprons, and a team
// stripe on the sideline boards. Very dark primaries (Brooklyn, San Antonio)
// lighten to the trim color so the key still reads against the hardwood.
export default function CourtFloor({ teamCode, palette: paletteProp = null }) {
  const id = useId().replace(/:/g, '');
  const cornerAngle = Math.acos(22 / 23.75);
  const cornerDepth = 5.25 + Math.sqrt(23.75 ** 2 - 22 ** 2);
  const hoopGlow = projectCourt(25, 9, 0);
  // An explicit palette wins: cross-team boards (e.g. Draft Night) theme the
  // floor from the site's selected team instead of any single player's team.
  const palette = paletteProp || paletteForTeam(teamCode);
  const logo = teamLogo(palette);
  const djhc = palette.id === 'djhc';
  const apronInk = luminance(palette.primary) > .32 ? '#10131B' : '#FFFFFF';
  const key = luminance(palette.primary) < .07 ? (palette.trim || palette.highlight) : palette.primary;
  const center = projectCourt(25, 47, 0);
  const centerY = center.y;
  const baseline = projectCourt(25, 48.4, 0);
  const apronEdge = mix(palette.primary, '#000000', .35);
  const wordmark = djhc ? 'DJHC COURT' : palette.team.toUpperCase();
  return (
    <svg className="dg-court__lines" viewBox="0 0 1000 600" aria-hidden="true">
      <defs>
        <linearGradient id={`wood-${id}`} x1="0" y1="0" x2="0" y2="1"><stop stopColor="hsl(var(--court-wood-dark))" /><stop offset=".45" stopColor="hsl(var(--court-wood))" /><stop offset="1" stopColor="hsl(var(--court-wood-light))" /></linearGradient>
        <linearGradient id={`gloss-${id}`} x1="0" y1="0" x2="0" y2="1"><stop stopColor="hsl(0 0% 100% / .09)" /><stop offset=".45" stopColor="hsl(0 0% 100% / 0)" /></linearGradient>
        <radialGradient id={`spot-${id}`}><stop stopColor="hsl(var(--court-rim))" stopOpacity=".16" /><stop offset="1" stopColor="hsl(var(--court-rim))" stopOpacity="0" /></radialGradient>
      </defs>
      {/* Arena stands on a transparent backdrop, without a rectangular fill. */}
      {[0, 1, 2, 3].map(row => (
        <g key={row} opacity={.6 - row * .13}>
          {Array.from({ length: 26 }, (_, i) => (
            <circle key={i} cx={18 + i * 38 + (row % 2 ? 19 : 0)} cy={56 + row * 28 + (i % 3) * 3} r="5.5" fill={i % 3 ? 'hsl(222 30% 26%)' : 'hsl(220 24% 33%)'} />
          ))}
        </g>
      ))}
      {/* Sideline boards between the stands and the floor, carrying the team stripe */}
      <polygon points={courtPoints([[0, -5], [50, -5], [50, 0], [0, 0]])} fill="hsl(var(--court-raised))" stroke="hsl(var(--court-accent) / .3)" strokeWidth="2" />
      <polygon points={courtPoints([[0, -5], [50, -5], [50, -4.3], [0, -4.3]])} fill={palette.highlight} opacity=".85" />
      {Array.from({ length: 5 }, (_, i) => (
        <polygon key={i} points={courtPoints([[2 + i * 10, -4.6], [10 + i * 10, -4.6], [10 + i * 10, -.4], [2 + i * 10, -.4]])} fill="hsl(var(--court-canvas) / .5)" />
      ))}
      {/* Team apron: colored surround wrapping the boundary, with a darker edge */}
      <polygon points={courtPoints([[-2.6, 0], [52.6, 0], [52.6, 49.6], [-2.6, 49.6]])} fill={palette.primary} stroke={apronEdge} strokeWidth="3" />
      <polygon points={courtPoints([[-2.6, 0], [0, 0], [0, 47], [-2.6, 47]])} fill={palette.highlight} opacity=".22" />
      <polygon points={courtPoints([[50, 0], [52.6, 0], [52.6, 47], [50, 47]])} fill={palette.highlight} opacity=".22" />
      <text transform={`rotate(-90 ${courtPoints([[-1.3, 24]]).split(',')[0]} 330)`} x="0" y="0" textAnchor="middle" fill={apronInk} fontFamily="var(--font-display)" fontSize="30" letterSpacing="6" opacity=".92">{wordmark}</text>
      <text transform={`rotate(90 ${courtPoints([[51.3, 24]]).split(',')[0]} 330)`} x="0" y="0" textAnchor="middle" fill={apronInk} fontFamily="var(--font-display)" fontSize="30" letterSpacing="6" opacity=".92">{wordmark}</text>
      <text x="500" y={baseline.y + 5} textAnchor="middle" fill={apronInk} fontFamily="var(--font-display)" fontSize="18" letterSpacing="4" opacity=".88">{wordmark}</text>
      <polygon points={courtRect(0, 0, 50, 47)} fill={`url(#wood-${id})`} stroke="hsl(var(--court-wood-dark))" strokeWidth="14" strokeLinejoin="round" />
      <g stroke="hsl(var(--court-wood-dark) / .42)" strokeWidth=".8">
        {Array.from({ length: 25 }, (_, i) => <polygon key={i} points={courtRect(i * 2, 0, i * 2 + 2, 47)} fill={i % 3 ? 'none' : 'hsl(var(--court-wood-light) / .17)'} />)}
        {Array.from({ length: 125 }, (_, i) => { const x = (i % 25) * 2; const depth = 6 + Math.floor(i / 25) * 8 + (i % 3) * 2; return <polyline key={i} points={courtPoints([[x, depth], [x + 2, depth]])} fill="none" />; })}
      </g>
      <ellipse cx="250" cy="330" rx="150" ry="70" fill="hsl(0 0% 100% / .04)" />
      <ellipse cx="760" cy="420" rx="170" ry="80" fill="hsl(0 0% 100% / .03)" />
      <polygon points={courtPoints([[6, 22], [9.5, 15], [13.5, 15], [10, 22]])} fill="hsl(0 0% 100% / .045)" />
      <polygon points={courtPoints([[31, 32], [34, 26], [37, 26], [34, 32]])} fill="hsl(0 0% 100% / .035)" />
      {/* Team paint: the key filled in the team's primary color with a sheen */}
      <polygon points={courtRect(17, 0, 33, 19)} fill={key} opacity=".94" />
      <polygon points={courtPoints([[19, 0], [25, 0], [38, 47], [25, 47]])} fill="hsl(var(--court-line) / .08)" />
      {/* Team center circle at half court: primary ring, highlight core, team logo */}
      <path d={courtArc(25, 47, 6, Math.PI, Math.PI * 2)} fill={key} opacity=".95" />
      <path d={courtArc(25, 47, 4.4, Math.PI, Math.PI * 2)} fill={palette.highlight} opacity=".95" />
      <polygon points={courtRect(0, 40, 50, 47)} fill="hsl(var(--court-canvas) / .3)" />
      <g fill="none" stroke="hsl(var(--court-line) / .92)" strokeWidth="2.2" strokeLinejoin="round">
        <polygon points={courtRect(0, 0, 50, 47)} />
        <polygon points={courtRect(17, 0, 33, 19)} />
        <path d={courtArc(25, 19, 6, 0, Math.PI)} />
        <path d={courtArc(25, 19, 6, Math.PI, Math.PI * 2)} strokeDasharray="5 5" />
        <polyline points={courtPoints([[3, 0], [3, cornerDepth]])} />
        <polyline points={courtPoints([[47, 0], [47, cornerDepth]])} />
        <path d={courtArc(25, 5.25, 23.75, cornerAngle, Math.PI - cornerAngle)} />
        <path d={courtArc(25, 5.25, 4, 0, Math.PI)} />
        <path d={courtArc(25, 47, 6, Math.PI, Math.PI * 2)} />
        {[7, 8, 11, 14].flatMap(depth => [17, 33].map(x => <polyline key={`${x}-${depth}`} points={courtPoints([[x, depth], [x + (x === 17 ? -1 : 1), depth]])} />))}
      </g>
      {/* Painted-on-court logo: centered exactly on the half-court line and
          squashed into the floor's perspective, clipped to this side of the
          line so it reads as printed paint cut in half at midcourt. */}
      <clipPath id={`halfcut-${id}`}><rect x="0" y="0" width="1000" height={centerY} /></clipPath>
      {logo && (
        <g clipPath={`url(#halfcut-${id})`}>
          <g transform={`translate(${center.x} ${centerY}) scale(1 .58)`} opacity=".85">
            <image href={logo} x="-44" y="-44" width="88" height="88" preserveAspectRatio="xMidYMid meet" />
          </g>
        </g>
      )}
      <polygon points={courtRect(0, 0, 50, 47)} fill={`url(#gloss-${id})`} />
      <ellipse cx={hoopGlow.x} cy={hoopGlow.y + 34} rx="240" ry="130" fill={`url(#spot-${id})`} />
      <path d={courtArc(25, 47, 6.55, Math.PI, Math.PI * 2)} fill="none" stroke="hsl(var(--court-accent) / .45)" strokeWidth="2.6" />
      <CourtHoop />
    </svg>
  );
}