import {verifiedCompletion,collectionDetail,overdueCollection} from './collection-contract.js';
// Track the last observation of each source, independently of later partial feeds.
export const SOURCE_GROUPS = [
 {id:'dooray-mail',name:'두레이 메일',sources:['dooray-mail']},
 {id:'dooray-calendar',name:'두레이 캘린더',sources:['dooray-calendar']},
 {id:'dooray-favorites',name:'두레이 대화방',sources:['dooray-favorites']},
 {id:'google',name:'Google 캘린더',sources:['google-primary','google-secondary']},
 {id:'onedrive',name:'OneDrive 파일',sources:['onedrive-files']}
];
const stamp=x=>Number.isFinite(Date.parse(x))?Date.parse(x):0;
const observed=s=>['ok','partial','failed'].includes(s.status);
const resultTime=s=>stamp(s.checked_at)||stamp(s.runAt);
const latestResult=rows=>[...rows].sort((a,b)=>resultTime(b)-resultTime(a)||Number(observed(b))-Number(observed(a))||Number(Boolean(b.contract))-Number(Boolean(a.contract))||Number(Boolean(b.fileRun))-Number(Boolean(a.fileRun))||stamp(b.runAt)-stamp(a.runAt))[0];
export function sourceHealth(runs=[],fileRuns=[],{now=Date.now(),results=[]}={}){
 const entries=runs.flatMap(run=>(run.sources||[]).map(source=>({...source,runAt:run.generated_at})));
 return SOURCE_GROUPS.map(group=>{
  const records=group.sources.map(id=>{
   const history=[...entries.filter(s=>s.id===id),...results.filter(r=>r.source_id===id).map(r=>({...r,id,contract:true,runAt:r.checked_at})),...(id==='onedrive-files'?fileRuns.map(f=>({...f,id,name:group.name,runAt:f.checked_at,fileRun:true})):[])];
   const s=latestResult(history);
   const priorSuccess=results.find(r=>r.source_id===id)?.last_success_at;
   const lastSuccess=history.filter(x=>x.status==='ok'&&(!x.contract||verifiedCompletion(x))&&stamp(x.checked_at)&&stamp(x.checked_at)<=now+300000).sort((a,b)=>stamp(b.checked_at)-stamp(a.checked_at))[0]?.checked_at||priorSuccess||null;
   let status=['ok','partial','failed','not_checked'].includes(s?.status)?s.status:'not_checked';
   let label={ok:'수집 완료',partial:'수집 미완료',failed:'수집 실패',not_checked:'수집 기록 없음'}[status];
   let detail=s?.detail||'이 원본의 수집 기록을 아직 확인하지 못했습니다.';
   let delayed=false;
   if(s?.contract){
    detail=collectionDetail(s);
    if(status==='ok'&&!verifiedCompletion(s)){status='partial';label='수집 미완료';detail='완료를 검증할 근거가 부족합니다.\n'+detail;}
    delayed=overdueCollection(s,now);
    if(delayed&&status==='ok'){status='partial';label='갱신 지연';detail='정기 수집 예정 시각이 지나 이전 결과를 표시합니다.\n'+detail;}
   }else if(s){detail='이전 방식의 수집 기록입니다. 새 완료 기준의 단계별 검증은 다음 수집부터 기록합니다.\n'+detail;}
   if(status==='ok'&&(!stamp(s?.checked_at)||stamp(s.checked_at)>now+300000)){
    status='not_checked';label='시각 미확인';detail='실제 수집 시각을 확인하지 못했습니다. '+detail;
   }
   return {id,name:s?.name||(id==='google-primary'?'기본 캘린더':id==='google-secondary'?'보조 캘린더':group.name),status,label,detail,checkedAt:stamp(s?.checked_at)?s.checked_at:null,lastSuccess,delayed,nextExpectedAt:s?.next_expected_at||null};
  });
  const statuses=records.map(r=>r.status),all=statuses.every(s=>s==='ok');
  const status=all?'ok':statuses.includes('failed')?'failed':statuses.includes('partial')||statuses.includes('ok')?'partial':'not_checked';
  const label=records.some(r=>r.delayed)&&status==='partial'?'갱신 지연':status==='failed'&&records.length>1&&!statuses.every(s=>s==='failed')?'일부 실패':{ok:'수집 완료',partial:'수집 미완료',failed:'수집 실패',not_checked:'수집 기록 없음'}[status];
  const checkedAt=records.filter(r=>r.checkedAt).sort((a,b)=>stamp(b.checkedAt)-stamp(a.checkedAt))[0]?.checkedAt||null;
  return {...group,status,label,records,checkedAt,delayed:records.some(r=>r.delayed)};
 });
}
export function collectionSummary(groups,{error='',online=true,fileError='',collectionError=''}={}){
 if(error||fileError||collectionError||!online)return {status:'failed',label:'확인 불가'};
 const values=groups.map(g=>g.status);
 if(values.length&&values.every(s=>s==='ok'))return {status:'ok',label:'수집 완료'};
 if(values.includes('failed'))return {status:'failed',label:values.every(s=>s==='failed')?'수집 실패':'일부 실패'};
 if(groups.some(g=>g.delayed))return {status:'partial',label:'갱신 지연'};
 if(values.includes('partial')||values.includes('ok'))return {status:'partial',label:'수집 미완료'};
 return {status:'not_checked',label:'수집 기록 없음'};
}
