import {escapeHTML as esc,safeURL,statuses,dateLabel,kstTime,day,addDays} from './model.js';

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
  return `<article class="task-source"><div class="task-source-heading">${url?`<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(label)} <span aria-hidden="true">↗</span></a>`:`<strong>${esc(label)}</strong><span class="muted"> · 직접 링크 미확인</span>`}</div>${ref.occurred_at?`<small class="muted">${esc(kstTime(ref.occurred_at))}</small>`:''}${ref.excerpt?`<p class="linked-copy">${linkedText(ref.excerpt)}</p>`:''}</article>`;
 }).join('');
}

export function taskDetailContent(task,conversationHTML=''){
 const meta=[['프로젝트',task.project],['담당',task.owner_label],['마감',task.due_date?dateLabel(task.due_date):''],['다음 확인',task.next_review_on?dateLabel(task.next_review_on):'']].filter(([,value])=>value);
 const textSection=(title,text)=>text?`<section class="task-detail-section"><h3>${title}</h3><div class="linked-copy">${linkedText(text)}</div></section>`:'';
 return `<div class="task-detail-status"><span class="badge ${esc(task.status)}">${esc(statuses[task.status]||task.status)}</span>${task.archived?'<span class="badge">보관됨</span>':''}${task.pending_review?'<span class="badge review">원본 변경 확인 필요</span>':''}${task.source_data?.source_state==='cancelled'?'<span class="badge">원문에서 취소됨</span>':task.source_data?.source_state==='completed'?'<span class="badge">원문에서 완료됨</span>':''}</div>
 <h2 class="task-detail-title">${esc(task.title)}</h2>
 ${conversationHTML}
 ${meta.length?`<dl class="task-detail-meta">${meta.map(([label,value])=>`<div><dt>${label}</dt><dd>${esc(value)}</dd></div>`).join('')}</dl>`:''}
 ${textSection('다음 행동',task.next_action)}${textSection('남은 일',task.remaining_action)}${textSection('내 메모',task.note)}
 <section class="task-detail-section"><h3>근거 · 원문</h3><p class="task-source-help">원문을 누르면 전체 내용을 새 탭에서 볼 수 있습니다.</p>${sourceReferencesHTML(task.source_refs||[])}</section>`;
}

export function eventDetailContent(event,conversationHTML=''){
 const status={confirmed:'예정',tentative:'참석 확인 필요',cancelled:'취소됨'}[event.status]||'일정';
 let dates;
 if(event.all_day){
  const first=day(event.start_at),last=addDays(day(event.end_at),-1);
  dates=[['일시',(first===last?dateLabel(first):`${dateLabel(first)} ~ ${dateLabel(last)}`)+' · 종일']];
 }else dates=[['시작',kstTime(event.start_at)],['종료',kstTime(event.end_at)]];
 const meta=[...dates,['캘린더',event.source]].filter(([,value])=>value);
 return `<div class="task-detail-status"><span class="badge">${esc(status)}</span>${event.excluded?'<span class="badge">내 업무보드에서 제외됨</span>':event.personal_changed?'<span class="badge">내 일정 조정</span>':''}</div>
 <h2 class="task-detail-title">${esc(event.title)}</h2>
 ${conversationHTML}
 <dl class="task-detail-meta">${meta.map(([label,value])=>`<div><dt>${label}</dt><dd>${esc(value)}</dd></div>`).join('')}</dl>
 <section class="task-detail-section"><h3>내용</h3>${event.note?`<div class="linked-copy">${linkedText(event.note)}</div>`:'<p class="task-detail-empty">업무보드에 등록된 추가 내용이 없습니다.</p>'}</section>
 ${event.personal_note?`<section class="task-detail-section"><h3>내 메모</h3><div class="linked-copy">${linkedText(event.personal_note)}</div></section>`:''}
 <section class="task-detail-section"><h3>원문</h3><p class="task-source-help">원문을 누르면 전체 내용을 새 탭에서 볼 수 있습니다.</p>${sourceReferencesHTML(event.url?[{label:'일정 원문',url:event.url}]:[])}</section>`;
}
