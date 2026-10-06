import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validGeometry,inside,overlaps} from '../geometry.js';
const poly = points => ({type:'Polygon',coordinates:[points]});
test('concave boundaries, holes, touching edges and invalid polygons', () => {
 const parent=poly([[0,0],[3,0],[3,1],[1,1],[1,3],[0,3],[0,0]]);
 const crossing=poly([[.5,.5],[2.5,.5],[.5,2.5],[.5,.5]]);
 assert.ok(validGeometry(parent)); assert.equal(inside(crossing,parent),false);
 const a=poly([[0,0],[1,0],[1,1],[0,1],[0,0]]);
 const b=poly([[1,0],[2,0],[2,1],[1,1],[1,0]]);
 assert.equal(overlaps(a,b),false); assert.equal(overlaps(a,a),true);
 assert.equal(validGeometry(poly([[0,0],[1,1],[0,1],[1,0],[0,0]])),false);
 const hole={type:'Polygon',coordinates:[[[0,0],[4,0],[4,4],[0,4],[0,0]],[[1,1],[1,3],[3,3],[3,1],[1,1]]]};
 assert.equal(inside(poly([[1.5,1.5],[2,1.5],[2,2],[1.5,2],[1.5,1.5]]),hole),false);
});
