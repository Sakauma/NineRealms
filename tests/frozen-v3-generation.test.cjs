'use strict';
// Inspect the preserved implementation inside its test-only VM. Its public daily
// wrapper intentionally exposes only four easy variants; production is unchanged.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const E=require('../src/engine.js'),H=require('../src/hints.js');
const filename=path.resolve(__dirname,'../src/daily-generator-v1.js');
const source=fs.readFileSync(filename,'utf8'),needle='return {version:1,generate:generate,workerSource:';
assert.equal(source.split(needle).length,2,'locate exactly one frozen export');
const context=vm.createContext({SudokuEngine:E,SudokuHints:H});
vm.runInContext(source.replace(needle,'return {testGenerator:Generator,version:1,generate:generate,workerSource:'),context);
const G=context.NineRealmsDailyGeneratorV1.testGenerator;
const expected=['classic','diagonal','hyper','knight','king','disjoint','nonconsecutive','thermo','killer','arrow','thermo-killer','renban','whispers','odd-even','greater','kropki','xv','quadruple','sandwich','skyscraper','xsum','littlekiller'];
assert.deepEqual(Array.from(G.freshModes()).sort(),expected.sort());
for(const mode of ['miracle','jigsaw','twin','samurai','palindrome','clone'])assert.throws(()=>G.generate({mode,difficulty:'easy',seed:'frozen-unsupported',fresh:true}),/FRESH_MODE_UNSUPPORTED/);
const failures=[];let verified=0;
for(const mode of expected){
 let p;try{p=G.generate({mode,difficulty:'easy',seed:'frozen-v3-contract-'+mode,fresh:true});}catch(e){assert(['FRESH_DIFFICULTY_NOT_REACHED','DENSITY_NOT_REACHED','DIVERSITY_BUDGET'].includes(e.code),e.stack);failures.push({mode,code:e.code});continue;}
 const ctx={mode,clues:p.clues};assert.equal(p.generation.version,3);assert.equal(p.generation.kind,'constructed');assert.equal(p.generation.logicVerified,true);assert(E.validateComplete(Array.from(p.solution),ctx));
 const u=E.analyzeSolutions(Array.from(p.givens),ctx,{limit:2,maxNodes:500000});assert.equal(u.count,1);assert.equal(u.exhausted,false);
 if(G.supportsDifficulty(mode)){assert.equal(p.generation.difficultyBasis,'supported-logic');assert(G.matchesDifficulty(p.givens,'easy',ctx));}
 else{assert.equal(p.generation.difficultyBasis,'clue-density');assert(G.basicProof(p.givens,ctx).solved);}
 verified++;
}
assert(verified>=18,'unexpected frozen v3 regression');
console.log('PASS frozen v3 contract:',JSON.stringify({modes:22,verified,failures}));
