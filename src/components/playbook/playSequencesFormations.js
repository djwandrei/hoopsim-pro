import { sequence, move as m, defend as d, pass as p, hold as h, note as n } from '@/components/playbook/playSequence';
import { clampPoint, zonePoint } from '@/components/playbook/playGeometry';

const NEUTRAL = { O1: [250, 400], O2: [356, 344], O3: [144, 344], O4: [330, 250], O5: [170, 250] };
// Stage each role on the side of its first formation spot. A short approach
// still illustrates the alignment without sending the wings or bigs across
// one another from the same generic starting cluster.
const form = (steps, options = {}) => {
  const setup = { ...NEUTRAL };
  for (const id of ['O2', 'O3', 'O4', 'O5']) {
    const command = steps.flat().find(item => item.type === 'move' && item.to[id]);
    if (!command) continue;
    const value = command.to[id];
    const lateral = typeof value === 'string' ? /^(left|right)-(.+)$/.exec(value) : null;
    const target = Array.isArray(value) ? value : zonePoint(lateral ? lateral[2] : value, lateral ? lateral[1] : 'right');
    setup[id] = clampPoint([target[0], target[1] + 48]);
  }
  return sequence(setup, steps, { formation: true, ...options });
};
const corners = { O2: 'right-corner', O3: 'left-corner' };
const wings = { O2: 'right-wing', O3: 'left-wing' };
const four = { O1: 'top', ...wings, O4: 'left-corner' };

export default {
  '5-Out': form([[m({ O1: 'top' })], [m({ O2: 'right-slot', O3: 'left-slot' })], [m({ O4: 'right-corner', O5: 'left-corner' })], [h('All five spots are outside the paint; the lane remains open.')]]),
  '4-Out 1-In': form([[m({ O1: 'top' })], [m(wings)], [m({ O4: 'left-corner' })], [m({ O5: 'right-block' })], [h('Hold four perimeter spots and preserve the ball-side driving gap.')]]),
  '3-Out 2-In': form([[m({ O1: 'top' })], [m(wings)], [m({ O4: 'left-block', O5: 'right-block' })], [h('The two posts hold opposite sides of the lane.')]]),
  '1-4 High': form([[m({ O1: 'top' })], [m({ O2: [432, 190], O3: [68, 190] })], [m({ O4: 'right-elbow', O5: 'left-elbow' })], [h('The baseline and rim are empty before the first cut.')]]),
  '1-4 Low': form([[m({ O1: 'top' })], [m(corners)], [m({ O4: 'right-block', O5: 'left-block' })], [h('O1 has the upper half court for an isolation.')]]),
  Horns: form([[m({ O1: 'top' })], [m({ O4: 'left-elbow', O5: 'right-elbow' })], [m(corners)], [h('O1 pauses between the two horns.')]]),
  'Horns High': form([[m({ O1: 'top' })], [m({ O4: 'left-slot', O5: 'right-slot' })], [m(corners)], [h('The higher horns leave wider driving lanes.')]]),
  'Horns Low': form([[m({ O1: 'top' })], [m({ O4: [170, 155], O5: [330, 155] })], [m(corners)], [h('The low horns remain on opposite sides, clear of the center lane.')]]),
  'Double High': form([[m({ O1: [250, 360] })], [m({ O4: 'left-slot', O5: 'right-slot' })], [m(corners)]]),
  'Double Low': form([[m({ O1: 'top' })], [m(wings)], [m({ O4: 'right-block', O5: 'left-block' })], [h('Keep the center lane clear for a cross screen.')]]),
  Box: form([[m({ O2: 'right-elbow', O3: 'left-elbow' })], [m({ O4: 'right-block', O5: 'left-block' })], [m({ O1: 'top' })], [h('Pause on the four-player box.')]]),
  Diamond: form([[m({ O2: 'high_post' })], [m({ O3: [145, 145], O4: [355, 145] })], [m({ O5: 'restricted' })], [m({ O1: 'top' })]]),
  'Vertical Stack': form([[m({ O2: [250, 85], O3: [250, 150], O4: [250, 215], O5: [250, 280] })], [h('Adjacent players hold one-step spacing in the stack.')], [m({ O1: [390, 340] })]]),
  'Horizontal Stack': form([[m({ O2: [145, 145], O3: [215, 145], O4: [285, 145], O5: [355, 145] })], [d({ X1: 'guard', X2: 'guard', X3: 'guard', X4: 'guard', X5: 'guard' })], [m({ O1: 'top' })]], { defense: true }),
  'Double Stack': form([[m({ O2: [130, 110], O4: [130, 175] })], [m({ O3: [370, 110], O5: [370, 175] })], [m({ O1: 'top' })], [h('Both stacks hold until the trigger.')]]),
  Line: form([[m({ O4: [285, 170], O5: [360, 170], O2: [140, 170], O3: [215, 170] })], [m({ O1: 'top' })], [h('Hold the line; the later play supplies the breakout trigger.')]]),
  'Four Across': form([[m({ O2: [60, 190], O3: [185, 190], O4: [315, 190], O5: [440, 190] })], [h('Keep equal gaps across the four-player line.')], [m({ O1: [250, 340] })]]),
  Spread: form([[m({ O1: 'top' })], [m({ O4: 'right-corner', O5: 'left-corner' })], [m(wings)], [h('The paint stays empty while all four teammates maintain width.')]]),
  'Empty Corner': form([[m({ O1: 'right-wing' })], [m({ O2: 'left-slot', O3: 'left-corner', O4: 'left-wing' })], [m({ O5: [325, 240] })], [h('The right corner is empty before the side screen.')]]),
  'Empty Side': form([[m({ O1: 'right-wing' })], [m({ O5: 'right-elbow' })], [m({ O2: 'left-slot', O3: 'left-corner', O4: 'left-wing' })], [h('Only O1 and O5 occupy the right side.')]]),
  Overload: form([[m({ O1: 'right-wing' })], [m({ O2: 'right-corner', O4: 'right-short_corner', O5: 'right-elbow' })], [m({ O3: 'left-wing' })]]),
  'High-Low': form([[m({ O4: 'left-elbow' })], [m({ O5: 'right-block' })], [m({ O1: 'top', ...wings })], [h('O4 has a diagonal passing lane to O5.')]]),
  'Dunker Alignment': form([[m(four)], [m({ O5: 'left-dunker' })], [p('O3'), m({ O5: 'right-dunker' }), n('Example: as the ball moves left, O5 shifts to the opposite dunker spot.')]]),
  'Short-Corner Alignment': form([[m(four)], [m({ O5: 'right-short_corner' })], [p('O3'), m({ O5: 'left-short_corner' }), n('Example: O5 follows the ball reversal along the baseline.')]]),
  'Delay Alignment': form([[m({ O5: 'top', O1: 'right-slot' }), p('O5')], [m({ O1: 'right-corner' })], [m({ O2: 'right-wing', O3: 'left-corner' })], [m({ O4: 'left-wing' })]]),
  'Pistol Alignment': form([[m({ O1: 'right-wing' })], [m({ O2: 'right-corner' })], [m({ O5: 'right-slot' })], [m({ O3: 'left-corner', O4: 'left-wing' })]]),
  'Princeton Alignment': form([[m({ O5: 'high_post' })], [m({ O1: 'right-slot', O2: 'left-slot' })], [m({ O3: 'left-corner', O4: 'right-corner' })], [h('Hold the perimeter width and leave both backdoor lanes open.')]]),
  'Flex Alignment': form([[m({ O3: 'left-corner', O4: 'right-corner', O5: 'left-block' })], [m({ O1: 'left-slot', O2: 'right-slot' })], [h('O1 holds the ball at the left guard spot.')], [h('The corner cutter can use the low-post flex screen before the passer screens down.')]]),
  'Triangle Alignment': form([[m({ O2: 'right-corner' })], [m({ O1: 'right-wing' })], [m({ O5: 'right-block' })], [m({ O3: 'left-wing', O4: 'left-slot' })]]),
};
