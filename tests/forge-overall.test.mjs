import assert from 'node:assert/strict';
import test from 'node:test';
import { SKILLS } from '../src/components/forge/bapSkills.js';
import { forgeCompositeScore, forgePlayerScore } from '../src/components/forge/forgePool.js';
import {
  forgeMinutesWeightedOverall,
  getForgeCompositeOvrContext,
  getForgeCompositeRole,
  getForgePlayerRole,
} from '../src/components/forge/forgeOverall.js';

const neutralRatings = Object.fromEntries(SKILLS.map(skill => [skill.key, 75]));
const withRating = (key, value) => ({ ...neutralRatings, [key]: value });

test('specific Body donor position determines composite role before broader positions or role group', () => {
  const picks = {
    body: { value: 80, player: { positions: ['PF'], roleGroup: 'Big', measurements: { position: 'SF' } } },
  };

  assert.equal(getForgePlayerRole(picks.body.player), 'Wing');
  assert.equal(getForgeCompositeRole(picks), 'Wing');
  assert.deepEqual(getForgeCompositeOvrContext(picks), { role: 'Wing', label: 'Balanced OVR' });
  assert.equal(getForgePlayerRole({ positions: ['SF'], roleGroup: 'Big' }), 'Wing');
  assert.equal(getForgePlayerRole({ positions: ['PF'], roleGroup: 'Guard' }), 'Big');
});

test('Guard and Big draft groups fix composite role ahead of a mismatched Body donor', () => {
  const guardBodyPicks = {
    body: { value: 80, player: { measurements: { position: 'PG' }, roleGroup: 'Guard' } },
    scoring: { value: 75, player: { roleGroup: 'Big' } },
    jumpShot: { value: 99, player: { roleGroup: 'Big' } },
    rimProtection: { value: 75, player: { roleGroup: 'Big' } },
  };
  const bigBodyPicks = { ...guardBodyPicks, body: { value: 80, player: { measurements: { position: 'C' }, roleGroup: 'Big' } } };

  assert.equal(getForgeCompositeRole(guardBodyPicks, 'Guard'), 'Guard');
  assert.equal(getForgeCompositeRole(guardBodyPicks, 'Big'), 'Big');
  assert.equal(getForgeCompositeRole(guardBodyPicks, 'All'), 'Guard');
  assert.equal(getForgeCompositeRole(bigBodyPicks, 'Guard'), 'Guard');
  assert.equal(getForgeCompositeRole(bigBodyPicks, 'Big'), 'Big');
  assert.equal(getForgeCompositeRole(bigBodyPicks, 'All'), 'Big');
  assert.equal(getForgeCompositeOvrContext(guardBodyPicks, 'Guard').label, 'Guard-weighted OVR');
  assert.equal(getForgeCompositeOvrContext(guardBodyPicks, 'Big').label, 'Big-weighted OVR');
  assert.ok(forgeCompositeScore(guardBodyPicks, 'Guard') > forgeCompositeScore(guardBodyPicks, 'Big'));
});

test('composite role uses equal donor votes and returns balanced on a tie', () => {
  const donors = [
    { value: 80, player: { roleGroup: 'Guard' } },
    { value: 80, player: { roleGroup: 'Big' } },
    { value: 80, player: { roleGroup: 'Guard' } },
  ];
  const majority = {
    scoring: donors[0], jumpShot: donors[1], finishing: donors[2],
    extra: { value: 99, player: { roleGroup: 'Big' } },
  };
  assert.equal(getForgeCompositeRole(majority), 'Guard');
  assert.equal(getForgeCompositeOvrContext(majority).label, 'Guard-weighted OVR');
  const tie = { scoring: donors[0], jumpShot: donors[1] };
  assert.equal(getForgeCompositeRole(tie), 'Balanced');
  assert.equal(getForgeCompositeOvrContext(tie).label, 'Balanced OVR');
});

test('guard and big OVRs modestly emphasize their requested skills', () => {
  const balanced = forgePlayerScore(neutralRatings);
  const guardJump = withRating('jumpShot', 99);
  const guardRim = withRating('rimProtection', 99);
  const bigFinishing = withRating('finishing', 99);
  const bigRim = withRating('rimProtection', 99);

  assert.ok(forgePlayerScore({ ...guardJump, measurements: { position: 'PG' } }) > forgePlayerScore(guardJump));
  assert.ok(forgePlayerScore({ ...guardRim, measurements: { position: 'SG' } }) < forgePlayerScore(guardRim));
  assert.ok(forgePlayerScore({ ...bigFinishing, measurements: { position: 'PF' } }) > forgePlayerScore(bigFinishing));
  assert.ok(forgePlayerScore({ ...bigRim, measurements: { position: 'C' } }) > forgePlayerScore(bigRim));
  assert.equal(balanced, forgePlayerScore({ ...neutralRatings, measurements: { position: 'SF' } }));
});

test('missing ratings stay neutral and explicit skill weights take precedence', () => {
  assert.equal(forgePlayerScore({}), 75);
  const weights = Object.fromEntries(SKILLS.map(skill => [skill.key, 0]));
  weights.scoring = 1;
  weights.jumpShot = -5;
  assert.equal(forgePlayerScore({ scoring: 99, measurements: { position: 'PG' } }, weights), 99);

  const partial = forgeCompositeScore({ scoring: { value: 99, player: {} } });
  assert.equal(partial, 99);

  const twoSkillComposite = forgeCompositeScore({
    jumpShot: { value: 99, player: { roleGroup: 'Guard' } },
    rimProtection: { value: 75, player: { roleGroup: 'Guard' } },
  });
  const jumpWeight = SKILLS.find(skill => skill.key === 'jumpShot').weight * 1.12;
  const rimWeight = SKILLS.find(skill => skill.key === 'rimProtection').weight * .9;
  assert.equal(twoSkillComposite, (99 * jumpWeight + 75 * rimWeight) / (jumpWeight + rimWeight));
  assert.equal(forgeCompositeScore({}), null);
});

test('team overall is the minutes-weighted mean of individual role-sensitive OVRs', () => {
  const rotation = [
    { player: { ...withRating('jumpShot', 99), measurements: { position: 'PG' } }, minutes: 160 },
    { player: { ...withRating('jumpShot', 99), measurements: { position: 'C' } }, minutes: 80 },
  ];
  const expected = rotation.reduce((sum, entry) => sum + forgePlayerScore(entry.player) * entry.minutes, 0) / 240;
  assert.equal(forgeMinutesWeightedOverall(rotation), expected);
});
