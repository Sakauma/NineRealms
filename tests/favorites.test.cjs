'use strict';
const assert=require('node:assert/strict');
const E=require('../src/engine.js'),F=require('../src/favorites.js');
function memory(initial={}){const map=new Map(Object.entries(initial));return {getItem:k=>map.has(k)?map.get(k):null,setItem:(k,v)=>map.set(k,String(v)),removeItem:k=>map.delete(k),map};}
let tick=1000;const storage=memory(),store=F.createStore(storage,{now:()=>++tick});
const ids=new Set();
for(const m of E.getModes()){
 const puzzle=E.getPuzzle('hard','favorites-test',m.id),record=store.add(puzzle,{sessionId:'session-'+m.id,later:true});
 assert(!ids.has(record.id));ids.add(record.id);assert.equal(record.puzzle.version,1);
 assert.deepEqual(record.puzzle.givens,puzzle.givens);assert.deepEqual(record.puzzle.clues,puzzle.clues);assert.deepEqual(record.puzzle.solution,puzzle.solution);
 assert.equal(record.puzzle.givens.length,E.getLayout(m.id).cellCount);
 const duplicate=store.add({...puzzle,sourceId:'another-source',id:'other-id'},{sessionId:'session2-'+m.id});
 assert.equal(duplicate.id,record.id);assert.equal(store.list({mode:m.id}).length,1);
 store.linkSession(puzzle,'session3-'+m.id);assert.equal(store.get(record.id).sessionIds.at(-1),'session3-'+m.id);
 store.markCompleted(puzzle,'session3-'+m.id);assert.equal(store.get(record.id).completed,true);
 store.setLater(record.id,false);assert.equal(store.get(record.id).later,false);
 const frozen=store.get(record.id);puzzle.givens.fill(0);frozen.puzzle.solution.fill(0);
 assert(store.get(record.id).puzzle.givens.some(Boolean));assert(store.get(record.id).puzzle.solution.every(Boolean));
}
assert.equal(store.list().length,E.getModes().length);assert.equal(store.list({status:'completed'}).length,E.getModes().length);assert.equal(store.list({status:'unfinished'}).length,0);assert.equal(store.list({status:'later'}).length,0);
const exported=store.exportData(),reloaded=F.createStore(storage);assert.deepEqual(reloaded.exportData(),exported);assert.deepEqual(F.validateEnvelope(exported),exported);
assert.equal(reloaded.remove([...ids][0]),true);assert.equal(reloaded.remove('fav-missing'),false);assert.equal(reloaded.list().length,E.getModes().length-1);
// Different clue masks sharing a source and seed must not merge.
const classic=E.getPuzzle('easy','same-source','classic'),other={...classic,givens:classic.solution.slice()};
const local=memory(),s=F.createStore(local,{now:()=>99999});
assert.notEqual(s.add(classic).id,s.add(other).id);assert.equal(s.list().length,2);
const original=s.exportData(),raw=local.getItem(F.key),write=local.setItem;
local.setItem=()=>{throw Object.assign(new Error('full'),{name:'QuotaExceededError'})};
assert.throws(()=>s.setLater(original.records[0].id,true),{name:'QuotaExceededError'});assert.deepEqual(s.exportData(),original);assert.equal(local.getItem(F.key),raw);
assert.throws(()=>s.remove(original.records[0].id),{name:'QuotaExceededError'});assert.deepEqual(s.exportData(),original);local.setItem=write;
// Stale tabs refuse to overwrite another tab's changes.
const second=F.createStore(local);s.setLater(original.records[0].id,true);
assert.throws(()=>second.remove(original.records[0].id),/FAVORITES_CHANGED_IN_OTHER_WINDOW/);second.reload();assert.equal(second.get(original.records[0].id).later,true);
const bad=JSON.parse(JSON.stringify(exported));bad.version=999;assert.throws(()=>F.validateEnvelope(bad),/UNSUPPORTED_FAVORITES_VERSION/);
function corrupt(change){const value=JSON.parse(JSON.stringify(exported));change(value);assert.throws(()=>F.validateEnvelope(value));}
corrupt(x=>x.records[0].puzzle.solution[0]=0);
corrupt(x=>x.records[0].puzzle.givens=Array(81).fill(0));
corrupt(x=>x.records[0].puzzle.clues.unknown=[]);
corrupt(x=>x.records[0].puzzle.version=2);
corrupt(x=>x.records[0].puzzle.mode='unrecognized');
corrupt(x=>x.records[0].sessionIds=['<script>']);
corrupt(x=>x.records[0].sessionIds=['same','same']);
corrupt(x=>x.records[0].completed='true');
corrupt(x=>x.records[0].updatedAt=-1);
corrupt(x=>x.records[0].seedOnly='forbidden');
corrupt(x=>x.records.push(x.records[0]));
corrupt(x=>x.records[1]={...x.records[0],id:'fav-different'});
corrupt(x=>x.records=Array(201).fill(x.records[0]));
const corruptStorage=memory({[F.key]:'{"version":999,"records":[]}'});assert.throws(()=>F.createStore(corruptStorage));assert.equal(corruptStorage.getItem(F.key),'{"version":999,"records":[]}');
const analyze=E.analyzeSolutions;
E.analyzeSolutions=()=>({count:1,exhausted:true,solution:classic.solution});assert.throws(()=>F.freezePuzzle(classic),/FAVORITE_VALIDATION_BUDGET/);
E.analyzeSolutions=()=>({count:2,exhausted:false,solution:classic.solution});assert.throws(()=>F.freezePuzzle(classic),/FAVORITE_NOT_UNIQUE/);E.analyzeSolutions=analyze;
assert(F.samePuzzle(classic,{...classic,sourceId:'ignored'}));assert(!F.samePuzzle(classic,other));assert(!F.samePuzzle(null,classic));
(async()=>{
 assert.deepEqual(await F.validateEnvelopeAsync(exported),F.validateEnvelope(exported));
 const duplicate=JSON.parse(JSON.stringify(exported));duplicate.records.push({...duplicate.records[0],id:'fav-another'});
 await assert.rejects(F.validateEnvelopeAsync(duplicate),/DUPLICATE_FAVORITE_PUZZLE/);
 const dateNow=Date.now;let simulated=0;Date.now=()=>{simulated+=9000;return simulated;};
 try{await assert.rejects(F.validateEnvelopeAsync(exported),/FAVORITES_VALIDATION_TIMEOUT/)}finally{Date.now=dateNow}
 console.log('PASS favorites: all '+E.getModes().length+' modes incl 81/153/369 cells, exact frozen identity, session separation, strict sync/async imports, quota preservation and stale-tab protection.');
})().catch(error=>{console.error(error);process.exitCode=1});
