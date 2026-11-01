'use strict';
// Independent integration contract: themed clues survive every persistent representation.
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const E=require('../src/engine.js'),V=require('../src/voyage.js'),B=require('../src/backup.js'),F=require('../src/favorites.js'),H=require('../src/history.js');
const fixture=require('./fixtures/compatibility.json');
const clone=x=>JSON.parse(JSON.stringify(x));
function storage(){const m=new Map();return {getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k)};}
function envelope(p,id){return {version:8,preferences:{theme:'nebula',fx:true,intensity:'soft'},game:{sessionId:'audit-'+id,createdAt:1,puzzleId:p.id,sourceId:p.sourceId,mode:p.mode,difficulty:p.difficulty,clues:clone(p.clues),givens:p.givens.slice(),solution:p.solution.slice(),board:p.givens.slice(),notes:p.givens.map(()=>0),selected:0,noteMode:false,mistakes:0,hints:0,elapsedMs:0,started:false,paused:false,completed:false,history:[],branch:null,voyageId:id}};}
(async()=>{
 const stats={elapsedMs:1234,mistakes:0,hints:0};let legacy={};
 for(const c of V.chapters('legacy'))legacy=V.award(legacy,c.id,stats);
 for(const p of fixture.voyage)assert.equal(crypto.createHash('sha256').update(JSON.stringify(V.getPuzzle(p.id))).digest('hex'),p.sha256);
 const old=storage(),oldSave=envelope(V.getPuzzle('home'),'home');old.setItem(B.keys[0],JSON.stringify(oldSave));old.setItem(B.keys[4],JSON.stringify(legacy));
 const oldBackup=await B.createAsync(old,{appVersion:'1.0.0'}),oldTarget=storage();B.replace(oldTarget,oldBackup);
 assert.deepEqual(JSON.parse(oldTarget.getItem(B.keys[4])),legacy);assert.deepEqual(JSON.parse(oldTarget.getItem(B.keys[0])),oldSave);
 let progress=clone(legacy);
 for(const track of ['lines','sums'])for(const c of V.chapters(track))progress=V.award(progress,c.id,stats);
 for(const c of V.chapters().filter(c=>c.trackId!=='legacy')){
  const p=V.getPuzzle(c.id),snap=envelope(p,c.id),source=storage(),history=H.createStore({Engine:E,storage:source}),favorites=F.createStore(source);
  history.capture(snap,{origin:'new'});const i=snap.game.givens.findIndex(v=>!v);
  snap.game.selected=i;snap.game.started=true;snap.game.elapsedMs=100;
  snap.game.notes[i]=1<<(snap.game.solution[i]-1);history.capture(snap,{action:'笔记'});
  assert(history.flush());source.setItem(B.keys[0],JSON.stringify(snap));source.setItem(B.keys[4],JSON.stringify(progress));
  const favorite=favorites.add(p,{sessionId:snap.game.sessionId,later:true});
  const backup=await B.createAsync(source,{appVersion:'1.0.1'}),validated=await B.validateAsync(JSON.stringify(backup)),target=storage();B.replace(target,validated);
  const restored=JSON.parse(target.getItem(B.keys[0]));assert.deepEqual(restored,snap);
  assert(V.matchesPuzzle(restored.game.voyageId,restored.game.givens,restored.game.mode,restored.game.difficulty,restored.game.clues));
  const restoredHistory=H.createStore({Engine:E,storage:target});assert.deepEqual(restoredHistory.getSnapshot(snap.game.sessionId),snap);assert.equal(restoredHistory.frameAt(snap.game.sessionId,1).notes[i],snap.game.notes[i]);
  const restoredFavorite=F.createStore(target).get(favorite.id);assert(F.samePuzzle(restoredFavorite.puzzle,p));assert.deepEqual(restoredFavorite.puzzle.clues,p.clues);assert.deepEqual(restoredFavorite.puzzle.solution,p.solution);
  assert.deepEqual(JSON.parse(target.getItem(B.keys[4])),progress);
  const tampered=clone(backup);tampered.entries[B.keys[0]].game.clues={version:1,regions:[],cages:[],lines:[],edges:[],parity:[],outside:[],clones:[],quadruples:[]};await assert.rejects(B.validateAsync(tampered),'Removing theme clues must not retain voyage identity');
 }
 assert.equal(V.getStatus(legacy,'lines').unlocked,1);assert.equal(V.getStatus(legacy,'sums').unlocked,1);
 console.log('PASS theme persistence: 6 complete-clue current/history/favorites/backup roundtrips, tamper rejection, 9 legacy hashes and v1.0.0 backup compatibility.');
})().catch(e=>{console.error(e);process.exitCode=1});
