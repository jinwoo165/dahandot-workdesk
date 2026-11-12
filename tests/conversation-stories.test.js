import test from 'node:test';
import assert from 'node:assert/strict';
import {conversationSummary,mergeSavedMessages,persistConversation,verifySavedMessage} from '../src/conversations.js';
import {conversationBadge,conversationPreview,conversationThread} from '../src/conversation-ui.js';

const message={id:'message-1',workspace_id:'workspace-1',task_id:'task-1',event_id:null,body:'검토한 내용을 전달했습니다.',created_at:'2026-11-12T01:00:00Z',resolution_status:'pending',changes:[]};
const applied={...message,resolution_status:'applied',resolved_at:'2026-11-12T01:01:00Z',reply:'남은 답변 확인으로 정리했습니다.'};

test('saved story count survives processing and includes only correctly linked user stories',()=>{
 const messages=[applied,{...message,id:'message-2',task_id:null,changes:[{kind:'task',id:'task-1'}]},
  {...message,id:'message-3',task_id:null,event_id:'event-1'},
  {...message,id:'unrelated',task_id:'task-2',body:'task-1 같은 제목의 업무 언급'},
  {...message,id:'empty-draft',body:''}];
 const before=structuredClone(messages),summary=conversationSummary(messages,{task_id:'task-1'});
 assert.equal(summary.count,2);assert.equal(summary.pending,1);
 assert.equal(conversationSummary(messages,{event_id:'event-1'}).count,1);
 assert.equal(conversationSummary(messages,{}).count,0);
 assert.deepEqual(messages,before);
});
test('a multi-action conversation counts once per task and new tasks retain their starting story',()=>{
 const multi={...applied,task_id:null,changes:[{kind:'task',id:'task-1'},{kind:'task',id:'task-1'},{kind:'new_task',id:'task-2'},{kind:'event',id:'event-1'}]};
 for(const target of [{task_id:'task-1'},{task_id:'task-2'},{event_id:'event-1'}])assert.equal(conversationSummary([multi,multi],target).count,1);
});
test('refresh races cannot erase a verified send or downgrade a resolved reply',()=>{
 const old={...message,id:'older',created_at:'2026-11-11T01:00:00Z'};
 assert.equal(mergeSavedMessages([old,message],[old]).length,2);
 assert.equal(mergeSavedMessages([applied],[message])[0].reply,applied.reply);
 assert.equal(mergeSavedMessages([message],[applied])[0].resolution_status,'applied');
 assert.equal(mergeSavedMessages([applied],[applied]).length,1);
});
test('badges distinguish empty and saved histories and show count after a reply is applied',()=>{
 const badge=conversationBadge([applied],{task_id:'task-1'});
 assert.match(badge,/has-stories/);assert.match(badge,/이야기 1/);assert.doesNotMatch(badge,/다한닷 확인 대기/);
 assert.match(conversationBadge([],{task_id:'task-1'}),/no-stories/);
 assert.match(conversationBadge([],{task_id:'task-1'}),/이야기 없음/);
});
test('history previews distinguish current conversations from historical snapshots and escape user text',()=>{
 const unsafe={...applied,body:'<img src=x onerror=alert(1)> '+'가'.repeat(240)};
 const preview=conversationPreview([unsafe],{task_id:'task-1'},{historical:true});
 assert.match(preview,/이 업무의 현재 대화 이력/);assert.match(preview,/이력 보고 이어 쓰기/);
 assert.match(preview,/&lt;img/);assert.doesNotMatch(preview,/<img/);assert.match(preview,/…/);
 const thread=conversationThread([unsafe]);
 assert.match(thread,/나눈 이야기/);assert.match(thread,/반영 완료/);assert.match(thread,/남은 답변 확인/);
 assert.ok(thread.includes('가'.repeat(240)));assert.doesNotMatch(thread,/<img/);
});
test('thread is chronological and full saved text replaces the empty prompt',()=>{
 const later={...message,id:'message-2',body:'두 번째 이야기',created_at:'2026-11-13T01:00:00Z'};
 const html=conversationThread([later,applied]);
 assert.ok(html.indexOf(message.body)<html.indexOf(later.body));
 assert.doesNotMatch(html,/어디까지 진행하셨나요/);
 assert.match(conversationThread([]),/어디까지 진행하셨나요/);
});

function database({rpcError=null,readError=null,receipt=message,saved=message}={}){
 const calls=[],query={select(){return this;},eq(key,value){calls.push(['filter',key,value]);return this;},async single(){calls.push(['read']);return {data:saved,error:readError};}};
 return {calls,async rpc(name,args){calls.push(['write',name,args]);return {data:receipt,error:rpcError};},from(table){calls.push(['table',table]);return query;}};
}
test('a successful send verifies the same workspace, target, body and ID by reading the stored row',async()=>{
 const db=database({receipt:[message]});const saved=await persistConversation(db,message);
 assert.equal(saved.id,message.id);assert.deepEqual(db.calls.filter(call=>call[0]==='filter'),[['filter','workspace_id','workspace-1'],['filter','id','message-1']]);
 assert.equal(db.calls[0][0],'write');assert.equal(db.calls.at(-1)[0],'read');
});
test('failed or unverified saves reject and retries use the same message ID',async()=>{
 for(const fixture of [{rpcError:Error('offline')},{readError:Error('offline')},{receipt:null},{saved:{...message,body:'다른 내용'}},{saved:{...message,event_id:'other'}}])
  await assert.rejects(persistConversation(database(fixture),message));
 const db=database();await persistConversation(db,message);await persistConversation(db,message);
 assert.deepEqual(db.calls.filter(call=>call[0]==='write').map(call=>call[2].p_id),[message.id,message.id]);
 assert.throws(()=>verifySavedMessage({...message,workspace_id:'other'},message));
});
