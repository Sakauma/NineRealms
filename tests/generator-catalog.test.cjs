'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const E=require('../src/engine.js'),G=require('../src/generator.js');
let checked=0,failures=[],maxMs=0;
for(const source of E.getPuzzleCatalog()) {
 if(source.difficulty==='master')continue;
 const start=Date.now();let p;
 try{p=G.generate({mode:source.mode,difficulty:source.difficulty,sourceId:source.id,seed:'catalog-v1-'+source.id})}
 catch(e){failures.push({id:source.id,error:e.message});continue}
 maxMs=Math.max(maxMs,Date.now()-start);
 assert.equal(p.sourceId,source.id);
 const a=E.analyzeSolutions(p.givens,{mode:p.mode,clues:p.clues},{limit:2,maxNodes:500000});
 assert.equal(a.count,1);assert.equal(a.exhausted,false);assert.deepEqual(a.solution,p.solution);checked++;
}
const report={checked,failures,maxMs,scope:'one new carve per eligible curated source, full-rule uniqueness recheck'};
fs.mkdirSync('evidence/generator',{recursive:true});fs.writeFileSync('evidence/generator/catalog.json',JSON.stringify(report,null,2));console.log(report);
assert(failures.every(f=>f.error==='DENSITY_NOT_REACHED'),'Unexpected generator failure; inspect catalog.json');
assert.equal(checked+failures.length,E.getPuzzleCatalog().filter(p=>p.difficulty!=='master').length);
console.log('All outputs valid; expected density-budget fallbacks:',failures.length);
