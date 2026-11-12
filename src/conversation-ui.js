import {escapeHTML as esc,kstTime} from './model.js';
import {conversationSummary,messageStatuses} from './conversations.js';
import {linkedText} from './task-details.js';

const bubble='<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 3.5h12a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1-1.5 1.5H8l-4 3v-3A1.5 1.5 0 0 1 2.5 13V5A1.5 1.5 0 0 1 4 3.5Z"/></svg>';
export function conversationBadge(messages,target){
 const summary=conversationSummary(messages,target),label=summary.count?`이야기 ${summary.count}`:'이야기 없음';
 const detail=summary.count?`현재까지 남긴 이야기 ${summary.count}건 · 최근 ${kstTime(summary.latest.created_at)}${summary.pending?' · 다한닷 확인 대기 '+summary.pending+'건':''}${summary.clarification?' · 답변 필요 '+summary.clarification+'건':''}`:'아직 이 업무에 남긴 이야기가 없습니다.';
 return `<span class="story-badge ${summary.count?'has-stories':'no-stories'}" title="${esc(detail)}" aria-label="${esc(detail)}">${bubble}<span>${label}</span></span>`;
}

export function conversationPreview(messages,target,{historical=false}={}){
 const summary=conversationSummary(messages,target),last=summary.latest;
 const excerpt=last?.body.length>220?last.body.slice(0,220)+'…':last?.body;
 return `<section class="item-stories" aria-label="${historical?'이 업무의 현재 대화 이력':'나눈 업무 이야기'}"><div class="item-stories-heading"><h3>${historical?'이 업무의 현재 대화 이력':'나눈 업무 이야기'}</h3>${conversationBadge(messages,target)}</div>${last?`<small>최근 남긴 이야기 · ${kstTime(last.created_at)} · ${esc(messageStatuses[last.resolution_status]||last.resolution_status)}</small><p class="story-preview-copy">${esc(excerpt)}</p>`:'<p class="story-preview-empty">아직 남긴 이야기가 없습니다. 진행한 일을 편하게 남겨주세요.</p>'}<button type="button" class="text-btn" data-story-task="${esc(target.task_id||'')}" data-story-event="${esc(target.event_id||'')}">${last?'이력 보고 이어 쓰기':'첫 이야기 남기기'} →</button></section>`;
}

export function conversationThread(messages){
 if(!messages.length)return '<div class="conversation-empty"><span aria-hidden="true">◌</span><strong>어디까지 진행하셨나요?</strong><p>처리한 일, 남은 일, 바뀐 생각을<br>평소 이야기하듯 남겨주세요.</p></div>';
 const ordered=[...messages].sort((a,b)=>Date.parse(a.created_at)-Date.parse(b.created_at)||String(a.id).localeCompare(String(b.id)));
 return `<section class="story-thread" aria-label="나눈 이야기 이력"><div class="story-thread-heading"><h3>나눈 이야기 <span>${ordered.length}</span></h3><small>이전 내용을 보고 아래에 이어 적어주세요.</small></div><div class="conversation-list">${ordered.map(message=>`<article class="conversation-turn" data-thread-message="${esc(message.id)}"><div class="message-meta"><span>나 · ${kstTime(message.created_at)}</span><span class="message-state ${esc(message.resolution_status)}">${esc(messageStatuses[message.resolution_status]||message.resolution_status)}</span></div><div class="message-bubble user-message">${linkedText(message.body)}</div>${message.reply?`<div class="assistant-label"><span class="tiny-mark">d.</span>다한닷 <small>${kstTime(message.resolved_at)}</small></div><div class="message-bubble assistant-message">${linkedText(message.reply)}</div>`:'<p class="pending-caption">저장됐습니다. 다음 갱신 때 다한닷이 확인합니다.</p>'}</article>`).join('')}</div></section>`;
}
