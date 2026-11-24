// Reuse each popup's close button so cleanup, drafts and busy guards stay intact.
export function bindDialogDismiss(dialog){
 let start=null,backdropClick=false;
 const outside=event=>{
  if(event.target!==dialog||!dialog.open)return false;
  const rect=dialog.getBoundingClientRect();
  return event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom;
 };
 const reset=()=>{start=null;backdropClick=false;};
 dialog.addEventListener('pointerdown',event=>{
  reset();
  if(event.isPrimary&&event.button===0&&outside(event))start={id:event.pointerId,x:event.clientX,y:event.clientY};
 });
 dialog.addEventListener('pointerup',event=>{
  backdropClick=Boolean(start&&start.id===event.pointerId&&outside(event)&&Math.hypot(event.clientX-start.x,event.clientY-start.y)<10);
  start=null;
 });
 dialog.addEventListener('pointercancel',reset);
 dialog.addEventListener('close',reset);
 dialog.addEventListener('click',event=>{
  const dismiss=backdropClick&&outside(event);
  reset();
  if(!dismiss)return;
  event.preventDefault();
  event.stopPropagation();
  const close=dialog.querySelector('button[aria-label$="닫기"],button.password-cancel');
  if(close)close.click();
  else if(dialog.dispatchEvent(new Event('cancel',{cancelable:true})))dialog.close();
 });
}
