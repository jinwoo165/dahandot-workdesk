import test from 'node:test';
import assert from 'node:assert/strict';
import {floatingBounds,floatingPosition,relativePosition} from '../src/floating-composer.js';

test('a stored drag position stays reachable when the desktop window shrinks',()=>{
 const large=floatingBounds(1920,1080,156,60);
 const saved=relativePosition({x:1600,y:900},large);
 const small=floatingBounds(920,500,156,60);
 const restored=floatingPosition(saved,small);
 assert.ok(restored.x>=16&&restored.x+156<=920-16);
 assert.ok(restored.y>=16&&restored.y+60+8<=500-16);
 assert.ok(Math.abs(relativePosition(restored,small).x-saved.x)<1e-10);
 assert.ok(Math.abs(relativePosition(restored,small).y-saved.y)<1e-10);
});

test('dragging beyond any edge clamps the entire bubble including its tail',()=>{
 const area=floatingBounds(1024,768,156,60);
 assert.deepEqual(floatingPosition(relativePosition({x:-500,y:-500},area),area),{x:16,y:16});
 assert.deepEqual(floatingPosition(relativePosition({x:9000,y:9000},area),area),{x:852,y:684});
});

test('missing or invalid saved positions recover to the bottom right',()=>{
 const area=floatingBounds(1024,768,156,60);
 for(const value of [null,{},false,'bad',{x:'1',y:1},{x:NaN,y:Infinity}]){
  assert.deepEqual(floatingPosition(value,area),{x:852,y:684});
 }
});
