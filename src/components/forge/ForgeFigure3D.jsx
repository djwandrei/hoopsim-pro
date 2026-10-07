import React from 'react';

// Molten-forge player figure: a sculpted, volume-shaded statue. Limbs are
// capsule volumes built from four shading layers — cast shadow, molten body,
// core shade and rim light — around spherical joints, with a tapered jersey,
// shorts, a shaded head and a seamed basketball. Every locked skill pours
// another segment: cold steel at zero picks, molten gold with cast shadows and
// specular highlights as slots fill, and a full aura, halo and ignited ball
// once the composite is complete. Shared by the ForgeStage center art and the
// ForgeBuildWheel hub so both silhouettes share one state model.

const SEGMENTS = [
  { id: 'shin-l', x1: 80, y1: 176, x2: 87, y2: 224, w: 15 },
  { id: 'shin-r', x1: 123, y1: 178, x2: 115, y2: 226, w: 15 },
  { id: 'thigh-l', x1: 99, y1: 128, x2: 80, y2: 178, w: 21 },
  { id: 'thigh-r', x1: 99, y1: 128, x2: 123, y2: 178, w: 21 },
  { id: 'hips', x1: 99, y1: 114, x2: 99, y2: 140, w: 33 },
  { id: 'torso', x1: 98, y1: 52, x2: 99, y2: 128, w: 41 },
  { id: 'arm-l-up', x1: 94, y1: 66, x2: 63, y2: 95, w: 15 },
  { id: 'arm-l-lo', x1: 63, y1: 95, x2: 73, y2: 128, w: 12 },
  { id: 'arm-r-up', x1: 106, y1: 62, x2: 137, y2: 41, w: 15 },
  { id: 'arm-r-lo', x1: 137, y1: 41, x2: 148, y2: 25, w: 12 },
];
const SEGMENT_INDEX = Object.fromEntries(SEGMENTS.map((segment, index) => [segment.id, index]));

// Jersey and shorts replace rod strokes with tapered, shaded volumes.
const JERSEY = 'M75,46 L125,46 L131,62 L123,96 L112,124 L86,124 L75,96 L67,62 Z';
const SHORTS = 'M79,120 L119,120 L126,160 L104,160 L99,142 L94,160 L72,160 Z';
const HEAD = { cx: 98, cy: 31, r: 15.5 };
const BALL = { cx: 152, cy: 21, r: 12 };
const EMBERS = [
  { cx: 66, cy: 150, delay: '0s' },
  { cx: 138, cy: 128, delay: '.7s' },
  { cx: 92, cy: 196, delay: '1.3s' },
  { cx: 118, cy: 172, delay: '1.9s' },
];
const STEEL = 'hsl(221 37% 30%)';
const STEEL_EDGE = 'hsl(219 34% 52%)';
const CAST = '#241402';
const SHADE = '#8A5410';
const RIM = '#FFE9AE';

// Light comes from the upper left: each capsule gets a cast shadow below-right,
// the molten body, a core shade hugging the shadow side, and a rim highlight.
const LIMB_LAYERS_LIT = [
  { dx: 4, dy: 5, scale: 1, stroke: CAST, opacity: .42 },
  { dx: 0, dy: 0, scale: 1, stroke: 'url(#ff-molten)', opacity: 1 },
  { dx: 2.6, dy: 3.2, scale: .48, stroke: SHADE, opacity: .4 },
  { dx: -3, dy: -3.6, scale: .22, stroke: RIM, opacity: .6 },
];
const LIMB_LAYERS_STEEL = [
  { dx: 2.5, dy: 3, scale: 1, stroke: '#141A29', opacity: .4 },
  { dx: 0, dy: 0, scale: 1, stroke: STEEL, opacity: .62 },
  { dx: -2.2, dy: -2.6, scale: .2, stroke: '#C9D4E6', opacity: .28 },
];

// Joint spheres keyed to the segment that lights them, so articulations
// (knees, elbows, ankles, deltoids) read as rounded volumes, not rod seams.
const JOINTS = [
  { cx: 80, cy: 178, r: 6.5, segment: 'thigh-l' },
  { cx: 123, cy: 178, r: 6.5, segment: 'thigh-r' },
  { cx: 87, cy: 224, r: 5, segment: 'shin-l' },
  { cx: 115, cy: 226, r: 5, segment: 'shin-r' },
  { cx: 63, cy: 95, r: 5, segment: 'arm-l-up' },
  { cx: 137, cy: 41, r: 5, segment: 'arm-r-up' },
  { cx: 94, cy: 66, r: 6, segment: 'arm-l-up' },
  { cx: 106, cy: 62, r: 6, segment: 'arm-r-up' },
];

export default function ForgeFigure3D({ filled = 0, total = 9, spinning = false, complete = false, className = '' }) {
  const progress = Math.max(0, Math.min(1, filled / total));
  const litCount = complete ? SEGMENTS.length + 2 : Math.round(progress * (SEGMENTS.length + 1));
  const isLit = index => complete || index < litCount;
  const torsoLit = isLit(SEGMENT_INDEX.torso);
  const hipsLit = isLit(SEGMENT_INDEX.hips);
  const headLit = isLit(SEGMENTS.length);
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
        <linearGradient id="ff-molten" gradientUnits="userSpaceOnUse" x1="0" y1="24" x2="0" y2="252">
          <stop offset="0%" stopColor={RIM} />
          <stop offset="38%" stopColor="#EDBB4C" />
          <stop offset="78%" stopColor="#C47F1E" />
          <stop offset="100%" stopColor="#8F5410" />
        </linearGradient>
        <radialGradient id="ff-head" cx="38%" cy="30%" r="80%">
          <stop offset="0%" stopColor={RIM} />
          <stop offset="55%" stopColor="#E9B949" />
          <stop offset="100%" stopColor="#9A5B14" />
        </radialGradient>
        <radialGradient id="ff-joint" cx="36%" cy="30%" r="80%">
          <stop offset="0%" stopColor={RIM} />
          <stop offset="55%" stopColor="#E9B949" />
          <stop offset="100%" stopColor="#9A5B14" />
        </radialGradient>
        <radialGradient id="ff-ball" cx="35%" cy="30%" r="85%">
          <stop offset="0%" stopColor="#FFB36B" />
          <stop offset="60%" stopColor="#C2410C" />
          <stop offset="100%" stopColor="#7C2D12" />
        </radialGradient>
        <radialGradient id="ff-glow">
          <stop offset="0%" stopColor="#FFB36B" stopOpacity=".6" />
          <stop offset="100%" stopColor="#FFB36B" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Aura intensifies with forge progress; ground contact shadow sells the 3D */}
      <circle cx="100" cy="118" r="96" fill="url(#ff-aura)" opacity={(0.14 + 0.5 * progress).toFixed(2)} style={{ transition: 'opacity .6s ease' }} />
      <ellipse cx="100" cy="249" rx="60" ry="9" fill="hsl(223 24% 3%)" opacity=".5" />
      <ellipse cx="100" cy="248" rx="34" ry="5" fill="hsl(43 78% 60%)" opacity={progress > 0 ? '.12' : '0'} style={{ transition: 'opacity .6s ease' }} />

      {/* Legs: capsules layered under the shorts */}
      {SEGMENTS.slice(0, 4).map((segment, index) => {
        const lit = isLit(index);
        const layers = lit ? LIMB_LAYERS_LIT : LIMB_LAYERS_STEEL;
        return <g key={segment.id}>
          {layers.map((layer, layerIndex) => <line key={layerIndex}
            x1={segment.x1 + layer.dx} y1={segment.y1 + layer.dy} x2={segment.x2 + layer.dx} y2={segment.y2 + layer.dy}
            stroke={layer.stroke} strokeWidth={Math.max(2.5, segment.w * layer.scale)} strokeLinecap="round" opacity={layer.opacity} />)}
        </g>;
      })}

      {/* Shorts (hips segment): tapered volume with a center split */}
      <g>
        {hipsLit && <path d={SHORTS} transform="translate(4,5)" fill={CAST} opacity=".42" />}
        <path d={SHORTS} fill={hipsLit ? 'url(#ff-molten)' : STEEL} opacity={hipsLit ? 1 : .55} stroke={hipsLit ? 'none' : STEEL_EDGE} strokeWidth="1.4" />
        {hipsLit && <g opacity=".45" stroke={SHADE} strokeWidth="2.2" fill="none" strokeLinecap="round">
          <path d="M99,126 L99,142" />
          <path d="M96,159 L96,148" />
          <path d="M103,159 L103,148" />
        </g>}
      </g>

      {/* Jersey torso: tapered volume with collar, shoulder trim and seams */}
      <g>
        {torsoLit && <path d={JERSEY} transform="translate(4,5)" fill={CAST} opacity=".42" />}
        <path d={JERSEY} fill={torsoLit ? 'url(#ff-molten)' : STEEL} opacity={torsoLit ? 1 : .55} stroke={torsoLit ? 'none' : STEEL_EDGE} strokeWidth="1.4" />
        {torsoLit && <g fill="none" strokeLinecap="round">
          <path d="M93,48 L98,57 L103,48" stroke={SHADE} strokeWidth="2.4" opacity=".6" />
          <path d="M79,52 L98,60 L119,52" stroke={RIM} strokeWidth="1.3" opacity=".45" />
          <path d="M77,88 L122,86" stroke={SHADE} strokeWidth="1.2" opacity=".28" />
          <path d="M79,102 L121,100" stroke={SHADE} strokeWidth="1.2" opacity=".22" />
        </g>}
      </g>

      {/* Arms: capsules layered over the jersey shoulders */}
      {SEGMENTS.slice(6).map((segment, index) => {
        const lit = isLit(index + 6);
        const layers = lit ? LIMB_LAYERS_LIT : LIMB_LAYERS_STEEL;
        return <g key={segment.id}>
          {layers.map((layer, layerIndex) => <line key={layerIndex}
            x1={segment.x1 + layer.dx} y1={segment.y1 + layer.dy} x2={segment.x2 + layer.dx} y2={segment.y2 + layer.dy}
            stroke={layer.stroke} strokeWidth={Math.max(2.5, segment.w * layer.scale)} strokeLinecap="round" opacity={layer.opacity} />)}
        </g>;
      })}

      {/* Joint spheres: knees, ankles, elbows and deltoids */}
      {JOINTS.map((joint, index) => {
        const lit = isLit(SEGMENT_INDEX[joint.segment]);
        return <g key={index}>
          {lit && <circle cx={joint.cx + 3} cy={joint.cy + 4} r={joint.r} fill={CAST} opacity=".4" />}
          <circle cx={joint.cx} cy={joint.cy} r={joint.r} fill={lit ? 'url(#ff-joint)' : STEEL} opacity={lit ? 1 : .5} />
          {lit && <circle cx={joint.cx - joint.r * .3} cy={joint.cy - joint.r * .35} r={joint.r * .28} fill={RIM} opacity=".55" />}
        </g>;
      })}

      {/* Head: shaded sphere with specular highlight over a molten neck */}
      <g>
        <line x1="98" y1="42" x2="98" y2="52" stroke={torsoLit ? 'url(#ff-molten)' : STEEL} strokeWidth="9" strokeLinecap="round" opacity={torsoLit ? 1 : .55} />
        {headLit && <circle cx={HEAD.cx + 3} cy={HEAD.cy + 4} r={HEAD.r} fill={CAST} opacity=".45" />}
        <circle cx={HEAD.cx} cy={HEAD.cy} r={HEAD.r} fill={headLit ? 'url(#ff-head)' : STEEL} opacity={headLit ? 1 : .55} style={{ transition: 'opacity .5s ease' }} />
        {headLit && <g>
          <circle cx={HEAD.cx - 5} cy={HEAD.cy - 5.5} r="4.6" fill={RIM} opacity=".5" />
          <path d={`M${HEAD.cx - 9} ${HEAD.cy - 5} Q${HEAD.cx} ${HEAD.cy - 17} ${HEAD.cx + 9} ${HEAD.cy - 5}`} fill="none" stroke={SHADE} strokeWidth="2.2" opacity=".35" strokeLinecap="round" />
        </g>}
      </g>

      {/* Ball core: cold steel until the composite is complete, then ignited */}
      <g>
        {complete && <circle cx={BALL.cx} cy={BALL.cy} r={BALL.r + 8} fill="url(#ff-glow)" />}
        <circle cx={BALL.cx} cy={BALL.cy} r={BALL.r} fill={complete ? 'url(#ff-ball)' : 'hsl(221 37% 26%)'} opacity={complete ? 1 : .6} style={{ transition: 'opacity .5s ease' }} />
        <g fill="none" strokeWidth="1.4" strokeLinecap="round" opacity=".85">
          <path d={`M${BALL.cx - 9.5} ${BALL.cy - 8} Q${BALL.cx - 3} ${BALL.cy} ${BALL.cx - 8} ${BALL.cy + 9}`} stroke={complete ? '#7C2D12' : '#46536E'} />
          <path d={`M${BALL.cx - 11.5} ${BALL.cy - 3} Q${BALL.cx} ${BALL.cy + 4} ${BALL.cx + 11.5} ${BALL.cy - 1}`} stroke={complete ? '#7C2D12' : '#46536E'} />
        </g>
        <circle cx={BALL.cx - 4} cy={BALL.cy - 4.5} r="3.2" fill="#FFD9A8" opacity={complete ? .55 : .22} />
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