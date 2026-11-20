// Optimistic revisions prevent a stale device from replacing another draft.
export class UserSync {
 constructor({read,write,storage,scope,changed=()=>{}}){
  Object.assign(this,{read,write,storage,scope,changed});this.remote=new Map();this.pending=new Map();this.conflicts=new Map();this.running=null;this.error='';
  try{for(const [k,v] of JSON.parse(storage?.getItem(scope)||'[]'))this.pending.set(k,v);}catch{}
 }
 persist(){try{this.storage?.setItem(this.scope,JSON.stringify([...this.pending]));}catch{}}
 get(key){return this.pending.get(key)?.value??this.remote.get(key)?.value;}
 keys(){return new Set([...this.remote.keys(),...this.pending.keys()]);}
 set(key,value){const previous=this.pending.get(key);this.pending.set(key,{value,revision:previous?.revision??this.remote.get(key)?.revision??0,token:crypto.randomUUID()});this.persist();this.changed();}
 async load(){
  const rows=await this.read();for(const row of rows){const previous=this.remote.get(row.state_key);if(!previous||row.revision>=previous.revision)this.remote.set(row.state_key,row);}
  this.changed();await this.flush();
 }
 async flush(){
  if(this.running){await this.running;return this.flush();}
  this.running=this.drain();try{await this.running;}finally{this.running=null;}
 }
 async drain(){
  for(const [key,entry] of this.pending){
   if(this.conflicts.has(key))continue;
   try{
    const result=await this.write(key,entry.value,entry.revision);this.error='';
    if(result.row)this.remote.set(key,result.row);
    if(!result.ok){if(key.startsWith('pref:')){this.pending.delete(key);this.persist();}else this.conflicts.set(key,result.row);this.changed();continue;}
    const latest=this.pending.get(key);
    if(latest?.token===entry.token)this.pending.delete(key);
    else if(latest)latest.revision=result.row.revision;
    this.persist();this.changed();
   }catch{this.error='연결을 확인해 주세요. 변경 내용은 이 기기에 보관 중이며 다시 연결하면 동기화합니다.';this.changed();break;}
  }
 }
 resolve(key,useLocal){const remote=this.conflicts.get(key);if(!remote)return;this.conflicts.delete(key);if(useLocal){const entry=this.pending.get(key);if(entry)entry.revision=remote.revision;}else this.pending.delete(key);this.persist();this.changed();return this.flush();}
}
