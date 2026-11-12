import {test} from 'node:test';
import assert from 'node:assert/strict';
import {searchWorkdesk,latestSearchFiles,searchSnippet,highlightSearch} from '../src/search.js';

const file={drive_id:'drive',item_id:'file',name:'계획서.pdf',modified_at_source:'2026-11-10T01:00:00Z',changed_at:'2026-11-10T01:00:00Z',folder_path:'보고서'};
const summary={drive_id:'drive',item_id:'file',source_modified_at:'2026-11-10T10:00:00+09:00',status:'ok',summary:'모형 검토의 쟁점과 후속 작업'};
const data={
 tasks:[{id:'task',title:'현장 검토',note:'모형을 확인하고 답변 대기',project:'DX',status:'partial'},
  {id:'archived',title:'모형 검토 완료',status:'done',archived:true,note:'기존 완료 기록'},
  {id:'done',title:'모형 승인',status:'done'}],
 events:[{id:'event',title:'검토 회의',note:'모형을 비교합니다',status:'cancelled',excluded:true,start_at:'2026-11-12T10:00:00+09:00'}],
 files:[file],fileSummaries:[summary],
 messages:[{id:'message',task_id:'task',body:'모형 질문입니다',reply:'답변을 기다립니다',resolution_status:'pending'}],
 links:[{id:'link',label:'모형 안내',description:'참고 자료',url:'https://example.com/guide',removed_at:'2026-11-10T01:00:00Z'}],
 itemVisibility:[{kind:'file',drive_id:'drive',item_id:'file',hidden_at:'2026-11-11T01:00:00Z'},{kind:'agenda',drive_id:'',item_id:'event',hidden_at:'2026-11-11T01:00:00Z'}]
};
test('one word searches saved content across all groups without changing state',()=>{
 const before=structuredClone(data),groups=searchWorkdesk(data,'모형');
 assert.deepEqual(groups.map(group=>group.id),['tasks','events','files','archived','messages','links']);
 assert.equal(groups[0].items.length,2);
 assert.equal(groups[0].items.find(item=>item.id==='task').excerpts[0].label,'메모');
 assert.deepEqual(data,before);
});
test('completed, archived, excluded, hidden and removed results retain visible state labels',()=>{
 const all=searchWorkdesk(data,'모형').flatMap(group=>group.items);
 assert.ok(all.find(item=>item.id==='done').badges.includes('완료'));
 assert.ok(all.find(item=>item.id==='archived').badges.includes('보관됨'));
 assert.deepEqual(all.find(item=>item.id==='event').badges,['취소됨','내 일정에서 제외','목록에서 숨김']);
 assert.ok(all.find(item=>item.kind==='file').badges.includes('목록에서 숨김'));
 assert.ok(all.find(item=>item.kind==='link').badges.includes('삭제한 바로가기'));
});
test('terms are ANDed across fields, case-insensitive and Korean Unicode normalized',()=>{
 assert.equal(searchWorkdesk(data,'dx 모형')[0].items[0].id,'task');
 assert.deepEqual(searchWorkdesk(data,'dx 없는단어'),[]);
 assert.equal(searchWorkdesk(data,'모형'.normalize('NFD')).length,6);
 assert.deepEqual(searchWorkdesk(data,'   '),[]);
});
test('saved source excerpts, conversation replies and link descriptions are searchable',()=>{
 const entries={tasks:[{id:'a',title:'업무',source_refs:[{excerpt:'특별 근거'}]}],messages:[{id:'b',body:'질문',reply:'특별 답변'}],links:[{id:'c',label:'문서',description:'특별 설명',url:'javascript:alert(1)'}]};
 const groups=searchWorkdesk(entries,'특별');
 assert.deepEqual(groups.map(group=>group.id),['tasks','messages','links']);
 assert.equal(groups[2].items[0].url,'');
});
test('old files beyond 7 days or 30 items are searchable once per latest file version',()=>{
 const files=Array.from({length:42},(_,i)=>({...file,item_id:String(i),changed_at:'2020-01-01T00:00:00Z'}));
 files.push({...files[0],name:'새이름.pdf',modified_at_source:'2026-11-11T01:00:00Z'});
 assert.equal(latestSearchFiles(files).length,42);
 assert.equal(latestSearchFiles(files).find(row=>row.item_id==='0').name,'새이름.pdf');
 assert.equal(searchWorkdesk({files},'계획서')[0].items.length,41);
 assert.equal(searchWorkdesk({files},'새이름')[0].items.length,1);
});
test('file identities do not collide across drives or tuple boundaries',()=>{
 assert.equal(latestSearchFiles([{...file,drive_id:'a:b',item_id:'c'},{...file,drive_id:'a',item_id:'b:c'}]).length,2);
});
test('only summaries for the latest metadata version can match content',()=>{
 assert.equal(searchWorkdesk(data,'쟁점')[0].id,'files');
 assert.deepEqual(searchWorkdesk({...data,files:[file,{...file,modified_at_source:'2026-11-11T00:00:00Z'}]},'쟁점'),[]);
 assert.deepEqual(searchWorkdesk({...data,fileSummaries:[{...summary,status:'failed'}]},'쟁점'),[]);
 assert.equal(searchWorkdesk({...data,fileSummaries:[{...summary,status:'partial'}]},'쟁점')[0].items[0].excerpts[0].label,'일부 본문 요약');
});
test('snippets show matches deep in content and highlights escape HTML and literal regex characters',()=>{
 const text='앞부분 '.repeat(80)+'찾는 내용 <script>danger</script>'+' 뒷부분'.repeat(80);
 const snippet=searchSnippet(text,'찾는');
 assert.ok(snippet.startsWith('…'));
 assert.ok(snippet.includes('찾는 내용'));
 assert.ok(snippet.length<=172);
 const rendered=highlightSearch('<img src=x onerror=alert(1)> AX [검토]', 'ax [검토]');
 assert.ok(!rendered.includes('<img'));
 assert.ok(rendered.includes('&lt;img'));
 assert.ok(rendered.includes('<mark>AX</mark>'));
 assert.ok(rendered.includes('<mark>[검토]</mark>'));
});
