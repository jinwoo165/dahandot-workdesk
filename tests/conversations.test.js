import test from 'node:test';
import assert from 'node:assert/strict';
import {validateMessage,messagesForTarget,mergeCalendarOverrides} from '../src/conversations.js';
import {eventOnDay} from '../src/model.js';

test('대화는 원문을 보존하고 빈 입력만 거절한다',()=>{
 assert.equal(validateMessage('  아직 완료 안 됐어. 금요일에 확인.  '),'아직 완료 안 됐어. 금요일에 확인.');
 assert.throws(()=>validateMessage('   '));assert.throws(()=>validateMessage('가'.repeat(12001)));
});
test('자유 대화에서 생긴 후속 업무에도 원래 대화가 보인다',()=>{
 const messages=[{id:'a',task_id:'task-1'},{id:'b',changes:[{kind:'new_task',id:'task-1'}]},{id:'c',event_id:'event-1'}];
 assert.deepEqual(messagesForTarget(messages,{task_id:'task-1'}).map(m=>m.id),['a','b']);
 assert.deepEqual(messagesForTarget(messages,{event_id:'event-1'}).map(m=>m.id),['c']);
 assert.equal(messagesForTarget(messages).length,3);
});
test('개인 일정 제외는 원본을 바꾸지 않고 재수집에도 유지된다',()=>{
 const source={id:'e',title:'회의',start_at:'2026-11-13T13:00:00+09:00',end_at:'2026-11-13T14:00:00+09:00',status:'confirmed'};
 const overrides=[{event_id:'e',excluded:true,reason:'본인 참석 없음'}];
 assert.equal(eventOnDay(mergeCalendarOverrides([source],overrides)[0],'2026-11-13'),false);
 assert.equal(source.status,'confirmed');assert.equal(source.excluded,undefined);
 assert.equal(mergeCalendarOverrides([{...source,title:'변경 회의'}],overrides)[0].excluded,true);
});
test('내 일정 조정은 날짜 이동에 반영되며 원본 취소를 되돌리지 않는다',()=>{
 const source={id:'e',start_at:'2026-11-13T13:00:00+09:00',end_at:'2026-11-13T14:00:00+09:00',status:'confirmed'};
 const overrides=[{event_id:'e',excluded:false,start_at:'2026-11-16T13:00:00+09:00',end_at:'2026-11-16T14:00:00+09:00'}];
 const event=mergeCalendarOverrides([source],overrides)[0];
 assert.equal(eventOnDay(event,'2026-11-13'),false);assert.equal(eventOnDay(event,'2026-11-16'),true);
 assert.equal(eventOnDay(mergeCalendarOverrides([{...source,status:'cancelled'}],overrides)[0],'2026-11-16'),false);
});
