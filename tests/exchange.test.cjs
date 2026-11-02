'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const E=require('../src/engine.js'),G=require('../src/generator.js'),C=require('../src/challenge.js');
const crypto=require('node:crypto'),fixture=require('./fixtures/compatibility.json');
const hash=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
const source=fs.readFileSync('src/engine.js','utf8');
const bank=JSON.parse(source.split('/* BANK_START */')[1].split('; /* BANK_END */')[0]);
const data=bank.filter(p=>p.id.startsWith('SE-'));
const catalog=E.getPuzzleCatalog(),totalCatalog=catalog.length;
assert.equal(catalog.filter(p=>p.mode!=='thermo-killer').length,10258,'Pre-fusion catalog count changed');
assert.equal(data.length,9000);
assert.equal(new Set(catalog.map(p=>p.id)).size,totalCatalog);
assert.equal(hash(E.getSeedPuzzles().filter(p=>!p.id.startsWith('SE-')&&!p.id.startsWith('F-thermo-killer-'))),fixture.seedBankSha256,'Original seed bank changed');
let maxMs=0;
for(const p of data){
 const a=E.analyzeSolutions(Array.from(p.text,Number),'classic',{limit:2,maxNodes:1000000});assert.equal(a.count,1);assert.equal(a.exhausted,false);assert(E.validateComplete(a.solution,'classic'));assert(Array.from(p.text,Number).every((v,i)=>!v||v===a.solution[i]));
 const start=performance.now(),played=E.getPuzzle(p.difficulty,'integration-'+p.id,'classic',{sourceId:p.id});maxMs=Math.max(maxMs,performance.now()-start);
 assert.equal(played.sourceId,p.id);assert(E.validateComplete(played.solution,'classic'));assert(played.givens.every((v,i)=>!v||v===played.solution[i]));
}
for(const p of fixture.sources)assert.equal(hash(E.getPuzzle(p.difficulty,'old-id-check',p.mode,{sourceId:p.id})),p.sha256);
const daily=require('../src/daily.js'),voyage=require('../src/voyage.js');
for(const p of fixture.daily)assert.equal(hash(daily.getPuzzle(p.date)),p.sha256);
for(const p of fixture.voyage)assert.equal(hash(voyage.getPuzzle(p.id)),p.sha256);
for(const tier of ['easy','medium','hard'])for(const p of data.filter(p=>p.difficulty===tier).slice(0,10)){
 const q=E.getPuzzle(tier,'challenge',p.mode,{sourceId:p.id}),r=C.decode(C.create(q));assert.deepEqual(q.givens,r.givens);assert.deepEqual(q.solution,r.solution);
 const generated=G.generate({mode:'classic',difficulty:tier,seed:p.id,sourceId:p.id});assert(E.validateComplete(generated.solution,'classic'));
}
const context=vm.createContext({});vm.runInContext(E.workerSource(),context);assert.equal(vm.runInContext('SudokuEngine.getPuzzleCatalog().length',context),totalCatalog);
const report={status:'passed',imported:9000,totalCatalog,allImportedUniqueAndAnswersRechecked:true,allImportedGetPuzzleValidated:true,oldSourcesUnchanged:1258,dailyDatesUnchanged:366,voyageChaptersUnchanged:9,challengeRoundtrips:30,generatedFromImported:30,workerCatalog:totalCatalog,maxGetPuzzleMs:maxMs,browserTest:false};
fs.mkdirSync('evidence/exchange',{recursive:true});fs.writeFileSync('evidence/exchange/regression.json',JSON.stringify(report,null,2));console.log(report);
