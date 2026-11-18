import {day,addDays} from './model.js';

export const WEATHER_CITIES=[
 {id:'cheonan',name:'천안',latitude:36.8151,longitude:127.1139},
 {id:'seoul',name:'서울',latitude:37.5665,longitude:126.9780},
 {id:'pocheon',name:'포천',latitude:37.89444,longitude:127.19917},
 {id:'gangwon',name:'강원(춘천)',latitude:37.88302,longitude:127.7289},
 {id:'busan',name:'부산',latitude:35.10168,longitude:129.03004},
 {id:'jeju',name:'제주도(제주시)',latitude:33.50972,longitude:126.52194}
];
export const weatherPageIndex=(page,step=0)=>Math.max(0,Math.min(WEATHER_CITIES.length-1,(Number.isInteger(page)?page:0)+step));
export const weatherURL=city=>{const c=WEATHER_CITIES.find(c=>c.id===city);if(!c)throw Error('지원하지 않는 지역입니다.');return `https://api.open-meteo.com/v1/forecast?latitude=${c.latitude}&longitude=${c.longitude}&current=temperature_2m,weather_code,is_day&daily=weather_code,temperature_2m_min,temperature_2m_max,precipitation_probability_max&timezone=Asia%2FSeoul&forecast_days=2`;};
const number=n=>typeof n==='number'&&Number.isFinite(n)?n:null;
export const degrees=n=>number(n)===null?'—':Math.round(n)+'°';
export function weatherDescription(code,isDay=true){
 if(code===0)return {label:'맑음',icon:isDay?'☀':'☾'};
 if(code===1)return {label:'대체로 맑음',icon:'🌤'};
 if(code===2)return {label:'구름 조금',icon:'⛅'};
 if(code===3)return {label:'흐림',icon:'☁'};
 if([45,48].includes(code))return {label:'안개',icon:'🌫'};
 if([51,53,55,56,57].includes(code))return {label:'이슬비',icon:'🌦'};
 if([61,63,65,66,67,80,81,82].includes(code))return {label:'비',icon:'🌧'};
 if([71,73,75,77,85,86].includes(code))return {label:'눈',icon:'🌨'};
 if([95,96,99].includes(code))return {label:'뇌우',icon:'⛈'};
 return {label:'정보 없음',icon:'◌'};
}
export function parseWeather(data,now=new Date()){
 const today=day(now),daily=data?.daily;
 if(data?.timezone!=='Asia/Seoul'||!Array.isArray(daily?.time))throw Error('날씨 응답을 확인하지 못했습니다.');
 const days=[today,addDays(today,1)].map(date=>{
   const i=daily.time.indexOf(date);if(i<0)throw Error('오늘·내일 예보를 다시 확인해야 합니다.');
   return {date,code:number(daily.weather_code?.[i]),min:number(daily.temperature_2m_min?.[i]),max:number(daily.temperature_2m_max?.[i]),rain:number(daily.precipitation_probability_max?.[i])};
 });
 const current=data.current?.time?.startsWith(today)?{temperature:number(data.current.temperature_2m),code:number(data.current.weather_code),isDay:data.current.is_day!==0,time:data.current.time}:null;
 return {days,current,fetchedAt:new Date(now).toISOString()};
}
export async function fetchWeather(fetcher=fetch,now=new Date(),city='cheonan'){
 const response=await fetcher(weatherURL(city),{cache:'no-store',signal:AbortSignal.timeout(10000),credentials:'omit',referrerPolicy:'no-referrer'});
 if(!response.ok)throw Error('날씨 서비스에 연결하지 못했습니다.');
 return parseWeather(await response.json(),now);
}
// One request updates the whole weather card; each city's payload stays independent.
export async function fetchAllWeather(fetcher=fetch,now=new Date(),timeoutMs=15000){
 const url=new URL(weatherURL('cheonan'));
 url.searchParams.set('latitude',WEATHER_CITIES.map(c=>c.latitude).join(','));
 url.searchParams.set('longitude',WEATHER_CITIES.map(c=>c.longitude).join(','));
 let payload;
 for(let attempt=0;attempt<2;attempt++){
  const controller=new AbortController();let timer;
  try{
   payload=await Promise.race([(async()=>{
    const response=await fetcher(url.href,{cache:'no-store',signal:controller.signal,credentials:'omit',referrerPolicy:'no-referrer'});
    if(!response.ok)throw Error('날씨 서비스 연결 실패');
    return response.json();
   })(),new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('날씨 서비스 응답 지연'));},timeoutMs);})]);
   break;
  }catch(error){if(attempt===1)throw error;}
  finally{clearTimeout(timer);}
 }
 if(!Array.isArray(payload)||payload.length!==WEATHER_CITIES.length)throw Error('지역별 날씨 응답을 확인하지 못했습니다.');
 return payload.map(data=>{try{return {status:'fulfilled',value:parseWeather(data,now)};}catch(reason){return {status:'rejected',reason};}});
}
export const RECENT_FILES_LIMIT=30;
// Show up to 30 latest files after deduplication. Earlier changes remain stored.
export function recentFiles(items,now=new Date()){
 const seen=new Set();
 return [...items].filter(f=>Number.isFinite(Date.parse(f.changed_at))&&Date.parse(f.changed_at)<=+new Date(now)+300000)
 .sort((a,b)=>Date.parse(b.changed_at)-Date.parse(a.changed_at)||String(a.item_id).localeCompare(String(b.item_id)))
 .filter(f=>{const k=f.drive_id+':'+f.item_id;if(seen.has(k))return false;seen.add(k);return true;}).slice(0,RECENT_FILES_LIMIT);
}
export function fileKind(name){const ext=String(name).split('.').pop().toLowerCase();return {xlsx:'XLS',xls:'XLS',csv:'CSV',pptx:'PPT',ppt:'PPT',docx:'DOC',doc:'DOC',pdf:'PDF',txt:'TXT',html:'WEB',png:'IMG',jpg:'IMG',jpeg:'IMG',zip:'ZIP'}[ext]||'FILE';}
