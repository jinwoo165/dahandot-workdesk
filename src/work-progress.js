import {escapeHTML as esc} from './model.js';

// Review candidates are an inbox, not yet confirmed personal work.
// A changed source must not undo a confirmed task's completion.
export function workProgress(tasks=[]){
 const unique=[...new Map(tasks.filter(t=>t?.id).map(t=>[t.id,t])).values()];
 const active=unique.filter(t=>!t.archived);
 const confirmed=active.filter(t=>t.status!=='review');
 const done=confirmed.filter(t=>t.status==='done');
 const remaining=confirmed.filter(t=>t.status!=='done');
 const review=active.filter(t=>t.status==='review'||t.pending_review);
 return {total:confirmed.length,done:done.length,remaining:remaining.length,review:review.length,
  percent:confirmed.length?Math.round(done.length/confirmed.length*100):null,
  groups:{done,remaining,review}};
}
export function progressCard(tasks=[],hasError=false){
 const p=workProgress(tasks),ratio=p.total?p.done/p.total:0,angle=ratio*2*Math.PI-Math.PI/2;
 const x=60+51*Math.cos(angle),y=60+51*Math.sin(angle);
 const title='완료 ÷ 확정 업무. 확인 필요 상태와 보관 업무는 제외합니다. 확정 업무의 원본 변경 확인은 완료율을 바꾸지 않습니다.';
 return `<section class="work-progress" aria-label="내 업무 진행률" title="${esc(title)}"><div class="progress-heading"><h2>내 업무 진행률</h2><span>확정 업무</span></div><div class="progress-ring" role="img" aria-label="${p.percent===null?'확정된 업무 없음':`확정 업무 ${p.total}개 중 ${p.done}개 완료, ${p.percent}%`}"><svg viewBox="0 0 120 120" aria-hidden="true"><defs><linearGradient id="workProgressGradient" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#00b995"/><stop offset=".5" stop-color="#08b9de"/><stop offset="1" stop-color="#6658ff"/></linearGradient></defs><circle class="progress-track" cx="60" cy="60" r="51"/><circle class="progress-inner" cx="60" cy="60" r="44"/>${ratio?`<circle class="progress-arc" cx="60" cy="60" r="51" pathLength="100" stroke-dasharray="${ratio*100} 100" transform="rotate(-90 60 60)"/><circle cx="${x}" cy="${y}" r="3" fill="#6658ff" stroke="var(--surface)" stroke-width="1.5"/>`:''}</svg><div><strong>${p.percent===null?'—':p.percent+'<small>%</small>'}</strong><span>${p.percent===null?'업무 확인 대기':'업무 완료'}</span></div></div><div class="progress-metrics"><button data-progress-list="done" aria-label="완료한 업무 ${p.done}개 보기"><span aria-hidden="true">✓</span><div><b>${p.done}</b><small>완료</small></div></button><button data-progress-list="remaining" aria-label="남은 업무 ${p.remaining}개 보기"><span aria-hidden="true">◷</span><div><b>${p.remaining}</b><small>남은 업무</small></div></button></div><p class="progress-caption">${p.total?`확정 ${p.total}개 중 ${p.done}개 완료`:'확인 후 내 업무로 집계합니다'}</p><button class="progress-review" data-progress-list="review" aria-label="새로 확인할 업무 ${p.review}개 보기"><span>새로 확인할 업무</span><b>${p.review}</b><span aria-hidden="true">›</span></button><p class="progress-note">확인 대기·보관은 완료율 제외${hasError?'<br>연결 지연 · 이전 집계':''}</p></section>`;
}
