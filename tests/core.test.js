import test from 'node:test';
import assert from 'node:assert/strict';
import {createState,startMatch,scorePoint,undoPoint,correctMatch,checkFormation,standardFormations,roleAt,displayedPlayer,substitute,returnStarter,endMatch,validateState,clone} from '../core.js';
function game(serving=false,round=0){const s=createState();startMatch(s,{lineup:s.lineup,score:[0,0],round,serving,teams:['我方','对方']});return s;}
for(const [serving,team,expectedRound,expectedServe]of [[true,0,0,true],[true,1,0,false],[false,0,1,true],[false,1,0,false]])test(`rally transition: serving=${serving}, winner=${team}`,()=>{const s=game(serving);scorePoint(s.match,team);assert.equal(s.match.round,expectedRound);assert.equal(s.match.serving,expectedServe);assert.equal(s.match.score[team],1);});
test('six side-outs restore all positions; service streaks do not rotate',()=>{const s=game();for(let i=0;i<6;i++){scorePoint(s.match,0);const r=s.match.round;for(let j=0;j<4;j++)scorePoint(s.match,0);assert.equal(s.match.round,r);scorePoint(s.match,1);}assert.equal(s.match.round,0);for(let p=1;p<=6;p++)assert.equal(roleAt(p,0),p-1);assert.equal(roleAt(1,1),1);});
test('undo restores score, service and rotation without touching edited formation or substitution',()=>{const s=game();s.players.push({id:'bench',name:'替补',short:'替',position:'主攻'});s.match?.rosterIds.push('bench');scorePoint(s.match,0);s.match.formations[0][2]=[70,20];substitute(s,1,'bench');undoPoint(s.match);assert.deepEqual(s.match.score,[0,0]);assert.equal(s.match.serving,false);assert.equal(s.match.round,0);assert.equal(s.match.lineup[1],'bench');assert.deepEqual(s.match.formations[0][2],[70,20]);});
test('manual minus leaves rotation and service alone, supports undo and floors at zero',()=>{const s=game();assert.equal(scorePoint(s.match,0,-1),false);assert.equal(s.match.history.length,0);scorePoint(s.match,0);scorePoint(s.match,0,-1);assert.deepEqual(s.match.score,[0,0]);assert.equal(s.match.round,1);assert.equal(s.match.serving,true);undoPoint(s.match);assert.deepEqual(s.match.score,[1,0]);});
test('correction clears undo history but keeps coordinates and lineup',()=>{const s=game();scorePoint(s.match,0);const f=clone(s.match.formations);correctMatch(s.match,{score:[15,9],round:5,serving:false});assert.equal(s.match.history.length,0);assert.equal(undoPoint(s.match),false);assert.deepEqual(s.match.formations,f);scorePoint(s.match,0);assert.equal(s.match.round,0);});
test('all regular formations legal; equality and reversed row relations fail',()=>{for(const f of standardFormations())assert.equal(checkFormation(f).length,0);const f=standardFormations()[0];f[4][0]=f[3][0];assert.match(checkFormation(f)[0].message,/左侧/);f[4][1]=f[5][1];assert.ok(checkFormation(f).some(e=>e.message.includes('前方')));});
test('receive previews use only 大主 and 大副, with at most one Libero',()=>{const s=createState(),m={lineup:s.lineup};for(let r=0;r<6;r++){let n=0;for(let p=1;p<=6;p++){const v=displayedPlayer(s,m,p,r);if(v.libero){n++;assert.ok([1,5,6].includes(p));assert.ok([1,5].includes(v.role));assert.equal(v.player.id,s.lineup[6]);}}assert.ok(n<=1);}s.liberoChoices[0]=null;assert.equal(displayedPlayer(s,m,6,0).libero,false);});
test('no libero option displays actual middle; server always follows actual slot one',()=>{const s=game();s.match.lineup[6]=null;for(let r=0;r<6;r++)for(let p=1;p<=6;p++)assert.equal(displayedPlayer(s,s.match,p,r).libero,false);assert.equal(s.match.lineup[roleAt(1,0)],s.lineup[0]);assert.equal(s.match.lineup[roleAt(1,1)],s.lineup[1]);});
test('substitute and return starter preserve all round coordinates and match state',()=>{const s=game(false,4),original=s.match.lineup[1],before=clone(s.match.formations);s.players.push({id:'bench',name:'替补',short:'替',position:'主攻'});s.match?.rosterIds.push('bench');substitute(s,1,'bench');assert.equal(s.match.lineup[1],'bench');assert.equal(s.match.round,4);assert.equal(s.lineup[1],original);assert.throws(()=>substitute(s,2,'bench'));returnStarter(s,1);assert.equal(s.match.lineup[1],original);assert.deepEqual(s.match.formations,before);});
test('exit can discard or overwrite all six formations; substitutes never persist into starters',()=>{const s=game();const before=clone(s.formations);s.match.formations[2][3]=[40,35];endMatch(s,false);assert.deepEqual(s.formations,before);startMatch(s,{lineup:s.lineup,score:[0,0],round:0,serving:false,teams:['A','B']});s.match.formations[2][3]=[40,35];endMatch(s,true);assert.deepEqual(s.formations[2][3],[40,35]);assert.equal(s.match,null);});
test('backup roundtrip includes ongoing game, history and edited formations',()=>{const s=game();scorePoint(s.match,0);assert.deepEqual(validateState(JSON.parse(JSON.stringify(s))),s);});
test('malformed backups are rejected without altering current state',()=>{for(const change of [s=>s.version=99,s=>s.formations=[],s=>s.lineup[1]=s.lineup[0],s=>s.match.score=[-1,0],s=>s.players[0].short='两个',s=>s.match.history=[{score:[0,0],round:9,serving:false}],s=>s.match.formations[0][1]=[NaN,2],s=>s.match.substitutions=[{}]]){const s=game(),bad=clone(s);change(bad);assert.throws(()=>validateState(bad));assert.equal(s.match.round,0);}});
test('duplicate starting players and invalid score correction are rejected',()=>{const s=createState();assert.throws(()=>startMatch(s,{lineup:[s.lineup[0],...s.lineup.slice(0,6)],score:[0,0],round:0,serving:false,teams:['A','B']}));const m=game().match;assert.throws(()=>correctMatch(m,{score:[1.5,0],round:0,serving:false}));});

test('pre-match roster role edits persist and are used by the next match',async()=>{
  const {saveRoster}=await import('../core.js');const s=createState(),lineup=clone(s.lineup),formations=clone(s.formations);
  [lineup[1],lineup[4]]=[lineup[4],lineup[1]];
  saveRoster(s,s.players,lineup);assert.deepEqual(s.formations,formations);validateState(JSON.parse(JSON.stringify(s)));
  startMatch(s,{lineup:s.lineup,score:[0,0],round:0,serving:false,teams:['A','B']});
  assert.equal(displayedPlayer(s,s.match,2,0).player.id,lineup[1]);assert.equal(displayedPlayer(s,s.match,2,0).role,1);
});
test('duplicate role selection rejects atomically; roster editing during a match preserves both lineups',async()=>{
  const {saveRoster}=await import('../core.js');const s=createState(),before=clone(s),bad=clone(s.lineup);bad[1]=bad[4];
  assert.throws(()=>saveRoster(s,s.players,bad));assert.deepEqual(s,before);
  startMatch(s,{lineup:s.lineup,score:[0,0],round:0,serving:false,teams:['A','B']});const lineup=clone(s.lineup),live=clone(s.match.lineup),players=clone(s.players);players[1].name='新姓名';
  saveRoster(s,players,bad);assert.deepEqual(s.lineup,lineup);assert.deepEqual(s.match.lineup,live);assert.equal(s.players[1].name,'新姓名');
});

test('player positions stay generic while starting and substitution roles remain distinct',async()=>{
 const {resolvePlayerPosition,ROLES,PLAYER_POSITIONS,shortName,saveRoster}=await import('../core.js');const s=game();
 const generic=['二传','主攻','副攻','接应','主攻','副攻','自由人'];
 assert.deepEqual(PLAYER_POSITIONS,['二传','主攻','副攻','接应','自由人','其他']);
 assert.deepEqual(s.players.map(p=>p.position),generic);
 s.players.forEach((p,i)=>p.position=[...ROLES,'自由人'][i]);const before=clone(s);validateState(s);
 assert.deepEqual(s.players.map(p=>resolvePlayerPosition(p)),generic);assert.deepEqual(s,before);
 const matchBefore=clone(s.match),lineupBefore=clone(s.lineup);saveRoster(s,s.players,s.lineup);
 assert.deepEqual(s.players.map(p=>p.position),generic);assert.deepEqual(s.match,matchBefore);assert.deepEqual(s.lineup,lineupBefore);
 assert.equal(resolvePlayerPosition({id:'bench',position:'主攻'}),'主攻');assert.equal(resolvePlayerPosition({position:'小副'}),'副攻');
 assert.equal(shortName(' 林晓 '),'晓');assert.equal(shortName('张😀'),'😀');
});
