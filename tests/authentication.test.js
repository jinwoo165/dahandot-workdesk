import test from 'node:test';
import assert from 'node:assert/strict';
import {authenticationMessage,passwordValidation,passwordActions,authDestination,recoveryFromURL,passwordFormHTML} from '../src/authentication.js';

const run=p=>p;
test('password login uses the existing email identity and never creates an account',async()=>{
 let payload;
 const session={user:{id:'test-user'}};
 const actions=passwordActions({signInWithPassword:async args=>{payload=args;return {data:{session}};}},'https://example.invalid/workdesk/',run);
 assert.equal((await actions.signIn(' person@example.invalid ','test-only-password')).session,session);
 assert.deepEqual(payload,{email:'person@example.invalid',password:'test-only-password'});
});

test('setup and fallback use the configured return URL, and magic links cannot sign up',async()=>{
 const calls=[];
 const auth={resetPasswordForEmail:async(...args)=>{calls.push(args);return {data:{}};},signInWithOtp:async args=>{calls.push(args);return {data:{}};}};
 const url='https://example.invalid/workdesk/',actions=passwordActions(auth,url,run);
 await actions.recovery(' person@example.invalid ');await actions.magicLink(' person@example.invalid ');
 assert.deepEqual(calls,[['person@example.invalid',{redirectTo:url}],{email:'person@example.invalid',options:{emailRedirectTo:url,shouldCreateUser:false}}]);
});

test('a short or mismatched password never reaches the account update endpoint',async()=>{
 let calls=0;const actions=passwordActions({updateUser:async()=>{calls++;return {data:{}};}},'',run);
 await assert.rejects(actions.save('short','short'),/12자/);
 await assert.rejects(actions.save('test-only-password','different-password'),/서로 다릅니다/);
 assert.equal(calls,0);assert.equal(passwordValidation('test-only-password','test-only-password'),'');
});

test('password setting only updates the authenticated user and reports server rejection',async()=>{
 const calls=[],auth={updateUser:async args=>{calls.push(args);return {error:{code:'weak_password'}};}};
 await assert.rejects(passwordActions(auth,'',run).save('test-only-password','test-only-password'),e=>e.code==='weak_password');
 assert.deepEqual(calls,[{password:'test-only-password'}]);
});

test('recovery takes precedence over initial session and user-updated events',()=>{
 const session={user:{id:'test-user'}};
 assert.equal(recoveryFromURL('#access_token=example&type=recovery'),true);
 assert.equal(recoveryFromURL('#type=signup'),false);
 for(const event of ['INITIAL_SESSION','SIGNED_IN','USER_UPDATED'])assert.equal(authDestination(event,session,true),'password');
 assert.equal(authDestination('PASSWORD_RECOVERY',session),'password');
 assert.equal(authDestination('SIGNED_IN',session),'board');
 assert.equal(authDestination('SIGNED_OUT',session,true),'guest');
 assert.equal(authDestination('INITIAL_SESSION',null),'none');
});

test('connection failure, wrong password, expired session and mail limits are distinct',()=>{
 assert.match(authenticationMessage({code:'invalid_credentials'}),/이메일 또는 비밀번호/);
 assert.match(authenticationMessage(new Error('Failed to fetch')),/틀렸다는 뜻은 아닙니다/);
 assert.match(authenticationMessage(new Error('연결 응답 시간이 초과되었습니다.'),'session'),/이전 로그인 확인/);
 assert.match(authenticationMessage({code:'refresh_token_not_found'}),/만료/);
 assert.match(authenticationMessage({status:429} ),/요청이 많아/);
 assert.match(authenticationMessage({code:'otp_expired'}),/가장 최근/);
});

test('password setup fields are masked, do not embed credentials, and escape the email',()=>{
 const html=passwordFormHTML('<script>@example.invalid');
 assert.equal((html.match(/type="password"/g)||[]).length,2);
 assert.equal((html.match(/autocomplete="new-password"/g)||[]).length,2);
 assert.doesNotMatch(html,/<script>/);assert.match(html,/&lt;script&gt;/);
});
