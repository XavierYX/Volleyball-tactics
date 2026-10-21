import test from 'node:test';
import assert from 'node:assert/strict';
import {positionRelations,checkFormation,standardFormations} from '../core.js';

test('drag guides use only the rule neighbors of each rotation position',()=>{
 const coords=standardFormations()[0];
 const expected={1:[2,6],2:[1,3],3:[2,4,6],4:[3,5],5:[4,6],6:[1,3,5]};
 for(const [position,neighbors]of Object.entries(expected)){
  const guides=positionRelations(coords,+position);
  assert.deepEqual(guides.map(g=>g.neighbor).sort(),neighbors);
  assert.ok(guides.every(g=>g.valid));
 }
 // Nearness is irrelevant: dragging 4 close to 1 does not add a 4–1 constraint.
 coords[4]=[78,73];
 assert.deepEqual(positionRelations(coords,4).map(g=>g.neighbor).sort(),[3,5]);
});

test('guide validity agrees with center-point validation for equality and crossing',()=>{
 for(const position of [1,2,3,4,5,6]){
  const original=standardFormations()[0];
  for(const relation of positionRelations(original,position)){
   for(const offset of [0,1]){
    const coords=structuredClone(original);
    coords[relation.from][relation.axis]=coords[relation.to][relation.axis]+offset;
    const guides=positionRelations(coords,position);
    const guide=guides.find(g=>g.neighbor===relation.neighbor);
    assert.equal(guide.valid,false);
    for(const g of guides)assert.equal(!g.valid,checkFormation(coords).some(e=>e.positions[0]===g.from&&e.positions[1]===g.to));
   }
  }
 }
});
