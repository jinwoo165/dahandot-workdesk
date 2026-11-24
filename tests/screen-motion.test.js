import test from 'node:test';
import assert from 'node:assert/strict';
import {createScreenMotion,screenCircle} from '../src/screen-motion.js';

function stage(){
 let now=0,next=0;
 const frames=new Map(),nodes=[],events={},classes=new Set();
 const media={matches:false,addEventListener(_,fn){this.change=fn;}};
 const circle=()=>({attributes:{},setAttribute(key,value){this.attributes[key]=value;}});
 const body={append(node){nodes.push(node);}};
 const doc={body,documentElement:{classList:{add:x=>classes.add(x),remove:x=>classes.delete(x)}},createElement(){
  const hole=circle(),rim=circle();return {setAttribute(){},querySelector:s=>s.includes('hole')?hole:rim,hole,remove(){const i=nodes.indexOf(this);if(i>=0)nodes.splice(i,1);}};
 }};
 const window={document:doc,innerWidth:1440,innerHeight:900,matchMedia:()=>media,performance:{now:()=>now},requestAnimationFrame:fn=>{frames.set(++next,fn);return next;},cancelAnimationFrame:id=>frames.delete(id),addEventListener:(name,fn)=>events[name]=fn};
 return {window,nodes,media,events,classes,advance(ms){now+=ms;const pending=[...frames.values()];frames.clear();pending.forEach(fn=>fn(now));}};
}

test('the same circle origin covers all four viewport corners, including a narrow phone',()=>{
 for(const [width,height] of [[1440,900],[360,800],[1920,1080]]){
  const {x,y,radius}=screenCircle(width,height);
  assert.ok(x>0&&y>0);
  for(const [a,b] of [[0,0],[width,0],[0,height],[width,height]])assert.ok(Math.hypot(a-x,b-y)<radius);
 }
});

test('login opens, closes to its original center and stays covered until the ready board opens',async()=>{
 const s=stage(),motion=createScreenMotion(s);
 const opening=motion.open();assert.equal(s.nodes.length,1);assert.equal(s.nodes[0].hole.attributes.r,0);
 s.advance(350);assert.ok(s.nodes[0].hole.attributes.r>0);
 const origin=[s.nodes[0].hole.attributes.cx,s.nodes[0].hole.attributes.cy];
 s.advance(375);await opening;assert.equal(s.nodes.length,0);
 const closing=motion.close();s.advance(325);await closing;
 assert.equal(s.nodes[0].hole.attributes.r,0);
 assert.deepEqual([s.nodes[0].hole.attributes.cx,s.nodes[0].hole.attributes.cy],origin);
 s.advance(10000);assert.equal(s.nodes.length,1);
 const board=motion.open();s.advance(725);await board;assert.equal(s.nodes.length,0);assert.equal(s.classes.size,0);
});

test('a repeated render resumes an opening and a fast login can interrupt it without leaving promises pending',async()=>{
 const s=stage(),motion=createScreenMotion(s);
 const opening=motion.open({start:0});s.advance(250);const radius=s.nodes[0].hole.attributes.r;
 await motion.open({start:0});assert.equal(s.nodes[0].hole.attributes.r,radius);
 const closing=motion.close();await opening;s.advance(325);await closing;
 assert.equal(s.nodes.length,1);assert.equal(s.nodes[0].hole.attributes.r,0);
 motion.reset();assert.equal(s.nodes.length,0);
});

test('reduced motion during login and back navigation both release the viewport curtain',async()=>{
 const s=stage(),motion=createScreenMotion(s);const closing=motion.close();
 s.media.matches=true;s.media.change();await closing;assert.equal(s.nodes.length,0);
 await motion.open();await motion.close();assert.equal(s.nodes.length,0);
 s.media.matches=false;const another=motion.close();s.advance(325);await another;
 s.events.pageshow({persisted:true});assert.equal(s.nodes.length,0);assert.equal(s.classes.size,0);
});
