export const statuses={review:'확인 필요',todo:'할 일',doing:'진행 중',partial:'부분 완료',waiting:'대기',done:'완료'};
export const priorities={high:'높음',normal:'보통',low:'낮음'};
export const day=(d=new Date())=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(d));
export const addDays=(d,n)=>new Date(Date.parse(d+'T00:00:00Z')+n*864e5).toISOString().slice(0,10);
export const monthBounds=m=>[m+'-01',new Date(Date.UTC(+m.slice(0,4),+m.slice(5,7),1)).toISOString().slice(0,10)];
export const kstTime=s=>s?new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'numeric',day:'numeric',weekday:'short',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(s)):'미확인';
export const dateLabel=s=>s?`${day(s)} (${new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',weekday:'short'}).format(new Date(s))})`:'미지정';
export function paginate(items,index=0,size=1){
 const pageSize=Math.max(1,Math.floor(Number(size)||1)),pages=Math.max(1,Math.ceil(items.length/pageSize));
 const page=Math.max(0,Math.min(pages-1,Math.floor(Number(index)||0)));
 return {items:items.slice(page*pageSize,(page+1)*pageSize),page,pages,total:items.length,size:pageSize};
}
export function upcomingEvents(events,today=day(),days=30){
 const start=Date.parse(today+'T00:00:00+09:00'),end=Date.parse(addDays(today,days)+'T00:00:00+09:00');
 return events.filter(e=>!e.excluded&&e.status!=='cancelled'&&Date.parse(e.start_at)<end&&Date.parse(e.end_at)>start).sort((a,b)=>Date.parse(a.start_at)-Date.parse(b.start_at)||a.id.localeCompare(b.id));
}
export const escapeHTML=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function safeURL(s){try{const u=new URL(s);return ['https:','http:'].includes(u.protocol)&&!u.username&&!u.password?u.href:'';}catch{return '';}}
export function needsAttention(t,today=day()){if(t.archived||t.status==='done')return false;if(t.next_review_on&&t.next_review_on>today)return false;if(t.pinned)return true;return Boolean((t.due_date&&t.due_date<=today)||(t.next_review_on&&t.next_review_on<=today));}
export function matchesTask(t,view,q='',today=day()){
 if(view==='archived'?!t.archived:t.archived)return false;
 if(view==='today'&&!needsAttention(t,today))return false;
 if(view==='review'&&t.status!=='review'&&!t.pending_review)return false;
 if(view==='partial'&&t.status!=='partial')return false;
 if(view==='done'&&t.status!=='done')return false;
 if(view==='all'&&t.status==='done')return false;
 return `${t.title} ${t.project} ${t.note} ${t.next_action} ${t.remaining_action}`.toLowerCase().includes(q.toLowerCase());
}
export function eventOnDay(e,d){const start=day(e.start_at),end=day(e.end_at);return !e.excluded&&e.status!=='cancelled'&&start<=d&&(e.all_day?d<end:d<=end);}
export function validateTask(p){if(!p.title?.trim())throw Error('업무명을 입력하세요.');if(p.status==='partial'&&!p.remaining_action?.trim())throw Error('부분 완료인 업무에는 남은 일을 적어주세요.');if(p.status==='done'&&(p.remaining_action?.trim()||p.next_review_on))throw Error('남은 일이나 다음 확인일이 있으면 ‘부분 완료’를 선택하세요. 전체 완료라면 두 항목을 비워주세요.');return p;}
export function briefingEligible(t){return !t.archived&&t.status!=='done';}
export function currentBriefing(tasks,events,today=day()){
 const work=tasks.filter(t=>needsAttention(t,today)).sort((a,b)=>(a.next_review_on||a.due_date||today).localeCompare(b.next_review_on||b.due_date||today)).slice(0,3);
 const upcoming=events.filter(e=>!e.excluded&&e.status!=='cancelled'&&day(e.start_at)<=addDays(today,2)&&(e.all_day?day(e.end_at)>today:day(e.end_at)>=today)).sort((a,b)=>Date.parse(a.start_at)-Date.parse(b.start_at)).slice(0,2);
 const lines=[...work.map(t=>'챙길 일 · '+t.title+(t.remaining_action||t.next_action?' — '+(t.remaining_action||t.next_action):'')),...upcoming.map(e=>'일정 · '+(e.all_day?day(e.start_at)+' 종일':kstTime(e.start_at))+' '+e.title)];
 return lines.length?lines.join('\n'):'오늘~모레 챙길 업무와 일정이 없습니다. 확인할 신규·변경 업무 '+tasks.filter(t=>briefingEligible(t)&&(t.status==='review'||t.pending_review)).length+'건은 확인 목록에 남아 있습니다.';
}
