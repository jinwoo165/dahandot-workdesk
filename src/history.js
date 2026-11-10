import {day} from './model.js';

// Keep month boundaries in the same timezone as the board and its DB query.
export function historyForMonth(items,month){
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))return [];
 return items.filter(h=>Number.isFinite(Date.parse(h.occurred_at))&&day(h.occurred_at).slice(0,7)===month)
  .sort((a,b)=>Date.parse(b.occurred_at)-Date.parse(a.occurred_at)||String(b.id).localeCompare(String(a.id),undefined,{numeric:true}));
}
