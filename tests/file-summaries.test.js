import {test} from 'node:test';
import assert from 'node:assert/strict';
import {summaryForFile} from '../src/file-summaries.js';
const file={drive_id:'drive-a',item_id:'item-1',modified_at_source:'2026-11-10T01:00:00Z'};
const row={drive_id:'drive-a',item_id:'item-1',source_modified_at:'2026-11-10T10:00:00+09:00',summary:'Verified content',status:'ok',checked_at:'2026-11-10T01:10:00Z'};
test('file summaries match source identity and equivalent timezone timestamps',()=>{assert.equal(summaryForFile(file,[row]).text,'Verified content');assert.equal(summaryForFile({...file,drive_id:'drive-b'},[row]).status,'pending');});
test('modified files never display the old content as their current summary',()=>{const result=summaryForFile({...file,modified_at_source:'2026-11-10T01:01:00Z'},[row]);assert.equal(result.status,'stale');assert.notEqual(result.text,row.summary);assert.equal(summaryForFile({...file,modified_at_source:null},[row]).status,'stale');});
test('missing, partial, failed and unsupported summaries remain distinct',()=>{assert.equal(summaryForFile(file,[]).status,'pending');assert.equal(summaryForFile(file,[{...row,status:'partial'}]).status,'partial');for(const status of ['failed','unsupported']){const result=summaryForFile(file,[{...row,status,summary:''}]);assert.equal(result.status,status);assert.notEqual(result.text,row.summary);}});
