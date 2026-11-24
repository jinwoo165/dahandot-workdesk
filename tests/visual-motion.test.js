import test from 'node:test';
import assert from 'node:assert/strict';
import {visualChange} from '../src/visual-motion.js';

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
