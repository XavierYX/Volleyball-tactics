import test from 'node:test';
import assert from 'node:assert/strict';
import {createState,clone,migrateLineups,createLineup,selectLineup,saveRoster,rosterPlayers,validateState,startMatch,substitute} from '../core.js';
import {templateSnapshot,importTemplate} from '../sharing.js';
const setup=()=>migrateLineups(createState());
const bench={id:'bench',name:'替补',short:'补',position:'主攻'};
const start=s=>startMatch(s,{lineup:s.lineup,score:[0,0],round:0,serving:false,teams:['A','B']});
test('imported lineup owns its complete roster without mixing the original lineup',()=>{
 const s=setup(),first=s.activeLineupId,initial=rosterPlayers(s).map(p=>p.id),incoming=createState();
 incoming.players.forEach(p=>p.name='客队'+p.name);incoming.players.push(bench);
 importTemplate(s,incoming);
 assert.equal(rosterPlayers(s).length,8);assert.ok(rosterPlayers(s).every(p=>p.name.startsWith('客队')||p.name==='替补'));
 assert.equal(templateSnapshot(s).players.length,8);assert.equal(templateSnapshot(s,'lineup:'+first).players.length,7);
 selectLineup(s,first);assert.deepEqual(rosterPlayers(s).map(p=>p.id),initial);validateState(s);
});
test('copy keeps current members; adding and removing a reserve stays local',()=>{
 const s=setup(),first=s.activeLineupId;createLineup(s,'备选');
 saveRoster(s,[...rosterPlayers(s),bench],s.lineup);assert.equal(rosterPlayers(s).length,8);
 const second=s.activeLineupId;selectLineup(s,first);assert.equal(rosterPlayers(s).length,7);
 saveRoster(s,[...rosterPlayers(s),bench],s.lineup);saveRoster(s,rosterPlayers(s).filter(p=>p.id!=='bench'),s.lineup);
 assert.equal(rosterPlayers(s).length,7);selectLineup(s,second);assert.equal(rosterPlayers(s).length,8);validateState(s);
});
test('foreign reserves cannot enter a match; current lineup can add its own reserve',()=>{
 const s=setup(),first=s.activeLineupId;createLineup(s,'另队');saveRoster(s,[...rosterPlayers(s),bench],s.lineup);
 selectLineup(s,first);start(s);const before=clone(s);assert.throws(()=>substitute(s,0,'bench'),/当前阵容/);assert.deepEqual(s,before);
 saveRoster(s,[...rosterPlayers(s),bench],s.lineup);substitute(s,0,'bench');validateState(s);
 assert.equal(templateSnapshot(s,'match').players.length,8);
});
test('removal cannot erase starters or live substitution history, and failures are atomic',()=>{
 const s=setup();saveRoster(s,[...rosterPlayers(s),bench],s.lineup);start(s);substitute(s,0,'bench');const before=clone(s);
 assert.throws(()=>saveRoster(s,rosterPlayers(s).filter(p=>p.id!==s.match.originalLineup[0]),s.lineup));assert.deepEqual(s,before);
 const bad=clone(s);bad.match.rosterIds=bad.match.rosterIds.filter(pid=>pid!=='bench');assert.throws(()=>validateState(bad),/本场队员/);
});
test('legacy mixed lists exclude other lineups starters while preserving reserves and game data',()=>{
 const s=setup(),a=s.activeLineupId,incoming=createState();incoming.players.forEach(p=>p.name='另一队'+p.name);incoming.players.push(bench);importTemplate(s,incoming);
 start(s);s.match.score=[12,10];const before=clone(s.match),allPlayers=clone(s.players);
 delete s.rosterIds;for(const set of s.lineupSets)delete set.rosterIds;delete s.match.rosterIds;
 migrateLineups(s);assert.equal(rosterPlayers(s).length,8);assert.deepEqual(s.match.score,before.score);assert.deepEqual(s.players,allPlayers);validateState(s);
 s.match=null;selectLineup(s,a);assert.ok(rosterPlayers(s).every(p=>!p.name.startsWith('另一队')));assert.ok(rosterPlayers(s).some(p=>p.name==='替补'));
});
