'use strict';
const assert=require('node:assert/strict'),E=require('../src/engine.js'),B=require('../src/backup.js'),R=require('../src/save-recovery.js');
const {fixture}=require('./browser-helper.cjs'),{openPuzzle}=require('./rule-only-fixtures.cjs');
const G=require('../src/generator.js');
function storage(initial={}){const map=new Map(Object.entries(initial));return {map,hook:null,getItem(k){return map.get(k)??null;},setItem(k,v){if(this.hook)this.hook(k,v);map.set(k,String(v));},removeItem(k){map.delete(k);}};}
const text=x=>JSON.stringify(x),copy=x=>JSON.parse(text(x));
(async()=>{
 let modes=0;
 for(const mode of E.getModes()){
  const p=E.getPuzzle('easy','window-recovery',mode.id),s=fixture();Object.assign(s.game,{mode:p.mode,difficulty:p.difficulty,puzzleId:p.id,sourceId:p.sourceId,clues:p.clues,givens:p.givens,solution:p.solution,board:p.givens.slice(),notes:p.givens.map(()=>0),selected:p.givens.indexOf(0)});
  const validated=await B.validateWindowAsync(text(s));assert(B.isWindow(validated));assert(Object.isFrozen(validated.game.board));
  const previous=text(fixture('previous')),st=storage({[R.key]:previous,[B.keys[1]]:'{future or broken history',[B.keys[3]]:'{daily original',other:'unchanged'});
  R.preserveWindow(st,previous);const before=new Map(st.map);B.replaceWindow(st,validated,previous);assert.equal(st.getItem(R.key),text(s));for(const [k,v]of before)if(k!==R.key)assert.equal(st.getItem(k),v);
  R.preserveWindow(st,st.getItem(B.keys[1]),B.keys[1]);assert(JSON.parse(st.getItem(R.archiveKey)).entries.some(e=>e.key===B.keys[1]&&e.reason==='window-restore'&&e.raw===before.get(B.keys[1])));
  assert.equal(R.previousWindow(st),previous);assert.equal(st.getItem(B.journalKey),null);modes++;
 }
 const s=fixture(),validated=B.validateWindow(s),previous=text(fixture('safe-original'));
 const bad=[];function invalid(change){const b=copy(s);change(b);bad.push(b);}
 invalid(b=>b.version=99);invalid(b=>b.game.solution[0]=0);invalid(b=>b.game.board[b.game.givens.findIndex(Boolean)]=0);invalid(b=>b.game.notes[0]=512);invalid(b=>b.game.elapsedMs=-1);invalid(b=>b.game.dailyDate='2026-01-01');invalid(b=>b.game.voyageId='dawn');invalid(b=>b.game.unknown=true);invalid(b=>b.preferences.soundVolume=2);invalid(b=>b.game.givens.fill(0));
 for(const b of [...bad,'{invalid','x'.repeat(B.limits.maxChars+1),'{"__proto__":{},"version":8,"game":{}}',text({format:'nine-realms-unreadable-saves',version:1,entries:[]})])await assert.rejects(B.validateWindowAsync(b));
 for(const mode of ['killer','thermo','arrow','thermo-killer']){const p=openPuzzle(mode),rule=fixture();Object.assign(rule.game,{mode,clues:p.clues,givens:p.givens,solution:p.solution,board:p.other.slice(),notes:Array(81).fill(0),logicMode:true,completed:true,selected:0});assert(B.isWindow(await B.validateWindowAsync(rule)));}
 const nonunique=fixture();nonunique.game.givens.fill(0);nonunique.game.board.fill(0);nonunique.game.logicMode=true;assert(B.isWindow(await B.validateWindowAsync(nonunique)));
 nonunique.game.generation={version:2,kind:'carved',seed:'recovery-metadata',difficultyBasis:'clue-density',fingerprint:G.fingerprint(nonunique.game),givenCount:0};await assert.rejects(B.validateWindowAsync(nonunique),/唯一解/,'generated-unique claims cannot borrow the nonunique rule-only exception');
 // The window token cannot be used as a full-player-data replacement, or vice versa.
 assert.throws(()=>B.replace(storage(),validated));assert.throws(()=>B.replaceWindow(storage({[R.key]:previous}),copy(s),previous));
 const st=storage({[R.key]:previous});R.preserveWindow(st,previous);const archived=st.getItem(R.archiveKey);R.preserveWindow(st,previous);assert.equal(st.getItem(R.archiveKey),archived,'same raw original is not duplicated');
 st.setItem(R.key,'other window');assert.throws(()=>R.preserveWindow(st,previous),/其他窗口/);assert.throws(()=>B.replaceWindow(st,validated,previous),/其他窗口/);assert.equal(st.getItem(R.key),'other window');
 const blocked=storage({[R.key]:previous,[R.archiveKey]:'{broken archive'});assert.throws(()=>R.preserveWindow(blocked,previous));assert.equal(blocked.getItem(R.key),previous);assert.equal(blocked.getItem(R.archiveKey),'{broken archive');
 const quota=storage({[R.key]:previous});quota.hook=()=>{throw Error('quota');};assert.throws(()=>R.preserveWindow(quota,previous));assert.equal(quota.getItem(R.key),previous);assert.equal(quota.getItem(R.archiveKey),null);
 const writeFail=storage({[R.key]:previous});R.preserveWindow(writeFail,previous);writeFail.hook=k=>{if(k===R.key)throw Error('quota');};assert.throws(()=>B.replaceWindow(writeFail,validated,previous),/未替换/);assert.equal(writeFail.getItem(R.key),previous);assert.equal(R.previousWindow(writeFail),previous);
 const readback=storage({[R.key]:previous});R.preserveWindow(readback,previous);readback.hook=(k)=>{if(k===R.key){readback.map.set(k,'other writer');throw Error('changed');}};assert.throws(()=>B.replaceWindow(readback,validated,previous),e=>e.recoveryRequired&&e.windowRecovery&&e.previousBackup===previous);assert.equal(readback.getItem(R.key),'other writer');assert.equal(R.previousWindow(readback),previous);
 const recent=storage({[R.key]:'A'});R.preserveWindow(recent,'A');recent.setItem(R.key,'B');R.preserveWindow(recent,'B');recent.setItem(R.key,'A');R.preserveWindow(recent,'A');assert.equal(R.previousWindow(recent),'A');assert.equal(JSON.parse(recent.getItem(R.archiveKey)).entries.length,2);
 const originalAnalyze=E.analyzeSolutions;try{E.analyzeSolutions=()=>({count:1,exhausted:true});await assert.rejects(B.validateWindowAsync(s),/唯一解/);}finally{E.analyzeSolutions=originalAnalyze;}
 console.log('PASS window recovery:',JSON.stringify({modes,strictValidation:true,ruleOnlyAlternateSolutions:4,sourceBytesPreserved:true,historyAndOtherKeysUntouched:true,concurrentQuotaArchiveAndReadbackFailures:true}));
})().catch(e=>{console.error(e);process.exitCode=1;});
