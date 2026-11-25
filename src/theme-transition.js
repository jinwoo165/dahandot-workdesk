// Keep theme changes separate from navigation and card entrance animations.
export const THEME_REVEAL_DURATION=300;
const FADE_DURATION=180;

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
  previous?.animation?.cancel();
  if(previous?.timer)win.clearTimeout(previous.timer);
  root.classList.remove('theme-reveal','theme-fade');
 }
 function finish(id){if(current?.id===id)clear();}
 function settle(){current?.apply();sequence++;clear();}
 function run(trigger,update,prepare=()=>{}){
  const id=++sequence;
  clear();
  // Measure before the palette menu closes; keyboard selection uses the same origin.
  const {x,y,radius}=themeCircle(trigger?.getBoundingClientRect(),win.innerWidth,win.innerHeight);
  prepare();
  let applied=false;
  const apply=()=>{if(id!==sequence||applied)return;applied=true;update();};
  current={id,apply};
  if(reduced.matches||doc.visibilityState==='hidden'){apply();finish(id);return;}
  if(typeof doc.startViewTransition!=='function'){
   root.classList.add('theme-fade');
   // Establish the transition before applying the new CSS variables.
   void root.offsetWidth;
   apply();
   current.timer=win.setTimeout(()=>finish(id),FADE_DURATION);
   return;
  }
  root.classList.add('theme-reveal');
  let transition;
  try{transition=doc.startViewTransition(apply);current.transition=transition;}
  catch{apply();finish(id);return;}
  transition.ready.then(()=>{
   if(current?.id!==id)return;
   current.animation=root.animate({
    clipPath:[`circle(0px at ${x}px ${y}px)`,`circle(${radius}px at ${x}px ${y}px)`]
   },{duration:THEME_REVEAL_DURATION,easing:'cubic-bezier(.2,0,.2,1)',pseudoElement:'::view-transition-new(root)',fill:'both'});
  }).catch(()=>{transition.skipTransition();});
  // A skipped/unsupported animation must never prevent the selected theme applying.
  transition.finished.then(()=>{apply();finish(id);},()=>{apply();finish(id);});
 }
 reduced.addEventListener('change',()=>{if(reduced.matches)settle();});
 win.addEventListener('resize',settle);
 win.addEventListener('pagehide',settle);
 return {run,finish:settle};
}
