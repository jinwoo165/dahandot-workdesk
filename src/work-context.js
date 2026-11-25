import {statuses,priorities,dateLabel,kstTime} from './model.js';
import {messagesForTarget,mergeSavedMessages} from './conversations.js';

const taskFields=[['title','업무명'],['project','프로젝트'],['owner_label','담당'],['status','상태'],['priority','우선순위'],['due_date','마감'],['next_review_on','다음 확인'],['next_action','다음 행동'],['remaining_action','남은 일'],['note','내 메모'],['pinned','상단 고정'],['archived','보관'],['pending_review','원본 변경 확인']];
const eventFields=[['excluded','티밍 일정 표시'],['start_at','시작'],['end_at','종료'],['reason','내 일정 메모']];
const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const has=(value,key)=>Object.prototype.hasOwnProperty.call(value,key);
const present=value=>value!==undefined&&value!==null&&value!=='';
const same=(a,b)=>Object.is(a,b)||(!present(a)&&!present(b));
const validTime=value=>present(value)&&Number.isFinite(Date.parse(value));

export function savedTime(value){return validTime(value)?kstTime(value):'시각 미확인';}

export function changeValue(field,value){
 if(!present(value))return '미지정';
 if(field==='status')return statuses[value]||String(value);
 if(field==='priority')return priorities[value]||String(value);
 if(['due_date','next_review_on'].includes(field))return validTime(value)?dateLabel(value):String(value);
 if(['start_at','end_at'].includes(field))return validTime(value)?kstTime(value):String(value);
 if(field==='excluded')return value===true?'내 티밍에서 제외':value===false?'표시':'값 확인 필요';
 if(field==='archived')return value===true?'보관됨':value===false?'업무 목록에 표시':'값 확인 필요';
 if(field==='pinned')return value===true?'고정':value===false?'고정 안 함':'값 확인 필요';
 if(field==='pending_review')return value===true?'확인 필요':value===false?'확인 표시 없음':'값 확인 필요';
 return typeof value==='object'?'값 확인 필요':String(value);
}

// Read only the business fields that the stored conversation RPC can change.
// Revision/time metadata alone is not evidence of a changed task or calendar.
export function messageEvidence(message={}){
 const raw=Array.isArray(message.changes)?message.changes:[];
 const records=raw.map(change=>{
  if(!record(change)||!['task','new_task','event'].includes(change.kind)||!change.id||!record(change.after))return {valid:false};
  const isEvent=change.kind==='event',isNew=change.kind==='new_task';
  if(!isNew&&!record(change.before))return {valid:false};
  if(isNew&&change.before!==null)return {valid:false};
  if(!isEvent&&(change.after.id!==change.id||(!isNew&&change.before.id!==change.id)))return {valid:false};
  const snapshots=isEvent?[change.before?.source,change.before?.override,change.after]:[change.before,change.after];
  if(message.workspace_id&&snapshots.some(snapshot=>record(snapshot)&&present(snapshot.workspace_id)&&snapshot.workspace_id!==message.workspace_id))return {valid:false};
  let before=change.before,after=change.after;
  if(isEvent){
   if(!record(before.source)||(before.override!==null&&!record(before.override)))return {valid:false};
   if(before.source.id!==change.id||after.event_id!==change.id)return {valid:false};
   const source=before.source,override=before.override||{};
   before={excluded:override.excluded??false,start_at:override.start_at||source.start_at,end_at:override.end_at||source.end_at,reason:override.reason||''};
   after={excluded:after.excluded??false,start_at:after.start_at||source.start_at,end_at:after.end_at||source.end_at,reason:after.reason||''};
  }
  const fields=(isEvent?eventFields:taskFields).flatMap(([key,label])=>{
   if(!has(after,key)||(!isNew&&!has(before,key)))return [];
   if(isNew?!present(after[key])||after[key]===false:same(before[key],after[key]))return [];
   return [{key,label,before:isNew?'등록 전':changeValue(key,before[key]),after:changeValue(key,after[key])}];
  });
  const refs=isEvent?[]:[...(Array.isArray(change.after.source_refs)?change.after.source_refs:[]),...(Array.isArray(change.before?.source_refs)?change.before.source_refs:[])];
  const seen=new Set(),sources=refs.filter(ref=>{
   if(!record(ref))return false;
   const key=JSON.stringify([ref.url||'',ref.label||'',ref.excerpt||'']);
   if(seen.has(key))return false;seen.add(key);return true;
  });
  return {valid:true,id:String(change.id),kind:change.kind,title:(isEvent?change.before.source.title:change.after.title||change.before?.title)||'제목 없는 기록',fields,sources};
 });
 const changed=records.filter(item=>item.valid&&item.fields.length);
 return {records,changed,invalid:records.filter(item=>!item.valid).length,hasChanges:changed.length>0};
}

export function messageOutcome(message={}){
 if(message.resolution_status==='pending')return {label:'확인 대기',state:'pending'};
 if(message.resolution_status==='clarification')return {label:'확인 필요',state:'clarification'};
 if(message.resolution_status!=='applied')return {label:'처리 상태 미확인',state:'unknown'};
 const evidence=messageEvidence(message);
 if(evidence.invalid)return {label:'반영 기록 확인 필요',state:'clarification'};
 return evidence.hasChanges?{label:'반영 완료',state:'applied'}:{label:'답변 기록',state:'answered'};
}

// Link by immutable IDs only. A matching title does not establish continuity.
export function taskContinuity(task,messages=[]){
 if(!task?.id)return {latest:null,latestReply:null,pending:0};
 const related=mergeSavedMessages([],messagesForTarget(messages,{task_id:task.id})).filter(message=>message.id&&message.body?.trim());
 const latest=related.at(-1)||null;
 const replies=related.filter(message=>message.reply?.trim()&&['applied','clarification'].includes(message.resolution_status));
 replies.sort((a,b)=>(Date.parse(a.resolved_at)||0)-(Date.parse(b.resolved_at)||0)||(Date.parse(a.created_at)||0)-(Date.parse(b.created_at)||0)||String(a.id).localeCompare(String(b.id)));
 return {latest,latestReply:replies.at(-1)||null,pending:related.filter(message=>message.resolution_status==='pending').length};
}
