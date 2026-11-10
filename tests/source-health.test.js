import test from 'node:test';
import assert from 'node:assert/strict';
import {SOURCE_GROUPS,sourceHealth,collectionSummary} from '../src/source-health.js';
const now=Date.parse('2026-11-10T04:30:00Z'),checked='2026-11-10T04:00:00Z';
const source=(id,status='ok',checked_at=checked)=>({id,status,checked_at,detail:'조회 범위 확인'});
const run=(sources,generated_at=checked)=>({sources,generated_at});
const complete=()=>SOURCE_GROUPS.flatMap(g=>g.sources.map(id=>source(id)));
const group=(rows,id,files=[],opts={})=>sourceHealth(rows,files,{now,...opts}).find(g=>g.id===id);
test('all sources successful is green even if there are no new tasks',()=>{
 const groups=sourceHealth([run(complete())],[],{now});
 assert.equal(collectionSummary(groups).status,'ok');
 assert.ok(groups.every(g=>g.status==='ok'));
});
test('latest failed result is red and retains the earlier success time',()=>{
 const old='2026-11-09T04:00:00Z';
 const rows=[run(complete().map(s=>({...s,checked_at:old})),old),run(complete().map(s=>s.id==='dooray-mail'?{...s,status:'failed'}:s))];
 const mail=group(rows,'dooray-mail');
 assert.equal(mail.status,'failed');assert.equal(mail.records[0].lastSuccess,old);
 assert.equal(collectionSummary(sourceHealth(rows,[],{now})).label,'일부 실패');
});
test('latest missing or not_checked source never inherits an older green result',()=>{
 const rows=[run([source('dooray-mail','not_checked')]),run(complete(),'2026-11-09T04:00:00Z')];
 assert.equal(group(rows,'dooray-mail').status,'not_checked');
 assert.equal(group(rows,'dooray-calendar').status,'not_checked');
 assert.equal(group(rows,'dooray-calendar').records[0].checkedAt,null);
});
test('both Google calendars are required and one failure is not hidden',()=>{
 assert.equal(group([run([source('google-primary')])],'google').status,'partial');
 const google=group([run([source('google-primary'),source('google-secondary','failed')])],'google');
 assert.equal(google.status,'failed');assert.equal(google.label,'일부 실패');
});
test('stale, invalid and future success times cannot show green',()=>{
 for(const date of ['2026-11-08T04:00:00Z','bad date','2026-11-10T06:00:00Z',null]){
  const mail=group([run([source('dooray-mail','ok',date)])],'dooray-mail');
  assert.equal(mail.status,'not_checked');
  if(date==='bad date'||date===null)assert.equal(mail.records[0].checkedAt,null);
 }
});
test('newer OneDrive file result takes precedence including failures',()=>{
 const rows=[run(complete())],files=[{status:'failed',checked_at:'2026-11-10T04:10:00Z',detail:'조회 실패'}];
 assert.equal(group(rows,'onedrive',files).status,'failed');
 assert.equal(group(rows,'onedrive',files).records[0].lastSuccess,checked);
 assert.equal(group(rows,'onedrive',[{status:'failed',checked_at:'2026-11-09T00:00:00Z'}]).status,'ok');
 assert.equal(group(rows,'onedrive',[],{fileError:'목록 연결 실패'}).status,'failed');
});
test('partial and missing results are explicit; board connection errors override green',()=>{
 const groups=sourceHealth([run(complete())],[],{now});
 assert.equal(collectionSummary(groups,{online:false}).label,'확인 불가');
 assert.equal(collectionSummary(groups,{error:'fetch failed'}).status,'failed');
 assert.equal(collectionSummary(sourceHealth([],[],{now})).status,'not_checked');
 const partial=sourceHealth([run(complete().map(s=>s.id==='dooray-calendar'?{...s,status:'partial'}:s))],[],{now});
 assert.equal(collectionSummary(partial).status,'partial');
});
