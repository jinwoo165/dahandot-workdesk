import test from 'node:test';
import assert from 'node:assert/strict';
import {IntroTimeline,PROGRESS_DURATION,progressDuration,progressFrame,ringFrame} from '../src/board-motion.js';

test('completion determines duration: 100% five seconds, 50% 2.5 seconds, 10% half a second',()=>{
 assert.equal(PROGRESS_DURATION,5000);
 for(const [percent,duration] of [[0,0],[10,500],[25,1250],[50,2500],[100,5000]]){
  assert.equal(progressDuration(percent),duration);
  const timer=new IntroTimeline(progressDuration(percent));
  assert.equal(timer.sample('counts',100),duration?0:1);
  assert.equal(timer.sample('counts',100+duration),1);
 }
 assert.ok(Math.abs(progressDuration(100/3)-5000/3)<1e-9);
});
test('different completion targets travel at the same arc speed',()=>{
 for(const percent of [10,50,100]){
  const timer=new IntroTimeline(progressDuration(percent));timer.sample('counts',0);
  const fraction=timer.sample('counts',250);
  assert.equal(ringFrame(percent,fraction).dasharray,'5 100');
 }
});
test('automatic rerenders and category returns never restart the introduction',()=>{
 const timer=new IntroTimeline(progressDuration(50));
 assert.equal(timer.sample('values',100),0);
 assert.equal(timer.sample('values',725),.25);
 assert.equal(timer.sample('values',1350),.5);
 assert.equal(timer.sample('values',2600),1);
 assert.equal(timer.sample('values',30100),1);
});
test('changed live totals immediately display their verified values',()=>{
 const timer=new IntroTimeline(progressDuration(100));
 timer.sample('old totals',0);
 assert.equal(timer.sample('new totals',1000),1);
 assert.equal(timer.sample('old totals',2000),1);
});
test('all counts and the arc finish together at the proportional deadline',()=>{
 const timer=new IntroTimeline(progressDuration(20));timer.sample('counts',0);
 const half=timer.sample('counts',500);
 assert.deepEqual([80,16,64,4].map(n=>progressFrame(n,half)),[40,8,32,2]);
 assert.equal(ringFrame(20,half).dasharray,'10 100');
 const end=timer.sample('counts',1000);
 assert.deepEqual([80,16,64,4].map(n=>progressFrame(n,end)),[80,16,64,4]);
 assert.equal(ringFrame(20,end).dasharray,'20 100');
 assert.equal(progressFrame(1,.99),0);
 assert.equal(progressFrame(1,1),1);
});
test('zero completion and reduced motion immediately show real counts without NaN',()=>{
 const timer=new IntroTimeline(progressDuration(0));
 assert.equal(timer.sample('counts',0),1);
 assert.equal(progressFrame(1703,timer.sample('counts',0)),1703);
 assert.equal(ringFrame(0,1).visible,false);
 assert.equal(progressDuration(-1),0);
 assert.equal(progressDuration(Infinity),0);
 assert.equal(progressDuration(500),5000);
 const reduced=new IntroTimeline(progressDuration(100));
 assert.equal(reduced.sample('counts',0,{animate:false}),1);
 assert.equal(reduced.sample('counts',100),1);
});
test('a fresh page or explicit reset starts a new introduction',()=>{
 const first=new IntroTimeline(progressDuration(10));
 first.sample('counts',0);assert.equal(first.sample('counts',500),1);
 const reloaded=new IntroTimeline(progressDuration(10));
 assert.equal(reloaded.sample('counts',25000),0);
 assert.equal(reloaded.sample('counts',25500),1);
});
