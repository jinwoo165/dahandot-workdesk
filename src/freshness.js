// NEW marks unread additions (or file revisions), not ordinary background checks.
export const freshKey=(kind,id,stamp)=>JSON.stringify([kind,id,stamp||'']);
export function isFresh(stamp,key,seen,now=Date.now()){
 const time=Date.parse(stamp);
 return Number.isFinite(time)&&time<=now+300000&&time>=now-7*86400000&&!seen[key];
}
export function orderedLinks(items){
 return [...items].sort((a,b)=>Number(Boolean(b.pinned_at))-Number(Boolean(a.pinned_at))||
  (a.pinned_at&&b.pinned_at?Date.parse(a.pinned_at)-Date.parse(b.pinned_at):0)||
  (Date.parse(b.added_at)||0)-(Date.parse(a.added_at)||0)||
  (b.sort_order||0)-(a.sort_order||0)||String(a.id).localeCompare(String(b.id)));
}
