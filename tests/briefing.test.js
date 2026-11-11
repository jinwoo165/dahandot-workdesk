import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeBriefingLine,briefingItems,briefingListHTML} from '../src/briefing.js';

const hidden={line_key:'example',line_text:'제출 자료 확인',hidden_at:'2026-11-12T08:00:00+09:00'};
test('hidden text remains hidden across feeds and formatting changes',()=>{
 const result=briefingItems('• 제출  자료 확인\n새 요청 확인\n새 요청 확인',[hidden]);
 assert.deepEqual(result.visible,['새 요청 확인']);
 assert.equal(result.hidden.length,1);
 assert.equal(normalizeBriefingLine('-3일 변경'),'−3일 변경'.replace('−','-'));
});
test('changed deadlines and actions are shown without reviving hidden exact copies',()=>{
 assert.deepEqual(briefingItems('제출 자료 확인\n제출 자료 내일까지 확인',[hidden]).visible,['제출 자료 내일까지 확인']);
});
test('restore follows the current summary and never inserts stale text',()=>{
 const restored={...hidden,hidden_at:null};
 assert.deepEqual(briefingItems('제출 자료 확인',[restored]).visible,['제출 자료 확인']);
 assert.deepEqual(briefingItems('새 요청 확인',[restored]),{visible:['새 요청 확인'],hidden:[]});
});
test('hiding every line preserves a recoverable empty state',()=>{
 const items=briefingItems('제출 자료 확인',[hidden]);
 assert.match(briefingListHTML(items),/모두 숨겼습니다/);
 assert.match(briefingListHTML(items,{showHidden:true}),/data-briefing-restore="example"/);
});
test('summary text is escaped in content, buttons, and accessibility labels',()=>{
 const html=briefingListHTML({visible:['<img src=x onerror="alert(1)">'],hidden:[]},{disabled:true});
 assert.doesNotMatch(html,/<img/);
 assert.match(html,/&lt;img/);
 assert.match(html,/&quot;alert\(1\)&quot;/);
 assert.match(html,/disabled/);
});
