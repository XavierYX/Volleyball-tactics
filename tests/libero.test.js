import test from 'node:test';
import assert from 'node:assert/strict';
import {createState,startMatch,scorePoint,undoPoint,correctMatch,substitute,displayedPlayer,validateState,clone,roleAt} from '../core.js';
import {setLibero,calibrateLibero,migrateLiberoState,eligibleLiberoRoles} from '../libero.js';
function game(round=0,serving=false,liberoRole=null){const s=createState();startMatch(s,{lineup:s.lineup,score:[0,0],round,serving,liberoRole,teams:['A','B']});return s;}
test('manual Libero selection permits every role including front row and serving slot',()=>{
 const s=game(1,true);assert.deepEqual(eligibleLiberoRoles(s.match),[0,1,2,3,4,5]);
 for(let role=0;role<6;role++){
  setLibero(s.match,role);let count=0;
  for(let p=1;p<=6;p++){const v=displayedPlayer(s,s.match,p,1);if(v.libero){count++;assert.equal(v.role,role);assert.equal(v.player.id,s.lineup[6]);}}
  assert.equal(count,1);validateState(s);
 }
 const initial=game(1,true,1);assert.equal(initial.match.libero.role,1);
});
test('entry, direct role switches, exit and immediate re-entry need no confirmation or rally',()=>{
 const s=game();for(const role of [5,1,null,2,null,5]){setLibero(s.match,role);assert.equal(s.match.libero.role,role);validateState(s);}
 assert.equal(s.match.libero.events.length,6);assert.equal(s.match.libero.rally,0);
});
test('rotation and service changes retain the user selected Libero role',()=>{
 const s=game(1,false,5);scorePoint(s.match,0);assert.equal(s.match.round,2);assert.equal(s.match.libero.role,5);
 const position=[1,2,3,4,5,6].find(p=>roleAt(p,2)===5);assert.equal(displayedPlayer(s,s.match,position,2).libero,true);
 scorePoint(s.match,1);assert.equal(s.match.libero.role,5);validateState(s);
});
test('score undo restores score and rotation while preserving later manual personnel changes',()=>{
 const s=game(1,false,5);scorePoint(s.match,0);undoPoint(s.match);assert.equal(s.match.round,1);assert.equal(s.match.libero.role,5);
 scorePoint(s.match,1);setLibero(s.match,2);undoPoint(s.match);assert.deepEqual(s.match.score,[0,0]);assert.equal(s.match.libero.role,2);validateState(s);
});
test('ordinary replacement updates the player behind a Libero slot without a rule gate',()=>{
 const s=game(0,false,5);s.players.push({id:'bench',name:'替补',short:'补',position:'副攻'});s.match.rosterIds.push('bench');
 substitute(s,5,'bench');assert.equal(s.match.libero.replacedId,'bench');setLibero(s.match,null);assert.equal(displayedPlayer(s,s.match,6,0).player.id,'bench');validateState(s);
});
test('correction accepts user selection and malformed role remains atomic',()=>{
 const s=game(0,false,5);correctMatch(s.match,{score:[9,8],round:0,serving:true,liberoRole:2});assert.equal(s.match.libero.role,2);validateState(s);
 const before=clone(s);assert.throws(()=>correctMatch(s.match,{score:[9,8],round:0,serving:false,liberoRole:9}));assert.deepEqual(s,before);
});
test('legacy unverified matches remain scoreable without a confirmation gate',()=>{
 const s=game();delete s.match.libero;delete s.liberoPlan;delete s.liberoChoices;migrateLiberoState(s);scorePoint(s.match,0);setLibero(s.match,2);validateState(s);
});
test('structural validation still rejects corrupt data and accepts any six-round role presets',()=>{
 const s=game();s.liberoChoices=[0,1,2,3,4,5];validateState(s);
 for(const change of [x=>x.liberoPlan=[1,1],x=>x.liberoChoices=[1],x=>x.match.libero.role=9,x=>x.match.libero.rally=-1,x=>x.match.libero.replacedId='bad',x=>x.match.libero.events=[{}]]){const bad=clone(s);change(bad);assert.throws(()=>validateState(bad));}
 const no=game();no.match.lineup[6]=null;assert.deepEqual(eligibleLiberoRoles(no.match),[]);assert.throws(()=>setLibero(no.match,2),/安排自由人/);
});
test('calibration resets old undo snapshots without requiring a checkbox',()=>{
 const s=game();scorePoint(s.match,1);calibrateLibero(s.match,2);assert.equal(s.match.history.length,0);assert.equal(s.match.libero.role,2);validateState(s);
});
