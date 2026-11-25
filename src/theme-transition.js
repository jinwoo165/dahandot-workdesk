// Theme feedback stays visible even when both palettes use white cards.
export const THEME_REVEAL_DURATION=300;
const REVEAL_EASING='cubic-bezier(.2,0,.2,1)';

export function themeCircle(rect,width,height){
 const x=Math.min(width,Math.max(0,rect?rect.left+rect.width/2:width/2));
 const y=Math.min(height,Math.max(0,rect?rect.top+rect.height/2:height/2));
 return {x,y,radius:Math.ceil(Math.hypot(Math.max(x,width-x),Math.max(y,height-y)))+2};
}

export function createThemeTransition({window:win=window}={}){
 const doc=win.document,root=doc.documentElement;
 const reduced=win.matchMedia('(prefers-reduced-motion: reduce)');
 let current=null,sequence=0;
 function clear(){
  const previous=current;current=null;
  previous?.transition?.skipTransition();
  previous?.animations.forEach(animation=>animation.cancel());
  previous?.wash?.remove();
  root.classList.remove('theme-reveal');
 }
 function finish(id){if(current?.id===id)clear();}
 function settle(){current?.apply();sequence++;clear();}
 function mountWash(id){
  if(current?.id!==id)return;
  const wash=doc.createElement('div');
  wash.className='theme-reveal-wash';
  wash.setAttribute('aria-hidden','true');
  wash.setAttribute('inert','');
  doc.body.append(wash);current.wash=wash;
 }
 function animate(id,circle,native){
  if(current?.id!==id)return;
  const target=native?root:current.wash;
  const reveal=target.animate({clipPath:circle},{
   duration:THEME_REVEAL_DURATION,easing:REVEAL_EASING,fill:'both',
   ...(native?{pseudoElement:'::view-transition-new(root)'}:{})
  });
  current.animations.push(reveal);
  // A brief tint makes the circular edge visible on every light palette.
  const wash=current.wash.animate([
   {opacity:.16,offset:0},{opacity:.16,offset:.65},{opacity:0,offset:1}
  ],{duration:THEME_REVEAL_DURATION,easing:'linear',fill:'both'});
  current.animations.push(wash);
  if(!native)reveal.finished.then(()=>finish(id),()=>finish(id));
 }
 function run(trigger,update,prepare=()=>{}){
  const id=++sequence;
  clear();
  // Measure before the palette menu closes; keyboard selection uses the same origin.
  const {x,y,radius}=themeCircle(trigger?.getBoundingClientRect(),win.innerWidth,win.innerHeight);
  const circle=[`circle(0px at ${x}px ${y}px)`,`circle(${radius}px at ${x}px ${y}px)`];
  prepare();
  let applied=false;
  const apply=()=>{if(id!==sequence||applied)return;applied=true;update();};
  current={id,apply,animations:[]};
  if(reduced.matches||doc.visibilityState==='hidden'){apply();finish(id);return;}
  if(typeof doc.startViewTransition!=='function'){
   apply();mountWash(id);
   try{animate(id,circle,false);}catch{finish(id);}
   return;
  }
  root.classList.add('theme-reveal');
  let transition;
  try{transition=doc.startViewTransition(()=>{apply();mountWash(id);});current.transition=transition;}
  catch{apply();finish(id);return;}
  transition.ready.then(()=>animate(id,circle,true)).catch(()=>{transition.skipTransition();});
  // Skipping the effect must never drop the selected theme or leave an overlay.
  transition.finished.then(()=>{apply();finish(id);},()=>{apply();finish(id);});
 }
 reduced.addEventListener('change',()=>{if(reduced.matches)settle();});
 win.addEventListener('resize',settle);
 win.addEventListener('pagehide',settle);
 return {run,finish:settle};
}
