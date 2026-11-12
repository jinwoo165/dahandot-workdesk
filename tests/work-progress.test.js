import test from 'node:test';
import assert from 'node:assert/strict';
import {workProgress,progressCard} from '../src/work-progress.js';
const t=(id,status,extra={})=>({id,status,...extra});
test('unreviewed candidates are separate; archived tasks excluded',()=>{
 const p=workProgress([t('1','done'),t('2','doing'),t('3','partial'),t('4','review'),t('5','done',{archived:true})]);
 assert.deepEqual([p.done,p.remaining,p.total,p.review,p.percent],[1,2,3,1,33]);
});
test('source changes do not erase completion and duplicate ids count once',()=>{
 const p=workProgress([t('1','done',{pending_review:true}),t('1','done',{pending_review:true})]);
 assert.equal(p.percent,100);assert.equal(p.review,1);assert.equal(p.total,1);
});
test('no confirmed work is not shown as 0% or 100%',()=>{
 assert.equal(workProgress([]).percent,null);assert.equal(workProgress([t('1','review')]).percent,null);
 assert.match(progressCard([]),/확정된 업무 없음/);assert.doesNotMatch(progressCard([]),/NaN/);
});
test('completion, archive and restored state recalculate without mutating records',()=>{
 const tasks=[t('1','todo'),t('2','done')],before=JSON.stringify(tasks);
 assert.equal(workProgress(tasks).percent,50);assert.equal(JSON.stringify(tasks),before);
 assert.equal(workProgress([{...tasks[0],status:'done'},tasks[1]]).percent,100);
 assert.equal(workProgress([{...tasks[0],archived:true},tasks[1]]).remaining,0);
 assert.equal(workProgress(tasks).remaining,1);
});
