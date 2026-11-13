// Completion is a verified observation of an agreed scope, not an unlimited crawl.
export const REQUIRED_CHECKS = {
 'dooray-mail':['listing','content','attachments'],
 'dooray-favorites':['favorites','history','attachments'],
 'dooray-calendar':['listing','details'],
 'google-primary':['listing'],
 'google-secondary':['listing'],
 'onedrive-files':['folder_listing','metadata']
};
export const CHECK_LABELS = {listing:'목록 전체',content:'필요한 본문',attachments:'필요한 첨부',favorites:'즐겨찾기 목록',history:'기간 내 대화',details:'필요한 일정 상세',modified_search:'수정 파일 검색',created_search:'생성 파일 검색',folder_listing:'지정 폴더',metadata:'파일 정보'};
export function completedChecks(sourceId,checks={}){
 const required=REQUIRED_CHECKS[sourceId];
 return Boolean(required?.length)&&required.every(key=>{
  const c=checks[key];
  return c?.complete===true&&Number.isInteger(c.expected)&&c.expected>=0&&Number.isInteger(c.checked)&&c.checked===c.expected;
 });
}
export function verifiedCompletion(record){
 return record?.status==='ok'&&Boolean(record.feed_batch_id||record.file_batch_id)&&Number.isFinite(Date.parse(record.verified_at))
  &&record.scope?.description?.trim()?.length>0&&Array.isArray(record.missing)&&record.missing.length===0
  &&completedChecks(record.source_id,record.checks);
}
export function collectionDetail(record){
 const parts=[record.detail||'',record.scope?.description?'수집 범위 · '+record.scope.description:''];
 if(record.scope?.from&&record.scope?.to)parts.push('기간 · '+record.scope.from+' ~ '+record.scope.to);
 for(const key of REQUIRED_CHECKS[record.source_id]||[]){const c=record.checks?.[key];if(c)parts.push(`${CHECK_LABELS[key]} · ${c.checked??'미확인'} / ${c.expected??'미확인'}${c.complete?' 확인':' 미완료'}${c.reason?' · '+c.reason:''}`);}
 for(const m of record.missing||[])parts.push('남은 확인 · '+m.target+' — '+m.reason);
 if(record.scope?.limitations?.length)parts.push('지원 범위 안내 · '+record.scope.limitations.join(' / '));
 return parts.filter(Boolean).join('\n');
}
export function overdueCollection(record,now=Date.now()){
 // A due date is published only after checking the Korean holiday calendar.
 const due=Date.parse(record?.next_expected_at),calendarCheck=Date.parse(record?.schedule_verified_at);
 if(!Number.isFinite(due)||!Number.isFinite(calendarCheck)||calendarCheck>now+300000)return false;
 const date=new Date(due+9*3600000),weekday=date.getUTCDay();
 return weekday!==0&&weekday!==6&&now>due+30*60000;
}

