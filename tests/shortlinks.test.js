import test from 'node:test';
import assert from 'node:assert/strict';
import {shortenLink,expandLink,shortCode} from '../shortlinks.js';
import {createState,clone} from '../core.js';
import {makeShareLink,parseShareLink,templateSnapshot} from '../sharing.js';
const BASE='https://xavieryx.github.io/Volleyball-tactics/';
test('short URL request preserves full encoded fragment and can be pasted to import',async()=>{
 const state=createState();state.liberoChoices[0]=null;const full=await makeShareLink(state,BASE);const short='https://da.gd/Ab123';let calls=0;
 const fetcher=async(url,options)=>{calls++;assert.equal(options.credentials,'omit');const u=new URL(url);if(u.pathname==='/s'){assert.equal(u.searchParams.get('url'),full);return {ok:true,text:async()=>short};}assert.equal(u.pathname,'/coshorten/Ab123');return {ok:true,text:async()=>full};};
 assert.equal(await shortenLink(full,{fetcher}),short);const received=await parseShareLink(short,{fetcher});assert.deepEqual(received.liberoPlan,[1,5]);assert.equal(received.liberoChoices[0],null);assert.deepEqual(received.formations,state.formations);assert.equal(calls,2);
});
test('lookup only contacts the approved short-link host; invalid service data is rejected',async()=>{
 for(const value of ['https://da.gd.evil.test/abc','http://da.gd/abc','https://da.gd/abc?x=1','https://da.gd/a/b'])assert.equal(shortCode(value),null);
 const full=await makeShareLink(createState(),BASE);assert.equal(await expandLink(full,{fetcher:()=>{throw Error('should not fetch');}}),full);
 await assert.rejects(()=>shortenLink(full,{fetcher:async()=>({ok:true,text:async()=>'javascript:alert(1)'})}));
 await assert.rejects(()=>expandLink('https://da.gd/abc',{fetcher:async()=>({ok:true,text:async()=>'https://evil.test/'})}));
 await assert.rejects(()=>shortenLink(full,{fetcher:async()=>({ok:false})}));
});
test('share includes Libero presets but excludes live replacement history',async()=>{
 const {startMatch}=await import('../core.js');const s=createState();startMatch(s,{lineup:s.lineup,score:[0,0],round:0,serving:false,teams:['A','B']});
 const snap=templateSnapshot(s,'match');assert.equal(snap.match,null);assert.equal(snap.libero,undefined);assert.deepEqual(snap.liberoPlan,[1,5]);assert.deepEqual(snap.liberoChoices,s.liberoChoices);
 const bad=clone(s);bad.liberoPlan=[2];bad.liberoChoices=[2,2,2,2,2,2];assert.deepEqual(templateSnapshot(bad).liberoChoices,[2,2,2,2,2,2]);
});
