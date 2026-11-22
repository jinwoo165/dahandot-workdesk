const EDGE=16;
const clamp=(value,min,max)=>Math.min(Math.max(value,min),max);

export function floatingBounds(width,height,buttonWidth,buttonHeight){
 return {left:EDGE,top:EDGE,right:Math.max(EDGE,width-buttonWidth-EDGE),bottom:Math.max(EDGE,height-buttonHeight-EDGE-8)};
}
export function floatingPosition(position,bounds){
 const valid=position&&Number.isFinite(position.x)&&Number.isFinite(position.y);
 return {x:bounds.left+(bounds.right-bounds.left)*(valid?clamp(position.x,0,1):1),y:bounds.top+(bounds.bottom-bounds.top)*(valid?clamp(position.y,0,1):1)};
}
export function relativePosition(point,bounds){
 return {x:clamp((point.x-bounds.left)/(bounds.right-bounds.left||1),0,1),y:clamp((point.y-bounds.top)/(bounds.bottom-bounds.top||1),0,1)};
}

// Kept outside the rerendered dashboard so refreshes cannot interrupt a drag.
export function createFloatingComposer({onOpen,icon}){
 const button=document.createElement('button');
 button.type='button';button.className='floating-compose';button.hidden=true;
 button.setAttribute('aria-label','대화 하기');
 button.title='클릭하여 대화 · 드래그하여 이동 · 방향키로 이동 · Home 키로 기본 위치';
 button.innerHTML=`${icon}<span>대화 하기</span>`;
 const desktop=matchMedia('(min-width:901px)');
 let scope='',position=null,drag=null,suppressClick=false;
 const bounds=()=>floatingBounds(window.innerWidth,window.innerHeight,button.offsetWidth,button.offsetHeight);
 const paint=point=>{button.style.left=point.x+'px';button.style.top=point.y+'px';};
 const place=()=>{if(!button.hidden&&desktop.matches&&!drag)paint(floatingPosition(position,bounds()));};
 const save=()=>{try{localStorage.setItem('dahandot-chat-position:'+scope,JSON.stringify(position));}catch{}};
 const endDrag=cancel=>{
  if(!drag)return;
  const previous=drag;drag=null;
  if(previous.moved){
   suppressClick=true;
   if(cancel)position=previous.position;else save();
  }
  button.classList.remove('is-dragging');
  if(button.hasPointerCapture(previous.id))button.releasePointerCapture(previous.id);
  place();
 };
 button.addEventListener('pointerdown',event=>{
  if(!desktop.matches||!event.isPrimary||event.button!==0||drag)return;
  suppressClick=false;
  const rect=button.getBoundingClientRect();
  drag={id:event.pointerId,x:event.clientX,y:event.clientY,left:rect.left,top:rect.top,position,moved:false};
  button.setPointerCapture(event.pointerId);
 });
 button.addEventListener('pointermove',event=>{
  if(!drag||drag.id!==event.pointerId)return;
  const dx=event.clientX-drag.x,dy=event.clientY-drag.y;
  if(!drag.moved&&Math.hypot(dx,dy)<6)return;
  drag.moved=true;event.preventDefault();button.classList.add('is-dragging');
  const area=bounds();
  position=relativePosition({x:drag.left+dx,y:drag.top+dy},area);
  paint(floatingPosition(position,area));
 });
 button.addEventListener('pointerup',event=>{if(drag?.id===event.pointerId)endDrag(false);});
 button.addEventListener('pointercancel',()=>endDrag(true));
 button.addEventListener('lostpointercapture',()=>endDrag(true));
 button.addEventListener('click',event=>{
  if(suppressClick&&event.detail!==0){suppressClick=false;event.preventDefault();return;}
  suppressClick=false;onOpen();
 });
 button.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&drag){event.preventDefault();endDrag(true);return;}
  const offset={ArrowLeft:[-16,0],ArrowRight:[16,0],ArrowUp:[0,-16],ArrowDown:[0,16]}[event.key];
  if(!offset&&event.key!=='Home')return;
  event.preventDefault();endDrag(true);
  if(offset){const area=bounds(),point=floatingPosition(position,area);position=relativePosition({x:point.x+offset[0],y:point.y+offset[1]},area);}else position=null;
  save();place();
 });
 window.addEventListener('resize',()=>{endDrag(true);place();});
 window.addEventListener('blur',()=>endDrag(true));
 desktop.addEventListener('change',()=>{endDrag(true);place();});
 return {
  show(nextScope){
   if(scope!==nextScope){endDrag(true);scope=nextScope;position=null;try{position=JSON.parse(localStorage.getItem('dahandot-chat-position:'+scope));}catch{}}
   if(!button.isConnected)document.body.append(button);
   button.hidden=false;place();
  },
  hide(){endDrag(true);button.hidden=true;}
 };
}
