import test from 'node:test';
import assert from 'node:assert/strict';
import {linkedText,sourceReferencesHTML,taskDetailContent} from '../src/task-details.js';

test('본문 주소는 쿼리와 줄바꿈을 보존해 새 탭 링크로 표시한다',()=>{
 const html=linkedText('검토 https://example.com/report?a=1&b=2\n다음 https://example.org/안내');
 assert.match(html,/href="https:\/\/example.com\/report\?a=1&amp;b=2"/);
 assert.equal((html.match(/target="_blank" rel="noopener noreferrer"/g)||[]).length,2);
 assert.match(html,/\n다음 /);
});

test('주소 바깥 문장부호를 제외하고 주소 안의 괄호는 보존한다',()=>{
 const html=linkedText('(https://example.com/file_(final)). https://example.org/보고서，');
 assert.match(html,/href="https:\/\/example.com\/file_\(final\)"/);
 assert.match(html,/<\/a>\)\. /);
 assert.match(html,/<\/a>，$/);
});

test('마크다운 링크는 표시 이름과 실제 주소로 나누며 HTML은 실행하지 않는다',()=>{
 const html=linkedText('[보고서 <b>](https://example.com/report_(final)) 다음');
 assert.equal(html,'<a href="https://example.com/report_(final)" target="_blank" rel="noopener noreferrer">보고서 &lt;b&gt;</a> 다음');
 assert.equal(linkedText('<img src=x onerror="alert(1)">'),'&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
});

test('실행 스킴·자격정보·잘못된 주소는 클릭 가능한 링크로 만들지 않는다',()=>{
 for(const value of ['javascript:alert(1)','data:text/html,hello','https://user:password@example.com/file','https://','file:///report'])assert.doesNotMatch(linkedText(value),/<a /);
 const html=sourceReferencesHTML([{label:'원문 <script>',url:'javascript:alert(1)',excerpt:'본문 https://example.com'}]);
 assert.match(html,/직접 링크 미확인/);assert.doesNotMatch(html,/<script>|href="javascript:/);
 assert.equal((html.match(/<a /g)||[]).length,1);
});

test('업무 상세는 메모·행동·근거 전문을 접지 않고 보존하며 상태를 수정하지 않는다',()=>{
 const task={id:'example',title:'가상 업무',status:'done',archived:true,project:'예시',owner_label:'',next_action:'검토 https://example.com/review',remaining_action:'기록 확인',note:'처리 기록\n'.repeat(80),source_data:{source_state:'completed'},source_refs:[{label:'원문',url:'https://example.com/source',excerpt:'본문 https://example.com/body',occurred_at:'2026-11-11T13:00:00+09:00'}]};
 const before=structuredClone(task),html=taskDetailContent(task);
 for(const text of ['완료','보관됨','원문에서 완료됨','다음 행동','남은 일','내 메모',task.note,'근거 · 원문'])assert.ok(html.includes(text));
 assert.doesNotMatch(html,/<details|<textarea|<form/);
 assert.equal((html.match(/<a /g)||[]).length,3);
 assert.deepEqual(task,before);
});

test('원문 링크가 없는 업무는 주소를 추정하지 않는다',()=>{
 assert.match(sourceReferencesHTML([]),/등록된 원문 링크가 없습니다/);
 assert.doesNotMatch(taskDetailContent({title:'수동 업무',status:'todo',source_refs:[]}),/<a /);
});
