import {test} from 'node:test';
import assert from 'node:assert/strict';
import {UserSync} from '../src/user-sync.js';
function setup(){
 const server=new Map(),disk=new Map();let offline=false;
 const client=scope=>new UserSync({scope,storage:{getItem:k=>disk.get(k),setItem:(k,v)=>disk.set(k,v)},read:async()=>structuredClone([...server.values()]),write:async(key,value,revision)=>{
  if(offline)throw Error('offline');const old=server.get(key);
  if(old&&(key.startsWith('read:')||old.revision!==revision))return {ok:key.startsWith('read:')||JSON.stringify(old.value)===JSON.stringify(value),row:structuredClone(old)};
  const row={state_key:key,value:structuredClone(value),revision:(old?.revision||0)+1};server.set(key,row);return {ok:true,row:structuredClone(row)};
 }});
 return {client,server,setOffline:v=>offline=v};
}
test('receipts union across devices and legacy imports never erase reads',async()=>{
 const {client}=setup(),phone=client('phone'),pc=client('pc');
 phone.set('read:one',10);pc.set('read:two',20);await Promise.all([phone.flush(),pc.flush()]);
 await Promise.all([phone.load(),pc.load()]);assert.equal(phone.get('read:two'),20);assert.equal(pc.get('read:one'),10);
 pc.set('read:one',99);await pc.flush();assert.equal(pc.get('read:one'),10);
});
test('draft continues on another device and cleared draft propagates',async()=>{
 const {client}=setup(),a=client('a'),b=client('b');a.set('draft:general',{body:'첫 문장',id:'one'});await a.flush();await b.load();
 assert.equal(b.get('draft:general').body,'첫 문장');b.set('draft:general',{body:'다음 문장',id:'two'});await b.flush();await a.load();assert.equal(a.get('draft:general').body,'다음 문장');
 b.set('draft:general',{body:'',id:'clear'});await b.flush();await a.load();assert.equal(a.get('draft:general').body,'');
});
test('simultaneous edits preserve local text and require explicit resolution',async()=>{
 const {client}=setup(),a=client('a'),b=client('b');a.set('draft:t',{body:'base'});await a.flush();await b.load();
 a.set('draft:t',{body:'phone'});b.set('draft:t',{body:'pc'});await a.flush();await b.flush();
 assert.equal(b.get('draft:t').body,'pc');assert.equal(b.conflicts.get('draft:t').value.body,'phone');
 await b.load();assert.equal(b.get('draft:t').body,'pc');await b.resolve('draft:t',true);await a.load();assert.equal(a.get('draft:t').body,'pc');
});
test('offline pending draft survives reload and syncs after reconnect',async()=>{
 const {client,setOffline}=setup(),a=client('a');setOffline(true);a.set('draft:t',{body:'offline'});await a.flush();assert.ok(a.error);
 const restored=client('a');assert.equal(restored.get('draft:t').body,'offline');setOffline(false);await restored.load();assert.equal(restored.pending.size,0);
 const other=client('b');await other.load();assert.equal(other.get('draft:t').body,'offline');
});
test('keystroke during in-flight write is retained with new base revision',async()=>{
 let release;const sync=new UserSync({scope:'a',read:async()=>[],write:(key,value)=>new Promise(resolve=>{release=()=>resolve({ok:true,row:{state_key:key,value,revision:1}});})});
 sync.set('draft:t',{body:'old'});const running=sync.flush();sync.set('draft:t',{body:'new'});release();await running;
 assert.equal(sync.get('draft:t').body,'new');assert.equal(sync.pending.get('draft:t').revision,1);
});
test('other account never loads a pending draft from this account',()=>{
 const {client}=setup();client('user-a:workspace').set('draft:t',{body:'private'});assert.equal(client('user-b:workspace').get('draft:t'),undefined);
});
