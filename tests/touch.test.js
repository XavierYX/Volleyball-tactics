import test from 'node:test';
import assert from 'node:assert/strict';
import {preventScoreboardDoubleTap} from '../touch.js';
function fixture(){
 const listeners=new Map();let time=0,clicks=0;
 const button={disabled:false,click:()=>clicks++},target={closest:()=>button};
 preventScoreboardDoubleTap({addEventListener:(type,fn)=>listeners.set(type,fn)},{now:()=>time});
 const p=(x=20,y=20)=>({clientX:x,clientY:y});
 const event=(type,{touches=[],changedTouches=[],where=target}={})=>{const e={touches,changedTouches,target:where,cancelable:true,prevented:false,preventDefault(){this.prevented=true;}};listeners.get(type)(e);return e;};
 const tap=(elapsed=80,where=target)=>{time+=elapsed;event('touchstart',{touches:[p()],where});const e=event('touchend',{changedTouches:[p()],where});if(!e.prevented&&!button.disabled&&where===target)button.click();return e;};
 return {tap,event,p,button,clicks:()=>clicks};
}
test('rapid scoring taps all count while the second touch prevents double-tap zoom',()=>{
 const f=fixture();assert.equal(f.tap().prevented,false);assert.equal(f.tap().prevented,true);assert.equal(f.tap().prevented,true);assert.equal(f.clicks(),3);
});
test('disabled minus and scoreboard whitespace never score but suppress a second tap',()=>{
 const f=fixture();f.button.disabled=true;f.tap();assert.equal(f.tap().prevented,true);assert.equal(f.clicks(),0);
 const blank={closest:()=>null};f.tap(400,blank);assert.equal(f.tap(80,blank).prevented,true);assert.equal(f.clicks(),0);
});
test('slow taps and drag or pinch gestures retain their browser defaults',()=>{
 const f=fixture();f.tap();assert.equal(f.tap(400).prevented,false);
 f.event('touchstart',{touches:[f.p()]});f.event('touchmove',{touches:[f.p(60)]});assert.equal(f.event('touchend',{changedTouches:[f.p(60)]}).prevented,false);
 f.event('touchstart',{touches:[f.p()]});f.event('touchstart',{touches:[f.p(),f.p(80)]});assert.equal(f.event('touchend',{touches:[f.p()],changedTouches:[f.p(80)]}).prevented,false);assert.equal(f.event('touchend',{changedTouches:[f.p()]}).prevented,false);
});
