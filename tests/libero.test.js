import test from 'node:test';
import assert from 'node:assert/strict';
import {createState,startMatch,scorePoint,undoPoint,correctMatch,substitute,displayedPlayer,validateState,clone} from '../core.js';
import {setLibero,calibrateLibero,migrateLiberoState,eligibleLiberoRoles} from '../libero.js';
const confirmed={deadBallConfirmed:true};
function game(round=0,serving=false,liberoRole=null){const s=createState();startMatch(s,{lineup:s.lineup,score:[0,0],round,serving,liberoRole,teams:['A','B']});return s;}
test('only one of the selected back-row roles can be replaced, not 小副 or a server',()=>{
 const s=game();assert.deepEqual(eligibleLiberoRoles(s.match),[5]);assert.throws(()=>setLibero(s.match,2,confirmed));assert.throws(()=>setLibero(s.match,1,confirmed));
 assert.throws(()=>setLibero(s.match,5));setLibero(s.match,5,confirmed);assert.equal(displayedPlayer(s,s.match,6,0).libero,true);
 assert.throws(()=>startMatch(createState(),{lineup:s.lineup,score:[0,0],round:1,serving:true,liberoRole:1,teams:['A','B']}));
 const serving=game(1,true);assert.deepEqual(eligibleLiberoRoles(serving.match),[5]);
});
test('a completed rally is required; manual minus cannot unlock a replacement',()=>{
 const s=game(1,false);setLibero(s.match,5,confirmed);assert.throws(()=>setLibero(s.match,null,confirmed),/完成一球/);
 scorePoint(s.match,1);scorePoint(s.match,1,-1);setLibero(s.match,null,confirmed);assert.throws(()=>setLibero(s.match,1,confirmed),/完成一球/);
 scorePoint(s.match,1);setLibero(s.match,1,confirmed);assert.equal(s.match.libero.role,1);
 assert.throws(()=>setLibero(s.match,5,confirmed),/先换回/);
});
test('rotation returns original player before front row, and blocks immediate re-entry',()=>{
 const s=game(1,false,5),original=s.match.lineup[5];scorePoint(s.match,0);assert.equal(s.match.round,2);assert.equal(s.match.libero.role,null);assert.equal(s.match.lineup[5],original);
 assert.equal(s.match.libero.events.at(-1).reason,'rotation');assert.throws(()=>setLibero(s.match,1,confirmed),/完成一球/);
 scorePoint(s.match,1);setLibero(s.match,1,confirmed);assert.equal(s.match.libero.role,1);validateState(s);
});
test('undo restores automatic Libero exit but cannot cross later manual replacements',()=>{
 const s=game(1,false,5);scorePoint(s.match,0);undoPoint(s.match);assert.equal(s.match.libero.role,5);assert.equal(s.match.round,1);assert.equal(s.match.libero.rally,0);
 scorePoint(s.match,1);setLibero(s.match,null,confirmed);const before=clone(s);assert.throws(()=>undoPoint(s.match),/校正比赛/);assert.deepEqual(s,before);
});
test('normal substitution cannot replace an on-court Libero slot or designated Libero',()=>{
 const s=game(0,false,5);s.players.push({id:'bench',name:'替补',short:'补',position:'副攻'});s.match?.rosterIds.push('bench');
 assert.throws(()=>substitute(s,5,'bench'),/先换回/);assert.throws(()=>substitute(s,6,'bench'),/普通换人/);
 scorePoint(s.match,1);setLibero(s.match,null,confirmed);substitute(s,5,'bench');scorePoint(s.match,1);setLibero(s.match,5,confirmed);assert.equal(s.match.libero.replacedId,'bench');
});
test('correction is atomic and old ongoing matches require explicit confirmation',()=>{
 const s=game(0,false,5),before=clone(s);assert.throws(()=>correctMatch(s.match,{score:[9,8],round:0,serving:false,liberoRole:1}));assert.deepEqual(s,before);
 delete s.match.libero;delete s.liberoPlan;delete s.liberoChoices;migrateLiberoState(s);assert.equal(s.match.libero.verified,false);assert.throws(()=>scorePoint(s.match,0),/确认/);
 calibrateLibero(s.match,5,confirmed);scorePoint(s.match,1);validateState(s);
});
test('malformed Libero config and state are rejected without affecting valid state',()=>{
 const s=game();for(const change of [x=>x.liberoPlan=[1,1],x=>x.liberoChoices=[1],x=>x.match.libero.role=2,x=>x.match.libero.rally=-1,x=>x.match.libero.replacedId='bad',x=>x.match.libero.events=[{}]]){const bad=clone(s);change(bad);assert.throws(()=>validateState(bad));}
});

test('legacy calibration discards unverifiable old score undo history; no-Libero matches stay usable',()=>{
 const s=game();scorePoint(s.match,1);delete s.match.libero;migrateLiberoState(s);calibrateLibero(s.match,null,confirmed);assert.equal(s.match.history.length,0);
 const noLibero=game();noLibero.match.lineup[6]=null;noLibero.match.originalLineup[6]=null;delete noLibero.match.libero;migrateLiberoState(noLibero);assert.equal(noLibero.match.libero.verified,true);scorePoint(noLibero.match,0);validateState(noLibero);
});
