import React from 'react';

// Molten-forge player figure: a layered, 3D-shaded statue assembled from ten
// body segments. Every locked skill pours another segment — cold steel
// wireframe at zero picks, molten gold with cast shadows and specular
// highlights as slots fill, and a full aura, halo and ignited ball once the
// composite is complete. Shared by the ForgeStage center art and the
// ForgeBuildWheel hub so both silhouettes share one state model.

const SEGMENTS = [
  { id: 'shin-l', x1: 80, y1: 176, x2: 87, y2: 224, w: 14 },
  { id: 'shin-r', x1: 123, y1: 178, x2: 115, y2: 226, w: 14 },
  { id: 'thigh-l', x1: 99, y1: 128, x2: 80, y2: 178, w: 19 },
  { id: 'thigh-r', x1: 99, y1: 128, x2: 123, y2: 178, w: 19 },
  { id: 'hips', x1: 99, y1: 114, x2: 99, y2: 140, w: 33 },
  { id: 'torso', x1: 98, y1: 52, x2: 99, y2: 128, w: 41 },
  { id: 'arm-l-up', x1: 94, y1: 66, x2: 63, y2: 95, w: 14 },
  { id: 'arm-l-lo', x1: 63, y1: 95, x2: 73, y2: 128, w: 11 },
  { id: 'arm-r-up', x1: 106, y1: 62, x2: 137, y2: 41, w: 14 },
  { id: 'arm-r-lo', x1: 137, y1: 41, x2: 148, y2: 25, w: 11 },
];
const HEAD = { cx: 97, cy: 33, r: 15 };
const BALL = { cx: 152, cy: 21, r: 12 };
const EMBERS = [
  { cx: 66, cy: 150, delay: '0s' },
  { cx: 138, cy: 128, delay: '.7s' },
  { cx: 92, cy: 196, delay: '1.3s' },
  { cx: 118, cy: 172, delay: '1.9s' },
];
const STEEL = 'hsl(221 37% 30%)';
const CAST = '#2A1B05';
const RIM = '#FFE9AE';

export default function ForgeFigure3D({ filled = 0, total = 9, spinning = false, complete = false, className = '' }) {
  const progress = Math.max(0, Math.min(1, filled / total));
  const litCount = complete ? SEGMENTS.length + 2 : Math.round(progress * (SEGMENTS.length + 1));
  const isLit = index => complete || index < litCount;
  return (
    <svg viewBox="0 0 200 260" preserveAspectRatio="xMidYMid meet" role="img"
      aria-label={`Composite player forged ${filled} of ${total} skills`}
      className={`forge-figure ${spinning ? 'forge-figure--spin' : ''} ${className}`}>
      <defs>
        <radialGradient id="ff-aura" cx="50%" cy="45%" r="55%">
          <stop offset="0%" stopColor="hsl(43 85% 65%)" stopOpacity=".55" />
          <stop offset="55%" stopColor="hsl(43 78% 60%)" stopOpacity=".18" />
          <stop offset="100%" stopColor="hsl(43 78% 60%)" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="ff-molten" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={RIM} />
          <stop offset="45%" stopColor="#E9B949" />
          <stop offset="100%" stopColor="#9A5B14" />
        </linearGradient>
        <radialGradient id="ff-head" cx="38%" cy="32%" r="80%">
          <stop offset="0%" stopColor={RIM} />
          <stop offset="55%" stopColor="#E9B949" />
          <stop offset="100%" stopColor="#9A5B14" />
        </radialGradient>
        <radialGradient id="ff-ball" cx="35%" cy="30%" r="85%">
          <stop offset="0%" stopColor="#FFB36B" />
          <stop offset="60%" stopColor="#C2410C" />
          <stop offset="100%" stopColor="#7C2D12" />
        </radialGradient>
      </defs>

      {/* Aura intensifies with forge progress; ground contact shadow sells the 3D */}
      <circle cx="100" cy="118" r="96" fill="url(#ff-aura)" opacity={(0.14 + 0.5 * progress).toFixed(2)} style={{ transition: 'opacity .6s ease' }} />
      <ellipse cx="100" cy="249" rx="62" ry="9" fill="hsl(223 24% 3%)" opacity=".5" />

      {SEGMENTS.map((segment, index) => {
        const lit = isLit(index);
        return <g key={segment.id}>
          {lit && <line x1={segment.x1 + 3} y1={segment.y1 + 4} x2={segment.x2 + 3} y2={segment.y2 + 4} stroke={CAST} strokeWidth={segment.w} strokeLinecap="round" opacity=".5" />}
          <line x1={segment.x1} y1={segment.y1} x2={segment.x2} y2={segment.y2}
            stroke={lit ? 'url(#ff-molten)' : STEEL}
            strokeWidth={lit ? segment.w : segment.w - 4}
            strokeLinecap="round" opacity={lit ? 1 : .55}
            style={{ transition: 'opacity .5s ease, stroke-width .3s ease' }} />
          {lit && <line x1={segment.x1 - 2.5} y1={segment.y1 - 3} x2={segment.x2 - 2.5} y2={segment.y2 - 3} stroke={RIM} strokeWidth={Math.max(2.5, segment.w * .2)} strokeLinecap="round" opacity=".45" />}
        </g>;
      })}

      <g>
        {isLit(SEGMENTS.length) && <circle cx={HEAD.cx + 3} cy={HEAD.cy + 4} r={HEAD.r} fill={CAST} opacity=".5" />}
        <circle cx={HEAD.cx} cy={HEAD.cy} r={HEAD.r} fill={isLit(SEGMENTS.length) ? 'url(#ff-head)' : STEEL} opacity={isLit(SEGMENTS.length) ? 1 : .55} style={{ transition: 'opacity .5s ease' }} />
      </g>

      {/* Ball core: cold steel until the composite is complete, then ignited */}
      <g>
        {complete && <circle cx={BALL.cx} cy={BALL.cy} r={BALL.r + 6} fill="url(#ff-aura)" />}
        <circle cx={BALL.cx} cy={BALL.cy} r={BALL.r} fill={complete ? 'url(#ff-ball)' : 'hsl(221 37% 26%)'} opacity={complete ? 1 : .55} />
      </g>

      {(progress > 0 || complete) && EMBERS.map((ember, index) => (
        <circle key={index} cx={ember.cx} cy={ember.cy} r="2.4" fill="#E9B949" className="forge-ember"
          style={{ animationDelay: ember.delay, transformBox: 'fill-box' }} />
      ))}

      {complete && <g>
        <circle cx="100" cy="112" r="88" fill="none" stroke="#E9B949" strokeWidth="1.4" strokeDasharray="5 12" className="forge-halo" style={{ transformOrigin: '100px 112px' }} opacity=".55" />
        {[0, 60, 120, 180, 240, 300].map(deg => {
          const rad = deg * Math.PI / 180;
          return <line key={deg} x1={100 + 70 * Math.cos(rad)} y1={112 + 70 * Math.sin(rad)} x2={100 + 96 * Math.cos(rad)} y2={112 + 96 * Math.sin(rad)} stroke="#E9B949" strokeWidth="1.6" strokeLinecap="round" opacity=".4" />;
        })}
      </g>}
    </svg>
  );
}