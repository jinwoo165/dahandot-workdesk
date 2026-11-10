import test from 'node:test';
import assert from 'node:assert/strict';
import {historyForMonth} from '../src/history.js';
test('monthly history uses Korean month boundaries and keeps a stable newest-first order',()=>{
 const items=[{id:1,occurred_at:'2026-10-31T14:59:59Z'},{id:2,occurred_at:'2026-10-31T15:00:00Z'},{id:3,occurred_at:'2026-11-30T14:59:59Z'},{id:4,occurred_at:'2026-11-30T15:00:00Z'},{id:5,occurred_at:'invalid'},{id:10,occurred_at:'2026-10-31T15:00:00Z'}];
 assert.deepEqual(historyForMonth(items,'2026-11').map(h=>h.id),[3,10,2]);
 assert.deepEqual(items.map(h=>h.id),[1,2,3,4,5,10]);
 assert.deepEqual(historyForMonth(items,'2026-13'),[]);
 assert.deepEqual(historyForMonth(items,'2026-09'),[]);
});
