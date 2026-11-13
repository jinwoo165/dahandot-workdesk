import test from 'node:test';
import assert from 'node:assert/strict';
import {currentBriefing} from '../src/model.js';
const task=(id,patch={})=>({id,title:id,status:'review',next_action:'범위 확인',...patch});
test('briefing shows user actions, excludes completed archived and deferred work',()=>{
 const text=currentBriefing([task('완료업무',{status:'done'}),task('보관업무',{archived:true}),task('다음주',{next_review_on:'2026-11-16'}),task('확인후보'),task('부분업무',{status:'partial',remaining_action:'답변 확인',next_action:'전달 완료'})],[],'2026-11-13');
 assert(!/완료업무|보관업무|다음주|전달 완료/.test(text));
 assert.match(text,/남은 일 · 부분업무 — 답변 확인/);
 assert.match(text,/확인할 일 · 확인후보/);
 assert.match(text,/기한 미확정 · 담당·범위 확인 필요/);
});
test('briefing distinguishes due date from review date and respects event exclusions',()=>{
 const event=(id,patch={})=>({id,title:id,status:'confirmed',start_at:'2026-11-13T09:00:00+09:00',end_at:'2026-11-13T10:00:00+09:00',...patch});
 const text=currentBriefing([task('오늘마감',{due_date:'2026-11-13'}),task('오늘확인',{next_review_on:'2026-11-13'})],[event('취소일정',{status:'cancelled'}),event('제외일정',{excluded:true}),event('참석미정',{status:'tentative'})],'2026-11-13');
 assert.match(text,/마감 2026-11-13/);assert.match(text,/확인일 2026-11-13/);
 assert(!/취소일정|제외일정/.test(text));assert.match(text,/일정 확인 필요/);
});
test('empty briefing never substitutes processing logs',()=>{
 assert.equal(currentBriefing([],[],'2026-11-13'),'오늘 확인된 할 일과 오늘~모레 중요한 일정이 없습니다.');
});
