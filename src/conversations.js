export const messageStatuses = {pending:'다한닷 확인 대기',applied:'반영 완료',clarification:'답변이 필요해요'};

export function validateMessage(body){
 const text=String(body??'').trim();
 if(!text)throw Error('남길 이야기를 적어주세요.');
 if(text.length>12000)throw Error('한 번에 12,000자까지 남길 수 있습니다.');
 return text;
}

export function messagesForTarget(messages,target={}){
 if(!target.task_id&&!target.event_id)return messages;
 return messages.filter(m=>target.task_id
  ?m.task_id===target.task_id||(m.changes||[]).some(c=>['task','new_task'].includes(c.kind)&&c.id===target.task_id)
  :m.event_id===target.event_id||(m.changes||[]).some(c=>c.kind==='event'&&c.id===target.event_id));
}

export function mergeCalendarOverrides(events,overrides){
 const byId=new Map(overrides.map(o=>[o.event_id,o]));
 return events.map(e=>{const o=byId.get(e.id);return o?{...e,excluded:o.excluded,start_at:o.start_at||e.start_at,end_at:o.end_at||e.end_at,personal_note:o.reason,personal_changed:!!(o.start_at||o.excluded)}:{...e,excluded:false};});
}
