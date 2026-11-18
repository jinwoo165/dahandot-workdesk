import test from 'node:test';
import assert from 'node:assert/strict';
import {parseWeather,degrees,weatherDescription,recentFiles,fetchWeather} from '../src/widgets.js';
const now=new Date('2026-11-10T02:00:00Z');
const forecast={timezone:'Asia/Seoul',current:{time:'2026-11-10T11:00',temperature_2m:0,weather_code:0,is_day:1},daily:{time:['2026-11-10','2026-11-11'],weather_code:[0,3],temperature_2m_min:[-2,null],temperature_2m_max:[10,12],precipitation_probability_max:[0,null]}};
test('weather preserves zero and missing readings instead of inventing values',()=>{const w=parseWeather(forecast,now);assert.equal(degrees(w.current.temperature),'0°');assert.equal(w.days[1].min,null);assert.equal(degrees(w.days[1].min),'—');assert.equal(w.days[1].rain,null);assert.equal(weatherDescription(w.current.code).label,'맑음');});
test('Korean midnight rejects yesterday cache, stale current and incomplete tomorrow',()=>{assert.throws(()=>parseWeather(forecast,new Date('2026-11-10T15:00:00Z')));assert.equal(parseWeather({...forecast,current:{...forecast.current,time:'2026-11-09T23:00'}},now).current,null);assert.throws(()=>parseWeather({...forecast,timezone:'UTC'},now));});
test('weather network and API errors remain failures',async()=>{await assert.rejects(fetchWeather(async()=>({ok:false}),now));await assert.rejects(fetchWeather(async()=>{throw Error('offline');},now));assert.equal((await fetchWeather(async()=>({ok:true,json:async()=>forecast}),now)).days.length,2);});
test('latest changes deduplicate by drive and item, not filename; retain old and exclude future',()=>{const f=(drive_id,item_id,changed_at)=>({drive_id,item_id,name:'same.xlsx',changed_at});const items=[f('a','1','2026-11-09T01:00Z'),f('a','1','2026-11-10T01:00Z'),f('b','1','2026-11-10T00:00Z'),f('a','2','2026-10-01T00:00Z'),f('a','3','2026-12-01T00:00Z')];const result=recentFiles(items,now);assert.equal(result.length,3);assert.equal(result[0].changed_at,'2026-11-10T01:00Z');assert.equal(result[1].drive_id,'b');assert.equal(items.length,5);});

test('whole-card refresh maps all six regions and retries a transient connection failure',async()=>{
 const {fetchAllWeather,WEATHER_CITIES}=await import('../src/widgets.js');let calls=0;
 const result=await fetchAllWeather(async(url,options)=>{
  calls++;assert.equal(new URL(url).searchParams.get('latitude').split(',').length,6);assert.equal(options.cache,'no-store');
  if(calls===1)throw Error('temporary network failure');
  return {ok:true,json:async()=>WEATHER_CITIES.map((_,i)=>({...forecast,current:{...forecast.current,temperature_2m:i}}))};
 },now);
 assert.equal(calls,2);assert.deepEqual(result.map(r=>r.value.current.temperature),[0,1,2,3,4,5]);
});
test('a hung response body is bounded and a subsequent whole-card retry can succeed',async()=>{
 const {fetchAllWeather,WEATHER_CITIES}=await import('../src/widgets.js');let calls=0;
 await assert.rejects(fetchAllWeather(async()=>{calls++;return {ok:true,json:()=>new Promise(()=>{})};},now,5),/응답 지연/);
 assert.equal(calls,2);
 const result=await fetchAllWeather(async()=>({ok:true,json:async()=>WEATHER_CITIES.map(()=>forecast)}),now);
 assert.equal(result.filter(r=>r.status==='fulfilled').length,6);
});
test('a malformed region remains failed without discarding other regional forecasts',async()=>{
 const {fetchAllWeather,WEATHER_CITIES}=await import('../src/widgets.js');
 const result=await fetchAllWeather(async()=>({ok:true,json:async()=>WEATHER_CITIES.map((_,i)=>i===2?{}:forecast)}),now);
 assert.equal(result[2].status,'rejected');assert.equal(result.filter(r=>r.status==='fulfilled').length,5);
});
