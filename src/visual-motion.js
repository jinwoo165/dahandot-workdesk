// Presentation only. This controller never reads or writes work data or preferences.
// Keep animation clocks outside app.innerHTML so background refreshes cannot replay them.
import {createScreenMotion} from './screen-motion.js';
const EASE='cubic-bezier(.22,1,.36,1)';
const NAV_DURATION=360;
const REVEAL_DURATION=725;
const INTRO_END=2900;
const CARD_DURATION=680;
const PANEL_SELECTORS={main:'#viewBody>.panel,#viewBody>.calendar-layout>.panel,.unified-search-panel',agenda:'.work-agenda>.agenda-panel',files:'.shared-files>.files-panel',briefing:'.shared-briefing>.briefing'};
export function visualChange(previous,next){
 if(!previous||previous.scope!==next.scope)return 'intro';
 if(previous.view!==next.view)return 'page';
 if(previous.detail!==next.detail)return 'content';
 return null;
}

export function createVisualMotion({window:win=window}={}){
 const doc=win.document,reduced=win.matchMedia('(prefers-reduced-motion: reduce)');
 const screen=createScreenMotion({window:win});
 const desktop=win.matchMedia('(min-width:901px)'),hover=win.matchMedia('(hover:hover)');
 let previous=null,sequence=null,root=null,navTravel=null,navKey=null,captured=null,tooltip=null,tipOwner=null;
 let weatherGhost=null,weatherAnimations=[];
 let paneGhost=null;
 const paneRunning=new Set();
 const running=new Set();
 function stop(){for(const animation of running)animation.cancel();running.clear();}
 function animate(node,frames,duration,delay=0,start=win.performance.now(),easing=EASE,done=()=>{},owner=running){
  const elapsed=win.performance.now()-start;
  if(!node?.getClientRects().length||!node.animate||reduced.matches||elapsed>=duration+delay){done();return;}
  const animation=node.animate(frames,{duration,delay,easing,fill:'backwards'});
  animation.currentTime=Math.max(0,elapsed);owner.add(animation);
  animation.oncancel=()=>{owner.delete(animation);done();};
  animation.onfinish=()=>{owner.delete(animation);done();animation.cancel();};
  return animation;
 }
 function clearPane(){for(const animation of paneRunning)animation.cancel();paneRunning.clear();paneGhost?.remove();paneGhost=null;}
 function captureDialog(dialog,key,pane){
  clearPane();
  const current=dialog.querySelector('[data-item-pane][aria-pressed="true"]')?.dataset.itemPane;
  const same=dialog.dataset.motionTarget===key;
  dialog.dataset.motionTarget=key;
  if(!dialog.open||!same||!current||current===pane||reduced.matches)return null;
  const body=dialog.querySelector('.dialog-body'),bounds=body?.getBoundingClientRect(),host=dialog.getBoundingClientRect();
  if(!bounds)return null;
  const ghost=doc.createElement('div');ghost.className='item-pane-ghost';ghost.setAttribute('aria-hidden','true');ghost.setAttribute('inert','');
  for(const node of dialog.querySelectorAll('.fixed-item-dialog>.dialog-body,.fixed-item-dialog>.conversation-compose,.fixed-item-dialog>.dialog-foot')){
   const clone=node.cloneNode(true);clone.removeAttribute('id');clone.querySelectorAll('[id]').forEach(n=>n.removeAttribute('id'));
   ghost.append(clone);
   if(node.classList.contains('dialog-body'))clone.scrollTop=node.scrollTop;
  }
  ghost.style.cssText=`top:${bounds.top-host.top-dialog.clientTop}px;left:${bounds.left-host.left-dialog.clientLeft}px;width:${bounds.width}px;height:${host.bottom-bounds.top-dialog.clientTop}px`;
  return {ghost,scrollTop:body.scrollTop,sign:pane==='story'?1:-1,focus:Boolean(doc.activeElement?.closest('[data-item-pane]'))};
 }
 function revealDialog(dialog,transition){
  if(!transition)return;
  const {ghost,sign,focus,scrollTop}=transition,start=win.performance.now();
  paneGhost=ghost;dialog.append(ghost);
  ghost.querySelector('.dialog-body').scrollTop=scrollTop;
  animate(ghost,[{opacity:1,transform:'translateX(0) scale(1)',filter:'blur(0px)'},{opacity:0,transform:`translateX(${-sign*90}px) scale(.96)`,filter:'blur(3px)'}],320,0,start,EASE,()=>ghost.remove(),paneRunning);
  dialog.querySelectorAll('.fixed-item-dialog>.dialog-body,.fixed-item-dialog>.conversation-compose,.fixed-item-dialog>.dialog-foot').forEach((node,index)=>{
   animate(node,[{opacity:0,transform:`perspective(1000px) translateX(${sign*105}px) rotateY(${-sign*5}deg) scale(.96)`,filter:'blur(3px)'},{opacity:1,transform:'perspective(1000px) translateX(0) rotateY(0deg) scale(1)',filter:'blur(0px)'}],540,index*35,start,EASE,()=>{},paneRunning);
  });
  if(focus)dialog.querySelector('[data-item-pane][aria-pressed="true"]')?.focus({preventScroll:true});
 }
 doc.addEventListener('close',event=>{if(event.target.id==='detail')clearPane();},true);
 function clearWeather(){
  for(const animation of weatherAnimations)animation?.cancel();
  weatherAnimations=[];weatherGhost?.remove();weatherGhost=null;
 }
 // Replace weather immediately; the outgoing copy is decorative and cannot receive focus.
 // A quick second click or a background refresh cancels the old transition cleanly.
 function weather(widget,replace,direction=0){
  clearWeather();
  const old=widget?.querySelector('.weather-page');
  if(!old||!direction||reduced.matches){replace();return;}
  const bounds=old.getBoundingClientRect(),host=widget.getBoundingClientRect();
  const ghost=old.cloneNode(true),sign=Math.sign(direction),start=win.performance.now();
  ghost.classList.add('weather-motion-ghost');ghost.setAttribute('aria-hidden','true');ghost.setAttribute('inert','');ghost.removeAttribute('tabindex');
  ghost.querySelectorAll('[id]').forEach(node=>node.removeAttribute('id'));
  ghost.style.cssText=`position:absolute;left:${bounds.left-host.left-widget.clientLeft}px;top:${bounds.top-host.top-widget.clientTop}px;width:${bounds.width}px;height:${bounds.height}px;pointer-events:none`;
  replace();weatherGhost=ghost;widget.append(ghost);
  const page=widget.querySelector('.weather-page:not(.weather-motion-ghost)');
  weatherAnimations=[
   animate(ghost,[{opacity:1,transform:'translateX(0) scale(1)',filter:'blur(0px)'},{opacity:0,transform:`translateX(${-sign*65}px) scale(.92)`,filter:'blur(3px)'}],340,0,start,EASE,()=>ghost.remove()),
   animate(page,[{opacity:0,transform:`perspective(600px) translateX(${sign*85}px) rotateY(${-sign*12}deg) scale(.92)`,filter:'blur(3px)'},{opacity:1,transform:'perspective(600px) translateX(0) rotateY(0deg) scale(1)',filter:'blur(0px)'}],560,0,start)
  ];
 }
 function hideTip(){
  if(tooltip)tooltip.hidden=true;
  if(tipOwner){
   const ids=(tipOwner.getAttribute('aria-describedby')||'').split(/\s+/).filter(id=>id&&id!=='board-motion-tooltip');
   if(ids.length)tipOwner.setAttribute('aria-describedby',ids.join(' '));else tipOwner.removeAttribute('aria-describedby');
  }
  tipOwner=null;
 }
 function showTip(button){
  hideTip();if(!button||!desktop.matches||!button.dataset.motionTip)return;
  if(!tooltip){tooltip=doc.createElement('div');tooltip.id='board-motion-tooltip';tooltip.className='motion-tooltip';tooltip.setAttribute('role','tooltip');doc.body.append(tooltip);}
  tooltip.textContent=button.dataset.motionTip.replace(/\n/g,' ');tooltip.hidden=false;
  tipOwner=button;
  button.setAttribute('aria-describedby',[(button.getAttribute('aria-describedby')||''),'board-motion-tooltip'].filter(Boolean).join(' '));
  const rect=button.getBoundingClientRect();
  tooltip.style.left=Math.max(8,Math.min(rect.right+12,win.innerWidth-tooltip.offsetWidth-8))+'px';
  tooltip.style.top=Math.max(8,Math.min(rect.top+(rect.height-tooltip.offsetHeight)/2,win.innerHeight-tooltip.offsetHeight-8))+'px';
 }
 function bindTips(nextRoot){
  if(root===nextRoot)return;
  nextRoot.addEventListener('pointerover',event=>{const b=event.target.closest('[data-motion-tip]');if(hover.matches&&b&&!b.contains(event.relatedTarget))showTip(b);});
  nextRoot.addEventListener('pointerout',event=>{if(tipOwner&&!tipOwner.contains(event.relatedTarget))hideTip();});
  nextRoot.addEventListener('focusin',event=>{if(event.target.matches('[data-motion-tip]'))showTip(event.target);});
  nextRoot.addEventListener('focusout',hideTip);
  nextRoot.addEventListener('pointerdown',hideTip);
 }
 doc.addEventListener('keydown',event=>{if(event.key==='Escape')hideTip();});
 doc.addEventListener('scroll',hideTip,true);
 win.addEventListener('resize',hideTip);
 reduced.addEventListener('change',()=>{if(reduced.matches){stop();clearWeather();clearPane();sequence=null;navTravel=null;hideTip();}});

 function capture(nextRoot){
  clearWeather();
  const nav=nextRoot.querySelector('.sidebar .nav'),marker=nav?.querySelector('.motion-nav-indicator');
  const n=nav?.getBoundingClientRect(),m=marker?.getBoundingClientRect();
  const active=doc.activeElement;
  const focus=active?.closest('.nav [data-view],.task-filters [data-task-filter]');
  captured={
   marker:n&&m?{x:m.left-n.left,y:m.top-n.top,width:m.width,height:m.height}:null,
   focus:focus?(focus.dataset.view?['data-view',focus.dataset.view]:['data-task-filter',focus.dataset.taskFilter]):null,
   sidebarScroll:nextRoot.querySelector('.sidebar')?.scrollTop||0,
   filesVisible:Boolean(nextRoot.querySelector(PANEL_SELECTORS.files)?.getClientRects().length)
  };
  hideTip();
 }
 function moveSelection(){
  const nav=root.querySelector('.sidebar .nav'),button=nav?.querySelector('button.active');
  if(!nav||!button||!desktop.matches){navKey=null;navTravel=null;return;}
  const n=nav.getBoundingClientRect(),b=button.getBoundingClientRect();
  const target={x:b.left-n.left,y:b.top-n.top,width:b.width,height:b.height};
  const key=button.dataset.view;
  if(navKey!==key&&captured?.marker)navTravel={from:captured.marker,start:win.performance.now()};
  navKey=key;
  const marker=doc.createElement('span');marker.className='motion-nav-indicator';marker.setAttribute('aria-hidden','true');
  marker.innerHTML='<span class="motion-nav-orb"></span>';
  marker.style.cssText=`width:${target.width}px;height:${target.height}px;transform:translate(${target.x}px,${target.y}px)`;
  nav.prepend(marker);nav.classList.add('motion-nav');button.setAttribute('aria-current','page');
  if(navTravel){
   const f=navTravel.from;
   animate(marker,[{transform:`translate(${f.x}px,${f.y}px)`,width:f.width+'px',height:f.height+'px'},{transform:`translate(${target.x}px,${target.y}px)`,width:target.width+'px',height:target.height+'px'}],NAV_DURATION,0,navTravel.start);
   if(win.performance.now()-navTravel.start>=NAV_DURATION)navTravel=null;
  }
 }
 function reveal(){
  if(!sequence||reduced.matches)return;
  const {kind,start,targets,mobileChanged,filesVisible}=sequence;
  const now=win.performance.now();if(now-start>(kind==='intro'?INTRO_END:1500)){sequence=null;return;}
  const rise=[{opacity:0,transform:`perspective(1000px) translateY(${desktop.matches?46:24}px) rotateX(${desktop.matches?7:0}deg) scale(.93)`,filter:'blur(4px)',offset:0},{opacity:1,transform:'perspective(1000px) translateY(-4px) rotateX(0deg) scale(1.012)',filter:'blur(0px)',offset:.78},{opacity:1,transform:'perspective(1000px) translateY(0) rotateX(0deg) scale(1)',filter:'blur(0px)',offset:1}];
  // A card and its text enter as one surface. Never animate list rows again inside it.
  const cards=(selector,delay)=>root.querySelectorAll(selector).forEach((node,index)=>animate(node,rise,CARD_DURATION,delay+index*90,start));
  if(kind==='intro'){
   void screen.open({start,duration:REVEAL_DURATION});
   if(desktop.matches){
    const fold=[{opacity:0,transform:'perspective(700px) translateY(-12px) rotateX(-86deg) scale(.94)',filter:'brightness(.7)',offset:0},{opacity:1,transform:'perspective(700px) translateY(2px) rotateX(8deg) scale(1.015)',filter:'brightness(1.08)',offset:.72},{opacity:1,transform:'perspective(700px) translateY(0) rotateX(0deg) scale(1)',filter:'brightness(1)',offset:1}];
    const buttons=[...root.querySelectorAll('.sidebar .nav>button')];
    buttons.forEach((button,index)=>animate(button,fold,700,460+index*120,start));
    const selected=Math.max(0,buttons.findIndex(button=>button.classList.contains('active')));
    animate(root.querySelector('.motion-nav-indicator'),[{opacity:0},{opacity:1}],550,460+selected*120,start);
   }
   // Keep the strong first entrance, with the same motion for every card and its text.
   cards('.title-copy',430);cards('.scenic-banner',550);cards('.weather-panel',670);
   cards('.shared-briefing',850);cards(PANEL_SELECTORS.main,1040);
   cards(PANEL_SELECTORS.agenda,1130);cards(PANEL_SELECTORS.files,1220);cards('.work-progress',1050);
  }else if(kind==='page'){
   animate(root.querySelector('.title-copy'),[{opacity:.2,transform:'translateY(6px)'},{opacity:1,transform:'translateY(0)'}],240,0,start);
   cards('.shared-briefing',0);cards(PANEL_SELECTORS.main,90);cards(PANEL_SELECTORS.agenda,180);
   if(filesVisible&&desktop.matches){
    // This shared card stays readable and still. A single border pulse acknowledges navigation.
    animate(root.querySelector(PANEL_SELECTORS.files),[
     {borderColor:'var(--line)',offset:0},
     {borderColor:'color-mix(in srgb,var(--green) 38%,var(--line))',offset:.38},
     {borderColor:'var(--line)',offset:1}
    ],CARD_DURATION,90,start);
   }else cards(PANEL_SELECTORS.files,270);
  }else if(kind==='content'){
   for(const target of targets){
    if(mobileChanged){cards(PANEL_SELECTORS[target],0);continue;}
    // Filters replace one list as a group; common cards and unchanged text stay in place.
    root.querySelectorAll(PANEL_SELECTORS[target]).forEach(panel=>{
     const content=panel.querySelector('.panel-scroll')||panel.querySelector('.calendar-scroll')||panel.querySelector('.briefing-lines');
     animate(content,[{opacity:.25,transform:'translateY(12px)'},{opacity:1,transform:'translateY(0)'}],360,0,start);
    });
   }
  }
 }
 function refresh(nextRoot,next){
  bindTips(nextRoot);root=nextRoot;stop();
  root.classList.add('visual-motion-ready');
  const kind=visualChange(previous,next);
  if(kind){
   const mobileChanged=!desktop.matches&&(previous?.mobilePanel!==next.mobilePanel||previous?.mobileExpanded!==next.mobileExpanded);
   const targets=mobileChanged?[next.mobilePanel==='work'?'main':next.mobilePanel]:Object.keys(PANEL_SELECTORS).filter(key=>previous?.panels?.[key]!==next.panels?.[key]);
   sequence={kind,start:win.performance.now(),targets,mobileChanged,filesVisible:captured?.filesVisible};
   if(kind==='intro'){navKey=null;navTravel=null;if(captured)captured.marker=null;}
  }
  previous={...next};
  const sidebar=root.querySelector('.sidebar');if(sidebar&&captured)sidebar.scrollTop=captured.sidebarScroll;
  moveSelection();
  if(captured?.focus){const [attribute,value]=captured.focus;const selector=attribute==='data-view'?'.sidebar .nav [data-view]':'.task-filters [data-task-filter]';[...root.querySelectorAll(selector)].find(n=>n.getAttribute(attribute)===value)?.focus({preventScroll:true});hideTip();}
  reveal();captured=null;
 }
 return {capture,refresh,weather,captureDialog,revealDialog,
  login(){void screen.open();},
  closeScreen:()=>screen.close(),
  beforeBoard:nextRoot=>nextRoot.querySelector('.login-wrap')?screen.close():Promise.resolve(),
  reset(){stop();clearWeather();clearPane();screen.reset();hideTip();root?.querySelectorAll('.motion-nav-indicator').forEach(n=>n.remove());root?.classList.remove('visual-motion-ready');previous=null;sequence=null;navTravel=null;navKey=null;captured=null;}
 };
}
