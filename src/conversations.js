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

// A submitted story stays visible after it has been processed. Drafts are never counted.
export function conversationSummary(messages,target={}){
 if(!target.task_id&&!target.event_id)return {count:0,pending:0,clarification:0,latest:null};
 const saved=mergeSavedMessages([],messagesForTarget(messages,target)).filter(message=>message.id&&message.body?.trim());
 const ordered=[...saved].sort((a,b)=>Date.parse(a.created_at)-Date.parse(b.created_at)||String(a.id).localeCompare(String(b.id)));
 return {count:saved.length,pending:saved.filter(message=>message.resolution_status==='pending').length,
  clarification:saved.filter(message=>message.resolution_status==='clarification').length,latest:ordered.at(-1)||null};
}

// The table is append-only for users. A read started before a send must not erase its receipt,
// and a stale pending receipt must not replace an already processed reply.
export function mergeSavedMessages(current=[],incoming=[]){
 const byId=new Map(current.map(message=>[message.id,message]));
 for(const message of incoming){
  const previous=byId.get(message.id);
  if(!previous||(Date.parse(message.resolved_at)||0)>=(Date.parse(previous.resolved_at)||0))byId.set(message.id,message);
 }
 return [...byId.values()].sort((a,b)=>Date.parse(a.created_at)-Date.parse(b.created_at)||String(a.id).localeCompare(String(b.id)));
}

export function verifySavedMessage(message,expected){
 const row=Array.isArray(message)&&message.length===1?message[0]:message;
 if(!row||row.id!==expected.id||row.workspace_id!==expected.workspace_id||row.body!==expected.body||
  (row.task_id||null)!==(expected.task_id||null)||(row.event_id||null)!==(expected.event_id||null)||!Number.isFinite(Date.parse(row.created_at)))
  throw Error('대화의 저장 결과를 확인하지 못했습니다. 작성한 내용을 유지합니다. 다시 시도해 주세요.');
 return row;
}

export async function persistConversation(db,expected){
 const {data,error}=await db.rpc('record_workdesk_message',{p_workspace:expected.workspace_id,p_id:expected.id,p_body:expected.body,p_task_id:expected.task_id,p_event_id:expected.event_id});
 if(error)throw error;
 verifySavedMessage(data,expected);
 const saved=await db.from('workdesk_messages').select('*').eq('workspace_id',expected.workspace_id).eq('id',expected.id).single();
 if(saved.error)throw Error('저장 결과 재확인에 연결하지 못했습니다. 작성한 내용을 유지합니다. 다시 시도해 주세요.');
 return verifySavedMessage(saved.data,expected);
}

export function mergeCalendarOverrides(events,overrides){
 const byId=new Map(overrides.map(o=>[o.event_id,o]));
 return events.map(e=>{const o=byId.get(e.id);return o?{...e,excluded:o.excluded,start_at:o.start_at||e.start_at,end_at:o.end_at||e.end_at,personal_note:o.reason,personal_changed:!!(o.start_at||o.excluded)}:{...e,excluded:false};});
}
