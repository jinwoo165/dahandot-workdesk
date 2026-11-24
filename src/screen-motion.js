// A viewport curtain includes the logo, sidebar and floating controls without
// changing the containing block or clipping native dialogs/popovers.
export function screenCircle(width,height){
 const x=Math.min(64,width*.12),y=Math.min(64,height*.12);
 return {x,y,radius:Math.ceil(Math.hypot(Math.max(x,width-x),Math.max(y,height-y)))+2};
}

export function createScreenMotion({window:win=window}={}){
 const doc=win.document,reduced=win.matchMedia('(prefers-reduced-motion: reduce)');
 let curtain=null,hole=null,rim=null,frame=0,flight=null,radius=null,openingStart=null;
 const geometry=()=>screenCircle(win.innerWidth,win.innerHeight);
 function paint(value){
  const {x,y}=geometry();radius=value;
  for(const circle of [hole,rim]){circle?.setAttribute('cx',x);circle?.setAttribute('cy',y);circle?.setAttribute('r',Math.max(0,value));}
 }
 function mount(){
  if(curtain)return;
  curtain=doc.createElement('div');curtain.className='screen-motion-curtain';curtain.setAttribute('aria-hidden','true');curtain.setAttribute('inert','');
  curtain.innerHTML='<svg width="100%" height="100%"><defs><mask id="screen-motion-mask" maskUnits="userSpaceOnUse"><rect width="100%" height="100%" fill="white"/><circle class="screen-motion-hole" fill="black" r="0"/></mask></defs><rect width="100%" height="100%" fill="#141b22" mask="url(#screen-motion-mask)"/><circle class="screen-motion-rim" fill="none" stroke="rgba(255,255,255,.16)" stroke-width="2" r="0"/></svg>';
  doc.body.append(curtain);hole=curtain.querySelector('.screen-motion-hole');rim=curtain.querySelector('.screen-motion-rim');
 }
 function settle(){if(frame)win.cancelAnimationFrame(frame);frame=0;const previous=flight;flight=null;previous?.resolve();}
 function clear(){settle();curtain?.remove();curtain=hole=rim=null;radius=null;openingStart=null;doc.documentElement.classList.remove('screen-motion-active');}
 function run(open,duration,start=win.performance.now()){
  settle();mount();doc.documentElement.classList.add('screen-motion-active');
  const from=open?0:(radius??geometry().radius);
  openingStart=open?start:null;
  const promise=new Promise(resolve=>{flight={resolve,open,start,duration,from};});
  const tick=()=>{
   if(!flight)return;
   const progress=Math.min(1,Math.max(0,(win.performance.now()-start)/duration));
   // A short small-circle beat makes the origin visible before the broad sweep.
   const t=open?Math.max(0,(progress-.1)/.9):progress;
   const ease=t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;
   paint(open?geometry().radius*ease:from*(1-ease));
   if(progress<1){frame=win.requestAnimationFrame(tick);return;}
   if(open)clear();else settle(); // Keep the closed curtain until the next screen is ready.
  };
  tick();return promise;
 }
 function open({start=win.performance.now(),duration=725}={}){
  if(reduced.matches){clear();return Promise.resolve();}
  if(flight?.open&&openingStart===start)return Promise.resolve();
  if(win.performance.now()-start>=duration){if(!flight||flight.open)clear();return Promise.resolve();}
  return run(true,duration,start);
 }
 function close(){
  if(reduced.matches){clear();return Promise.resolve();}
  if(curtain&&!flight&&radius===0)return Promise.resolve();
  return run(false,325);
 }
 reduced.addEventListener('change',()=>{if(reduced.matches)clear();});
 win.addEventListener('resize',()=>{if(curtain&&!flight)paint(radius||0);});
 // Browsers may restore the closed login page from the back/forward cache.
 win.addEventListener('pageshow',event=>{if(event.persisted)clear();});
 return {open,close,reset:clear};
}
