import { sequence as q, move as m, defend as d, together as t, pass as p, screen as s, cutOffScreen as u, hold as h, note as n, mark, branch, swap, shot, pickRoll, SPREAD, FIVE, HORNS, HIGH, ZOOM, PISTOL } from '@/components/playbook/playSequence';

export default {
  '5-Out Motion': q(FIVE, [
    [p('O2')], [m({ O1: 'rim' })], [d({ X5: [250, 140] }), m({ O1: 'left-corner', O4: 'left-wing', O3: 'top' }), n('Example: the rim cut is covered; the weak side fills as O1 clears.')],
    [m({ O3: 'top', O4: 'left-wing', O5: 'right-corner' })], [p('O3'), m({ O2: 'rim' })], [p('O2'), shot(), n('Example: the repeated cut produces a rim attempt.')],
  ]),
  '4-Out Motion': q(SPREAD, [
    [p('O2'), m({ O1: 'rim' })], [m({ O1: 'right-corner', O3: 'top', O4: 'left-wing' })], [m({ O5: 'right-short_corner' })],
    [m({ O2: [310, 150], O4: 'left-slot', O5: 'left-dunker' })], [p('O3'), m({ O1: 'right-corner', O2: 'right-wing', O4: 'left-wing', O5: 'right-block' })],
  ]),
  'Pass-and-Cut Motion': q(FIVE, [[p('O2')], [m({ O1: 'rim' })], [m({ O1: 'left-corner', O4: 'left-wing', O3: 'top' }), n('Example: no return pass is available; fill behind the clearing cutter.')], [m({ O3: 'top', O4: 'left-wing' })], [p('O3'), m({ O2: 'rim' })]]),
  'Pass-and-Screen-Away Motion': q(FIVE, [[p('O2')], [s('O1', 'X3', 'down')], [u('O3', 'lane', 'O1'), n('Example: O3 curls off the screen.')], [m({ O1: 'left-slot' })], [m({ O3: 'left-corner', O4: 'left-wing' })], [p('O1'), n('O2 returns the ball to the player who opened after screening; continue the same rule from the new side.')]]),
  'Read-and-React': q(FIVE, [
    [h('Hold the five-out shell.')], [p('O2'), m({ O1: 'rim' })], [m({ O1: 'left-corner', O2: [310, 145], O3: 'left-slot', O4: 'left-wing' })],
    [m({ O5: 'right-block' }), p('O5'), s('O2', 'X3', 'back'), u('O3', 'rim', 'O2')],
    [d({ X4: [115, 220] }), m({ O4: 'left-block' }), n('Example: X4 denies the wing and O4 backcuts.')], [p('O2'), m(FIVE)],
  ]),
  'Dribble Drive Motion': q(SPREAD, [[m({ O1: [295, 150] })], [m({ O4: 'left-wing', O3: 'left-slot' })], [h('O3 fills the slot as O4 lifts behind the drive.')], [m({ O5: 'left-dunker' })], [d({ X5: [295, 98] }), p('O2'), n('Example: help stops the drive, so O1 kicks to O2.')], [m({ O2: [355, 130] })]]),
  'Princeton Offense': q({ ...HIGH, O3: 'left-corner', O4: 'left-wing' }, [
    [p('O5')], [m({ O1: 'left-slot', O2: 'right-slot' })], [mark('hub'), d({ X2: [360, 310] }), m({ O2: 'rim' }), n('Example: X2 overplays and O2 backcuts.')],
    [branch('hub', 'Alternate read: the backdoor is covered; use a wing handoff.'), m({ O2: [340, 220], O5: [295, 220] }), p('O2', true)], [s('O4', 'X3', 'down'), u('O3', 'left-wing', 'O4')], [m({ O1: 'left-slot', O2: 'right-wing', O3: 'left-wing', O4: 'left-corner', O5: 'top' }), p('O5')],
  ]),
  'Princeton Chin': q({ ...HIGH, O3: 'left-slot' }, [[p('O2')], [s('O5', 'X1', 'back'), u('O1', 'rim', 'O5')], [h('O2 faces the rim cutter; the help stays in the passing lane.')], [m({ O1: 'right-corner' }), n('Example: the initial rim pass is denied; O1 clears into the open corner.')], [s('O5', 'X3', 'flare'), u('O3', 'left-wing', 'O5')], [p('O3'), s('O4', 'X3'), u('O3', [195, 160], 'O4')]]),
  'Princeton Point': q({ ...FIVE, O1: 'right-slot', O5: 'top' }, [[p('O5')], [m({ O1: 'left-corner', O4: 'left-wing', O3: 'left-slot' })], [d({ X2: [390, 260] }), n('Example: X2 trails; O2 takes the over route.')], [m({ O2: [305, 215] }, { O2: [[365, 300], [310, 275]] })], [p('O2', true)], [m({ O1: 'left-corner', O2: 'right-wing', O3: 'left-slot', O4: 'left-wing', O5: 'top' })]]),
  'Flex Offense': q({ O1: 'left-slot', O2: 'right-slot', O3: 'left-corner', O4: 'right-corner', O5: 'left-block' }, [[p('O2')], [s('O5', 'X3', 'cross'), u('O3', 'right-block', 'O5')], [s('O1', 'X5', 'down')], [u('O5', 'left-slot', 'O1'), m({ O1: 'left-corner' })], [p('O5')], [s('O3', 'X4', 'cross'), u('O4', 'left-block', 'O3'), p('O4')]]),
  'Shuffle Offense': q({ ...SPREAD, O4: 'left-elbow' }, [[p('O2')], [t(s('O4', 'X3', 'back'), m({ O5: 'right-dunker' })), u('O3', 'right-block', 'O4')], [m({ O4: 'left-block' })], [m({ O3: 'right-corner' })], [m({ O1: 'left-slot', O4: 'left-corner', O5: 'left-elbow' })], [p('O1'), s('O5', 'X2', 'back'), u('O2', 'left-block', 'O5')]]),
  'Swing Offense': q({ ...SPREAD, O2: 'right-slot' }, [[p('O2'), p('O1'), p('O3')], [s('O1', 'X2', 'flare')], [u('O2', 'right-wing', 'O1'), m({ O1: 'right-slot' })], [m({ O5: 'left-elbow' })], [m({ O3: [140, 140] }), n('Example: O3 attacks the closeout.')], [p('O2'), m({ O3: 'left-wing' }), p('O1')]]),
  'Triangle Offense': q({ ...SPREAD, O1: 'right-slot', O3: 'left-slot', O4: 'left-elbow' }, [[p('O2'), m({ O1: 'right-corner' })], [m({ O5: 'right-block' })], [p('O5'), mark('post'), n('Example: choose the post entry.')], [s('O2', 'X1', 'back'), u('O1', 'rim', 'O2')], [s('O4', 'X3', 'flare'), u('O3', 'left-wing', 'O4')], [branch('post', 'Alternate read: strong-side help closes; reverse to the weak side.'), p('O4'), p('O3')]]),
  'Blocker-Mover': q({ ...SPREAD, O4: 'left-elbow' }, [[h('O4/O5 are blockers; O1/O2/O3 are movers.')], [t(s('O4', 'X3', 'down'), s('O5', 'X2', 'down')), t(u('O3', 'left-slot', 'O4'), u('O2', 'right-slot', 'O5'))], [s('O4', 'X3', 'flare'), m({ O3: 'left-wing' })], [p('O3')], [d({ X2: [390, 280] }), m({ O2: 'rim' }), n('Example: X2 top-locks O2, who backcuts.')], [swap('X2', 'X5'), m({ O5: 'right-block' }), n('Example: after the switch, O5 seals the smaller X2.')]]),
  'Continuity P&R': q({ ...SPREAD, O2: 'left-wing', O3: 'right-wing' }, [pickRoll(), [p('O2'), n('Example: no finish on the right; reverse to the left wing.')], [s('O5', 'X2')], [m({ O1: 'right-corner', O3: 'right-slot' })], [u('O2', [195, 145], 'O5'), m({ O5: 'rim' })], [p('O5'), n('Example: the opposite-side screen frees the roller.')]]),
  'Continuity DHO': q({ ...FIVE, O1: 'right-slot', O5: 'top' }, [[m({ O1: [300, 270] }), p('O1', true)], [m({ O1: [340, 175] }), p('O2')], [m({ O5: [360, 245] }), p('O5')], [m({ O2: [410, 245] }), p('O2', true)], [m({ O2: [330, 145] }), n('Example: the second receiver turns the corner.')]], { owner: 'O5' }),
  'Delay Offense': q({ ...FIVE, O1: [250, 400], O3: 'left-corner', O4: [120, 150], O5: [320, 340] }, [[m({ O1: 'right-slot', O5: 'top' }), p('O5')], [m({ O1: 'right-corner' })], [s('O4', 'X3', 'down'), u('O3', 'left-wing', 'O4')], [m({ O3: [195, 270] }), p('O3', true), n('Example: choose the handoff.')], [p('O5'), m({ O2: [305, 270] }), p('O2', true)]]),
  'Horns Series': q(HORNS, [[h('Hold the Horns shell.')], [s('O5', 'X1'), u('O1', [305, 205], 'O5'), n('Example: select the right-horn screen.')], [m({ O4: 'left-slot' })], [h('O2/O3 hold the corners.')], [s('O4', 'X1'), t(u('O1', [195, 145], 'O4'), m({ O5: 'right-dunker' })), n('Example: flow into Horns Twist.')]]),
  'Pistol / 21 Series': q(PISTOL, [[m({ O1: 'right-wing' })], [m({ O2: [440, 265] }), p('O2', true)], [s('O5', 'X2')], [m({ O3: 'left-corner', O4: 'left-slot' })], [u('O2', [310, 160], 'O5')], [m({ O5: 'rim', O1: 'right-corner' }), p('O5'), n('Example: continue with the roll pass.')]]),
  'Zoom Series': q(ZOOM, [[h('O2 starts low; O5 has the ball.')], [s('O4', 'X2', 'down')], [u('O2', [350, 265], 'O4')], [p('O2', true)], [m({ O2: [290, 145], O5: 'right-block', O4: 'right-slot' })], [h('O1/O3 hold the weak-side perimeter.')]], { owner: 'O5' }),
};
