import {createClient} from '@supabase/supabase-js';
import {SUPABASE_URL,SUPABASE_KEY,LOGIN_CONFIGURED} from './config.js';
import {statuses,day,addDays,monthBounds,kstTime,escapeHTML as esc,safeURL,needsAttention,matchesTask,eventOnDay,currentBriefing,dateLabel,upcomingEvents} from './model.js';
import {messageStatuses,validateMessage,messagesForTarget,mergeCalendarOverrides,mergeSavedMessages,persistConversation} from './conversations.js';
import {conversationBadge,conversationPreview,conversationThread} from './conversation-ui.js';
import {WEATHER_CITIES,weatherPageIndex,degrees,weatherDescription,fetchWeather,RECENT_FILES_LIMIT,fileKind} from './widgets.js';
import {sourceHealth,collectionSummary} from './source-health.js';
import {summaryForFile} from './file-summaries.js';
import {TASK_FILTERS,taskFilterCounts} from './task-filters.js';
import {historyForMonth} from './history.js';
import {connectionFetch,createSessionCheck,withDeadline} from './connection.js';
import {authenticationMessage,authDeadline,passwordActions,mountLogin,loginShell,passwordFormHTML,bindPasswordForm,recoveryFromURL,authDestination} from './authentication.js';
import {linkedText,sourceReferencesHTML,taskDetailContent,eventDetailContent} from './task-details.js';
import {normalizeBriefingLine,briefingItems,briefingListHTML} from './briefing.js';
import {itemVisibilityKey,hiddenItems,visibleFiles,visibleAgenda} from './item-visibility.js';
import {searchWorkdesk,highlightSearch,latestSearchFiles,searchFileKey} from './search.js';
import sceneryURL from './assets/city-panorama-ai.webp';
import './style.css';
const APP_VERSION='2.11.0';
const demo=new URLSearchParams(location.search).get('demo')==='1';
let recoveryPending=recoveryFromURL(location.hash);
const db=createClient(SUPABASE_URL,SUPABASE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true},global:{fetch:connectionFetch(fetch)}});
const authActions=passwordActions(db.auth,location.origin+location.pathname);
const $=s=>document.querySelector(s), app=$('#app');
const state={user:null,workspace:null,tasks:[],events:[],runs:[],links:[],history:[],messages:[],overrides:[],sourceEvents:[],files:[],fileRuns:[],fileError:'',fileSummaries:[],summaryError:'',collectionResults:[],collectionError:'',updateAvailable:null,sourceSelected:null,rail:'files',mobilePanel:'work',calendarPane:'month',calendarScope:'day',historyMonth:'',historyError:'',historyLoading:false,weather:{},weatherErrors:{},weatherBusy:false,weatherPage:0,view:'work',taskFilter:'today',showRemovedLinks:false,linkBusy:false,briefingDismissals:[],briefingError:'',briefingBusy:false,showHiddenBriefing:false,itemVisibility:[],itemVisibilityError:'',itemVisibilityBusy:false,showHiddenAgenda:false,showHiddenFiles:false,query:'',searchText:'',searchFiles:[],searchFilesLoaded:false,searchFilesLoading:false,searchFilesError:'',month:day().slice(0,7),selected:day(),synced:null,realtime:false,error:'',loading:false};
const views={
 conversation:['다한닷과 대화','진척과 생각을 편하게 남기세요.\n필요한 정리는\n다한닷이 이어갑니다.','◌'],
 work:['업무 목록','오늘 챙길 일부터 완료 기록까지,\n한곳에서 확인하세요.','☷'],
 calendar:['달력 · 업무 이력','날짜별 일정과 월별 변경 기록을\n함께 확인하세요.','▦'],
 links:['업무 바로가기','업무 갱신 때 확인한\n유용한 원문과 자료를 모읍니다.','↗'],
 archived:['보관한 업무','일반 목록에서\n잠시 치워 둔 업무입니다.\n기록은 남아 있습니다.','▱']
};
const CLOVA_URL='https://clovanote.worksmobile.com/';
let theme;try{theme=localStorage.getItem('dahandot-theme');}catch{}
if(!['light','dark'].includes(theme))theme=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';
document.documentElement.dataset.theme=theme;
let weatherAttempt=0,searchComposing=false,searchRequest=0;
let sceneryPaused=matchMedia('(prefers-reduced-motion: reduce)').matches;
try{sceneryPaused=sceneryPaused||localStorage.getItem('dahandot-scenery-paused')==='true';}catch{}
const infoContent=new Map(),listScrollPositions=new Map();
function scrollList(items,key,itemHTML,emptyText='표시할 항목이 없습니다.'){
 const label={tasks:state.view==='archived'?'보관한 업무':'업무 목록',agenda:'다가오는 일정',files:'OneDrive 최근 자료','files-hidden':'숨긴 최근 자료','agenda-hidden':'숨긴 일정',history:'월별 변경 기록',day:'선택일 기록',messages:'나눈 이야기',links:state.showRemovedLinks?'삭제한 바로가기':'업무 바로가기'}[key]||'목록';
 const context=key==='tasks'?[state.view,state.taskFilter]:key==='day'?[state.selected]:key==='history'?[state.month]:key==='links'?[state.showRemovedLinks]:[];
 const scrollKey=JSON.stringify([key,...context]);
 return `<div class="panel-scroll" data-scroll-key="${esc(scrollKey)}" tabindex="0" role="region" aria-label="${esc(label)} 스크롤">${items.map(itemHTML).join('')||empty(esc(emptyText))}</div><div class="list-count">${items.length}건${items.length?' · 목록 안에서 스크롤':''}</div>`;
}
function infoButton(key,title,body,label='자세히 보기'){infoContent.set(key,{title,body});return `<button class="text-btn" data-info="${esc(key)}">${esc(label)} →</button>`;}
function showInfo(key){const info=infoContent.get(key);if(!info)return;$('#historyDetail').innerHTML=`<div class="dialog-head"><h2>${esc(info.title)}</h2><button class="icon-btn" id="closeHistory" aria-label="닫기">×</button></div><div class="dialog-body info-body">${esc(info.body)}</div>`;$('#closeHistory').onclick=()=>$('#historyDetail').close();$('#historyDetail').showModal();}

let sessionCheck,loginScreen;
let channel,loadSeq=0,toastTimer,reloadTimer,searchTimer,starting=false,editTask=null,detailHistory=[];
let conversationTarget={task_id:null,event_id:null};
const drafts=new Map();
const targetKey=t=>t.task_id?'task:'+t.task_id:t.event_id?'event:'+t.event_id:'general';
const statusBadge=s=>`<span class="badge ${esc(s)}">${esc(statuses[s]||s)}</span>`;
const empty=(s)=>`<div class="empty"><span class="large">◌</span>${s}</div>`;
const link=(url,label,cls='')=>safeURL(url)?`<a class="${cls}" href="${esc(safeURL(url))}" target="_blank" rel="noopener noreferrer">${esc(label)} ↗</a>`:`<span class="muted">${esc(label)} · 직접 링크 미확인</span>`;
const options=(values,current)=>Object.entries(values).map(([v,l])=>`<option value="${esc(v)}" ${v===current?'selected':''}>${esc(l)}</option>`).join('');
async function loadFiles(){try{const [files,runs]=await Promise.all([rows('file_changes',q=>q.eq('workspace_id',state.workspace.id).gte('changed_at',addDays(day(),-6)+'T00:00:00+09:00').order('changed_at',{ascending:false}).order('id',{ascending:false})),withDeadline(db.from('file_sync_runs').select('*').eq('workspace_id',state.workspace.id).order('checked_at',{ascending:false}).limit(5))]);if(runs.error)throw runs.error;state.files=files;state.fileRuns=runs.data;state.fileError='';}catch{state.fileError='최근 파일 확인에 연결하지 못했습니다. 이전 목록을 유지합니다.';}}
async function loadSearchFiles(){
 if(!state.workspace||state.searchFilesLoading||state.searchFilesLoaded)return;
 if(demo){state.searchFiles=[...state.files];state.searchFilesLoaded=true;return;}
 const workspace=state.workspace.id,request=++searchRequest;
 state.searchFilesLoading=true;state.searchFilesError='';render();
 try{
  const files=await rows('file_changes',q=>q.eq('workspace_id',workspace).order('changed_at',{ascending:false}).order('id',{ascending:false}));
  if(request!==searchRequest||state.workspace?.id!==workspace)return;
  state.searchFiles=files;state.searchFilesLoaded=true;
 }catch{
  if(request===searchRequest&&state.workspace?.id===workspace)state.searchFilesError='저장된 전체 자료를 불러오지 못했습니다. 현재 읽은 자료만 검색합니다.';
 }finally{
  if(request===searchRequest&&state.workspace?.id===workspace){state.searchFilesLoading=false;render();}
 }
}
const allSearchFiles=()=>latestSearchFiles([...state.files,...state.searchFiles]);
function commitSearch(){
 clearTimeout(searchTimer);state.query=state.searchText.trim();render();
 if(state.query)void loadSearchFiles();
}
function searchResultHTML(item){
 const action=item.kind==='link'?`href="${esc(item.url)}" target="_blank" rel="noopener noreferrer"`:`data-${item.kind==='file'?'search-file':item.kind}="${esc(item.id)}"`;
 const tag=item.kind==='link'?(item.url?'a':'div'):'button';
 return `<article class="search-result"><div class="search-result-meta">${item.badges.map(badge=>`<span class="badge">${highlightSearch(badge,state.query)}</span>`).join('')}${item.meta?`<small>${esc(item.meta)}</small>`:''}</div><${tag} class="search-result-open" ${tag==='button'?'type="button" ':''}${tag==='div'?'':action}><strong>${item.kind==='task'?conversationBadge(state.messages,{task_id:item.id}):item.kind==='event'?conversationBadge(state.messages,{event_id:item.id}):''} ${highlightSearch(item.title,state.query)}<span aria-hidden="true"> ${item.kind==='link'?'↗':'→'}</span></strong>${item.excerpts.map(excerpt=>`<p><span class="search-field">${esc(excerpt.label)}</span>${highlightSearch(excerpt.text,state.query)}</p>`).join('')}${!item.excerpts.length?'<p class="muted">저장된 추가 내용이 없습니다.</p>':''}</${tag}></article>`;
}
function searchView(){
 const groups=searchWorkdesk({...state,files:allSearchFiles()},state.query),total=groups.reduce((n,group)=>n+group.items.length,0);
 const warnings=[state.searchFilesError,state.summaryError,state.itemVisibilityError].filter(Boolean);
 return `<section class="panel paged-panel unified-search-panel" aria-label="통합 검색 결과"><div class="panel-head"><div><h2>검색 결과 <span class="search-total" role="status" aria-live="polite">${total}건</span></h2><small>저장된 제목·메모·요약·대화를 검색합니다.</small></div><button class="text-btn" data-search-clear>검색 닫기 ×</button></div><div class="search-scope"><span>“${esc(state.query)}”</span><small>완료·보관·숨김 포함 · 자료는 저장된 전체 목록</small></div>${state.searchFilesLoading?'<p class="widget-alert" role="status">저장된 자료를 불러오는 중입니다…</p>':''}${warnings.length?`<p class="widget-alert" role="status">${warnings.map(esc).join(' ')}${state.searchFilesError?'<button class="text-btn" data-search-retry>다시 확인</button>':''}</p>`:''}<div class="panel-scroll search-results" data-scroll-key="${esc(JSON.stringify(['search',state.query]))}" tabindex="0" role="region" aria-label="통합 검색 결과 스크롤">${groups.length?groups.map(group=>`<section class="search-group" aria-labelledby="search-group-${group.id}"><h3 id="search-group-${group.id}">${group.label}<span>${group.items.length}</span></h3><div class="search-result-grid">${group.items.map(searchResultHTML).join('')}</div></section>`).join(''):empty(state.searchFilesLoading?'다른 자료를 확인하고 있습니다.':'일치하는 내용이 없습니다. 다른 단어로 검색해 보세요.')}</div><div class="list-count">${total}건 · 결과를 누르면 내용이 열립니다.</div></section>`;
}
function openSearchFile(key){
 const file=allSearchFiles().find(file=>searchFileKey(file)===key);if(!file)return;
 const summary=summaryForFile(file,state.fileSummaries),valid=['ok','partial'].includes(summary.status);
 $('#historyDetail').innerHTML=`<div class="dialog-head"><h2>자료 내용</h2><button class="icon-btn" id="closeHistory" aria-label="닫기">×</button></div><div class="dialog-body"><h2 class="task-detail-title">${esc(file.name)}</h2><dl class="task-detail-meta"><div><dt>폴더</dt><dd>${esc(file.folder_path||'미확인')}</dd></div><div><dt>원본 수정</dt><dd>${esc(kstTime(file.modified_at_source))}</dd></div></dl><section class="task-detail-section"><h3>${valid?(summary.status==='partial'?'일부 본문 요약':'본문 요약'):'요약 상태'}</h3><div class="linked-copy">${linkedText(summary.text)}</div>${summary.detail?`<p class="task-source-help linked-copy">${linkedText(summary.detail)}</p>`:''}${valid?`<small class="muted">본문 확인 ${esc(kstTime(summary.checkedAt))}</small>`:''}</section><section class="task-detail-section"><h3>원문</h3>${link(file.web_url,'OneDrive에서 열기')}</section></div>`;
 $('#closeHistory').onclick=()=>$('#historyDetail').close();$('#historyDetail').showModal();
}
function bindGlobalSearch(){
 const input=$('#globalSearch');
 const clear=()=>{state.searchText='';searchComposing=false;commitSearch();$('#globalSearch')?.focus({preventScroll:true});};
 input.oninput=e=>{state.searchText=input.value;clearTimeout(searchTimer);if(!e.isComposing&&!searchComposing)searchTimer=setTimeout(commitSearch,220);};
 input.oncompositionstart=()=>{searchComposing=true;clearTimeout(searchTimer);};
 input.oncompositionend=()=>{searchComposing=false;state.searchText=input.value;clearTimeout(searchTimer);searchTimer=setTimeout(commitSearch,220);};
 input.onkeydown=e=>{if(e.isComposing||searchComposing)return;if(e.key==='Escape'){e.preventDefault();clear();}};
 $('#globalSearchForm').onsubmit=e=>{e.preventDefault();if(!searchComposing)commitSearch();};
 app.querySelectorAll('[data-search-clear]').forEach(button=>button.onclick=clear);
 app.querySelectorAll('[data-search-file]').forEach(button=>button.onclick=()=>openSearchFile(button.dataset.searchFile));
 app.querySelectorAll('[data-search-retry]').forEach(button=>button.onclick=()=>loadSearchFiles());
}
function weatherWidget(){
 const page=weatherPageIndex(state.weatherPage),city=WEATHER_CITIES[page];
 const cached=state.weather[city.id],w=cached?.days?.[0]?.date===day()?cached:null,error=state.weatherErrors[city.id];
 const header=`<div class="weather-heading"><span>${city.name} 날씨</span><div class="weather-page-controls" aria-label="날씨 페이지 선택"><button data-weather-step="-1" aria-label="이전 지역 날씨" title="${page?WEATHER_CITIES[page-1].name:'첫 페이지'}" ${page===0?'disabled':''}>‹</button><small aria-live="polite">${page+1} / ${WEATHER_CITIES.length}</small><button data-weather-step="1" aria-label="다음 지역 날씨" title="${page<WEATHER_CITIES.length-1?WEATHER_CITIES[page+1].name:'마지막 페이지'}" ${page===WEATHER_CITIES.length-1?'disabled':''}>›</button></div></div>`;
 let body;
 if(!w)body=`<div class="weather-empty">${error?'날씨를 불러오지 못했습니다.':'오늘·내일 예보를 확인하고 있습니다…'}${error?'<button class="text-btn" data-weather-retry>다시 확인</button>':''}</div>`;
 else{
  const today=w.days[0],tomorrow=w.days[1],now=weatherDescription(w.current?.code??today.code,w.current?.isDay??true),next=weatherDescription(tomorrow.code);
  body=`<div class="weather-content"><div class="weather-now"><span class="weather-symbol" aria-hidden="true">${now.icon}</span><div><strong>${degrees(w.current?.temperature)}</strong><span>오늘 · ${now.label}</span></div><div class="weather-range"><span>최고 ${degrees(today.max)}</span><span>최저 ${degrees(today.min)}</span></div></div><div class="weather-tomorrow"><span><span aria-hidden="true">${next.icon}</span> 내일 · ${next.label}</span><b>${degrees(tomorrow.min)} / ${degrees(tomorrow.max)}</b><small>강수 ${tomorrow.rain===null?'—':Math.round(tomorrow.rain)+'%'}</small></div></div><div class="weather-credit"><span>${error?'이전 예보':kstTime(w.fetchedAt)}</span><a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer">Open-Meteo ↗</a></div>`;
 }
 return `<section class="weather-page" tabindex="0" aria-label="${city.name} 날씨 · ${page+1}/${WEATHER_CITIES.length} 페이지">${header}${body}</section>`;
}
function changeWeatherPage(step){
 const next=weatherPageIndex(state.weatherPage,step);if(next===state.weatherPage)return;
 state.weatherPage=next;const widget=$('#weatherWidget');if(widget){widget.innerHTML=weatherWidget();bindWeather();widget.querySelector('.weather-page')?.focus({preventScroll:true});}
}
function bindWeather(){
 document.querySelectorAll('[data-weather-retry]').forEach(b=>b.onclick=()=>updateWeather(true));
 document.querySelectorAll('[data-weather-step]').forEach(b=>b.onclick=()=>changeWeatherPage(Number(b.dataset.weatherStep)));
 const page=$('#weatherWidget .weather-page');if(!page)return;
 page.onkeydown=e=>{if(['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();changeWeatherPage(e.key==='ArrowLeft'?-1:1);}};
 let start=null;
 page.onpointerdown=e=>{if(e.isPrimary&&e.button===0&&!e.target.closest('button,a'))start={x:e.clientX,y:e.clientY};};
 page.onpointercancel=()=>{start=null;};
 page.onpointerup=e=>{if(!start)return;const dx=e.clientX-start.x,dy=e.clientY-start.y;start=null;if(Math.abs(dx)>45&&Math.abs(dx)>Math.abs(dy)*1.3)changeWeatherPage(dx<0?1:-1);};
}
async function updateWeather(force=false){
 const dateChanged=Object.values(state.weather).some(w=>w.days[0].date!==day());
 if(!state.workspace||state.weatherBusy||(!force&&!dateChanged&&Date.now()-weatherAttempt<1800000))return;
 weatherAttempt=Date.now();state.weatherBusy=true;
 const results=await Promise.allSettled(WEATHER_CITIES.map(c=>fetchWeather(fetch,new Date(),c.id)));
 results.forEach((r,i)=>{const id=WEATHER_CITIES[i].id;if(r.status==='fulfilled'){state.weather[id]=r.value;delete state.weatherErrors[id];}else state.weatherErrors[id]=r.reason?.message||'연결 실패';});
 state.weatherBusy=false;const widget=$('#weatherWidget');if(widget){widget.innerHTML=weatherWidget();bindWeather();}
}
async function loadItemVisibility(){
 try{state.itemVisibility=await rows('workdesk_item_visibility',q=>q.eq('workspace_id',state.workspace.id).order('kind').order('drive_id').order('item_id'));state.itemVisibilityError='';}
 catch{state.itemVisibilityError='숨김 설정을 불러오지 못했습니다. 새로고침 후 다시 확인하세요.';}
}
async function loadBriefingDismissals(){
 try{state.briefingDismissals=await rows('briefing_dismissals',q=>q.eq('workspace_id',state.workspace.id).order('line_key'));state.briefingError='';}
 catch{state.briefingError='숨김 설정을 불러오지 못했습니다. 새로고침 후 다시 확인하세요.';}
}
async function loadCollectionResults(){
 try{state.collectionResults=await rows('source_collection_results',q=>q.eq('workspace_id',state.workspace.id));state.collectionError='';}
 catch{state.collectionError='수집 완료 검증 기록을 불러오지 못했습니다. 이전 결과를 표시합니다.';}
}
async function loadFileSummaries(){
 try{state.fileSummaries=await rows('file_summaries',q=>q.eq('workspace_id',state.workspace.id).order('item_id'));state.summaryError='';}
 catch{state.summaryError='본문 요약을 불러오지 못해 이전 결과를 표시합니다.';}
}
function fileEntry(f){
 const url=safeURL(f.web_url),summary=summaryForFile(f,state.fileSummaries);
 const label=summary.status==='ok'?'본문 요약':summary.status==='partial'?'일부 본문 요약':'';
 const body=`<span class="file-icon ${fileKind(f.name).toLowerCase()}">${fileKind(f.name)}</span><span class="file-info"><strong title="${esc(f.name)}">${esc(f.name)}</strong><span class="file-meta"><b class="${f.change_kind==='created'?'file-new':''}">${f.change_kind==='created'?'신규':'수정'}</b> ${kstTime(f.changed_at)}${url?' ↗':''}</span><span class="file-summary ${label?'has-summary':'summary-pending'}" title="${esc(summary.detail)}">${label?`<em>${label}</em>`:''}${esc(summary.text)}</span><small title="${esc(f.folder_path)}">${esc(f.folder_path.split('/').filter(Boolean).slice(-2).join(' / '))}</small></span>`;
 return `<article class="file-card">${itemHideButton('file',f.drive_id,f.item_id,f.name)}${url?`<a class="file-entry" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${body}</a>`:`<div class="file-entry">${body}</div>`}${label?infoButton('file-summary:'+f.item_id,f.name,summary.text+'\n\n'+summary.detail+'\n본문 확인 '+kstTime(summary.checkedAt),'요약 전체'):''}</article>`;
}
function filesWidget(){
 const files=visibleFiles(state.files,state.itemVisibility),hidden=hiddenItems(state.itemVisibility,'file'),showHidden=state.showHiddenFiles,run=state.fileRuns[0],bad=state.fileError||run?.status==='failed';
 const count=files.filter(f=>['ok','partial'].includes(summaryForFile(f,state.fileSummaries).status)).length;
 return `<section class="panel files-panel paged-panel" aria-label="OneDrive 최근 자료"><div class="panel-head"><div><h2>${showHidden?'숨긴 최근 자료':'OneDrive 최근 자료'}</h2><small>${showHidden?`숨긴 자료 ${hidden.length}개`:`최근 7일 · 파일 ${files.length}개 (최대 ${RECENT_FILES_LIMIT}개)<small class="summary-progress">본문 요약 ${count}개 · 미요약 ${files.length-count}개</small>`}</small></div><span class="cloud-mark" aria-hidden="true">☁</span></div>${bad?`<p class="widget-alert">${esc(state.fileError||'최근 조회 실패 · 이전 목록입니다.')}</p>`:''}${state.summaryError?`<p class="widget-alert">${esc(state.summaryError)}</p>`:''}${visibilityErrorHTML()}${showHidden?`<p class="visibility-hint">복원한 자료는 최근 7일의 최신 30개에 해당할 때 표시됩니다.</p>${scrollList(hidden,'files-hidden',hiddenItemHTML,'숨긴 자료가 없습니다.')}`:scrollList(files,'files',fileEntry,run&&run.status!=='failed'?'표시할 최근 자료가 없습니다.':'아직 확인된 파일이 없습니다.')}<div class="file-check"><span>${run?'확인 '+kstTime(run.checked_at):'조회 대기'}${run?.status==='partial'?' · 검색 범위 안내':''}</span><div class="panel-corner-tools">${infoButton('file-scope','OneDrive 확인 범위',(run?.detail||'다음 업무보드 원본 조회 때 OneDrive 변경 목록을 수집합니다.')+`\n\n최근 7일의 파일별 최신 변경 중 숨긴 자료를 제외하고 최신 ${RECENT_FILES_LIMIT}개까지 표시합니다. 기존 변경 이력과 원본 파일은 보존합니다.`+'\n\n요약은 실제 읽은 본문의 요지입니다. 파일이 수정되면 다시 확인하기 전까지 이전 요약을 표시하지 않습니다. 읽지 않은 파일은 요약 대기로 구분합니다.\n파일별 최신 생성·변경을 표시하며 삭제·모든 중간 저장을 추적하는 감사 로그는 아닙니다.','범위')}<button class="text-btn" data-hidden-list="file" aria-expanded="${showHidden}">${showHidden?'최근 자료로':'숨긴 항목 '+hidden.length}</button></div></div></section>`;
}

function toast(s){$('#toast').textContent=s;$('#toast').className='show';clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').className='',4500);}
function errorMessage(e){const s=e.message||String(e);return /Failed to fetch|fetch failed|NetworkError/.test(s)?'연결되지 않아 저장하지 못했습니다. 입력 내용은 이 창에 남아 있습니다. 인터넷 연결 후 다시 저장하세요.':s;}
async function rows(table,configure=q=>q){let result=[];for(let from=0;;from+=1000){const {data,error}=await withDeadline(configure(db.from(table).select('*')).range(from,from+999));if(error)throw error;result.push(...data);if(data.length<1000)return result;}}
let historyRequest=0;
async function loadHistory(){
 const month=state.month,request=++historyRequest;
 if(demo){state.historyMonth=month;state.historyError='';return;}
 const [start,end]=monthBounds(month);state.historyLoading=true;
 try{
  const history=await rows('task_history',q=>q.eq('workspace_id',state.workspace.id).gte('occurred_at',start+'T00:00:00+09:00').lt('occurred_at',end+'T00:00:00+09:00').order('occurred_at',{ascending:false}).order('id',{ascending:false}));
  if(request===historyRequest&&state.month===month){state.history=history;state.historyMonth=month;state.historyError='';}
 }catch(error){if(request===historyRequest&&state.month===month)state.historyError='이달의 변경 기록을 읽지 못했습니다. 새로고침 후 다시 확인하세요.';throw error;}
 finally{if(request===historyRequest)state.historyLoading=false;}
}
async function refresh(silent=false){if(!state.workspace||state.loading)return;state.loading=true;const seq=++loadSeq;try{
 if(!demo){const [tasks,events,runs,links,messages,overrides]=await Promise.all([rows('tasks',q=>q.eq('workspace_id',state.workspace.id).order('id')),rows('calendar_events',q=>q.eq('workspace_id',state.workspace.id).order('start_at')),withDeadline(db.from('sync_runs').select('*').eq('workspace_id',state.workspace.id).order('generated_at',{ascending:false}).limit(20)),rows('workspace_links',q=>q.eq('workspace_id',state.workspace.id).order('sort_order')),rows('workdesk_messages',q=>q.eq('workspace_id',state.workspace.id).order('created_at').order('id')),rows('calendar_overrides',q=>q.eq('workspace_id',state.workspace.id).order('event_id'))]);if(runs.error)throw runs.error;if(seq!==loadSeq)return;Object.assign(state,{tasks,sourceEvents:events,events:mergeCalendarOverrides(events,overrides),runs:runs.data,links,messages:mergeSavedMessages(state.messages,messages),overrides});await Promise.all([loadHistory(),loadFiles(),loadFileSummaries(),loadCollectionResults(),loadBriefingDismissals(),loadItemVisibility()]);state.searchFilesLoaded=false;if(state.query)void loadSearchFiles();}
 state.synced=new Date().toISOString();state.error='';render();refreshItemDetail();refreshConversation();void updateWeather();if(!silent)toast(demo?'공개용 업무 화면을 갱신했습니다.':'저장된 최신 상태를 불러왔습니다.');
 }catch(e){state.error=errorMessage(e);render();}finally{state.loading=false;}}
function subscribe(){if(demo)return;channel=db.channel('workdesk:'+state.workspace.id);for(const table of ['tasks','task_history','calendar_events','sync_runs','workdesk_messages','calendar_overrides','file_changes','file_sync_runs','file_summaries','workspace_links','source_collection_results','briefing_dismissals','workdesk_item_visibility'])channel.on('postgres_changes',{event:'*',schema:'public',table,filter:'workspace_id=eq.'+state.workspace.id},()=>{clearTimeout(reloadTimer);reloadTimer=setTimeout(()=>refresh(true),250);});channel.subscribe(status=>{state.realtime=status==='SUBSCRIBED';const n=$('#liveStatus');if(n)n.innerHTML=syncLabel();});}
const syncLabel=()=>`${state.realtime?'<i class="sync-dot"></i>보드 실시간 연결':'<i class="sync-dot warn"></i>보드 주기적 동기화'}<br><small>화면 확인 ${kstTime(state.synced)}</small>`;
function loginFeedback(message='',retry=false){loginScreen?.feedback(message,retry);}
function connectionMessage(error,service='login'){
 if(service==='workspace')return '로그인은 확인했지만 업무 저장소의 응답을 받지 못했습니다. 연결 다시 확인을 눌러주세요. 기존 업무와 메모는 그대로 보관되어 있습니다.';
 return authenticationMessage(error,'session');
}
function login(message=''){
 if($('#loginForm')){if(message)loginScreen?.feedback(message,true,true);return;}
 if(!LOGIN_CONFIGURED&&!message)message='첫 로그인 연결 설정을 마무리하고 있습니다. 설정 완료 후 접속할 수 있습니다.';
 loginScreen=mountLogin(app,{actions:authActions,configured:LOGIN_CONFIGURED,message,onSession:session=>sessionCheck.accept(session),onRetry:()=>void sessionCheck?.check()});
}
function showPasswordSetup(recoveryUser=null){
 if(demo){toast('데모에서는 비밀번호를 변경하지 않습니다.');return;}
 const user=recoveryUser||state.user;if(!user){login();return;}
 if($('#passwordForm')&&($('#detail').open||app.contains($('#passwordForm'))))return;
 const recovery=Boolean(recoveryUser),root=recovery?app:$('#detail');
 const body=passwordFormHTML(user.email||'');
 root.innerHTML=recovery?loginShell(body):`<div class="dialog-body password-dialog">${body}</div>`;
 if(!recovery){root.addEventListener('close',()=>root.querySelector('#passwordForm')?.reset(),{once:true});root.showModal();}
 const leave=()=>{recoveryPending=false;if(recovery){if(state.workspace)render();else void start(user);}else root.close();};
 bindPasswordForm(root,{actions:authActions,onCancel:leave,onSaved:()=>{leave();toast('비밀번호를 저장했습니다. 다음부터 이메일과 비밀번호로 로그인하세요.');}});
}
async function start(user){
 state.user=user;if(recoveryPending){showPasswordSetup(user);return;}
 if(state.workspace||starting)return;starting=true;
 loginFeedback('로그인을 확인했습니다. 저장된 업무보드를 불러오고 있습니다…');
 try{
  const {data,error}=await withDeadline(db.from('workspaces').select('*'));if(error)throw error;
  if(!data.length){login('이 계정에 연결된 업무보드가 없습니다. 등록된 이메일로 로그인하세요.');return;}
  state.workspace=data[0];await refresh(true);subscribe();
 }catch(error){login(connectionMessage(error,'workspace'));}
 finally{starting=false;}
}

function taskCard(t){const pending=messagesForTarget(state.messages,{task_id:t.id}).filter(m=>m.resolution_status==='pending').length;return `<article class="task-card"><span class="task-state-dot ${t.status==='done'?'done':''}" aria-hidden="true">${t.status==='done'?'✓':t.status==='partial'?'◐':'◌'}</span><button class="task-open" data-task="${esc(t.id)}"><div class="task-title">${conversationBadge(state.messages,{task_id:t.id})} ${esc(t.title)}</div><div class="task-meta">${statusBadge(t.status)}${pending?`<span class="badge review">대화 확인 대기 ${pending}</span>`:''}${t.pending_review?'<span class="badge review">원본 변경</span>':''}<span>${esc(t.project)}</span>${t.due_date?`<span>마감 ${dateLabel(t.due_date)}</span>`:''}${t.next_review_on?`<span>다음 확인 ${dateLabel(t.next_review_on)}</span>`:''}</div>${t.remaining_action&&t.status!=='done'?`<p class="task-note remaining">남은 일 · ${esc(t.remaining_action)}</p>`:t.next_action&&t.status!=='done'?`<p class="task-note">${esc(t.next_action)}</p>`:''}${t.note?`<p class="task-note">${esc(t.note.slice(0,110))}${t.note.length>110?'…':''}</p>`:''}</button><span class="chevron">›</span></article>`;}
function agenda(events,{hideable=false}={}){return events.filter(e=>!e.excluded).map(e=>`<div class="agenda-item ${hideable?'agenda-removable':''}">${hideable?itemHideButton('agenda','',e.id,e.title):''}<small>${e.all_day?`${dateLabel(e.start_at)} · 종일`:kstTime(e.start_at)}${e.personal_changed?' · 내 일정 조정':''}${e.status==='tentative'?' · 참석 확인 필요':''}</small><button type="button" class="agenda-open" data-event="${esc(e.id)}"><strong>${conversationBadge(state.messages,{event_id:e.id})} ${esc(e.title)}</strong></button>${link(e.url,'일정 원문')}<p class="muted">${esc(e.personal_note||e.note||'')}</p><button class="text-btn event-converse" data-event="${esc(e.id)}">이 업무에 대해 이야기하기 →</button></div>`).join('')||empty('등록된 일정이 없습니다.');}
function historyList(items){return `<div class="timeline">${items.map(h=>`<div class="timeline-item"><button data-history="${esc(h.id)}"><small>${kstTime(h.occurred_at)} · ${esc(h.actor)} · ${esc(h.action)}</small><strong>${conversationBadge(state.messages,{task_id:h.task_id})} ${esc(h.after_data.title)}</strong><p>${h.before_data?`${esc(statuses[h.before_data.status])} → `:''}${esc(statuses[h.after_data.status])}${h.after_data.note?` · ${esc(h.after_data.note.slice(0,130))}`:''}</p></button></div>`).join('')}</div>`;}
function calendarView(){
 const start=state.month+'-01',offset=new Date(start+'T00:00:00Z').getUTCDay(),first=addDays(start,-offset),monthHistory=historyForMonth(state.history,state.month),monthly=state.calendarScope==='history',monthLabel=state.month.replace('-','년 ')+'월';
 const cells=Array.from({length:42},(_,i)=>{const d=addDays(first,i),count=state.tasks.filter(t=>!t.archived&&(t.due_date===d||t.next_review_on===d)).length,activity=monthHistory.filter(h=>day(h.occurred_at)===d).length+state.messages.filter(m=>day(m.created_at)===d).length,events=state.events.filter(e=>eventOnDay(e,d)).length;return `<button class="day ${d.slice(0,7)!==state.month?'outside':''} ${d===state.selected?'selected':''} ${d===day()?'today':''}" data-day="${d}" aria-label="${dateLabel(d)} 업무 ${count}건 일정 ${events}건 기록 ${activity}건"><b>${+d.slice(8)}</b><span class="day-count">${count?`업 ${count} `:''}${events?`일 ${events}`:''}${activity?`<br>기록 ${activity}`:''}</span></button>`;}).join('');
 const records=[...state.events.filter(e=>eventOnDay(e,state.selected)).map(data=>({kind:'event',data})),...state.tasks.filter(t=>!t.archived&&(t.due_date===state.selected||t.next_review_on===state.selected)).map(data=>({kind:'task',data})),...monthHistory.filter(h=>day(h.occurred_at)===state.selected).map(data=>({kind:'history',data})),...state.messages.filter(m=>day(m.created_at)===state.selected).map(data=>({kind:'message',data}))];
 const unavailable=state.historyLoading&&!demo?'이달의 기록을 불러오고 있습니다…':state.historyError;
 const content=monthly?(unavailable?`<div class="empty" role="status">${esc(unavailable)}</div>`:scrollList(monthHistory,'history',h=>historyList([h]),'이달에 저장된 변경 기록이 없습니다.')):scrollList(records,'day',r=>r.kind==='event'?agenda([r.data]):r.kind==='task'?taskCard(r.data):r.kind==='history'?historyList([r.data]):messageCard(r.data),'이날의 업무·일정·처리 기록이 없습니다.');
 return `<div class="calendar-layout" data-calendar-pane="${state.calendarPane}"><section class="panel month-panel"><div class="panel-head"><input id="calendarMonth" class="calendar-month-select" aria-label="조회 월" type="month" value="${state.month}"><div class="calendar-tools"><button class="icon-btn" id="prevMonth" aria-label="이전 달">‹</button><button class="btn" id="calendarToday">오늘</button><button class="icon-btn" id="nextMonth" aria-label="다음 달">›</button></div></div><div class="calendar-scroll" data-scroll-key="calendar-grid" tabindex="0" role="region" aria-label="월 달력 스크롤"><div class="calendar-grid">${['일','월','화','수','목','금','토'].map(x=>`<div class="weekday">${x}</div>`).join('')}${cells}</div><div class="calendar-legend">업: 마감·다음 확인 / 일: 일정 / 기록: 대화·진척·완료</div></div><div class="calendar-record-actions"><button class="text-btn" data-calendar-scope="history">월별 기록 ${monthHistory.length}건 →</button><button class="text-btn day-record-button" data-calendar-scope="day">선택일 기록 →</button></div></section><section class="panel paged-panel day-panel"><div class="panel-head"><div><h2>${monthly?monthLabel+' 변경 기록':dateLabel(state.selected)}</h2>${monthly?`<small>저장된 상태·메모 변경 ${monthHistory.length}건</small>`:''}</div><button class="text-btn day-record-button" data-calendar-pane="month">달력으로</button></div><nav class="calendar-scope" aria-label="기록 범위"><button data-calendar-scope="day" aria-pressed="${!monthly}">선택일</button><button data-calendar-scope="history" aria-pressed="${monthly}">월별 기록</button></nav>${!monthly&&unavailable?`<p class="widget-alert" role="status">${esc(unavailable)}</p>`:''}${monthly?'<p class="record-hint">업무 상태·메모의 변경을 월별로 모았습니다. 기록을 누르면 당시 상태와 메모를 확인할 수 있습니다.</p>':''}${content}</section></div>`;
}

function guideSections(){
 const latest=state.runs[0],sections=[
 ['업무 상태와 대화','저장한 대화·완료·메모는 기기 간 동기화됩니다. 다한닷은 다음 정기 갱신 또는 ChatGPT에서 “업무보드 대화 반영해줘”라고 요청할 때 대화를 읽고 상태·남은 일·다음 확인일을 정리합니다. 즉시 AI 답변 기능은 연결되어 있지 않습니다.'],
 ['두레이 즐겨찾기 · 한 달 일정','대화방은 갱신 때마다 두레이 즐겨찾기 목록을 다시 확인합니다. 고정 대화방 목록은 사용하지 않습니다. 두레이·Google 일정은 오늘부터 30일을 조회하고, 주간업무보고는 전주 실시 / 금주 예정으로 작성합니다. 즐겨찾기를 해제한 방의 기존 실제 업무·이력은 보존됩니다.'],
 ['원본 조회 시간','평일 오후 1시에 원본을 조회합니다(한국 공휴일 제외). 오전에는 두레이 로그인 후 ChatGPT에서 “업무보드 갱신해줘”라고 요청하세요. 로그인 순간을 자동 감지하는 연결은 아직 없습니다. 상태 새로고침은 이미 수집된 자료와 저장 상태를 불러옵니다.'],
 ['완료 · 부분 완료 · 일정 변경','“끝났어”, “답변만 기다려”, “이번 일정은 빼줘”처럼 이야기하세요. 완료한 일은 일반 안내에서 제외합니다. 날짜를 누르면 당시 메모와 완료 이력을 볼 수 있습니다. 일정 변경·제외는 이 보드의 개인 표시 기준이며 원본 일정이나 타인 초대를 자동 변경하지 않습니다.'],
 ['OneDrive · 주간보고 · 날씨','최근 파일과 주간보고는 OneDrive 원본 링크로 열립니다. 보고서 복사본을 보드에 저장하지 않습니다. 날씨는 천안·서울 오늘/내일 예보이며 화살표·지역 버튼·좌우 밀기로 전환합니다. 예보는 화면을 열 때와 최대 30분 간격으로 확인합니다.'],
 ...(latest?.sources||[]).map(x=>[x.name,`${{ok:'확인',partial:'일부 확인',failed:'실패',not_checked:'미조회'}[x.status]||x.status} · ${kstTime(x.checked_at)}\n${x.detail}`]),
 ...state.events.filter(e=>e.excluded).map(e=>['제외한 일정 · '+e.title,e.personal_note||'개인 업무보드에서 제외했습니다.'])];
 return sections;
}

function openGuide(){
 const dialog=$('#historyDetail');
 dialog.innerHTML=`<div class="dialog-head"><h2>연결 · 사용 안내</h2><button class="icon-btn" id="closeGuide" aria-label="사용 안내 닫기">×</button></div><div class="dialog-body help-sections">${guideSections().map(([title,body])=>`<section><h3>${esc(title)}</h3><p>${esc(body)}</p></section>`).join('')}<button class="btn" id="guideBackup">내 업무 백업</button></div>`;
 $('#closeGuide').onclick=()=>dialog.close();$('#guideBackup').onclick=exportBackup;dialog.showModal();
}
function linksView(){
 const removed=state.links.filter(l=>l.removed_at).length;
 const links=state.links.filter(l=>Boolean(l.removed_at)===state.showRemovedLinks);
 return `<section class="panel paged-panel links-panel"><div class="panel-head"><h2>${state.showRemovedLinks?'삭제한 바로가기':'업무 바로가기'}</h2><button class="text-btn" id="showRemovedLinks">${state.showRemovedLinks?'목록으로':'삭제한 항목 '+removed}</button></div><p class="links-hint">${state.showRemovedLinks?'삭제한 링크는 자동 갱신으로 다시 추가되지 않습니다. 필요하면 복원하세요.':'업무 갱신 때 필요한 원문을 확인해 추가합니다. 필요 없는 바로가기는 삭제하세요.'}</p>${scrollList(links,'links',l=>`<article class="managed-link"><a class="link-card" href="${esc(safeURL(l.url))}" target="_blank" rel="noopener noreferrer"><strong>${esc(l.label)} ↗</strong><span>${esc(l.description)}</span></a><button class="link-action" ${state.showRemovedLinks?'data-link-restore':'data-link-remove'}="${esc(l.id)}" aria-label="${esc(l.label)} ${state.showRemovedLinks?'복원':'삭제'}" ${state.linkBusy?'disabled':''}>${state.showRemovedLinks?'복원':'삭제'}</button></article>`,state.showRemovedLinks?'삭제한 바로가기가 없습니다.':'다음 업무 갱신에서 유용한 원문을 확인해 추가합니다.')}</section>`;
}
async function setLinkRemoved(id,removed){
 if(state.linkBusy)return;const link=state.links.find(l=>l.id===id);if(!link)return;
 state.linkBusy=true;render();
 try{
  let saved;
  if(demo)saved={...link,removed_at:removed?new Date().toISOString():null};
  else {const {data,error}=await db.rpc('set_workdesk_link_removed',{p_link:id,p_removed:removed});if(error)throw error;saved=Array.isArray(data)?data[0]:data;if(!saved||saved.id!==id)throw Error('저장 결과를 확인하지 못했습니다. 새로고침 후 다시 확인하세요.');}
  state.links=state.links.map(l=>l.id===id?saved:l);render();
  toast(removed?'바로가기를 삭제했습니다. 삭제한 항목에서 복원할 수 있습니다.':'바로가기를 복원했습니다.');
 }catch(error){toast(errorMessage(error));}finally{state.linkBusy=false;render();}
}

function bodyView(){
 if(state.view==='conversation')return conversationView();if(state.view==='calendar')return calendarView();
 if(state.view==='links')return linksView();
 const tasks=state.tasks.filter(t=>matchesTask(t,state.view==='work'?state.taskFilter:state.view)).sort((a,b)=>Number(b.pinned)-Number(a.pinned)||(a.next_review_on||a.due_date||'9999').localeCompare(b.next_review_on||b.due_date||'9999')||['high','normal','low'].indexOf(a.priority)-['high','normal','low'].indexOf(b.priority));
 return `<section class="panel paged-panel"><div class="panel-head"><h2>${state.view==='archived'?'보관한 업무':'업무 목록'}</h2><small>${tasks.length}건</small></div>${state.view==='work'?taskFilters():'<p class="task-filter-hint">목록에서 숨겨 둔 업무입니다. 다시 챙기려면 해당 업무의 대화에 복원을 요청하세요.</p>'}${scrollList(tasks,'tasks',taskCard,'이곳에서 챙길 업무가 없습니다. 필요한 일을 대화로 남겨주세요.')}</section>`;
}
function agendaPanel(){
 const events=visibleAgenda(state.events,state.itemVisibility),hidden=hiddenItems(state.itemVisibility,'agenda'),showHidden=state.showHiddenAgenda;
 return `<section class="panel paged-panel agenda-panel" aria-label="다가오는 일정"><div class="panel-head"><div><h2>${showHidden?'숨긴 일정':'다가오는 일정'}</h2><small>${showHidden?'숨긴 일정':'앞으로 30일'} · ${showHidden?hidden.length:events.length}건</small></div><button class="text-btn" data-view="calendar">달력 ↗</button></div>${visibilityErrorHTML()}${showHidden?`<p class="visibility-hint">복원한 일정은 앞으로 30일의 표시 대상일 때 나타납니다.</p>${scrollList(hidden,'agenda-hidden',hiddenItemHTML,'숨긴 일정이 없습니다.')}`:scrollList(events,'agenda',e=>agenda([e],{hideable:true}),'표시할 다가오는 일정이 없습니다.')}<div class="file-check"><span>${dateLabel(day())} ~ ${dateLabel(addDays(day(),29))}</span><button class="text-btn" data-hidden-list="agenda" aria-expanded="${showHidden}">${showHidden?'다가오는 일정으로':'숨긴 항목 '+hidden.length}</button></div></section>`;
}
const visibilityErrorHTML=()=>state.itemVisibilityError?`<p class="widget-alert" role="status">${esc(state.itemVisibilityError)}</p>`:'';
function itemHideButton(kind,drive,id,label){
 return `<button class="item-dismiss" data-item-hide="${esc(itemVisibilityKey(kind,drive,id))}" aria-label="${esc(label)} 숨기기" title="업무보드에서 숨기기" ${state.itemVisibilityBusy||state.itemVisibilityError?'disabled':''}>×</button>`;
}
function hiddenItemHTML(item){
 const current=item.kind==='agenda'?state.events.find(e=>e.id===item.item_id)?.title:state.files.find(f=>f.drive_id===item.drive_id&&f.item_id===item.item_id)?.name;
 return `<article class="hidden-item"><span>${esc(current||item.label)}</span><button class="item-restore" data-item-restore="${esc(itemVisibilityKey(item.kind,item.drive_id,item.item_id))}" aria-label="${esc(current||item.label)} 복원" ${state.itemVisibilityBusy||state.itemVisibilityError?'disabled':''}>복원</button></article>`;
}
async function setItemHidden(key,hidden){
 if(state.itemVisibilityBusy||state.itemVisibilityError)return;
 let kind,drive,id;try{[kind,drive,id]=JSON.parse(key);}catch{return;}
 if(!['agenda','file'].includes(kind)||typeof drive!=='string'||typeof id!=='string')return;
 const workspace=state.workspace.id;
 state.itemVisibilityBusy=true;render();
 try{
  let saved;
  if(demo){
   const previous=state.itemVisibility.find(p=>itemVisibilityKey(p.kind,p.drive_id,p.item_id)===key);
   const label=kind==='agenda'?state.events.find(e=>e.id===id)?.title:state.files.find(f=>f.drive_id===drive&&f.item_id===id)?.name;
   if(!label&&!previous)throw Error('항목을 찾지 못했습니다. 새로고침 후 다시 확인하세요.');
   saved={workspace_id:workspace,kind,drive_id:drive,item_id:id,label:label||previous.label,hidden_at:hidden?(previous?.hidden_at||new Date().toISOString()):null,updated_at:new Date().toISOString()};
  }else{
   const {data,error}=await db.rpc('set_workdesk_item_hidden',{p_workspace:workspace,p_kind:kind,p_drive_id:drive,p_item_id:id,p_hidden:hidden});
   if(error)throw error;
   const result=Array.isArray(data)?data[0]:data;
   if(result?.workspace_id!==workspace||itemVisibilityKey(result?.kind,result?.drive_id,result?.item_id)!==key)throw Error('숨김 설정의 저장 결과를 확인하지 못했습니다. 새로고침 후 다시 확인하세요.');
   const verified=await withDeadline(db.from('workdesk_item_visibility').select('*').eq('workspace_id',workspace).eq('kind',kind).eq('drive_id',drive).eq('item_id',id).single());
   if(verified.error||!verified.data||Boolean(verified.data.hidden_at)!==hidden)throw Error('숨김 설정의 저장 결과를 확인하지 못했습니다. 새로고침 후 다시 확인하세요.');
   saved=verified.data;
  }
  if(state.workspace?.id!==workspace)return;
  state.itemVisibility=[...state.itemVisibility.filter(p=>itemVisibilityKey(p.kind,p.drive_id,p.item_id)!==key),saved];
  toast(hidden?'업무보드에서 숨겼습니다. 숨긴 항목에서 복원할 수 있습니다.':'숨김을 해제했습니다. 조회 기간에 해당하는 항목은 다시 표시됩니다.');
 }catch(error){toast(errorMessage(error));}
 finally{state.itemVisibilityBusy=false;render();app.querySelector(`[data-hidden-list="${kind}"]`)?.focus({preventScroll:true});}
}

function briefingWidget(){
 const latest=state.runs[0],text=latest&&state.tasks.some(t=>Date.parse(t.updated_at)>Date.parse(latest.imported_at||latest.generated_at))?currentBriefing(state.tasks,state.events):latest?.summary||'필요한 일을 대화로 남겨주세요. 수집한 업무와 일정은 이곳에서 확인합니다.';
 const items=briefingItems(text,state.briefingDismissals),disabled=state.briefingBusy||Boolean(state.briefingError);
 return `<section class="briefing briefing-expanded" aria-label="오늘의 주요 내용"><span class="briefing-icon">✦</span><div class="briefing-content"><div class="briefing-heading"><b>${state.showHiddenBriefing?'숨긴 주요내용':'오늘의 주요 내용'}</b><small>${latest?'원본 조회 '+kstTime(latest.generated_at):''}</small></div>${state.briefingError?`<p class="briefing-error" role="status">${esc(state.briefingError)}</p>`:''}${briefingListHTML(items,{showHidden:state.showHiddenBriefing,disabled})}<div class="briefing-tools">${state.showHiddenBriefing?'<small>현재 안내에 있는 내용만 다시 표시됩니다.</small>':''}<button id="showHiddenBriefing" aria-expanded="${state.showHiddenBriefing}" ${state.briefingBusy?'disabled':''}>${state.showHiddenBriefing?'주요내용으로':'숨긴 항목 '+items.hidden.length}</button></div></div></section>`;
}
async function setBriefingHidden(line,hidden){
 if(state.briefingBusy||state.briefingError)return;
 line=normalizeBriefingLine(line);if(!line)return;
 const workspace=state.workspace.id;
 state.briefingBusy=true;render();
 try{
  let saved;
  if(demo){const previous=state.briefingDismissals.find(row=>row.line_text===line);saved={workspace_id:workspace,line_key:previous?.line_key||crypto.randomUUID(),line_text:line,hidden_at:hidden?(previous?.hidden_at||new Date().toISOString()):null,updated_at:new Date().toISOString()};}
  else{
   const {data,error}=await db.rpc('set_workdesk_briefing_hidden',{p_workspace:workspace,p_line:line,p_hidden:hidden});
   if(error)throw error;
   const result=Array.isArray(data)?data[0]:data;
   if(!result?.line_key)throw Error('숨김 설정의 저장 결과를 확인하지 못했습니다. 새로고침 후 다시 확인하세요.');
   const verified=await withDeadline(db.from('briefing_dismissals').select('*').eq('workspace_id',workspace).eq('line_key',result.line_key).single());
   if(verified.error||verified.data?.line_text!==line||Boolean(verified.data?.hidden_at)!==hidden)throw Error('숨김 설정의 저장 결과를 확인하지 못했습니다. 새로고침 후 다시 확인하세요.');
   saved=verified.data;
  }
  if(state.workspace?.id!==workspace)return;
  state.briefingDismissals=[...state.briefingDismissals.filter(row=>row.line_key!==saved.line_key),saved];
  toast(hidden?'주요내용을 숨겼습니다. 숨긴 항목에서 복원할 수 있습니다.':'숨김을 해제했습니다. 현재 안내에 포함된 내용은 다시 표시됩니다.');
 }catch(error){toast(errorMessage(error));}
 finally{state.briefingBusy=false;render();$('#showHiddenBriefing')?.focus({preventScroll:true});}
}

const sourceOptions=()=>({error:state.error,online:navigator.onLine,fileError:state.fileError,collectionError:state.collectionError,results:state.collectionResults});
const sourceGroups=()=>sourceHealth(state.runs,state.fileRuns,sourceOptions());
const sourceDot=status=>`<i class="source-dot ${status}" aria-hidden="true"></i>`;
function sourceIndicator(){
 const summary=collectionSummary(sourceGroups(),sourceOptions());
 return `<button id="sourceStatusButton" class="source-status-button" popovertarget="sourcePopover" aria-label="자료 수집 상태: ${summary.label}. 상세 열기" aria-expanded="false" title="원본 조회·반영 결과 보기">${sourceDot(summary.status)}<span>${summary.label}</span><span class="status-caret" aria-hidden="true">⌄</span></button><section id="sourcePopover" class="source-popover" data-scroll-key="source-popup" popover="auto" aria-label="자료 수집 상태"></section>`;
}
function paintSourcePopup(){
 const popup=$('#sourcePopover');if(!popup)return;
 const groups=sourceGroups();
 const selected=groups.find(g=>g.id===state.sourceSelected);
 const detail=selected?.records.map(r=>`${r.name} · ${r.label}\n확인 ${kstTime(r.checkedAt)}${r.lastSuccess&&r.status!=='ok'?' · 마지막 성공 '+kstTime(r.lastSuccess):''}\n${r.detail}`).join('\n\n')||'';
 popup.innerHTML=`<div class="source-popup-head"><div><strong>자료 수집 상태</strong><small>${demo?'공개용 표시':'원본별 마지막 수집 결과'}</small></div><button class="source-close" popovertarget="sourcePopover" popovertargetaction="hide" aria-label="수집 상태 닫기">×</button></div>${state.error||state.fileError||state.collectionError||!navigator.onLine?'<p class="source-popup-warning">최신 수집 기록을 불러오지 못해 이전 결과를 표시합니다.</p>':''}<div class="source-rows">${groups.map(g=>`<button class="source-row ${selected?.id===g.id?'selected':''}" data-source="${g.id}" aria-expanded="${selected?.id===g.id}">${sourceDot(g.status)}<span>${g.name}<small class="source-checked-at">${g.checkedAt?kstTime(g.checkedAt):'확인 시각 없음'}</small></span><b>${g.label}</b><span aria-hidden="true">›</span></button>`).join('')}</div>${selected?`<div class="source-detail" data-scroll-key="${esc(JSON.stringify(['source-detail',selected.id]))}" tabindex="0" role="region" aria-label="수집 상세 스크롤"><p>${esc(detail)}</p></div>`:'<p class="source-popup-hint">항목을 누르면 확인 시각과 누락 이유가 나옵니다.</p>'}<div class="source-legend">${[['ok','완료'],['partial','미완료'],['failed','실패'],['not_checked','기록 없음']].map(([s,l])=>`<span>${sourceDot(s)}${l}</span>`).join('')}</div><p class="source-popup-foot">정해진 범위 확인과 저장 검증을 마치면 수집 완료입니다. 검색 지원 범위와 문서 요약은 별도로 확인합니다.</p>`;
 popup.querySelectorAll('[data-source]').forEach(b=>b.onclick=()=>{state.sourceSelected=state.sourceSelected===b.dataset.source?null:b.dataset.source;paintSourcePopup();popup.querySelector(`[data-source="${b.dataset.source}"]`)?.focus();});
}
function bindSourcePopup(open=false){
 const popup=$('#sourcePopover'),button=$('#sourceStatusButton');paintSourcePopup();
 const position=()=>{const r=button.getBoundingClientRect();popup.style.left=Math.max(8,Math.min(innerWidth-368,r.right-360))+'px';popup.style.top=Math.min(r.bottom+8,innerHeight-100)+'px';};
 popup.addEventListener('beforetoggle',e=>{if(e.newState==='open')position();});
 popup.addEventListener('toggle',e=>button.setAttribute('aria-expanded',String(e.newState==='open')));
 if(open)popup.showPopover();
}
function scenicBanner(){return `<figure class="scenic-banner ${sceneryPaused?'paused':''}" aria-label="AI로 만든 수변 도시 파노라마"><img src="${sceneryURL}" alt="밝은 푸른 하늘과 잔잔한 수면 위로 펼쳐진 가상의 도시 스카이라인" width="2172" height="724" decoding="async"><figcaption><span class="scenery-credit" title="AI로 만든 가상의 수변 도시 풍경">CITY AT EASE <span>· AI 파노라마</span></span><button id="sceneryToggle" aria-label="풍경 움직임 ${sceneryPaused?'재생':'멈춤'}" aria-pressed="${sceneryPaused}">${sceneryPaused?'▷':'Ⅱ'}</button></figcaption></figure>`;}

// Keep the decoded image and both animation playheads through board refreshes.
function captureScenery(){
 const node=$('.scenic-banner'),image=node?.querySelector('img');
 return {node,times:new Map((image?.getAnimations()||[]).map(a=>[a.animationName,a.currentTime]))};
}
function restoreScenery({node,times}){
 if(!node)return;
 $('.scenic-banner').replaceWith(node);
 for(const animation of node.querySelector('img').getAnimations()){
  const time=times.get(animation.animationName);
  if(Number.isFinite(time))animation.currentTime=time;
 }
}

function taskFilters(){
 const counts=taskFilterCounts(state.tasks),selected=TASK_FILTERS.find(f=>f.id===state.taskFilter)||TASK_FILTERS[0];
 return `<nav class="task-filters" aria-label="업무 분류">${TASK_FILTERS.map(f=>`<button data-task-filter="${f.id}" aria-label="${f.label} ${counts[f.id]}건" aria-pressed="${state.taskFilter===f.id}" title="${esc(f.description)}"><span>${f.short}</span><b>${counts[f.id]}</b></button>`).join('')}</nav><p class="task-filter-hint" title="${esc(selected.description)}">${esc(selected.description)}</p>`;
}
function boardLayout(isWork){
 if(state.query)return `<div class="board-grid unified-search-board">${searchView()}</div>`;
 return `<div class="board-grid unified-board ${isWork?'has-work':''}" data-board-view="${state.view}" data-mobile-panel="${state.mobilePanel}">${isWork?`<div class="shared-briefing">${briefingWidget()}</div>`:''}<nav class="board-panel-tabs" aria-label="보드 영역">${[['work',isWork?'업무':views[state.view][0]],...(isWork?[['agenda','다가오는 일정']]:[]),['files','최근 자료']].map(([id,label])=>`<button data-mobile-panel="${id}" aria-pressed="${state.mobilePanel===id}">${label}</button>`).join('')}</nav><div class="board-main shared-main">${isWork?`<div class="work-columns"><div id="viewBody">${bodyView()}</div><div class="work-agenda">${agendaPanel()}</div></div>`:`<div id="viewBody">${bodyView()}</div>`}</div><aside class="shared-files">${filesWidget()}</aside></div>`;
}

let versionCheckedAt=0;
async function checkForUpdate(force=false){
 if(!force&&Date.now()-versionCheckedAt<300000)return state.updateAvailable;
 versionCheckedAt=Date.now();
 try{const response=await fetch('./version.json',{cache:'no-store'});if(!response.ok)return null;const {version}=await response.json();if(typeof version==='string'&&/^\d+\.\d+\.\d+$/.test(version)&&version.localeCompare(APP_VERSION,undefined,{numeric:true})>0){state.updateAvailable=version;render();return version;}}
 catch{}return null;
}
function applyUpdate(){
 if([...drafts.values()].some(value=>value?.body?.trim())||$('#detail').open||$('#historyDetail').open){toast('작성 중인 대화를 저장하고 열린 창을 닫은 뒤 새 화면을 적용해 주세요.');return;}
 const url=new URL(location.href);url.searchParams.set('v',state.updateAvailable||APP_VERSION);location.assign(url.href);
}
async function manualRefresh(){if(await checkForUpdate(true)){applyUpdate();return;}await refresh();}

function render(){
 if(!state.workspace||recoveryPending||searchComposing)return;const searchInput=$('#globalSearch'),searchFocus=document.activeElement===searchInput,selection=searchFocus?[searchInput.selectionStart,searchInput.selectionEnd]:null;app.querySelectorAll('[data-scroll-key]').forEach(n=>{if(n.getClientRects().length)listScrollPositions.set(n.dataset.scrollKey,n.scrollTop);});const oldBoard=$('.unified-board'),boardScroll=oldBoard?.dataset.boardView===state.view?oldBoard.scrollTop:0;const scenery=captureScenery();const sourceOpen=$('#sourcePopover')?.matches(':popover-open')||false;infoContent.clear();const v=state.query?['통합 검색','업무와 일정, 자료·대화에서\n찾은 내용을 모았습니다.']:views[state.view],isWork=state.view==='work',report=state.links.find(l=>!l.removed_at&&/주간.*업무보고/.test(l.label));
 const refreshButton=`<button class="brand-refresh" data-refresh aria-label="상태 새로고침" title="상태 새로고침">⟳</button>`;
 const brand=`<button class="brand home-button" data-home aria-label="다한닷 홈 · 오늘 챙길 일"><span class="mark">d.</span><span>다한닷<small>나의 업무보드</small></span></button>`;
 app.innerHTML=`<div class="layout"><aside class="sidebar"><div class="sidebar-heading">${brand}${refreshButton}</div><div class="mobile-brand">${brand}${refreshButton}<select id="mobileView" aria-label="업무 화면 선택">${Object.entries(views).map(([k,v])=>`<option value="${k}" ${state.view===k?'selected':''}>${v[0]}</option>`).join('')}</select><details class="mobile-account-menu"><summary aria-label="도움말과 로그아웃">⋯</summary><div><button data-password>비밀번호 설정</button><button data-help>연결 · 사용 안내</button><button data-logout>로그아웃</button></div></details></div><div class="owner">${esc(state.workspace.name)}<small>내 일의 시작과 마무리</small></div><form id="globalSearchForm" class="global-search" role="search"><label for="globalSearch">통합 검색</label><div class="global-search-input"><span aria-hidden="true">⌕</span><input type="search" id="globalSearch" aria-label="통합 검색" placeholder="업무·일정·자료 검색" autocomplete="off" maxlength="200" value="${esc(state.searchText)}"></div></form><div class="nav-label">MY WORKSPACE</div><nav class="nav">${Object.entries(views).map(([k,v])=>`<button data-view="${k}" class="${!state.query&&state.view===k?'active':''}"><span class="symbol">${v[2]}</span>${v[0]}</button>`).join('')}</nav><button class="btn primary sidebar-compose" data-compose aria-label="대화로 남기기">＋ 대화로 남기기</button><div class="sidebar-bottom"><div id="liveStatus">${syncLabel()}</div><button class="text-btn account-password" data-password>비밀번호 설정</button><div class="account-actions"><button class="text-btn" data-help>연결 · 사용 안내</button><button class="text-btn" data-logout>로그아웃</button></div></div></aside><div class="work-area"><header class="topbar"><span>PERSONAL WORKDESK</span><div class="topbar-actions">${sourceIndicator()}<a class="shortcut chatgpt-shortcut" href="https://chatgpt.com/" target="_blank" rel="noopener noreferrer" aria-label="ChatGPT 새 창으로 열기"><img class="brand-icon chatgpt-icon" src="./images/chatgpt.svg" width="22" height="22" alt=""><span>ChatGPT</span></a><a class="shortcut clova-shortcut" href="${esc(safeURL(state.links.find(l=>!l.removed_at&&l.label==='클로바노트')?.url)||CLOVA_URL)}" target="_blank" rel="noopener noreferrer" aria-label="클로바노트 새 창으로 열기"><img class="brand-icon" src="./images/clovanote.svg" width="24" height="24" alt=""><span>클로바노트</span></a>${report?`<a class="shortcut report-shortcut" href="${esc(safeURL(report.url))}" target="_blank" rel="noopener noreferrer">주간보고 ↗</a>`:''}<button id="themeToggle" class="theme-toggle" role="switch" aria-checked="${theme==='dark'}" aria-label="다크모드"><span aria-hidden="true">${theme==='dark'?'☀':'☾'}</span><span class="theme-label">${theme==='dark'?'라이트':'다크'}</span></button><small class="today-label">${dateLabel(day())}</small><button class="btn primary mobile-compose" data-compose aria-label="대화로 남기기" title="대화로 남기기">＋</button></div></header><main class="main">${demo?'<div class="notice demo-notice">공개용 업무 체험 화면 · 개인 계정 및 실제 업무 데이터와 연결되지 않습니다.</div>':''}${state.error?`<div class="notice error" role="alert">${esc(state.error)}</div>`:''}${state.updateAvailable?'<div class="notice update-notice">새 화면이 준비되었습니다. <button class="text-btn" id="applyUpdate">새 화면 적용 ↻</button></div>':''}${!navigator.onLine?'<div class="notice offline">오프라인 · 인터넷 연결 후 저장하세요.</div>':''}<div class="title-row"><div class="title-copy"><p class="eyebrow">MY WORK, MY PACE</p><h1>${v[0]}</h1><p class="sub">${v[1]}</p></div>${scenicBanner()}<section id="weatherWidget" class="panel weather-panel" aria-label="지역별 오늘 내일 날씨">${weatherWidget()}</section></div>${boardLayout(isWork)}<footer><span>다한닷 · v${APP_VERSION}</span><span>두레이 즐겨찾기 · 일정 30일</span></footer></main></div></div>`;restoreScenery(scenery);if($('.unified-board'))$('.unified-board').scrollTop=boardScroll;bind();bindSourcePopup(sourceOpen);app.querySelectorAll('[data-scroll-key]').forEach(n=>{n.scrollTop=listScrollPositions.get(n.dataset.scrollKey)||0;});if(searchFocus){$('#globalSearch').focus({preventScroll:true});$('#globalSearch').setSelectionRange(...selection);}
}

async function changeMonth(month){
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))return;
 state.month=month;state.selected=month===day().slice(0,7)?day():month+'-01';state.historyError='';
 const loading=loadHistory();render();try{await loading;}catch(e){toast(errorMessage(e));}render();
}
function navigate(view){clearTimeout(searchTimer);searchComposing=false;state.view=view;state.query='';state.searchText='';state.mobilePanel='work';render();}
function bind(){
 app.querySelectorAll('[data-view]').forEach(n=>n.onclick=()=>navigate(n.dataset.view));app.querySelectorAll('[data-home]').forEach(n=>n.onclick=async()=>{state.month=day().slice(0,7);state.selected=day();state.calendarPane='month';state.calendarScope='day';state.rail='files';state.taskFilter='today';navigate('work');try{await loadHistory();}catch(e){toast(errorMessage(e));}});
 app.querySelectorAll('[data-task-filter]').forEach(b=>b.onclick=()=>{state.taskFilter=b.dataset.taskFilter;render();});
 app.querySelectorAll('[data-help]').forEach(b=>b.onclick=openGuide);
 app.querySelectorAll('[data-password]').forEach(b=>b.onclick=()=>showPasswordSetup());
 app.querySelectorAll('[data-link-remove]').forEach(b=>b.onclick=()=>setLinkRemoved(b.dataset.linkRemove,true));
 app.querySelectorAll('[data-link-restore]').forEach(b=>b.onclick=()=>setLinkRemoved(b.dataset.linkRestore,false));
 app.querySelectorAll('[data-item-hide]').forEach(b=>b.onclick=()=>setItemHidden(b.dataset.itemHide,true));
 app.querySelectorAll('[data-item-restore]').forEach(b=>b.onclick=()=>setItemHidden(b.dataset.itemRestore,false));
 app.querySelectorAll('[data-hidden-list]').forEach(b=>b.onclick=()=>{if(b.dataset.hiddenList==='agenda')state.showHiddenAgenda=!state.showHiddenAgenda;else state.showHiddenFiles=!state.showHiddenFiles;render();});
 app.querySelectorAll('[data-briefing-hide]').forEach(b=>b.onclick=()=>setBriefingHidden(b.dataset.briefingHide,true));
 app.querySelectorAll('[data-briefing-restore]').forEach(b=>b.onclick=()=>{const row=state.briefingDismissals.find(row=>row.line_key===b.dataset.briefingRestore);if(row)setBriefingHidden(row.line_text,false);});
 if($('#showHiddenBriefing'))$('#showHiddenBriefing').onclick=()=>{state.showHiddenBriefing=!state.showHiddenBriefing;render();};
 if($('#showRemovedLinks'))$('#showRemovedLinks').onclick=()=>{state.showRemovedLinks=!state.showRemovedLinks;render();};
 $('#mobileView').onchange=e=>navigate(e.target.value);app.querySelectorAll('[data-logout]').forEach(n=>n.onclick=logout);
 $('#themeToggle').onclick=()=>{theme=theme==='dark'?'light':'dark';document.documentElement.dataset.theme=theme;try{localStorage.setItem('dahandot-theme',theme);}catch{}render();};
 app.querySelectorAll('[data-rail]').forEach(b=>b.onclick=()=>{state.rail=b.dataset.rail;state.mobilePanel=b.dataset.rail;render();});app.querySelectorAll('[data-mobile-panel]').forEach(b=>{if(b.tagName==='BUTTON')b.onclick=()=>{state.mobilePanel=b.dataset.mobilePanel;render();};});
 app.querySelectorAll('[data-calendar-scope]').forEach(b=>b.onclick=()=>{state.calendarScope=b.dataset.calendarScope;state.calendarPane='day';render();});
 app.querySelectorAll('button[data-calendar-pane]').forEach(b=>b.onclick=()=>{state.calendarPane=b.dataset.calendarPane;render();});
 app.querySelectorAll('[data-info]').forEach(b=>b.onclick=()=>showInfo(b.dataset.info));
 $('#sceneryToggle').onclick=()=>{sceneryPaused=!sceneryPaused;try{localStorage.setItem('dahandot-scenery-paused',String(sceneryPaused));}catch{}const banner=$('.scenic-banner');banner.classList.toggle('paused',sceneryPaused);$('#sceneryToggle').textContent=sceneryPaused?'▷':'Ⅱ';$('#sceneryToggle').setAttribute('aria-pressed',String(sceneryPaused));$('#sceneryToggle').setAttribute('aria-label','풍경 움직임 '+(sceneryPaused?'재생':'멈춤'));};
 app.querySelectorAll('[data-refresh]').forEach(b=>b.onclick=manualRefresh);if($('#applyUpdate'))$('#applyUpdate').onclick=applyUpdate;app.querySelectorAll('[data-compose]').forEach(b=>b.onclick=()=>openConversation({}));bindWeather();bindItems(app);
 bindGlobalSearch();
 if($('#prevMonth')){$('#prevMonth').onclick=()=>changeMonth(addDays(state.month+'-01',-1).slice(0,7));$('#nextMonth').onclick=()=>changeMonth(monthBounds(state.month)[1].slice(0,7));$('#calendarToday').onclick=()=>changeMonth(day().slice(0,7));app.querySelectorAll('[data-day]').forEach(n=>n.onclick=async()=>{const d=n.dataset.day;if(d.slice(0,7)!==state.month)await changeMonth(d.slice(0,7));state.selected=d;state.calendarScope='day';state.calendarPane='day';render();});}
 if($('#calendarMonth'))$('#calendarMonth').onchange=e=>{if(e.target.value)changeMonth(e.target.value);};if($('#exportBtn'))$('#exportBtn').onclick=exportBackup;
}

function bindItems(root){root.querySelectorAll('[data-task]').forEach(n=>n.onclick=()=>openTask(state.tasks.find(t=>t.id===n.dataset.task)));root.querySelectorAll('[data-event]').forEach(n=>n.onclick=()=>openEvent(state.events.find(e=>e.id===n.dataset.event)));root.querySelectorAll('[data-converse]').forEach(n=>n.onclick=()=>openConversation({}));root.querySelectorAll('[data-message]').forEach(n=>n.onclick=()=>{const m=state.messages.find(x=>x.id===n.dataset.message);if(m)openConversation({task_id:m.task_id,event_id:m.event_id}).then(()=>{scrollToMessage(m.id);});});root.querySelectorAll('[data-history]').forEach(n=>n.onclick=()=>showHistory([...state.history,...detailHistory].find(h=>String(h.id)===n.dataset.history)));}

function messageCard(m){return `<article class="message-card"><small>${kstTime(m.created_at)} · ${esc(messageStatuses[m.resolution_status])}</small><button data-message="${esc(m.id)}"><strong>${esc(state.tasks.find(t=>t.id===m.task_id)?.title||state.events.find(e=>e.id===m.event_id)?.title||'자유롭게 남긴 이야기')}</strong><p>${esc(m.body)}</p><span>${esc(m.reply||'다한닷 확인 대기')}</span><b class="message-read">대화 전체 보기 →</b></button></article>`;}
function conversationView(){const pending=state.messages.filter(m=>m.resolution_status==='pending').length;return `<section class="panel paged-panel conversation-feed"><div class="panel-head"><h2>나눈 이야기</h2><span class="badge ${pending?'review':''}">${pending?`확인 대기 ${pending}건`:'모든 대화 확인'}</span></div><p class="conversation-page-note">진척과 생각을 편하게 남기세요. 다한닷이 후속 일을 정리합니다.</p>${scrollList([...state.messages].reverse(),'messages',messageCard,'아직 나눈 이야기가 없습니다. 대화로 남기기를 눌러주세요.')}</section>`;}

function contextSummary(){const t=state.tasks.find(t=>t.id===conversationTarget.task_id),e=state.events.find(e=>e.id===conversationTarget.event_id);if(t)return `<section class="conversation-context"><div class="task-meta">${statusBadge(t.status)}${t.archived?'<span class="badge">보관됨</span>':''}${t.next_review_on?`<span>다음 확인 ${dateLabel(t.next_review_on)}</span>`:''}${t.due_date?`<span>마감 ${dateLabel(t.due_date)}</span>`:''}</div><h3>${esc(t.title)}</h3>${t.remaining_action?`<p>남은 일 · ${linkedText(t.remaining_action)}</p>`:''}<small>현재 반영된 내용입니다. 새로 남긴 이야기는 확인 후 바뀝니다.</small><button type="button" class="text-btn" data-task-detail="${esc(t.id)}">업무 내용 · 원문 보기 →</button></section>`;if(e)return `<section class="conversation-context"><div class="task-meta"><span>${e.excluded?'내 업무보드에서 제외됨':e.all_day?dateLabel(e.start_at)+' · 종일':kstTime(e.start_at)}</span></div><h3>${esc(e.title)}</h3>${e.personal_note?`<p>${linkedText(e.personal_note)}</p>`:''}<small>업무보드에 표시할 일정과 준비할 일을 이야기해 주세요.</small><button type="button" class="text-btn" data-event-detail="${esc(e.id)}">업무 내용 · 원문 보기 →</button></section>`;return '<section class="conversation-context"><h3>어떤 이야기든 편하게 남겨주세요.</h3><p>새로운 업무도, 여러 업무의 진행 상황도 한 번에 적어도 됩니다.</p></section>';}
function threadHTML(){return conversationThread(messagesForTarget(state.messages,conversationTarget));}
function scrollToMessage(id){const body=$('#detail .dialog-body'),message=[...document.querySelectorAll('[data-thread-message]')].find(n=>n.dataset.threadMessage===id);if(body&&message)body.scrollTop+=message.getBoundingClientRect().top-body.getBoundingClientRect().top-12;}
function refreshConversation({toLatest=false}={}){
 if(!$('#detail').open||!$('#conversationThread'))return;
 const body=$('#detail .dialog-body'),top=body.scrollTop,atBottom=body.scrollHeight-top-body.clientHeight<32;
 $('#conversationContext').innerHTML=contextSummary();$('#conversationThread').innerHTML=threadHTML();bindItemDetailButtons();
 body.scrollTop=toLatest||atBottom?body.scrollHeight:top;
}
function renderDetailHistory(){const node=$('#detailHistory');if(!node)return;const top=node.scrollTop;node.innerHTML=historyList(detailHistory)||empty('저장된 변경 이력이 없습니다.');node.scrollTop=top;bindItems(node);}
function readableItemContent(task,event){
 const target=task?{task_id:task.id}:{event_id:event.id},preview=conversationPreview(state.messages,target);
 return task?taskDetailContent(task,preview):eventDetailContent(event,preview);
}
function bindStoryButtons(root){
 root.querySelectorAll('[data-story-task]').forEach(button=>button.onclick=()=>{
  const target={task_id:button.dataset.storyTask||null,event_id:button.dataset.storyEvent||null};
  if(!target.task_id&&!target.event_id)return;
  if($('#historyDetail').open)$('#historyDetail').close();
  openConversation(target);
 });
}
function bindItemDetailButtons(){document.querySelectorAll('[data-task-detail]').forEach(button=>button.onclick=()=>openTask(state.tasks.find(task=>task.id===button.dataset.taskDetail)));document.querySelectorAll('[data-event-detail]').forEach(button=>button.onclick=()=>openEvent(state.events.find(event=>event.id===button.dataset.eventDetail)));}
function refreshItemDetail(){
 const content=$('#itemDetailContent');if(!$('#detail').open||!content)return;
 const task=state.tasks.find(task=>task.id===content.dataset.taskId),event=state.events.find(event=>event.id===content.dataset.eventId);if(!task&&!event)return;
 const html=readableItemContent(task,event);if(content.innerHTML===html)return;
 const body=$('#detail .dialog-body'),top=body.scrollTop;content.innerHTML=html;bindStoryButtons(content);body.scrollTop=top;
}
async function loadTaskDetailHistory(id){
 const node=$('#detailHistory');if(!node)return;
 try{
  const history=demo?state.history.filter(h=>h.task_id===id):await rows('task_history',q=>q.eq('task_id',id).order('occurred_at',{ascending:false}).order('id',{ascending:false}));
  if($('#detailHistory')!==node||conversationTarget.task_id!==id)return;
  detailHistory=history;renderDetailHistory();
 }catch(error){if($('#detailHistory')===node)node.textContent='이력을 불러오지 못했습니다: '+errorMessage(error);}
}
const openTask=task=>openItemDetail(task);
const openEvent=event=>openItemDetail(null,event);
async function openItemDetail(task,event){
 if(!task&&!event)return;
 const target={task_id:task?.id||null,event_id:event?.id||null};
 conversationTarget=target;editTask=task?structuredClone(task):null;detailHistory=[];
 $('#detail').innerHTML=`<div class="task-detail"><div class="dialog-head"><h2>업무 내용</h2><button type="button" class="icon-btn" id="closeItemDetail" aria-label="닫기">×</button></div><div class="dialog-body" tabindex="0" role="region" aria-label="업무 내용 스크롤"><div id="itemDetailContent" ${task?`data-task-id="${esc(task.id)}"`:`data-event-id="${esc(event.id)}"`}>${readableItemContent(task,event)}</div>${task?'<details class="previous-records"><summary>변경 이력</summary><div id="detailHistory" tabindex="0" role="region" aria-label="업무 변경 이력 스크롤"></div></details>':''}</div><div class="dialog-foot"><span class="task-detail-caption">진행 상황은 이야기로 남겨주세요.</span><span class="spacer"></span><button type="button" class="btn primary" id="openItemConversation">업무 이야기 →</button></div></div>`;
 $('#closeItemDetail').onclick=()=>$('#detail').close();$('#openItemConversation').onclick=()=>openConversation(target);bindStoryButtons($('#detail'));
 if(!$('#detail').open)$('#detail').showModal();$('#detail .dialog-body').scrollTop=0;
 if(task)await loadTaskDetailHistory(task.id);
}
async function openConversation(target){conversationTarget={task_id:target.task_id||null,event_id:target.event_id||null};const key=targetKey(conversationTarget);const task=state.tasks.find(t=>t.id===conversationTarget.task_id),event=state.events.find(e=>e.id===conversationTarget.event_id);editTask=task?structuredClone(task):null;detailHistory=[];const draft=drafts.get(key)||{body:'',id:crypto.randomUUID()};drafts.set(key,draft);
 $('#detail').innerHTML=`<form id="conversationForm"><div class="dialog-head"><div><p class="eyebrow">A CONVERSATION WITH DAHANDOT</p><h2>${task||event?'업무 이야기':'다한닷에게 남기기'}</h2></div><button type="button" class="icon-btn" id="closeConversation" aria-label="닫기">×</button></div><div class="dialog-body conversation-body"><div id="conversationContext">${contextSummary()}</div><div id="conversationThread">${threadHTML()}</div>${task||event?`<details class="previous-records"><summary>이전 메모 · 원문 · 변경 이력</summary>${task?.note?`<div class="legacy-note">${linkedText(task.note)}</div>`:''}${task?sourceReferencesHTML(task.source_refs||[]):''}${event?link(event.url,'일정 원문'):''}<div id="detailHistory" tabindex="0" role="region" aria-label="업무 변경 이력 스크롤"></div></details>`:''}</div><div class="conversation-compose"><label class="conversation-label" for="conversationText">진행한 내용을 편하게 적어주세요</label><textarea id="conversationText" rows="3" maxlength="12000" required>${esc(draft.body)}</textarea><details class="conversation-timing"><summary>저장한 이야기는 언제 반영되나요?</summary><p>대화는 바로 저장됩니다. 다음 정기 갱신 때 다한닷이 읽고 정리합니다. 지금 반영하려면 ChatGPT에서 “업무보드 대화 반영해줘”라고 말씀해 주세요.</p></details><div id="conversationError" class="error" role="alert"></div></div><div class="dialog-foot"><span class="save-caption">${demo?'체험 대화 · 실제 저장 없음':'즉시 저장 · 다음 갱신 때 정리'}</span><span class="spacer"></span><button type="submit" class="btn primary" id="sendConversation">대화 남기기 ↑</button></div></form>`;
 $('#closeConversation').onclick=()=>$('#detail').close();$('#conversationText').oninput=e=>{const previous=drafts.get(key);drafts.set(key,{body:e.target.value,id:previous?.body===e.target.value?previous.id:crypto.randomUUID()});};$('#conversationForm').onsubmit=sendConversation;bindItemDetailButtons();if(!$('#detail').open)$('#detail').showModal();$('#detail .dialog-body').scrollTop=$('#detail .dialog-body').scrollHeight;
 if(task)await loadTaskDetailHistory(task.id);
}
async function sendConversation(e){
 e.preventDefault();const form=e.currentTarget;if(form.dataset.saving==='true')return;
 const btn=e.submitter||form.querySelector('#sendConversation'),input=form.querySelector('#conversationText'),errorBox=form.querySelector('#conversationError');
 const target={...conversationTarget},key=targetKey(target),workspace=state.workspace.id;
 form.dataset.saving='true';btn.disabled=true;btn.textContent='저장 중…';input.readOnly=true;errorBox.textContent='';
 try{
  if(!navigator.onLine)throw Error('인터넷 연결 후 다시 보내주세요. 작성한 내용은 그대로 남아 있습니다.');
  const body=validateMessage(input.value),draft=drafts.get(key)||{body,id:crypto.randomUUID()};drafts.set(key,draft);
  const expected={id:draft.id,workspace_id:workspace,task_id:target.task_id,event_id:target.event_id,body};
  const message=demo?{...expected,created_at:new Date().toISOString(),resolution_status:'pending',reply:'',changes:[]}:await withDeadline(persistConversation(db,expected));
  if(state.workspace?.id!==workspace)return;
  state.messages=mergeSavedMessages(state.messages,[message]);
  if(drafts.get(key)?.id===draft.id){drafts.delete(key);if(targetKey(conversationTarget)===key&&$('#conversationText'))$('#conversationText').value='';}
  if($('#conversationForm')===form){input.value='';$('#detail').close();}
  render();toast(demo?'체험 대화를 저장했습니다. 실제 업무에는 저장되지 않습니다.':'대화를 저장했습니다.');
  void refresh(true);
 }catch(error){if($('#conversationForm')===form)errorBox.textContent=errorMessage(error);}
 finally{form.dataset.saving='false';btn.disabled=false;btn.textContent='대화 남기기 ↑';input.readOnly=false;}
}
function showHistory(h){if(!h)return;const d=h.after_data;$('#historyDetail').innerHTML=`<div class="dialog-head"><h2>당시 업무 기록</h2><button class="icon-btn" id="closeHistory" aria-label="기록 닫기">×</button></div><div class="dialog-body"><p class="muted">${kstTime(h.occurred_at)} · ${esc(h.actor)} · ${esc(h.action)}</p><h2 style="margin:20px 0">${esc(d.title)}</h2>${statusBadge(d.status)}${conversationPreview(state.messages,{task_id:h.task_id},{historical:true})}<dl class="snapshot">${[['프로젝트',d.project],['마감일',dateLabel(d.due_date)],['당시 메모',d.note||'없음'],['남은 일',d.remaining_action||'없음'],['다음 확인일',dateLabel(d.next_review_on)],['다음 행동',d.next_action||'없음']].map(([k,v])=>`<dt>${k}</dt><dd>${esc(v)}</dd>`).join('')}</dl><p class="form-note">이것은 당시의 기록입니다. 현재 업무 상태와 다를 수 있습니다.</p></div><div class="dialog-foot"><button class="btn primary" id="openCurrent">현재 업무 보기</button></div>`;$('#closeHistory').onclick=()=>$('#historyDetail').close();$('#openCurrent').onclick=()=>{$('#historyDetail').close();$('#detail').close();openTask(state.tasks.find(t=>t.id===h.task_id));};bindStoryButtons($('#historyDetail'));$('#historyDetail').showModal();}
async function exportBackup(){try{const history=demo?state.history:await rows('task_history',q=>q.eq('workspace_id',state.workspace.id).order('id'));const blob=new Blob([JSON.stringify({type:'dahandot.cloud-backup',version:2,exported_at:new Date().toISOString(),tasks:state.tasks,history,events:state.sourceEvents.length?state.sourceEvents:state.events,calendar_overrides:state.overrides,messages:state.messages,links:state.links,file_changes:demo?state.files:await rows('file_changes',q=>q.eq('workspace_id',state.workspace.id).order('id')),file_sync_runs:state.fileRuns,file_summaries:state.fileSummaries,briefing_dismissals:state.briefingDismissals,item_visibility:state.itemVisibility},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='dahandot-backup-'+day()+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(e){toast(errorMessage(e));}}
async function logout(){clearTimeout(searchTimer);searchComposing=false;searchRequest++;if(demo){location.href=location.pathname;return;}if(channel)await db.removeChannel(channel);await db.auth.signOut();drafts.clear();conversationTarget={task_id:null,event_id:null};Object.assign(state,{user:null,workspace:null,tasks:[],history:[],events:[],runs:[],links:[],messages:[],overrides:[],sourceEvents:[],files:[],fileRuns:[],fileError:'',fileSummaries:[],summaryError:'',collectionResults:[],collectionError:'',updateAvailable:null,briefingDismissals:[],briefingError:'',briefingBusy:false,showHiddenBriefing:false,itemVisibility:[],itemVisibilityError:'',itemVisibilityBusy:false,showHiddenAgenda:false,showHiddenFiles:false,weatherPage:0,query:'',searchText:'',searchFiles:[],searchFilesLoaded:false,searchFilesLoading:false,searchFilesError:''});$('#detail').close();$('#historyDetail').close();login();}
let resizeTimer;window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{render();},150);});
window.addEventListener('online',()=>refresh(true));window.addEventListener('offline',render);window.addEventListener('focus',()=>{refresh(true);void checkForUpdate();});document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){refresh(true);void checkForUpdate();}});setInterval(()=>{if(document.visibilityState==='visible'){refresh(true);void checkForUpdate();}},30000);
if(demo){const date=day();state.workspace={id:'demo-public',name:'DX·AX 개인 업무보드'};state.tasks=[{id:'demo:task-1',title:"AX 프런티어 부트캠프 과제 정리",project:"AX 교육",status:'partial',priority:'high',due_date:addDays(date,0),next_review_on:addDays(date,0),remaining_action:"업무보드 데모 시연 흐름과 제출용 설명 보완",note:"교육에서 배운 내용을 실제 개인 업무보드 구축 과정과 연결하여 과제 설명, 구현 범위, 제약사항을 정리",next_action:"업무보드 데모 시연 흐름과 제출용 설명 보완",pinned:true,revision:1,source_refs:[],created_at:new Date().toISOString()},{id:'demo:task-2',title:"공정관리 시스템 업무 협의",project:"공정관리 DX",status:'doing',priority:'high',due_date:addDays(date,0),next_review_on:addDays(date,0),remaining_action:"공무·공사 담당 의견을 취합해 우선 구현 범위 확정",note:"현장 엑셀 원형 유지, 계획·실적 비교, 골구도 주간 반영, 본사 취합 흐름을 검토. 실제 현장 직원 사용성 검증은 별도 과제",next_action:"공무·공사 담당 의견을 취합해 우선 구현 범위 확정",pinned:true,revision:1,source_refs:[],created_at:new Date().toISOString()},{id:'demo:task-3',title:"DXT 주간 회의 안건 준비",project:"DXT 협업",status:'todo',priority:'high',due_date:addDays(date,0),next_review_on:addDays(date,0),remaining_action:"각 과제별 결정 필요사항과 유관부서 요청 정리",note:"출역관리 운영, 자재관리 개발, 프로세스맵 확대, AI 에이전트 진행 상황을 실시·예정·리스크로 구분",next_action:"각 과제별 결정 필요사항과 유관부서 요청 정리",pinned:true,revision:1,source_refs:[],created_at:new Date().toISOString()},{id:'demo:task-4',title:"자재관리 시스템 개발 방향 보완",project:"자재관리 DX",status:'partial',priority:'high',due_date:addDays(date,1),next_review_on:addDays(date,1),remaining_action:"발주·반입·잔량 비교 및 송장 인식 후 수기 보완 문제 정리",note:"본사불 발주 품목의 반입 입력→원청 확인→실적 대시보드 흐름 정리. ERP 발주 수량과 반입 수량의 연결 기준 검토",next_action:"발주·반입·잔량 비교 및 송장 인식 후 수기 보완 문제 정리",pinned:false,revision:1,source_refs:[],created_at:new Date().toISOString()},{id:'demo:task-5',title:"공무책임자 AI 에이전트 실무 적용 준비",project:"공무 AX",status:'doing',priority:'high',due_date:addDays(date,2),next_review_on:addDays(date,2),remaining_action:"기성·공문·회의록 중 우선 자동화 업무 선정",note:"시티오씨엘 3단지 공무 업무자료를 바탕으로 일·주·월 업무와 산출물 구조화. 신규 착공 현장 공무 담당자와 적용 업무 협의",next_action:"기성·공문·회의록 중 우선 자동화 업무 선정",pinned:false,revision:1,source_refs:[],created_at:new Date().toISOString()},{id:'demo:task-6',title:"천안IPC 3·4단지 프로세스맵 적용 검토",project:"프로세스맵 DX",status:'todo',priority:'normal',due_date:addDays(date,3),next_review_on:addDays(date,3),remaining_action:"현장 공정 조건과 지연·예정 산출물 등록 방식 확인",note:"건축·전기·기계 프로세스맵의 공사기간 및 현장별 마일스톤 재배치 기준 검토",next_action:"현장 공정 조건과 지연·예정 산출물 등록 방식 확인",pinned:false,revision:1,source_refs:[],created_at:new Date().toISOString()},{id:'demo:task-7',title:"출역관리 실사용 피드백 정리",project:"출역관리 DX",status:'doing',priority:'normal',due_date:addDays(date,4),next_review_on:addDays(date,4),remaining_action:"입력 중복과 승인 단계 불편사항 취합",note:"안면인식 출입→전일 작업계획→당일 작업검토→출역일보 승인 단계별 협력업체 사용 의견 정리",next_action:"입력 중복과 승인 단계 불편사항 취합",pinned:false,revision:1,source_refs:[],created_at:new Date().toISOString()},{id:'demo:task-8',title:"레미콘 관제 현장 데이터 검증",project:"레미콘 관제",status:'todo',priority:'normal',due_date:addDays(date,5),next_review_on:addDays(date,5),remaining_action:"차량별 실적과 배합정보 대조 항목 정리",note:"계근 데이터·배합표·관제 현황의 비교 기준 검토. 대시보드 표출과 현장 실적 일치 여부 확인 필요",next_action:"차량별 실적과 배합정보 대조 항목 정리",pinned:false,revision:1,source_refs:[],created_at:new Date().toISOString()},{id:'demo:task-9',title:"월간업무보고 자동취합기 오류 검토",project:"업무 자동화",status:'partial',priority:'normal',due_date:addDays(date,6),next_review_on:addDays(date,6),remaining_action:"오류 재현 파일 분리 및 수정 전후 비교",note:"PPTX 원본 슬라이드 크기 혼재 시 오류 가능성 검토. 목차 정렬과 내부 링크 동작 확인",next_action:"오류 재현 파일 분리 및 수정 전후 비교",pinned:false,revision:1,source_refs:[],created_at:new Date().toISOString()},{id:'demo:task-10',title:"OneDrive 기반 공무 업무 폴더 셋업",project:"공무 AX",status:'done',priority:'normal',due_date:addDays(date,-3),next_review_on:addDays(date,-3),remaining_action:"완료",note:"회사 Microsoft 365 OneDrive 동기화와 성장형 폴더 활용 절차를 신규 현장 공무 담당자에게 설명할 자료 정리",next_action:"완료",pinned:false,revision:1,source_refs:[],created_at:new Date().toISOString()}];state.files=[{drive_id:'demo-public',item_id:'report-1',name:"자재관리 시스템 개발방향 검토보고.pdf",folder_path:'DX AX / 업무보고',web_url:'',change_kind:'created',changed_at:new Date(Date.now()-0*3600000).toISOString(),modified_at_source:new Date(Date.now()-0*3600000).toISOString()},{drive_id:'demo-public',item_id:'report-2',name:"공정관리 시스템 업무개선 검토보고.pdf",folder_path:'DX AX / 업무보고',web_url:'',change_kind:'modified',changed_at:new Date(Date.now()-1*3600000).toISOString(),modified_at_source:new Date(Date.now()-1*3600000).toISOString()},{drive_id:'demo-public',item_id:'report-3',name:"공무책임자 AI 에이전트 업무구조화.pdf",folder_path:'DX AX / 업무보고',web_url:'',change_kind:'created',changed_at:new Date(Date.now()-2*3600000).toISOString(),modified_at_source:new Date(Date.now()-2*3600000).toISOString()},{drive_id:'demo-public',item_id:'report-4',name:"천안IPC 프로세스맵 확대 적용 검토.pptx",folder_path:'DX AX / 업무보고',web_url:'',change_kind:'modified',changed_at:new Date(Date.now()-3*3600000).toISOString(),modified_at_source:new Date(Date.now()-3*3600000).toISOString()},{drive_id:'demo-public',item_id:'report-5',name:"출역관리 운영 및 개선사항 보고.pdf",folder_path:'DX AX / 업무보고',web_url:'',change_kind:'created',changed_at:new Date(Date.now()-4*3600000).toISOString(),modified_at_source:new Date(Date.now()-4*3600000).toISOString()},{drive_id:'demo-public',item_id:'report-6',name:"DX 운영체계 TFT 주간업무보고.pptx",folder_path:'DX AX / 업무보고',web_url:'',change_kind:'modified',changed_at:new Date(Date.now()-5*3600000).toISOString(),modified_at_source:new Date(Date.now()-5*3600000).toISOString()},{drive_id:'demo-public',item_id:'report-7',name:"월간업무보고 자동취합기 오류 검토.pdf",folder_path:'DX AX / 업무보고',web_url:'',change_kind:'created',changed_at:new Date(Date.now()-6*3600000).toISOString(),modified_at_source:new Date(Date.now()-6*3600000).toISOString()}];state.fileSummaries=[{drive_id:'demo-public',item_id:'report-1',source_modified_at:new Date(Date.now()-0*3600000).toISOString(),summary:"본사불 발주내역을 기준으로 협력업체 반입 입력, 원청 확인, 공급·반입·잔량 대시보드로 이어지는 관리 흐름을 정리했다. AI 송장 인식 정보가 ERP 발주 항목과 일치하지 않아 수기 검토가 필요한 한계와 개발사 선정 제약도 포함한다.",status:'ok',detail:'실제 수행 업무를 바탕으로 재작성한 공개용 요약이며 원본 문서와 연결되지 않습니다.',checked_at:new Date().toISOString()},{drive_id:'demo-public',item_id:'report-2',source_modified_at:new Date(Date.now()-1*3600000).toISOString(),summary:"현장별 계획·실적 엑셀 양식을 유지하면서 골구도 실적을 주기적으로 반영하고, 자료 미제출과 실제 공정 지연을 구분하여 본사에서 취합·조회하는 개선 방향을 정리했다. 현장 실사용 검증은 향후 확인사항이다.",status:'ok',detail:'실제 수행 업무를 바탕으로 재작성한 공개용 요약이며 원본 문서와 연결되지 않습니다.',checked_at:new Date().toISOString()},{drive_id:'demo-public',item_id:'report-3',source_modified_at:new Date(Date.now()-2*3600000).toISOString(),summary:"과거 공무책임자 수행 업무를 일일·주간·월간 단위로 구분하고 기성, 공문, 계약, 회의, 현안관리의 산출물과 후속 업무를 연결했다. 신규 착공 현장 담당자와 실제 업무를 선정해 단계적으로 검증하는 계획이다.",status:'ok',detail:'실제 수행 업무를 바탕으로 재작성한 공개용 요약이며 원본 문서와 연결되지 않습니다.',checked_at:new Date().toISOString()},{drive_id:'demo-public',item_id:'report-4',source_modified_at:new Date(Date.now()-3*3600000).toISOString(),summary:"건축·전기·기계 공종별 업무를 공정 마일스톤에 배치하고 지연·예정 업무와 산출물을 관리하는 화면 구성을 검토했다. 3·4단지 적용을 위해 현장별 층수·지하층·공사기간 차이 반영이 필요하다.",status:'ok',detail:'실제 수행 업무를 바탕으로 재작성한 공개용 요약이며 원본 문서와 연결되지 않습니다.',checked_at:new Date().toISOString()},{drive_id:'demo-public',item_id:'report-5',source_modified_at:new Date(Date.now()-4*3600000).toISOString(),summary:"안면인식 출입과 전일 작업계획, 당일 작업검토, 출역일보 승인 흐름을 정리하고 협력업체 사용 과정에서의 입력·승인 부담과 운영 개선사항을 점검한다.",status:'ok',detail:'실제 수행 업무를 바탕으로 재작성한 공개용 요약이며 원본 문서와 연결되지 않습니다.',checked_at:new Date().toISOString()},{drive_id:'demo-public',item_id:'report-6',source_modified_at:new Date(Date.now()-5*3600000).toISOString(),summary:"출역관리·자재관리·프로세스맵·레미콘 관제·공무 에이전트의 추진 현황을 실시사항과 예정사항으로 구분했다. 개발 진척과 현장 운영·효과 검증 단계를 혼동하지 않도록 관리한다.",status:'ok',detail:'실제 수행 업무를 바탕으로 재작성한 공개용 요약이며 원본 문서와 연결되지 않습니다.',checked_at:new Date().toISOString()},{drive_id:'demo-public',item_id:'report-7',source_modified_at:new Date(Date.now()-6*3600000).toISOString(),summary:"진행·예정 현장 PPTX 취합 과정의 목차 정렬, 슬라이드 내부 이동 링크, 원본 슬라이드 크기 혼재에 따른 오류를 점검했다. 원본 문제와 프로그램 문제를 구분하기 위한 재현 검증이 남아 있다.",status:'ok',detail:'실제 수행 업무를 바탕으로 재작성한 공개용 요약이며 원본 문서와 연결되지 않습니다.',checked_at:new Date().toISOString()}];state.fileRuns=[{checked_at:new Date().toISOString(),status:'ok',detail:'공개용 업무 보고서 목록이며 실제 OneDrive 수집 결과가 아닙니다.'}];state.links=[{id:'demo:link-1',label:"AX 부트캠프 과제 Slack",url:"https://slack.com/signin",description:"교육 과제 소통 공간 · 로그인 후 소속 워크스페이스 선택"},{id:'demo:link-2',label:"AX 부트캠프 교재",url:"https://drive.google.com/",description:"교육 교재 접근용 Google Drive 로그인 화면"},{id:'demo:link-3',label:"두레이 프로젝트 대화방",url:"https://dooray.com/",description:"두레이 로그인 후 권한 있는 프로젝트 대화방으로 이동"},{id:'demo:link-4',label:"두레이 받은 메일",url:"https://dooray.com/",description:"두레이 로그인 후 메일 메뉴 이용"},{id:'demo:link-5',label:"DXT 주간업무보고",url:"https://www.microsoft365.com/",description:"회사 Microsoft 365 로그인 후 주간업무보고 파일 접근"},{id:'demo:link-6',label:"OneDrive 업무자료",url:"https://onedrive.live.com/",description:"Microsoft 계정 로그인 후 접근 권한에 따라 자료 표시"}];state.events=[{id:'demo:event-1',title:"AX 부트캠프 과제 제출 준비",start_at:addDays(date,0)+'T09:00:00+09:00',end_at:addDays(date,0)+'T11:00:00+09:00',url:'',status:'confirmed',note:"업무보드 데모의 업무 목록·달력·이력·바로가기 점검 및 보안 확인"},{id:'demo:event-2',title:"공정관리 시스템 업무 회의",start_at:addDays(date,1)+'T10:00:00+09:00',end_at:addDays(date,1)+'T11:00:00+09:00',url:'',status:'confirmed',note:"엑셀 원형 유지, 계획·실적 반영, 골구도 입력, 본사 취합 범위 협의"},{id:'demo:event-3',title:"DXT 주간 회의",start_at:addDays(date,2)+'T09:00:00+09:00',end_at:addDays(date,2)+'T10:00:00+09:00',url:'',status:'confirmed',note:"DX 운영체계 과제별 진행·미결·유관부서 요청사항 점검"},{id:'demo:event-4',title:"자재관리 시스템 개발 협의",start_at:addDays(date,3)+'T14:00:00+09:00',end_at:addDays(date,3)+'T15:00:00+09:00',url:'',status:'confirmed',note:"ERP 발주내역 연계, 반입 확인, 잔량 집계, 송장 수기 보완 검토"},{id:'demo:event-5',title:"공무 에이전트 적용업무 선정 회의",start_at:addDays(date,4)+'T10:00:00+09:00',end_at:addDays(date,4)+'T11:00:00+09:00',url:'',status:'confirmed',note:"신규 현장 공무 담당자와 기성·공문·회의록 우선순위 협의"},{id:'demo:event-6',title:"천안IPC 프로세스맵 확대 검토",start_at:addDays(date,5)+'T13:00:00+09:00',end_at:addDays(date,5)+'T14:00:00+09:00',url:'',status:'confirmed',note:"3·4단지 마일스톤 조정 및 공종별 산출물 등록 기준 확인"},{id:'demo:event-7',title:"출역관리 운영 피드백 회의",start_at:addDays(date,6)+'T10:00:00+09:00',end_at:addDays(date,6)+'T11:00:00+09:00',url:'',status:'confirmed',note:"협력업체 입력 부담과 승인 흐름 개선사항 검토"},{id:'demo:event-8',title:"레미콘 관제 실적 대조",start_at:addDays(date,7)+'T15:00:00+09:00',end_at:addDays(date,7)+'T16:00:00+09:00',url:'',status:'confirmed',note:"계근·배합표·관제 화면 데이터 일치 여부 점검"},{id:'demo:event-9',title:"월간업무보고 취합기 재시험",start_at:addDays(date,8)+'T09:00:00+09:00',end_at:addDays(date,8)+'T10:00:00+09:00',url:'',status:'confirmed',note:"슬라이드 크기 혼재 오류 재현과 목차·링크 검증"},{id:'demo:event-10',title:"AX 프런티어 교육 내용 정리",start_at:addDays(date,-5)+'T13:00:00+09:00',end_at:addDays(date,-5)+'T16:00:00+09:00',url:'',status:'confirmed',note:"AI 도구 학습과 현장 업무 적용의 차이, 과제 구현 방향 정리"}];state.history=state.tasks.flatMap((t,i)=>[{id:'history-'+i,task_id:t.id,occurred_at:addDays(date,-(i%8))+'T16:00:00+09:00',actor:'업무 담당',action:'업무 진행 기록',before_data:{...t,status:'todo',note:'검토 착수'},after_data:structuredClone(t)}]);state.messages=[{id:'demo:conversation',task_id:'demo:task-2',body:'공정관리 시스템은 기존 현장 엑셀을 유지하고 골구도 실적과 본사 취합까지 검토하자. 현장 적용 전에는 자료 미제출과 공정 지연을 구분해야 해.',created_at:new Date().toISOString(),resolution_status:'applied',reply:'공정관리 업무의 남은 일로 현장 담당 의견 취합과 적용 범위 확정을 정리했습니다. 실제 운영 및 효과 검증은 별도 단계로 구분했습니다.',resolved_at:new Date().toISOString(),changes:[]}];state.runs=[{summary:'오늘의 주요 업무는 AX 부트캠프 과제 정리, 공정관리 시스템 업무 협의, DXT 주간 회의 안건 준비입니다.\n다가오는 업무: 자재관리 개발 협의, 공무 에이전트 적용 업무 선정, 프로세스맵 확대 검토, 출역관리 피드백, 레미콘 관제 검증, 월간업무보고 취합기 재시험.\n표시된 일정은 실제 수행 업무를 바탕으로 구성한 공개용 업무 계획이며 확정된 개인 캘린더 일정이 아닙니다.',generated_at:new Date().toISOString(),added:0,updated:0,sources:[['dooray-mail','두레이 메일','ok'],['dooray-calendar','두레이 캘린더','ok'],['dooray-favorites','두레이 대화방','ok'],['google-primary','Google 캘린더','ok'],['onedrive','OneDrive','ok']].map(([id,name,status])=>({id,name,status,checked_at:new Date().toISOString(),detail:'공개용 구성 데이터입니다. 해당 외부 서비스와 실시간으로 연결하거나 수집하지 않습니다.'}))}];refresh(true);}else{
 login();
 sessionCheck=createSessionCheck(()=>authDeadline(db.auth.getSession()),result=>{
  if(result.status==='session'){const user=result.session.user;state.user=user;setTimeout(()=>{if(state.user?.id===user.id)void start(user);},0);return;}
  if(state.workspace)return;
  if(result.status==='checking')loginFeedback('이전 로그인 상태를 확인하고 있습니다…');
  else if(result.status==='slow')loginFeedback('로그인 확인이 지연되고 있습니다. 화면은 계속 사용할 수 있으며 연결되면 업무보드가 열립니다.',true);
  else if(result.status==='error')loginFeedback(connectionMessage(result.error),true);
  else loginFeedback('');
 });
 db.auth.onAuthStateChange((event,session)=>{
  const destination=authDestination(event,session,recoveryPending);
  if(destination==='password'){recoveryPending=true;state.user=session.user;setTimeout(()=>{if(recoveryPending&&state.user?.id===session.user.id)showPasswordSetup(session.user);},0);}
  else if(destination==='board'&&!state.workspace)sessionCheck.accept(session);
  else if(destination==='guest'){recoveryPending=false;state.user=null;state.workspace=null;$('#detail').close();login();sessionCheck.accept(null);}
 });
 void sessionCheck.check();
 window.addEventListener('online',()=>{if(!state.workspace)void sessionCheck.check();});
}
