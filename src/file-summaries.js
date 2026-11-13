// A summary is useful only for the exact source version that was read.
export function summaryForFile(file, summaries=[]){
 const row=summaries.find(s=>s.drive_id===file.drive_id&&s.item_id===file.item_id);
 if(!row)return {status:'pending',text:'본문 요약 없음',detail:'저장된 요약이 없습니다. 사용자 편집이 확인된 자료를 우선 선별하며 모든 파일을 요약하지는 않습니다.'};
 const source=Date.parse(file.modified_at_source),read=Date.parse(row.source_modified_at);
 if(!Number.isFinite(source)||source!==read)return {status:'stale',text:'현재 버전 요약 없음',detail:'이전 요약 이후 파일이 변경되었습니다. 필요한 자료로 선별되면 확인합니다.'};
 if(['ok','partial'].includes(row.status)&&row.summary?.trim())return {status:row.status,text:row.summary,detail:row.detail||'',checkedAt:row.checked_at};
 return {status:row.status==='unsupported'?'unsupported':'failed',text:row.status==='unsupported'?'본문을 읽을 수 없는 형식':'본문 요약 확인 실패',detail:row.detail||'필요한 자료로 선별되면 확인합니다.'};
}

