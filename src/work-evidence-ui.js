import {escapeHTML as esc} from './model.js';
import {linkedText,sourceReferencesHTML} from './task-details.js';
import {messageEvidence,messageOutcome,savedTime} from './work-context.js';

export const openEvidenceKeys=root=>[...root.querySelectorAll('details[data-evidence-key][open]')].map(node=>node.dataset.evidenceKey);
export function restoreEvidenceKeys(root,keys=[]){const open=new Set(keys);root.querySelectorAll('details[data-evidence-key]').forEach(node=>{if(open.has(node.dataset.evidenceKey))node.open=true;});}

export function conversationEvidenceHTML(message){
 if(!message.reply&&message.resolution_status==='pending')return '';
 const evidence=messageEvidence(message),outcome=messageOutcome(message),applied=message.resolution_status==='applied';
 const changes=applied?evidence.changed:[];
 const changeHTML=changes.map(item=>`<section class="work-evidence-item"><h4>${esc(item.title)}</h4><p class="work-evidence-kind">${item.kind==='event'?'티밍 안의 일정 표시·메모':item.kind==='new_task'?'새 업무 등록':'기존 업무 변경'}</p>${item.fields.map(field=>`<div class="work-change-field"><h5>${esc(field.label)}</h5><div class="work-change-values"><div><span>반영 전</span><p>${linkedText(field.before)}</p></div><div><span>반영 후</span><p>${linkedText(field.after)}</p></div></div></div>`).join('')}${item.sources.length?`<details class="work-linked-sources" data-evidence-key="${esc(JSON.stringify([message.id,item.kind,item.id]))}"><summary>이 업무에 연결된 자료 ${item.sources.length}건</summary><p>저장된 업무의 원문 연결입니다. 이번 답변이 실제로 참조한 근거는 위 답변에서 확인합니다.</p>${sourceReferencesHTML(item.sources)}</details>`:''}</section>`).join('');
 let note;
 if(message.resolution_status==='clarification')note='확인이 필요한 내용입니다. 업무·일정에는 반영되지 않았습니다.';
 else if(!applied)note='저장된 처리 상태를 확인해야 합니다. 아래 내용을 반영 완료로 표시하지 않습니다.';
 else if(evidence.invalid)note='일부 변경 기록에 반영 전·후 값이 없습니다. 확인되는 항목만 표시합니다.';
 else if(changes.length)note='답변의 판단·제안과 아래의 실제 저장 변경을 함께 확인하세요.';
 else note='이 대화에 저장된 업무·일정 변경은 없습니다. 답변의 제안과 실행 결과를 구분해 확인하세요.';
 return `<details class="work-evidence" data-evidence-message="${esc(message.id)}" data-evidence-key="${esc(JSON.stringify([message.id]))}"><summary><span>근거와 반영 내역</span><small>${esc(outcome.label)}${changes.length?' · '+changes.length+'건 변경':''}</small></summary><div class="work-evidence-body"><dl class="work-evidence-times"><div><dt>이야기 저장</dt><dd>${esc(savedTime(message.created_at))}</dd></div><div><dt>답변 기록</dt><dd>${esc(savedTime(message.resolved_at))}</dd></div></dl><p class="work-evidence-note">${note}</p>${changeHTML}</div></details>`;
}
