import test from 'node:test';
import assert from 'node:assert/strict';
import {itemVisibilityKey,hiddenItems,visibleFiles,visibleAgenda} from '../src/item-visibility.js';
import {WEATHER_CITIES,weatherPageIndex,weatherURL,fetchWeather} from '../src/widgets.js';

const now=new Date('2026-11-12T12:00:00+09:00');
const pref=(kind,drive_id,item_id)=>({kind,drive_id,item_id,hidden_at:now.toISOString()});
test('hidden files stay hidden across versions and names without affecting a different drive',()=>{
 const files=[{drive_id:'one',item_id:'same',name:'renamed.pdf',changed_at:now.toISOString()},{drive_id:'two',item_id:'same',name:'renamed.pdf',changed_at:now.toISOString()}];
 assert.deepEqual(visibleFiles(files,[pref('file','one','same')],now).map(f=>f.drive_id),['two']);
 assert.equal(files.length,2);
 assert.notEqual(itemVisibilityKey('file','a:b','c'),itemVisibilityKey('file','a','b:c'));
});
test('the visible file cap is applied after hiding and deduplicating, so older eligible files fill gaps',()=>{
 const files=Array.from({length:35},(_,i)=>({drive_id:'drive',item_id:String(i),changed_at:new Date(+now-i*60000).toISOString()}));
 files.push({...files[0],changed_at:new Date(+now-10000000).toISOString()});
 const visible=visibleFiles(files,[pref('file','drive','0'),pref('file','drive','1')],now);
 assert.equal(visible.length,30);assert.equal(visible[0].item_id,'2');assert.equal(visible.at(-1).item_id,'31');
});
test('restoring a file respects the seven-day window and never creates a stale card',()=>{
 const file={drive_id:'drive',item_id:'old',changed_at:'2026-10-01T00:00:00Z'};
 const preferences=[{...pref('file','drive','old'),hidden_at:null}];
 assert.equal(visibleFiles([file],preferences,now).length,0);assert.equal(hiddenItems(preferences,'file').length,0);
});
test('agenda hiding is independent of calendar data, cancellation, and personal exclusion',()=>{
 const event={id:'event',start_at:'2026-11-12T10:00:00+09:00',end_at:'2026-11-12T11:00:00+09:00',status:'confirmed'};
 const hidden=pref('agenda','','event');
 assert.deepEqual(visibleAgenda([event],[hidden],'2026-11-12'),[]);
 assert.equal(event.status,'confirmed');assert.equal(event.excluded,undefined);
 assert.equal(visibleAgenda([event],[{...hidden,hidden_at:null}],'2026-11-12').length,1);
 assert.equal(visibleAgenda([{...event,status:'cancelled'}],[],'2026-11-12').length,0);
 assert.equal(visibleAgenda([{...event,excluded:true}],[],'2026-11-12').length,0);
});
test('weather pages start at Cheonan, visit all requested regions in order, and stop at the ends',()=>{
 assert.deepEqual(WEATHER_CITIES.map(c=>c.id),['cheonan','seoul','pocheon','gangwon','busan','jeju']);
 assert.equal(weatherPageIndex(undefined),0);assert.equal(weatherPageIndex(0,-1),0);assert.equal(weatherPageIndex(5,1),5);
 assert.deepEqual([0,1,2,3,4].map(i=>weatherPageIndex(i,1)),[1,2,3,4,5]);
 assert.match(weatherURL('pocheon'),/latitude=37.89444/);
 assert.match(weatherURL('gangwon'),/latitude=37.88302/);
});
test('one failed region does not discard other weather pages',async()=>{
 const data={timezone:'Asia/Seoul',daily:{time:['2026-11-12','2026-11-13']}};
 const fetcher=async url=>{if(url===weatherURL('gangwon'))throw Error('unavailable');return {ok:true,json:async()=>data};};
 const results=await Promise.allSettled(WEATHER_CITIES.map(c=>fetchWeather(fetcher,now,c.id)));
 assert.equal(results.filter(r=>r.status==='fulfilled').length,5);assert.equal(results[3].status,'rejected');
});
