import test from 'node:test';
import assert from 'node:assert/strict';
import {createState,startMatch,clone,validateState,scorePoint} from '../core.js';
import {templateSnapshot,makeShareLink,parseShareLink,importTemplate,MAX_LINK_LENGTH} from '../sharing.js';
const BASE='https://paizhen-volleyball.youx-us.chatgpt.site/';
const normalize=t=>({players:t.players.map(({name,short,position})=>({name,short,position})),lineup:t.lineup.map(pid=>pid===null?null:t.players.findIndex(p=>p.id===pid)),formations:t.formations});
function rawLink(data){return BASE+'#pz=j1.'+Buffer.from(JSON.stringify(data)).toString('base64url');}
test('compressed Chinese roster and all six edited formations roundtrip without original IDs',async()=>{
 const s=createState();s.players[0].name='王小明';s.players[0].short='明';s.formations[4][2]=[61.583921,18.274];
 const link=await makeShareLink(s,BASE+'?old=1#old');assert.match(link,/#pz=z1\./);assert.ok(link.length<2000);assert.equal(new URL(link).search,'');
 const received=await parseShareLink(link);assert.deepEqual(normalize(received),normalize(s));assert.notEqual(received.players[0].id,s.players[0].id);assert.equal(received.match,null);validateState(received);
});
test('uncompressed fallback and no-libero lineup are supported',async()=>{const s=createState();s.lineup[6]=null;const link=await makeShareLink(s,BASE,'default',{compress:false});assert.match(link,/#pz=j1\./);assert.deepEqual(normalize(await parseShareLink(' '+link+'\n')),normalize(s));});
test('default and live formation choices exclude scores, service, history and substitution records',async()=>{
 const s=createState();startMatch(s,{lineup:s.lineup,score:[12,9],round:4,serving:true,teams:['A','B']});scorePoint(s.match,0);s.match.formations[0][1]=[71,83];
 s.players.push({id:'bench',name:'替补',short:'替',position:'主攻'});s.match.lineup[1]='bench';
 const defaults=await parseShareLink(await makeShareLink(s,BASE));const live=await parseShareLink(await makeShareLink(s,BASE,'match'));
 assert.notDeepEqual(defaults.formations,live.formations);assert.equal(live.players.find(p=>p.id===live.lineup[1]).name,'替补');
 for(const snapshot of [templateSnapshot(s),templateSnapshot(s,'match'),live]){assert.equal(snapshot.match,null);assert.equal('score'in snapshot,false);assert.equal('history'in snapshot,false);assert.equal('substitutions'in snapshot,false);}
});
test('import requires a deliberate call, preserves a running game, and rejects malformed data atomically',async()=>{
 const sender=createState(),receiver=createState();sender.players[0].name='新二传';const before=clone(receiver),incoming=await parseShareLink(await makeShareLink(sender,BASE));assert.deepEqual(receiver,before);
 startMatch(receiver,{lineup:receiver.lineup,score:[1,2],round:3,serving:true,teams:['A','B']});const running=clone(receiver);assert.throws(()=>importTemplate(receiver,incoming),/先退出/);assert.deepEqual(receiver,running);
 receiver.match=null;const noMatch=clone(receiver);assert.throws(()=>importTemplate(receiver,{...incoming,lineup:[] }));assert.deepEqual(receiver,noMatch);
 importTemplate(receiver,incoming);assert.deepEqual(normalize(receiver),normalize(incoming));assert.equal(receiver.match,null);
});
test('incomplete links, unsupported versions and malformed roster/coordinates are rejected',async()=>{
 const s=createState(),plain=await makeShareLink(s,BASE,'default',{compress:false}),data=JSON.parse(Buffer.from(new URL(plain).hash.split('.')[1],'base64url').toString());
 for(const value of ['',BASE,'javascript:alert(1)',BASE+'#pz=x9.eA',BASE+'#pz=j1.%',BASE+'#pz=z1.abc',BASE+'#pz=j1.e30',BASE+'#pz=j1.'+'x'.repeat(MAX_LINK_LENGTH)])await assert.rejects(()=>parseShareLink(value));
 for(const change of [d=>d.v=99,d=>d.l[0]=999,d=>d.l[1]=d.l[0],d=>d.p[0][1]='两个',d=>d.p[0][2]=99,d=>d.f[0][0]=[999,1],d=>d.f=[]]){const bad=clone(data);change(bad);await assert.rejects(()=>parseShareLink(rawLink(bad)));}
});
test('decompression limit rejects a small compressed payload that expands beyond the safe bound',async()=>{
 const raw=new TextEncoder().encode(JSON.stringify({v:1,padding:'x'.repeat(1000000)}));const zipped=new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer());
 await assert.rejects(()=>parseShareLink(BASE+'#pz=z1.'+Buffer.from(zipped).toString('base64url')),/过大/);
});
test('large normal squad roundtrips and the link is a snapshot, not a live subscription',async()=>{
 const s=createState();for(let i=0;i<33;i++)s.players.push({id:'bench-'+i,name:'队员'+i,short:'员',position:'其他'});
 const link=await makeShareLink(s,BASE);assert.ok(link.length<MAX_LINK_LENGTH);s.players[0].name='后来改名';s.formations[0][1]=[20,20];
 const received=await parseShareLink(link);assert.equal(received.players[0].name,'二传');assert.equal(received.players.length,40);assert.notDeepEqual(received.formations,s.formations);
});
