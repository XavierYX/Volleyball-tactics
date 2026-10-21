import test from 'node:test';
import assert from 'node:assert/strict';
import {activateLatest,waitForWorker} from '../updates.js';
class Worker extends EventTarget{
 constructor(state){super();this.state=state;this.messages=[];}
 transition(state){this.state=state;this.dispatchEvent(new Event('statechange'));}
 postMessage(message){this.messages.push(message);queueMicrotask(()=>{this.transition('activating');queueMicrotask(()=>this.transition('activated'));});}
}
test('waiting update activates and waits until the whole new worker is active',async()=>{
 const worker=new Worker('installed');assert.equal(await activateLatest({waiting:worker}),true);assert.equal(worker.state,'activated');assert.deepEqual(worker.messages,[{type:'ACTIVATE'}]);
});
test('an installing worker cannot be activated before downloads finish',async()=>{
 const worker=new Worker('installing'),promise=activateLatest({installing:worker});assert.equal(worker.messages.length,0);queueMicrotask(()=>worker.transition('installed'));await promise;assert.equal(worker.state,'activated');assert.equal(worker.messages.length,1);
});
test('failed installation leaves the old worker intact and reports failure',async()=>{
 const old=new Worker('activated'),worker=new Worker('installing'),promise=activateLatest({installing:worker,active:old});queueMicrotask(()=>worker.transition('redundant'));await assert.rejects(promise,/下载失败/);assert.equal(old.state,'activated');assert.equal(old.messages.length,0);assert.equal(worker.messages.length,0);
});
test('no waiting update is a no-op; a stalled install is not reported successful',async()=>{
 assert.equal(await activateLatest({active:new Worker('activated')}),false);await assert.rejects(waitForWorker(new Worker('installing'),['installed'],{timeoutMs:5}),/超时/);
});
