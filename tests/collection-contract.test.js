import test from 'node:test';
import assert from 'node:assert/strict';
import {REQUIRED_CHECKS,verifiedCompletion,overdueCollection} from '../src/collection-contract.js';
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
test('missing required body, attachment, page, or saved feed prevents completion',()=>{
 for(const change of [r=>delete r.checks.attachments,r=>r.checks.content.complete=false,r=>r.checks.listing.expected=1,r=>delete r.verified_at,r=>r.verified_at='invalid',r=>delete r.feed_batch_id,r=>r.missing.push({target:'본문',reason:'접근 실패'})]){
  const r=report();change(r);assert.equal(verifiedCompletion(r),false);
 }
});
test('unverified scope is never promoted because legacy status says ok',()=>{
 const r=report();delete r.checks.attachments;
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
