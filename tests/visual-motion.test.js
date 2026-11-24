import test from 'node:test';
import assert from 'node:assert/strict';
import {createVisualMotion,visualChange} from '../src/visual-motion.js';

const board={scope:'assignment:user-a',view:'work',detail:'today'};
test('weather, read markers and updated work totals do not replay screen entrances',()=>{
 assert.equal(visualChange(board,{...board,weather:'updated',read:4,total:30}),null);
});
test('only navigation and explicit content selection start their matching transition',()=>{
 assert.equal(visualChange(board,{...board,view:'calendar'}),'page');
 assert.equal(visualChange(board,{...board,detail:'done'}),'content');
 assert.equal(visualChange({...board,view:'search'},{...board,view:'search',detail:'공정'}),'content');
});
test('first entry, reset and account changes each get a fresh introduction',()=>{
 assert.equal(visualChange(null,board),'intro');
 assert.equal(visualChange(board,{...board,scope:'assignment:user-b'}),'intro');
});

function surfaceStage({desktop=true,reduced=false}={}){
 let now=0,filesVisible=true;
 const calls=[],frames=new Map(),media={matches:reduced,addEventListener(){}};
 const classes={add(){},remove(){}};
 const node=name=>({name,classList:classes,getClientRects:()=>name==='files'&&!filesVisible?[]:[{}],
  querySelector:selector=>selector===(name==='briefing'?'.briefing-lines':'.panel-scroll')?node(name+'-text'):null,
  animate(keyframes,options){
   const animation={currentTime:0,cancel(){this.oncancel?.();}};
   calls.push({name,keyframes,options,animation});return animation;
  }
 });
 const nodes=Object.fromEntries(['main','agenda','files','briefing','title','scenery','weather','progress','body','task-row','agenda-row','file-row'].map(name=>[name,node(name)]));
 const selectors={'#viewBody>.panel':'main','.work-agenda>.agenda-panel':'agenda','.shared-files>.files-panel':'files','.shared-briefing':'briefing','.shared-briefing>.briefing':'briefing','.title-copy':'title','.scenic-banner':'scenery','.weather-panel':'weather','.work-progress':'progress','#viewBody':'body'};
 const root={classList:classes,addEventListener(){},querySelectorAll(selector){
  return [...new Set(selector.split(',').flatMap(part=>{
   if(selectors[part])return [nodes[selectors[part]]];
   return ['task','agenda','file'].filter(name=>part.includes(name+'-card')||part.includes(name+'-item')).map(name=>nodes[name+'-row']);
  }))];
 },querySelector(selector){return this.querySelectorAll(selector)[0]||null;}};
 const doc={activeElement:null,addEventListener(){},documentElement:{classList:classes},body:{append(){}},createElement(){return {setAttribute(){},querySelector:()=>({setAttribute(){}}),remove(){}};}};
 const window={document:doc,innerWidth:1440,innerHeight:900,performance:{now:()=>now},matchMedia:query=>query.includes('reduced')?media:{matches:query.includes('901')?desktop:true,addEventListener(){}},addEventListener(){},requestAnimationFrame:fn=>{frames.set(1,fn);return 1;},cancelAnimationFrame:id=>frames.delete(id)};
 const motion=createVisualMotion({window});
 return {root,motion,calls,setFilesVisible:value=>{filesVisible=value;},advance(ms){now+=ms;for(const fn of frames.values()){frames.clear();fn();}},render(state){motion.capture(root);motion.refresh(root,state);},clearCalls(){calls.length=0;}};
}
const scene={...board,mobilePanel:'work',mobileExpanded:true,panels:{main:'today',agenda:false,files:false,briefing:false}};

test('work, upcoming events and files enter with identical card and text motion',()=>{
 const s=surfaceStage();s.render(scene);
 const panels=['main','agenda','files'].map(name=>s.calls.find(call=>call.name===name));
 for(const panel of panels){assert.ok(panel);assert.deepEqual(panel.keyframes,panels[0].keyframes);assert.equal(panel.options.duration,panels[0].options.duration);}
 assert.ok(panels[0].options.delay<panels[1].options.delay&&panels[1].options.delay<panels[2].options.delay);
 assert.equal(s.calls.some(call=>/row|text|body/.test(call.name)),false,'text must travel with the card, without a second entrance');
});

test('category navigation keeps shared files readable and uses one border accent',()=>{
 const s=surfaceStage();s.render(scene);s.advance(4000);s.clearCalls();s.render({...scene,view:'calendar'});
 const main=s.calls.find(call=>call.name==='main'),agenda=s.calls.find(call=>call.name==='agenda'),files=s.calls.filter(call=>call.name==='files');
 assert.deepEqual(main.keyframes,agenda.keyframes);
 assert.equal(files.length,1);
 assert.ok(files[0].keyframes.every(frame=>'borderColor' in frame&&!('opacity' in frame)&&!('transform' in frame)));
 s.advance(4000);s.clearCalls();s.render({...scene,view:'calendar',weather:'updated',total:99});
 assert.equal(s.calls.length,0,'background updates must not restart any card or text entrance');
});

test('a rerender resumes the accent instead of restarting it, and a newly visible files card gets an entrance',()=>{
 const s=surfaceStage();s.render(scene);s.advance(4000);s.render({...scene,view:'calendar'});s.advance(200);s.clearCalls();s.render({...scene,view:'calendar'});
 assert.equal(s.calls.find(call=>call.name==='files').animation.currentTime,200);
 s.advance(4000);s.setFilesVisible(false);s.render({...scene,view:'search'});s.clearCalls();
 s.motion.capture(s.root);s.setFilesVisible(true);s.motion.refresh(s.root,scene);
 assert.ok(s.calls.find(call=>call.name==='files').keyframes.every(frame=>'transform' in frame));
});

test('filter and hidden-list changes animate only the affected text group',()=>{
 const s=surfaceStage();s.render(scene);s.advance(4000);s.clearCalls();
 const filesChanged={...scene,detail:'hidden files',panels:{...scene.panels,files:true}};
 s.render(filesChanged);assert.deepEqual(s.calls.map(call=>call.name),['files-text']);
 s.advance(4000);s.clearCalls();s.render({...filesChanged,detail:'all work',panels:{...filesChanged.panels,main:'all'}});
 assert.deepEqual(s.calls.map(call=>call.name),['main-text']);
 s.advance(4000);s.clearCalls();s.render({...filesChanged,detail:'hidden briefing',panels:{...filesChanged.panels,main:'all',briefing:true}});
 assert.deepEqual(s.calls.map(call=>call.name),['briefing-text']);
});

test('mobile panel selection uses the same card entrance and reduced motion skips all effects',()=>{
 const s=surfaceStage({desktop:false});s.render(scene);s.advance(4000);s.clearCalls();
 s.render({...scene,mobilePanel:'agenda',detail:'mobile agenda'});
 assert.deepEqual(s.calls.map(call=>call.name),['agenda']);
 const quiet=surfaceStage({reduced:true});quiet.render(scene);quiet.render({...scene,view:'calendar'});
 assert.equal(quiet.calls.length,0);
});
