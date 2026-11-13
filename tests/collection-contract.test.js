import test from 'node:test';
import assert from 'node:assert/strict';
import {REQUIRED_CHECKS,verifiedCompletion,overdueCollection,collectionDetail} from '../src/collection-contract.js';
import {sourceHealth,collectionSummary} from '../src/source-health.js';
const at='2026-11-11T08:00:00+09:00',now=Date.parse('2026-11-11T10:00:00+09:00');
const report=(source_id='dooray-mail')=>({source_id,status:'ok',run_id:'example',checked_at:at,
 feed_batch_id:'example-feed',verified_at:at,scope:{description:'검증용 범위',limitations:[]},missing:[],
 checks:Object.fromEntries(REQUIRED_CHECKS[source_id].map(k=>[k,{expected:0,checked:0,complete:true}]))});
test('confirmed empty scope counts as completed, without inventing work',()=>assert.equal(verifiedCompletion(report()),true));
test('scope limitations do not make a fully verified supported search incomplete',()=>{
 const r=report('onedrive-files');r.scope.limitations=['검색 지원 형식만 대상'];r.file_batch_id='example-files';delete r.feed_batch_id;
 assert.equal(verifiedCompletion(r),true);
});
test('missing required body, page, or saved feed prevents completion',()=>{
 for(const change of [r=>delete r.checks.content,r=>r.checks.content.complete=false,r=>r.checks.listing.expected=1,r=>delete r.verified_at,r=>r.verified_at='invalid',r=>delete r.feed_batch_id,r=>r.missing.push({target:'본문',reason:'접근 실패'})]){
  const r=report();change(r);assert.equal(verifiedCompletion(r),false);
 }
});
test('unverified scope is never promoted because legacy status says ok',()=>{
 const r=report();delete r.checks.content;
 const mail=sourceHealth([],[],{now,results:[r]}).find(g=>g.id==='dooray-mail');
 assert.equal(mail.status,'partial');assert.equal(mail.label,'수집 미완료');
 assert.equal(mail.records[0].lastSuccess,null);
});
test('verified observation wins a same-time raw partial due only to supported file formats',()=>{
 const r=report('onedrive-files');r.file_batch_id='example-files';
 const g=sourceHealth([],[{status:'partial',checked_at:at}],{now,results:[r]}).find(g=>g.id==='onedrive');
 assert.equal(g.label,'수집 완료');
});
test('newer raw failure still overrides an earlier verified completion',()=>{
 const r=report('onedrive-files');
 const g=sourceHealth([],[{status:'failed',checked_at:'2026-11-11T09:00:00+09:00'}],{now,results:[r]}).find(g=>g.id==='onedrive');
 assert.equal(g.status,'failed');
});
test('a completed morning stays complete before the verified 13:00 schedule',()=>{
 const r={...report(),next_expected_at:'2026-11-11T13:00:00+09:00',schedule_verified_at:at};
 assert.equal(overdueCollection(r,now),false);
 assert.equal(overdueCollection(r,Date.parse('2026-11-11T13:29:00+09:00')),false);
 assert.equal(overdueCollection(r,Date.parse('2026-11-11T13:31:00+09:00')),true);
 const groups=sourceHealth([],[],{now:Date.parse('2026-11-11T13:31:00+09:00'),results:[r]});
 assert.equal(groups[0].label,'갱신 지연');assert.equal(collectionSummary(groups).label,'갱신 지연');
});
test('a holiday/weekend gap does not erase the last result on a 36-hour timer',()=>{
 const r={...report(),checked_at:'2026-11-13T13:00:00+09:00',next_expected_at:'2026-11-16T13:00:00+09:00',schedule_verified_at:at};
 const sunday=Date.parse('2026-11-15T18:00:00+09:00');
 assert.equal(overdueCollection(r,sunday),false);
 assert.equal(sourceHealth([],[],{now:sunday,results:[r]})[0].label,'수집 완료');
});
test('unknown holiday status cannot silently invent a missed scheduled run',()=>{
 assert.equal(overdueCollection({...report(),next_expected_at:'2026-11-11T13:00:00+09:00'},Date.parse('2026-11-11T15:00:00+09:00')),false);
});

test('designated OneDrive scope needs only folder listing and exact metadata',()=>{
 const r=report('onedrive-files');r.file_batch_id='files';delete r.feed_batch_id;
 assert.deepEqual(Object.keys(r.checks),['folder_listing','metadata']);assert.equal(verifiedCompletion(r),true);
 delete r.checks.metadata;assert.equal(verifiedCompletion(r),false);
});
test('scope change never promotes historical partial or failed results',()=>{
 for(const status of ['partial','failed']){const r={...report('onedrive-files'),status};assert.equal(verifiedCompletion(r),false);assert.equal(sourceHealth([],[],{now,results:[r]}).find(g=>g.id==='onedrive').status,status);}
});

for(const source of ['dooray-mail','dooray-favorites']){
 test(`${source} complete body coverage is complete without attachment coverage`,()=>{
 const r=report(source);r.checks.attachments={expected:2,checked:1,complete:false,reason:'첨부 하나 열람 불가'};r.scope.limitations=['별첨.pdf: 열람 불가'];
 assert.equal(verifiedCompletion(r),true);assert.match(collectionDetail(r),/첨부 확인\(수집 완료와 별도\)/);assert.match(collectionDetail(r),/별첨.pdf/);
 assert.equal(sourceHealth([],[],{now,results:[r]}).find(g=>g.id===source).status,'ok');
 });
 test(`${source} does not retroactively promote a partial record`,()=>{
 const r={...report(source),status:'partial'};r.checks.attachments={expected:2,checked:1,complete:false};
 assert.equal(verifiedCompletion(r),false);assert.equal(sourceHealth([],[],{now,results:[r]}).find(g=>g.id===source).status,'partial');
 });
 test(`${source} unread body remains incomplete even with all attachments read`,()=>{
 const r=report(source);r.checks[source==='dooray-mail'?'content':'history'].complete=false;r.checks.attachments={expected:1,checked:1,complete:true};
 assert.equal(verifiedCompletion(r),false);
 });
}
