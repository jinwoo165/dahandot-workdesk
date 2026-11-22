export const BRIEFING_DURATION=4500;
export const PROGRESS_DURATION=10000;
const bounded=value=>Math.min(1,Math.max(0,value));

// One clock per page load or explicit refresh, independent of dashboard rerenders.
// No storage: F5/browser reload intentionally replays the introduction.
export class IntroTimeline{
 constructor(duration){this.duration=duration;this.start=null;this.signature=null;this.finished=false;}
 sample(signature,now,{animate=true}={}){
  if(this.finished)return 1;
  if(!animate){this.finished=true;return 1;}
  if(this.start===null){this.start=now;this.signature=signature;}
  if(this.signature!==signature){this.finished=true;return 1;}
  const fraction=bounded((now-this.start)/this.duration);
  if(fraction===1)this.finished=true;
  return fraction;
 }
}
export function typedLengths(lengths,fraction){
 let remaining=Math.ceil(lengths.reduce((sum,n)=>sum+n,0)*bounded(fraction));
 return lengths.map(length=>{const shown=Math.min(length,remaining);remaining-=shown;return shown;});
}
export function progressFrame(value,fraction){return Math.floor(Number(value)*bounded(fraction));}
export function ringFrame(percent,fraction){
 const value=Number(percent)*bounded(fraction),angle=value/100*2*Math.PI-Math.PI/2;
 return {dasharray:`${value} 100`,x:60+51*Math.cos(angle),y:60+51*Math.sin(angle),visible:value>0};
}

export function createBoardMotion({window:win=window,document:doc=document}={}){
 const desktop=win.matchMedia('(min-width:901px)'),reduced=win.matchMedia('(prefers-reduced-motion: reduce)');
 const segmenter=typeof Intl.Segmenter==='function'?new Intl.Segmenter('ko',{granularity:'grapheme'}):null;
 const letters=text=>segmenter?[...segmenter.segment(text)].map(item=>item.segment):Array.from(text);
 let scope=null,root=null,frame=0,briefing,progress,typed=[],counts=[],arc=null,dot=null,percent=0;
 const stop=()=>{if(frame)win.cancelAnimationFrame(frame);frame=0;};
 const restoreText=()=>{typed.forEach(item=>{if(item.node.isConnected){item.node.textContent=item.text;item.node.classList.remove('motion-type-line');}});typed=[];};
 function paintRing(fraction){
  if(!arc)return;
  const value=ringFrame(percent,fraction);arc.setAttribute('stroke-dasharray',value.dasharray);
  if(dot){dot.setAttribute('cx',value.x);dot.setAttribute('cy',value.y);dot.style.opacity=value.visible?'1':'0';}
 }
 function finishVisible(){
  restoreText();counts.forEach(item=>{if(item.node.isConnected)item.node.textContent=item.value;});paintRing(1);
 }
 function tick(now){
  frame=0;
  if(!root?.isConnected)return;
  if(!desktop.matches){finishVisible();return;}
  if(reduced.matches){briefing.finished=true;progress.finished=true;finishVisible();return;}
  let pending=false;
  if(typed.length){
   const fraction=briefing.sample(typed.map(item=>item.text).join('\n'),now);
   if(fraction===1)restoreText();
   else{
    const lengths=typedLengths(typed.map(item=>item.chars.length),fraction);
    typed.forEach((item,index)=>{const text=item.chars.slice(0,lengths[index]).join('');if(item.live.textContent!==text)item.live.textContent=text;});
    pending=true;
   }
  }
  if(counts.length){
   const signature=JSON.stringify([counts.map(item=>item.value),percent]);
   const fraction=progress.sample(signature,now);
   counts.forEach(item=>{const text=String(progressFrame(item.value,fraction));if(item.node.textContent!==text)item.node.textContent=text;});
   paintRing(fraction);pending||=fraction<1;
  }
  if(pending)frame=win.requestAnimationFrame(tick);
 }
 function refresh(nextRoot,nextScope){
  stop();restoreText();root=nextRoot;
  if(scope!==nextScope){scope=nextScope;briefing=new IntroTimeline(BRIEFING_DURATION);progress=new IntroTimeline(PROGRESS_DURATION);}
  counts=[...root.querySelectorAll('[data-count-to]')].map(node=>({node,value:Number(node.dataset.countTo)}));
  arc=root.querySelector('[data-progress-arc]');dot=root.querySelector('[data-progress-dot]');percent=Number(arc?.dataset.progressArc||0);
  if(!desktop.matches){finishVisible();return;}
  const nodes=[...root.querySelectorAll('[data-type-line]')];
  if(!briefing.finished&&!reduced.matches&&nodes.length){
   typed=nodes.map(node=>{
    const text=node.textContent,reserve=doc.createElement('span'),live=doc.createElement('span');
    reserve.className='motion-type-reserve';reserve.textContent=text;
    live.className='motion-type-live';live.setAttribute('aria-hidden','true');
    node.classList.add('motion-type-line');node.replaceChildren(reserve,live);
    return {node,text,chars:letters(text),live};
   });
  }
  tick(win.performance.now());
 }
 desktop.addEventListener('change',()=>{if(root?.isConnected)refresh(root,scope);});
 reduced.addEventListener('change',()=>{if(root?.isConnected)refresh(root,scope);});
 return {refresh,reset(){stop();restoreText();scope=null;root=null;counts=[];arc=null;dot=null;}};
}
