import test from 'node:test';
import assert from 'node:assert/strict';
import {IntroTimeline,BRIEFING_DURATION,PROGRESS_DURATION,typedLengths,progressFrame,ringFrame} from '../src/board-motion.js';

test('all briefing lines finish within five seconds, not five seconds per line',()=>{
 const timer=new IntroTimeline(BRIEFING_DURATION);
 assert.equal(timer.sample('briefing',100),0);
 assert.deepEqual(typedLengths([20,30,50],timer.sample('briefing',2350)),[20,30,0]);
 assert.deepEqual(typedLengths([20,30,50],timer.sample('briefing',4600)),[20,30,50]);
});
test('automatic rerenders and category returns never restart the introduction',()=>{
 const timer=new IntroTimeline(PROGRESS_DURATION);
 assert.equal(timer.sample('values',100),0);
 assert.equal(timer.sample('values',2600),.25);
 assert.equal(timer.sample('values',5100),.5);
 assert.equal(timer.sample('values',10100),1);
 assert.equal(timer.sample('values',30100),1);
});
test('changed live totals immediately display their verified values',()=>{
 const timer=new IntroTimeline(PROGRESS_DURATION);
 timer.sample('old totals',0);
 assert.equal(timer.sample('new totals',1000),1);
 assert.equal(timer.sample('old totals',2000),1);
});
test('all numbers and the arc reach the exact final values together',()=>{
 const timer=new IntroTimeline(PROGRESS_DURATION);timer.sample('counts',0);
 const half=timer.sample('counts',5000);
 assert.deepEqual([80,16,64,4].map(n=>progressFrame(n,half)),[40,8,32,2]);
 assert.equal(ringFrame(20,half).dasharray,'10 100');
 const end=timer.sample('counts',10000);
 assert.deepEqual([80,16,64,4].map(n=>progressFrame(n,end)),[80,16,64,4]);
 assert.equal(ringFrame(20,end).dasharray,'20 100');
});
test('zero tasks, large totals and reduced motion finish without invalid values',()=>{
 assert.equal(progressFrame(0,.5),0);
 assert.equal(ringFrame(0,.5).visible,false);
 assert.equal(progressFrame(1703,1),1703);
 const timer=new IntroTimeline(PROGRESS_DURATION);
 assert.equal(timer.sample('counts',0,{animate:false}),1);
 assert.equal(timer.sample('counts',100),1);
});

test('small counts do not reach the target before the ten-second finish',()=>{
 assert.equal(progressFrame(1,.99),0);
 assert.equal(progressFrame(10,.99),9);
 assert.equal(progressFrame(1,1),1);
});
test('a fresh page or explicit reset starts a new introduction',()=>{
 const first=new IntroTimeline(PROGRESS_DURATION);
 first.sample('counts',0);assert.equal(first.sample('counts',10000),1);
 const reloaded=new IntroTimeline(PROGRESS_DURATION);
 assert.equal(reloaded.sample('counts',25000),0);
 assert.equal(reloaded.sample('counts',35000),1);
});
