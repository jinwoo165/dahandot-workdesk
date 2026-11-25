import test from 'node:test';
import assert from 'node:assert/strict';
import {messageEvidence,messageOutcome,taskContinuity,changeValue} from '../src/work-context.js';
import {conversationEvidenceHTML} from '../src/work-evidence-ui.js';
import {conversationTurn} from '../src/conversation-ui.js';
import {taskDetailContent} from '../src/task-details.js';

const task={id:'task-1',title:'가상 현장 적용 검토',status:'doing',next_action:'전체 적용안 검토',remaining_action:'입력 부담 확인',note:'현장 의견을 먼저 확인',next_review_on:'2026-11-30',archived:false,source_refs:[{label:'가상 검토 자료',url:'https://example.com/review'}],revision:4};
const message={id:'message-1',workspace_id:'workspace-1',task_id:task.id,body:'한 곳을 먼저 확인하고 다음 회의에서 다시 판단해요.',created_at:'2026-11-25T04:00:00Z',resolved_at:'2026-11-25T04:01:00Z',resolution_status:'applied',reply:'현장 부담을 확인하는 안으로 변경했습니다.',changes:[{kind:'task',id:task.id,before:task,after:{...task,next_action:'한 곳의 입력 부담 확인',note:'한 곳을 우선 확인. 전체 적용은 결과를 보고 결정',revision:5}}]};

test('stored changes show only changed business values and retain the full decision note',()=>{
 const snapshot=structuredClone(message),evidence=messageEvidence(message);
 assert.deepEqual(evidence.changed[0].fields.map(field=>field.key),['next_action','note']);
 assert.equal(evidence.changed[0].fields[0].before,'전체 적용안 검토');
 assert.equal(evidence.changed[0].fields[0].after,'한 곳의 입력 부담 확인');
 assert.equal(messageOutcome(message).label,'반영 완료');
 assert.deepEqual(message,snapshot);
 const html=conversationEvidenceHTML(message);
 assert.match(html,/반영 전/);assert.match(html,/반영 후/);assert.match(html,/전체 적용은 결과를 보고 결정/);
 assert.doesNotMatch(html,/revision|workspace-1/);
});

test('an answer or proposal without saved changes is never labeled applied',()=>{
 const answered={...message,reply:'두 가지 대안을 제안합니다.',changes:[]};
 assert.equal(messageOutcome(answered).label,'답변 기록');
 assert.doesNotMatch(conversationTurn(answered),/반영 완료/);
 assert.match(conversationEvidenceHTML(answered),/저장된 업무·일정 변경은 없습니다/);
 const metadataOnly={...message,changes:[{kind:'task',id:task.id,before:task,after:{...task,revision:99,updated_at:'2026-11-25T05:00:00Z'}}]};
 assert.equal(messageEvidence(metadataOnly).hasChanges,false);
 assert.equal(messageOutcome(metadataOnly).label,'답변 기록');
});

test('pending, clarification and missing evidence cannot present a proposal as applied',()=>{
 const pending={...message,resolution_status:'pending',reply:'',resolved_at:null,changes:[]};
 assert.equal(messageOutcome(pending).label,'확인 대기');
 assert.match(conversationTurn(pending),/다음 갱신 때/);
 assert.doesNotMatch(conversationTurn(pending),/반영 완료|work-change-field/);
 const clarification={...message,resolution_status:'clarification'};
 assert.equal(messageOutcome(clarification).label,'확인 필요');
 assert.doesNotMatch(conversationEvidenceHTML(clarification),/work-change-field/);
 const missing={...message,changes:[{kind:'task',id:task.id}]};
 assert.equal(messageOutcome(missing).label,'반영 기록 확인 필요');
 assert.doesNotMatch(conversationEvidenceHTML(missing),/1건 변경|반영 완료/);
});

test('snapshots from another target or workspace cannot be presented as this message change evidence',()=>{
 for(const after of [{...task,id:'task-other',note:'다른 업무 값'},{...task,workspace_id:'workspace-other',note:'다른 공간 값'}]){
  const data={...message,changes:[{kind:'task',id:task.id,before:task,after}]};
  assert.equal(messageOutcome(data).label,'반영 기록 확인 필요');
  assert.doesNotMatch(conversationEvidenceHTML(data),/다른 업무 값|다른 공간 값|반영 완료/);
 }
});

test('completed and archived values remain explicit without claiming deletion',()=>{
 const done={...task,status:'done',remaining_action:null,next_review_on:null,archived:true};
 const html=conversationEvidenceHTML({...message,changes:[{kind:'task',id:task.id,before:task,after:done}]});
 for(const value of ['완료','보관됨','미지정','남은 일','다음 확인'])assert.ok(html.includes(value));
 assert.doesNotMatch(html,/삭제 완료/);
 assert.equal(task.status,'doing');
});

test('new tasks retain their null-before registration evidence',()=>{
 const data={...message,changes:[{kind:'new_task',id:'conversation:new',before:null,after:{...task,id:'conversation:new'}}]};
 assert.match(conversationEvidenceHTML(data),/새 업무 등록/);
 assert.match(conversationEvidenceHTML(data),/등록 전/);
 assert.equal(messageEvidence(data).hasChanges,true);
});

test('calendar evidence compares effective personal overrides without claiming source calendar edits',()=>{
 const source={id:'event-1',title:'가상 검토 회의',start_at:'2026-11-30T04:00:00Z',end_at:'2026-11-30T05:00:00Z'};
 const before={source,override:{excluded:false,start_at:'2026-12-01T04:00:00Z',end_at:'2026-12-01T05:00:00Z',reason:'일정 조정',revision:1}};
 const after={event_id:source.id,excluded:true,start_at:before.override.start_at,end_at:before.override.end_at,reason:'본인 참석 없음',revision:2};
 const data={...message,changes:[{kind:'event',id:source.id,before,after}]};
 const evidence=messageEvidence(data).changed[0];
 assert.deepEqual(evidence.fields.map(field=>field.key),['excluded','reason']);
 assert.equal(evidence.fields[0].before,'표시');assert.equal(evidence.fields[0].after,'내 티밍에서 제외');
 const html=conversationEvidenceHTML(data);assert.match(html,/티밍 안의 일정 표시·메모/);assert.doesNotMatch(html,/원본 일정 변경|삭제 완료/);
 const reset={...data,changes:[{kind:'event',id:source.id,before,after:{...after,excluded:false,start_at:null,end_at:null,reason:'원래 일정으로 표시'}}]};
 assert.ok(messageEvidence(reset).changed[0].fields.some(field=>field.key==='start_at'&&field.before!==field.after));
});

test('linked documents are labeled as task links and unsafe links stay inert',()=>{
 const refs=[{label:'<script>alert(1)</script>',url:'javascript:alert(1)',excerpt:'자료 <img src=x onerror=alert(1)>'},task.source_refs[0]];
 const html=conversationEvidenceHTML({...message,changes:[{...message.changes[0],before:{...task,source_refs:refs},after:{...message.changes[0].after,source_refs:refs}}]});
 assert.match(html,/이 업무에 연결된 자료 2건/);
 assert.match(html,/이번 답변이 실제로 참조한 근거는 위 답변/);
 assert.doesNotMatch(html,/<script>|<img|href="javascript:/);
 assert.match(html,/&lt;script&gt;/);
 assert.equal((html.match(/href="https:\/\/example.com\/review"/g)||[]).length,1);
});

test('long values, malformed dates and hostile titles remain readable text',()=>{
 const long='이유와 조건\n'.repeat(300),after={...message.changes[0].after,title:'<img src=x onerror=alert(1)>',note:long,next_review_on:'not-a-date'};
 const html=conversationEvidenceHTML({...message,created_at:'bad-time',changes:[{kind:'task',id:task.id,before:task,after}]});
 assert.ok(html.includes(long));assert.match(html,/시각 미확인/);assert.doesNotMatch(html,/<img/);
 assert.equal(changeValue('next_review_on','not-a-date'),'not-a-date');
});

test('current context joins only stable task IDs and shows pending alongside the last reply',()=>{
 const latest={...message,id:'message-2',created_at:'2026-11-25T05:00:00Z',resolution_status:'pending',reply:'',resolved_at:null,body:'일단 보류하고 팀 의견을 더 확인해요.',changes:[]};
 const other={...message,id:'other',task_id:'task-2',created_at:'2026-11-25T06:00:00Z',body:task.title+'에 관한 같은 제목',reply:'다른 업무 답변',changes:[]};
 const related={...message,id:'free-note',task_id:null,created_at:'2026-11-24T05:00:00Z'};
 const context=taskContinuity(task,[other,latest,message,related]);
 assert.equal(context.latest.id,latest.id);assert.equal(context.latestReply.id,message.id);assert.equal(context.pending,1);
 const html=taskDetailContent(task,'',{messages:[other,latest,message,related]});
 for(const text of ['현재 맥락','확인 대기 1건','일단 보류','현장 부담','전체 대화와 판단 이유'])assert.ok(html.includes(text));
 assert.doesNotMatch(html,/다른 업무 답변|최신 결정|업무 목표/);
 assert.equal(task.next_review_on,'2026-11-30');
});

test('no context is fabricated for a task with no linked messages or saved next action',()=>{
 const html=taskDetailContent({id:'empty',title:'가상 새 업무',status:'review',source_refs:[]},'',{messages:[message]});
 assert.match(html,/아직 남은 일·다음 행동·메모가 기록되지 않았습니다/);
 assert.match(html,/연결된 대화가 아직 없습니다/);
 assert.doesNotMatch(html,/전체 적용안|현장 부담|data-story-task="task-1"/);
});
