import {matchesTask} from './model.js';

export const TASK_FILTERS=[
 {id:'today',label:'오늘 챙길 일',short:'오늘',description:'오늘까지 기한·다음 확인일이 도래했거나 고정한 업무입니다. 미래 확인일로 미룬 업무는 제외합니다.'},
 {id:'all',label:'전체 업무',short:'전체',description:'완료·보관을 제외한 모든 업무입니다. 기한이 없거나 다음 확인일이 남은 업무도 포함합니다.'},
 {id:'review',label:'확인할 일',short:'확인',description:'새로 수집했거나 원본 변경으로 확인이 필요한 업무입니다.'},
 {id:'partial',label:'부분 완료',short:'부분 완료',description:'일부를 처리했고 남은 행동이 있는 업무입니다.'},
 {id:'done',label:'완료한 일',short:'완료',description:'전체 완료로 기록한 업무입니다. 메모와 처리 이력은 유지됩니다.'}
];
export const taskFilterCounts=tasks=>Object.fromEntries(TASK_FILTERS.map(f=>[f.id,tasks.filter(t=>matchesTask(t,f.id)).length]));
