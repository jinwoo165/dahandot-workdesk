import test from 'node:test';
import assert from 'node:assert/strict';
import {connectionFetch,createSessionCheck,withDeadline,ConnectionTimeoutError} from '../src/connection.js';

const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const clock=()=>{let callback;return {setTimeout(fn){callback=fn;return 1;},clearTimeout(){callback=undefined;},tick(){callback?.();}};};

test('a pending session exposes checking and slow states, then accepts a late login',async()=>{
 const request=deferred(),states=[],timers=clock();let calls=0;
 const check=createSessionCheck(()=>{calls++;return request.promise;},state=>states.push(state),{timers});
 const pending=check.check();assert.equal(states[0].status,'checking');
 assert.equal(check.check(),pending);
 timers.tick();assert.equal(states.at(-1).status,'slow');
 const session={user:{id:'example-user'}};request.resolve({data:{session},error:null});
 await pending;assert.equal(calls,1);assert.equal(states.at(-1).session,session);
});

test('a newer auth event cannot be replaced by an older failed session check',async()=>{
 const request=deferred(),states=[],timers=clock();
 const check=createSessionCheck(()=>request.promise,state=>states.push(state),{timers});
 const pending=check.check();const session={user:{id:'example-user'}};check.accept(session);
 request.reject(new Error('Old network failure'));await pending;timers.tick();
 assert.deepEqual(states.map(s=>s.status),['checking','session']);
});

test('failed checks can be retried, and signed-out events cancel stale session results',async()=>{
 const states=[],timers=clock(),late=deferred();let calls=0;
 const check=createSessionCheck(()=>++calls===1?Promise.resolve({error:new Error('offline')}):late.promise,state=>states.push(state),{timers});
 await check.check();assert.equal(states.at(-1).status,'error');
 const retry=check.check();check.accept(null);
 late.resolve({data:{session:{user:{id:'example-user'}}}});await retry;
 assert.equal(calls,2);assert.equal(states.at(-1).status,'guest');
});

test('a query waiting inside the SDK has a bounded caller wait',async()=>{
 const request=deferred();await assert.rejects(withDeadline(request.promise,5),ConnectionTimeoutError);
 request.resolve('late response');assert.equal(await withDeadline(Promise.resolve('ready'),50),'ready');
});

test('auth fetch times out and aborts the pending request without retrying it',async()=>{
 let calls=0,signal;
 const fetcher=connectionFetch((input,init)=>{calls++;signal=init.signal;return new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}));},5);
 await assert.rejects(fetcher('https://example.invalid/auth/v1/token',{method:'POST'}),ConnectionTimeoutError);
 assert.equal(calls,1);assert.equal(signal.aborted,true);
});

test('caller cancellation remains intact and non-auth writes are unchanged',async()=>{
 const caller=new AbortController();caller.abort(new Error('Caller cancelled'));
 const fetcher=connectionFetch(async(input,init)=>{assert.equal(init.signal.aborted,true);throw init.signal.reason;});
 await assert.rejects(fetcher('https://example.invalid/rest/v1/items',{signal:caller.signal}),/Caller cancelled/);
 const init={method:'POST',body:'example'};
 const write=connectionFetch(async(input,options)=>{assert.equal(options,init);return 'saved';});
 assert.equal(await write('https://example.invalid/rest/v1/rpc/save',init),'saved');
});
