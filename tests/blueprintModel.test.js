import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildCareerRows } from '../src/components/players/atlasScopes.js';

// Resolve the Vite alias while keeping the application import unchanged.
const blueprintPath = new URL('../src/components/players/blueprintModel.js', import.meta.url);
const normalizePath = pathToFileURL(fileURLToPath(new URL('../src/lib/normalizePlayerName.js', import.meta.url))).href;
const blueprintText = (await readFile(blueprintPath,'utf8')).replace("'@/lib/normalizePlayerName'",JSON.stringify(normalizePath));
const blueprint = await import(`data:text/javascript;base64,${Buffer.from(blueprintText).toString('base64')}`);
const { buildBlueprintRows,statText,statsFromTotals,sumCompleteTotals } = blueprint;

const regularTotals = {
  gamesPlayed:56,
  minutesPlayed:1020,
  points:348,
  totalRebounds:155,
  assists:110,
  fieldGoalsMade:127,
  fieldGoalsAttempted:300,
  threePointFieldGoalsMade:53,
  threePointFieldGoalsAttempted:181,
  freeThrowsMade:41,
  freeThrowsAttempted:51,
};

function season(seasonPhase, teamCode, totals, extra = {}) {
  return { seasonStartYear:2025,seasonPhase,teamCode,isMultiTeamAggregate:false,totals,...extra };
}

function sourceWithPublicStats({ name = 'Alex Caruso', publicRows, teamCode = 'OKC', rowPhase = 'regular', rowGames = 56, rowMinutes = 1020, box } = {}) {
  return {
    players:[{ playerRef:'player-1',displayName:name }],
    blueprintRows:[{
      playerRef:'player-1',displayName:name,teamCode,seasonStartYear:2025,phase:rowPhase,
      observed:true,games:rowGames,minutes:rowMinutes,
      box:box || { points:348,rebounds:155,assists:110,fieldGoalsMade:127,fieldGoalAttempts:300,threePointersMade:53,threePointAttempts:181,freeThrowsMade:41,freeThrowAttempts:51 },
    }],
    publicStats:publicRows,
  };
}

test('regular season join requires the matching year, phase, team, and unambiguous player name', () => {
  const publicRows = [{
    name:'Alex Caruso',normalizedName:'alex caruso',seasons:[
      season('playoffs','OKC',{ gamesPlayed:15,points:165 }),
      season('regular','LAL',{ gamesPlayed:10,points:60 }),
      season('regular','OKC',regularTotals,{ advanced:{ true_shooting_percentage:0.54 } }),
      season('regular','OKC',{ gamesPlayed:56,points:999 },{ seasonStartYear:2024 }),
      season('regular','OKC',{ gamesPlayed:56,points:777 },{ isMultiTeamAggregate:true }),
    ],
  }];
  const [row] = buildBlueprintRows(sourceWithPublicStats({ publicRows }));
  assert.equal(row.available,true);
  assert.equal(row.phase,'regular');
  assert.equal(row.teamCode,'OKC');
  assert.equal(row.stats.gp,56);
  assert.equal(row.stats.pts,348 / 56);
  assert.equal(row.stats.ts,0.54);
  assert.equal(row.statsSource,'Published full-season totals');
});

test('regular records stay unavailable when only another phase or team has published totals', () => {
  const [phaseMiss] = buildBlueprintRows(sourceWithPublicStats({ publicRows:[{
    name:'Alex Caruso',normalizedName:'alex caruso',seasons:[season('playoffs','OKC',{ gamesPlayed:15,points:165 })],
  }] }));
  assert.equal(phaseMiss.available,false);
  assert.equal(phaseMiss.stats.gp,null);
  assert.equal(phaseMiss.stats.pts,null);

  const [teamMiss] = buildBlueprintRows(sourceWithPublicStats({ publicRows:[{
    name:'Alex Caruso',normalizedName:'alex caruso',seasons:[season('regular','LAL',regularTotals)],
  }] }));
  assert.equal(teamMiss.available,false);
  assert.equal(teamMiss.totals.points,undefined);
});

test('normalized-name collisions require an exact display-name identity', () => {
  const publicRows = [
    { name:'Jordan Lee',normalizedName:'jordan lee',seasons:[season('regular','OKC',{ gamesPlayed:20,points:100 })] },
    { name:'Jordan Li',normalizedName:'jordan lee',seasons:[season('regular','OKC',{ gamesPlayed:20,points:900 })] },
  ];
  const [exact] = buildBlueprintRows(sourceWithPublicStats({ name:'Jordan Lee',publicRows }));
  assert.equal(exact.stats.pts,5);

  const [ambiguous] = buildBlueprintRows(sourceWithPublicStats({ name:'Jordán Lee',publicRows }));
  assert.equal(ambiguous.available,false);
  assert.equal(ambiguous.stats.pts,null);
});

test('observed playoff rows use their own package totals and retain explicit zero values', () => {
  const [row] = buildBlueprintRows(sourceWithPublicStats({
    rowPhase:'playoffs',
    rowGames:15,
    rowMinutes:353,
    box:{ points:165,rebounds:45,assists:31,fieldGoalsMade:55,fieldGoalAttempts:115,threePointersMade:33,threePointAttempts:74,freeThrowsMade:22,freeThrowAttempts:27 },
    publicRows:[{ name:'Alex Caruso',normalizedName:'alex caruso',seasons:[season('regular','OKC',regularTotals)] }],
  }), 'playoffs');
  assert.equal(row.phase,'playoffs');
  assert.equal(row.statsSource,'Observed package phase');
  assert.equal(row.stats.gp,15);
  assert.equal(row.stats.pts,11);

  const zero = statsFromTotals({ gamesPlayed:2,points:0,fieldGoalsMade:0,fieldGoalsAttempted:4 });
  assert.equal(zero.pts,0);
  assert.equal(zero.fg,0);
  assert.equal(statText('fg',zero.fg),'0.0%');
});

test('missing totals and zero denominators remain unavailable rather than becoming zero', () => {
  const stats = statsFromTotals({ gamesPlayed:0,points:0,fieldGoalsMade:0,fieldGoalsAttempted:0 });
  assert.equal(stats.gp,0);
  assert.equal(stats.pts,null);
  assert.equal(stats.fg,null);
  assert.equal(statText('pts',null),'—');
  assert.equal(sumCompleteTotals([], 'points'),null);
  assert.equal(sumCompleteTotals([{ totals:{ points:0 } },{ totals:{ points:0 } }], 'points'),0);
  assert.equal(sumCompleteTotals([{ totals:{ points:0 } },{ totals:{} }], 'points'),null);
});

test('career spans preserve missing component totals and minutes as unavailable', () => {
  const [row] = buildCareerRows({
    playerRef:'player-1',name:'Test Player',positions:['G'],rows:[
      { seasonStartYear:2020,teamCode:'AAA',games:10,minutes:100,careerMetrics:{ points:0,assists:1,rebounds:2,steals:0,blocks:0,turnovers:0 } },
      { seasonStartYear:2020,teamCode:'BBB',games:5,minutes:null,careerMetrics:{ assists:2,rebounds:3,steals:0,blocks:0,turnovers:0 } },
    ],
  });
  assert.equal(row.stats.gp,15);
  assert.equal(row.stats.pts,null);
  assert.equal(row.stats.ast,20 / 15);
  assert.equal(row.stats.mpg,null);
  assert.equal(row.stats.stl,0);
});
