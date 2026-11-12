import {upcomingEvents} from './model.js';
import {recentFiles} from './widgets.js';

export const itemVisibilityKey=(kind,drive_id,item_id)=>JSON.stringify([kind,drive_id||'',item_id]);
export const hiddenItems=(preferences,kind)=>preferences.filter(p=>p.kind===kind&&p.hidden_at).sort((a,b)=>String(b.hidden_at).localeCompare(String(a.hidden_at)));
const hiddenKeys=preferences=>new Set(preferences.filter(p=>p.hidden_at).map(p=>itemVisibilityKey(p.kind,p.drive_id,p.item_id)));
export function visibleAgenda(events,preferences,today){
 const keys=hiddenKeys(preferences);
 return upcomingEvents(events,today).filter(e=>!keys.has(itemVisibilityKey('agenda','',e.id)));
}
export function visibleFiles(files,preferences,now){
 const keys=hiddenKeys(preferences);
 // Filter stable file identities before the latest-version selection and 30-file cap.
 return recentFiles(files.filter(f=>!keys.has(itemVisibilityKey('file',f.drive_id,f.item_id))),now);
}
