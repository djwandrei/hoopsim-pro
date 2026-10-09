import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

// Load the pure native report adapters without pulling browser-only relays into Node.
let source = await readFile(new URL('../src/lib/season/nativeSeasonEngine.js',import.meta.url),'utf8');
const replacements = [
  ["import { loadNativeModule } from '@/components/native/nativeModules';", "const loadNativeModule = async () => { throw new Error('Native module loading is outside this adapter test.'); };"] ,
  ["import { originalFetch } from '@/components/native/nativeTransport';", 'const originalFetch = globalThis.fetch;'],
  ["import { isV4RequiredError } from '@/lib/season/v4Policy';", 'const isV4RequiredError = () => false;'],
  ["import { num, codeOf } from '@/lib/scalars';", "const num = (value, fallback = 0) => (Number.isFinite(Number(value)) ? Number(value) : fallback); const codeOf = value => typeof value === 'string' && value.trim() ? value.trim() : null;"],
];
for (const [before,after] of replacements) {
  assert.ok(source.includes(before),`Expected import shim target: ${before}`);
  source = source.replace(before,after);
}
assert.doesNotMatch(source,/from\s+['"]@\//,'The adapter test module should not retain Vite aliases.');
const engine = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const { alignGamesToSchedule,gamesFromPlayerLogs,mapSeasonReport,normalizeBlend } = engine;

function teamLog(teamId, game) {
  return { teamId,games:[{ gameId:'game-1',teamId,opponentId:teamId === 'BOS' ? 'LAL' : 'BOS',home:teamId === 'BOS',score:teamId === 'BOS' ? 110 : 102,opponentScore:teamId === 'BOS' ? 102 : 110,...game }] };
}

test('player team logs merge by gameId and orient scores and box lines', () => {
  const games = gamesFromPlayerLogs([
    teamLog('BOS',{ players:[
      { playerId:'b-1',name:'Boston Guard',minutes:0,totals:{ points:0,rebounds:null,assists:3,steals:0,blocks:false } },
      { playerId:'b-2',name:'Boston Forward',minutes:34,totals:{ points:24,rebounds:8,assists:2,steals:1,blocks:1 } },
    ],ot:0 }),
    teamLog('LAL',{ players:[
      { playerId:'l-1',name:'Los Angeles Guard',minutes:38,totals:{ points:27,rebounds:4,assists:8,steals:2,blocks:0 } },
    ] }),
  ]);

  assert.equal(games.length,1);
  assert.equal(games[0].gameId,'game-1');
  assert.equal(games[0].home,'BOS');
  assert.equal(games[0].away,'LAL');
  assert.equal(games[0].homePts,110);
  assert.equal(games[0].awayPts,102);
  assert.equal(games[0].ot,0);
  assert.equal(games[0].boxHome.lines.length,2);
  assert.equal(games[0].boxAway.lines.length,1);
  assert.deepEqual(games[0].boxHome.lines[0],{
    name:'Boston Guard',min:0,pts:0,reb:null,ast:3,stl:0,blk:null,
  });
});

test('duplicate sides, duplicate player lines, and conflicting scores or teams are rejected', () => {
  const home = teamLog('BOS',{ players:[{ playerId:'b-1',name:'Boston Guard',totals:{ points:10 } }] });
  const away = teamLog('LAL',{ players:[{ playerId:'l-1',name:'Los Angeles Guard',totals:{ points:12 } }] });
  assert.throws(() => gamesFromPlayerLogs([home,home]),/duplicates its home team row/);

  const duplicatePlayer = teamLog('BOS',{ players:[
    { playerId:'same',name:'Boston Guard',totals:{ points:10 } },
    { playerId:'same',name:'Boston Guard',totals:{ points:10 } },
  ] });
  assert.throws(() => gamesFromPlayerLogs([duplicatePlayer]),/duplicates a player line/);

  const badScore = teamLog('LAL',{ score:101,opponentScore:110,players:[] });
  assert.throws(() => gamesFromPlayerLogs([home,badScore]),/conflicting away score/);

  const badTeams = teamLog('LAL',{ opponentId:'NYK',players:[] });
  assert.throws(() => gamesFromPlayerLogs([home,badTeams]),/conflicts on home\/away teams/);
  assert.throws(() => gamesFromPlayerLogs([{ teamId:'BOS',games:[{ teamId:'BOS',opponentId:'LAL',home:true,score:1,opponentScore:0 }] }]),/missing its gameId/);
});

test('schedule alignment uses exact IDs first, then consumes unmatched pair occurrences', () => {
  const first = { gameId:'first',home:'BOS',away:'LAL',homePts:101,awayPts:99 };
  const second = { gameId:'second',home:'BOS',away:'LAL',homePts:88,awayPts:90 };
  const aligned = alignGamesToSchedule([first,second],[
    { id:'second',home:'BOS',away:'LAL' },
    { id:'unknown',home:'BOS',away:'LAL' },
    { id:'missing',home:'NYK',away:'BOS' },
  ]);
  assert.deepEqual(aligned,[second,first,null]);
  assert.throws(() => alignGamesToSchedule([first],[{ id:'first',home:'NYK',away:'LAL' }]),/conflicts with the schedule matchup/);
  assert.throws(() => alignGamesToSchedule([first,first],[{ id:'first',home:'BOS',away:'LAL' }]),/duplicate game ID/);
  assert.throws(() => alignGamesToSchedule([first],[{ id:'first',home:'BOS',away:'LAL' },{ id:'first',home:'BOS',away:'LAL' }]),/duplicate game ID/);
});

test('actual schedule results return in schedule order when report games arrive out of order', () => {
  const schedule = [
    { gameId:'actual-1',home:'BOS',away:'LAL',actual:{ home:110,away:102 } },
    { gameId:'actual-2',home:'LAL',away:'BOS',actual:{ home:98,away:105 } },
  ];
  const reportGames = [
    { gameId:'actual-2',home:'LAL',away:'BOS',homePts:97,awayPts:106 },
    { gameId:'actual-1',home:'BOS',away:'LAL',homePts:111,awayPts:103 },
  ];

  const aligned = alignGamesToSchedule(reportGames,schedule);

  assert.deepEqual(aligned.map(game => game?.gameId),['actual-1','actual-2']);
  assert.deepEqual(aligned.map(game => [game?.homePts,game?.awayPts]),[[111,103],[97,106]]);
});

test('blend normalization preserves zero while defaulting only missing or invalid values', () => {
  assert.equal(normalizeBlend(0),0);
  assert.equal(normalizeBlend('0'),0);
  assert.equal(normalizeBlend('0.65'),0.65);
  assert.equal(normalizeBlend(null),0.5);
  assert.equal(normalizeBlend(undefined),0.5);
  assert.equal(normalizeBlend(''),0.5);
  assert.equal(normalizeBlend('not-a-number'),0.5);
  assert.equal(normalizeBlend(false),0.5);
});

test('season report adapters preserve missing metrics and explicit zero values', () => {
  const report = {
    seasons: [{
      standings: [
        { teamId:'BOS',games:null,wins:null,losses:null,ties:null,pointsFor:0,pointsAgainst:null,pace:null,simulatedMetrics:{ offense:null } },
        { teamId:'LAL',games:10,wins:0,losses:10,ties:0,pointsFor:100,pointsAgainst:90,pace:0 },
      ],
      playoffBracket: {
        series: [{
          conference:'EAST',stage:'First round',aId:'BOS',bId:'LAL',
          games:[{ game:1,home:'BOS',away:'LAL',scoreHome:null,scoreAway:0 }],
        }],
      },
    }],
    repeatedRuns: [{
      teamId:'BOS',
      winQuantiles:{ '0.5':null,p50:0 },
      playoffAppearanceRate:null,
      title:null,
    }],
  };
  const mapped = mapSeasonReport(report,{ scheduleSource:'round-robin',scheduleRows:[],league:null });
  assert.deepEqual(mapped.summary[0],{
    code:'BOS',wins:0,losses:null,ties:null,ortg:null,drtg:null,pace:null,playoff:null,title:null,
  });
  assert.deepEqual(mapped.summary[1],{
    code:'LAL',wins:0,losses:10,ties:0,ortg:10,drtg:9,pace:0,playoff:undefined,title:undefined,
  });
  const series = mapped.bracket.rounds.find(round => round.conference === 'EAST').series[0];
  assert.equal(series.games[0].homePts,null);
  assert.equal(series.games[0].awayPts,0);
});
