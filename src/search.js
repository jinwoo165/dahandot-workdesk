import {escapeHTML, statuses, safeURL, day, kstTime} from './model.js';
import {summaryForFile} from './file-summaries.js';
import {itemVisibilityKey} from './item-visibility.js';

export const SEARCH_GROUPS=[['tasks','업무'],['events','일정'],['files','OneDrive 자료'],['archived','보관한 업무'],['messages','나눈 이야기'],['links','업무 바로가기']];
const clean=value=>String(value??'').normalize('NFC').replace(/\s+/gu,' ').trim();
const lower=value=>clean(value).toLocaleLowerCase('ko');
export const searchTokens=query=>[...new Set(lower(query).split(' ').filter(Boolean))];
const timestamp=value=>Date.parse(value)||0;
export const searchFileKey=file=>JSON.stringify([file.drive_id,file.item_id]);

// Search the latest saved version of every file, independently of the recent panel's cap.
export function latestSearchFiles(files=[]){
 const latest=new Map();
 for(const file of files){
  const key=searchFileKey(file),previous=latest.get(key);
  if(!previous||timestamp(file.modified_at_source)>timestamp(previous.modified_at_source)||
    (timestamp(file.modified_at_source)===timestamp(previous.modified_at_source)&&timestamp(file.changed_at)>timestamp(previous.changed_at)))latest.set(key,file);
 }
 return [...latest.values()].sort((a,b)=>timestamp(b.changed_at)-timestamp(a.changed_at)||searchFileKey(a).localeCompare(searchFileKey(b)));
}

export function searchSnippet(value,query,length=170){
 const text=clean(value),tokens=searchTokens(query),normalized=lower(text);
 const indices=tokens.map(token=>normalized.indexOf(token)).filter(index=>index>=0);
 const first=indices.length?Math.min(...indices):0,start=Math.max(0,first-45),end=Math.min(text.length,start+length);
 return (start?'…':'')+text.slice(start,end)+(end<text.length?'…':'');
}

// Escape text before adding marks. Queries are literal strings, never HTML or regex syntax.
export function highlightSearch(value,query){
 const text=clean(value),normalized=lower(text),ranges=[];
 for(const token of searchTokens(query)){
  let from=0,index;
  while((index=normalized.indexOf(token,from))!==-1){ranges.push([index,index+token.length]);from=index+token.length;}
 }
 ranges.sort((a,b)=>a[0]-b[0]);const merged=[];
 for(const range of ranges){const last=merged.at(-1);if(last&&range[0]<=last[1])last[1]=Math.max(last[1],range[1]);else merged.push([...range]);}
 let html='',offset=0;
 for(const [start,end] of merged){html+=escapeHTML(text.slice(offset,start))+'<mark>'+escapeHTML(text.slice(start,end))+'</mark>';offset=end;}
 return html+escapeHTML(text.slice(offset));
}

export function searchWorkdesk(data,query){
 const tokens=searchTokens(query);if(!tokens.length)return [];
 const documents=[],hidden=new Set((data.itemVisibility||[]).filter(row=>row.hidden_at).map(row=>itemVisibilityKey(row.kind,row.drive_id,row.item_id)));
 const add=(group,kind,id,title,fields,badges=[],meta='',url='')=>documents.push({group,kind,id,title:clean(title),fields:fields.filter(([,text])=>clean(text)).map(([label,text])=>({label,text:clean(text)})),badges:badges.filter(Boolean),meta,url:safeURL(url)});
 for(const task of data.tasks||[]){
  add(task.archived?'archived':'tasks','task',task.id,task.title,[['메모',task.note],['남은 일',task.remaining_action],['다음 행동',task.next_action],['프로젝트',task.project],['담당',task.owner_label],['마감',task.due_date],['다음 확인',task.next_review_on],...(task.source_refs||[]).flatMap(ref=>[['근거',ref.excerpt],['출처',ref.label],['원문 링크',safeURL(ref.url)]])],[statuses[task.status]||task.status,task.archived?'보관됨':''],task.project||'');
 }
 for(const event of data.events||[]){
  const date=event.start_at?(event.all_day?day(event.start_at)+' · 종일':day(event.start_at)+' · '+kstTime(event.start_at)):'';
  add('events','event',event.id,event.title,[['내용',event.note],['내 메모',event.personal_note],['일시',date],['캘린더',event.source]],
   [event.status==='cancelled'?'취소됨':event.status==='tentative'?'참석 확인 필요':'예정',event.excluded?'내 일정에서 제외':'',hidden.has(itemVisibilityKey('agenda','',event.id))?'목록에서 숨김':''],date);
 }
 for(const file of latestSearchFiles(data.files)){
  const summary=summaryForFile(file,data.fileSummaries),valid=['ok','partial'].includes(summary.status);
  add('files','file',searchFileKey(file),file.name,[[summary.status==='partial'?'일부 본문 요약':'본문 요약',valid?summary.text:''],['폴더',file.folder_path]],
   [valid?(summary.status==='partial'?'일부 본문 요약':'본문 요약'):summary.text,hidden.has(itemVisibilityKey('file',file.drive_id,file.item_id))?'목록에서 숨김':''],file.changed_at?'변경 '+day(file.changed_at):'',file.web_url);
 }
 const taskTitles=new Map((data.tasks||[]).map(task=>[task.id,task.title])),eventTitles=new Map((data.events||[]).map(event=>[event.id,event.title]));
 for(const message of data.messages||[])add('messages','message',message.id,taskTitles.get(message.task_id)||eventTitles.get(message.event_id)||'자유롭게 남긴 이야기',
  [['남긴 이야기',message.body],['다한닷 답변',message.reply]],[{pending:'확인 대기',applied:'반영됨',clarification:'추가 확인'}[message.resolution_status]||''],message.created_at?kstTime(message.created_at):'');
 for(const entry of data.links||[])add('links','link',entry.id,entry.label,[['설명',entry.description],['주소',safeURL(entry.url)]],[entry.removed_at?'삭제한 바로가기':''], '',entry.url);

 const matched=documents.flatMap(document=>{
  const title=lower(document.title),values=document.fields.map(field=>lower(field.text));
  if(!tokens.every(token=>title.includes(token)||values.some(text=>text.includes(token))||document.badges.some(badge=>lower(badge).includes(token))))return [];
  const matching=document.fields.filter((field,index)=>tokens.some(token=>values[index].includes(token)));
  const excerpts=(matching.length?matching:document.fields).slice(0,2).map(field=>({...field,text:searchSnippet(field.text,query)}));
  const score=tokens.reduce((total,token)=>total+(title.includes(token)?10:1),0)+(title===lower(query)?20:0);
  return [{...document,excerpts,score}];
 });
 return SEARCH_GROUPS.map(([id,label])=>({id,label,items:matched.filter(item=>item.group===id).sort((a,b)=>b.score-a.score||a.title.localeCompare(b.title,'ko')||String(a.id).localeCompare(String(b.id)))})).filter(group=>group.items.length);
}
