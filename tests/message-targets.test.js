import test from 'node:test';
import assert from 'node:assert/strict';
import {messageTargets,messagesForTarget} from '../src/conversations.js';
test('free notes link to each verified task or event through stored changes, without guessed titles',()=>{
 const m={changes:[{kind:'new_task',id:'a'},{kind:'task',id:'a'},{kind:'event',id:'e'},{kind:'task',id:'missing'}]};
 assert.deepEqual(messageTargets(m,[{id:'a',title:'업무'}],[{id:'e',title:'회의'}]),[{kind:'task',id:'a',title:'업무'},{kind:'event',id:'e',title:'회의'}]);
 assert.equal(messagesForTarget([m],{task_id:'a'}).length,1);
});
test('unlinked notes remain records, and explicit task links survive an empty change list',()=>{
 assert.deepEqual(messageTargets({body:'처리 완료'},[{id:'a',title:'업무'}]),[]);
 assert.deepEqual(messageTargets({task_id:'a',changes:[]},[{id:'a',title:'업무'}]),[{kind:'task',id:'a',title:'업무'}]);
});
