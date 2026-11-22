import {escapeHTML as esc} from './model.js';

// Ignore formatting changes, but never hide a new date, decision, or action.
export function normalizeBriefingLine(value=''){
 return String(value).normalize('NFC').trim().replace(/^(?:[•·]\s*|[-*]\s+)/u,'').replace(/\s+/gu,' ').trim();
}

export function briefingItems(text,dismissals=[]){
 const lines=[...new Set(String(text||'').split(/\r?\n/).map(normalizeBriefingLine).filter(Boolean))];
 const hidden=dismissals.filter(row=>row.hidden_at).sort((a,b)=>String(b.hidden_at).localeCompare(String(a.hidden_at)));
 const suppressed=new Set(hidden.map(row=>normalizeBriefingLine(row.line_text)));
 return {visible:lines.filter(line=>!suppressed.has(line)),hidden};
}

export function briefingListHTML(items,{showHidden=false,disabled=false}={}){
 const rows=showHidden?items.hidden:items.visible;
 if(!rows.length)return `<p class="briefing-empty">${showHidden?'숨긴 주요내용이 없습니다.':'표시할 주요내용을 모두 숨겼습니다.'}</p>`;
 return `<ul class="briefing-lines" data-scroll-key="briefing-${showHidden?'hidden':'visible'}" tabindex="0" aria-label="${showHidden?'숨긴 주요내용':'주요내용'} 목록">${rows.map(item=>{
  const line=showHidden?item.line_text:item;
  return `<li><span>${esc(line)}</span><button class="briefing-line-action ${showHidden?'briefing-restore':'briefing-dismiss'}" ${showHidden?'data-briefing-restore':'data-briefing-hide'}="${esc(showHidden?item.line_key:line)}" aria-label="${esc(line)} ${showHidden?'복원':'숨기기'}" title="${showHidden?'주요내용 복원':'주요내용 숨기기'}" ${disabled?'disabled':''}>${showHidden?'복원':'×'}</button></li>`;
 }).join('')}</ul>`;
}
