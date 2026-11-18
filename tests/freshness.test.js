import test from 'node:test';
import assert from 'node:assert/strict';
import {freshKey,isFresh,orderedLinks} from '../src/freshness.js';
test('pins precede NEW links; new entries precede old; collection checks do not reorder links',()=>{
 const rows=[{id:'old',sort_order:1,source_checked_at:'2030-01-01'},{id:'new',added_at:'2026-11-19T00:00Z',sort_order:3},{id:'pin',added_at:'2026-11-10T00:00Z',pinned_at:'2026-11-11T00:00Z',sort_order:0}];
 assert.deepEqual(orderedLinks(rows).map(x=>x.id),['pin','new','old']);assert.equal(rows[0].id,'old');
});
test('NEW clears only for opened revision and expires after seven days',()=>{
 const now=Date.parse('2026-11-19T00:00Z'),stamp='2026-11-18T00:00Z',key=freshKey('file','drive:item',stamp);
 assert.equal(isFresh(stamp,key,{},now),true);assert.equal(isFresh(stamp,key,{[key]:now},now),false);
 assert.equal(isFresh(null,key,{},now),false);assert.equal(isFresh('2026-10-01',key,{},now),false);
 assert.equal(isFresh('2026-11-19T00:00Z',freshKey('file','drive:item','2026-11-19T00:00Z'),{[key]:now},now),true);
});
