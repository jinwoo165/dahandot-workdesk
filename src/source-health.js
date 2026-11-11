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
const latestResult=rows=>[...rows].sort((a,b)=>resultTime(b)-resultTime(a)||Number(observed(b))-Number(observed(a))||Number(Boolean(b.fileRun))-Number(Boolean(a.fileRun))||stamp(b.runAt)-stamp(a.runAt))[0];
export function sourceHealth(runs=[],fileRuns=[],{now=Date.now(),fileError=''}={}){
 const entries=runs.flatMap(run=>(run.sources||[]).map(source=>({...source,runAt:run.generated_at})));
 return SOURCE_GROUPS.map(group=>{
  const records=group.sources.map(id=>{
   const history=[...entries.filter(s=>s.id===id),...(id==='onedrive-files'?fileRuns.map(f=>({...f,id,name:group.name,runAt:f.checked_at,fileRun:true})):[])];
   const s=latestResult(history);
   const lastSuccess=history.filter(x=>x.status==='ok'&&stamp(x.checked_at)&&stamp(x.checked_at)<=now+300000).sort((a,b)=>stamp(b.checked_at)-stamp(a.checked_at))[0]?.checked_at||null;
   let status=['ok','partial','failed','not_checked'].includes(s?.status)?s.status:'not_checked';
   let label={ok:'수집 완료',partial:'일부 수집',failed:'수집 실패',not_checked:'미조회'}[status];
   let detail=s?.detail||'이 원본의 수집 기록을 아직 확인하지 못했습니다.';
   if(status==='ok'&&(!stamp(s?.checked_at)||stamp(s.checked_at)>now+300000||now-stamp(s.checked_at)>36*3600000)){
    status='not_checked';label=stamp(s?.checked_at)?'이전 결과':'시각 미확인';detail='현재 상태는 재확인이 필요합니다. '+detail;
   }
   if(group.id==='onedrive'&&fileError){status='failed';label='확인 불가';detail=fileError+' 이전 수집 결과: '+detail;}
   return {id,name:s?.name||(id==='google-primary'?'기본 캘린더':id==='google-secondary'?'보조 캘린더':group.name),status,label,detail,checkedAt:stamp(s?.checked_at)?s.checked_at:null,lastSuccess};
  });
  const statuses=records.map(r=>r.status),all=statuses.every(s=>s==='ok');
  const status=all?'ok':statuses.includes('failed')?'failed':statuses.includes('partial')||statuses.includes('ok')?'partial':'not_checked';
  const label=status==='failed'&&records.length>1&&!statuses.every(s=>s==='failed')?'일부 실패':{ok:'수집 완료',partial:'일부 수집',failed:'수집 실패',not_checked:records.some(r=>r.label==='이전 결과')?'이전 결과':'미조회'}[status];
  const checkedAt=records.filter(r=>r.checkedAt).sort((a,b)=>stamp(b.checkedAt)-stamp(a.checkedAt))[0]?.checkedAt||null;
  return {...group,status,label,records,checkedAt};
 });
}
export function collectionSummary(groups,{error='',online=true}={}){
 if(error||!online)return {status:'failed',label:'확인 불가'};
 const values=groups.map(g=>g.status);
 if(values.length&&values.every(s=>s==='ok'))return {status:'ok',label:'수집 완료'};
 if(values.includes('failed'))return {status:'failed',label:values.every(s=>s==='failed')?'수집 실패':'일부 실패'};
 if(values.includes('partial')||values.includes('ok'))return {status:'partial',label:'일부 수집'};
 return {status:'not_checked',label:'확인 대기'};
}
