import {escapeHTML as esc} from './model.js';
import {withDeadline,AUTH_REQUEST_TIMEOUT_MS} from './connection.js';

export const PASSWORD_MIN_LENGTH=12;
export const authDeadline=operation=>withDeadline(operation,AUTH_REQUEST_TIMEOUT_MS);

export function authenticationMessage(error,operation='login'){
 const code=error?.code||'',message=error?.message||String(error||'');
 if(code==='invalid_credentials'||/invalid login credentials/i.test(message))return '이메일 또는 비밀번호를 확인하세요. 비밀번호를 아직 만들지 않았다면 ‘처음 비밀번호 설정’을 선택하세요.';
 if(code==='email_not_confirmed')return '이메일 인증이 필요합니다. 이메일 링크로 로그인한 뒤 비밀번호를 설정하세요.';
 if(/rate_limit|over_email_send|over_request/.test(code)||error?.status===429)return '요청이 많아 잠시 제한되었습니다. 조금 뒤 다시 시도하세요. 이미 요청한 메일이 있다면 받은 편지함을 확인하세요.';
 if(code==='weak_password')return '더 긴 비밀번호를 사용하세요. 영문·숫자·기호를 함께 넣고 다른 곳에서 쓰지 않는 비밀번호를 권장합니다.';
 if(code==='same_password')return '현재 비밀번호와 같습니다. 다른 비밀번호를 입력하세요.';
 if(/session_not_found|refresh_token_not_found|refresh_token_already_used/.test(code))return '이전 로그인 상태가 만료되었습니다. 이메일과 비밀번호로 다시 로그인하세요.';
 if(/otp_expired|otp_disabled/.test(code))return '인증 링크나 번호가 만료되었습니다. 새 메일을 요청한 뒤 가장 최근 링크를 열어주세요.';
 if(/reauthentication|current_password|reauthenticate/.test(code+' '+message))return '본인 확인이 한 번 더 필요합니다. 로그인 화면의 ‘비밀번호 찾기’에서 인증 메일을 받아 다시 설정하세요.';
 if(/Failed to fetch|fetch failed|NetworkError|Timeout|timed out|연결 응답 시간|AbortError/i.test(message))return operation==='session'?'이전 로그인 확인이 지연되었습니다. 연결을 다시 확인하거나 이메일과 비밀번호로 로그인하세요.':'서버 연결이 지연되어 결과를 확인하지 못했습니다. 인터넷 연결을 확인한 뒤 다시 시도하세요. 비밀번호가 틀렸다는 뜻은 아닙니다.';
 return operation==='save'?'비밀번호를 저장하지 못했습니다. 입력 조건을 확인한 뒤 다시 시도하세요.':operation==='recovery'?'인증 메일을 요청하지 못했습니다. 잠시 후 다시 시도하세요.':'로그인을 확인하지 못했습니다. 등록된 이메일과 비밀번호를 확인하세요.';
}

export function passwordValidation(password,confirmation){
 if(password!==confirmation)return '두 비밀번호가 서로 다릅니다.';
 if(password.length<PASSWORD_MIN_LENGTH)return `비밀번호는 ${PASSWORD_MIN_LENGTH}자 이상으로 입력하세요.`;
 return '';
}

// Auth is injected so failure/recovery paths can be tested without a real account.
// Passwords only exist in the form/request: no app storage, logging or business tables.
export function passwordActions(auth,redirectTo,run=authDeadline){
 const checked=async operation=>{const result=await run(operation);if(result.error)throw result.error;return result.data;};
 return {
  signIn:(email,password)=>checked(auth.signInWithPassword({email:email.trim(),password})),
  recovery:email=>checked(auth.resetPasswordForEmail(email.trim(),{redirectTo})),
  magicLink:email=>checked(auth.signInWithOtp({email:email.trim(),options:{emailRedirectTo:redirectTo,shouldCreateUser:false}})),
  verify:(email,token)=>checked(auth.verifyOtp({email:email.trim(),token:token.trim(),type:'email'})),
  save:(password,confirmation)=>{
   const problem=passwordValidation(password,confirmation);
   if(problem)return Promise.reject(new Error(problem));
   return checked(auth.updateUser({password}));
  }
 };
}

export function recoveryFromURL(hash){return new URLSearchParams(hash.replace(/^#/, '')).get('type')==='recovery';}
export function authDestination(event,session,recoveryPending=false){
 if(event==='SIGNED_OUT')return 'guest';
 if(!session?.user)return 'none';
 return event==='PASSWORD_RECOVERY'||recoveryPending?'password':'board';
}

export function loginShell(content){return `<div class="login-wrap"><section class="login-story"><div class="brand"><span class="mark">d.</span><span>다한닷<small>PERSONAL WORKDESK</small></span></div><div class="eyebrow">YOUR WORK, IN ONE PLACE</div><h1>내 업무의 흐름을<br>한곳에 남기다.</h1><p>메일과 대화 속 해야 할 일부터<br>오늘의 진척, 작은 메모, 완료의 기록까지.<br>어디서든 같은 업무보드로 이어집니다.</p><div class="story-line">업무 관리 &nbsp; / &nbsp; 일정과 이력 &nbsp; / &nbsp; 다한닷 연동</div></section><section class="login-panel"><div class="login-card">${content}</div></section></div>`;}

export function mountLogin(root,{actions,configured=true,onSession,onRetry,message=''}){
 let mode='password',busy=false,email='',ownedFeedback=false;
 const find=s=>root.querySelector(s);
 const feedback=(text='',retry=false,force=false)=>{
  if(busy||ownedFeedback&&!force)return;
  const node=find('#loginMessage');if(node)node.textContent=text;
  const button=find('#retryConnection');if(button)button.hidden=!retry;
 };
 const switchMode=next=>{if(busy)return;email=find('#email')?.value||email;mode=next;ownedFeedback=false;render();};
 const submit=async(event,kind)=>{
  event.preventDefault();if(!configured||busy)return;
  const form=event.currentTarget;if(!form.reportValidity())return;
  if(kind==='verify'&&!find('#email').reportValidity())return;
  email=find('#email').value.trim();busy=true;ownedFeedback=true;
  root.querySelectorAll('button').forEach(b=>b.disabled=true);
  find('#loginMessage').textContent=kind==='password'?'로그인하고 있습니다…':kind==='verify'?'인증번호를 확인하고 있습니다…':'인증 메일을 요청하고 있습니다…';
  let text='',retry=false;
  try{
   if(kind==='password'||kind==='verify'){
    const data=kind==='password'?await actions.signIn(email,find('#password').value):await actions.verify(email,find('#otp').value);
    if(!data?.session)throw new Error('No session returned');
    const password=find('#password');if(password)password.value='';
    text='로그인을 확인했습니다. 업무보드를 열고 있습니다…';onSession(data.session);
   }else if(kind==='recovery'){
    await actions.recovery(email);text='등록된 계정이면 비밀번호 설정 메일이 발송됩니다. 받은 메일의 링크를 열어 새 비밀번호를 입력하세요. 스팸함도 확인해 주세요.';
   }else{
    await actions.magicLink(email);text='로그인 메일을 요청했습니다. 받은 메일의 링크를 열어주세요. 스팸함도 확인해 주세요.';
   }
  }catch(error){text=authenticationMessage(error,kind==='recovery'?'recovery':'login');retry=true;}
  finally{busy=false;root.querySelectorAll('button').forEach(b=>b.disabled=!configured);feedback(text,retry,true);}
 };
 function render(){
  const recovery=mode==='recovery',magic=mode==='magic';
  root.innerHTML=loginShell(`<h2>${recovery?'비밀번호 설정 · 찾기':'나의 업무보드'}</h2><p>${recovery?'기존에 사용하던 이메일로 인증 메일을 받으세요.<br>인증 후 비밀번호를 직접 설정할 수 있습니다.':magic?'등록된 이메일로 로그인 링크를 받습니다.':'이메일과 비밀번호로 로그인하세요.<br>기존 업무와 기록이 그대로 이어집니다.'}</p><form id="loginForm"><label for="email">이메일 주소</label><input type="email" id="email" name="email" required autocomplete="username" value="${esc(email)}" placeholder="등록된 이메일 주소">${!recovery&&!magic?'<label for="password">비밀번호</label><input type="password" id="password" name="password" required autocomplete="current-password" placeholder="비밀번호">':''}<button class="btn primary" type="submit" ${configured?'':'disabled'}>${recovery?'비밀번호 설정 메일 받기':magic?'로그인 링크 받기':'로그인'} →</button></form><div id="loginMessage" class="login-feedback" role="status" aria-live="polite">${esc(message)}</div><button type="button" id="retryConnection" class="btn login-retry" hidden>연결 다시 확인 ↻</button><div class="login-options">${mode==='password'?'<button type="button" data-mode="recovery">처음 비밀번호 설정 · 비밀번호 찾기</button><button type="button" data-mode="magic">이메일 링크로 로그인</button>':'<button type="button" data-mode="password">← 비밀번호로 로그인</button>'}</div>${magic?'<details class="otp-options"><summary>메일에 인증번호가 표시되는 경우</summary><form id="otpForm"><label for="otp">인증번호</label><input id="otp" required autocomplete="one-time-code" inputmode="numeric" placeholder="인증번호"><button class="btn" type="submit">인증번호로 로그인</button></form></details>':''}<p class="login-note">비밀번호가 없거나 기억나지 않으면 이메일로 설정하세요.<br>PC와 휴대폰에서 같은 계정으로 사용하세요.</p>`);
  find('#loginForm').onsubmit=e=>submit(e,mode);
  if(find('#otpForm'))find('#otpForm').onsubmit=e=>submit(e,'verify');
  find('#retryConnection').onclick=()=>{ownedFeedback=false;onRetry();};
  root.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>switchMode(b.dataset.mode));
 }
 render();return {feedback,showRecovery:()=>switchMode('recovery')};
}

export function passwordFormHTML(email=''){return `<div class="password-form"><h2>비밀번호 설정</h2><p>${email?`${esc(email)}<br>`:''}다음부터 이메일과 비밀번호로 바로 로그인합니다.</p><form id="passwordForm"><input type="hidden" name="username" autocomplete="username" value="${esc(email)}"><label for="newPassword">새 비밀번호</label><input type="password" id="newPassword" name="new-password" autocomplete="new-password" required minlength="${PASSWORD_MIN_LENGTH}" aria-describedby="passwordHint"><small id="passwordHint">${PASSWORD_MIN_LENGTH}자 이상 · 영문·숫자·기호 조합 권장</small><label for="confirmPassword">새 비밀번호 확인</label><input type="password" id="confirmPassword" name="confirm-password" autocomplete="new-password" required minlength="${PASSWORD_MIN_LENGTH}"><button type="submit" class="btn primary">비밀번호 저장</button></form><div id="passwordMessage" class="login-feedback" role="status" aria-live="polite"></div><button type="button" class="text-btn password-cancel">나중에 설정</button></div>`;}

export function bindPasswordForm(root,{actions,onSaved,onCancel}){
 const form=root.querySelector('#passwordForm'),message=root.querySelector('#passwordMessage'),save=form.querySelector('button'),cancel=root.querySelector('.password-cancel');let busy=false;
 cancel.onclick=()=>{if(!busy){form.reset();onCancel();}};
 form.onsubmit=async event=>{
  event.preventDefault();if(busy||!form.reportValidity())return;
  const password=root.querySelector('#newPassword').value,confirmation=root.querySelector('#confirmPassword').value;
  const problem=passwordValidation(password,confirmation);if(problem){message.textContent=problem;return;}
  busy=true;save.disabled=true;cancel.disabled=true;message.textContent='비밀번호를 저장하고 있습니다…';
  try{await actions.save(password,confirmation);form.reset();onSaved();}
  catch(error){message.textContent=authenticationMessage(error,'save');}
  finally{busy=false;save.disabled=false;cancel.disabled=false;}
 };
}
