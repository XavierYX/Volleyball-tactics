import test from 'node:test';
import assert from 'node:assert/strict';
import {createState,clone,migrateLineups,syncLineup,selectLineup,createLineup,renameLineup,deleteLineup,saveRoster,validateState,startMatch,endMatch,substitute} from '../core.js';
import {makeShareLink,parseShareLink,importTemplate} from '../sharing.js';
const setup=()=>migrateLineups(createState());
const start=s=>startMatch(s,{lineup:s.lineup,score:[0,0],round:0,serving:false,teams:['A','B']});
test('legacy state and ongoing match migrate without losing coordinates, roles or scores',()=>{
 const s=createState();s.formations[3][6]=[44,81];start(s);const old=clone(s);migrateLineups(s);assert.deepEqual(s.formations,old.formations);assert.deepEqual(s.match.score,old.match.score);assert.equal(s.match.lineupId,s.activeLineupId);assert.equal(s.lineupSets.length,1);validateState(s);
});
test('lineups share player IDs but preserve independent roles, coordinates and Libero presets',()=>{
 const s=setup(),first=s.activeLineupId,original=clone(s);createLineup(s,'反轮');[s.lineup[1],s.lineup[4]]=[s.lineup[4],s.lineup[1]];s.formations[2][1]=[65,85];s.liberoPlan=[1];s.liberoChoices=[null,1,1,1,null,null];const second=s.activeLineupId,changed=clone(s);
 selectLineup(s,first);assert.deepEqual(s.lineup,original.lineup);assert.deepEqual(s.formations,original.formations);assert.deepEqual(s.liberoPlan,[1,5]);selectLineup(s,second);assert.deepEqual(s.formations,changed.formations);assert.deepEqual(s.lineup,changed.lineup);assert.deepEqual(s.liberoPlan,[1]);assert.deepEqual(s.players,original.players);
 syncLineup(s);const restored=validateState(JSON.parse(JSON.stringify(s)));assert.equal(restored.activeLineupId,second);assert.deepEqual(restored.liberoChoices,changed.liberoChoices);
});
test('creating regular lineup resets coordinates while retaining shared roster and role selection',()=>{
 const s=setup();s.formations[0][1]=[40,40];const original=s.activeLineupId;createLineup(s,'训练',{regular:true});assert.deepEqual(s.formations[0][1],[79,74]);selectLineup(s,original);assert.deepEqual(s.formations[0][1],[40,40]);
});
test('renaming and removing a lineup keep players and other saved lineups intact',()=>{
 const s=setup(),first=s.activeLineupId;createLineup(s,'备用');renameLineup(s,'周六');const before=clone(s.players);assert.throws(()=>renameLineup(s,'阵容 1'),/同名/);deleteLineup(s,s.activeLineupId);assert.equal(s.activeLineupId,first);assert.deepEqual(s.players,before);assert.throws(()=>deleteLineup(s,first),/至少/);
});
test('a match locks lineup management and writes its formation only to its source lineup',()=>{
 const s=setup(),first=s.activeLineupId;createLineup(s,'比赛');const second=s.activeLineupId,firstData=clone(s.lineupSets[0]);start(s);
 for(const action of [()=>selectLineup(s,first),()=>createLineup(s,'新'),()=>renameLineup(s,'改名'),()=>deleteLineup(s,first)])assert.throws(action,/先退出/);
 s.players.push({id:'bench',name:'替补',short:'补',position:'主攻'});substitute(s,1,'bench');s.match.formations[0][1]=[71,86];endMatch(s,true);assert.equal(s.activeLineupId,second);assert.deepEqual(s.formations[0][1],[71,86]);assert.notEqual(s.lineup[1],'bench');assert.deepEqual(s.lineupSets[0],firstData);selectLineup(s,first);assert.deepEqual(s.formations,firstData.formations);
});
test('discarding live changes keeps saved lineup; common player edits affect every lineup',()=>{
 const s=setup(),first=s.activeLineupId;createLineup(s,'第二套');const before=clone(s.formations);start(s);s.match.formations[0][1]=[12,12];endMatch(s,false);assert.deepEqual(s.formations,before);
 const players=clone(s.players);players[0].name='小明';saveRoster(s,players,s.lineup);selectLineup(s,first);assert.equal(s.players.find(p=>p.id===s.lineup[0]).name,'小明');
 const required=s.lineup[0];assert.throws(()=>saveRoster(s,s.players.filter(p=>p.id!==required),s.lineup));
});
test('share a chosen inactive lineup and import it without replacing existing lineups or duplicating players',async()=>{
 const s=setup(),first=s.activeLineupId;s.formations[1][1]=[64,80];syncLineup(s);createLineup(s,'另外一套',{regular:true});
 const incoming=await parseShareLink(await makeShareLink(s,'https://example.com/','lineup:'+first));assert.equal(incoming.lineupName,'阵容 1');assert.deepEqual(incoming.formations[1][1],[64,80]);
 const before=clone(s.lineupSets);importTemplate(s,incoming);assert.equal(s.players.length,7);assert.equal(s.lineupSets.length,3);assert.deepEqual(s.lineupSets.slice(0,2),before);assert.deepEqual(s.formations,incoming.formations);validateState(s);
});
test('invalid inactive references and duplicate names are rejected; failed import is atomic',()=>{
 const s=setup();createLineup(s,'备用');for(const mutate of [x=>x.lineupSets[0].lineup[0]='missing',x=>x.lineupSets[0].name=x.lineupSets[1].name,x=>x.activeLineupId='missing']){const bad=clone(s);mutate(bad);assert.throws(()=>validateState(bad));}
 const before=clone(s);assert.throws(()=>importTemplate(s,{...s,lineup:[]}));assert.deepEqual(s,before);assert.throws(()=>createLineup(s,'备用'));assert.equal(s.lineupSets.length,2);
});

test('the lineup limit fails without changing the selected working copy',()=>{const s=setup();for(let i=2;i<=30;i++)createLineup(s,'阵容 '+i);const before=clone(s);assert.throws(()=>createLineup(s,'超限'),/30/);assert.deepEqual(s,before);});
