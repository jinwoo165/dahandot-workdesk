import test from 'node:test';
import assert from 'node:assert/strict';
import {paginate,dateLabel,kstTime,upcomingEvents} from '../src/model.js';
import {fetchWeather,weatherURL} from '../src/widgets.js';
test('pages retain every item, handle empty and clamp after realtime removal',()=>{
 const items=Array.from({length:26},(_,i)=>i);let seen=[];for(let i=0;i<6;i++)seen.push(...paginate(items,i,5).items);assert.deepEqual(seen,items);
 assert.deepEqual(paginate([],4,0),{items:[],page:0,pages:1,total:0,size:1});assert.equal(paginate([1,2],9,1).page,1);assert.equal(paginate(items,-1,5).page,0);
});
test('dates show Korean weekdays across UTC midnight and date-only values',()=>{assert.equal(dateLabel('2026-11-10T15:00:00Z'),'2026-11-11 (수)');assert.equal(dateLabel('2026-11-10'),'2026-11-10 (화)');assert.match(kstTime('2026-11-10T15:00:00Z'),/수/);});
test('30-day horizon excludes boundary, completed all-day events and personal removals',()=>{
 const e=(id,start_at,end_at,extra={})=>({id,start_at,end_at,status:'confirmed',...extra});
 const events=[e('a','2026-11-10T09:00+09:00','2026-11-10T10:00+09:00'),e('b','2026-12-09T23:00+09:00','2026-12-10T01:00+09:00'),e('c','2026-12-10T00:00+09:00','2026-12-10T01:00+09:00'),e('d','2026-11-09T00:00+09:00','2026-11-10T00:00+09:00',{all_day:true}),e('e','2026-11-10T09:00+09:00','2026-11-10T10:00+09:00',{excluded:true}),e('f','2026-11-10T09:00+09:00','2026-11-10T10:00+09:00',{status:'cancelled'})];
 assert.deepEqual(upcomingEvents(events,'2026-11-10').map(x=>x.id),['a','b']);
});
test('each city requests its own coordinates; a city failure does not affect the other',async()=>{
 assert.match(weatherURL('seoul'),/latitude=37.5665&longitude=126.978/);assert.match(weatherURL('cheonan'),/latitude=36.8151&longitude=127.1139/);assert.throws(()=>weatherURL('unknown'));
 const data={timezone:'Asia/Seoul',daily:{time:['2026-11-10','2026-11-11']}};const fetcher=async url=>{if(url.includes('latitude=37.'))throw Error('city unavailable');return{ok:true,json:async()=>data};};
 const r=await Promise.allSettled(['cheonan','seoul'].map(city=>fetchWeather(fetcher,new Date('2026-11-10T01:00Z'),city)));assert.equal(r[0].status,'fulfilled');assert.equal(r[1].status,'rejected');
});
