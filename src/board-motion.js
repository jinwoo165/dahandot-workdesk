export const PROGRESS_DURATION=5000;
const bounded=value=>Math.min(1,Math.max(0,value));

// The arc travels at 20 percentage points per second, then stops at completion.
export function progressDuration(percent){
 const value=Number(percent);
 return Number.isFinite(value)?PROGRESS_DURATION*bounded(value/100):0;
}

// One clock per page load or explicit refresh, independent of dashboard rerenders.
// No storage: F5/browser reload intentionally replays the introduction.
export class IntroTimeline{
 constructor(duration){this.duration=duration;this.start=null;this.signature=null;this.finished=false;}
 sample(signature,now,{animate=true}={}){
  if(this.finished)return 1;
  if(!animate||this.duration<=0){this.finished=true;return 1;}
  if(this.start===null){this.start=now;this.signature=signature;}
  if(this.signature!==signature){this.finished=true;return 1;}
  const fraction=bounded((now-this.start)/this.duration);
  if(fraction===1)this.finished=true;
  return fraction;
 }
}
export function progressFrame(value,fraction){return Math.floor(Number(value)*bounded(fraction));}
// A higher digit only turns when the lower digits carry (09 -> 10).
export function rollingPositions(value,fraction){
 const raw=Number(value)*bounded(fraction),width=String(Math.floor(Number(value))).length;
 return Array.from({length:width},(_,index)=>{
  const power=10**(width-index-1),digit=Math.floor(raw/power)%10;
  return digit+(power===1?raw-Math.floor(raw):Math.max(0,raw%power-(power-1)));
 });
}
function paintCount(item,fraction){
 if(fraction>=1){item.node.textContent=String(item.value);item.digits=null;return;}
 if(!item.digits){
  const doc=item.node.ownerDocument;
  item.digits=rollingPositions(item.value,0).map(()=>{
   const slot=doc.createElement('span'),track=doc.createElement('span');
   slot.className='motion-digit';track.className='motion-digit-track';
   for(let i=0;i<=10;i++){const digit=doc.createElement('span');digit.textContent=String(i%10);track.append(digit);}
   slot.append(track);return {slot,track};
  });
  item.node.replaceChildren(...item.digits.map(d=>d.slot));
 }
 rollingPositions(item.value,fraction).forEach((position,index)=>{item.digits[index].track.style.transform=`translateY(${-position*100/11}%)`;});
}
export function ringFrame(percent,fraction){
 const value=Number(percent)*bounded(fraction),angle=value/100*2*Math.PI-Math.PI/2;
 return {dasharray:`${value} 100`,x:60+51*Math.cos(angle),y:60+51*Math.sin(angle),visible:value>0};
}

export function createBoardMotion({window:win=window}={}){
 const desktop=win.matchMedia('(min-width:901px)'),reduced=win.matchMedia('(prefers-reduced-motion: reduce)');
 let scope=null,root=null,frame=0,progress,counts=[],arc=null,dot=null,percent=0;
 const stop=()=>{if(frame)win.cancelAnimationFrame(frame);frame=0;};
 function paintRing(fraction){
  if(!arc)return;
  const value=ringFrame(percent,fraction);arc.setAttribute('stroke-dasharray',value.dasharray);
  if(dot){dot.setAttribute('cx',value.x);dot.setAttribute('cy',value.y);dot.style.opacity=value.visible?'1':'0';}
 }
 function finishVisible(){
  counts.forEach(item=>{if(item.node.isConnected)item.node.textContent=item.value;});paintRing(1);
 }
 function tick(now){
  frame=0;
  if(!root?.isConnected)return;
  if(!desktop.matches){finishVisible();return;}
  if(reduced.matches){progress.finished=true;finishVisible();return;}
  if(!counts.length)return;
  const signature=JSON.stringify([counts.map(item=>item.value),percent]);
  const fraction=progress.sample(signature,now);
  counts.forEach(item=>paintCount(item,fraction));
  paintRing(fraction);
  if(fraction<1)frame=win.requestAnimationFrame(tick);
 }
 function refresh(nextRoot,nextScope){
  stop();root=nextRoot;
  counts=[...root.querySelectorAll('[data-count-to]')].map(node=>({node,value:Number(node.dataset.countTo)}));
  arc=root.querySelector('[data-progress-arc]');dot=root.querySelector('[data-progress-dot]');percent=Number(arc?.dataset.progressArc||0);
  if(scope!==nextScope){scope=nextScope;progress=new IntroTimeline(progressDuration(percent));}
  tick(win.performance.now());
 }
 desktop.addEventListener('change',()=>{if(root?.isConnected)refresh(root,scope);});
 reduced.addEventListener('change',()=>{if(root?.isConnected)refresh(root,scope);});
 return {refresh,reset(){stop();scope=null;root=null;counts=[];arc=null;dot=null;}};
}
