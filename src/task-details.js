import {escapeHTML as esc,safeURL,statuses,dateLabel,kstTime,day,addDays} from './model.js';
import {taskContinuity,messageOutcome,savedTime} from './work-context.js';

function urlWithoutPunctuation(value){
 let url=value;
 for(;;){
  const before=url;
  url=url.replace(/[.,!?;:。，！？；：…”’」』】〉》]+$/u,'');
  for(const [open,close] of [['(',')'],['[',']'],['{','}']]){
   while(url.endsWith(close)&&url.split(close).length>url.split(open).length)url=url.slice(0,-1);
  }
  if(before===url)return url;
 }
}

// Render saved text as text; only explicit HTTP(S) addresses become links.
export function linkedText(value){
 const text=String(value??'');
 let html='',offset=0;
 for(const match of text.matchAll(/https?:\/\/[^\s<>"'`\u0000-\u001f]+/gi)){
  const raw=urlWithoutPunctuation(match[0]),url=safeURL(raw);
  if(!url)continue;
  let prefix=text.slice(offset,match.index),label=raw,end=match.index+raw.length;
  const markdown=prefix.match(/\[([^\]\n]+)\]\($/);
  if(markdown&&text[end]===')'){
   prefix=prefix.slice(0,-markdown[0].length);label=markdown[1];end++;
  }
  html+=esc(prefix)+`<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>`;
  offset=end;
 }
 return html+esc(text.slice(offset));
}

export function sourceReferencesHTML(refs=[]){
 if(!refs.length)return '<p class="task-detail-empty">등록된 원문 링크가 없습니다.</p>';
 return refs.map(ref=>{
  const url=safeURL(ref.url),label=ref.label||'업무 원문';
  return `<article class="task-source"><div class="task-source-heading">${url?`<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(label)} <span aria-hidden="true">↗</span></a>`:`<strong>${esc(label)}</strong><span class="muted"> · 직접 링크 미확인</span>`}</div>${ref.occurred_at?`<small class="muted">${esc(savedTime(ref.occurred_at))}</small>`:''}${ref.excerpt?`<p class="linked-copy">${linkedText(ref.excerpt)}</p>`:''}</article>`;
 }).join('');
}

export function taskContinuityHTML(task,messages=[]){
 const {latest,latestReply,pending}=taskContinuity(task,messages);
 if(!latest)return '<p class="work-context-empty">이 업무에 연결된 대화가 아직 없습니다. 업무 이야기에서 현재 생각과 판단 이유를 이어서 남길 수 있습니다.</p>';
 const preview=value=>{const text=String(value||'');return esc(text.length>280?text.slice(0,280)+'…':text);};
 return `<section class="work-context-story" aria-label="이 업무에 이어진 대화"><div class="work-context-story-head"><h4>이 업무에 이어진 대화</h4>${pending?`<span class="work-context-pending">확인 대기 ${pending}건</span>`:''}</div><p class="work-context-byline">최근 남긴 이야기 · ${esc(savedTime(latest.created_at))} · ${esc(messageOutcome(latest).label)}</p><p class="work-context-excerpt">${preview(latest.body)}</p>${latestReply?`<p class="work-context-byline">최근 답변 · ${esc(savedTime(latestReply.resolved_at))}</p><p class="work-context-excerpt">${preview(latestReply.reply)}</p>`:''}${pending?'<p class="work-context-help">새 이야기는 저장되어 있습니다. 위 업무 내용은 확인 후 반영된 값입니다.</p>':''}<button type="button" class="text-btn" data-story-task="${esc(task.id)}" data-story-event="">전체 대화와 판단 이유 이어 보기 →</button></section>`;
}

export function taskDetailContent(task,conversationHTML='',{messages=[]}={}){
 const meta=[['프로젝트',task.project],['담당',task.owner_label],['마감',task.due_date?dateLabel(task.due_date):''],['다음 확인',task.next_review_on?dateLabel(task.next_review_on):'']].filter(([,value])=>value);
 const textSection=(title,text,kind='')=>text?`<section class="task-detail-section detail-card ${kind}"><h3>${title}</h3><div class="linked-copy">${linkedText(text)}</div></section>`:'';
 return `<header class="task-detail-hero"><div class="task-detail-status"><span class="badge ${esc(task.status)}">${esc(statuses[task.status]||task.status)}</span>${task.archived?'<span class="badge">보관됨</span>':''}${task.pending_review?'<span class="badge review">원본 변경 확인 필요</span>':''}${task.source_data?.source_state==='cancelled'?'<span class="badge">원문에서 취소됨</span>':task.source_data?.source_state==='completed'?'<span class="badge">원문에서 완료됨</span>':''}</div>
 <h2 class="task-detail-title">${esc(task.title)}</h2>
 ${meta.length?`<dl class="task-detail-meta">${meta.map(([label,value])=>`<div><dt>${label}</dt><dd>${esc(value)}</dd></div>`).join('')}</dl>`:''}</header>
 ${task.status==='done'&&task.remaining_action?'<p class="detail-attention">완료 기록과 남은 일 확인 필요</p>':''}
 <section class="work-context-current" aria-label="현재 업무 맥락"><div class="work-context-heading"><h3>현재 맥락</h3><span>${task.updated_at?'업무 기록 '+esc(savedTime(task.updated_at)):'저장된 업무 내용'}</span></div>
 ${textSection('남은 일',task.remaining_action,'detail-next')}${textSection('다음 행동',task.next_action,task.remaining_action?'':'detail-next')}${textSection('내 메모',task.note,'detail-note')}${!task.remaining_action&&!task.next_action&&!task.note?'<p class="work-context-empty">아직 남은 일·다음 행동·메모가 기록되지 않았습니다.</p>':''}
 ${taskContinuityHTML(task,messages)}</section>
 ${conversationHTML}
 <section class="task-detail-section detail-card detail-sources"><h3>근거 · 원문 <span class="detail-count">${(task.source_refs||[]).length}</span></h3><p class="task-source-help">확인 근거를 읽고 원문을 새 탭에서 열 수 있습니다.</p>${sourceReferencesHTML(task.source_refs||[])}</section>`;
}

export function eventDetailContent(event,conversationHTML=''){
 const status={confirmed:'예정',tentative:'참석 확인 필요',cancelled:'취소됨'}[event.status]||'일정';
 let dates;
 if(event.all_day){
  const first=day(event.start_at),last=addDays(day(event.end_at),-1);
  dates=[['일시',(first===last?dateLabel(first):`${dateLabel(first)} ~ ${dateLabel(last)}`)+' · 종일']];
 }else dates=[['시작',kstTime(event.start_at)],['종료',kstTime(event.end_at)]];
 const meta=[...dates,['캘린더',event.source]].filter(([,value])=>value);
 return `<div class="task-detail-status"><span class="badge">${esc(status)}</span>${event.excluded?'<span class="badge">내 티밍에서 제외됨</span>':event.personal_changed?'<span class="badge">내 일정 조정</span>':''}</div>
 <h2 class="task-detail-title">${esc(event.title)}</h2>
 ${conversationHTML}
 <dl class="task-detail-meta">${meta.map(([label,value])=>`<div><dt>${label}</dt><dd>${esc(value)}</dd></div>`).join('')}</dl>
 <section class="task-detail-section"><h3>내용</h3>${event.note?`<div class="linked-copy">${linkedText(event.note)}</div>`:'<p class="task-detail-empty">티밍에 등록된 추가 내용이 없습니다.</p>'}</section>
 ${event.personal_note?`<section class="task-detail-section"><h3>내 메모</h3><div class="linked-copy">${linkedText(event.personal_note)}</div></section>`:''}
 <section class="task-detail-section"><h3>원문</h3><p class="task-source-help">원문을 누르면 전체 내용을 새 탭에서 볼 수 있습니다.</p>${sourceReferencesHTML(event.url?[{label:'일정 원문',url:event.url}]:[])}</section>`;
}
